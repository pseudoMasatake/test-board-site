(function(){
  const byId=x=>typeof x==="string"?document.getElementById(x):x;
  const getUser=o=>typeof o.getUser==="function"?o.getUser():o.user;
  const login=o=>{if(typeof o.needLogin==="function")o.needLogin();};
  const msg=e=>{
    const m=String(e?.message||"");
    if(m.includes("tag_rate_limited"))return "短時間のタグ追加が多すぎます。少し時間を空けてください。";
    if(m.includes("too_many_tags_on_target"))return "この対象に付けられるタグ数の上限に達しています。";
    if(m.includes("invalid_tag"))return "この文字列はタグに使えません。";
    if(m.includes("already_reported"))return "このタグはすでに通報済みです。";
    if(m.includes("remove_own_tag_instead"))return "自分で付けたタグは通報ではなく「×」で取り消してください。";
    if(m.includes("report_rate_limited"))return "短時間の通報が多すぎます。少し時間を空けてください。";
    return "操作できませんでした。";
  };
  async function render(o){
    const el=byId(o.container);
    if(!el||!o.targetType||!o.targetId)return;
    const {data,error}=await o.sb.rpc("get_target_tags",{p_target_type:o.targetType,p_target_id:o.targetId});
    if(error){console.error(error);el.innerHTML='<div class="small">タグを読み込めませんでした。</div>';return;}
    const rows=data||[];
    if(!rows.length){el.innerHTML='<div class="small">まだタグはありません。</div>';return;}
    el.innerHTML="";
    const wrap=document.createElement("div");wrap.className="tag-list";
    rows.forEach(t=>{
      const chip=document.createElement("span");chip.className="tag-chip";
      const a=document.createElement("a");a.href="index.html?q="+encodeURIComponent("#"+t.tag_name);a.textContent="#"+t.tag_name;a.title="このタグで検索";
      const count=document.createElement("span");count.textContent=String(Number(t.support_count||0));count.title="このタグを付けた人数";
      chip.append(a,count);
      const user=getUser(o);
      if(t.my_support){
        const b=document.createElement("button");b.type="button";b.textContent="×";b.title="自分のタグ付けを取り消す";
        b.onclick=async()=>{if(!user)return login(o);const {error}=await o.sb.rpc("remove_tag_support",{p_tag_link_id:t.link_id});if(error){console.error(error);alert(msg(error));return;}await render(o);};
        chip.append(b);
      }else{
        const plus=document.createElement("button");plus.type="button";plus.textContent="＋";plus.title="自分もこのタグを付ける";
        plus.onclick=async()=>{if(!getUser(o))return login(o);const {error}=await o.sb.rpc("add_tag",{p_target_type:o.targetType,p_target_id:o.targetId,p_name:t.tag_name});if(error){console.error(error);alert(msg(error));return;}await render(o);};
        const report=document.createElement("button");report.type="button";report.textContent="通報";report.title="不適切なタグを通報";
        report.onclick=async()=>{if(!getUser(o))return login(o);const reason=prompt("通報理由を入力してください（300文字以内）");if(!reason?.trim())return;const {error}=await o.sb.rpc("report_tag",{p_tag_link_id:t.link_id,p_reason:reason.trim().slice(0,300)});if(error){console.error(error);alert(msg(error));return;}alert("通報を受け付けました。非表示は運営が確認して判断します。");};
        chip.append(plus,report);
      }
      wrap.append(chip);
    });
    el.append(wrap);
  }
  async function add(o){
    if(!getUser(o))return login(o);
    const input=byId(o.input);
    const name=String(input?.value||"").trim();
    if(!name)return;
    const {error}=await o.sb.rpc("add_tag",{p_target_type:o.targetType,p_target_id:o.targetId,p_name:name});
    if(error){console.error(error);alert(msg(error));return;}
    if(input)input.value="";
    await render(o);
  }
  async function search(sb,q){
    const term=String(q||"").trim();
    if(!term)return [];
    const {data,error}=await sb.rpc("search_tag_targets",{p_query:term});
    if(error){console.error(error);return [];}
    return data||[];
  }
  window.COURTWATCH_TAGS={render,add,search};
})();