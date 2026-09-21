import fs from "node:fs";
const key="21d6e780c8c007515162b511ae98a991668a603d437c5119";
const host="saibanwatch.github.io";
const keyLocation="https://"+host+"/"+key+".txt";
const xml=fs.readFileSync("sitemap.xml","utf8");
const urls=[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1].replace(/&amp;/g,"&"));
if(!urls.length) throw new Error("No URLs found in sitemap.xml");
const res=await fetch("https://api.indexnow.org/indexnow",{
  method:"POST",
  headers:{"content-type":"application/json; charset=utf-8"},
  body:JSON.stringify({host,key,keyLocation,urlList:urls})
});
const body=await res.text();
if(!res.ok && res.status!==202) throw new Error("IndexNow "+res.status+": "+body);
console.log("IndexNow accepted",urls.length,"URLs with status",res.status);
