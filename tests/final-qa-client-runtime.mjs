import * as paymentStatus from '../src/utils/paymentStatus.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { test, after } from 'node:test';
import { apiRequest, apiBlobRequest, API } from '../src/services/api.js';
import * as format from '../src/utils/format.js';

const originalFetch=globalThis.fetch,originalStorage=globalThis.localStorage;
after(()=>{globalThis.fetch=originalFetch;globalThis.localStorage=originalStorage;});
globalThis.localStorage={getItem:()=>null,removeItem:()=>{}};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const bounded=promise=>Promise.race([promise.then(value=>({value}),error=>({error})),new Promise(resolve=>setTimeout(()=>resolve({pending:true}),80))]);

test('F2 read timeout rejects a permanently pending transport without retry',async()=>{
 let calls=0,signal;globalThis.fetch=(_url,opts)=>{calls++;signal=opts.signal;return new Promise(()=>{});};
 const r=await bounded(apiRequest('/tickets/stats',{timeoutMs:10}));
 assert.equal(r.error?.code,'REQUEST_TIMEOUT');assert.equal(calls,1);assert.equal(signal.aborted,true);
});
test('F2 read timeout covers stalled response body consumption',async()=>{
 globalThis.fetch=async()=>({ok:true,status:200,headers:{get:()=> 'application/json'},json:()=>new Promise(()=>{})});
 const r=await bounded(apiRequest('/tickets/stats',{timeoutMs:10}));assert.equal(r.error?.code,'REQUEST_TIMEOUT');
});
test('F2 caller cancellation is honored before sending and while pending',async()=>{
 let calls=0;globalThis.fetch=()=>{calls++;return new Promise(()=>{});};
 const before=new AbortController();before.abort();
 const a=await bounded(apiRequest('/tickets/stats',{signal:before.signal,timeoutMs:10}));assert.equal(a.error?.name,'AbortError');assert.equal(calls,0);
 const during=new AbortController();const pending=apiRequest('/tickets/stats',{signal:during.signal,timeoutMs:200});await flush();during.abort();
 const b=await bounded(pending);assert.equal(b.error?.name,'AbortError');assert.equal(calls,1);
});
test('F2 successful read retains response, authorization and cleans deadline',async()=>{
 let options;globalThis.localStorage={getItem:key=>key==='tvtms_token'?'TEST-ONLY-TOKEN':null};
 globalThis.fetch=async(_url,opts)=>{options=opts;return new Response('{"stats":{"today":14}}',{headers:{'content-type':'application/json'}});};
 assert.deepEqual(await apiRequest('/tickets/stats',{timeoutMs:10}),{stats:{today:14}});
 assert.equal(options.headers.get('Authorization'),'Bearer TEST-ONLY-TOKEN');assert.ok(options.signal);
 await new Promise(resolve=>setTimeout(resolve,20));assert.equal(options.signal.aborted,false);
 globalThis.localStorage={getItem:()=>null,removeItem:()=>{}};
});
test('F2 actual HTTP 401 still clears session and retains API error',async()=>{
 const removed=[];globalThis.localStorage={getItem:()=>null,removeItem:key=>removed.push(key)};
 globalThis.fetch=async()=>new Response('{"message":"Invalid session","errorCode":"INVALID_SESSION"}',{status:401,headers:{'content-type':'application/json'}});
 await assert.rejects(apiRequest('/auth/profile',{timeoutMs:20}),e=>e.status===401&&e.code==='INVALID_SESSION');assert.equal(removed.length,4);
 globalThis.localStorage={getItem:()=>null,removeItem:()=>{}};
});
test('F2 mutation behavior remains unchanged and never auto-retries',async()=>{
 let calls=0,options;globalThis.fetch=async(_url,opts)=>{calls++;options=opts;return new Response('{"ticket":{"id":1}}',{status:201,headers:{'content-type':'application/json'}});};
 assert.deepEqual(await API.createTicket({ticket_number:'TEST-ONLY'}),{ticket:{id:1}});assert.equal(calls,1);assert.equal(options.method,'POST');assert.equal(options.signal,undefined);
});
test('F2 blob downloads time out while consuming a stalled body',async()=>{
 globalThis.fetch=async()=>({ok:true,status:200,blob:()=>new Promise(()=>{})});
 const r=await bounded(apiBlobRequest('/reports/export/pdf',{timeoutMs:10}));assert.equal(r.error?.code,'REQUEST_TIMEOUT');
});

