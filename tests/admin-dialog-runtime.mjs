// Execute the actual component handlers with offline API doubles and state hooks.
// No browser sessions, production data, network requests or email are involved.
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import * as paymentDisputeGate from '../src/utils/paymentDisputeGate.js';
const require = createRequire(import.meta.url);

function component(name, API) {
  const state=[]; let cursor=0;
  const named=name=>Object.defineProperty(function(){},'name',{value:name});
  const react={
    useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;
      return [state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value;}];},
    useRef(initial){const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i];},
    useEffect(){},
  };
  const source=fs.readFileSync(`src/pages/${name}.jsx`,'utf8');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,
    jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText;
  const mod={exports:{}};
  const imports=id=>{
    if(id==='react')return react;
    if(id==='react/jsx-runtime')return require(id);
    if(id.endsWith('/services/api'))return {API};
    if(id.endsWith('/context/AuthContext'))return {useAuth:()=>({user:{id:1,role:'admin'}})};
    if(id.endsWith('/utils/paymentDisputeGate'))return paymentDisputeGate;
    if(id.endsWith('/utils/format'))return {firstArray:r=>r.violations||r.disputes||r.payments||r.users||r.data||[],money:String,dateTime:String,manilaDateKey:()=> '2026-10-20'};
    return {__esModule:true,default:named(id.split('/').pop())};
  };
  vm.runInNewContext(js,{require:imports,module:mod,exports:mod.exports,confirm:()=>true});
  return ()=>{cursor=0;return mod.exports.default();};
}
function nodes(root,predicate){
  const out=[];function visit(n){if(!n||typeof n!=='object')return;if(Array.isArray(n)){n.forEach(visit);return;}
    if(predicate(n))out.push(n);visit(n.props?.children);visit(n.props?.footer);}
  visit(root);return out;
}
const type=(root,name)=>nodes(root,n=>n.type===name||n.type?.name===name);
const text=n=>typeof n==='string'?n:Array.isArray(n)?n.map(text).join(''):n?.props?text(n.props.children):'';
const button=(tree,label)=>type(tree,'button').find(n=>text(n)===label);
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('violation editor rejects overlapping Save calls before React rerenders',async()=>{
  let writes=0,release;
  const waiting=new Promise(resolve=>{release=resolve;});
  const render=component('ManageViolations',{createViolation:()=>{writes++;return waiting;},violations:async()=>({violations:[]})});
  button(render(),' Add New Violation').props.onClick();
  // Fill the component through its actual input handlers, rendering between edits.
  let tree=render();type(tree,'input').find(n=>n.props.required).props.onChange({target:{value:'QA-ONLY'}});
  tree=render();type(tree,'input').filter(n=>n.props.required)[1].props.onChange({target:{value:'QA reference'}});
  const save=button(render(),'Save').props.onClick;
  const first=save();const second=save();
  assert.equal(writes,1);release({success:true});await Promise.all([first,second]);
});

test('successful violation deletion keeps a saved-result notice when refresh fails',async()=>{
  let deletes=0;
  const render=component('ManageViolations',{deleteViolation:async()=>{deletes++;},violations:async()=>{throw Error('QA refresh unavailable');}});
  const table=type(render(),'DataTable')[0];
  const action=table.props.columns.find(c=>c.key==='actions').render({id:100,violation_code:'QA-ONLY',is_citation_selectable:false});
  await button(action,'Delete').props.onClick({stopPropagation(){}});
  await tick();assert.equal(deletes,1);
  const notice=type(render(),'Notice')[0];
  assert.equal(notice.props.type,'info');assert.match(text(notice),/deleted.*refresh/i);
});

test('dispute resolution validation is displayed inside the active modal',async()=>{
  let writes=0;
  const render=component('Disputes',{resolveDispute:async()=>{writes++;}});
  const action=type(render(),'DataTable')[0].props.columns.find(c=>c.key==='action').render({id:100,ticket_number:'QA-ONLY',status:'submitted',reason:'QA test'});
  button(action,'Review').props.onClick({stopPropagation(){}});
  let tree=render();type(tree,'Modal')[0].props.children;
  type(type(tree,'Modal')[0],'select')[0].props.onChange({target:{value:'approved'}});
  await button(render(),'Save Decision').props.onClick();
  tree=render();const modal=type(tree,'Modal')[0];
  assert.equal(writes,0);assert.ok(type(modal,'Notice').some(n=>/at least 5 characters/.test(text(n))));
});

test('dispute write errors stay in the dialog and confirmed saves survive refresh failure',async()=>{
  let mode='write-error',writes=0;
  const render=component('Disputes',{
    resolveDispute:async()=>{writes++;if(mode==='write-error')throw Error('QA decision rejected');},
    disputes:async()=>{throw Error('QA refresh unavailable');},
  });
  const open=()=>{const action=type(render(),'DataTable')[0].props.columns.find(c=>c.key==='action').render({id:100,ticket_number:'QA-ONLY',status:'submitted'});
    button(action,'Review').props.onClick({stopPropagation(){}});};
  open();await button(render(),'Save Decision').props.onClick();
  assert.ok(type(type(render(),'Modal')[0],'Notice').some(n=>text(n)==='QA decision rejected'));
  mode='saved';await button(render(),'Save Decision').props.onClick();await tick();
  assert.equal(writes,2);assert.equal(type(render(),'Modal')[0].props.open,false);
  const notice=type(render(),'Notice')[0];assert.equal(notice.props.type,'info');assert.match(text(notice),/saved.*refresh/i);
});

