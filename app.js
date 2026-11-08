'use strict';

const $ = (s) => document.querySelector(s);
const TZ = 'Asia/Baghdad';
const fmtTime = (d) => new Intl.DateTimeFormat('ar-IQ', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' }).format(d);
const fmtDate = (d) => new Intl.DateTimeFormat('ar-IQ', { timeZone: TZ, dateStyle: 'full' }).format(d);
const bust = () => '?_=' + Date.now();
const dataErrors = new Map();
async function getJSON(u, ext) {
  try {
    const response = await fetch(ext ? u : u + bust(), { signal: AbortSignal.timeout(55000) });
    const jsonResponse = (response.headers.get('content-type') || '').includes('json');
    if (!response.ok || !jsonResponse) {
      let code = response.status === 404 || !jsonResponse ? 'deployment' : 'upstream';
      if (jsonResponse) {
        const error = await response.json();
        if (error.code === 'configuration') code = 'configuration';
      }
      if (u.startsWith('/api/data/')) dataErrors.set(u, code);
      return null;
    }
    const data = await response.json();
    dataErrors.delete(u);
    return data;
  } catch {
    if (u.startsWith('/api/data/')) dataErrors.set(u, 'connection');
    return null;
  }
}
const num = (v) => {
  const d = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2;
  return (Math.round(v * 10 ** d) / 10 ** d).toLocaleString('en-US');
};

// ---------- الهوية والشعار ----------
document.title = APP.name;
$('#app-name').textContent = APP.name;
$('#app-tagline').textContent = APP.tagline;
(() => {
  const c = ['logo.png', 'logo.jpg', 'logo.jpeg', 'logo.webp', 'logo.svg', 'logo-default.svg'];
  const img = $('#logo'); let i = 0;
  img.onerror = () => { if (++i < c.length) img.src = c[i]; };
  img.src = c[0];
})();

// ---------- المستويات ----------
const LEVELS = [
  { name: 'طبيعي', color: '#2e9e5b', text: 'لا توجد مؤشرات مقلقة حالياً.' },
  { name: 'مرتفع', color: '#d9a406', text: 'الأطفال وكبار السن ومرضى الربو والقلب يتجنبون الجهد خارج المنزل.' },
  { name: 'عالٍ', color: '#e8761e', text: 'قد يتأثر الجميع. قلّل البقاء بالخارج واستخدم كمامة، وتحقق ميدانياً من المصدر.' },
  { name: 'خطير', color: '#c4161c', text: 'خطر على الجميع. يلزم تحقق ميداني فوري وإبلاغ الجهات المختصة.' },
];
const INFO = {
  SO2: { name: 'ثاني أكسيد الكبريت', desc: 'غاز خانق من حرائق النفط والكبريت والمصافي ومحطات الكهرباء، يهيّج العيون والرئتين.' },
  NO2: { name: 'ثاني أكسيد النيتروجين', desc: 'ينتج من عوادم السيارات والمولدات والمشاعل والمحطات، ويضعف الرئتين.' },
  CO: { name: 'أول أكسيد الكربون', desc: 'غاز سام لا لون له ولا رائحة، يتولد من الحرائق والاحتراق غير الكامل.' },
  CH4: { name: 'الميثان', desc: 'غاز قابل للاشتعال يتسرب من آبار النفط والغاز والمطامر.' },
  DUST: { name: 'الدخان والغبار', desc: 'جسيمات عالقة من العواصف الترابية والحرائق، تضر الرئتين والعيون.' },
};
const UNIT_NOTE = { DU: 'وحدة دوبسون', AI: 'مؤشر الهباء الجوي', 'µmol/m²': 'ميكرومول بالمتر المربع', 'mmol/m²': 'ملي مول بالمتر المربع', ppb: 'جزء بالمليار' };
const WHO = [['PM10 (غبار)', 'pm10', 45], ['PM2.5 (جسيمات دقيقة)', 'pm25', 15], ['NO₂', 'no2', 25], ['SO₂', 'so2', 40], ['CO', 'co', 4000]];
const aqiLevel = (a) => (a <= 100 ? 0 : a <= 150 ? 1 : a <= 200 ? 2 : 3);
const DIRS = ['الشمال', 'الشمال الشرقي', 'الشرق', 'الجنوب الشرقي', 'الجنوب', 'الجنوب الغربي', 'الغرب', 'الشمال الغربي'];
const dirName = (d) => DIRS[Math.round(d / 45) % 8];
const km = (a, b) => {
  const p = Math.PI / 180;
  const x = Math.sin(((b.lat - a.lat) * p) / 2) ** 2 + Math.cos(a.lat * p) * Math.cos(b.lat * p) * Math.sin(((b.lon - a.lon) * p) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
};
const meterHTML = (l) => `<div class="meter" role="img" aria-label="المستوى ${LEVELS[l].name}">` +
  [0, 1, 2, 3].map((i) => `<i class="${i <= l ? 'on lv' + i : ''}"></i>`).join('') + '</div>';

function renderDataUpdate(sources) {
  $('#today-date').textContent = fmtDate(new Date());
  const timestamps = sources
    .map((source) => source && Date.parse(source.updated))
    .filter((timestamp) => Number.isFinite(timestamp));
  const latest = Math.max(...timestamps);
  const stamp = $('#last-updated');
  if (!Number.isFinite(latest)) {
    stamp.textContent = 'غير متوفر';
    stamp.removeAttribute('datetime');
    return;
  }
  const updated = new Date(latest);
  stamp.dateTime = updated.toISOString();
  stamp.textContent = fmtTime(updated);
}

// ---------- الخريطة ----------
const IRAQ_BOUNDS = [[29.0, 38.7], [37.4, 48.8]];
const map = L.map('map', { zoomControl: false }).fitBounds(IRAQ_BOUNDS, { paddingTopLeft: [10, 60], paddingBottomRight: [90, 130] });
L.control.zoom({ position: 'bottomleft' }).addTo(map);
const carto = (n) => L.tileLayer(`https://{s}.basemaps.cartocdn.com/${n}/{z}/{x}/{y}{r}.png`, { maxZoom: 19, subdomains: 'abcd', attribution: '© OpenStreetMap © CARTO' });
const maptiler = (style) => {
  const layer = L.tileLayer(
    `/api/tiles/${style}/{z}/{x}/{y}`,
    { maxZoom: 19, attribution: '© MapTiler © OpenStreetMap contributors' },
  );
  let errorShown = false;
  layer.on('tileerror', () => {
    if (errorShown) return;
    errorShown = true;
    toast('تعذر تحميل MapTiler. تحقق من المفتاح وصلاحياته.');
  });
  return layer;
};
const makeBaseLayer = (id) => {
  if (id === 'light') return maptiler('dataviz-light');
  if (id === 'dark') return maptiler('dataviz-dark');
  if (id === 'esri') return L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, attribution: 'Esri, Maxar' });
  return carto('light_all');
};
const gibsTileURL = (date, z, y, x) => `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${date}/GoogleMapsCompatible_Level9/${z}/${y}/${x}.jpg`;
function probeGibsDate(date) {
  return new Promise((resolve) => {
    const image = new Image();
    const timeout = setTimeout(() => { image.src = ''; resolve(false); }, 8000);
    image.onload = () => { clearTimeout(timeout); resolve(true); };
    image.onerror = () => { clearTimeout(timeout); resolve(false); };
    image.src = gibsTileURL(date, 5, 12, 19);
  });
}
async function latestGibsDate() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let offset = 0; offset <= 30; offset += 7) {
    const dates = Array.from({ length: Math.min(7, 31 - offset) }, (_, i) => {
      const date = new Date(today);
      date.setUTCDate(date.getUTCDate() - offset - i);
      return date.toISOString().slice(0, 10);
    });
    const available = await Promise.all(dates.map(probeGibsDate));
    const index = available.findIndex(Boolean);
    if (index !== -1) return dates[index];
  }
  return null;
}
const makeGibsLayer = (date) => L.tileLayer(
  `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
  { maxZoom: 9, attribution: 'NASA GIBS' },
);
let currentBaseId = 'light';
let currentBase = makeBaseLayer(currentBaseId).addTo(map);
let baseSwitchToken = 0;
function switchBase(id) {
  const token = ++baseSwitchToken;
  map.removeLayer(currentBase);
  currentBaseId = id;
  if (id === 'gibs') {
    currentBase = makeBaseLayer('light').addTo(map);
    currentBase.bringToBack();
    latestGibsDate().then((date) => {
      if (token !== baseSwitchToken || currentBaseId !== 'gibs') return;
      if (!date) {
        toast('تعذر العثور على صورة NASA متاحة خلال آخر 31 يوماً.');
        return;
      }
      map.removeLayer(currentBase);
      currentBase = makeGibsLayer(date).addTo(map);
      currentBase.bringToBack();
      toast(`أحدث صورة NASA متاحة: ${date}`);
    });
    return;
  }
  currentBase = makeBaseLayer(id).addTo(map);
  currentBase.bringToBack();
}
document.querySelectorAll('input[name="base"]').forEach((r) => r.addEventListener('change', () => {
  switchBase(r.value);
}));

// ---------- الحالة العامة ----------
let cities = [], fireAll = [], fireRows = [], sat = null, meta = null, satVals = null, air = null, alerts = [], grid = null;
let geoState = 'missing', fireHours = 120, showFlares = true, opacity = 0.8, active = null, geoUpdated = null;
const unitIdx = {};
const G = { cities: L.layerGroup(), fires: L.layerGroup(), hot: L.layerGroup(), arrows: L.layerGroup() };
let overlay = null;

const curUnit = (d) => d.units[unitIdx[d.id] || 0];
const conv = (d, v) => { const u = curUnit(d); return v * u.mul + u.add; };

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), 4500);
}

// ---------- أدوات الشبكة ----------
function sample(vals, g, lat, lon) {
  const fx = (lon - g.lon0) / (g.lon1 - g.lon0) * (g.cols - 1), fy = (g.lat0 - lat) / (g.lat0 - g.lat1) * (g.rows - 1);
  if (fx < 0 || fy < 0 || fx > g.cols - 1 || fy > g.rows - 1) return null;
  const x0 = Math.min(Math.floor(fx), g.cols - 2), y0 = Math.min(Math.floor(fy), g.rows - 2), tx = fx - x0, ty = fy - y0;
  const a = vals[y0 * g.cols + x0], b = vals[y0 * g.cols + x0 + 1], c = vals[(y0 + 1) * g.cols + x0], d = vals[(y0 + 1) * g.cols + x0 + 1];
  if ([a, b, c, d].some((v) => v == null)) return null;
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
}
function buildField(d) {
  const vals = grid && grid.vars[d.grid];
  if (!vals) return null;
  const Wp = 420, Hp = 350, cv = document.createElement('canvas');
  cv.width = Wp; cv.height = Hp;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(Wp, Hp);
  const merc = (la) => Math.log(Math.tan(Math.PI / 4 + la * Math.PI / 360));
  const mN = merc(grid.lat0), mS = merc(grid.lat1);
  for (let y = 0; y < Hp; y++) {
    const m = mN - (y + 0.5) / Hp * (mN - mS), lat = (2 * Math.atan(Math.exp(m)) - Math.PI / 2) * 180 / Math.PI;
    for (let x = 0; x < Wp; x++) {
      const v = sample(vals, grid, lat, grid.lon0 + (x + 0.5) / Wp * (grid.lon1 - grid.lon0));
      if (v == null || (d.minShow != null && v < d.minShow)) continue;
      const c = colorAt(d.stops, v), i = (y * Wp + x) * 4;
      img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 215;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv.toDataURL('image/png');
}
function drawArrows() {
  G.arrows.clearLayers();
  const sp = grid && grid.vars.wind, dr = grid && grid.vars.wind_dir;
  if (!sp || !dr) return;
  for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.cols; c++) {
    const i = r * grid.cols + c;
    if (sp[i] == null || dr[i] == null) continue;
    const lat = grid.lat0 - (grid.lat0 - grid.lat1) * r / (grid.rows - 1), lon = grid.lon0 + (grid.lon1 - grid.lon0) * c / (grid.cols - 1);
    const sz = Math.round(14 + Math.min(sp[i], 20) * 0.9), rot = (dr[i] + 180) % 360;
    L.marker([lat, lon], {
      interactive: false,
      icon: L.divIcon({ className: 'warrow', iconSize: [sz, sz],
        html: `<svg viewBox="0 0 24 24" width="${sz}" height="${sz}" style="transform:rotate(${rot}deg)"><path d="M12 2l6 18-6-4-6 4z" fill="#14304a" fill-opacity=".85" stroke="#fff" stroke-width="1"/></svg>` }),
    }).addTo(G.arrows);
  }
  G.arrows.addTo(map);
}
function satValue(key, lat, lon) {
  const s = satVals && satVals[key];
  if (!s || !meta) return null;
  const x = Math.floor((lon - meta.bounds[0][1]) / (meta.bounds[1][1] - meta.bounds[0][1]) * s.w);
  const y = Math.floor((meta.bounds[1][0] - lat) / (meta.bounds[1][0] - meta.bounds[0][0]) * s.h);
  if (x < 0 || y < 0 || x >= s.w || y >= s.h) return null;
  return s.data[y * s.w + x];
}
const satLevel = (key, v) => meta.layers[key].thresholds.filter((t) => v >= t).length;

// ---------- القراءة عند المؤشر ----------
function readout(d, ll) {
  if (!d) return null;
  if (d.kind === 'grid' && grid && grid.vars[d.grid]) {
    const v = sample(grid.vars[d.grid], grid, ll.lat, ll.lng);
    if (v == null) return null;
    let t = `${num(conv(d, v))} ${curUnit(d).label}`;
    if (d.classify) t += ` — ${d.classify(v)}`;
    if (d.arrows && grid.vars.wind_dir) {
      const dr = sample(grid.vars.wind_dir, grid, ll.lat, ll.lng);
      if (dr != null) t += ` — من ${dirName(dr)}`;
    }
    return t;
  }
  if (d.kind === 'sat' && meta && meta.layers[d.sat]) {
    const v = satValue(d.sat, ll.lat, ll.lng);
    if (v == null) return 'لا توجد قراءة هنا';
    return `${num(v)} ${meta.layers[d.sat].unit} — ${LEVELS[satLevel(d.sat, v)].name}`;
  }
  if (d.kind === 'status') {
    const c = cities.map((c) => ({ c, k: km(c, { lat: ll.lat, lon: ll.lng }) })).sort((a, b) => a.k - b.k)[0];
    if (c && c.k < 70) return `${c.c.name}: ${LEVELS[cityStatus(c.c).level].name}`;
  }
  return null;
}
map.on('mousemove', (e) => {
  const el = $('#readout'), t = readout(active, e.latlng);
  if (!t) { el.hidden = true; return; }
  el.textContent = t; el.hidden = false;
  el.style.left = Math.min(e.containerPoint.x + 14, map.getSize().x - el.offsetWidth - 8) + 'px';
  el.style.top = (e.containerPoint.y + 14) + 'px';
});
map.on('mouseout', () => ($('#readout').hidden = true));

// ---------- النوافذ ----------
async function windText(lat, lon) {
  const j = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=kmh`, true);
  if (!j || !j.current) return 'تعذر جلب بيانات الرياح';
  const { wind_speed_10m: sp, wind_direction_10m: d } = j.current;
  return `الرياح: ${Math.round(sp)} كم/س من ${dirName(d)} باتجاه ${dirName((d + 180) % 360)}`;
}
function openInfo(ll, html) {
  const box = document.createElement('div');
  box.innerHTML = html + `<div><a target="_blank" rel="noopener" href="https://www.google.com/maps?q=${ll.lat},${ll.lng}">فتح في خرائط Google</a></div>`;
  const wind = document.createElement('div');
  wind.className = 'wind'; wind.textContent = 'جاري جلب الرياح…'; box.appendChild(wind);
  L.popup({ maxWidth: 320 }).setLatLng(ll).setContent(box).openOn(map);
  windText(ll.lat, ll.lng).then((t) => (wind.textContent = t));
}
map.on('click', (e) => {
  const r = readout(active, e.latlng);
  openInfo(e.latlng, `<b>الإحداثيات</b><br>${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}` +
    (r ? `<br><b>${active.label}:</b> ${r}` : ''));
});

