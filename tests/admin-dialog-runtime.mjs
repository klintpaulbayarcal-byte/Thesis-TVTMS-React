// Execute the actual component handlers with offline API doubles and state hooks.
// No browser sessions, production data, network requests or email are involved.
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
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
    if(id.endsWith('/utils/format'))return {firstArray:r=>r.violations||r.disputes||r.payments||r.data||[],money:String,dateTime:String,manilaDateKey:()=> '2026-10-20'};
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
  const render=component('Payments',{paymentsForTicket:async()=>({payments:[]}),...API});
  await type(render(),'DataTable')[0].props.onRowClick({id:100,ticket_number:'QA-ONLY',remaining_balance:10});
  button(render(),' Record Payment').props.onClick();
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
  const first=save();const second=save();assert.equal(writes,1);
  release({success:true});await Promise.all([first,second]);
});
