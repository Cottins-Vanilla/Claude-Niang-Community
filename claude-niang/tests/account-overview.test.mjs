import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {scanLocalUsage,refreshLocalUsage,claudeProjectsDir,usageRow,INDEX_VERSION} from '../runtime/local-usage.mjs';
import {rememberOrganization,forgetOrganizations,orgSnapshotEntry} from '../runtime/org-snapshots.mjs';
import * as L from '../runtime/dashboard/ledger.js';
import {replyCost,priceKey,PRICES} from '../runtime/dashboard/pricing.js';

const here=path.dirname(fileURLToPath(import.meta.url)),appDir=path.resolve(here,'..');
const scratch=t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cn-overview-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;};
const NOW=new Date(2026,10,23,21,0,0).getTime();
const at=(daysAgo,hour=10)=>new Date(2026,10,23-daysAgo,hour,0,0).toISOString();
// A Claude Code reply line. Text fields are present on purpose: they must never reach the index.
const reply=({id,daysAgo=0,hour=10,model='claude-opus-5-5',input=10,output=100,cw5=0,cw1h=1000,cr=50000,cwd='E:\\Work\\alpha',session='s1',side=false,speed='standard',entry='claude-desktop',text='SECRET REPLY TEXT'})=>JSON.stringify({
  type:'assistant',timestamp:at(daysAgo,hour),cwd,sessionId:session,requestId:'req_'+id,isSidechain:side,entrypoint:entry,
  message:{id,model,role:'assistant',content:[{type:'text',text}],usage:{input_tokens:input,output_tokens:output,cache_creation_input_tokens:cw5+cw1h,
    cache_read_input_tokens:cr,cache_creation:{ephemeral_5m_input_tokens:cw5,ephemeral_1h_input_tokens:cw1h},speed,service_tier:'standard'}}});
const user=(text='SECRET PROMPT')=>JSON.stringify({type:'user',timestamp:at(0),message:{role:'user',content:text}});
function write(root,name,lines){const file=path.join(root,...name.split('/'));fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,lines.map(l=>l+'\n').join(''));return file;}
const rowsOf=(root,now=NOW)=>L.rowsFromRecords(scanLocalUsage({root,now}).index.records);

// --- index ---------------------------------------------------------------------------
test('replies are counted once with source, speed, entry and cache lifetimes; no text is kept',t=>{
  const root=scratch(t);
  write(root,'E--Work-alpha/s1.jsonl',[user(),reply({id:'m1'}),reply({id:'m1'}),reply({id:'m1',output:180}),reply({id:'m2',model:'<synthetic>'}),'{broken json',user()]);
  write(root,'E--Work-alpha/s1/subagents/agent-1.jsonl',[reply({id:'m3',side:true,speed:'fast',entry:'cli',cw5:300,cw1h:0})]);
  write(root,'E--Work-alpha-fork/s2.jsonl',[reply({id:'m1',output:180})]);
  const {index}=scanLocalUsage({root,now:NOW});
  assert.equal(index.version,INDEX_VERSION);
  assert.deepEqual(Object.keys(index.records).sort(),['m1','m3']);
  assert.deepEqual(index.records.m1.slice(4),[10,180,0,50000,1000,0,'standard','claude-desktop'],'final output count wins; 1-hour writes split out');
  assert.deepEqual(index.records.m3.slice(4),[10,100,300,50000,0,1,'fast','cli']);
  assert.doesNotMatch(JSON.stringify(index),/SECRET/);
});

test('a subagent file is a subagent even without the sidechain flag',()=>{
  const row=usageRow(JSON.parse(reply({id:'x'})),'C:\\p\\proj\\abc\\subagents\\agent-1.jsonl','C:\\p');
  assert.equal(row.row[9],1);
});

