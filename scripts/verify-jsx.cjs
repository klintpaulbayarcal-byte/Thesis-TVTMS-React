const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let ts;
try {
  ts = require('typescript');
} catch {
  try {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    ts = require(path.join(globalRoot, 'typescript'));
  } catch (error) {
    console.error('TypeScript is required for JSX verification. Run npm install first.');
    process.exit(1);
  }
}

const root = process.cwd();
const extensions = new Set(['.js', '.jsx']);
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'deploy', '.git'].includes(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (extensions.has(path.extname(entry.name))) files.push(p);
  }
}

walk(path.join(root, 'src'));
files.push(path.join(root, 'vite.config.js'));

let failures = 0;
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const kind = file.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.JS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  for (const d of sf.parseDiagnostics) {
    failures++;
    const pos = sf.getLineAndCharacterOfPosition(d.start || 0);
    console.error(`${path.relative(root, file)}:${pos.line + 1}:${pos.character + 1}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
  }

  const importRe = /from\s+['"](\.[^'"]+)['"]|import\s+['"](\.[^'"]+)['"]/g;
  let m;
  while ((m = importRe.exec(text))) {
    const spec = m[1] || m[2];
    const base = path.resolve(path.dirname(file), spec);
    const candidates = [base, `${base}.js`, `${base}.jsx`, path.join(base, 'index.js'), path.join(base, 'index.jsx')];
    if (!candidates.some(fs.existsSync)) {
      failures++;
      console.error(`${path.relative(root, file)}: unresolved relative import ${spec}`);
    }
  }
}

if (failures) process.exit(1);
console.log(`React/JS syntax + relative import verification passed for ${files.length} files.`);
