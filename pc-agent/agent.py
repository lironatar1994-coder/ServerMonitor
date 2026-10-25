"""Claude Remote agent - runs on the PC.

Long-polls Server Monitor (`/serve-monitor/api/remote/agent`) for jobs queued from the
owner-only remote screen, drives the Claude desktop app (claude_ui.py) and reports the
result back. Started at logon by the "Claude Remote Agent" scheduled task (install.ps1);
runs without a window.
"""
import ctypes
import json
import logging
import os
import socket
import sys
import threading
import time
from logging.handlers import RotatingFileHandler
from urllib.parse import urljoin

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
VERSION = '2.2.1'
SERVER = 'https://monitor.vee-app.co.il/serve-monitor/api/remote'
# Configs written before the move into Server Monitor point at the retired panel.
LEGACY_SERVERS = {'https://lawebs.co.il/rc'}

log = logging.getLogger('agent')


def setup_logging():
    log.setLevel(logging.INFO)
    h = RotatingFileHandler(os.path.join(HERE, 'agent.log'), maxBytes=1_000_000, backupCount=2, encoding='utf-8')
    h.setFormatter(logging.Formatter('%(asctime)s %(levelname)s %(message)s'))
    log.addHandler(h)
    if sys.stdout and sys.stdout.isatty():
        log.addHandler(logging.StreamHandler(sys.stdout))


def single_instance():
    ctypes.windll.kernel32.CreateMutexW(None, False, 'Local\\ClaudeRemoteAgent')
    if ctypes.windll.kernel32.GetLastError() == 183:  # ERROR_ALREADY_EXISTS
        log.info('Another agent is already running - exiting')
        sys.exit(0)


def keep_awake():
    # ES_CONTINUOUS | ES_SYSTEM_REQUIRED: no idle sleep while the agent runs (the display may still turn off).
    ctypes.windll.kernel32.SetThreadExecutionState(0x80000000 | 0x00000001)


class OutsideChecks(threading.Thread):
    """Every ~10 minutes, fetches each monitored public address from this PC's own connection and
    reports status and time to first byte. Sites never see the agent token; requests carry the
    monitor's internal-browser cookie and a ServerMonitor user agent, so they are not counted as visits."""

    def __init__(self, base, token, host):
        super().__init__(daemon=True, name='outside-checks')
        self.base, self.host = base, host
        self.api = requests.Session()
        self.api.headers.update({'Authorization': f'Bearer {token}', 'User-Agent': f'claude-remote-agent/{VERSION}'})
        self.web = requests.Session()
        self.web.headers.update({'User-Agent': f'ServerMonitor-ExternalProbe/{VERSION}', 'Cookie': 'monitor_internal=1'})

    def probe(self, target):
        # Redirects are followed here, not by requests, which would drop the internal-browser cookie.
        url, started = target['url'], time.monotonic()
        try:
            for _ in range(4):
                with self.web.get(url, timeout=(5, 10), stream=True, allow_redirects=False) as r:
                    location = r.headers.get('Location') if r.is_redirect else None
                    status = r.status_code
                if not location:
                    break
                url = urljoin(url, location)
            ms = (time.monotonic() - started) * 1000
            ok = status < 400
            return {'id': target['id'], 'ok': ok, 'status': status, 'ms': round(ms), 'error': None if ok else f'HTTP {status}'}
        except requests.RequestException as e:
            return {'id': target['id'], 'ok': False, 'status': None, 'ms': None, 'error': type(e).__name__}

    def run(self):
        time.sleep(30)
        while True:
            interval = 600
            try:
                r = self.api.get(f'{self.base}/agent/probe-targets', timeout=20)
                r.raise_for_status()
                data = r.json()
                interval = max(300, int(data.get('interval_s') or 600))
                results = [self.probe(t) for t in data.get('targets', [])[:60]]
                self.api.post(f'{self.base}/agent/probes', params={'host': self.host}, json={'results': results}, timeout=20).raise_for_status()
                failed = [x for x in results if not x['ok']]
                if failed:
                    log.info('outside check: %d of %d failed', len(failed), len(results))
            except Exception as e:
                log.warning('outside check skipped: %s', e)
            time.sleep(interval)


