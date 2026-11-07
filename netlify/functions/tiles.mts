declare const Netlify: { env: { get(name: string): string | undefined } };
export default async (req: Request) => {
  const parts=new URL(req.url).pathname.split('/').slice(-4);
  const [style,z,x,y]=parts;
  if (!['dataviz-light','dataviz-dark'].includes(style)||![z,x,y].every(v=>/^\d+$/.test(v))) return new Response(null,{status:400});
  const key=Netlify.env.get('MAPTILER_KEY');
  if (!key) return new Response(null,{status:503});
  try {
    const response=await fetch(`https://api.maptiler.com/maps/${style}/${z}/${x}/${y}.png?key=${encodeURIComponent(key)}`,{signal:AbortSignal.timeout(15000)});
    if(!response.ok) return new Response(null,{status:502});
    return new Response(response.body,{headers:{'Content-Type':'image/png','Cache-Control':'public, max-age=86400'}});
  } catch {return new Response(null,{status:502});}
};
export const config={path:'/api/tiles/:style/:z/:x/:y'};