// ---------- الحرائق ----------
const fireInfo = (p, ll) => openInfo(ll, `<h3>${p.persistent ? 'مصدر حرارة ثابت' : 'نقطة حرارية'}</h3>وقت الرصد: ${fmtTime(new Date(p.time))}<br>` +
  `الثقة: ${{ h: 'عالية', n: 'متوسطة' }[p.confidence] || p.confidence}<br>شدة الحرارة: ${p.frp} ميغاواط` +
  (p.persistent ? '<br><small>يتكرر بنفس الموقع عدة أيام، غالباً مشعل نفط أو غاز أو منشأة صناعية.</small>' : ''));

function renderFires(geo) {
  fireAll = []; fireRows = []; geoUpdated = geo.updated; geoState = geo.features.length ? 'ok' : 'empty';
  const now = Date.now();
  for (const f of geo.features) {
    const p = f.properties, [lon, lat] = f.geometry.coordinates;
    const row = { p, ll: L.latLng(lat, lon), lat, lon, hours: (now - new Date(p.time)) / 36e5, persistent: !!p.persistent };
    fireAll.push(row);
    if (!row.persistent) fireRows.push(row);
  }
  fireRows.sort((a, b) => a.hours - b.hours);
  const ul = $('#list-fires');
  ul.innerHTML = fireRows.length ? '' : '<li class="empty">لا توجد حرائق جديدة في آخر 5 أيام.</li>';
  fireRows.slice(0, 60).forEach((r) => {
    const li = document.createElement('li'), b = document.createElement('button');
    b.type = 'button'; b.innerHTML = `حرارة ${r.p.frp} ميغاواط<small>${fmtTime(new Date(r.p.time))}</small>`;
    b.onclick = () => { map.flyTo(r.ll, 11); fireInfo(r.p, r.ll); };
    li.appendChild(b); ul.appendChild(li);
  });
}
function renderFireMarkers() {
  G.fires.clearLayers();
  let n = 0, f = 0;
  fireAll.forEach((r) => {
    const click = (e) => { L.DomEvent.stopPropagation(e); fireInfo(r.p, r.ll); };
    if (r.persistent) {
      f++;
      if (showFlares) L.circleMarker(r.ll, { radius: 5, color: '#6b7a86', weight: 2, fillOpacity: 0 }).on('click', click).addTo(G.fires);
      return;
    }
    if (r.hours > fireHours) return;
    n++;
    const col = r.hours <= 6 ? '#d9381e' : r.hours <= 24 ? '#e8982f' : '#f0c36a';
    L.circleMarker(r.ll, { radius: 4 + Math.min(r.p.frp || 0, 50) / 8, color: '#fff', weight: 1, fillColor: col, fillOpacity: 0.9 }).on('click', click).addTo(G.fires);
  });
  return { n, f };
}