test('scans are incremental, wait for unfinished lines and restart when a file is replaced',t=>{
  const root=scratch(t);
  const file=write(root,'a/s.jsonl',[reply({id:'b1'})]);
  let scan=scanLocalUsage({root,now:NOW});assert.equal(scan.changedFiles,1);
  scan=scanLocalUsage({root,index:scan.index,now:NOW});assert.equal(scan.changedFiles,0);
  const half=reply({id:'b2'});fs.appendFileSync(file,half.slice(0,40));
  scan=scanLocalUsage({root,index:scan.index,now:NOW});assert.equal(Object.keys(scan.index.records).length,1,'half-written line counted');
  fs.appendFileSync(file,half.slice(40)+'\n');
  scan=scanLocalUsage({root,index:scan.index,now:NOW});assert.deepEqual(Object.keys(scan.index.records).sort(),['b1','b2']);
  fs.writeFileSync(file,reply({id:'b3'})+'\n');
  scan=scanLocalUsage({root,index:scan.index,now:NOW});assert.ok(scan.index.records.b3,'shorter replacement not read from the start');
  fs.rmSync(path.join(root,'a'),{recursive:true});
  scan=scanLocalUsage({root,index:scan.index,now:NOW});
  assert.deepEqual(scan.index.files,{});assert.ok(scan.index.records.b1,'history kept after its file is deleted');
});

test('old rows age out; an index of another folder or version is rebuilt',t=>{
  const root=scratch(t);write(root,'a/s.jsonl',[reply({id:'c1',daysAgo:500}),reply({id:'c2'})]);
  const {index}=scanLocalUsage({root,now:NOW});
  assert.deepEqual(Object.keys(index.records),['c2']);
  assert.deepEqual(scanLocalUsage({root:path.join(root,'missing'),index,now:NOW}).index.records,{});
  assert.ok(scanLocalUsage({root,index:{...index,version:1,records:{old:[1]}},now:NOW}).index.records.c2);
});

// A desktop app conversation file (claude-code-sessions/<account>/<org>/local_*.json).
function desktop(dir,id,{title='',archived=false,cli,prior=[]}){
  return write(dir,'acct/org/'+id+'.json',[JSON.stringify({sessionId:id,cliSessionId:cli,priorCliSessionIds:prior,title,isArchived:archived,initialMessage:'SECRET PROMPT'})]);
}
const titleLine=(session,title)=>JSON.stringify({type:'custom-title',customTitle:title,sessionId:session});

test('conversations: titles, desktop conversations spanning sessions, archived and deleted ones',t=>{
  const dir=scratch(t),root=path.join(dir,'projects'),apps=path.join(dir,'sessions');
  write(root,'a/d1.jsonl',[reply({id:'e1',session:'d1'})]);
  write(root,'a/d2.jsonl',[reply({id:'e2',session:'d2'})]);
  write(root,'a/d3.jsonl',[reply({id:'e3',session:'d3'})]);
  write(root,'a/c1.jsonl',[titleLine('c1','old name'),reply({id:'e4',session:'c1',entry:'cli'}),titleLine('c1','命令行对话')]);
  desktop(apps,'local_A',{title:'桌面对话',cli:'d2',prior:['d1']});
  const gone=desktop(apps,'local_B',{title:'要删的对话',cli:'d3'});
  let {index}=scanLocalUsage({root,now:NOW,desktopDirs:[apps]});
  assert.equal(index.titles.c1,'命令行对话','latest title wins');
  assert.deepEqual(index.conversations.local_A,{title:'桌面对话',archived:false,gone:false,cli:['d2','d1']});
  assert.doesNotMatch(JSON.stringify(index),/SECRET/);
  desktop(apps,'local_A',{title:'桌面对话',archived:true,cli:'d2',prior:['d1']});
  fs.rmSync(gone);
  ({index}=scanLocalUsage({root,index,now:NOW,desktopDirs:[apps]}));
  assert.equal(index.conversations.local_A.archived,true);
  assert.deepEqual(index.conversations.local_B,{title:'要删的对话',archived:false,gone:true,cli:['d3']},'deleted conversation kept with its title');
  ({index}=scanLocalUsage({root,index,now:NOW,desktopDirs:[path.join(dir,'missing')]}));
  assert.equal(index.conversations.local_A.gone,false,'an unreadable app folder marks nothing deleted');
});

