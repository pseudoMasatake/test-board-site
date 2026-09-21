(()=>{"use strict";
if(navigator.globalPrivacyControl===true||navigator.doNotTrack==="1"||window.doNotTrack==="1")return;
if(/bot|crawler|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|discordbot|headless/i.test(navigator.userAgent||""))return;
const endpoint="https://czhssdmwilnbrexqmtqg.supabase.co/rest/v1/rpc/log_page_view";
const key="sb_publishable_HhXl8I3L4z-UF168b6wSiQ_WrQXa1Uc";
function classify(){
  const path=location.pathname||"/";
  let type="static",entity=null;
  let m;
  if(path==="/"||/\/index\.html$/.test(path)){type="home";}
  else if((m=path.match(/\/cases\/([^/]+)\.html$/))){type="case";try{entity=decodeURIComponent(m[1])}catch{entity=m[1]}}
  else if((m=path.match(/\/people\/([^/]+)\.html$/))){type="person";try{entity=decodeURIComponent(m[1])}catch{entity=m[1]}}
  else if(/\/case\.html$/.test(path)){type="interactive_case";const q=new URLSearchParams(location.search);entity=q.get("slug")||q.get("id")}
  else if(/\/person\.html$/.test(path)){type="interactive_person";const q=new URLSearchParams(location.search);entity=q.get("id")||q.get("mention")}
  else if(/\/(criminal|civil|administrative|acquittals|sentencing|people)\.html$/.test(path)){type="archive";entity=RegExp.$1}
  return {type,entity,path:path.slice(0,300)};
}
function referrer(){
  if(!document.referrer)return "direct";
  try{
    const u=new URL(document.referrer);
    if(u.hostname===location.hostname)return "internal";
    return u.hostname.replace(/^www\./,"").toLowerCase().slice(0,200)||"direct";
  }catch{return "direct"}
}
function send(){
  const v=classify();
  fetch(endpoint,{
    method:"POST",
    mode:"cors",
    keepalive:true,
    credentials:"omit",
    headers:{"apikey":key,"Authorization":"Bearer "+key,"Content-Type":"application/json","Prefer":"return=minimal"},
    body:JSON.stringify({p_page_type:v.type,p_entity_key:v.entity,p_path:v.path,p_referrer_host:referrer()})
  }).catch(()=>{});
}
if(document.prerendering){document.addEventListener("prerenderingchange",send,{once:true});}
else if(document.readyState==="complete")setTimeout(send,0);
else window.addEventListener("load",()=>setTimeout(send,0),{once:true});
})();