import {replyCost} from './pricing.js';

// Everything the usage pages compute from the local index, shared by the page
// (runtime/dashboard/app.js) and the Node tests. Pure functions, no I/O.
//
// Index row (runtime/local-usage.mjs, version 2):
// [time ms, model, project, session, input, output, cache write 5m, cache read,
//  cache write 1h, subagent 0/1, speed 'standard'|'fast'|'', entry point]
// "Tokens" always means input + output; cache tokens are counted separately.

export function modelName(model) {
  const match=/^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/i.exec(String(model));
  if(!match)return String(model||'未知模型');
  return match[1].charAt(0).toUpperCase()+match[1].slice(1).toLowerCase()+' '+match[2]+(match[3]?'.'+match[3]:'');
}

export function entryKind(entry) {
  const value=String(entry||'').toLowerCase();
  if(!value)return 'unknown';
  if(value.includes('desktop'))return 'desktop';
  if(value.includes('vscode') || value.includes('jetbrains') || value.includes('ide'))return 'ide';
  if(value.startsWith('sdk'))return 'sdk';
  if(value==='cli' || value.includes('terminal'))return 'cli';
  return 'other';
}
export const ENTRY_LABELS={desktop:'桌面端',cli:'命令行',ide:'IDE',sdk:'SDK',other:'其他',unknown:'未记录'};
export const SOURCE_LABELS={main:'主会话',subagent:'子代理'};
export const SPEED_LABELS={standard:'标准',fast:'快速',unknown:'未记录'};

export function rowsFromRecords(records) {
  const rows=[];
  for(const row of Object.values(records||{})){
    if(!Array.isArray(row) || !Number.isFinite(row[0]))continue;
    const usage={input:row[4]||0,output:row[5]||0,cacheWrite5m:row[6]||0,cacheRead:row[7]||0,cacheWrite1h:row[8]||0,fast:row[10]==='fast'};
    rows.push({time:row[0],model:String(row[1]||''),modelName:modelName(row[1]),project:String(row[2]||'未知项目'),session:String(row[3]||''),
      ...usage,cacheWrite:usage.cacheWrite5m+usage.cacheWrite1h,tokens:usage.input+usage.output,
      source:row[9]?'subagent':'main',speed:row[10]==='fast'?'fast':row[10]==='standard'?'standard':'unknown',entry:entryKind(row[11]),
      cost:replyCost(row[1],usage)});
  }
  return rows.sort((a,b)=>a.time-b.time);
}

// --- time ----------------------------------------------------------------------
export function dayKey(time) {
  const d=new Date(time),p=n=>String(n).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
}
export function startOfDay(time) {const d=new Date(time);d.setHours(0,0,0,0);return d.getTime();}
export function addDays(time,days) {const d=new Date(time);d.setDate(d.getDate()+days);return d.getTime();}
// Weeks start on Monday.
export function startOfWeek(time) {const day=startOfDay(time),weekday=(new Date(day).getDay()+6)%7;return addDays(day,-weekday);}
function parseDay(value) {
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));
  return m?new Date(Number(m[1]),Number(m[2])-1,Number(m[3])).getTime():null;
}

// [start, end) for a named range or a custom from/to (inclusive days).
export function rangeBounds(range,now=Date.now(),{from=null,to=null}={}) {
  const today=startOfDay(now),tomorrow=addDays(today,1);
  switch(range){
    case 'today':return [today,tomorrow];
    case '7d':return [addDays(today,-6),tomorrow];
    case '30d':return [addDays(today,-29),tomorrow];
    case 'month':{const d=new Date(today);d.setDate(1);return [d.getTime(),tomorrow];}
    case 'custom':{
      const start=parseDay(from),end=parseDay(to);
      return [start??-Infinity,end===null?Infinity:addDays(end,1)];
    }
    default:return [-Infinity,Infinity];
  }
}

