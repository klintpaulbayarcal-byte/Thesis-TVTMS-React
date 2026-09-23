const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const candidates = [process.env.TVTMS_PHP, process.env.TVTMS_PHP_EXE, 'C:/tools/php83/php.exe', 'C:/xampp/php/php.exe'].filter(Boolean);
const php = candidates.find(candidate => fs.existsSync(candidate));

if (!php) {
  console.error('PHP CLI not found. Set TVTMS_PHP to a PHP 8.1+ executable.');
  process.exit(1);
}
const phpCheck = spawnSync(php, ['-r', 'exit(PHP_VERSION_ID >= 80100 ? 0 : 1);'], { stdio: 'inherit' });
if (phpCheck.status !== 0) {
  console.error('TVTMS requires PHP 8.1 or newer.');
  process.exit(1);
}

const pythonCandidates = [
  process.env.TVTMS_PYTHON,
  process.env.PYTHON,
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Python', 'bin', 'python.exe'),
].filter(Boolean);
const python = pythonCandidates.find(candidate => fs.existsSync(candidate)) || 'python';
const env = {...process.env, TVTMS_PHP: php, PATH: `${path.dirname(php)}${path.delimiter}${process.env.PATH || ''}`};
const result = spawnSync(python, ['-m', 'pytest', '-q', '-s', '-p', 'no:cacheprovider', 'tests'], {cwd: root, env, stdio: 'inherit'});
if (result.error) {
  console.error(`Unable to launch Python: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
