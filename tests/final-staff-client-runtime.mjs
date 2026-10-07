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

test('QR popup retains its handle, detaches opener and waits for the graphic before print',()=>{
 let markup,opens=0,prints=0;const elements={'ticket-number':{},'ticket-qr':{},'print-qr':{}};
 const popup={opener:{},document:{write:s=>markup=s,close:()=>{},getElementById:id=>elements[id]},focus:()=>{},print:()=>prints++};
 assert.equal(printPublicTicketQr({toDataURL:()=> 'data:image/png;base64,TEST'},'<TEST&ONLY>',(...args)=>{opens++;assert.deepEqual(args,['','_blank']);return popup;}),true);
 assert.equal(opens,1);assert.equal(popup.opener,null);assert.equal(elements['ticket-number'].textContent,'<TEST&ONLY>');
 assert.ok(!markup.includes('<TEST&ONLY>'));assert.ok(markup.includes('no-referrer'));
 assert.equal(elements['ticket-qr'].src,'data:image/png;base64,TEST');assert.equal(prints,0);
 elements['ticket-qr'].onload();assert.equal(prints,1);
 elements['print-qr'].onclick();assert.equal(prints,2);
});
test('actual popup block returns failure without accessing a missing document',()=>{
 assert.equal(printPublicTicketQr({},'TEST ONLY',()=>null),false);
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
