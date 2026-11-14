// Disposable, loopback-only Supabase REST adapter backed by a real PGlite database.
// Test-only: the production PHP implementation is unchanged.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const tempRoot = path.join(root, '.test-tmp');
fs.mkdirSync(tempRoot, {recursive:true});
const here = fs.mkdtempSync(path.join(tempRoot, 'isolated-dev-'));
const dataDir = path.join(here, 'database');
const db = new PGlite(dataDir);
const q = async (sql, args=[]) => (await db.query(sql,args)).rows;
const ident = value => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error('Invalid SQL identifier');
  return '"' + value + '"';
};
const json = (res, code, value, headers={}) => {
  const body = JSON.stringify(value);
  res.writeHead(code, {'Content-Type':'application/json',...headers});
  res.end(body);
};

if (!fs.existsSync(path.join(here, 'initialized'))) {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  await db.exec(fs.readFileSync(path.join(root,'supabase/schema/database.postgres.sql'),'utf8'));
  for (const name of fs.readdirSync(path.join(root,'supabase/migrations')).filter(x=>x.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',name),'utf8'));
  }
  const php = spawnSync(process.env.TVTMS_PHP, ['-r', "echo password_hash('LocalTestPass123!', PASSWORD_BCRYPT);"], {encoding:'utf8'});
  if (php.status !== 0 || !php.stdout.startsWith('$2')) throw new Error('Unable to create local-only test password hash');
  // New local fixtures only: existing application role values, no real account import/update.
  await q('insert into public.users(name,email,password,role,officer_rank) values ($1,$2,$3,$4,$5),($6,$7,$3,$8,null)',
    ['TEST-ONLY Apprehending Officer (Local QA)','officer@local.test',php.stdout,'apprehending_officer','TEST ONLY RANK','TEST-ONLY Administrator (Local QA)','admin@local.test','admin']);
  fs.writeFileSync(path.join(here,'initialized'),'all migrations applied, TEST-ONLY local QA accounts seeded\n');
}

function predicates(search, start=0) {
  const where=[], args=[];
  for (const [key, raw] of search) {
    if (['select','order','limit','offset','on_conflict'].includes(key)) continue;
    const column=ident(key), dot=raw.indexOf('.'), op=raw.slice(0,dot), value=raw.slice(dot+1);
    if (dot<0) throw new Error('Unsupported filter');
    if (op==='is' && value==='null') where.push(`${column} is null`);
    else if (op==='in' && value.startsWith('(') && value.endsWith(')')) {
      const items=value.slice(1,-1).split(',');
      where.push(`${column} in (${items.map((_,i)=>'$'+(start+args.length+i+1)).join(',')})`);
      args.push(...items);
    } else {
      const symbol={eq:'=',neq:'<>',gt:'>',gte:'>=',lt:'<',lte:'<='}[op];
      if (!symbol) throw new Error('Unsupported filter '+op);
      args.push(value);
      where.push(`${column} ${symbol} $${start+args.length}`);
    }
  }
  return {where:where.length?' where '+where.join(' and '):'',args};
}

async function tableRequest(req, url, res, table) {
  ident(table);
  const search=url.searchParams;
  const requested=(search.get('select')||'*').replace(/,?[a-z_]+(?:![a-z_]+)?\([^)]*\)/gi,'').split(',').filter(Boolean);
  const columns=requested[0]==='*'?'*':requested.map(ident).join(',');
  const order=search.get('order');
  const orderSql=order?' order by '+order.split(',').map(part=>{
    const [field,direction='asc']=part.split('.');
    if (!['asc','desc'].includes(direction)) throw new Error('Invalid order');
    return ident(field)+' '+direction;
  }).join(','):'';
  const limit=search.has('limit')?' limit '+Math.max(0,Number(search.get('limit'))||0):'';
  const offset=search.has('offset')?' offset '+Math.max(0,Number(search.get('offset'))||0):'';
  if (req.method==='GET') {
    const {where,args}=predicates(search);
    const rows=await q(`select ${columns} from public.${ident(table)}${where}${orderSql}${limit}${offset}`,args);
    if (table==='audit_logs' && (search.get('select')||'').includes('users(')) {
      for (const row of rows) {
        row.users=row.user_id?(await q('select name,email from public.users where id=$1',[row.user_id]))[0]??null:null;
      }
    }
    let total=rows.length;
    if ((req.headers.prefer||'').includes('count=exact')) total=Number((await q(`select count(*) n from public.${ident(table)}${where}`,args))[0].n);
    json(res,200,rows,{'Content-Range':`${rows.length?'0-'+(rows.length-1):'*'}/${total}`});
    return;
  }
  let input=''; for await (const chunk of req) input+=chunk;
  const body=input?JSON.parse(input):null;
  if (req.method==='POST') {
    const entries=Array.isArray(body)?body:[body];
    const saved=[];
    for (const row of entries) {
      const keys=Object.keys(row), vals=Object.values(row);
      const out=await q(`insert into public.${ident(table)}(${keys.map(ident).join(',')}) values (${keys.map((_,i)=>'$'+(i+1)).join(',')}) returning *`, vals.map(x=>x&&typeof x==='object'?JSON.stringify(x):x));
      saved.push(...out);
    }
    json(res,201,(req.headers.prefer||'').includes('return=minimal')?null:saved);
    return;
  }
  const {where,args}=predicates(search);
  if (!where) throw new Error('Mutation requires filter');
  if (req.method==='PATCH') {
    const keys=Object.keys(body),vals=Object.values(body).map(x=>x&&typeof x==='object'?JSON.stringify(x):x);
    const sets=keys.map((k,i)=>`${ident(k)}=$${i+1}`).join(',');
    const filtered=predicates(search,keys.length);
    const rows=await q(`update public.${ident(table)} set ${sets}${filtered.where} returning *`,[...vals,...filtered.args]);
    json(res,200,(req.headers.prefer||'').includes('return=minimal')?null:rows);
    return;
  }
  if (req.method==='DELETE') {
    const rows=await q(`delete from public.${ident(table)}${where} returning *`,args);
    json(res,200,(req.headers.prefer||'').includes('return=minimal')?null:rows);
    return;
  }
  json(res,405,{message:'Method not allowed'});
}

