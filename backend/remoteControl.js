// Relay between the owner's remote-control screen and the agent on the PC (`pc-agent/`).
// The PC can't be reached from outside, so the agent long-polls for jobs and reports back.
// Jobs and the last screenshot live only in memory; the session list survives restarts.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const AGENT_ONLINE_MS = 45e3;
const POLL_WAIT_MS = 25e3;
const QUEUED_TTL_MS = 90e3;
const RUNNING_TTL_MS = 150e3;
const JOB_TYPES = new Set(['list', 'connect', 'disconnect', 'status', 'screenshot', 'launch']);

const production = () => process.env.NODE_ENV === 'production';
const tokenFile = () => process.env.RC_AGENT_TOKEN_FILE
    || (production() ? '/root/.server-monitor-rc-agent.sha256' : path.join(__dirname, '.rc-agent.sha256'));
const stateFile = () => process.env.RC_STATE_FILE || path.join(__dirname, '.remote-state.json');

const failure = (status, message) => Object.assign(new Error(message), { status });

// One SHA-256 per line, one per installed agent; re-read when the file changes.
let tokenCache = { mtime: 0, hashes: [] };
function agentTokenHashes() {
    try {
        const stat = fs.statSync(tokenFile());
        if (stat.mtimeMs !== tokenCache.mtime) {
            const hashes = fs.readFileSync(tokenFile(), 'utf8').split(/\s+/).filter((hex) => /^[0-9a-f]{64}$/.test(hex));
            tokenCache = { mtime: stat.mtimeMs, hashes: hashes.slice(0, 5).map((hex) => Buffer.from(hex, 'hex')) };
        }
    } catch { tokenCache = { mtime: 0, hashes: [] }; }
    return tokenCache.hashes;
}

function agentAuthorized(header) {
    const match = /^Bearer (\S{20,200})$/.exec(header || '');
    if (!match) return false;
    const got = crypto.createHash('sha256').update(match[1]).digest();
    return agentTokenHashes().reduce((ok, want) => crypto.timingSafeEqual(got, want) || ok, false);
}

const state = {
    agent: { lastSeen: 0, host: '', version: '', claudeRunning: null },
    sessions: [],
    current: null,
    sessionsAt: 0,
    links: {}, // title -> { link, enabled, cloud, at }
    screenshot: null, // { buf, type, at }
};
const jobs = new Map(); // id -> job, insertion ordered
// Pending agent long-polls, one per PC (host): { send, timer }. Each PC replaces only its own
// earlier poll, so two connected agents never answer each other's waits in a loop.
const waiters = new Map();

try {
    const saved = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    Object.assign(state, { sessions: saved.sessions || [], current: saved.current ?? null, sessionsAt: saved.sessionsAt || 0, links: saved.links || {} });
} catch { /* first run */ }

let saveTimer = null;
function saveState() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        const { sessions, current, sessionsAt, links } = state;
        fs.writeFile(stateFile(), JSON.stringify({ sessions, current, sessionsAt, links }), { mode: 0o600 }, () => {});
    }, 500);
    saveTimer.unref?.();
}

function publicJob(job) {
    const { id, type, args, status, result, error, createdAt, updatedAt } = job;
    return { id, type, args, status, result, error, createdAt, updatedAt };
}

function finish(job, ok, result, error, status) {
    job.status = status || (ok ? 'done' : 'error');
    job.result = result ?? null;
    job.error = error ?? null;
    job.updatedAt = Date.now();
}

function sweepJobs() {
    const now = Date.now();
    for (const job of jobs.values()) {
        if (job.status === 'queued' && now - job.createdAt > QUEUED_TTL_MS) finish(job, false, null, 'המחשב לא קיבל את הפעולה. האם הוא דלוק והסוכן פועל?', 'expired');
        else if (job.status === 'running' && now - job.updatedAt > RUNNING_TTL_MS) finish(job, false, null, 'המחשב לא השיב בזמן.', 'error');
    }
    while (jobs.size > 60) jobs.delete(jobs.keys().next().value);
}

function nextQueued() {
    sweepJobs();
    for (const job of jobs.values()) if (job.status === 'queued') return job;
    return null;
}

function take(job) {
    job.status = 'running';
    job.updatedAt = Date.now();
    return { jobs: [publicJob(job)] };
}

function dispatchToWaiter() {
    const host = [...waiters.keys()].pop(); // the PC that polled most recently
    if (host === undefined) return;
    const job = nextQueued();
    if (!job) return;
    const { send, timer } = waiters.get(host);
    waiters.delete(host);
    clearTimeout(timer);
    send(take(job));
}

function agentOnline() {
    return Date.now() - state.agent.lastSeen < AGENT_ONLINE_MS || waiters.size > 0;
}