// ---------- تقييم المحافظات ----------
function cityStatus(c) {
  const reasons = []; let level = 0;
  const add = (lv, text) => { reasons.push({ lv, text }); level = Math.max(level, lv); };
  const near = fireRows.filter((r) => r.hours <= 24 && km(c, r) <= 30);
  if (near.length) {
    const frp = near.reduce((s, r) => s + (r.p.frp || 0), 0);
    add(near.length >= 20 || frp >= 300 ? 3 : near.length >= 5 ? 2 : 1, `${near.length} نقطة حرارية جديدة خلال 24 ساعة ضمن 30 كم`);
  }
  const g = sat && sat.cities && sat.cities[c.id];
  if (g && meta) for (const [k, v] of Object.entries(g)) {
    if (v.level >= 1 && meta.layers[k]) add(v.level, `${INFO[k].name}: مستوى ${LEVELS[v.level].name} بالقمر الصناعي (${num(v.value)} ${meta.layers[k].unit})`);
  }
  const a = air && air.cities && air.cities[c.id];
  if (a && a.aqi != null && aqiLevel(a.aqi) >= 1) add(aqiLevel(a.aqi), `جودة الهواء ${aqiName(a.aqi)} (AQI ${Math.round(a.aqi)})`);
  return { level, reasons, air: a };
}
function detailHTML(c, s) {
  let h = `<h3>${c.name}</h3><span class="badge lv${s.level}">${LEVELS[s.level].name}</span>${meterHTML(s.level)}<p class="adv">${LEVELS[s.level].text}</p>`;
  h += '<h4>سبب التصنيف</h4>' + (s.reasons.length ? '<ul>' + s.reasons.map((r) => `<li>${r.text}</li>`).join('') + '</ul>'
    : '<p class="adv">كل المصادر المتاحة ضمن المعدل الطبيعي.</p>');
  const a = s.air;
  if (a && a.aqi != null) {
    h += `<h4>جودة الهواء مقارنة بحدود منظمة الصحة</h4><p class="adv">المؤشر الأمريكي AQI: <b>${Math.round(a.aqi)}</b> (${aqiName(a.aqi)})</p><ul>`;
    for (const [label, key, lim] of WHO) {
      if (a[key] == null) continue;
      const r = a[key] / lim;
      h += `<li>${label}: ${num(a[key])} µg/m³ — ${r <= 1 ? 'ضمن الحد الموصى به' : num(r) + ' ضعف الحد اليومي الموصى به'}</li>`;
    }
    h += '</ul><div class="src">المصدر: نموذج CAMS عبر Open-Meteo، قراءة لحظية تُقارن تقريباً بحد يومي.</div>';
  }
  return h;
}
const showCity = (c, s) => openInfo(L.latLng(c.lat, c.lon), detailHTML(c, s));

