declare const Netlify: { env: { get(name: string): string | undefined } };
import { fromArrayBuffer } from 'geotiff';

function cities() {
  return [
    ['baghdad','بغداد',33.31,44.37], ['basra','البصرة',30.51,47.81], ['mosul','نينوى',36.34,43.13],
    ['erbil','أربيل',36.19,44.01], ['sulaymaniyah','السليمانية',35.56,45.44], ['duhok','دهوك',36.86,42.99],
    ['kirkuk','كركوك',35.47,44.39], ['tikrit','صلاح الدين',34.61,43.68], ['ramadi','الأنبار',33.42,43.3],
    ['baqubah','ديالى',33.75,44.64], ['karbala','كربلاء',32.62,44.02], ['hillah','بابل',32.47,44.42],
    ['kut','واسط',32.51,45.82], ['najaf','النجف',32,44.33], ['diwaniyah','القادسية',31.99,44.93],
    ['samawah','المثنى',31.31,45.28], ['nasiriyah','ذي قار',31.04,46.26], ['amarah','ميسان',31.84,47.14],
  ].map(([id,name,lat,lon]) => ({id,name,lat,lon}));
}
function secret(name: string) {
  const value = Netlify.env.get(name);
  if (!value) throw new Error('configuration');
  return value;
}
async function upstream(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {...options, signal: AbortSignal.timeout(25000)});
  if (!response.ok) throw new Error('upstream');
  return response;
}
async function weather(air: boolean) {
  const locations = air ? cities() : Array.from({length: 90}, (_,i) => ({lat:37.4-Math.floor(i/9)*8.4/9,lon:38.7+i%9*10.1/8}));
  const fields = air ? {aqi:'us_aqi',pm10:'pm10',pm25:'pm2_5',dust:'dust',no2:'nitrogen_dioxide',so2:'sulphur_dioxide',co:'carbon_monoxide'} :
    {wind:'wind_speed_10m',wind_dir:'wind_direction_10m',temp:'temperature_2m',cloud:'cloud_cover',rain:'precipitation',pressure:'surface_pressure',humidity:'relative_humidity_2m'};
  const params = new URLSearchParams({latitude:locations.map(c=>c.lat).join(','),longitude:locations.map(c=>c.lon).join(','),current:Object.values(fields).join(','),...(air?{}:{wind_speed_unit:'ms'})});
  const data = await (await upstream(`https://${air?'air-quality-api':'api'}.open-meteo.com/v1/${air?'air-quality':'forecast'}?${params}`)).json();
  if (!air) {
    const airParams=new URLSearchParams({latitude:locations.map(c=>c.lat).join(','),longitude:locations.map(c=>c.lon).join(','),current:'us_aqi,pm10,pm2_5,dust'});
    const airData=await (await upstream(`https://air-quality-api.open-meteo.com/v1/air-quality?${airParams}`)).json();
    const airRows=Array.isArray(airData)?airData:[airData];
    data.forEach((r:any,i:number)=>Object.assign(r.current,airRows[i].current));
    Object.assign(fields,{aqi:'us_aqi',pm10:'pm10',pm25:'pm2_5',dust:'dust'});
  }
  const rows = Array.isArray(data)?data:[data];
  const updated = rows.map(r=>r.current?.time).filter(Boolean).sort()[0];
  const extract = (r:any) => Object.fromEntries(Object.entries(fields).map(([key,field])=>[key,r.current?.[field]??null]));
  if (air) return {updated:updated+'Z',cities:Object.fromEntries(cities().map((c,i)=>[c.id,extract(rows[i])]))};
  return {updated:updated+'Z',cols:9,rows:10,lat0:37.4,lat1:29,lon0:38.7,lon1:48.8,vars:Object.fromEntries(Object.keys(fields).map(key=>[key,rows.map(r=>extract(r)[key])]))};
}
async function fires() {
  const responses = await Promise.all(['VIIRS_SNPP_NRT','VIIRS_NOAA20_NRT'].map(async source => {
    const csv = await (await upstream(`https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(secret('FIRMS_MAP_KEY'))}/${source}/38.7,29,48.8,37.4/5`)).text();
    const lines = csv.trim().split(/\r?\n/); const header=lines.shift()!.split(',');
    if (!header.includes('latitude')) throw new Error('upstream');
    return lines.filter(Boolean).map(line=>Object.fromEntries(line.split(',').map((v,i)=>[header[i],v])));
  }));
  const rows=responses.flat();
  return {type:'FeatureCollection',updated:new Date().toISOString(),features:rows.map(r=>{
    const time=r.acq_time.padStart(4,'0');
    const days=new Set(rows.filter(p=>Math.abs(+p.latitude- +r.latitude)<0.01&&Math.abs(+p.longitude- +r.longitude)<0.01).map(p=>p.acq_date));
    return {type:'Feature',geometry:{type:'Point',coordinates:[+r.longitude,+r.latitude]},properties:{time:`${r.acq_date}T${time.slice(0,2)}:${time.slice(2)}:00Z`,satellite:r.satellite,confidence:r.confidence,frp:+r.frp,persistent:days.size>=3}};
  })};
}
async function satellite() {
  const token = await (await upstream('https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token',{
    method:'POST',body:new URLSearchParams({grant_type:'client_credentials',client_id:secret('CDSE_CLIENT_ID'),client_secret:secret('CDSE_CLIENT_SECRET')})
  })).json();
  const products = {SO2:{band:'SO2',unit:'mmol/m²',factor:1000,thresholds:[0.5,1,2]},NO2:{band:'NO2',unit:'µmol/m²',factor:1e6,thresholds:[100,200,400]},CO:{band:'CO',unit:'mmol/m²',factor:1000,thresholds:[40,60,80]},CH4:{band:'CH4',unit:'ppb',factor:1,thresholds:[1900,1950,2000]},DUST:{band:'AER_AI_340_380',unit:'AI',factor:1,thresholds:[1,2,3]}};
  const end=new Date(), start=new Date(end.getTime()-3*864e5);
  const results=await Promise.allSettled(Object.entries(products).map(async ([key,p])=>{
    const response=await upstream('https://sh.dataspace.copernicus.eu/api/v1/process', {method:'POST',headers:{Authorization:`Bearer ${token.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({
      input:{bounds:{bbox:[38.7,29,48.8,37.4]},data:[{type:'sentinel-5p-l2',dataFilter:{timeRange:{from:start.toISOString(),to:end.toISOString()},mosaickingOrder:'mostRecent'},processing:{minQa:50}}]},
      output:{width:64,height:64,responses:[{identifier:'default',format:{type:'image/tiff'}}]},
      evalscript:`//VERSION=3\nfunction setup(){return {input:["${p.band}","dataMask"],output:{bands:1,sampleType:"FLOAT32"}}} function evaluatePixel(s){return [s.dataMask?s.${p.band}*${p.factor}:-9999]}`
    })});
    const image=await (await fromArrayBuffer(await response.arrayBuffer())).getImage(); const raster=await image.readRasters();
    const data=Array.from(raster[0] as Float32Array,v=>Number.isFinite(v)&&v!==-9999?v:null);
    if (!data.some(v=>v!==null)) throw new Error('no-data');
    return {key,layer:{unit:p.unit,thresholds:p.thresholds},values:{w:64,h:64,data}};
  }));
  const valid=results.flatMap(r=>r.status==='fulfilled'?[r.value]:[]);
  if (!valid.length) throw new Error('no-data');
  return {updated:end.toISOString(),bounds:[[29,38.7],[37.4,48.8]],layers:Object.fromEntries(valid.map(r=>[r.key,r.layer])),values:Object.fromEntries(valid.map(r=>[r.key,r.values]))};
}
export default async (req: Request) => {
  if(req.method!=='GET') return new Response(null,{status:405});
  const name=new URL(req.url).pathname.split('/').pop();
  try {
    const data = name==='cities'?cities():name==='fires'?await fires():name==='grid'?await weather(false):name==='air'?await weather(true):name==='satellite'?await satellite():null;
    if (!data) return new Response(null,{status:404});
    return Response.json(data,{headers:{'Cache-Control':'public, max-age=300','Netlify-CDN-Cache-Control':'public, s-maxage=1800'}});
  } catch (error) {
    const configuration = error instanceof Error && error.message === 'configuration';
    return Response.json({
      code: configuration ? 'configuration' : 'upstream',
      error: configuration ? 'إعدادات مصدر البيانات غير مكتملة على الخادم.' : 'تعذر جلب البيانات من المصدر حالياً.',
    },{status:configuration ? 503 : 502,headers:{'Cache-Control':'no-store','Netlify-CDN-Cache-Control':'no-store'}});
  }
};
export const config = {path:'/api/data/:source'};
