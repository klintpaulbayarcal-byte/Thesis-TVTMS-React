// Manual QA only. Never packaged for Hostinger or connected to a hosted database.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const php = [process.env.TVTMS_PHP, process.env.TVTMS_PHP_EXE,
  'C:/tools/php83/php.exe', 'C:/xampp/php/php.exe'].filter(Boolean).find(p => fs.existsSync(p)) || 'php';
const tempRoot=path.join(root,'.test-tmp');
fs.mkdirSync(tempRoot,{recursive:true});
const runtime=fs.mkdtempSync(path.join(tempRoot,'isolated-runtime-'));
const env = {...process.env, TVTMS_PHP:php, TVTMS_ISOLATED_DEV:'1',
  TEMP:runtime,TMP:runtime,TMPDIR:runtime};
const children = [];
let stopping = false;
function stop(code=0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
function start(command,args,ipc=false) {
  const child=spawn(command,args,{cwd:root,env,stdio:ipc?['ignore','inherit','inherit','ipc']:'inherit'});
  children.push(child);
  child.on('error',()=>{console.error('Unable to start an isolated QA process.');stop(1);});
  child.on('exit',code=>{if(!stopping)stop(code||1);});
  return child;
}
process.on('SIGINT',()=>stop());
process.on('SIGTERM',()=>stop());
const adapter=start(process.execPath,['scripts/isolated-rest.mjs'],true);
adapter.once('message',message=>{
  if (!message.ready || stopping) return;
  start(php,['-S','127.0.0.1:8000','dev-router.php']);
  start(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5173','--strictPort']);
  console.log('Isolated QA: http://localhost:5173');
  console.log('TEST-ONLY local QA accounts: officer@local.test / admin@local.test; password: LocalTestPass123!');
  console.log('Disposable fixtures only. Never copy them to production or use them as replacements for real accounts.');
  console.log('SMTP disabled. Fresh disposable database on every start. Ctrl+C stops all QA processes.');
});
