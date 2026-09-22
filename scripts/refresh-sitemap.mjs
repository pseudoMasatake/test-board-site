import fs from "node:fs";

const index=fs.readFileSync("index.html","utf8");
const urlMatch=index.match(/SUPABASE_URL="([^"]+)"/)||index.match(/createClient\("([^"]+)"/);
const keyMatch=index.match(/SUPABASE_KEY="([^"]+)"/)||index.match(/createClient\("[^"]+","([^"]+)"\)/);
if(!urlMatch||!keyMatch) throw new Error("Supabase public configuration not found");
const base=urlMatch[1], key=keyMatch[1];

async function fetchAll(table,query){
  const out=[];
  for(let offset=0;;offset+=1000){
    const sep=query.includes("?")?"&":"?";
    const url=base+"/rest/v1/"+table+"?"+query+"&limit=1000&offset="+offset;
    const res=await fetch(url,{headers:{apikey:key,Authorization:"Bearer "+key}});
    if(!res.ok) throw new Error(table+" fetch failed: "+res.status+" "+await res.text());
    const rows=await res.json();
    out.push(...rows);
    if(rows.length<1000) break;
  }
  return out;
}

const [
  cases, people, casePeople, summaries, caseSources, personSources
]=await Promise.all([
  fetchAll("cases","select=id,slug,title,court,category,status,summary,prosecution_claim,defense_claim,court_view,source_url,source_label,event_date,updated_at,raw_metadata,sentence_request,sentencing_request,judgment_result&is_demo=eq.false&slug=not.is.null&order=slug.asc"),
  fetchAll("people","select=id,display_name,role,organization,bio,overview,background,birth_date,sex,birthplace,photo_url,profile_url,source_url,created_at&verification_status=eq.verified&order=display_name.asc"),
  fetchAll("case_people","select=case_id,person_id,role_label"),
  fetchAll("case_summaries","select=case_id,side_a_summary,side_b_summary,court_summary,side_a_label,side_b_label"),
  fetchAll("case_sources","select=case_id,url,publisher,title,source_type,is_primary,published_at&order=is_primary.desc"),
  fetchAll("person_sources","select=person_id,url,publisher,title,source_type,is_primary,created_at&order=is_primary.desc")
]);

