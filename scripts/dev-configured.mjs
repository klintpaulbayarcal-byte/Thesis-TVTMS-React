// Normal development: use existing private PHP configuration and existing accounts.
// Starts servers only; no database initialization, seed, login or migration step.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function configuredDevEnvironment(inherited) {
  const runtimeFlags = new Set(['TVTMS_ISOLATED_DEV','TVTMS_CONFIGURED_DEV','VITE_PHP_API_ORIGIN']);
  return {...Object.fromEntries(Object.entries(inherited).filter(([key])=>!runtimeFlags.has(key.toUpperCase()))),
    TVTMS_ISOLATED_DEV:'0', TVTMS_CONFIGURED_DEV:'1', VITE_PHP_API_ORIGIN:'http://127.0.0.1:8000'};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const child = spawn(process.execPath, [path.join(root,'node_modules/concurrently/dist/bin/concurrently.js'),
    '-k', 'npm run dev:api', 'npm run dev:web'],
  {cwd:root, env:configuredDevEnvironment(process.env), stdio:'inherit'});
  child.on('error',()=>{console.error('Unable to start the configured development servers.');process.exitCode=1;});
  child.on('exit',code=>{process.exitCode=code??1;});
  process.on('SIGINT',()=>child.kill('SIGINT'));
  process.on('SIGTERM',()=>child.kill());
}
