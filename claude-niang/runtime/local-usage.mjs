import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {atomicJson} from './claude-usage.mjs';
import {readJson} from './shared.mjs';

// Local Claude Code usage for the account overview.
// Claude Code writes one JSON line per event to <config>/projects/**/*.jsonl.
// Replies carry message.usage (input, output, cache write, cache read tokens)
// and the model. Only those numbers, the time, the model, the project folder's
// name, the session id and the session's title are kept; message text never
// leaves the line parser.
//
// - Incremental: each file is read from where the last scan stopped; a file
//   that shrank or was replaced is read again from the start.
// - Claude Code repeats a reply's usage on every content block (and forks copy
//   whole histories), so replies are counted once per message id.
// - Covers Claude Code sessions on this computer only; claude.ai chats and
//   other devices are not in these files.
// - Conversations of the Claude desktop app: one desktop conversation spans
//   several Claude Code sessions. Its title, whether it is archived and which
//   sessions belong to it come from the app's claude-code-sessions/*.json; a
//   conversation whose file disappears is kept and marked gone (deleted).

export const INDEX_VERSION=3;
export const KEEP_DAYS=400;

export function claudeProjectsDir(env=process.env) {
  const custom=typeof env.CLAUDE_CONFIG_DIR==='string'?env.CLAUDE_CONFIG_DIR.trim():'';
  return path.join(custom || path.join(env.USERPROFILE||os.homedir(),'.claude'),'projects');
}

function childDirs(dir,pattern) {
  try{return fs.readdirSync(dir,{withFileTypes:true}).filter(e=>e.isDirectory() && pattern.test(e.name)).map(e=>path.join(dir,e.name));}catch{return [];}
}
// Where the desktop app keeps its Code conversations: the regular install,
// the packaged (MSIX) install's own data folder and its virtualized AppData.
export function desktopSessionDirs(env=process.env) {
  const dirs=[];
  if(env.APPDATA)dirs.push(path.join(env.APPDATA,'Claude','claude-code-sessions'));
  if(env.LOCALAPPDATA){
    for(const dir of childDirs(path.join(env.LOCALAPPDATA,'Claude-Data'),/^claude_/i))dirs.push(path.join(dir,'claude-code-sessions'));
    for(const dir of childDirs(path.join(env.LOCALAPPDATA,'Packages'),/^Claude_/i))dirs.push(path.join(dir,'LocalCache','Roaming','Claude','claude-code-sessions'));
  }
  return dirs.filter(dir=>{try{return fs.statSync(dir).isDirectory();}catch{return false;}});
}

const cleanText=(value,max=200)=>typeof value==='string' && value.trim()?value.trim().slice(0,max):'';
// One desktop conversation file → {id, title, archived, cli: [Claude Code session ids]}.
export function desktopConversation(data) {
  if(!data || typeof data!=='object' || typeof data.sessionId!=='string' || !data.sessionId)return null;
  const cli=[data.cliSessionId,...(Array.isArray(data.priorCliSessionIds)?data.priorCliSessionIds:[])].filter(id=>typeof id==='string' && id);
  return {id:data.sessionId,title:cleanText(data.title),archived:data.isArchived===true,cli:[...new Set(cli)]};
}

// Reads the desktop conversation files, re-parsing only files that changed.
// Returns null when no folder could be listed, so nothing is marked deleted
// just because the app is missing or a folder was unreadable.
function scanDesktop(dirs,cache) {
  if(!dirs.length)return null;
  const found={},files={};let listed=0;
  const walk=(dir,depth)=>{
    let entries;try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{return false;}
    for(const entry of entries){
      const full=path.join(dir,entry.name);
      if(entry.isDirectory()){if(depth<4)walk(full,depth+1);continue;}
      if(!entry.isFile() || !/^local_.*\.json$/i.test(entry.name))continue;
      let stat;try{stat=fs.statSync(full);}catch{continue;}
      const known=cache?.[full];
      let conversation=known && known.mtimeMs===stat.mtimeMs && known.size===stat.size?known.conversation:undefined;
      if(conversation===undefined){try{conversation=desktopConversation(JSON.parse(fs.readFileSync(full,'utf8')));}catch{conversation=null;}}
      files[full]={mtimeMs:stat.mtimeMs,size:stat.size,conversation};
      if(conversation)found[conversation.id]=conversation;
    }
    return true;
  };
  for(const dir of dirs)if(walk(dir,0))listed++;
  return listed?{found,files}:null;
}

