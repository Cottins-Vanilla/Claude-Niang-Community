import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {checkPath,scanText,machineRules,identityProblem,parseRaw} from '../../tools/commit-hygiene.mjs';

// Samples are assembled at run time so this file itself passes the check.
const join=(...parts)=>parts.join('');

test('commit hygiene refuses temporary files and machine records but keeps project files',()=>{
  for(const file of ['claude-niang/installation.json','claude-niang/install-log.txt','Temp/notes.txt','a/b/debug.log','x.bak',
    'dist/claude-niang-v2.0.0-windows.zip','claude-niang/state/status.json','.claude/settings.local.json','.env.local','Thumbs.db'])
    assert.ok(checkPath(file).length,file);
  for(const file of ['README.md','.claude/skills/commit-hygiene/SKILL.md','claude-niang/runtime/webview2/x64/WebView2Loader.dll',
    'claude-niang/runtime/worker-state.mjs','claude-niang/tests/fixtures/bundles.mjs','.githooks/pre-commit'])
    assert.deepEqual(checkPath(file),[],file);
});

test('commit hygiene finds home folders, private emails and tokens, and allows placeholders',()=>{
  const bad=[join('C:','\\Users\\','alice\\Desktop'),join('C:','\\\\Users\\\\','alice'),join(' /c/','Users/','alice/code'),join(' /home/','alice/x'),
    join('alice','@','gmail.com'),join('gh','p_','a'.repeat(36)),join('sk-','ant-','b'.repeat(30)),join('sessionKey','=','c'.repeat(40))];
  for(const text of bad)assert.ok(scanText(text).length,text);
  const good=['%LOCALAPPDATA%\\ClaudeNiang\\state',join('C:','\\Users\\','<用户名>\\.claude'),join('C:','\\Users\\','example'),join('C:','\\Users\\','a'),
    '%USERPROFILE%\\.claude\\projects',join('12345+someone','@','users.noreply.github.com'),join('noreply','@','anthropic.com'),join('user','@','example.com'),
    'https://github.com/users/someone','actions/checkout@v4','react@18.3.1','$env:USERPROFILE'];
  for(const text of good)assert.deepEqual(scanText(text),[],text);
  const found=scanText(join('第一行\n邮箱 alice','@','gmail.com'))[0];
  assert.equal(found.line,2);assert.doesNotMatch(found.sample,/gmail/,'findings must not repeat the private value');
});

test('machine rules cover this computer, the checkout folders and the personal pattern list',()=>{
  const root=path.join(path.parse(process.cwd()).root,'Work','Projects','Claude-Niang');
  const rules=machineRules(root,{hostname:'DESKTOP-TEST01',userEmail:join('alice','@','gmail.com'),patterns:['# comment','Alice Example','re:org-[0-9]{4}','']});
  const parent=path.join(path.parse(process.cwd()).root,'Work','Projects');
  for(const text of ['built on DESKTOP-TEST01',parent+'\\Temp\\x.txt',parent.replace(/\\/g,'/')+'/x','signed Alice Example','org-1234',join('mail alice','@','gmail.com')])
    assert.ok(scanText(text,rules).length,text);
  assert.deepEqual(scanText('Claude-Niang README',rules),[],'the repository name alone is public');
});

test('commit identity must be a GitHub noreply address',()=>{
  assert.equal(identityProblem(join('105203863+someone','@','users.noreply.github.com')),null);
  assert.equal(identityProblem(join('noreply','@','github.com')),null);
  assert.ok(identityProblem(join('alice','@','gmail.com')));
});

test('raw diff output is parsed into blob ids and paths',()=>{
  const sha='a'.repeat(40),zero='0'.repeat(40);
  const raw=':000000 100644 '+zero+' '+sha+' A\0README.md\0:160000 160000 '+zero+' '+sha+' M\0vendor/lib\0';
  assert.deepEqual(parseRaw(raw),[{sha,file:'README.md'}]);
});
