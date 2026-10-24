# PC agent

## Purpose

- Run on the owner's Windows PC and carry out remote-screen jobs from Server Monitor (`/serve-monitor/remote`): read the Claude desktop sidebar, open a session and switch Remote Control on or off, start Claude, and upload a screenshot.

## Ownership

- `agent.py` long-polls `<server>/agent/poll`, runs one job at a time and reports to `<server>/agent/report` or `<server>/agent/screenshot`. The default server is `https://monitor.vee-app.co.il/serve-monitor/api/remote`; a config still pointing at `https://lawebs.co.il/rc` is moved to it.
- `claude_ui.py` drives Claude desktop through Windows UI Automation only (no mouse or keyboard input), so it works with the window covered. It checks every Claude window, restores a minimized or hidden one without taking focus, and on failure reports the windows and pages it saw.
- `rc.py` and `rc.cmd` are the local command-line equivalent (list, connect, status).
- `install.cmd` (double-click) runs `install.ps1`, which installs packages and the `Claude Remote Agent` scheduled task (logon start, five-minute watchdog) and stops any older agent copy. An existing `config.json` is used as is; without one it creates a token and appends its SHA-256 to `/root/.server-monitor-rc-agent.sha256` over SSH. `-NewToken` replaces every stored hash (revoking other agents); `-Uninstall` removes the task.

## Local Contracts

- `config.json` (server, token, keepAwake) and `agent.log*` are local only and ignored by Git; never commit or print the token.
- The agent keeps the PC from idle sleep while running unless `keepAwake` is false; the display may still turn off.
- Agents installed before the move into Server Monitor keep working unchanged through the `lawebs.co.il/rc/api/agent/` relay and their existing token.

## Work Guidance

- Keep the job vocabulary in step with `backend/remoteControl.js`.

## Verification

- `python -c "import ast; ast.parse(open('agent.py', encoding='utf-8').read())"` for syntax; `rc.cmd list` checks UI automation on the PC.

## Child DOX Index

- No child contracts.
