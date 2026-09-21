import fs from "node:fs";
const key="21d6e780c8c007515162b511ae98a991668a603d437c5119";
const host="saibanwatch.github.io";
const keyLocation="https://"+host+"/"+key+".txt";
const files=["sitemaps/cases.xml","sitemaps/people.xml","sitemaps/static.xml"];
const urls=[...new Set(files.flatMap(file=>{
  if(!fs.existsSync(file)) return [];
  const xml=fs.readFileSync(file,"utf8");
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1].replace(/&amp;/g,"&"));
}))];
if(!urls.length) throw new Error("No page URLs found in split sitemaps");
for(let i=0;i<urls.length;i+=10000){
  const batch=urls.slice(i,i+10000);
  const res=await fetch("https://api.indexnow.org/indexnow",{
    method:"POST",
    headers:{"content-type":"application/json; charset=utf-8"},
    body:JSON.stringify({host,key,keyLocation,urlList:batch})
  });
  const body=await res.text();
  if(!res.ok && res.status!==202) throw new Error("IndexNow "+res.status+": "+body);
  console.log("IndexNow accepted",batch.length,"URLs with status",res.status);
}