async function rpcRequest(req,res,name) {
  ident(name);
  let input=''; for await (const chunk of req) input+=chunk;
  const body=input?JSON.parse(input):{};
  const functions=await q(`select p.proargnames, array(select format_type(x,null) from unnest(p.proargtypes) x) argtypes
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=$1`,[name]);
  const entry=functions.find(f=>(f.proargnames||[]).length===Object.keys(body).length && (f.proargnames||[]).every(k=>Object.hasOwn(body,k)));
  if (!entry) return json(res,404,{code:'PGRST202',message:'RPC unavailable'});
  const names=entry.proargnames||[];
  const args=names.map((k,i)=>{
    const val=body[k]; return entry.argtypes[i]==='jsonb'?JSON.stringify(val):val;
  });
  const casts=entry.argtypes.map((type,i)=>'$'+(i+1)+'::'+type).join(',');
  const rows=await q(`select public.${ident(name)}(${casts}) result`,args);
  json(res,200,rows[0]?.result??null);
}

const server=http.createServer(async(req,res)=>{
  try {
    if (req.socket.remoteAddress !== '127.0.0.1' && req.socket.remoteAddress !== '::1' && req.socket.remoteAddress !== '::ffff:127.0.0.1') return json(res,403,{message:'Loopback only'});
    if (req.headers.apikey !== 'local-fixture-only') return json(res,403,{message:'Local fixture key required'});
    const url=new URL(req.url,'http://127.0.0.1:54321');
    const parts=url.pathname.split('/').filter(Boolean);
    if (parts[0]!=='rest'||parts[1]!=='v1') return json(res,404,{message:'Not found'});
    if (parts[2]==='rpc') return await rpcRequest(req,res,parts[3]);
    return await tableRequest(req,url,res,parts[2]);
  } catch(error) {
    console.error('local adapter:',error.message);
    json(res,400,{code:error.code||'TEST_ADAPTER_ERROR',message:error.message});
  }
});
server.listen(54321,'127.0.0.1',()=>{
  console.log('Disposable migrated database: '+path.relative(root,here));
  process.send?.({ready:true});
});
server.on('error',()=>{console.error('Isolated adapter could not bind loopback port 54321.');process.exit(1);});
const close=()=>server.close(async()=>{await db.close();process.exit(0);});
process.on('SIGTERM',close);process.on('SIGINT',close);
