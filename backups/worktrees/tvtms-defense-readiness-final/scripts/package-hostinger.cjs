const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dist = path.join(root, 'dist');
const deploy = path.join(root, 'deploy');

if (!fs.existsSync(dist) || !fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('dist/ is missing. Run npm run build first.');
  process.exit(1);
}

fs.rmSync(deploy, { recursive: true, force: true });
fs.mkdirSync(deploy, { recursive: true });

function copy(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.cpSync(src, dst, { recursive: true });
}

copy(dist, deploy);
copy(path.join(root, 'api'), path.join(deploy, 'api'));
// Deliberately exclude 'uploads': it is runtime/user data, not application source.
copy(path.join(root, '.htaccess'), path.join(deploy, '.htaccess'));
copy(path.join(root, 'DEPLOYMENT_README.txt'), path.join(deploy, 'DEPLOYMENT_README.txt'));

// Never package local server-secret overrides from the development workspace.
const secretLocal = path.join(deploy, 'api', 'config', 'config.local.php');
if (fs.existsSync(secretLocal)) fs.rmSync(secretLocal, { force: true });

// Fail closed if a real-looking server credential was accidentally hard-coded
// anywhere in the assembled deployment. Placeholders and environment-variable
// names are intentionally allowed.
const secretPatterns = [
  /sb_secret_[A-Za-z0-9_-]{16,}/g,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g,
];
const textExtensions = new Set(['.php', '.js', '.mjs', '.cjs', '.html', '.css', '.json', '.txt', '.md']);
const findings = [];

function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scan(full);
      continue;
    }
    if (!textExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    const stat = fs.statSync(full);
    if (stat.size > 5 * 1024 * 1024) continue;
    const text = fs.readFileSync(full, 'utf8');
    for (const pattern of secretPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        findings.push(path.relative(deploy, full));
        break;
      }
    }
  }
}

scan(deploy);
if (findings.length) {
  console.error('Refusing to package deployment: possible server secret found in:');
  findings.forEach(file => console.error(` - ${file}`));
  process.exit(1);
}

console.log(`Hostinger deployment assembled at ${deploy}`);
console.log('IMPORTANT: config.local.php is intentionally excluded. Create deploy/api/config/config.local.php from the example (or use server environment variables) before live API testing/FTP deployment.');