function renderCities() {
  const sts = cities.map((c) => ({ c, s: cityStatus(c) }));
  G.cities.clearLayers();
  sts.forEach(({ c, s }) => L.circleMarker([c.lat, c.lon], {
    radius: s.level >= 3 ? 13 : 10, color: '#fff', weight: 2.5, fillColor: LEVELS[s.level].color, fillOpacity: 0.95,
  }).bindTooltip(`${c.name}: ${LEVELS[s.level].name}`).on('click', (e) => { L.DomEvent.stopPropagation(e); showCity(c, s); }).addTo(G.cities));

  const hasData = air || sat || grid || geoState === 'ok';
  const names = (l) => sts.filter((x) => x.s.level === l).map((x) => x.c.name);
  let top = 0;
  for (let l = 3; l >= 0; l--) if (names(l).length) { top = l; break; }
  $('#banner').className = 'banner lv' + top + (hasData ? '' : ' nodata');
  $('#banner-title').textContent = !hasData ? 'لا توجد بيانات بعد'
    : top === 3 ? 'تنبيه: مستوى خطير في ' + names(3).join('، ')
      : top === 2 ? 'مستوى عالٍ في ' + names(2).join('، ')
        : top === 1 ? 'مستوى مرتفع في ' + names(1).join('، ') : 'الوضع طبيعي حالياً بحسب البيانات المتوفرة';
  $('#banner-sub').textContent = hasData && top >= 2 ? LEVELS[top].text : '';
  $('#counts').innerHTML = hasData ? [3, 2, 1, 0].map((l) => `<b>${names(l).length} ${LEVELS[l].name}</b>`).join('') : '';

  const ul = $('#list-cities'); ul.innerHTML = '';
  sts.sort((a, b) => b.s.level - a.s.level || a.c.name.localeCompare(b.c.name, 'ar')).forEach(({ c, s }) => {
    const li = document.createElement('li'), b = document.createElement('button');
    b.type = 'button'; b.className = 'card lv' + s.level;
    b.innerHTML = `<div class="row"><span class="name">${c.name}</span><span class="badge lv${s.level}">${LEVELS[s.level].name}</span></div>${meterHTML(s.level)}` +
      `<small>${s.reasons.length ? s.reasons.slice(0, 2).map((r) => r.text).join('<br>') : 'لا توجد مؤشرات مقلقة'}</small>`;
    b.onclick = () => { map.flyTo([c.lat, c.lon], 9); setTimeout(() => showCity(c, s), 600); };
    li.appendChild(b); ul.appendChild(li);
  });
}

