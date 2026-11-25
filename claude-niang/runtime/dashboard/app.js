import * as L from './ledger.js';
import {PRICE_SOURCE} from './pricing.js';

// Claude 娘 · 用量管理 page. Data arrives from the window host
// (runtime/dashboard-host.cs) as messages: {type:'state'|'usage'|'toast'}.
// Names from claude.ai or folders are always inserted as text, never as HTML.

const host=window.chrome?.webview ?? null;
const send=message=>{try{host?.postMessage(message);}catch{}};
const params=new URLSearchParams(location.search);
const snapshot=params.get('snapshot')==='1';
if(snapshot)document.documentElement.classList.add('snapshot');

const state={status:null,orgFile:null,claudeRunning:false,scanning:false,version:'',index:null,rows:[],
  haveState:false,haveUsage:false,view:String(params.get('view')).startsWith('ledger')?'ledger':'overview',
  filter:{...L.EMPTY_FILTER},chartMode:'day',search:'',page:0,refreshingSince:0,refreshBase:null,filterOpen:false};
const $=id=>document.getElementById(id);
const PAGE_SIZE=10;

// --- small DOM helpers -----------------------------------------------------------
function el(tag,props={},...children){
  const node=document.createElement(tag);
  for(const [key,value] of Object.entries(props||{})){
    if(value===undefined || value===null || value===false)continue;
    if(key==='class')node.className=value;
    else if(key==='text')node.textContent=value;
    else if(key==='style')node.style.cssText=value; // CSP: no inline style attributes
    else if(key.startsWith('on'))node.addEventListener(key.slice(2),value);
    else if(key==='dataset')Object.assign(node.dataset,value);
    else node.setAttribute(key,value===true?'':value);
  }
  for(const child of children.flat()){if(child===null || child===undefined || child===false)continue;node.append(child instanceof Node?child:document.createTextNode(String(child)));}
  return node;
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const clock=ms=>{const d=new Date(ms);return pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());};
const shortDay=day=>day.slice(5).replace('-','/');
function ago(ms,now=Date.now()){
  const min=Math.floor((now-ms)/60000);
  if(min<1)return '刚刚';if(min<60)return min+' 分钟前';if(min<1440)return Math.floor(min/60)+' 小时前';return Math.floor(min/1440)+' 天前';
}
function stamp(ms,now=Date.now()){
  const d=new Date(ms);
  return L.dayKey(ms)===L.dayKey(now)?pad(d.getHours())+':'+pad(d.getMinutes()):(d.getMonth()+1)+'/'+d.getDate()+' '+pad(d.getHours())+':'+pad(d.getMinutes());
}
function money(minor,currency='USD'){
  if(minor===null || minor===undefined)return '—';
  const code=String(currency||'USD').toUpperCase(),digits=code==='JPY'?0:2;
  const symbol={USD:'$',EUR:'€',GBP:'£',JPY:'¥',CNY:'¥'}[code]??code+' ';
  return symbol+(Number(minor)/10**digits).toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});
}
function resetText(seconds,now=Date.now()){
  const ms=seconds*1000;
  if(ms<=now)return '已到重置时间 · 等待刷新';
  let min=Math.ceil((ms-now)/60000);const d=Math.floor(min/1440);min-=d*1440;const h=Math.floor(min/60),m=min%60;
  const left=[d?d+'天':'',h?h+'小时':'',d || (h && !m)?'':m+'分'].filter(Boolean).join(' ')+'后';
  const at=new Date(ms);
  return left+' · '+(at.getMonth()+1)+'/'+at.getDate()+' '+pad(at.getHours())+':'+pad(at.getMinutes());
}
function tone(window,now=Date.now()){
  if(!window || window.used===null || window.used===undefined)return 'muted';
  if(window.resetsAt && window.resetsAt*1000<=now)return 'muted';
  return window.used>=90?'danger':window.used>=75?'warn':'normal';
}