// Execute the actual JSX component with lightweight hook/element bindings.
// This tests effect sequencing and rendered states without a browser or new deps.
function dashboard(api){
 const values=[];let index=0,deps,queued,cleanup;
 const hooks={useState:initial=>{const slot=index++;if(!(slot in values))values[slot]=initial;return[values[slot],next=>{values[slot]=typeof next==='function'?next(values[slot]):next;}];},useMemo:fn=>fn(),useEffect:(fn,nextDeps)=>{if(!deps||nextDeps.some((d,i)=>d!==deps[i])){queued=fn;deps=nextDeps;}}};
 const elements={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
 const bindings={'react':hooks,'react/jsx-runtime':elements,'react-router-dom':{Link:'Link',useNavigate:()=>()=>{}},'../services/api':{API:api},'../context/AuthContext':{useAuth:()=>({user:{name:'TEST ONLY'}})},'../utils/format':format,'../utils/paymentStatus':paymentStatus};
 const output=ts.transpileModule(fs.readFileSync('src/pages/OfficerDashboard.jsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const exports={};vm.runInNewContext(output,{exports,require:name=>bindings[name]??{default:name.split('/').at(-1)},AbortController});
 const render=()=>{index=0;return exports.default();};
 render();return{render,start:()=>{if(queued){cleanup?.();const fn=queued;queued=null;cleanup=fn();}},stop:()=>cleanup?.()};
}
function nodes(tree){if(!tree||typeof tree!=='object')return[];return[tree,...[tree.props?.children].flat(Infinity).flatMap(nodes)];}
test('F1 exact Today figure is used, never the eight recent rows',async()=>{
 const h=dashboard({ticketStats:async()=>({stats:{today:14,total:14}}),tickets:async()=>({tickets:Array.from({length:8},()=>({date_issued:format.manilaDateKey()}))})});h.start();await flush();
 assert.equal(nodes(h.render()).find(n=>n.props?.label==='Tickets Issued Today').props.value,14);h.stop();
});
test('F1 unavailable Today field does not invent a count from recent tickets',async()=>{
 const h=dashboard({ticketStats:async()=>({stats:{total:14}}),tickets:async()=>({tickets:Array.from({length:8},()=>({date_issued:format.manilaDateKey()}))})});h.start();await flush();
 assert.equal(nodes(h.render()).find(n=>n.props?.label==='Tickets Issued Today').props.value,'—');h.stop();
});
test('F2 statistics render while recent tickets are pending',async()=>{
 const recent=deferred();const h=dashboard({ticketStats:async()=>({stats:{today:14,total:14}}),tickets:()=>recent.promise});h.start();await flush();
 assert.ok(nodes(h.render()).some(n=>n.props?.label==='Tickets Issued Today'));h.stop();recent.resolve({tickets:[]});await flush();
});
test('F2 successful recent tickets survive statistics failure and retry is available',async()=>{
 let calls=0;const api={ticketStats:async()=>{calls++;if(calls===1)throw Error('Statistics timeout');return{stats:{today:14,total:14}};},tickets:async()=>({tickets:[{id:42}]})};
 const h=dashboard(api);h.start();await flush();const view=nodes(h.render());
 assert.ok(view.some(n=>n.props?.rows?.[0]?.id===42));
 const retry=view.find(n=>n.type==='button'&&n.props.children==='Retry dashboard');assert.ok(retry);retry.props.onClick();h.render();h.start();await flush();
 assert.equal(nodes(h.render()).find(n=>n.props?.label==='Tickets Issued Today').props.value,14);h.stop();
});
test('F2 unmount aborts both dashboard reads',async()=>{
 const signals=[];const pending=(_filters,options)=>{signals.push(options.signal);return new Promise(()=>{});};
 const h=dashboard({ticketStats:pending,tickets:pending});h.start();assert.equal(signals.length,2);h.stop();assert.ok(signals.every(s=>s.aborted));
});