// ---------- تنبيهات الغازات ----------
function alertInfo(a, ll) {
  openInfo(ll, `<h3>${a.label}</h3><span class="badge lv${a.level}">${LEVELS[a.level].name}</span>` +
    `<p class="adv">القراءة: ${num(a.value)} ${a.unit}<br>على بعد ${a.dist_km} كم من ${a.near}</p><div class="src">قراءة قمر صناعي بدقة نحو 5 كم، تحتاج تحققاً ميدانياً.</div>`);
}
function renderAlertList() {
  const ul = $('#list-alerts');
  ul.innerHTML = alerts.length ? '' : '<li class="empty">' + (meta ? 'راجع قراءات الغازات ضمن تفاصيل كل محافظة؛ قائمة تنبيهات المواقع غير متاحة حالياً.' : 'بيانات الغازات غير متاحة حالياً.') + '</li>';
  alerts.forEach((a) => {
    const ll = L.latLng(a.lat, a.lon), li = document.createElement('li'), b = document.createElement('button');
    b.type = 'button'; b.innerHTML = `${a.label}: <b>${LEVELS[a.level].name}</b><small>قرب ${a.near} (${a.dist_km} كم)</small>`;
    b.onclick = () => { map.flyTo(ll, 8); alertInfo(a, ll); };
    li.appendChild(b); ul.appendChild(li);
  });
}
function drawHot(product) {
  G.hot.clearLayers();
  alerts.filter((a) => a.product === product).forEach((a) => {
    const ll = L.latLng(a.lat, a.lon), col = LEVELS[a.level].color;
    L.circleMarker(ll, { radius: 10, color: col, weight: 3, fillColor: col, fillOpacity: 0.2 })
      .on('click', (e) => { L.DomEvent.stopPropagation(e); alertInfo(a, ll); }).addTo(G.hot);
  });
  G.hot.addTo(map);
}