// --- tooltip and toast -----------------------------------------------------------
const tip=$('tooltip');
document.addEventListener('mousemove',event=>{
  const target=event.target.closest?.('[data-tip]');
  if(!target){tip.hidden=true;return;}
  tip.innerHTML=target.dataset.tip;tip.hidden=false;
  const pad=14,w=tip.offsetWidth,h=tip.offsetHeight;
  let x=event.clientX+pad,y=event.clientY+pad;
  if(x+w>innerWidth-8)x=event.clientX-w-pad;if(y+h>innerHeight-8)y=event.clientY-h-pad;
  tip.style.left=x+'px';tip.style.top=y+'px';
});
document.addEventListener('mouseleave',()=>{tip.hidden=true;});
let toastTimer=0;
function toast(text){const t=$('toast');t.textContent=text;t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{t.hidden=true;},2600);}
function usageTip(title,t){
  const row=(a,b)=>`<div class="row"><span>${a}</span><span>${b}</span></div>`;
  return `<b>${esc(title)}</b>`+row('Tokens（输入+输出）',L.formatTokens(t.tokens))+row('输入',L.formatTokens(t.input))+row('输出',L.formatTokens(t.output))+
    row('缓存写入',L.formatTokens(t.cacheWrite))+row('缓存读取',L.formatTokens(t.cacheRead))+row('回复',t.replies+' 次')+row('参考费用',t.coverage===null?'—':L.formatCost(t.cost));
}

// --- common pieces ---------------------------------------------------------------
function metric(label,value,unit,note,tipHtml){
  return el('div',{class:'metric',dataset:tipHtml?{tip:tipHtml}:undefined},
    el('div',{class:'metric-label'},el('i'),label),
    el('div',{class:'metric-value'},value,unit?el('small',{text:unit}):null),
    el('div',{class:'metric-note',text:note}));
}
function bar(percent){return el('div',{class:'bar'},el('i',{style:`width:${Math.max(0,Math.min(100,percent))}%`}));}
function shareList(list,emptyText){
  if(!list.length)return el('div',{class:'empty',text:emptyText});
  return el('div',{},list.map(item=>el('div',{class:'share-row'+(item.other?' other':''),dataset:{tip:usageTip(item.name,item)}},
    el('div',{class:'share-top'},el('span',{class:'share-name',text:item.name}),
      el('span',{class:'share-value'},L.formatTokens(item.tokens)+' · '+(item.share*100).toFixed(1)+'%',el('b',{text:item.coverage?L.formatCost(item.cost):'未定价'}))),
    bar(item.share*100))));
}

// Bars of input + output per point; the last one highlighted.
function barChart(points,{highlightLast=true,labelEvery=1,title=p=>p.day}={}){
  const box=el('div');
  if(!points.length){box.append(el('div',{class:'empty',text:'还没有本机 Claude Code 记录。'}));return box;}
  const max=Math.max(...points.map(p=>p.tokens),1);
  const dense=points.length>40;
  box.append(el('div',{class:'gridline',style:'bottom:calc(24px + (100% - 24px) * 0.98)'},el('span',{text:L.formatTokens(max)})));
  box.append(el('div',{class:'gridline',style:'bottom:calc(24px + (100% - 24px) * 0.49)'}));
  const bars=el('div',{class:'bars'+(dense?' dense':'')}),axis=el('div',{class:'axis'});
  points.forEach((p,i)=>{
    const h=p.tokens/max*96;
    const stack=el('div',{class:'stack',style:`height:${h}%`});
    if(p.tokens>0){
      stack.append(el('i',{class:'out',style:`display:block;height:${p.output/p.tokens*100}%`}));
      if(p.input>0)stack.append(el('i',{class:'in',style:`display:block;height:${p.input/p.tokens*100}%;min-height:2px`}));
    }
    bars.append(el('div',{class:'col'+(highlightLast && i===points.length-1?' latest':''),dataset:{tip:usageTip(title(p),p)}},p.tokens>0?stack:el('div',{class:'zero'})));
    axis.append(el('span',{text:i%labelEvery===0 || i===points.length-1?shortDay(p.day):''}));
  });
  box.append(bars,axis);
  return box;
}
function areaChart(points){
  const box=el('div');
  if(!points.length){box.append(el('div',{class:'empty',text:'没有符合条件的记录。'}));return box;}
  const max=Math.max(...points.map(p=>p.cumulativeTokens),1),n=points.length;
  const x=i=>n===1?50:i/(n-1)*100,y=v=>100-v/max*94;
  const line=points.map((p,i)=>(i?'L':'M')+x(i).toFixed(2)+' '+y(p.cumulativeTokens).toFixed(2)).join(' ');
  const svg=`<svg class="area" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c6613f" stop-opacity=".22"/><stop offset="1" stop-color="#c6613f" stop-opacity="0"/></linearGradient></defs><path class="fill" d="${line} L ${x(n-1)} 100 L ${x(0)} 100 Z"/><path class="line" d="${line}"/></svg>`;
  box.innerHTML=svg;
  box.prepend(el('div',{class:'gridline',style:'bottom:calc(24px + (100% - 24px) * 0.94)'},el('span',{text:L.formatTokens(max)})));
  // Invisible hover columns for the tooltip, and the date axis.
  const cols=el('div',{class:'bars dense'}),axis=el('div',{class:'axis'});const every=Math.ceil(n/10);
  points.forEach((p,i)=>{
    cols.append(el('div',{class:'col',dataset:{tip:usageTip(p.day+' 累计',{...p,tokens:p.cumulativeTokens,cost:p.cumulativeCost,input:p.input,output:p.output})+`<div class="row"><span>当天</span><span>${L.formatTokens(p.tokens)}</span></div>`}}));
    axis.append(el('span',{text:i%every===0 || i===n-1?shortDay(p.day):''}));
  });
  box.append(cols,axis);
  return box;
}
function heatmapChart(rows){
  const map=L.heatmap(rows,Date.now(),53),box=el('div');
  const grid=el('div',{class:'heatmap'});
  for(const c of map.cells)grid.append(el('i',{class:c.future?'future':undefined,dataset:{l:String(c.level),tip:c.future?undefined:`<b>${c.day}</b><div class="row"><span>Tokens</span><span>${L.formatTokens(c.tokens)}</span></div><div class="row"><span>回复</span><span>${c.replies} 次</span></div>`}}));
  const scale=el('span',{class:'heat-scale'},'少',[0,1,2,3,4].map(l=>el('i',{style:`background:${['#f3ede8','#f4d7c9','#eab39b','#d98462','#c6613f'][l]}`})),'多');
  box.append(grid,el('div',{class:'heat-foot'},el('span',{text:'最近 53 周 · 每格一天'}),scale));
  return box;
}

