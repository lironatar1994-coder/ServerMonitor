<#
  Installs the nightly backup copy on this PC: copies the pull script out of the repository
  (so moving the repo cannot break it) and registers a per-user scheduled task at 04:30,
  after the server's 03:00 maintenance. A missed run starts as soon as the PC is on again.
  Requires the restricted key from %USERPROFILE%\.ssh\lawebs_backup_ed25519, authorized on the
  server with command="/usr/local/sbin/lawebs-backup-transport".
#>
$ErrorActionPreference = 'Stop'
$home_dir = Join-Path $env:USERPROFILE '.server-monitor'
New-Item -ItemType Directory -Force $home_dir | Out-Null
$script = Join-Path $home_dir 'pc-backup-pull.ps1'
Copy-Item -Force (Join-Path $PSScriptRoot 'pc-backup-pull.ps1') $script

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
$trigger = New-ScheduledTaskTrigger -Daily -At '04:30'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'ServerMonitor backup copy' -Description 'Copies and verifies the nightly ServerMonitor backups, then acknowledges them on the server.' `
  -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Output "Installed: $script (daily 04:30)"