test('the conversation share groups sessions and marks archived, deleted and vanished conversations',t=>{
  const dir=scratch(t),root=path.join(dir,'projects'),apps=path.join(dir,'sessions');
  write(root,'E--Work-alpha/d1.jsonl',[reply({id:'f1',session:'d1',output:300})]);
  write(root,'E--Work-alpha/d2.jsonl',[reply({id:'f2',session:'d2',output:300})]);
  write(root,'E--Work-alpha/d3.jsonl',[reply({id:'f3',session:'d3',output:200})]);
  write(root,'E--Work-alpha/d4.jsonl',[reply({id:'f4',session:'d4',output:150})]);
  write(root,'E--Work-alpha/c1.jsonl',[titleLine('c1','命令行对话'),reply({id:'f5',session:'c1',entry:'cli',output:100})]);
  write(root,'E--Work-alpha/c2.jsonl',[reply({id:'f6',session:'c2abcdef99',entry:'cli',output:50})]);
  desktop(apps,'local_A',{title:'桌面对话',cli:'d2',prior:['d1']});
  desktop(apps,'local_B',{title:'归档的对话',archived:true,cli:'d3'});
  const deleted=desktop(apps,'local_C',{title:'删掉的对话',cli:'d4'});
  let {index}=scanLocalUsage({root,now:NOW,desktopDirs:[apps]});
  fs.rmSync(deleted);fs.rmSync(path.join(root,'E--Work-alpha','c2.jsonl'));
  ({index}=scanLocalUsage({root,index,now:NOW,desktopDirs:[apps]}));
  const rows=L.rowsFromRecords(index.records);
  const {lines,counts}=L.conversationShare(rows,index,{mode:'all'});
  const flat=lines.flatMap(x=>x.members||[x]),by=Object.fromEntries(flat.map(x=>[x.name,x]));
  assert.deepEqual(counts,{active:2,all:5});
  assert.equal(lines[0].name,'桌面对话');assert.equal(by['桌面对话'].output,600,'sessions of one desktop conversation are added up');
  assert.equal(by['桌面对话'].state,null);
  assert.equal(by['归档的对话'].state,'archived');
  assert.equal(by['删掉的对话'].state,'deleted');
  assert.equal(by['命令行对话'].state,null);
  assert.equal(by['alpha · c2abcdef'].state,'missing','a session whose transcript is gone is marked');
  // Only conversations in use by default, with shares of all usage.
  const active=L.conversationShare(rows,index).lines;
  assert.deepEqual(active.map(x=>x.name),['桌面对话','命令行对话']);
  assert.ok(active.reduce((s,x)=>s+x.share,0)<1,'shares are of all usage, not of the conversations shown');
  // A desktop session the app never listed (deleted before the scan saw it).
  const unseen=L.conversationIndex(index).of({session:'zz9',entry:'desktop',project:'alpha'});
  assert.equal(unseen.state,'deleted');
  assert.equal(L.conversationIndex({files:{}}).of({session:'zz9',entry:'desktop',project:'alpha'}).state,'missing','without the app nothing is called deleted');
});