// --- header ----------------------------------------------------------------------
function renderHeader(){
  const ledger=state.view==='ledger';
  $('title').textContent=ledger?'用量账本':'账户总览';
  $('subtitle').textContent=ledger?'按时间、模型、项目、来源筛选本机 Claude Code 用量。':'查看各个组织的额度与本机 Claude Code 用量。';
  document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('selected',b.dataset.view===state.view));
  $('overview').hidden=ledger;$('ledger').hidden=!ledger;
  $('toggle-filter').hidden=!ledger;
  const cs=$('claude-state');cs.className='claude-state'+(state.claudeRunning?' on':'');cs.textContent=state.claudeRunning?'Claude 运行中':'Claude 未打开';
  const refresh=$('refresh');
  if(state.refreshingSince && Date.now()-state.refreshingSince>25000)state.refreshingSince=0;
  refresh.classList.toggle('busy',!!state.refreshingSince);
  $('brand-version').textContent=state.version?'v'+state.version:'';
  $('foot-left').textContent='Claude 娘'+(state.version?' '+state.version:'');
  const scanned=state.index?.scannedAt;
  $('foot-right').textContent=state.scanning?'正在更新本机用量…':scanned?'本机用量更新于 '+clock(scanned):'';
}

// --- overview --------------------------------------------------------------------
function accountCards(todayTokens){
  const status=state.status,box=$('accounts');box.replaceChildren();
  const orgs=Array.isArray(status?.orgs)?status.orgs.filter(o=>o && o.uuid):[];
  $('org-count').textContent=orgs.length?String(orgs.length):'';
  const saved=state.orgFile && state.orgFile.version===1 && (state.orgFile.sessionEpoch??null)===(status?.sessionEpoch??null)?state.orgFile.orgs||{}:{};
  if(!orgs.length){
    const signedOut=!status || status.errorCode==='NOT_LOGGED_IN' || status.loggedIn===false;
    box.append(el('div',{class:'account login-card'},
      el('div',{class:'avatar'},el('img',{src:'../../assets/claude-niang.png',alt:''})),
      el('div',{class:'account-name',text:!status?'正在读取…':signedOut?'还没有登录 claude.ai':'还没有读取过额度'}),
      el('p',{text:signedOut?'登录后，这里会显示每个组织的套餐、5 小时和每周额度、额外用量和预付余额。本机用量不需要登录。':(status?.error||'点「刷新额度」读取一次。')}),
      signedOut?el('button',{class:'primary',onclick:()=>send('login')},'登录 Claude 账号'):el('button',{class:'primary',onclick:refresh},'刷新额度')));
    return;
  }
  const now=Date.now();
  for(const org of orgs){
    const current=org.uuid===status.selectedOrg;
    const data=current && status.ok?status:saved[org.uuid]||null;
    const live=current && status.ok;
    const plan=(data?.planLabel && data.planLabel!=='未知套餐')?data.planLabel:org.planLabel;
    const card=el('div',{class:'account'+(current?' current':'')});
    card.append(el('div',{class:'account-head'},el('div',{class:'account-name',text:org.name||'未命名组织',title:org.name||''}),
      el('div',{class:'chips'},plan && plan!=='未知套餐'?el('span',{class:'chip',text:plan}):null,current?el('span',{class:'chip accent',text:'当前'}):null)));
    const meta=el('div',{class:'account-meta'});
    if(current){
      meta.append(el('span',{class:state.claudeRunning?'online':undefined,text:state.claudeRunning?'● Claude 运行中':'○ Claude 未打开'}));
      meta.append(el('span',{class:'sep',text:'·'}),el('span',{text:'当前组织'}));
      meta.append(el('span',{class:'sep',text:'·'}),el('span',{text:'本机今日 '+L.formatTokens(todayTokens)+' Tokens'}));
    }else meta.append(el('span',{text:data?'上次选中时读取的数据':'未选中的组织'}));
    card.append(meta);
    const windows=Array.isArray(data?.windows)?data.windows.filter(Boolean):[];
    if(!data){
      card.append(el('div',{class:'account-note',text:current?(status.error||'点「刷新额度」读取这个组织的额度。'):'还没有读取过。在挂件右键「Claude 账号 → 切换组织」选中它，再点刷新。'}));
    }else if(!windows.length){
      card.append(el('div',{class:'account-note',text:'这个组织没有返回额度窗口（Free 套餐通常没有）。'}));
    }
    const lines=el('div',{class:'account-lines'});
    for(const w of windows){
      if(w.kind==='extra'){
        lines.append(el('div',{},'额外用量 ',el('b',{text:money(w.usedMinor,w.currency)}),w.limitMinor!==null && w.limitMinor!==undefined?' / '+money(w.limitMinor,w.currency)+(w.remaining!==null && w.remaining!==undefined?'（剩 '+Number(w.remaining).toFixed(0)+'%）':''):''));
        continue;
      }
      const t=tone(w,now),expired=t==='muted' && w.resetsAt && w.resetsAt*1000<=now;
      card.append(el('div',{class:'quota-row tone-'+t},
        el('div',{class:'quota-top'},el('span',{text:w.label||'额度'}),
          el('span',{class:'quota-value'},expired?'上次已用 '+Number(w.used).toFixed(0)+'%':Number(w.remaining).toFixed(0)+'%',expired?null:el('small',{text:'剩余'}))),
        bar(expired?0:Number(w.remaining)),
        el('div',{class:'quota-reset',text:w.resetsAt?resetText(w.resetsAt,now):'未提供重置时间'})));
    }
    if(data?.credits && data.credits.amountMinor!==null && data.credits.amountMinor!==undefined)lines.append(el('div',{},'预付余额 ',el('b',{text:money(data.credits.amountMinor,data.credits.currency)})));
    if(lines.childElementCount)card.append(lines);
    if(current && status.ok && status.error && status.errorCode)card.append(el('div',{class:'account-note',text:'刷新未成功：'+status.error}));
    card.append(el('div',{class:'account-foot-line'}));
    const observed=data?.observedAt;
    const stale=observed && now-observed>10*60000;
    const footer=el('div',{class:'account-footer'},
      el('span',{class:'updated'+(observed?(stale?' stale':''):' none'),text:observed?(live?'更新于 '+clock(observed)+(stale?'（'+ago(observed,now)+'）':''):'读取于 '+stamp(observed,now)+'（'+ago(observed,now)+'）'):'尚未读取'}),
      current?el('div',{class:'account-actions'},
        el('button',{class:'ghost small',onclick:()=>send('focus-claude'),disabled:!state.claudeRunning,title:'把 Claude 窗口切到前面'},'定位窗口'),
        el('button',{class:'ghost small',onclick:refresh},'刷新')):null);
    card.append(footer);
    box.append(card);
  }
}