// ---------- مفتاح الألوان والوحدات ----------
function renderLegend() {
  const d = active, box = $('#legend');
  let top = `<div class="top"><span>${d.label}</span>`, body = '', desc = d.desc || '';
  if (d.kind === 'grid') {
    const u = curUnit(d);
    top += d.units.length > 1 ? `<button type="button" class="unit" id="unitBtn" title="اضغط لتغيير الوحدة">${u.label} ⇄</button>` : `<span class="unit">${u.label}</span>`;
    body = `<div class="bar" style="background:linear-gradient(to right,${d.stops.map(([, c], i) => `${c} ${(i / (d.stops.length - 1) * 100).toFixed(0)}%`).join(',')})"></div>` +
      `<div class="ticks">${d.stops.map(([v]) => `<span>${num(v * u.mul + u.add)}</span>`).join('')}</div>`;
  } else if (d.kind === 'sat') {
    const m = meta && meta.layers[d.sat];
    desc = INFO[d.sat].desc;
    if (m) {
      const t = m.thresholds;
      top += `<span class="unit" title="${UNIT_NOTE[m.unit] || ''}">${m.unit}</span>`;
      body = `<div class="seg"><span class="lv0">طبيعي<small>أقل من ${num(t[0])}</small></span><span class="lv1">مرتفع<small>من ${num(t[0])}</small></span>` +
        `<span class="lv2">عالٍ<small>من ${num(t[1])}</small></span><span class="lv3">خطير<small>من ${num(t[2])}</small></span></div>`;
      desc += (UNIT_NOTE[m.unit] ? ` الوحدة ${m.unit} = ${UNIT_NOTE[m.unit]}.` : '') + ' المقياس نسبي مقارنة بالمعدل الطبيعي.';
    } else desc += ' لا تتوفر بيانات هذه الطبقة بعد.';
  } else if (d.kind === 'fires') {
    top += '<span class="unit">آخر ' + fireHours + ' ساعة</span>';
    body = '<div class="sw"><span><i style="background:#d9381e"></i>أقل من 6 ساعات</span><span><i style="background:#e8982f"></i>6 إلى 24 ساعة</span>' +
      '<span><i style="background:#f0c36a"></i>أقدم</span><span><i style="background:#fff;border:2px solid #6b7a86"></i>مصدر ثابت</span></div>';
  } else {
    body = '<div class="seg">' + LEVELS.map((l, i) => `<span class="lv${i}">${l.name}</span>`).join('') + '</div>';
  }
  box.innerHTML = top + '</div>' + body + (desc ? `<p class="desc">${desc}</p>` : '');
  const ub = $('#unitBtn');
  if (ub) ub.onclick = () => { unitIdx[d.id] = ((unitIdx[d.id] || 0) + 1) % d.units.length; renderLegend(); };
}

