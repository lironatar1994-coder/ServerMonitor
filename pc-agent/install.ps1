# Installs the Claude Remote agent for Server Monitor's owner-only remote screen:
# Python packages + a scheduled task that starts it hidden at logon (and revives it within 5 minutes).
#   install.cmd / .\install.ps1  install / update and (re)start; an existing config.json needs no SSH
#   .\install.ps1 -NewToken      issue a new token and revoke every other agent token
#   .\install.ps1 -Uninstall     stop and remove the task
# The server keeps one SHA-256 per agent token in /root/.server-monitor-rc-agent.sha256.
param([switch]$Uninstall, [switch]$NewToken, [string]$SSHHost = 'root@vee-app.co.il')
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$taskName = 'Claude Remote Agent'
$configFile = Join-Path $here 'config.json'

# Any Claude Remote agent copy (an agent.py beside claude_ui.py), including the old standalone install;
# the agent's single-instance mutex would otherwise keep the new one from starting.
function Stop-Agent {
    Get-CimInstance Win32_Process -Filter "Name='pythonw.exe' OR Name='python.exe'" |
        Where-Object {
            $_.CommandLine -match '"?([^"]*\\agent\.py)"?' -and (Test-Path (Join-Path (Split-Path $Matches[1]) 'claude_ui.py'))
        } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

if ($Uninstall) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Stop-Agent
    Write-Host 'Agent removed.'
    return
}

$config = if (Test-Path $configFile) { Get-Content $configFile -Raw | ConvertFrom-Json } else { [pscustomobject]@{ keepAwake = $true } }
$config | Add-Member -Force server 'https://monitor.vee-app.co.il/serve-monitor/api/remote'
if ($NewToken -or -not $config.token) {
    $redirect = if ($NewToken) { '>' } else { '>>' }
    $bytes = New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $config | Add-Member -Force token ([Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_'))
    $sha = [Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($config.token))
    $hash = -join ($sha | ForEach-Object { $_.ToString('x2') })
    & ssh -o BatchMode=yes -o ConnectTimeout=15 $SSHHost "umask 077 && printf '%s\n' $hash $redirect /root/.server-monitor-rc-agent.sha256"
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Could not reach $SSHHost. From a PC with the server key run:`n  ssh $SSHHost `"umask 077 && printf '%s\n' $hash $redirect /root/.server-monitor-rc-agent.sha256`""
    }
}
[IO.File]::WriteAllText($configFile, ($config | ConvertTo-Json) + "`n")

$python = (Get-Command python -ErrorAction Stop).Source
$pythonw = Join-Path (Split-Path $python) 'pythonw.exe'
if (-not (Test-Path $pythonw)) { throw "pythonw.exe not found next to $python" }

& $python -m pip install --quiet --disable-pip-version-check -r "$here\requirements.txt"
if ($LASTEXITCODE -ne 0) { throw 'pip install failed' }

$user = "$env:USERDOMAIN\$env:USERNAME"
$action = New-ScheduledTaskAction -Execute $pythonw -Argument "`"$here\agent.py`"" -WorkingDirectory $here
$atLogon = New-ScheduledTaskTrigger -AtLogOn -User $user
$watchdog = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($atLogon, $watchdog) -Settings $settings -Principal $principal -Force | Out-Null

Stop-Agent
Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 3
$running = Get-CimInstance Win32_Process -Filter "Name='pythonw.exe'" | Where-Object { $_.CommandLine -like "*$here*agent.py*" }
if ($running) { Write-Host "Agent running (pid $($running.ProcessId)). Log: $here\agent.log" -ForegroundColor Green }
else { Write-Warning "Agent did not start - see $here\agent.log" }