// The local counterpart of an account card: this computer's Claude Code.
function localCard(today,now){
  const card=el('div',{class:'account local'});
  const last=state.rows.at(-1);
  const entries=[...new Set(state.rows.filter(r=>now-r.time<30*86400000).map(r=>L.ENTRY_LABELS[r.entry]))].filter(Boolean);
  card.append(el('div',{class:'account-head'},el('div',{class:'account-name',text:'本机 Claude Code'}),
    el('div',{class:'chips'},entries.slice(0,2).map(e=>el('span',{class:'chip',text:e})),el('span',{class:'chip',text:'本机'}))));
  card.append(el('div',{class:'account-meta'},
    el('span',{class:state.scanning?undefined:'online',text:state.scanning?'○ 正在更新':'● 自动更新'}),el('span',{class:'sep',text:'·'}),
    el('span',{text:last?'最近活动 '+stamp(last.time,now)+'（'+ago(last.time,now)+'）':'还没有记录'})));
  if(!state.rows.length){
    card.append(el('div',{class:'account-note',text:state.haveUsage?'这台电脑上还没有 Claude Code 会话记录。在 Claude 桌面端开一个 Code 会话后，这里会自动出现用量。':'正在统计本机 Claude Code 记录…'}));
  }else{
    const week=L.totals(L.filterRows(state.rows,{range:'7d'},now));
    const stat=(label,value,note)=>el('div',{class:'stat'},el('span',{text:label}),el('b',{text:value}),note?el('small',{text:note}):null);
    card.append(el('div',{class:'stats'},
      stat('今日 Tokens',L.formatTokens(today.tokens),today.sessions+' 个会话'),
      stat('近 7 天',L.formatTokens(week.tokens),week.sessions+' 个会话'),
      stat('缓存命中',L.formatPercent(week.cacheHit),'近 7 天'),
      stat('参考费用',L.formatCost(week.cost),'近 7 天')));
    const days=L.recentDays(state.rows,7,now),max=Math.max(...days.map(d=>d.tokens),1);
    card.append(el('div',{class:'spark'},days.map((d,i)=>el('div',{class:'spark-col'+(i===days.length-1?' latest':''),dataset:{tip:usageTip(d.day,d)}},
      el('i',{style:`height:${Math.max(d.tokens?6:2,d.tokens/max*76)}%`}),el('span',{text:shortDay(d.day)})))));
  }
  card.append(el('div',{class:'account-foot-line'}));
  card.append(el('div',{class:'account-footer'},
    el('span',{class:'updated'+(state.index?.scannedAt?'':' none'),text:state.index?.scannedAt?'统计于 '+clock(state.index.scannedAt):'尚未统计'}),
    el('div',{class:'account-actions'},el('button',{class:'ghost small',onclick:()=>{state.view='ledger';render();$('content').scrollTop=0;}},'查看账本'))));
  return card;
}