function cleanArgs(type, args) {
    if (type !== 'connect' && type !== 'disconnect') return {};
    const title = String(args?.title ?? '').slice(0, 300);
    if (!title) throw failure(400, 'יש לבחור שיחה.');
    return { title, occurrence: Math.max(0, Math.min(50, Number(args?.occurrence) || 0)) };
}

function enqueue(type, rawArgs) {
    if (!JOB_TYPES.has(type)) throw failure(400, 'פעולה לא מוכרת.');
    const args = cleanArgs(type, rawArgs);
    sweepJobs();
    const key = JSON.stringify([type, args]);
    for (const job of jobs.values()) {
        if ((job.status === 'queued' || job.status === 'running') && job.key === key) return job;
    }
    if ([...jobs.values()].filter((job) => job.status === 'queued').length >= 10) throw failure(429, 'יותר מדי פעולות ממתינות.');
    const now = Date.now();
    const job = { id: crypto.randomBytes(8).toString('hex'), key, type, args, status: 'queued', result: null, error: null, createdAt: now, updatedAt: now };
    jobs.set(job.id, job);
    dispatchToWaiter();
    return job;
}

function getJob(id) {
    sweepJobs();
    const job = jobs.get(String(id));
    return job ? publicJob(job) : null;
}

function publicState() {
    sweepJobs();
    const { agent } = state;
    return {
        agent: { online: agentOnline(), lastSeen: agent.lastSeen || null, host: agent.host, version: agent.version, claudeRunning: agent.claudeRunning },
        sessions: state.sessions,
        current: state.current,
        sessionsAt: state.sessionsAt || null,
        links: state.links,
        screenshotAt: state.screenshot?.at || null,
        jobs: [...jobs.values()].slice(-12).reverse().map(publicJob),
        now: Date.now(),
    };
}

// ---- agent side ----------------------------------------------------------------

function seen() { state.agent.lastSeen = Date.now(); }

// `send` answers the agent's request; `onClose` registers cleanup if the agent hangs up.
function poll({ host, version, claude }, send, onClose) {
    const name = String(host || '').slice(0, 80);
    state.agent.host = name;
    state.agent.version = String(version || '').slice(0, 20);
    state.agent.claudeRunning = claude == null ? null : claude === '1';
    const job = nextQueued();
    if (job) return send(take(job));
    const previous = waiters.get(name);
    if (previous) { clearTimeout(previous.timer); waiters.delete(name); previous.send({ jobs: [] }); }
    const release = () => { if (waiters.get(name) === current) waiters.delete(name); };
    const current = {
        send,
        timer: setTimeout(() => { release(); seen(); send({ jobs: [] }); }, POLL_WAIT_MS),
    };
    waiters.set(name, current);
    onClose(() => { clearTimeout(current.timer); release(); });
}

function cleanSessions(list) {
    if (!Array.isArray(list)) return null;
    return list.slice(0, 500).map((session, index) => ({
        index,
        title: String(session.title ?? '').slice(0, 300),
        status: String(session.status ?? '').slice(0, 40),
        // A collapsed sidebar group is named after its expander ("Show 5 more in Older").
        section: String(session.section ?? '').replace(/^Show \d+ more in /i, '').slice(0, 80),
        occurrence: Math.max(0, Math.min(50, Number(session.occurrence) || 0)),
        current: Boolean(session.current),
    }));
}

function report(body) {
    const sessions = cleanSessions(body.sessions);
    if (sessions) {
        state.sessions = sessions;
        state.current = typeof body.current === 'string' ? body.current.slice(0, 300) : null;
        state.sessionsAt = Date.now();
    }
    if (typeof body.claudeRunning === 'boolean') state.agent.claudeRunning = body.claudeRunning;
    const job = body.jobId ? jobs.get(String(body.jobId)) : null;
    if (job) {
        const result = body.result && typeof body.result === 'object' && !Array.isArray(body.result) ? body.result : null;
        finish(job, Boolean(body.ok), result, body.ok ? null : String(body.error || 'Failed').slice(0, 500));
        if (result && typeof result.title === 'string' && ['connect', 'disconnect', 'status'].includes(job.type)) {
            state.links[result.title.slice(0, 300)] = {
                link: typeof result.link === 'string' && /^https:\/\/claude\.ai\//.test(result.link) ? result.link.slice(0, 500) : null,
                enabled: Boolean(result.enabled),
                cloud: Boolean(result.cloud),
                at: Date.now(),
            };
        }
    }
    saveState();
}

function screenshot(buf, type, jobId) {
    state.screenshot = { buf, type, at: Date.now() };
    const job = jobs.get(String(jobId || ''));
    if (job) finish(job, true, { at: state.screenshot.at, bytes: buf.length });
}

const latestScreenshot = () => state.screenshot;

const timer = setInterval(sweepJobs, 10e3);
timer.unref();

module.exports = { agentAuthorized, seen, poll, report, screenshot, latestScreenshot, enqueue, getJob, publicState, agentOnline, tokenFile };