test('the conversation share folds older conversations into one group per state, ordered by usage',()=>{
  const conv=(i,state,output)=>({id:'c'+i,state,output});
  const list=[conv(1,null,500),conv(2,null,80),...Array.from({length:7},(_,i)=>conv(10+i,null,10+i)),
    ...Array.from({length:6},(_,i)=>conv(20+i,'deleted',100+i)),conv(30,'archived',5)];
  const records={},conversations={},files={};
  list.forEach((c,i)=>{
    records['m'+i]=[NOW,'claude-opus-5-5','alpha',c.id,0,c.output,0,0,0,0,'standard','claude-desktop'];
    conversations['local_'+c.id]={title:'对话 '+c.id,archived:c.state==='archived',gone:c.state==='deleted',cli:[c.id]};
    files['x/'+c.id+'.jsonl']={};
  });
  const index={records,conversations,files,desktopSeen:true},rows=L.rowsFromRecords(records);
  const active=L.conversationShare(rows,index);
  assert.deepEqual(active.counts,{active:9,all:16});
  assert.equal(active.lines.length,8,'seven conversations and 其他');
  assert.equal(active.lines.at(-1).name,'其他 2 个');assert.ok(active.lines.every(x=>x.kind!=='group'));
  const all=L.conversationShare(rows,index,{mode:'all'}).lines;
  assert.deepEqual(all.map(x=>x.kind==='group'?x.name+'×'+x.count:x.name).slice(0,3),['已删除×6','对话 c1','对话 c2'],'a group sorts by its total like any line');
  const deleted=all.find(x=>x.kind==='group' && x.state==='deleted');
  assert.equal(deleted.output,615);assert.deepEqual(deleted.members.map(x=>x.output),[105,104,103,102,101,100]);
  assert.equal(all.find(x=>x.state==='archived' && x.kind==='group').count,1);
  assert.equal(all.at(-1).name,'其他 2 个','groups do not push conversations into 其他');
  assert.ok(Math.abs(all.reduce((s,x)=>s+x.share,0)-1)<1e-9,'everything adds up to all usage');
});

test('an index from the previous version keeps rows whose transcripts are gone',t=>{
  const root=scratch(t);write(root,'a/s.jsonl',[titleLine('s1','留下的对话'),reply({id:'g1'})]);
  const old={version:2,root,files:{},records:{gone:[NOW-1000,'claude-opus-5-5','alpha','s0',1,2,0,0,0,0,'standard','claude-desktop']}};
  const {index}=scanLocalUsage({root,index:old,now:NOW});
  assert.equal(index.version,INDEX_VERSION);assert.ok(index.records.gone,'old row lost in the upgrade');assert.ok(index.records.g1);
  assert.equal(index.titles.s1,'留下的对话','existing transcripts are read again for titles');
});

test('the command writes the index only when something changed',t=>{
  const dir=scratch(t),root=path.join(dir,'projects'),data=path.join(dir,'state');
  write(root,'a/s.jsonl',[reply({id:'d1'})]);
  const first=refreshLocalUsage(data,{root,now:NOW,desktopDirs:[]});
  assert.equal(first.changed,true);assert.equal(first.replies,1);
  const file=path.join(data,'usage-index.json'),mtime=fs.statSync(file).mtimeMs;
  const second=refreshLocalUsage(data,{root,now:NOW+1000,desktopDirs:[]});
  assert.equal(second.changed,false);assert.equal(fs.statSync(file).mtimeMs,mtime,'unchanged index rewritten');
  assert.doesNotMatch(fs.readFileSync(file,'utf8'),/SECRET/);
  assert.equal(claudeProjectsDir({USERPROFILE:'C:\\Users\\example'}),path.join('C:\\Users\\example','.claude','projects'));
  assert.equal(claudeProjectsDir({USERPROFILE:'C:\\Users\\example',CLAUDE_CONFIG_DIR:'D:\\cc'}),path.join('D:\\cc','projects'));
});