class Agent:
    def __init__(self, cfg):
        from claude_ui import ClaudeUI
        base = (cfg.get('server') or SERVER).rstrip('/')
        self.base = SERVER if base in LEGACY_SERVERS else base
        self.http = requests.Session()
        self.http.headers.update({
            'Authorization': f"Bearer {cfg['token']}",
            'User-Agent': f'claude-remote-agent/{VERSION}',
        })
        self.ui = ClaudeUI(log=log.info)
        self.host = socket.gethostname()

    def claude_running(self):
        try:
            return self.ui._find_window() is not None
        except Exception:
            return None

    def poll(self):
        running = self.claude_running()
        params = {'v': VERSION, 'host': self.host}
        if running is not None:
            params['claude'] = '1' if running else '0'
        r = self.http.get(f'{self.base}/agent/poll', params=params, timeout=45)
        r.raise_for_status()
        return r.json().get('jobs', [])

    def report(self, job_id, ok, result=None, error=None, listing=None):
        body = {'jobId': job_id, 'ok': ok, 'result': result, 'error': error, 'claudeRunning': self.claude_running()}
        if listing:
            body['sessions'] = listing['sessions']
            body['current'] = listing['current']
        for attempt in range(3):
            try:
                self.http.post(f'{self.base}/agent/report', json=body, timeout=20).raise_for_status()
                return
            except requests.RequestException as e:
                log.warning('report failed (%s), retrying', e)
                time.sleep(2 * (attempt + 1))

    def listing(self):
        try:
            return self.ui.list_sessions(expand_collapsed=False)
        except Exception as e:
            log.warning('could not refresh the list: %s', e)
            return None

    def run(self, job):
        t, a = job['type'], job.get('args') or {}
        if t == 'list':
            data = self.ui.list_sessions()
            return {'count': len(data['sessions'])}, data
        if t == 'connect':
            res = self.ui.connect(a['title'], int(a.get('occurrence', 0)))
            return res, self.listing()
        if t == 'disconnect':
            res = self.ui.disconnect(a['title'], int(a.get('occurrence', 0)))
            return res, self.listing()
        if t == 'status':
            res = self.ui.rc_status()
            res['title'] = self.ui.current_title()
            return res, None
        if t == 'launch':
            self.ui.window(launch=True)
            return {'running': True}, self.listing()
        if t == 'screenshot':
            from claude_ui import screenshot_png
            img = screenshot_png()
            r = self.http.post(f'{self.base}/agent/screenshot', params={'job': job['id']}, data=img,
                               headers={'Content-Type': 'image/jpeg'}, timeout=60)
            r.raise_for_status()
            return None, None  # the upload itself completes the job
        raise ValueError(f'unknown job type {t}')

    def handle(self, job):
        from claude_ui import ClaudeUIError
        log.info('job %s %s %s', job['id'], job['type'], json.dumps(job.get('args') or {}, ensure_ascii=False))
        started = time.time()
        try:
            result, listing = self.run(job)
            if job['type'] != 'screenshot':
                self.report(job['id'], True, result, listing=listing)
            log.info('job %s done in %.1fs', job['id'], time.time() - started)
        except ClaudeUIError as e:
            log.warning('job %s failed: %s', job['id'], e)
            self.report(job['id'], False, error=str(e), listing=self.listing())
        except Exception as e:
            log.exception('job %s crashed', job['id'])
            self.report(job['id'], False, error=f'{type(e).__name__}: {e}')

    def loop(self):
        backoff = 2
        log.info('agent %s started, server %s', VERSION, self.base)
        while True:
            try:
                jobs = self.poll()
                backoff = 2
            except requests.HTTPError as e:
                code = e.response.status_code if e.response is not None else 0
                log.warning('poll rejected (%s)%s', code, ' - check the token in config.json' if code == 401 else '')
                time.sleep(60 if code == 401 else backoff)
                backoff = min(backoff * 2, 60)
                continue
            except requests.RequestException as e:
                log.warning('poll failed: %s', e)
                time.sleep(backoff)
                backoff = min(backoff * 2, 60)
                continue
            for job in jobs:
                self.handle(job)


def main():
    setup_logging()
    single_instance()
    with open(os.environ.get('RC_AGENT_CONFIG') or os.path.join(HERE, 'config.json'), encoding='utf-8') as f:
        cfg = json.load(f)
    if cfg.get('keepAwake', True):
        keep_awake()
    if cfg.get('outsideChecks', True):
        base = (cfg.get('server') or SERVER).rstrip('/')
        OutsideChecks(SERVER if base in LEGACY_SERVERS else base, cfg['token'], socket.gethostname()).start()
    while True:
        try:
            Agent(cfg).loop()
        except Exception:
            log.exception('agent crashed - restarting in 10s')
            time.sleep(10)


if __name__ == '__main__':
    main()