function listTranscripts(root) {
  const files=[];
  const walk=dir=>{
    let entries;try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{return;}
    for(const entry of entries){
      const full=path.join(dir,entry.name);
      if(entry.isDirectory())walk(full);else if(entry.isFile() && entry.name.endsWith('.jsonl'))files.push(full);
    }
  };
  walk(root);
  return files.sort();
}

const count=value=>Number.isFinite(value) && value>0?Math.floor(value):0;
// Project label: the folder the session ran in, without the rest of the path.
function projectOf(line,file,root) {
  if(typeof line.cwd==='string' && line.cwd.trim())return path.basename(line.cwd.trim().replace(/[\\/]+$/,''))||line.cwd.trim();
  return path.relative(root,file).split(path.sep)[0]||'未知项目';
}

// One reply as a compact row (read by runtime/dashboard/ledger.js):
// [time ms, model, project, session, input, output, cache write 5m, cache read,
//  cache write 1h, subagent 0/1, speed 'standard'|'fast'|'', entry point].
export function usageRow(line,file,root) {
  if(!line || typeof line!=='object' || line.type!=='assistant')return null;
  const message=line.message,usage=message?.usage;
  if(!usage || typeof usage!=='object')return null;
  const model=typeof message.model==='string'?message.model:'';
  if(!model || model==='<synthetic>')return null;
  const time=Date.parse(line.timestamp);
  if(!Number.isFinite(time))return null;
  const id=typeof message.id==='string' && message.id?message.id:(typeof line.requestId==='string' && line.requestId?'req:'+line.requestId:null);
  if(!id)return null;
  // Cache writes split by lifetime when Claude Code reports it; otherwise all 5-minute.
  const written=count(usage.cache_creation_input_tokens),split=usage.cache_creation;
  const hour=split && typeof split==='object'?Math.min(written,count(split.ephemeral_1h_input_tokens)):0;
  const sidechain=line.isSidechain===true || /[\\/]subagents[\\/]/i.test(file);
  const speed=usage.speed==='fast'?'fast':usage.speed==='standard'?'standard':'';
  return {key:id,row:[time,model,projectOf(line,file,root),typeof line.sessionId==='string'?line.sessionId:'',
    count(usage.input_tokens),count(usage.output_tokens),written-hour,count(usage.cache_read_input_tokens),hour,sidechain?1:0,speed,
    typeof line.entrypoint==='string'?line.entrypoint.slice(0,40):'']};
}

// Repeated entries of one reply: keep the largest value of each counter (a
// streamed reply's last entry has the final output count) and the first time.
function mergeRow(previous,next) {
  if(!previous)return next;
  const merged=previous.slice();
  merged[0]=Math.min(previous[0],next[0]);
  for(const i of [4,5,6,7,8])merged[i]=Math.max(previous[i]||0,next[i]||0);
  return merged;
}

function readNewLines(file,offset,size) {
  const length=size-offset;
  if(length<=0)return {lines:[],next:offset};
  const fd=fs.openSync(file,'r');
  try{
    const buffer=Buffer.alloc(length);
    const read=fs.readSync(fd,buffer,0,length,offset);
    const text=buffer.subarray(0,read);
    // Only complete lines: a line still being written is read next time.
    const end=text.lastIndexOf(0x0a);
    if(end<0)return {lines:[],next:offset};
    return {lines:text.subarray(0,end).toString('utf8').split('\n'),next:offset+end+1};
  }finally{fs.closeSync(fd);}
}

export function emptyIndex(root) {return {version:INDEX_VERSION,root,files:{},records:{},titles:{},conversations:{},desktopFiles:{}};}

// Version 2 had no titles: keep its rows (some transcripts may be gone) and
// read the existing transcripts once more for their titles.
function upgradeIndex(index,root) {
  if(!index || index.root!==root || !index.files || !index.records)return emptyIndex(root);
  if(index.version===INDEX_VERSION)return index;
  if(index.version===2)return {...emptyIndex(root),records:index.records};
  return emptyIndex(root);
}