// --- pricing ---------------------------------------------------------------------------
test('reference cost follows the published prices, cache lifetimes, fast mode and Haiku 5.5 long prompts',()=>{
  // Opus 5.5: $4 in, $20 out, $0.20 cache read; 5-minute write 1.25x, 1-hour 2x.
  assert.equal(replyCost('claude-opus-5-5',{input:1e6,output:1e6,cacheWrite5m:1e6,cacheWrite1h:1e6,cacheRead:1e6}),4+20+5+8+0.2);
  assert.equal(replyCost('claude-opus-5-5',{output:1e6,fast:true}),40,'fast mode is 2x');
  assert.equal(replyCost('claude-sonnet-4-5-20250929',{output:1}),null,'unknown model stays unpriced');
  assert.equal(priceKey('claude-haiku-4-5-20251001'),'claude-haiku-4-5');
  const short=replyCost('claude-haiku-5-5',{input:90000,output:1e6});
  const long=replyCost('claude-haiku-5-5',{input:90000,cacheRead:20000,output:1e6});
  assert.ok(Math.abs(short-(0.009+0.5))<1e-9);assert.ok(Math.abs(long-(0.045+0.001+2.5))<1e-9,'over 100K prompt uses the long card');
  for(const [model,card] of Object.entries(PRICES))assert.ok(card.input>0 && card.output>=card.input && card.cacheRead<card.input,model);
});

