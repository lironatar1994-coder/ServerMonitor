# Deploys Server Monitor from this PC. The dashboard is checked and built here, not on the
# production server, and the server only installs it (deploy_linux.sh).
#   .\deploy.ps1                         deploy the committed main branch
#   .\deploy.ps1 -CommitMessage "..."    commit every current change first (secret-looking files are refused)
param (
    [string]$CommitMessage = "",
    [switch]$SkipTests
)

$ErrorActionPreference = "Stop"
$SSH_HOST = "root@vee-app.co.il"
$INCOMING = "/root/server-monitor-incoming"

# Runs a command through cmd so its stderr never turns into a PowerShell error; shows the tail on failure.
function Invoke-Checked([string]$Label, [string]$Directory, [string]$Command) {
    Write-Host $Label -ForegroundColor Gray
    $log = Join-Path $env:TEMP 'server-monitor-deploy.log'
    Push-Location $Directory
    try { cmd /c "$Command > `"$log`" 2>&1"; $code = $LASTEXITCODE } finally { Pop-Location }
    if ($code -ne 0) { Get-Content $log -Tail 30; throw "$Label failed" }
}

Push-Location $PSScriptRoot
try {
    Write-Host "--- Server Monitor deployment ---" -ForegroundColor Cyan

    # 1. Only committed work on main is deployed.
    if ((git rev-parse --abbrev-ref HEAD) -ne 'main') { throw 'Deploy from the main branch.' }
    $status = git status --porcelain
    if ($status) {
        if (-not $CommitMessage) {
            $status | ForEach-Object { Write-Host "  $_" }
            throw 'Uncommitted changes. Commit them, or pass -CommitMessage to commit everything listed above.'
        }
        git add -A
        $sensitive = git diff --cached --name-only | Where-Object {
            $_ -match '(^|/)\.env(\.|$)|\.(pem|key|db|db-wal|db-shm|sqlite|sha256)$|(^|/)(config|secrets|auth)\.json$|push-key|auth-key|remote-state'
        }
        if ($sensitive) { git reset -q; throw "Refusing to commit secret-looking files: $($sensitive -join ', ')" }
        git commit -q -m $CommitMessage
        if ($LASTEXITCODE -ne 0) { throw 'Commit failed' }
    }
    $sha = (git rev-parse HEAD).Trim()

    # 2. Checks and the production dashboard build, on this PC.
    if (-not $SkipTests) { Invoke-Checked 'Backend tests...' 'backend' 'npm test' }
    else { Write-Host 'Automated tests skipped by explicit request; lint and build still run.' -ForegroundColor Gray }
    Invoke-Checked 'Dashboard lint...' 'frontend' 'npm run lint'
    Invoke-Checked 'Dashboard build...' 'frontend' 'npm run build'
    if (-not (Test-Path 'frontend/dist/index.html')) { throw 'The dashboard build produced no index.html' }

    # 3. Publish the commit and the matching build.
    & ssh -o BatchMode=yes -o ConnectTimeout=15 $SSH_HOST "install -d -m 700 $INCOMING"
    if ($LASTEXITCODE -ne 0) { throw "Cannot reach $SSH_HOST" }
    Write-Host 'Pushing to GitHub...' -ForegroundColor Gray
    git push origin main
    if ($LASTEXITCODE -ne 0) { throw 'git push failed' }
    $archive = Join-Path $env:TEMP "frontend-dist-$sha.tar.gz"
    & (Join-Path $env:SystemRoot 'System32\tar.exe') -czf $archive -C frontend dist
    if ($LASTEXITCODE -ne 0) { throw 'Packing the dashboard failed' }
    & scp -q $archive "${SSH_HOST}:$INCOMING/"
    if ($LASTEXITCODE -ne 0) { throw 'Uploading the dashboard failed' }
    Remove-Item $archive -ErrorAction SilentlyContinue

    # 4. Server side: same commit, prebuilt dashboard, dependencies only when the lock file changed.
    Write-Host 'Running the server deployment...' -ForegroundColor Blue
    $browserCheck = if ($SkipTests) { 'SKIP_DEPLOY_BROWSER_CHECK=1 ' } else { '' }
    $remote = "cd /root/ServerMonitor && git fetch origin main && git reset --hard origin/main && chmod +x deploy_linux.sh && ${browserCheck}PREBUILT_FRONTEND=$INCOMING/frontend-dist-$sha.tar.gz ./deploy_linux.sh"
    & ssh $SSH_HOST $remote
    if ($LASTEXITCODE -ne 0) { Write-Host "`n[!] DEPLOYMENT FAILED" -ForegroundColor Red; exit $LASTEXITCODE }

    Write-Host "`nDEPLOYMENT COMPLETE ($($sha.Substring(0, 7)))" -ForegroundColor Green
} finally { Pop-Location }