function renderTimebar() {
  const d = active, tb = $('#timebar');
  if (d.kind === 'fires') {
    const { n, f } = renderFireMarkers();
    const state = geoState === 'missing' ? 'تعذر الاتصال بمصدر بيانات الحرائق حالياً.'
      : geoState === 'empty' ? 'لم يرصد القمر نقاطاً حرارية ضمن حدود العراق في آخر 5 أيام.'
        : `<b>${n}</b> حريق جديد خلال آخر ${fireHours} ساعة، و<b>${f}</b> مصدر حرارة ثابت (مشاعل ومنشآت)`;
    tb.innerHTML = `<div class="row"><input type="range" id="hours" min="6" max="120" step="6" value="${fireHours}" aria-label="نافذة الزمن بالساعات"><span id="fire-msg">${state}</span></div>` +
      (geoUpdated ? `<div>آخر تحديث: ${fmtTime(new Date(geoUpdated))}</div>` : '');
    $('#hours').oninput = (e) => {
      fireHours = +e.target.value;
      const r = renderFireMarkers();
      $('#fire-msg').innerHTML = `<b>${r.n}</b> حريق جديد خلال آخر ${fireHours} ساعة، و<b>${r.f}</b> مصدر حرارة ثابت (مشاعل ومنشآت)`;
      renderLegend();
    };
    return;
  }
  const src = d.kind === 'grid' ? grid && grid.updated : d.kind === 'sat' ? meta && meta.updated : null;
  const stamp = src ? new Date(src) : null;
  const old = stamp && Date.now() - stamp > 12 * 36e5;
  tb.innerHTML = d.kind === 'status' ? '<div>الحالة تُحسب من آخر قراءات المصادر الثلاثة.</div>'
    : stamp ? `<div>آخر تحديث للبيانات: <b>${fmtTime(stamp)}</b>${old ? ' (بيانات قديمة)' : ''}${d.kind === 'sat' ? ' — لقطة مجمّعة لآخر 3 أيام' : ''}</div>`
      : '<div>لا توجد بيانات لهذا المتغير بعد.</div>';
}

function focusLayer(d) {
  if (d.kind === 'fires') {
    const visible = fireAll.filter((r) => r.persistent ? showFlares : r.hours <= fireHours);
    if (!visible.length) {
      toast(geoState === 'missing' ? 'ملف الحرائق غير موجود. شغّل جلب البيانات أولاً.'
        : 'لا توجد نقاط حرارية في البيانات الحالية. حدّث بيانات الحرائق ثم أعد المحاولة.');
      return;
    }
    map.flyToBounds(L.latLngBounds(visible.map((r) => r.ll)).pad(0.15), { maxZoom: 8 });
  } else if (d.kind === 'grid' && grid) {
    map.flyToBounds([[grid.lat1, grid.lon0], [grid.lat0, grid.lon1]], { maxZoom: 8 });
  } else if (d.kind === 'sat' && meta && meta.layers[d.sat]) {
    map.flyToBounds(meta.bounds, { maxZoom: 8 });
  }
}

// ---------- تفعيل متغير ----------
function activate(id) {
  const d = VARIABLES.find((v) => v.id === id);
  active = d;
  [G.fires, G.hot, G.arrows].forEach((l) => map.removeLayer(l));
  if (overlay) { map.removeLayer(overlay); overlay = null; }
  document.querySelectorAll('.rb').forEach((b) => b.setAttribute('aria-pressed', b.dataset.id === id));
  $('#readout').hidden = true;

  if (d.kind === 'fires') G.fires.addTo(map);
  if (d.kind === 'grid') {
    const url = buildField(d);
    if (url) {
      overlay = L.imageOverlay(url, [[grid.lat1, grid.lon0], [grid.lat0, grid.lon1]], { opacity, interactive: false }).addTo(map);
      if (d.arrows) drawArrows();
    } else toast('تعذر جلب بيانات هذا المتغير حالياً. أعد تحميل الصفحة للمحاولة مجدداً.');
  }
  if (d.kind === 'sat') {
    $('#gas-select').value = d.id;
    const m = meta && meta.layers[d.sat];
    if (m && satVals && satVals[d.sat]) {
      const values = satVals[d.sat], canvas = document.createElement('canvas');
      canvas.width = values.w; canvas.height = values.h;
      const ctx = canvas.getContext('2d'), image = ctx.createImageData(values.w, values.h);
      values.data.forEach((value, i) => {
        if (value == null) return;
        const level = satLevel(d.sat, value), color = hexRGB(LEVELS[level].color);
        image.data.set([...color, 190], i * 4);
      });
      ctx.putImageData(image, 0, 0);
      overlay = L.imageOverlay(canvas.toDataURL(), meta.bounds, { opacity, interactive: false }).addTo(map);
      drawHot(d.sat);
    }
    else toast('لا تتوفر قراءات لهذا الغاز حالياً. قد تتأخر بيانات القمر أو يحجبها الغطاء السحابي.');
  }
  renderLegend(); renderTimebar();
  focusLayer(d);
}

