// Keeps temporary files and this computer's personal details out of commits and
// pushes. Rules and how to handle a finding: .claude/skills/commit-hygiene/SKILL.md
//   --staged  check what is staged (pre-commit hook)
//   --push    check every commit that no remote has yet (pre-push hook, ref lines on stdin)
//   --all     check every tracked file (CI and manual runs)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const forbiddenPaths=[
  [/(^|\/)installation\.json$/i,'安装记录'],
  [/(^|\/)install-log\.txt$/i,'安装日志'],
  [/(^|\/)claude-desktop-mcp\.json$/i,'本机扩展配置'],
  [/(^|\/)claude-niang-launcher\.exe/i,'本机编译的启动程序'],
  [/(^|\/)(state|webview|cache|node_modules|dist|\.build-[^/]*)\//i,'运行数据或构建产物'],
  [/(^|\/)(temp|tmp|scratch|scratchpad)\//i,'临时目录'],
  [/\.(tmp|temp|bak|log|swp|lnk)$/i,'临时文件'],
  [/\.(mcpb|zip|sha256)$/i,'发布附件（由发布工作流生成）'],
  [/(^|\/)\.env(\.[^/]*)?$/i,'环境变量文件'],
  [/(^|\/)\.claude\/(?!skills\/)/i,'Claude 本机配置（.claude 里只提交 skills）'],
  [/(^|\/)(Thumbs\.db|\.DS_Store|desktop\.ini)$/i,'系统生成的文件'],
];
export function checkPath(file){
  return forbiddenPaths.filter(([pattern])=>pattern.test(file)).map(([,reason])=>reason);
}

const email=/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const allowedEmail=/^(?:noreply@anthropic\.com|noreply@github\.com|git@github\.com|[^@\s]+@users\.noreply\.github\.com|[^@\s]+@(?:[\w-]+\.)*(?:example\.(?:com|org|net)|example|test|invalid|localhost))$/i;
const genericRules=[
  // Home folders name the Windows account. Placeholders such as <用户名>, %USERNAME%,
  // "example" or a single letter in tests are fine.
  [/\b[A-Za-z]:[\\/]+(?:Users|Documents and Settings)[\\/]+(?![<%$\{]|(?:Public|Default|All Users|runneradmin|example)(?:[\\/"'`\s]|$))[^\\/\s"'`<>|:*?]{2,}/gi,'带用户名的本机路径'],
  [/(?<![\w.:\/-])\/(?:[A-Za-z]\/)?(?:Users|home)\/(?![<$\{]|(?:Shared|runner|runneradmin|example)(?:[\/"'`\s]|$))[^\/\s"'`<>|:*?]{2,}/g,'带用户名的本机路径'],
  [/sk-ant-[A-Za-z0-9_-]{16,}/g,'Anthropic 密钥'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/g,'GitHub 令牌'],
  [/\bgithub_pat_[A-Za-z0-9_]{40,}/g,'GitHub 令牌'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/g,'私钥'],
  [/\bAKIA[0-9A-Z]{16}\b/g,'云服务密钥'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g,'Slack 令牌'],
  [/\b(?:sessionKey|__Secure-next-auth\.session-token|cf_clearance)\s*[=:]\s*["']?[A-Za-z0-9%._-]{24,}/gi,'登录 Cookie'],
];
const escapeRegex=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function literalRule(value,reason){
  return [new RegExp('(?<![\\w-])'+escapeRegex(value)+'(?![\\w-])','gi'),reason];
}
export function identityProblem(address){
  return /^[^@\s]+@users\.noreply\.github\.com$/i.test(address) || /^noreply@github\.com$/i.test(address)?null:'邮箱不是 GitHub noreply 地址';
}

// Markers that only make sense on this computer: its name, the folders that
// hold this checkout, the configured commit email and the personal list kept in
// .git/info/hygiene-patterns (inside .git, so it is never committed).
export function machineRules(root,{hostname=os.hostname(),userEmail='',patterns=[]}={}){
  const rules=[];
  if(hostname && hostname.length>=4 && !/^localhost$/i.test(hostname))rules.push(literalRule(hostname,'电脑名'));
  for(let dir=path.resolve(root);;){
    const parent=path.dirname(dir);
    if(parent===dir)break;
    const drive=/^([A-Za-z]):[\\/](.*)$/.exec(dir);
    const forms=drive?[dir.replace(/\//g,'\\'),dir.replace(/[\\/]/g,'\\\\'),dir.replace(/\\/g,'/'),'/'+drive[1].toLowerCase()+'/'+drive[2].replace(/\\/g,'/')]:[dir];
    for(const form of new Set(forms))rules.push(literalRule(form,'本机文件夹路径'));
    dir=parent;
  }
  if(userEmail && identityProblem(userEmail))rules.push(literalRule(userEmail,'私人邮箱'));
  for(const raw of patterns){
    const line=raw.trim();
    if(!line || line.startsWith('#'))continue;
    rules.push(line.startsWith('re:')?[new RegExp(line.slice(3),'gi'),'个人规则']:literalRule(line,'个人规则'));
  }
  return rules;
}

const mask=value=>value.length<=6?value[0]+'…':value.slice(0,4)+'…（'+value.length+' 字符）';
export function scanText(text,rules=[]){
  const findings=[];
  const lines=text.split(/\r?\n/);
  lines.forEach((line,index)=>{
    for(const [pattern,reason] of [...genericRules,...rules]){
      pattern.lastIndex=0;
      for(const match of line.matchAll(pattern))findings.push({line:index+1,reason,sample:mask(match[0])});
    }
    email.lastIndex=0;
    for(const match of line.matchAll(email)){
      if(!allowedEmail.test(match[0]))findings.push({line:index+1,reason:'邮箱地址',sample:mask(match[0])});
    }
  });
  return findings;
}
const isBinary=buffer=>buffer.subarray(0,8000).includes(0);

export function parseRaw(output){
  // `git diff --raw -z --no-abbrev`: ":old new oldSha newSha status\0path\0"
  const tokens=output.split('\0'),entries=[];
  for(let i=0;i+1<tokens.length;i+=2){
    const meta=tokens[i].split(' ');
    if(!meta[0].startsWith(':'))break;
    if(meta[1]==='160000')continue;
    entries.push({sha:meta[3],file:tokens[i+1]});
  }
  return entries;
}

function run(root,mode,stdin){
  const git=(args,encoding='utf8')=>execFileSync('git',args,{cwd:root,encoding:encoding==='buffer'?undefined:encoding,maxBuffer:512*1024*1024,stdio:['ignore','pipe','pipe']});
  const optional=args=>{try{return git(args).trim();}catch{return '';}};
  const local=!process.env.GITHUB_ACTIONS;
  let patterns=[];
  const patternFile=optional(['rev-parse','--git-path','info/hygiene-patterns']);
  if(local && patternFile){
    const file=path.resolve(root,patternFile);
    if(fs.existsSync(file))patterns=fs.readFileSync(file,'utf8').split(/\r?\n/);
  }
  const rules=local?machineRules(root,{userEmail:optional(['config','user.email']),patterns}):[];
  const problems=[],checked=new Set();
  const checkData=(data,file,where='')=>{
    for(const reason of checkPath(file))problems.push(where+file+'  '+reason);
    if(!data || isBinary(data))return;
    for(const item of scanText(data.toString('utf8'),rules))problems.push(where+file+':'+item.line+'  '+item.reason+'  「'+item.sample+'」');
  };
  const checkBlob=(sha,file,where='')=>{
    if(checked.has(sha+'\0'+file))return;
    checked.add(sha+'\0'+file);
    checkData(git(['cat-file','blob',sha],'buffer'),file,where);
  };
  if(mode==='--staged'){
    for(const entry of parseRaw(git(['diff','--cached','--raw','-z','--no-renames','--no-abbrev','--diff-filter=ACMRT'])))checkBlob(entry.sha,entry.file);
  }else if(mode==='--all'){
    // Tracked files as they are on disk now, which is what the next commit will contain.
    for(const file of git(['ls-files','-z']).split('\0').filter(Boolean)){
      const full=path.join(root,...file.split('/'));
      checkData(fs.existsSync(full) && fs.statSync(full).isFile()?fs.readFileSync(full):null,file);
    }
  }else if(mode==='--push'){
    const commits=new Set();
    for(const line of stdin.split(/\r?\n/).filter(Boolean)){
      const [,localSha,,remoteSha]=line.split(' ');
      if(!localSha || /^0+$/.test(localSha))continue;
      const args=['rev-list',localSha];
      if(remoteSha && !/^0+$/.test(remoteSha) && optional(['cat-file','-t',remoteSha])==='commit')args.push('^'+remoteSha);
      args.push('--not','--remotes');
      for(const sha of git(args).split(/\s+/).filter(Boolean))commits.add(sha);
    }
    for(const sha of commits){
      const short=sha.slice(0,7);
      const [authorEmail,committerEmail,message]=git(['log','-1','--format=%ae%x00%ce%x00%B',sha]).split('\0');
      const author=identityProblem(authorEmail),committer=identityProblem(committerEmail);
      if(author)problems.push('提交 '+short+'  作者'+author+'  「'+mask(authorEmail)+'」');
      if(committer)problems.push('提交 '+short+'  提交者'+committer+'  「'+mask(committerEmail)+'」');
      for(const item of scanText(message??'',rules))problems.push('提交 '+short+' 的说明第 '+item.line+' 行  '+item.reason+'  「'+item.sample+'」');
      for(const entry of parseRaw(git(['diff-tree','-r','-m','--root','--no-commit-id','--raw','-z','--no-renames','--no-abbrev','--diff-filter=ACMRT',sha])))checkBlob(entry.sha,entry.file,'提交 '+short+'  ');
    }
  }else throw new Error('Use --staged, --push or --all');
  return [...new Set(problems)];
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const mode=process.argv[2];
  const problems=run(root,mode,mode==='--push'?fs.readFileSync(0,'utf8'):'');
  if(problems.length){
    console.error('提交检查没有通过：发现临时文件或个人信息。');
    for(const problem of problems)console.error('  '+problem);
    console.error('处理：删掉这些内容或改成占位写法（如 %USERPROFILE%、<用户名>），重新 git add 后再提交。');
    console.error('提交身份：本仓库用 GitHub noreply 邮箱，git config user.email <编号>+<用户名>@users.noreply.github.com');
    console.error('规则说明：.claude/skills/commit-hygiene/SKILL.md');
    process.exit(1);
  }
  if(mode==='--all')console.log('提交检查通过。');
}