export const EMPTY_FILTER={range:'30d',from:'',to:'',model:'',project:'',source:'',speed:'',entry:''};
export function filterRows(rows,filter=EMPTY_FILTER,now=Date.now()) {
  const f={...EMPTY_FILTER,...filter};
  const [start,end]=rangeBounds(f.range,now,f);
  return rows.filter(r=>r.time>=start && r.time<end &&
    (!f.model || r.model===f.model) && (!f.project || r.project===f.project) &&
    (!f.source || r.source===f.source) && (!f.speed || r.speed===f.speed) && (!f.entry || r.entry===f.entry));
}

// --- totals --------------------------------------------------------------------
export function totals(rows) {
  const t={input:0,output:0,cacheWrite5m:0,cacheWrite1h:0,cacheWrite:0,cacheRead:0,tokens:0,replies:0,cost:0,pricedTokens:0,unpricedReplies:0};
  const sessions=new Set();
  for(const r of rows){
    t.input+=r.input;t.output+=r.output;t.cacheWrite5m+=r.cacheWrite5m;t.cacheWrite1h+=r.cacheWrite1h;t.cacheRead+=r.cacheRead;t.replies++;
    if(r.session)sessions.add(r.session);
    if(r.cost===null)t.unpricedReplies++;else{t.cost+=r.cost;t.pricedTokens+=r.tokens;}
  }
  t.cacheWrite=t.cacheWrite5m+t.cacheWrite1h;t.tokens=t.input+t.output;t.sessions=sessions.size;
  const allInput=t.input+t.cacheRead+t.cacheWrite;
  t.cacheHit=allInput>0?t.cacheRead/allInput:null;
  // Share of tokens that have a price; the cost covers only those.
  t.coverage=t.tokens>0?t.pricedTokens/t.tokens:(t.replies && !t.unpricedReplies?1:t.replies?0:null);
  return t;
}

function group(rows,keyOf) {
  const map=new Map();
  for(const r of rows){const key=keyOf(r);if(!map.has(key))map.set(key,[]);map.get(key).push(r);}
  return map;
}

// The last n days that have records (oldest first).
export function recordDays(rows,n=14) {
  const days=[...group(rows,r=>dayKey(r.time)).entries()].sort((a,b)=>a[0]<b[0]?-1:1).slice(-n);
  return days.map(([day,list])=>({day,...totals(list)}));
}

// The overview's trend: the last n days with records, or the last n calendar
// days while there are fewer than n such days (so a new install is not one bar).
export function recentDays(rows,n=14,now=Date.now()) {
  const recorded=recordDays(rows,n);
  if(recorded.length>=n)return recorded;
  const today=startOfDay(now),map=group(rows,r=>dayKey(r.time)),out=[];
  for(let i=n-1;i>=0;i--){const day=dayKey(addDays(today,-i));out.push({day,...totals(map.get(day)||[])});}
  return out;
}

// Every day (or week) of the range, empty ones included. Open-ended ranges
// start at the first record and end at the last one (or today).
export function series(rows,mode='day',{from=null,to=null,now=Date.now()}={}) {
  if(!rows.length)return [];
  const step=mode==='week'?7:1,keyStart=mode==='week'?startOfWeek:startOfDay;
  const first=keyStart(Number.isFinite(from)?from:rows[0].time);
  const last=keyStart(Number.isFinite(to)?Math.min(to-1,Math.max(now,rows.at(-1).time)):rows.at(-1).time);
  const map=group(rows,r=>keyStart(r.time));
  const out=[];
  for(let t=first;t<=last && out.length<800;t=addDays(t,step))out.push({start:t,day:dayKey(t),...totals(map.get(t)||[])});
  return out;
}
export function cumulative(points) {
  let tokens=0,cost=0;
  return points.map(p=>{tokens+=p.tokens;cost+=p.cost;return {...p,cumulativeTokens:tokens,cumulativeCost:cost};});
}