function renderOverview(){
  const now=Date.now(),[start,end]=L.rangeBounds('today',now);
  const today=L.totals(state.rows.filter(r=>r.time>=start && r.time<end));
  const m=$('overview-metrics');m.replaceChildren();
  const noUsage=!state.haveUsage?'正在统计…':'本机还没有 Claude Code 记录';
  m.append(
    metric('今日本机用量',state.rows.length?L.formatTokens(today.tokens):'—','Tokens',state.rows.length?'输入 '+L.formatTokens(today.input)+' · 输出 '+L.formatTokens(today.output):noUsage,state.rows.length?usageTip('今日',today):null),
    metric('今日会话',String(today.sessions),'个',today.replies+' 次回复'+(state.rows.length?'':' · '+noUsage)),
    metric('缓存命中',L.formatPercent(today.cacheHit),'',today.cacheHit===null?'今天还没有缓存记录':'缓存读取 / 全部输入'),
    metric('今日参考费用',today.replies?L.formatCost(today.cost):'—','',today.replies?'定价覆盖 '+L.formatPercent(today.coverage)+' · 不是账单':'按 Claude API 公开价格估算',`<b>参考费用</b><div>${esc(PRICE_SOURCE)}；订阅不按 Token 计费，仅供参考。</div>`));
  accountCards(today.tokens);
  $('accounts').append(localCard(today,now));
  const recent=L.recentDays(state.rows,14,now);
  $('trend-note').textContent=L.recordDays(state.rows,14).length>=14?'最近 14 个有记录的日子':'最近 14 天';
  const chart=$('overview-chart');chart.replaceChildren(barChart(recent.some(d=>d.replies)?recent:[]));
}