// --- ledger ----------------------------------------------------------------------------
function sample(t){
  const root=scratch(t);
  write(root,'a/s1.jsonl',[reply({id:'a1',session:'s1'}),reply({id:'a2',daysAgo:1,output:300,session:'s1'}),
    reply({id:'a3',daysAgo:10,model:'claude-sonnet-5-5',cwd:'E:\\Work\\beta',session:'s2',entry:'cli'}),reply({id:'a4',daysAgo:45,output:999,session:'s3'})]);
  write(root,'a/s1/subagents/agent.jsonl',[reply({id:'a5',session:'s1',side:true,model:'claude-haiku-5-5',output:50})]);
  write(root,'b/s4.jsonl',[reply({id:'a6',session:'s4',model:'claude-mystery-1',speed:'fast'})]);
  return rowsOf(root);
}
test('totals keep input + output apart from cache, with hit rate and price coverage',t=>{
  const rows=sample(t),today=L.totals(L.filterRows(rows,{range:'today'},NOW));
  assert.deepEqual([today.tokens,today.input,today.output,today.cacheWrite1h,today.cacheRead,today.replies,today.sessions],[110+60+110,30,250,3000,150000,3,2]);
  assert.ok(Math.abs(today.cacheHit-150000/(30+150000+3000))<1e-12);
  assert.ok(today.coverage<1 && today.coverage>0,'unknown model lowers coverage');
  assert.equal(today.unpricedReplies,1);
});
test('filters: ranges, custom days, model, project, source, speed and entry',t=>{
  const rows=sample(t),n=f=>L.filterRows(rows,f,NOW).length;
  assert.deepEqual([n({range:'today'}),n({range:'7d'}),n({range:'30d'}),n({range:'all'}),n({range:'month'})],[3,4,5,6,5]);
  assert.equal(n({range:'custom',from:L.dayKey(Date.parse(at(1))),to:L.dayKey(Date.parse(at(1)))}),1);
  assert.equal(n({range:'custom',from:'',to:''}),6);
  assert.equal(n({range:'all',model:'claude-sonnet-5-5'}),1);
  assert.equal(n({range:'all',project:'beta'}),1);
  assert.equal(n({range:'all',source:'subagent'}),1);assert.equal(n({range:'all',source:'main'}),5);
  assert.equal(n({range:'all',speed:'fast'}),1);
  assert.equal(n({range:'all',entry:'cli'}),1);assert.equal(n({range:'all',entry:'desktop'}),5);
});
test('charts: record days, calendar fallback, daily/weekly series, cumulative and heatmap',t=>{
  const rows=sample(t);
  assert.deepEqual(L.recordDays(rows,14).map(d=>d.replies),[1,1,1,3]);
  const recent=L.recentDays(rows,14,NOW);
  assert.equal(recent.length,14);assert.equal(recent.at(-1).day,L.dayKey(NOW));assert.equal(recent.at(-1).replies,3);
  const [start,end]=L.rangeBounds('30d',NOW);
  const daily=L.series(L.filterRows(rows,{range:'30d'},NOW),'day',{from:start,to:end,now:NOW});
  assert.equal(daily.length,30,'a named range shows all of its days');assert.equal(daily.at(-1).replies,3);
  const weekly=L.series(rows,'week');assert.ok(weekly.every(w=>new Date(w.start).getDay()===1),'weeks start on Monday');
  assert.equal(weekly.reduce((s,w)=>s+w.replies,0),6);
  const cumulative=L.cumulative(daily);assert.equal(cumulative.at(-1).cumulativeTokens,daily.reduce((s,d)=>s+d.tokens,0));
  const map=L.heatmap(rows,NOW,53);
  assert.equal(map.cells.length,53*7);assert.equal(map.cells.filter(c=>c.tokens>0).length,4,'today, 1, 10 and 45 days ago');
  assert.ok(map.cells.filter(c=>c.future).every(c=>c.tokens===0));assert.ok(map.cells.some(c=>c.level===4));
});
test('distribution and sessions: subagents counted inside their session, search and CSV',t=>{
  const rows=sample(t);
  const models=L.distribution(rows,'modelName',3);
  assert.deepEqual(models.map(m=>m.name),['Opus 5.5','Sonnet 5.5','其他']);
  assert.ok(Math.abs(models.reduce((s,m)=>s+m.share,0)-1)<1e-9);
  const sessions=L.sessionTable(rows);
  const s1=sessions.find(s=>s.session==='s1');
  assert.equal(s1.self.tokens,110+310);assert.equal(s1.all.tokens,110+310+60);assert.equal(s1.subagentReplies,1);
  assert.equal(sessions[0].lastAt>=sessions.at(-1).lastAt,true,'newest first');
  assert.deepEqual(L.searchSessions(sessions,'BETA').map(s=>s.session),['s2']);
  const csv=L.sessionsCsv(sessions);
  assert.ok(csv.startsWith('\uFEFF项目,会话'));assert.equal(csv.trim().split('\r\n').length,1+sessions.length);
  const json=JSON.parse(L.ledgerJson(rows,{range:'all'},NOW));
  assert.equal(json.totals.replies,6);assert.equal(json.sessions.length,4);
  assert.deepEqual(L.filterOptions(rows).entries.map(e=>e.label).sort(),['命令行','桌面端']);
});
test('合计 counts every token, also in the running sum and the heatmap',t=>{
  const root=scratch(t);
  write(root,'a/s.jsonl',[reply({id:'h1',daysAgo:1,input:10,output:100,cw5:5,cw1h:20,cr:1000}),reply({id:'h2',input:1,output:2,cw5:0,cw1h:3,cr:4})]);
  const rows=rowsOf(root);
  assert.equal(L.allTokens(L.totals(rows)),10+100+5+20+1000+1+2+3+4);
  const points=L.cumulative(L.series(rows,'day',{now:NOW}));
  assert.deepEqual(points.map(p=>p.cumulativeAll),[1135,1145]);
  const cells=L.heatmap(rows,NOW).cells.filter(c=>c.all);
  assert.deepEqual(cells.map(c=>[c.tokens,c.all]),[[110,1135],[3,10]]);
});

test('formatting',()=>{
  assert.deepEqual([L.formatTokens(668),L.formatTokens(12345),L.formatTokens(2953000),L.formatTokens(463000000)],['668','1.2 万','295 万','4.63 亿']);
  assert.deepEqual([L.formatCost(null),L.formatCost(0.004),L.formatCost(1234.5)],['未定价','<$0.01','$1,234.50']);
  assert.deepEqual(['claude-opus-5-5','claude-sonnet-4-5-20250929','claude-haiku-5','x'].map(L.modelName),['Opus 5.5','Sonnet 4.5','Haiku 5','x']);
  assert.deepEqual(['claude-desktop','cli','claude-vscode','sdk-ts','',  'mcp'].map(L.entryKind),['desktop','cli','ide','sdk','unknown','other']);
});

