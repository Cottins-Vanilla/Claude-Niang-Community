import path from 'node:path';
import {atomicJson} from './claude-usage.mjs';
import {readJson} from './shared.mjs';

// The last successful quota of every organization, for the account overview.
// Only the selected organization is ever read; the others keep what was read
// while they were selected, with its time. Tied to one sign-in: a snapshot
// from a previous sign-in (sessionEpoch) is never shown as this account's.

export const ORG_SNAPSHOTS_FILE='org-snapshots.json';
const KEEP=20;

export function orgSnapshotEntry(status) {
  if(!status?.ok || status.queryOk!==true || status.restored || typeof status.selectedOrg!=='string' || !status.selectedOrg)return null;
  if(status.source && status.source!=='claude.ai')return null;
  const windows=(Array.isArray(status.windows)?status.windows:[]).map(w=>({
    kind:w.kind,key:w.key,label:w.label,minutes:w.minutes??null,used:w.used??null,remaining:w.remaining??null,resetsAt:w.resetsAt??null,
    ...(w.kind==='extra'?{usedMinor:w.usedMinor??null,limitMinor:w.limitMinor??null,remainingMinor:w.remainingMinor??null,currency:w.currency??null}:{})}));
  return {uuid:status.selectedOrg,observedAt:status.observedAt,planLabel:status.planLabel??null,planKnown:status.planKnown===true,
    windows,credits:status.credits??null};
}

export function rememberOrganization(dataDir,status,sessionEpoch=null) {
  const entry=orgSnapshotEntry(status);
  if(!entry)return false;
  const file=path.join(dataDir,ORG_SNAPSHOTS_FILE),saved=readJson(file);
  const same=saved && saved.version===1 && (saved.sessionEpoch??null)===(sessionEpoch??null) && saved.orgs && typeof saved.orgs==='object';
  const orgs=same?{...saved.orgs}:{};
  const previous=orgs[entry.uuid];
  if(previous && previous.observedAt>entry.observedAt)return false;
  orgs[entry.uuid]=entry;
  const kept=Object.fromEntries(Object.entries(orgs).sort((a,b)=>(b[1]?.observedAt??0)-(a[1]?.observedAt??0)).slice(0,KEEP));
  atomicJson(file,{version:1,sessionEpoch:sessionEpoch??null,orgs:kept});
  return true;
}

export function forgetOrganizations(dataDir) {
  try{atomicJson(path.join(dataDir,ORG_SNAPSHOTS_FILE),{version:1,sessionEpoch:null,orgs:{}});}catch{}
}