const h=s=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const xml=s=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
const txt=(s,n=1000)=>String(s??"").replace(/\s+/g," ").trim().slice(0,n);
const safe=u=>{try{const x=new URL(u);return /^https?:$/.test(x.protocol)?x.href:""}catch{return""}};
const jpdate=d=>{const m=String(d||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?Number(m[1])+"年"+Number(m[2])+"月"+Number(m[3])+"日":String(d||"")};
const roles={judge:"裁判官",prosecutor:"検察官",lawyer:"弁護士",plaintiff:"原告",defendant:"被告",accused:"被告人",other:"関係者"};
const personById=new Map(people.map(p=>[p.id,p]));
const caseById=new Map(cases.map(c=>[c.id,c]));
const summaryByCase=new Map(summaries.map(s=>[s.case_id,s]));
const sourcesByCase=new Map;
for(const s of caseSources){if(!sourcesByCase.has(s.case_id))sourcesByCase.set(s.case_id,[]);sourcesByCase.get(s.case_id).push(s)}
const sourcesByPerson=new Map;
for(const s of personSources){if(!sourcesByPerson.has(s.person_id))sourcesByPerson.set(s.person_id,[]);sourcesByPerson.get(s.person_id).push(s)}
const peopleByCase=new Map, casesByPerson=new Map;
for(const cp of casePeople){
  const p=personById.get(cp.person_id), c=caseById.get(cp.case_id);
  if(p&&c){
    if(!peopleByCase.has(c.id))peopleByCase.set(c.id,[]);
    peopleByCase.get(c.id).push({...p,role_label:cp.role_label});
    if(!casesByPerson.has(p.id))casesByPerson.set(p.id,[]);
    casesByPerson.get(p.id).push({...c,role_label:cp.role_label});
  }
}

const css=fs.existsSync("seo.css")?fs.readFileSync("seo.css","utf8"):"";
if(!css) throw new Error("seo.css missing");
fs.rmSync("cases",{recursive:true,force:true});
fs.rmSync("people",{recursive:true,force:true});
fs.mkdirSync("cases",{recursive:true});
fs.mkdirSync("people",{recursive:true});
fs.mkdirSync("sitemaps",{recursive:true});

function catFile(c){return c==="刑事"?"criminal.html":c==="民事"?"civil.html":c==="行政"?"administrative.html":"index.html"}

function casePage(c){
  const url="https://saibanwatch.github.io/cases/"+encodeURIComponent(c.slug)+".html";
  const sum=txt(c.summary,1800), num=txt(c.raw_metadata?.case_number,120);
  const req=txt(c.sentencing_request||c.sentence_request,1200), jud=txt(c.judgment_result,1800);
  const ai=summaryByCase.get(c.id)||{}, pros=txt(ai.side_a_summary||c.prosecution_claim,2200), def=txt(ai.side_b_summary||c.defense_claim,2200), courtv=txt(ai.court_summary||c.court_view,2800);
  const desc=txt(c.title+"。"+(c.court||"")+(c.event_date?"、"+c.event_date:"")+"。"+(jud?"判決: "+jud:sum),155);
  const ppl=(peopleByCase.get(c.id)||[]).slice(0,30), srcMain=safe(c.source_url);
  const allsrc=[...(srcMain?[{url:srcMain,title:c.source_label||"原資料",publisher:c.source_label||""}]:[]),...(sourcesByCase.get(c.id)||[]).filter(s=>safe(s.url)&&safe(s.url)!==srcMain)];
  const cf=catFile(c.category);
  const json=JSON.stringify({"@context":"https://schema.org","@graph":[{"@type":"WebPage","@id":url,"url":url,"name":c.title,"description":desc,"dateModified":String(c.updated_at||"").slice(0,10),"isPartOf":{"@type":"WebSite","name":"裁判ウォッチ","url":"https://saibanwatch.github.io/"}},{"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"裁判ウォッチ","item":"https://saibanwatch.github.io/"},{"@type":"ListItem","position":2,"name":(c.category||"裁判")+"裁判","item":"https://saibanwatch.github.io/"+cf},{"@type":"ListItem","position":3,"name":c.title,"item":url}]}]}).replace(/</g,"\\u003c");
  const result=(req||jud)?'<section class="panel"><h2>求刑・判決</h2><div class="grid">'+(req?'<div class="info"><h3>求刑</h3><p>'+h(req)+'</p></div>':"")+(jud?'<div class="info"><h3>判決</h3><p>'+h(jud)+'</p></div>':"")+'</div></section>':"";
  const claims=(pros||def||courtv)?'<section class="panel"><h2>主張と裁判所の判断</h2><div class="grid">'+(pros?'<div class="info"><h3>'+h(ai.side_a_label||(c.category==="刑事"?"検察側の主張":"原告・申立人側の主張"))+'</h3><p>'+h(pros)+'</p></div>':"")+(def?'<div class="info"><h3>'+h(ai.side_b_label||(c.category==="刑事"?"弁護側の主張":"被告・相手方側の主張"))+'</h3><p>'+h(def)+'</p></div>':"")+(courtv?'<div class="info"><h3>裁判所の判断</h3><p>'+h(courtv)+'</p></div>':"")+'</div></section>':"";
  const persons=ppl.length?'<section class="panel"><h2>この事件の関係者</h2><ul class="list">'+ppl.map(p=>'<li><a href="../people/'+encodeURIComponent(p.id)+'.html"><strong>'+h(p.display_name)+'</strong></a><div class="meta">'+h(p.role_label||roles[p.role]||"関係者")+(p.organization?" · "+h(p.organization):"")+'</div></li>').join("")+'</ul></section>':"";
  const sources=allsrc.length?'<section class="panel"><h2>出典・原資料</h2><ul class="list">'+allsrc.map(s=>'<li><a href="'+h(safe(s.url))+'" target="_blank" rel="noopener noreferrer">'+h(s.title||s.publisher||"資料を開く")+'</a>'+(s.publisher?'<div class="meta">'+h(s.publisher)+'</div>':"")+'</li>').join("")+'</ul><p class="note">要約は原資料の代替ではありません。重要な内容はリンク先の原資料で確認してください。</p></section>':"";
  return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+h(c.title)+' - '+h(c.court||"裁判")+'の判決・裁判例 | 裁判ウォッチ</title><meta name="description" content="'+h(desc)+'"><meta name="robots" content="index,follow"><link rel="canonical" href="'+h(url)+'"><link rel="icon" href="../favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="../seo.css"><script src="../analytics.js" defer></script><meta property="og:type" content="article"><meta property="og:site_name" content="裁判ウォッチ"><meta property="og:title" content="'+h(c.title)+' | 裁判ウォッチ"><meta property="og:description" content="'+h(desc)+'"><meta property="og:url" content="'+h(url)+'"><meta name="twitter:card" content="summary"><script type="application/ld+json">'+json+'</script></head><body><header><div class="nav"><a class="brand" href="../index.html">裁判ウォッチ</a><nav class="navlinks"><a href="../criminal.html">刑事</a><a href="../civil.html">民事</a><a href="../administrative.html">行政</a><a href="../people.html">人物</a></nav></div></header><main><div class="breadcrumbs"><a href="../index.html">トップ</a> › <a href="../'+cf+'">'+h(c.category||"裁判")+'</a> › '+h(c.title)+'</div><section class="panel"><div class="meta"><span class="badge">'+h(c.category||"未分類")+'</span>'+(c.status?'<span class="badge">'+h(c.status)+'</span>':"")+(c.court?'<span>'+h(c.court)+'</span>':"")+(c.event_date?'<span>'+h(c.event_date)+'</span>':"")+(num?'<span>'+h(num)+'</span>':"")+'</div><h1>'+h(c.title)+'</h1>'+(sum?'<p class="summary">'+h(sum)+'</p>':"")+'</section>'+result+claims+persons+sources+'<section class="panel"><h2>みんなの意見</h2><p>この事件の求刑・判決への投票や投稿を確認できます。</p><a class="cta" href="../case.html?slug='+encodeURIComponent(c.slug)+'#opinions">投票・みんなの意見を見る</a><a class="subcta" href="../case.html?slug='+encodeURIComponent(c.slug)+'#posts">投稿を見る・書く</a></section><section class="panel"><h2>関連する裁判を探す</h2><p><a href="../'+cf+'">'+h(c.category||"裁判")+'の裁判一覧</a>'+(jud&&/無罪/.test(jud)?' · <a href="../acquittals.html">無罪判決の一覧</a>':"")+(req&&jud?' · <a href="../sentencing.html">求刑と判決の比較</a>':"")+'</p></section></main><footer>裁判ウォッチ · 公開資料を整理し、裁判の内容とみんなの意見を確認できるサイトです。</footer></body></html>';
}

function personPage(p){
  const url="https://saibanwatch.github.io/people/"+encodeURIComponent(p.id)+".html", role=roles[p.role]||"関係者", org=txt(p.organization,160), overview=txt(p.overview||p.bio,900), background=txt(p.background,1400), birth=p.birth_date||"", sex=({male:"男性",female:"女性",other:"その他"})[p.sex]||"未確認", birthplace=txt(p.birthplace,160)||"未確認", img=safe(p.photo_url);
  const desc=txt(p.display_name+"（"+role+(org?"・"+org:"")+"）の裁判ウォッチ人物ページ。掲載事件、確認資料、GOOD/BAD投票、みんなの意見を確認できます。",155);
  const personObj={"@type":"Person","@id":url+"#person","name":p.display_name,"jobTitle":role};
  if(org)personObj.affiliation={"@type":"Organization","name":org}; if(img)personObj.image=img; if(p.profile_url)personObj.sameAs=[p.profile_url]; if(birth)personObj.birthDate=birth; if(p.sex)personObj.gender=sex;
  const json=JSON.stringify({"@context":"https://schema.org","@graph":[personObj,{"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"裁判ウォッチ","item":"https://saibanwatch.github.io/"},{"@type":"ListItem","position":2,"name":"裁判関係者一覧","item":"https://saibanwatch.github.io/people.html"},{"@type":"ListItem","position":3,"name":p.display_name,"item":url}]}]}).replace(/</g,"\\u003c");
  const pcs=(casesByPerson.get(p.id)||[]).sort((a,b)=>String(b.event_date||"").localeCompare(String(a.event_date||""))).slice(0,50), srcs=(sourcesByPerson.get(p.id)||[]).slice(0,20);
  return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+h(p.display_name)+' - '+h(role)+'・掲載事件・みんなの評価 | 裁判ウォッチ</title><meta name="description" content="'+h(desc)+'"><meta name="robots" content="index,follow"><link rel="canonical" href="'+h(url)+'"><link rel="icon" href="../favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="../seo.css"><script src="../analytics.js" defer></script><meta property="og:type" content="profile"><meta property="og:site_name" content="裁判ウォッチ"><meta property="og:title" content="'+h(p.display_name)+' | 裁判ウォッチ"><meta property="og:description" content="'+h(desc)+'"><meta property="og:url" content="'+h(url)+'"><meta name="twitter:card" content="summary"><script type="application/ld+json">'+json+'</script></head><body><header><div class="nav"><a class="brand" href="../index.html">裁判ウォッチ</a><nav class="navlinks"><a href="../criminal.html">刑事</a><a href="../civil.html">民事</a><a href="../administrative.html">行政</a><a href="../people.html">人物</a></nav></div></header><main><div class="breadcrumbs"><a href="../index.html">トップ</a> › <a href="../people.html">裁判関係者</a> › '+h(p.display_name)+'</div><section class="panel"><div class="personhead"><div class="avatar">'+(img?'<img src="'+h(img)+'" alt="'+h(p.display_name)+'" loading="eager" referrerpolicy="no-referrer">':h((p.display_name||"?").slice(0,1)))+'</div><div><div class="meta"><span class="badge">'+h(role)+'</span><span class="badge">確認済み</span></div><h1>'+h(p.display_name)+'</h1>'+(org?'<div class="summary">'+h(org)+'</div>':"")+'<div class="grid" style="margin-top:12px"><div class="info"><h3>生年月日</h3><p>'+h(birth?jpdate(birth):"未確認")+'</p></div><div class="info"><h3>性別</h3><p>'+h(sex)+'</p></div><div class="info"><h3>出身地</h3><p>'+h(birthplace)+'</p></div></div>'+(overview?'<h3>概要</h3><p>'+h(overview)+'</p>':"")+(background?'<h3>経歴・生い立ち</h3><p>'+h(background)+'</p>':"")+'</div></div></section><section class="panel"><h2>'+h(p.display_name)+'の掲載事件</h2>'+(pcs.length?'<ul class="list">'+pcs.map(c=>'<li><a href="../cases/'+encodeURIComponent(c.slug)+'.html"><strong>'+h(c.title)+'</strong></a><div class="meta">'+h(c.role_label||role)+(c.court?" · "+h(c.court):"")+(c.event_date?" · "+h(c.event_date):"")+'</div></li>').join("")+'</ul>':'<p class="note">現在、紐付け済み事件はありません。</p>')+'</section><section class="panel"><h2>確認資料</h2>'+(srcs.length?'<ul class="list">'+srcs.map(s=>'<li><a href="'+h(safe(s.url))+'" target="_blank" rel="noopener">'+h(s.title||s.publisher||"確認資料")+'</a>'+(s.publisher?'<div class="meta">'+h(s.publisher)+'</div>':"")+'</li>').join("")+'</ul>':(p.profile_url||p.source_url)?'<a href="'+h(safe(p.profile_url||p.source_url))+'" target="_blank" rel="noopener">確認資料・公式プロフィールを開く</a>':'<p class="note">確認資料は人物情報の確認時に参照しています。</p>')+'</section><section class="panel"><h2>みんなの評価・意見</h2><p>'+h(p.display_name)+'について、GOOD/BAD投票や投稿を見ることができます。投票は利用者の主観であり、事実認定・信用性・法的評価を示すものではありません。</p><a class="cta" href="../person.html?id='+encodeURIComponent(p.id)+'#opinion">GOOD / BADを見る・投票する</a><a class="subcta" href="../person.html?id='+encodeURIComponent(p.id)+'#discussion">投稿を見る・書く</a></section></main><footer>裁判ウォッチ · 公開資料をもとに裁判と関係者を整理し、みんなの意見を見られるサイトです。</footer></body></html>';
}

for(const c of cases) fs.writeFileSync("cases/"+c.slug+".html",casePage(c));
for(const p of people) fs.writeFileSync("people/"+p.id+".html",personPage(p));

function peopleIndex(){
  const groups={judge:[],prosecutor:[],lawyer:[],accused:[],plaintiff:[],defendant:[],other:[]};
  for(const p of people)(groups[p.role]||groups.other).push(p);
  const sections=Object.entries(groups).filter(([,a])=>a.length).map(([r,a])=>'<section class="panel"><h2>'+h(roles[r]||"関係者")+'（'+a.length+'人）</h2><ul class="list">'+a.map(p=>'<li><a href="people/'+encodeURIComponent(p.id)+'.html"><strong>'+h(p.display_name)+'</strong></a>'+(p.organization?'<div class="meta">'+h(p.organization)+'</div>':"")+'</li>').join("")+'</ul></section>').join("");
  return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>裁判関係者一覧 - 裁判官・弁護士・検察官・当事者 | 裁判ウォッチ</title><meta name="description" content="裁判ウォッチに掲載している確認済みの裁判官、検察官、弁護士、原告、被告、被告人などの裁判関係者一覧。氏名から掲載事件やみんなの評価を確認できます。"><meta name="robots" content="index,follow"><link rel="canonical" href="https://saibanwatch.github.io/people.html"><link rel="icon" href="favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="seo.css"><script src="analytics.js" defer></script></head><body><header><div class="nav"><a class="brand" href="index.html">裁判ウォッチ</a><nav class="navlinks"><a href="criminal.html">刑事</a><a href="civil.html">民事</a><a href="administrative.html">行政</a></nav></div></header><main><div class="breadcrumbs"><a href="index.html">トップ</a> › 裁判関係者</div><section class="panel"><h1>裁判関係者一覧</h1><p class="summary">公開資料等で本人同一性を確認できた人物を掲載しています。氏名を選ぶと、掲載事件・確認資料・GOOD/BAD投票・投稿を確認できます。</p><div class="meta">確認済み '+people.length+'人</div></section>'+sections+'</main><footer>未確認の判決文記載人物は、同姓同名の誤統合を避けるため検索対象の人物一覧には含めていません。</footer></body></html>';
}
fs.writeFileSync("people.html",peopleIndex());

function archive(file,title,desc,rows){
  const items=rows.slice(0,300).map(c=>'<li><a href="cases/'+encodeURIComponent(c.slug)+'.html"><strong>'+h(c.title)+'</strong></a><div class="meta">'+h(c.court||"")+(c.event_date?" · "+h(c.event_date):"")+(c.judgment_result?" · "+h(txt(c.judgment_result,180)):"")+'</div></li>').join("");
  const url="https://saibanwatch.github.io/"+file;
  return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+h(title)+' | 裁判ウォッチ</title><meta name="description" content="'+h(desc)+'"><meta name="robots" content="index,follow"><link rel="canonical" href="'+url+'"><link rel="icon" href="favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="seo.css"><script src="analytics.js" defer></script></head><body><header><div class="nav"><a class="brand" href="index.html">裁判ウォッチ</a><nav class="navlinks"><a href="criminal.html">刑事</a><a href="civil.html">民事</a><a href="administrative.html">行政</a><a href="people.html">人物</a></nav></div></header><main><div class="breadcrumbs"><a href="index.html">トップ</a> › '+h(title)+'</div><section class="panel"><h1>'+h(title)+'</h1><p class="summary">'+h(desc)+'</p><div class="meta">掲載対象 '+rows.length+'件 · 新しい順に最大300件</div></section><section class="panel"><ul class="list">'+items+'</ul></section></main><footer>各事件ページから原資料・関係者・みんなの意見を確認できます。</footer></body></html>';
}
const byDate=(a,b)=>String(b.event_date||"").localeCompare(String(a.event_date||""));
fs.writeFileSync("criminal.html",archive("criminal.html","刑事裁判・判決一覧","刑事裁判の判決・求刑・裁判所・事件概要を、公開資料をもとに一覧で確認できます。",cases.filter(c=>c.category==="刑事").sort(byDate)));
fs.writeFileSync("civil.html",archive("civil.html","民事裁判・判決一覧","民事裁判の判決・裁判所・事件概要を、公開資料をもとに一覧で確認できます。",cases.filter(c=>c.category==="民事").sort(byDate)));
fs.writeFileSync("administrative.html",archive("administrative.html","行政裁判・判決一覧","行政裁判の判決・裁判所・事件概要を、公開資料をもとに一覧で確認できます。",cases.filter(c=>c.category==="行政").sort(byDate)));
fs.writeFileSync("acquittals.html",archive("acquittals.html","無罪判決の裁判例一覧","判決結果に無罪が含まれる掲載裁判例を、裁判所・日付・概要とともに確認できます。",cases.filter(c=>/無罪/.test(c.judgment_result||"")).sort(byDate)));
fs.writeFileSync("sentencing.html",archive("sentencing.html","求刑と判決の比較一覧","刑事事件のうち求刑と判決の両方を掲載している事件を一覧で確認できます。",cases.filter(c=>c.category==="刑事"&&(c.sentencing_request||c.sentence_request)&&c.judgment_result).sort(byDate)));

function urlset(rows){return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+rows.map(r=>'  <url><loc>'+xml(r.loc)+'</loc>'+(r.lastmod?'<lastmod>'+r.lastmod+'</lastmod>':'')+'</url>').join('\n')+'\n</urlset>\n'}
const caseMap=cases.map(c=>({loc:"https://saibanwatch.github.io/cases/"+encodeURIComponent(c.slug)+".html",lastmod:String(c.updated_at||"").slice(0,10)}));
const peopleMap=[{loc:"https://saibanwatch.github.io/people.html"},...people.map(p=>({loc:"https://saibanwatch.github.io/people/"+encodeURIComponent(p.id)+".html",lastmod:String(p.created_at||"").slice(0,10)}))];
const staticUrls=["https://saibanwatch.github.io/","https://saibanwatch.github.io/criminal.html","https://saibanwatch.github.io/civil.html","https://saibanwatch.github.io/administrative.html","https://saibanwatch.github.io/acquittals.html","https://saibanwatch.github.io/sentencing.html","https://saibanwatch.github.io/terms.html","https://saibanwatch.github.io/community-guidelines.html","https://saibanwatch.github.io/privacy.html","https://saibanwatch.github.io/disclaimer.html","https://saibanwatch.github.io/contact.html","https://saibanwatch.github.io/advertising.html"].map(loc=>({loc}));
fs.writeFileSync("sitemaps/cases.xml",urlset(caseMap));
fs.writeFileSync("sitemaps/people.xml",urlset(peopleMap));
fs.writeFileSync("sitemaps/static.xml",urlset(staticUrls));
const today=new Date().toISOString().slice(0,10);
fs.writeFileSync("sitemap.xml",'<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+["cases","people","static"].map(n=>'  <sitemap><loc>https://saibanwatch.github.io/sitemaps/'+n+'.xml</loc><lastmod>'+today+'</lastmod></sitemap>').join('\n')+'\n</sitemapindex>\n');
console.log("Generated",cases.length,"case pages and",people.length,"person pages");

// refresh-trigger: 2026-09-21-new-people


// profile-refresh-trigger: 2026-09-22-judges-lawyers-enrichment