// ---------- الواجهة ----------
function buildRail() {
  const rail = $('#rail'); let grp = null;
  const gasSelect = $('#gas-select');
  VARIABLES.filter((v) => v.kind === 'sat').forEach((v) => {
    const option = document.createElement('option');
    option.value = v.id; option.textContent = v.label;
    gasSelect.appendChild(option);
  });
  VARIABLES.forEach((v) => {
    if (v.kind === 'sat') return;
    if (grp !== null && v.group !== grp) rail.insertAdjacentHTML('beforeend', '<div class="rg"></div>');
    grp = v.group;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'rb'; b.dataset.id = v.id; b.title = v.group + ': ' + v.label;
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = `<span class="ic">${iconHTML(v.icon)}</span><span class="lb">${v.label}</span>`;
    b.onclick = () => activate(v.id);
    rail.appendChild(b);
  });
}
buildRail();
$('#gas-select').onchange = (e) => activate(e.target.value);
$('#scale').innerHTML = LEVELS.map((l, i) => `<span class="lv${i}">${l.name}</span>`).join('');
$('#btn-cities').onclick = () => { $('#drawer').hidden = !$('#drawer').hidden; $('#settings').hidden = true; };
$('#btn-settings').onclick = () => { $('#settings').hidden = !$('#settings').hidden; $('#drawer').hidden = true; };
document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => {
  document.querySelectorAll('.tabs button').forEach((x) => x.setAttribute('aria-selected', x === b));
  document.querySelectorAll('.pane').forEach((p) => (p.hidden = p.id !== 'tab-' + b.dataset.tab));
}));
$('#s-cities').onchange = (e) => (e.target.checked ? G.cities.addTo(map) : map.removeLayer(G.cities));
$('#s-flares').onchange = (e) => { showFlares = e.target.checked; if (active && active.kind === 'fires') renderTimebar(); };
$('#opacity').oninput = (e) => { opacity = +e.target.value; if (overlay) overlay.setOpacity(opacity); };
$('#search').onsubmit = async (e) => {
  e.preventDefault();
  const q = $('#q').value.trim();
  if (!q) return;
  const r = await getJSON('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=iq&accept-language=ar&q=' + encodeURIComponent(q), true);
  if (!r || !r[0]) return toast('لم يتم العثور على المكان');
  map.flyTo([+r[0].lat, +r[0].lon], 11);
};
$('#csv').onclick = () => {
  const body = fireRows.map((r) => [r.lat, r.lon, r.p.time, r.p.satellite, r.p.confidence, r.p.frp].join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + 'lat,lon,time_utc,satellite,confidence,frp\n' + body], { type: 'text/csv' }));
  a.download = 'fires.csv'; a.click();
};

// ---------- التحميل ----------
async function load() {
  const [cs, geo, satelliteData, ai, gr] = await Promise.all([
    getJSON('/api/data/cities', true), getJSON('/api/data/fires', true),
    getJSON('/api/data/satellite', true), getJSON('/api/data/air', true), getJSON('/api/data/grid', true),
  ]);
  const st = null, mt = satelliteData, al = [], sv = satelliteData && satelliteData.values;
  renderDataUpdate([geo, st, mt, ai, gr]);
  cities = cs || []; sat = st; air = ai; alerts = al || []; satVals = sv;
  grid = gr && gr.vars && Object.keys(gr.vars).length ? gr : null;
  meta = mt && mt.layers && Object.keys(mt.layers).length ? mt : null;
  if (meta && satVals) {
    sat = { cities: {} };
    cities.forEach(c => {
      sat.cities[c.id] = {};
      Object.keys(meta.layers).forEach(key => {
        const value = satValue(key, c.lat, c.lon);
        if (value != null) sat.cities[c.id][key] = { value, level: satLevel(key, value) };
      });
    });
  }
  if (geo) renderFires(geo);
  renderAlertList(); renderCities();
  document.querySelectorAll('.rb').forEach((b) => {
    const v = VARIABLES.find((x) => x.id === b.dataset.id);
    const missing = (v.kind === 'grid' && !(grid && grid.vars[v.grid])) || (v.kind === 'sat' && !(meta && meta.layers[v.sat])) || (v.kind === 'fires' && geoState === 'missing');
    b.classList.toggle('nodata', missing);
  });
  const firstAvailableGas = VARIABLES.find((v) => v.kind === 'sat' && meta && meta.layers[v.sat]);
  const defaultGas = firstAvailableGas || VARIABLES.find((v) => v.kind === 'sat');
  activate(firstAvailableGas ? defaultGas.id : grid ? 'aqi' : geo ? 'fires' : 'status');
  const missing = [!geo && 'الحرائق', !ai && 'جودة الهواء', !gr && 'الطقس', !mt && 'الغازات'].filter(Boolean);
  if (missing.length) {
    const codes = [...dataErrors.values()];
    const explanation = codes.includes('deployment')
      ? 'خدمة البيانات غير متاحة في هذه النسخة المنشورة. يلزم نشر الواجهة ووظائف الخادم معاً.'
      : codes.includes('configuration')
        ? 'إعدادات خدمة البيانات غير مكتملة في نسخة الاستضافة.'
        : 'تعذر الاتصال بمصدر البيانات حالياً. أعد تحميل الصفحة للمحاولة مجدداً.';
    $('#banner-sub').textContent = 'تعذر جلب: ' + missing.join('، ') + '. ' + explanation;
    toast(explanation);
  }
}
load();
