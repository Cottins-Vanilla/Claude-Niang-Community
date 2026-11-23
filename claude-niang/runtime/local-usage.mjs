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
// name and the session id are kept; message text never leaves the line parser.
//
// - Incremental: each file is read from where the last scan stopped; a file
//   that shrank or was replaced is read again from the start.
// - Claude Code repeats a reply's usage on every content block (and forks copy
//   whole histories), so replies are counted once per message id.
// - Covers Claude Code sessions on this computer only; claude.ai chats and
//   other devices are not in these files.

export const INDEX_VERSION=2;
export const KEEP_DAYS=400;

export function claudeProjectsDir(env=process.env) {
  const custom=typeof env.CLAUDE_CONFIG_DIR==='string'?env.CLAUDE_CONFIG_DIR.trim():'';
  return path.join(custom || path.join(env.USERPROFILE||os.homedir(),'.claude'),'projects');
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

export function emptyIndex(root) {return {version:INDEX_VERSION,root,files:{},records:{}};}

export function scanLocalUsage({root=claudeProjectsDir(),index=null,now=Date.now()}={}) {
  let state=index && index.version===INDEX_VERSION && index.root===root && index.files && index.records?index:emptyIndex(root);
  state={...state,files:{...state.files},records:{...state.records}};
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
      if(!text.includes('"usage"'))continue;
      let line;try{line=JSON.parse(text);}catch{continue;}
      const found=usageRow(line,file,root);
      if(found)state.records[found.key]=mergeRow(state.records[found.key],found.row);
    }
    state.files[file]={offset:chunk.next,size:stat.size,mtimeMs:stat.mtimeMs,birthtimeMs:stat.birthtimeMs};
  }
  for(const file of Object.keys(state.files))if(!seenFiles.has(file))delete state.files[file];
  // Rows are kept after their file is deleted: the history stays until it ages out.
  const oldest=now-KEEP_DAYS*86400000;
  for(const [key,row] of Object.entries(state.records))if(!Array.isArray(row) || row[0]<oldest)delete state.records[key];
  return {index:state,changedFiles,errors,files:seenFiles.size};
}

// --- command line: node local-usage.mjs <installation.json> -------------------
export function refreshLocalUsage(dataDir,{root=claudeProjectsDir(),now=Date.now()}={}) {
  const indexFile=path.join(dataDir,'usage-index.json'),started=Date.now();
  const previous=readJson(indexFile);
  const scan=scanLocalUsage({root,index:previous,now});
  // Rewrite only when something changed, so the window reloads only then.
  const changed=!previous || previous.version!==INDEX_VERSION || scan.changedFiles>0 ||
    Object.keys(previous.files||{}).length!==Object.keys(scan.index.files).length ||
    Object.keys(previous.records||{}).length!==Object.keys(scan.index.records).length;
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