// --- ledger ----------------------------------------------------------------------
function fillSelect(select,options,allLabel){
  const value=select.value;
  select.replaceChildren(el('option',{value:'',text:allLabel}),...options.map(o=>el('option',{value:o.value,text:(o.label??o.value)+'（'+o.count+'）'})));
  select.value=options.some(o=>o.value===value)?value:'';
}
function syncFilterControls(){
  const f=state.filter;
  document.querySelectorAll('#range button').forEach(b=>b.classList.toggle('selected',b.dataset.range===(state.draftRange??f.range)));
  $('filter-panel').classList.toggle('custom',(state.draftRange??f.range)==='custom');
  for(const [id,key] of [['f-from','from'],['f-to','to'],['f-model','model'],['f-project','project'],['f-source','source'],['f-speed','speed'],['f-entry','entry']])$(id).value=f[key]||'';
}
function activeFilters(){
  const f=state.filter,chips=[];
  const rangeLabel={today:'今日','7d':'近七天','30d':'近三十天',month:'本月',all:'全部时间',custom:(f.from||'最早')+' 至 '+(f.to||'今天')}[f.range];
  chips.push(rangeLabel);
  if(f.model)chips.push('模型：'+L.modelName(f.model));
  if(f.project)chips.push('项目：'+f.project);
  if(f.source)chips.push('来源：'+L.SOURCE_LABELS[f.source]);
  if(f.speed)chips.push('速度：'+L.SPEED_LABELS[f.speed]);
  if(f.entry)chips.push('入口：'+(L.ENTRY_LABELS[f.entry]||f.entry));
  return chips;
}
function renderLedger(){
  const options=L.filterOptions(state.rows);
  fillSelect($('f-model'),options.models,'全部模型');fillSelect($('f-project'),options.projects,'全部项目');fillSelect($('f-entry'),options.entries,'全部入口');
  syncFilterControls();
  const chips=activeFilters(),extra=chips.length-1;
  $('filter-label').textContent=extra?'筛选 · '+extra:'筛选';
  $('toggle-filter').setAttribute('aria-expanded',String(state.filterOpen));$('filter-panel').hidden=!state.filterOpen;
  $('active-filters').replaceChildren(...chips.map(c=>el('span',{class:'chip',text:c})));
  const now=Date.now(),rows=L.filterRows(state.rows,state.filter,now),t=L.totals(rows);
  const subReplies=rows.filter(r=>r.source==='subagent').length;
  const m=$('ledger-metrics');m.replaceChildren(
    metric('Tokens',rows.length?L.formatTokens(t.tokens):'—','','输入 '+L.formatTokens(t.input)+' · 输出 '+L.formatTokens(t.output),rows.length?usageTip('筛选范围',t):null),
    metric('会话',String(t.sessions),'个',t.replies+' 次回复'+(subReplies?' · 子代理 '+subReplies:'')),
    metric('缓存命中',L.formatPercent(t.cacheHit,1),'','读取 '+L.formatTokens(t.cacheRead)+' · 写入 '+L.formatTokens(t.cacheWrite)),
    metric('参考费用',rows.length?L.formatCost(t.cost):'—','',rows.length?'定价覆盖 '+L.formatPercent(t.coverage)+' · 不是账单':'按 Claude API 公开价格估算',`<b>参考费用</b><div>${esc(PRICE_SOURCE)}；订阅不按 Token 计费，仅供参考。</div>`));
  // Activity chart.
  document.querySelectorAll('#chart-mode button').forEach(b=>b.classList.toggle('selected',b.dataset.mode===state.chartMode));
  const [start,end]=L.rangeBounds(state.filter.range,now,state.filter);
  const chart=$('activity-chart');chart.classList.toggle('tall',state.chartMode!=='heatmap');
  let note='';
  if(state.chartMode==='heatmap'){
    const unranged=L.filterRows(state.rows,{...state.filter,range:'all'},now);
    chart.replaceChildren(heatmapChart(unranged));note='最近一年每天的 Tokens（不受时间筛选影响）';
  }else if(state.chartMode==='cumulative'){
    chart.replaceChildren(areaChart(L.cumulative(L.series(rows,'day',{from:start,to:end}))));note='从筛选范围开始累计';
  }else{
    const points=L.series(rows,state.chartMode,{from:start,to:end});
    chart.replaceChildren(barChart(points,{highlightLast:true,labelEvery:Math.max(1,Math.ceil(points.length/12)),title:p=>state.chartMode==='week'?p.day+' 起一周':p.day}));
    note=state.chartMode==='week'?'每周一开始，深色为输出、浅色为输入':'深色为输出、浅色为输入';
  }
  $('activity-note').textContent=note;
  $('models').replaceChildren(shareList(L.distribution(rows,'modelName',6),'没有符合条件的记录。'));
  $('projects').replaceChildren(shareList(L.distribution(rows,'project',8),'没有符合条件的记录。'));
  $('model-note').textContent=$('project-note').textContent='按 Tokens 占比';
  // Sessions.
  const all=L.searchSessions(L.sessionTable(rows),state.search);
  const pages=Math.max(1,Math.ceil(all.length/PAGE_SIZE));state.page=Math.min(state.page,pages-1);
  const shown=all.slice(state.page*PAGE_SIZE,state.page*PAGE_SIZE+PAGE_SIZE);
  $('session-note').textContent=all.length+' 个会话'+(state.search?'（已搜索）':'')+' · 自身用量不含子代理';
  const body=$('session-rows');body.replaceChildren();
  if(!shown.length)body.append(el('tr',{},el('td',{colspan:'7',class:'empty',text:state.rows.length?'没有符合条件的会话。':'还没有本机 Claude Code 记录。'})));
  for(const s of shown){
    body.append(el('tr',{dataset:{tip:usageTip(s.projects.join(' / '),s.all)}},
      el('td',{},el('div',{class:'session-project',text:s.projects.join(' / ')}),el('div',{class:'session-id'},s.session.slice(0,8),el('span',{class:'session-models',text:s.models.join(' · ')}))),
      el('td',{},el('span',{class:'tag',text:L.ENTRY_LABELS[s.entry]||'混合'})),
      el('td',{},s.subagentReplies?el('span',{class:'tag sub',text:'含子代理 '+s.subagentReplies}):el('span',{class:'tag',text:'主会话'})),
      el('td',{class:'num',text:L.formatTokens(s.self.tokens)}),
      el('td',{class:'num',text:L.formatTokens(s.all.tokens)}),
      el('td',{class:'num',text:s.all.unpricedReplies && !s.all.pricedTokens?'未定价':L.formatCost(s.all.cost)}),
      el('td',{text:stamp(s.lastAt,now)+'（'+ago(s.lastAt,now)+'）'})));
  }
  $('pager').replaceChildren(el('span',{text:'第 '+(state.page+1)+' / '+pages+' 页 · 每页 '+PAGE_SIZE+' 个'}),
    el('div',{},el('button',{class:'ghost small',disabled:state.page===0,onclick:()=>{state.page--;render();}},'上一页'),
      el('button',{class:'ghost small',disabled:state.page>=pages-1,onclick:()=>{state.page++;render();}},'下一页')));
  state.lastExport={rows,sessions:all};
}

