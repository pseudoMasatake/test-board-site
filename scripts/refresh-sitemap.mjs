import fs from "node:fs";
const index=fs.readFileSync("index.html","utf8");
const match=index.match(/createClient\("([^"]+)","([^"]+)"\)/);
if(!match) throw new Error("Supabase public configuration not found in index.html");
const base=match[1], key=match[2];
async function fetchAll(table,query){
  const rows=[];
  for(let offset=0;;offset+=1000){
    const url=base+"/rest/v1/"+table+"?"+query+"&limit=1000&offset="+offset;
    const res=await fetch(url,{headers:{apikey:key,Authorization:"Bearer "+key}});
    if(!res.ok) throw new Error(table+" fetch failed: "+res.status+" "+await res.text());
    const batch=await res.json();
    rows.push(...batch);
    if(batch.length<1000) break;
  }
  return rows;
}
const cases=await fetchAll("cases","select=slug,updated_at&is_demo=eq.false&slug=not.is.null&order=slug.asc");
const people=await fetchAll("people","select=id,created_at&verification_status=eq.verified&order=id.asc");
const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
const staticUrls=["https://saibanwatch.github.io/","https://saibanwatch.github.io/criminal.html","https://saibanwatch.github.io/civil.html","https://saibanwatch.github.io/administrative.html","https://saibanwatch.github.io/acquittals.html","https://saibanwatch.github.io/sentencing.html","https://saibanwatch.github.io/terms.html","https://saibanwatch.github.io/community-guidelines.html","https://saibanwatch.github.io/privacy.html","https://saibanwatch.github.io/disclaimer.html","https://saibanwatch.github.io/contact.html","https://saibanwatch.github.io/advertising.html"];
let xml='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
for(const u of staticUrls) xml+='  <url><loc>'+esc(u)+'</loc></url>\n';
for(const r of cases) xml+='  <url><loc>'+esc("https://saibanwatch.github.io/case.html?slug="+encodeURIComponent(r.slug))+'</loc><lastmod>'+String(r.updated_at).slice(0,10)+'</lastmod></url>\n';
for(const r of people) xml+='  <url><loc>'+esc("https://saibanwatch.github.io/person.html?id="+encodeURIComponent(r.id))+'</loc><lastmod>'+String(r.created_at).slice(0,10)+'</lastmod></url>\n';
xml+='</urlset>\n';
fs.writeFileSync("sitemap.xml",xml);
