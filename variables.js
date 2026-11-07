'use strict';
/* ===================== إعدادات المنصة ===================== */
const APP = {
  name: 'نسيم الرافدين',
  tagline: 'منصة الرصد الفضائي للدفاع المدني',
};

/* ===================== أيقونات ===================== */
const ICONS = {
  shield: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/>',
  flame: '<path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3-1-3-1-6 1-10z"/>',
  wind: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8"/>',
  temp: '<path d="M10 4a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z"/>',
  cloud: '<path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1A4.5 4.5 0 0 1 17 18z"/>',
  rain: '<path d="M7 14a4 4 0 0 1 0-7 5 5 0 0 1 9.6-1A4.5 4.5 0 0 1 17 14zM8 17l-1 3M12 17l-1 3M16 17l-1 3"/>',
  gauge: '<circle cx="12" cy="12" r="9"/><path d="M12 12l4-4"/>',
  drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  dust: '<path d="M3 9c3-3 5 3 9 0s6-3 9 0M3 15c3-3 5 3 9 0s6-3 9 0"/>',
};
const iconHTML = (k) => ICONS[k]
  ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]}</svg>`
  : `<span class="txt">${k}</span>`;

/* ===================== وحدات قابلة للتبديل =====================
   القيمة المعروضة = القيمة الأصلية × mul + add */
const mk = (label, mul = 1, add = 0) => ({ label, mul, add });
const UNITS = {
  speed: [mk('م/ث'), mk('كم/س', 3.6), mk('عقدة', 1.944), mk('ميل/س', 2.237)],
  temp: [mk('°C'), mk('°F', 1.8, 32)],
  pressure: [mk('hPa'), mk('mmHg', 0.750062), mk('inHg', 0.02953)],
  ugm3: [mk('µg/m³')],
  pct: [mk('%')],
  mm: [mk('مم')],
  aqi: [mk('AQI')],
};

/* ===================== ألوان ===================== */
const AQI_STOPS = [[0, '#2e9e5b'], [50, '#9ccc3a'], [100, '#f2d024'], [150, '#e8761e'], [200, '#c4161c'], [300, '#7e0023']];
const aqiName = (a) =>
  a <= 50 ? 'جيدة' : a <= 100 ? 'مقبولة' : a <= 150 ? 'غير صحية للفئات الحساسة'
    : a <= 200 ? 'غير صحية' : a <= 300 ? 'غير صحية جداً' : 'خطرة';

const hexRGB = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function colorAt(stops, v) {
  if (v <= stops[0][0]) return hexRGB(stops[0][1]);
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i][0]) {
      const [v0, c0] = stops[i - 1], [v1, c1] = stops[i];
      const t = (v - v0) / (v1 - v0), a = hexRGB(c0), b = hexRGB(c1);
      return a.map((x, k) => Math.round(x + (b[k] - x) * t));
    }
  }
  return hexRGB(stops[stops.length - 1][1]);
}

/* ===================== سجل المتغيرات =====================
   kind = status  (حالة المحافظات)
          fires   (النقاط الحرارية)
          grid    (خريطة ملونة ناعمة من data/grid.json؛ المفتاح grid = اسم المتغير في fetch_grid.py)
          sat     (طبقة قمر Sentinel-5P؛ المفتاح sat = اسم المنتج في fetch_s5p.py)

   لإضافة متغير جديد: انسخ أحد الأسطر أدناه وعدّل (id, label, icon, grid, units, stops, desc).
   stops = [[القيمة, اللون], ...] بترتيب تصاعدي. minShow = لا يُلوَّن ما دون هذه القيمة. */
const VARIABLES = [
  { id: 'status', group: 'نظرة عامة', label: 'الحالة العامة', icon: 'shield', kind: 'status',
    desc: 'مستوى كل محافظة: أعلى مستوى من جودة الهواء وقراءات الأقمار والحرائق.' },
  { id: 'fires', group: 'نظرة عامة', label: 'الحرائق', icon: 'flame', kind: 'fires',
    desc: 'نقاط حرارية من أقمار VIIRS (NASA). حرق زراعي أو حريق أو مشعل غاز، وتحتاج تحققاً ميدانياً.' },

  { id: 'aqi', group: 'جودة الهواء', label: 'جودة الهواء', icon: 'AQI', kind: 'grid', grid: 'aqi',
    units: UNITS.aqi, stops: AQI_STOPS, classify: aqiName,
    desc: 'المؤشر الأمريكي العالمي: 0 إلى 50 جيد، 100 مقبول، 150 غير صحي للحساسين، 200 غير صحي، 300 خطر. نموذج CAMS.' },
  { id: 'pm10', group: 'جودة الهواء', label: 'غبار PM10', icon: 'PM10', kind: 'grid', grid: 'pm10',
    units: UNITS.ugm3, stops: [[0, '#2e9e5b'], [45, '#9ccc3a'], [100, '#f2d024'], [250, '#e8761e'], [430, '#c4161c'], [800, '#7e0023']],
    desc: 'جسيمات أصغر من 10 ميكرون تدخل الرئتين. حد منظمة الصحة اليومي 45.' },
  { id: 'pm25', group: 'جودة الهواء', label: 'جسيمات PM2.5', icon: 'PM2.5', kind: 'grid', grid: 'pm25',
    units: UNITS.ugm3, stops: [[0, '#2e9e5b'], [15, '#9ccc3a'], [35, '#f2d024'], [75, '#e8761e'], [150, '#c4161c'], [250, '#7e0023']],
    desc: 'جسيمات دقيقة تصل للدم. حد منظمة الصحة اليومي 15.' },
  { id: 'dust', group: 'جودة الهواء', label: 'عواصف ترابية', icon: 'dust', kind: 'grid', grid: 'dust', minShow: 10,
    units: UNITS.ugm3, stops: [[0, '#fff3cc'], [50, '#f6d98c'], [200, '#d9a441'], [500, '#a6611a'], [1500, '#543005']],
    desc: 'تركيز الغبار الصحراوي قرب سطح الأرض (نموذج CAMS).' },

  { id: 'SO2', group: 'غازات الأقمار', label: 'SO₂', icon: 'SO₂', kind: 'sat', sat: 'SO2' },
  { id: 'NO2', group: 'غازات الأقمار', label: 'NO₂', icon: 'NO₂', kind: 'sat', sat: 'NO2' },
  { id: 'CO', group: 'غازات الأقمار', label: 'CO', icon: 'CO', kind: 'sat', sat: 'CO' },
  { id: 'CH4', group: 'غازات الأقمار', label: 'CH₄', icon: 'CH₄', kind: 'sat', sat: 'CH4' },
  { id: 'DUST', group: 'غازات الأقمار', label: 'دخان/غبار', icon: 'AI', kind: 'sat', sat: 'DUST' },

  { id: 'wind', group: 'الطقس', label: 'الرياح', icon: 'wind', kind: 'grid', grid: 'wind', arrows: true,
    units: UNITS.speed, stops: [[0, '#e8f4fa'], [3, '#a6dcef'], [6, '#58c4a0'], [10, '#f2e04a'], [15, '#f28b30'], [22, '#c4161c'], [30, '#7a0177']],
    desc: 'السهم يشير إلى الجهة التي تتجه نحوها الرياح، وهي التي ينتشر باتجاهها الدخان والغاز.' },
  { id: 'temp', group: 'الطقس', label: 'الحرارة', icon: 'temp', kind: 'grid', grid: 'temp',
    units: UNITS.temp, stops: [[-5, '#3b4cc0'], [5, '#6f9bf0'], [15, '#8ecae6'], [22, '#fee08b'], [30, '#f46d43'], [38, '#d73027'], [48, '#7f0000']],
    desc: 'درجة حرارة الهواء على ارتفاع 2 متر.' },
  { id: 'cloud', group: 'الطقس', label: 'الغيوم', icon: 'cloud', kind: 'grid', grid: 'cloud', minShow: 5,
    units: UNITS.pct, stops: [[0, '#dbe7f3'], [50, '#a9b8c6'], [100, '#5d6b78']], desc: 'نسبة تغطية السماء بالغيوم. الغيوم تحجب قراءات الأقمار.' },
  { id: 'rain', group: 'الطقس', label: 'الأمطار', icon: 'rain', kind: 'grid', grid: 'rain', minShow: 0.05,
    units: UNITS.mm, stops: [[0, '#d6ecff'], [1, '#5aaaf0'], [5, '#2358c9'], [20, '#7b2cbf']], desc: 'كمية الأمطار في الساعة الأخيرة.' },
  { id: 'pressure', group: 'الطقس', label: 'الضغط', icon: 'gauge', kind: 'grid', grid: 'pressure',
    units: UNITS.pressure, stops: [[970, '#6a3d9a'], [1000, '#5aa0d8'], [1013, '#a8e0a0'], [1025, '#f7e07a'], [1040, '#e8761e']], desc: 'الضغط الجوي عند سطح الأرض.' },
  { id: 'humidity', group: 'الطقس', label: 'الرطوبة', icon: 'drop', kind: 'grid', grid: 'humidity',
    units: UNITS.pct, stops: [[0, '#e6c27a'], [30, '#cfe3a0'], [60, '#7fc4d8'], [100, '#2358c9']], desc: 'الرطوبة النسبية للهواء.' },
];
