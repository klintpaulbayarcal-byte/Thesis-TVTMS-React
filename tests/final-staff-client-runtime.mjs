import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { effectivePaymentStatus } from '../src/utils/paymentStatus.js';
import { printPublicTicketQr } from '../src/utils/printQr.js';
import { displayLocation } from '../src/utils/locationLabel.js';
import { canFilePublicDispute } from '../src/utils/publicDispute.js';
import * as format from '../src/utils/format.js';

const partial={status:'unpaid',penalty_amount_at_issue:2000,total_paid:1999,remaining_balance:1};
test('effective settlement overrides stale raw and derived labels without mutating history',()=>{
 assert.equal(effectivePaymentStatus({...partial,payment_status:'unpaid'}),'partially_paid');
 assert.equal(effectivePaymentStatus({...partial,remaining_balance:0}),'paid');
 assert.equal(effectivePaymentStatus({...partial,status:'cancelled'}),'cancelled');
 assert.equal(effectivePaymentStatus({status:'paid',penalty_amount:300,total_paid:0,remaining_balance:300}),'unpaid');
 assert.equal(effectivePaymentStatus({status:'unpaid',penalty_amount:2000,total_paid:1999}),'partially_paid');
 assert.equal(effectivePaymentStatus({status:'unpaid'}),'unpaid');
 assert.equal(partial.status,'unpaid');
});

// Same-tab QR printing uses a minimal fake DOM so the test never opens a browser,
// sends data, or invokes a real operating-system printer.
function qrPrintHarness() {
 const printed = { count: 0, drawn: 0 };
 const events = new Map();
 const makeNode = tag => ({
  tagName: tag.toUpperCase(), children: [], removed: false,
  append(...nodes) { this.children.push(...nodes); },
  remove() { this.removed = true; },
  setAttribute(name, value) { (this.attributes ??= {})[name] = value; },
  getContext: tag === 'canvas' ? () => ({ drawImage: () => printed.drawn++ }) : undefined,
 });
 const body=makeNode('body'),head=makeNode('head');
 const doc={ body, head, createElement:makeNode, getElementById:()=>null };
 const browser={
  document:doc,
  print() { printed.count++; },
  addEventListener(name,fn) { events.set(name,fn); },
  removeEventListener(name) { events.delete(name); },
 };
 return { browser, body, head, printed, events };
}
test('same-tab QR print copies the graphic and isolates a public-only print sheet',()=>{
 const h=qrPrintHarness();
 const canvas={ width:180, height:180 };
 assert.equal(printPublicTicketQr(canvas,'<TEST&ONLY>',h.browser),true);
 assert.equal(h.printed.count,1);
 assert.equal(h.printed.drawn,1);
 assert.equal(h.body.children.length,1);
 const sheet=h.body.children[0];
 assert.equal(sheet.children[1].textContent,'<TEST&ONLY>');
 assert.equal(sheet.children[2].width,180);
 assert.equal(sheet.children[2].height,180);
 assert.ok(h.head.children[0].textContent.includes('@media print'));
 assert.ok(h.head.children[0].textContent.includes('body > *:not('));
 assert.equal(h.events.has('afterprint'),true);
 h.events.get('afterprint')();
 assert.equal(sheet.removed,true);
 assert.equal(h.head.children[0].removed,true);
});
test('QR print rejects missing canvas dimensions and a missing print capability',()=>{
 const h=qrPrintHarness();
 assert.equal(printPublicTicketQr({},'TEST ONLY',h.browser),false);
 assert.equal(printPublicTicketQr({width:100,height:100},'TEST ONLY',{document:h.browser.document}),false);
 assert.equal(h.printed.count,0);
});
test('complete coordinates and incomplete fragments are labeled while human places are preserved',()=>{
 assert.equal(displayLocation('9.882, 123.882664'),'Coordinates: 9.882, 123.882664');
 assert.equal(displayLocation('123.882664'),'Incomplete coordinate: 123.882664');
 assert.equal(displayLocation('Municipal Hall, Calape'),'Municipal Hall, Calape');
});

