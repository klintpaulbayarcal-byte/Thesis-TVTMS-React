// Shared by the isolated launcher and Vite config; no remote target is accepted.
export const ISOLATED_API_ORIGIN = 'http://127.0.0.1:8000';
const allowed = new Set([ISOLATED_API_ORIGIN, ISOLATED_API_ORIGIN+'/',
  'http://localhost:8000', 'http://localhost:8000/']);

export function isolatedApiOrigin(value) {
  if (value !== undefined && value !== '' && !allowed.has(value)) {
    throw new Error('Unsafe VITE_PHP_API_ORIGIN override: isolated QA requires http://127.0.0.1:8000.');
  }
  return ISOLATED_API_ORIGIN;
}

export function isolatedQaEnvironment(inherited) {
  // Windows environment names are case-insensitive; reject every alias before
  // canonicalizing to avoid duplicate keys selecting a different child value.
  const entries=Object.entries(inherited);
  for (const [key,value] of entries) {
    if (key.toUpperCase()==='VITE_PHP_API_ORIGIN') isolatedApiOrigin(value);
  }
  return {...Object.fromEntries(entries.filter(([key])=>key.toUpperCase()!=='VITE_PHP_API_ORIGIN')),
    TVTMS_ISOLATED_DEV:'1', VITE_PHP_API_ORIGIN:ISOLATED_API_ORIGIN};
}