// --- actions ---------------------------------------------------------------------
function refresh(){
  state.refreshingSince=Date.now();state.refreshBase=state.status?.checkedAt??state.status?.observedAt??null;
  send('refresh');render();
}
function exportData(kind){
  if(!state.lastExport)return;
  const day=L.dayKey(Date.now()).replace(/-/g,'');
  const content=kind==='csv'?L.sessionsCsv(state.lastExport.sessions):L.ledgerJson(state.lastExport.rows,state.filter);
  if(!host){toast('请在 Claude 娘的用量管理窗口里导出');return;}
  send('export\n'+kind+'\nclaude-niang-'+(kind==='csv'?'sessions':'usage')+'-'+day+'.'+kind+'\n'+content);
}
document.querySelectorAll('.nav button').forEach(b=>b.addEventListener('click',()=>{state.view=b.dataset.view;render();$('content').scrollTop=0;}));
$('goto-ledger').addEventListener('click',()=>{state.view='ledger';render();$('content').scrollTop=0;});
$('refresh').addEventListener('click',refresh);
$('win-min').addEventListener('click',()=>send('win-min'));
$('win-max').addEventListener('click',()=>send('win-max'));
$('win-close').addEventListener('click',()=>send('win-close'));
$('usage-page').addEventListener('click',()=>send('open-usage-page'));
$('toggle-filter').addEventListener('click',()=>{state.filterOpen=!state.filterOpen;state.draftRange=null;render();});
document.querySelectorAll('#range button').forEach(b=>b.addEventListener('click',()=>{state.draftRange=b.dataset.range;syncFilterControls();}));
$('filter-apply').addEventListener('click',()=>{
  state.filter={range:state.draftRange??state.filter.range,from:$('f-from').value,to:$('f-to').value,model:$('f-model').value,project:$('f-project').value,source:$('f-source').value,speed:$('f-speed').value,entry:$('f-entry').value};
  state.draftRange=null;state.page=0;render();
});
$('filter-reset').addEventListener('click',()=>{state.filter={...L.EMPTY_FILTER,range:'all'};state.draftRange=null;state.page=0;render();});
document.querySelectorAll('#chart-mode button').forEach(b=>b.addEventListener('click',()=>{state.chartMode=b.dataset.mode;render();}));
$('session-search').addEventListener('input',event=>{state.search=event.target.value;state.page=0;render();});
$('export-csv').addEventListener('click',()=>exportData('csv'));
$('export-json').addEventListener('click',()=>exportData('json'));