async function paymentForm(API){
  const render=component('Payments',{paymentsForTicket:async()=>({payments:[]}),disputes:async()=>({disputes:[]}),...API});
  await type(render(),'DataTable')[0].props.onRowClick({id:100,ticket_number:'QA-ONLY',remaining_balance:10});
  await button(render(),' Record Payment').props.onClick();
  let tree=render();type(tree,'input').find(n=>n.props.type==='number').props.onChange({target:{value:'5'}});
  tree=render();type(tree,'input').find(n=>!n.props.type).props.onChange({target:{value:'QA-OR-ONLY'}});
  return render;
}

test('confirmed payment stays confirmed when the balance refresh fails',async()=>{
  let writes=0;
  const render=await paymentForm({recordPayment:async()=>{writes++;},ticket:async()=>{throw Error('QA balance refresh unavailable');}});
  await button(render(),'Save Payment').props.onClick();
  assert.equal(writes,1);assert.equal(type(render(),'Modal')[0].props.open,false);
  const notice=type(render(),'Notice')[0];
  assert.equal(notice.props.type,'info');assert.match(text(notice),/recorded.*refresh/i);
  assert.ok(type(render(),'input').filter(n=>n.props.type==='number'||!n.props.type).every(n=>n.props.value===''));
});

test('payment errors stay visible in the open modal',async()=>{
  let writes=0;
  const render=await paymentForm({recordPayment:async()=>{writes++;throw Error('QA receipt rejected');}});
  await button(render(),'Save Payment').props.onClick();
  assert.equal(writes,1);const modal=type(render(),'Modal')[0];assert.equal(modal.props.open,true);
  assert.ok(type(modal,'Notice').some(n=>text(n)==='QA receipt rejected'));
});

test('payment dialog permits only one in-flight posting before rerender',async()=>{
  let writes=0,release;const pending=new Promise(resolve=>{release=resolve;});
  const render=await paymentForm({recordPayment:()=>{writes++;return pending;},ticket:async()=>({ticket:{id:100,remaining_balance:5}}),tickets:async()=>({data:[]})});
  const save=button(render(),'Save Payment').props.onClick;
  const first=save();const second=save();await tick();assert.equal(writes,1);
  release({success:true});await Promise.all([first,second]);
});

test('payment selection ignores late history and clears the previous ticket history',async()=>{
  const pending=new Map();
  const render=component('Payments',{paymentsForTicket:id=>new Promise(resolve=>pending.set(id,resolve)),disputes:async()=>({disputes:[]})});
  const select=row=>type(render(),'DataTable')[0].props.onRowClick(row);
  const first=select({id:100,ticket_number:'QA-A',remaining_balance:10});
  const second=select({id:101,ticket_number:'QA-B',remaining_balance:20});
  pending.get(101)({payments:[{official_receipt_number:'QA-B-OR'}]});await second;
  pending.get(100)({payments:[{official_receipt_number:'QA-A-OR'}]});await first;
  assert.deepEqual(type(render(),'DataTable')[1].props.rows.map(r=>r.official_receipt_number),['QA-B-OR']);
  const third=select({id:102,ticket_number:'QA-C',remaining_balance:30});
  assert.equal(type(render(),'DataTable')[1].props.rows.length,0);
  pending.get(102)({payments:[]});await third;
});

test('payment selection is locked while a posting is awaiting confirmation',async()=>{
  let release;
  const render=await paymentForm({recordPayment:()=>new Promise(resolve=>{release=resolve;}),
    ticket:async()=>({ticket:{id:100,ticket_number:'QA-ONLY',remaining_balance:5}}),tickets:async()=>({data:[]})});
  const posting=button(render(),'Save Payment').props.onClick();await tick();
  await type(render(),'DataTable')[0].props.onRowClick({id:101,ticket_number:'QA-B',remaining_balance:20});
  assert.match(type(render(),'Modal')[0].props.title,/QA-ONLY/);
  release({success:true});await posting;
});

test('account creation rejects overlapping saves and shows write errors in its modal',async()=>{
  let writes=0,reject;
  const render=component('ManageUsers',{createUser:()=>{writes++;return new Promise((resolve,r)=>{reject=r;});}});
  button(render(),' Add New User').props.onClick();
  const save=button(render(),'Save Account').props.onClick;
  const first=save();const second=save();
  assert.equal(writes,1);
  reject(Error('QA duplicate email'));await Promise.all([first,second]);
  const modal=type(render(),'Modal')[0];assert.equal(modal.props.open,true);
  assert.ok(type(modal,'Notice').some(n=>text(n)==='QA duplicate email'));
});

test('account save confirmation survives list refresh failure',async()=>{
  const render=component('ManageUsers',{createUser:async()=>({success:true}),users:async()=>{throw Error('QA refresh offline');}});
  button(render(),' Add New User').props.onClick();await button(render(),'Save Account').props.onClick();
  assert.equal(type(render(),'Modal')[0].props.open,false);
  const notice=type(render(),'Notice')[0];assert.equal(notice.props.type,'info');assert.match(text(notice),/saved.*refresh/i);
});
