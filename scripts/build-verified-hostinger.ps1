# TVTMS local Windows release builder. READ-ONLY with respect to Supabase and Hostinger.
# Produces a compiled artifact locally; DOES NOT mean production workflows are verified.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-NativeStep([string]$Label, [scriptblock]$Command) {
    Write-Host "`n== $Label ==" -ForegroundColor Cyan
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "$Label failed (exit code $LASTEXITCODE). Do not upload a stale deploy folder." }
}

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
Write-Host 'TVTMS: fresh local build and release checks (no server changes).' -ForegroundColor Cyan

$phpExe = if ($env:TVTMS_PHP_EXE) { $env:TVTMS_PHP_EXE } else { 'C:\tools\php83\php.exe' }
if (-not (Test-Path -LiteralPath $phpExe -PathType Leaf)) { throw "PHP 8.3 CLI is missing at $phpExe. Set TVTMS_PHP_EXE to a PHP 8.1+ executable." }
$phpBin = Split-Path -Parent $phpExe
$env:Path = "$phpBin;$env:Path"
$phpVersion = & $phpExe -r 'echo PHP_VERSION_ID;'
if ($LASTEXITCODE -ne 0 -or -not ($phpVersion -match '^\d+$')) { throw 'Unable to identify PHP runtime.' }
if ([int]$phpVersion -lt 80100) { throw "Installed PHP $phpVersion is too old. This project requires PHP 8.1+." }
$missingExtensions = @(@('curl','openssl','fileinfo','mbstring') | Where-Object { & $phpExe -r "exit(extension_loaded('$_') ? 0 : 1);"; $LASTEXITCODE -ne 0 })
if ($missingExtensions.Count -gt 0) { throw "PHP is missing required extensions: $($missingExtensions -join ', ')" }

# Prefer the real per-user Python installation when the Windows Store alias is
# present but cannot launch in non-interactive release shells.
$localPythonBin = Join-Path $env:LOCALAPPDATA 'Python\bin'
if (Test-Path (Join-Path $localPythonBin 'python.exe') -PathType Leaf) {
    $env:Path = "$localPythonBin;$env:Path"
}

foreach ($cmd in @('node', 'npm', 'python')) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "Required local command is unavailable: $cmd" }
}

Invoke-NativeStep 'Fresh dependency installation' { npm ci --no-audit --no-fund }
Invoke-NativeStep 'JSX syntax and import verification' { npm run verify:jsx }
Invoke-NativeStep 'Full Python contract and isolated runtime tests' { python -m pytest -q -s -p no:cacheprovider tests }

Write-Host "`n== PHP lint ==" -ForegroundColor Cyan
$phpFiles = @(Get-ChildItem (Join-Path $root 'api') -Filter '*.php' -Recurse -File)
if ($phpFiles.Count -lt 20) { throw 'PHP source files missing: refusing to create an incomplete package.' }
foreach ($file in $phpFiles) {
    & $phpExe -l $file.FullName | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "PHP syntax error: $($file.FullName)" }
}
Write-Host "Checked $($phpFiles.Count) PHP files."
Invoke-NativeStep 'Fresh React compilation and Hostinger assembly' { npm run build:hostinger }

$deploy = Join-Path $root 'deploy'
$required = @(
    'deploy/index.html',
    'deploy/.htaccess',
    'deploy/api/.htaccess',
    'deploy/api/index.php',
    'deploy/api/src/router.php',
    'deploy/api/src/handlers/contact_messages.php',
    'deploy/api/config/config.php',
    'deploy/api/config/config.local.example.php',
    'deploy/api/config/.htaccess',
    'deploy/DEPLOYMENT_README.txt'
)
foreach ($relative in $required) {
    if (-not (Test-Path (Join-Path $root $relative) -PathType Leaf)) {
        throw "Deployment assembly missing required file: $relative"
    }
}
if (Test-Path 'deploy/api/config/config.local.php') {
    throw 'Private config.local.php was included in deploy; aborting before ZIP creation.'
}
$router = Get-Content 'deploy/api/src/router.php' -Raw
if (-not $router.Contains('/api/contact-messages/')) { throw 'The assembled API is stale: contact-message route missing.' }
$entry = Get-Content 'deploy/index.html' -Raw
if ($entry -notmatch '/assets/') { throw 'Compiled index is missing built asset references.' }
$assetFiles = @(Get-ChildItem (Join-Path $deploy 'assets') -Filter '*.js' -File)
if ($assetFiles.Count -eq 0) { throw 'No compiled JavaScript found; refusing to archive.' }

# The package assembler scans bundled text for two common server-secret forms.
# This additional gate prevents private local overrides, env files and dependency trees.
$forbidden = @(Get-ChildItem $deploy -Recurse -File -Force | Where-Object {
    $_.Name -eq 'config.local.php' -or $_.Name -eq '.env' -or
    $_.Name -like '.env.*' -or $_.FullName -match '[\\/]node_modules[\\/]'
})
if ($forbidden.Count -gt 0) { throw 'Private or unnecessary files detected in deployment folder.' }

$zipName = 'TVTMS_V4_FINAL_HOSTINGER_DEPLOY.zip'
$zipPath = Join-Path $root $zipName
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($deploy, $zipPath, [System.IO.Compression.CompressionLevel]::Optimal, $false)
$archive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    $entries = @($archive.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
    foreach ($needed in @('.htaccess', 'index.html', 'DEPLOYMENT_README.txt', 'api/index.php', 'api/.htaccess', 'api/config/.htaccess', 'api/src/handlers/contact_messages.php')) {
        if ($entries -notcontains $needed) { throw "Archive missing $needed. Discard this ZIP." }
    }
    if (@($entries | Where-Object { $_ -like '*config.local.php' -or $_ -like '.env*' }).Count -gt 0) {
        throw 'Secret-related file found in archive. Discard this ZIP.'
    }
} finally { $archive.Dispose() }
Write-Host "`nLOCAL BUILD/PACKAGE PASSED: $zipPath" -ForegroundColor Green
Write-Host 'This does NOT prove live Supabase, Admin/Officer workflows, printer/QR scan, or Hostinger production behavior.' -ForegroundColor Yellow
Write-Host 'Privately configure the target server and obtain separate approval before deploying.' -ForegroundColor Yellow