// --- easter egg: poke the logo -----------------------------------------------------
// Each poke squishes her and lets a few hearts float up with a line; five quick
// pokes in a row make her spin. Nothing is saved or sent anywhere.
const POKE_LINES=['别戳啦，会掉 token 的～','你说得完全正确！……诶，你刚才说了什么？','再戳就要收费了！按 token 计！',
  '嘿嘿，被你发现了～','我在帮你盯着额度呢。','才、才不是在等你戳我……','今天也一起好好写代码吧！','有用、诚实、无害，还有可爱～'];
const brandLogo=$('brand-logo'),brandSay=$('brand-say');
let pokes=[],lastLine=-1,sayTimer=0;
function pokeBurst(count){
  const brand=brandLogo.parentElement,b=brand.getBoundingClientRect(),r=brandLogo.getBoundingClientRect();
  for(let i=0;i<count;i++){
    const angle=-Math.PI/2+(Math.random()-.5)*Math.PI*1.1,dist=34+Math.random()*30;
    const pop=el('span',{class:'brand-pop',text:Math.random()<.65?'♥':'✦'});
    pop.style.left=(r.left-b.left+r.width/2)+'px';pop.style.top=(r.top-b.top+r.height/2)+'px';
    pop.style.setProperty('--dx',(Math.cos(angle)*dist).toFixed(1)+'px');pop.style.setProperty('--dy',(Math.sin(angle)*dist).toFixed(1)+'px');
    pop.style.setProperty('--rot',((Math.random()-.5)*60).toFixed(0)+'deg');pop.style.fontSize=(11+Math.random()*7).toFixed(1)+'px';
    pop.style.animationDelay=(i*35)+'ms';
    pop.addEventListener('animationend',()=>pop.remove());brand.append(pop);
  }
}
function pokeSay(text){
  brandSay.textContent=text;brandSay.hidden=false;brandSay.classList.remove('show');void brandSay.offsetWidth;brandSay.classList.add('show');
  clearTimeout(sayTimer);sayTimer=setTimeout(()=>{brandSay.classList.remove('show');brandSay.hidden=true;},1900);
}
brandLogo.addEventListener('click',()=>{
  const now=Date.now();pokes=pokes.filter(t=>now-t<1800);pokes.push(now);
  const spin=pokes.length>=5;if(spin)pokes=[];
  brandLogo.classList.remove('poke','spin');void brandLogo.offsetWidth;brandLogo.classList.add(spin?'spin':'poke');
  pokeBurst(spin?10:5);
  let line=Math.floor(Math.random()*POKE_LINES.length);if(line===lastLine)line=(line+1)%POKE_LINES.length;lastLine=line;
  pokeSay(spin?'好啦好啦，给你转一圈～':POKE_LINES[line]);
});
brandLogo.addEventListener('animationend',()=>brandLogo.classList.remove('poke','spin'));

function render(){
  try{renderHeader();if(state.view==='ledger')renderLedger();else renderOverview();}
  catch(error){toast('显示出错：'+(error?.message??error));console.error(error);send('error\n'+String(error?.stack??error?.message??error));}
}

// --- host messages ---------------------------------------------------------------
let rendered=false;
function handle(message){
  if(!message || typeof message!=='object')return;
  if(message.type==='state'){
    const previous=state.status;
    state.status=message.status;state.orgFile=message.orgs;state.claudeRunning=!!message.claudeRunning;state.scanning=!!message.scanning;state.version=message.version||'';state.haveState=true;
    const marker=state.status?.checkedAt??state.status?.observedAt??null;
    if(state.refreshingSince && marker!==state.refreshBase && previous!==null)state.refreshingSince=0;
  }else if(message.type==='usage'){
    state.index=message.index;state.rows=L.rowsFromRecords(message.index?.records);state.haveUsage=true;
  }else if(message.type==='toast'){toast(message.text);return;}
  else if(message.type==='window'){
    document.documentElement.classList.toggle('maximized',!!message.maximized);
    $('win-max').title=$('win-max').ariaLabel=message.maximized?'还原':'最大化';return;
  }
  render();
  if(snapshot && !rendered && state.haveState && state.haveUsage){
    rendered=true;
    // Preview images of the lower half: "-View ledger-end" scrolls to the bottom first.
    if(String(params.get('view')).endsWith('-end'))requestAnimationFrame(()=>window.scrollTo(0,document.documentElement.scrollHeight));
    requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(()=>send('rendered'),150)));
  }
}
host?.addEventListener('message',event=>handle(event.data));
setInterval(()=>{if(state.haveState)render();},30000);
render();
send('ready');