// GitHub-style activity calendar: `weeks` columns ending with the current week.
export function heatmap(rows,now=Date.now(),weeks=53) {
  const end=startOfWeek(now),start=addDays(end,-(weeks-1)*7);
  const byDay=group(rows.filter(r=>r.time>=start),r=>dayKey(r.time));
  const cells=[];let max=0;
  for(let w=0;w<weeks;w++)for(let d=0;d<7;d++){
    const t=addDays(start,w*7+d),key=dayKey(t),list=byDay.get(key)||[];
    const tokens=list.reduce((s,r)=>s+r.tokens,0);max=Math.max(max,tokens);
    cells.push({week:w,weekday:d,day:key,tokens,replies:list.length,future:t>now});
  }
  for(const c of cells)c.level=c.tokens<=0?0:Math.min(4,1+Math.floor(4*c.tokens/(max+1)));
  return {cells,max,weeks,start};
}

// field: a row property, or a function giving each row's group.
export function distribution(rows,field='modelName',limit=6) {
  const keyOf=typeof field==='function'?field:r=>r[field];
  const list=[...group(rows,keyOf).entries()].map(([name,items])=>({name,...totals(items)}))
    .sort((a,b)=>b.tokens-a.tokens || b.replies-a.replies);
  const sum=list.reduce((s,x)=>s+x.tokens,0);
  let shown=list;
  if(list.length>limit){
    const rest=list.slice(limit-1).flatMap(x=>rows.filter(r=>keyOf(r)===x.name));
    shown=[...list.slice(0,limit-1),{name:'其他',other:true,...totals(rest)}];
  }
  return shown.map(x=>({...x,share:sum>0?x.tokens/sum:0}));
}

// --- conversations ------------------------------------------------------------
// A desktop conversation spans several Claude Code sessions (index.conversations,
// from runtime/local-usage.mjs); any other session is a conversation of its own.
export const CONVERSATION_STATES={
  archived:{label:'已归档',note:'这个对话已在 Claude 桌面端归档。'},
  deleted:{label:'已删除',note:'这个对话已从 Claude 桌面端删除，用量记录仍保留。'},
  missing:{label:'记录已消失',note:'本机已没有这个对话的记录文件（被删除或被 Claude Code 自动清理），用量记录仍保留。'}
};
export function conversationIndex(index) {
  const owner=new Map(),present=new Set(),titles=index?.titles||{},conversations=index?.conversations||{},cache=new Map();
  for(const [id,c] of Object.entries(conversations))if(c && Array.isArray(c.cli))for(const cli of c.cli)if(typeof cli==='string' && cli)owner.set(cli,id);
  // A session's transcript is <session>.jsonl; its subagents live under <session>/.
  for(const file of Object.keys(index?.files||{}))for(const part of file.split(/[\\/]/))if(part)present.add(part.replace(/\.jsonl$/i,''));
  const short=id=>id?id.slice(0,8):'无编号';
  function of(row) {
    const session=row.session||'';
    if(cache.has(session))return cache.get(session);
    const id=owner.get(session);
    let info;
    if(id){
      const c=conversations[id],alive=c.cli.some(cli=>present.has(cli));
      info={key:'desktop:'+id,title:c.title||c.cli.map(cli=>titles[cli]).find(Boolean)||row.project+' · '+short(session),
        state:c.gone?'deleted':c.archived?'archived':alive?null:'missing'};
    }else{
      // A desktop session the app no longer lists was deleted there; other
      // sessions are only checked for their transcript.
      const deleted=row.entry==='desktop' && index?.desktopSeen===true;
      info={key:'session:'+session,title:titles[session]||(session?row.project+' · '+short(session):'（无会话编号）'),
        state:deleted?'deleted':session && !present.has(session)?'missing':null};
    }
    cache.set(session,info);
    return info;
  }
  return {of,info:key=>[...cache.values()].find(x=>x.key===key)||null};
}
export function conversationDistribution(rows,index,limit=8) {
  const lookup=conversationIndex(index);
  return distribution(rows,r=>lookup.of(r).key,limit).map(item=>{
    if(item.other)return item;
    const info=lookup.info(item.name);
    return {...item,key:item.name,name:info?.title||item.name,state:info?.state||null};
  });
}