// --- organization snapshots ------------------------------------------------------------
test('organization snapshots keep each organization’s last good read for one sign-in only',t=>{
  const dir=scratch(t),file=path.join(dir,'org-snapshots.json'),read=()=>JSON.parse(fs.readFileSync(file,'utf8'));
  const status=(org,used,observedAt,extra={})=>({ok:true,queryOk:true,source:'claude.ai',selectedOrg:org,observedAt,planLabel:'Max 5x',
    windows:[{kind:'session',key:'session',label:'5 小时',minutes:300,used,remaining:100-used,resetsAt:1}],credits:null,orgs:[{uuid:org}],accountKey:'secret',...extra});
  assert.equal(rememberOrganization(dir,status('A',10,100),'epoch1'),true);
  assert.equal(rememberOrganization(dir,status('B',20,200),'epoch1'),true);
  assert.deepEqual(Object.keys(read().orgs).sort(),['A','B']);
  assert.equal(read().orgs.A.windows[0].used,10);assert.equal('accountKey' in read().orgs.A,false);
  assert.equal(rememberOrganization(dir,status('A',5,50),'epoch1'),false,'older read replaced a newer one');
  for(const bad of [status('A',1,300,{ok:false}),status('A',1,300,{queryOk:false}),status('A',1,300,{restored:true}),status('A',1,300,{source:'claude-code'}),status('',1,300)])
    assert.equal(rememberOrganization(dir,bad,'epoch1'),false);
  rememberOrganization(dir,status('C',30,400),'epoch2');
  assert.deepEqual(Object.keys(read().orgs),['C'],'another sign-in starts over');
  forgetOrganizations(dir);assert.deepEqual(read().orgs,{});
  assert.equal(orgSnapshotEntry(null),null);
});

test('the window and page files are installed, released and wired to the menu',()=>{
  const files=JSON.parse(fs.readFileSync(path.join(appDir,'runtime','install-files.json'),'utf8'));
  for(const file of ['runtime/dashboard.ps1','runtime/dashboard-host.ps1','runtime/dashboard-host.cs','runtime/local-usage.mjs','runtime/org-snapshots.mjs',
    'runtime/dashboard/index.html','runtime/dashboard/app.css','runtime/dashboard/app.js','runtime/dashboard/ledger.js','runtime/dashboard/pricing.js'])
    assert.ok(files.includes(file),file);
  for(const file of fs.readdirSync(path.join(appDir,'runtime','dashboard')))assert.ok(files.includes('runtime/dashboard/'+file),'not installed: '+file);
  assert.match(fs.readFileSync(path.join(appDir,'widget.ps1'),'utf8'),/runtime\\dashboard\.ps1/);
  assert.match(fs.readFileSync(path.join(appDir,'runtime','ui-settings.ps1'),'utf8'),/'账户总览' \{Open-WidgetDashboard\}/);
  // Opening speed: the widget hands over what it knows instead of the host parsing
  // JSON, and SmartScreen does not hold back the local page for about two seconds.
  assert.match(fs.readFileSync(path.join(appDir,'runtime','dashboard.ps1'),'utf8'),/'-DataDir',.*'-NodePath',.*'-Version'/s);
  assert.match(fs.readFileSync(path.join(appDir,'runtime','dashboard-host.cs'),'utf8'),/IsReputationCheckingRequired = false/);
  const page=fs.readFileSync(path.join(appDir,'runtime','dashboard','index.html'),'utf8');
  assert.match(page,/Content-Security-Policy/);assert.doesNotMatch(page,/https?:\/\/(?!www\.w3\.org)/,'the page loads nothing from the network');
  assert.doesNotMatch(fs.readFileSync(path.join(appDir,'runtime','dashboard','app.js'),'utf8'),/innerHTML\s*=\s*[^;]*\b(name|project|session)\b/,'names must not go through innerHTML');
});