export function scanLocalUsage({root=claudeProjectsDir(),index=null,now=Date.now(),desktopDirs=[]}={}) {
  let state=upgradeIndex(index,root);
  state={...state,files:{...state.files},records:{...state.records},titles:{...(state.titles||{})},conversations:{...(state.conversations||{})}};
  const seenFiles=new Set();
  let changedFiles=0,errors=0;
  for(const file of listTranscripts(root)){
    seenFiles.add(file);
    let stat;try{stat=fs.statSync(file);}catch{errors++;continue;}
    const known=state.files[file];
    const restart=!known || stat.size<known.offset || (known.birthtimeMs && stat.birthtimeMs && Math.abs(stat.birthtimeMs-known.birthtimeMs)>1);
    const offset=restart?0:known.offset;
    if(!restart && stat.size===known.size && stat.mtimeMs===known.mtimeMs)continue;
    let chunk;
    try{chunk=readNewLines(file,offset,stat.size);}catch{errors++;continue;}
    changedFiles++;
    for(const text of chunk.lines){
      const usage=text.includes('"usage"'),title=!usage && text.includes('"custom-title"');
      if(!usage && !title)continue;
      let line;try{line=JSON.parse(text);}catch{continue;}
      if(title){
        // The session's name as shown in Claude Code; the latest one wins.
        if(line?.type==='custom-title' && typeof line.sessionId==='string' && cleanText(line.customTitle))state.titles[line.sessionId]=cleanText(line.customTitle);
        continue;
      }
      const found=usageRow(line,file,root);
      if(found)state.records[found.key]=mergeRow(state.records[found.key],found.row);
    }
    state.files[file]={offset:chunk.next,size:stat.size,mtimeMs:stat.mtimeMs,birthtimeMs:stat.birthtimeMs};
  }
  for(const file of Object.keys(state.files))if(!seenFiles.has(file))delete state.files[file];
  // Rows are kept after their file is deleted: the history stays until it ages out.
  const oldest=now-KEEP_DAYS*86400000;
  for(const [key,row] of Object.entries(state.records))if(!Array.isArray(row) || row[0]<oldest)delete state.records[key];
  // Desktop conversations: refresh the ones the app still has; one it no
  // longer has is kept with its last title and marked gone.
  const desktop=scanDesktop(desktopDirs,state.desktopFiles);
  if(desktop){
    state.desktopFiles=desktop.files;
    for(const [id,conversation] of Object.entries(state.conversations))if(!desktop.found[id])state.conversations[id]={...conversation,gone:true};
    for(const [id,conversation] of Object.entries(desktop.found)){
      const before=state.conversations[id];
      state.conversations[id]={title:conversation.title||before?.title||'',archived:conversation.archived,gone:false,cli:[...new Set([...(before?.cli||[]),...conversation.cli])]};
    }
    state.desktopSeen=true;
  }
  // Names are kept only while some row still uses them.
  const used=new Set(Object.values(state.records).map(row=>row[3]));
  for(const id of Object.keys(state.titles))if(!used.has(id))delete state.titles[id];
  for(const [id,conversation] of Object.entries(state.conversations))if(!conversation?.cli?.some(cli=>used.has(cli)))delete state.conversations[id];
  return {index:state,changedFiles,errors,files:seenFiles.size};
}

// --- command line: node local-usage.mjs <installation.json> -------------------
export function refreshLocalUsage(dataDir,{root=claudeProjectsDir(),now=Date.now(),desktopDirs=desktopSessionDirs()}={}) {
  const indexFile=path.join(dataDir,'usage-index.json'),started=Date.now();
  const previous=readJson(indexFile);
  const scan=scanLocalUsage({root,index:previous,now,desktopDirs});
  // Rewrite only when something changed, so the window reloads only then.
  const names=index=>JSON.stringify([index?.titles||{},index?.conversations||{}]);
  const changed=!previous || previous.version!==INDEX_VERSION || scan.changedFiles>0 ||
    Object.keys(previous.files||{}).length!==Object.keys(scan.index.files).length ||
    Object.keys(previous.records||{}).length!==Object.keys(scan.index.records).length ||
    names(previous)!==names(scan.index);
  const index={...scan.index,scannedAt:now};
  if(changed)atomicJson(indexFile,index);
  return {ok:true,changed,replies:Object.keys(index.records).length,files:scan.files,changedFiles:scan.changedFiles,errors:scan.errors,scanMs:Date.now()-started};
}

const isMain=process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isMain){
  const config=readJson(process.argv[2]??'');
  try{
    if(!config?.dataDir)throw new Error('Invalid widget installation configuration');
    process.stdout.write(JSON.stringify(refreshLocalUsage(config.dataDir))+'\n');
  }catch(error){
    process.stdout.write(JSON.stringify({ok:false,error:String(error?.message??error)})+'\n');
    process.exitCode=1;
  }
}