const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j});return{promise,resolve,reject};};
function harness(api){
 const states=[],refs=[],dependencies=[],effects=[];let index=0,refIndex=0,effectIndex=0;
 const hooks={
  useState(initial){const n=index++;if(!(n in states))states[n]=typeof initial==='function'?initial():initial;return[states[n],next=>states[n]=typeof next==='function'?next(states[n]):next];},
  useRef(initial){const n=refIndex++;return refs[n]??=( {current:initial} );},
  useMemo:fn=>fn(),
  useEffect(fn,deps){const n=effectIndex++;if(!dependencies[n]||deps.some((v,i)=>v!==dependencies[n][i])){dependencies[n]=deps;effects.push(fn);}},
 };
 const bindings={'react':hooks,'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},'react-router-dom':{Link:'Link',useSearchParams:()=>[new URLSearchParams('ticket=TEST-ONLY')]},'../services/api':{API:api},'../utils/format':format,'../utils/publicDispute':{canFilePublicDispute}};
 const output=ts.transpileModule(fs.readFileSync('src/pages/PublicTicketLookup.jsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const exports={};vm.runInNewContext(output,{exports,require:name=>bindings[name]??{default:name.split('/').at(-1)},setTimeout:()=>0,document:{getElementById:()=>null},URLSearchParams});
 const render=()=>{index=0;refIndex=0;effectIndex=0;return exports.default();};
 render();return{render,start:()=>{for(const fn of effects.splice(0))fn();}};
}
function nodes(tree){if(!tree||typeof tree!=='object')return[];return[tree,...[tree.props?.children].flat(Infinity).flatMap(nodes)];}
async function selectedHarness({write,refreshFails=false}){
 const ticket={ticket_number:'TEST-ONLY',plate_number:'TESTQA',status:'unpaid',penalty_amount:300,total_paid:0,remaining_balance:300,dispute_eligible:true,violations:[]};
 let reads=0;const h=harness({publicTicketLookup:async()=>{if(++reads>1&&refreshFails)throw Error('Read failed');return{tickets:[ticket]};},publicDispute:write});
 h.start();await flush();
 const button=nodes(h.render()).find(n=>n.type==='button'&&String(n.props.children).includes('File a Dispute'));
 assert.ok(button);button.props.onClick();
 nodes(h.render()).find(n=>n.type==='textarea').props.onChange({target:{value:'TEST ONLY valid dispute reason'}});
 return h;
}
test('two same-tick clicks send one mutation; uncertain 502 requires another lookup',async()=>{
 let calls=0;const pending=deferred();const h=await selectedHarness({write:()=>{calls++;return pending.promise;}});
 const submit=nodes(h.render()).find(n=>n.type==='form'&&n.props.className==='dispute-form').props.onSubmit;
 const first=submit({preventDefault(){}});await submit({preventDefault(){}});assert.equal(calls,1);
 pending.reject(Object.assign(Error('Request failed (502)'),{status:502}));await first;
 const view=nodes(h.render());assert.ok(!view.some(n=>n.props?.className==='dispute-form'));
 assert.ok(view.some(n=>String(n.props?.children).includes('It may have been saved')));
 assert.ok(!view.some(n=>n.type==='button'&&String(n.props.children).includes('File a Dispute')));
});
test('successful save stays confirmed and ineligible when list refresh fails',async()=>{
 let calls=0;const h=await selectedHarness({write:async()=>{calls++;return{success:true,dispute_id:42};},refreshFails:true});
 await nodes(h.render()).find(n=>n.props?.className==='dispute-form').props.onSubmit({preventDefault(){}});
 const view=nodes(h.render());assert.equal(calls,1);
 assert.ok(view.some(n=>n.props?.type==='success'&&String(n.props.children).includes('successfully')));
 assert.ok(!view.some(n=>n.type==='button'&&String(n.props.children).includes('File a Dispute')));
});