// One line per session: its own replies and the replies of its subagents.
export function sessionTable(rows) {
  return [...group(rows,r=>r.session||'(无会话编号)').entries()].map(([session,items])=>{
    const own=items.filter(r=>r.source==='main'),all=totals(items),self=totals(own);
    const projects=[...new Set(items.map(r=>r.project))],entries=[...new Set(items.map(r=>r.entry))],models=[...new Set(items.map(r=>r.modelName))];
    return {session,project:projects[0],projects,entry:entries.length===1?entries[0]:'mixed',models,
      firstAt:items[0].time,lastAt:items.at(-1).time,self,all,subagentReplies:items.length-own.length};
  }).sort((a,b)=>b.lastAt-a.lastAt);
}
export function searchSessions(list,query) {
  const q=String(query||'').trim().toLowerCase();
  if(!q)return list;
  return list.filter(s=>s.session.toLowerCase().includes(q) || s.projects.some(p=>p.toLowerCase().includes(q)) || s.models.some(m=>m.toLowerCase().includes(q)));
}

export function filterOptions(rows) {
  const count=field=>[...group(rows,r=>r[field]).entries()].map(([value,items])=>({value,count:items.length})).sort((a,b)=>b.count-a.count);
  return {models:count('model').map(x=>({...x,label:modelName(x.value)})),projects:count('project'),entries:count('entry').map(x=>({...x,label:ENTRY_LABELS[x.value]||x.value}))};
}

// --- formatting and export -------------------------------------------------------
export function formatTokens(value) {
  const n=Number(value)||0;
  if(n>=1e8)return (n/1e8).toFixed(n>=1e10?0:2).replace(/\.?0+$/,'')+' 亿';
  if(n>=1e4)return (n/1e4).toFixed(n>=1e6?0:1).replace(/\.0$/,'')+' 万';
  return Math.round(n).toLocaleString('en-US');
}
export function formatCost(value) {
  if(value===null || value===undefined || !Number.isFinite(value))return '未定价';
  if(value>0 && value<0.01)return '<$0.01';
  return '$'+value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
}
export function formatPercent(value,digits=0) {
  return value===null || value===undefined || !Number.isFinite(value)?'—':(value*100).toFixed(digits)+'%';
}

const csvCell=value=>{const s=String(value??'');return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
export function sessionsCsv(list) {
  const head=['项目','会话','入口','模型','开始','最近活动','自身输入','自身输出','自身 Tokens','含子代理 Tokens','缓存写入','缓存读取','子代理回复','参考费用（美元）'];
  const time=t=>{const d=new Date(t),p=n=>String(n).padStart(2,'0');return dayKey(t)+' '+p(d.getHours())+':'+p(d.getMinutes());};
  const lines=list.map(s=>[s.projects.join(' / '),s.session,ENTRY_LABELS[s.entry]||'混合',s.models.join(' / '),time(s.firstAt),time(s.lastAt),
    s.self.input,s.self.output,s.self.tokens,s.all.tokens,s.all.cacheWrite,s.all.cacheRead,s.subagentReplies,
    s.all.unpricedReplies?'':s.all.cost.toFixed(4)].map(csvCell).join(','));
  // A BOM so that Excel opens the Chinese headers as UTF-8.
  return '﻿'+[head.join(','),...lines].join('\r\n')+'\r\n';
}
export function ledgerJson(rows,filter,now=Date.now()) {
  return JSON.stringify({generatedAt:new Date(now).toISOString(),filter,note:'Tokens = 输入 + 输出；费用为按公开 API 价格的参考值，不是账单',
    totals:totals(rows),daily:series(rows,'day').map(({start,...p})=>p),models:distribution(rows,'modelName',99),projects:distribution(rows,'project',99),
    sessions:sessionTable(rows).map(s=>({...s,firstAt:new Date(s.firstAt).toISOString(),lastAt:new Date(s.lastAt).toISOString()}))},null,2);
}
