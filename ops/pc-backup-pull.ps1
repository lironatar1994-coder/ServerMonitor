<#
  Nightly copy of the verified ServerMonitor backups to this PC.
  Downloads each server snapshot through the restricted backup key (list/read/ack only),
  checks every file's size and SHA-256 against the server manifest, and only then
  acknowledges it so the server may expire its own copy. Never deletes server data.
  Installed by ops/install-pc-backup.ps1; Windows PowerShell 5.1 compatible.
#>
param(
  [string]$Destination = "$env:USERPROFILE\ServerBackups",
  [string]$Key = "$env:USERPROFILE\.ssh\lawebs_backup_ed25519",
  [string]$Target = 'root@vee-app.co.il',
  [int]$Keep = 30
)
$ErrorActionPreference = 'Stop'
$ssh = "$env:WINDIR\System32\OpenSSH\ssh.exe"
New-Item -ItemType Directory -Force $Destination | Out-Null
$log = Join-Path $Destination 'pull.log'
function Write-Log([string]$text) { "$(Get-Date -Format s) $text" | Add-Content -Encoding utf8 $log }

# Runs one allowed remote command; binary output goes straight to a file when one is given.
function Invoke-Backup([string]$command, [string]$outFile) {
  $info = New-Object System.Diagnostics.ProcessStartInfo $ssh
  $info.Arguments = "-i `"$Key`" -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=20 -o ServerAliveInterval=30 $Target `"$command`""
  $info.UseShellExecute = $false
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $info.CreateNoWindow = $true
  $process = [System.Diagnostics.Process]::Start($info)
  $stderr = $process.StandardError.ReadToEndAsync()
  $text = $null
  if ($outFile) {
    $stream = [System.IO.File]::Create($outFile)
    try { $process.StandardOutput.BaseStream.CopyTo($stream) } finally { $stream.Close() }
  } else {
    $text = $process.StandardOutput.ReadToEnd()
  }
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) { throw "ssh '$command' failed ($($process.ExitCode)): $($stderr.Result.Trim())" }
  return $text
}

try {
  # Windows PowerShell returns a parsed JSON array as one object; enumerate it explicitly.
  $listing = Invoke-Backup 'list' $null | ConvertFrom-Json
  $snapshots = @($listing | ForEach-Object { $_ })
  $copied = 0
  foreach ($snapshot in $snapshots) {
    if ($snapshot.id -notmatch '^\d{8}T\d{6}Z$' -or $snapshot.manifest_sha256 -notmatch '^[0-9a-f]{64}$') { throw 'Unexpected snapshot listing' }
    $folder = Join-Path $Destination $snapshot.id
    $verified = Join-Path $folder '.verified'
    $acknowledged = Join-Path $folder '.acknowledged'
    $current = (Test-Path $verified) -and ((Get-Content $verified -Raw).Trim() -eq $snapshot.manifest_sha256)
    if ($current -and (Test-Path $acknowledged)) { continue }
    if (-not $current) {
      New-Item -ItemType Directory -Force $folder | Out-Null
      foreach ($file in $snapshot.files.PSObject.Properties) {
        $name = $file.Name
        if ($name -notmatch '^[A-Za-z0-9_.-]+$') { throw "Unexpected file name: $name" }
        $path = Join-Path $folder $name
        $expected = [string]$file.Value.sha256
        if ((Test-Path $path) -and (Get-FileHash $path -Algorithm SHA256).Hash.ToLower() -eq $expected) { continue }
        $partial = "$path.partial"
        Invoke-Backup "read $($snapshot.id) $name 0" $partial | Out-Null
        $hash = (Get-FileHash $partial -Algorithm SHA256).Hash.ToLower()
        if ($hash -ne $expected -or (Get-Item $partial).Length -ne [int64]$file.Value.bytes) {
          Remove-Item -Force $partial
          throw "Checksum mismatch: $($snapshot.id)/$name"
        }
        Move-Item -Force $partial $path
      }
      $snapshot.files | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 (Join-Path $folder 'manifest.json')
      Set-Content -Encoding ascii $verified $snapshot.manifest_sha256
      $copied++
    }
    $reply = [string](Invoke-Backup "ack $($snapshot.id) $($snapshot.manifest_sha256)" $null)
    if ($reply.Trim() -ne 'OK') { throw "Acknowledgement refused: $($snapshot.id)" }
    Set-Content -Encoding ascii $acknowledged (Get-Date -Format s)
  }
  # Keep the newest local snapshots; only snapshot-named folders are ever removed.
  Get-ChildItem $Destination -Directory | Where-Object { $_.Name -match '^\d{8}T\d{6}Z$' } |
    Sort-Object Name -Descending | Select-Object -Skip $Keep | Remove-Item -Recurse -Force
  Write-Log "OK: copied $copied snapshot(s); $($snapshots.Count) on server"
  exit 0
} catch {
  Write-Log "FAILED: $($_.Exception.Message)"
  exit 1
}
