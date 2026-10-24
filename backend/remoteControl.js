// Relay between the owner's remote-control screen and the agents on the owner's PCs (`pc-agent/`).
// A PC can't be reached from outside, so its agent long-polls for jobs and reports back.
// Each PC (named by the agent's host) has its own sessions, links and screenshot, and every job
// targets one PC. Jobs and screenshots live only in memory; session lists survive restarts.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const AGENT_ONLINE_MS = 45e3;
const POLL_WAIT_MS = 25e3;
const QUEUED_TTL_MS = 90e3;
const RUNNING_TTL_MS = 150e3;
const FORGET_PC_MS = 30 * 86400e3;
const MAX_PCS = 10;
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

// host -> { host, lastSeen, version, claudeRunning, sessions, current, sessionsAt, links, screenshot }
const pcs = new Map();
const jobs = new Map(); // id -> job (with its target `pc`), insertion ordered
// Pending long-polls, one per PC: { send, timer }. A PC replaces only its own earlier poll.
const waiters = new Map();

const hostName = (value) => String(value || '').trim().slice(0, 80) || 'PC';

function pcRecord(host) {
    let pc = pcs.get(host);
    if (!pc) {
        pc = { host, lastSeen: 0, version: '', claudeRunning: null, sessions: [], current: null, sessionsAt: 0, links: {}, screenshot: null };
        pcs.set(host, pc);
        while (pcs.size > MAX_PCS) pcs.delete([...pcs.values()].sort((a, b) => a.lastSeen - b.lastSeen)[0].host);
    }
    return pc;
}

try {
    const saved = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    for (const [host, value] of Object.entries(saved.pcs || {})) {
        Object.assign(pcRecord(hostName(host)), {
            lastSeen: value.lastSeen || 0, version: value.version || '', sessions: value.sessions || [],
            current: value.current ?? null, sessionsAt: value.sessionsAt || 0, links: value.links || {},
        });
    }
} catch { /* first run, or the single-PC file from before; agents refill it within seconds */ }

let saveTimer = null;
function saveState() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        const out = {};
        for (const { host, lastSeen, version, sessions, current, sessionsAt, links } of pcs.values()) {
            out[host] = { lastSeen, version, sessions, current, sessionsAt, links };
        }
        fs.writeFile(stateFile(), JSON.stringify({ pcs: out }), { mode: 0o600 }, () => {});
    }, 500);
    saveTimer.unref?.();
}

function publicJob(job) {
    const { id, type, args, pc, status, result, error, createdAt, updatedAt } = job;
    return { id, type, args, pc, status, result, error, createdAt, updatedAt };
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
    while (jobs.size > 100) jobs.delete(jobs.keys().next().value);
    for (const pc of pcs.values()) if (pc.lastSeen && now - pc.lastSeen > FORGET_PC_MS && !waiters.has(pc.host)) pcs.delete(pc.host);
}

function nextQueued(host) {
    sweepJobs();
    for (const job of jobs.values()) if (job.status === 'queued' && job.pc === host) return job;
    return null;
}

function take(job) {
    job.status = 'running';
    job.updatedAt = Date.now();
    return { jobs: [publicJob(job)] };
}

function dispatch(host) {
    const waiter = waiters.get(host);
    const job = waiter && nextQueued(host);
    if (!job) return;
    waiters.delete(host);
    clearTimeout(waiter.timer);
    waiter.send(take(job));
}

const online = (pc) => Date.now() - pc.lastSeen < AGENT_ONLINE_MS || waiters.has(pc.host);

// The requested PC, else the one heard from most recently.
function choosePc(host) {
    if (host && pcs.has(hostName(host))) return pcs.get(hostName(host));
    return [...pcs.values()].sort((a, b) => b.lastSeen - a.lastSeen)[0] || null;
}

function agentOnline(host) {
    const pc = choosePc(host);
    return Boolean(pc && online(pc));
}

function cleanArgs(type, args) {
    if (type !== 'connect' && type !== 'disconnect') return {};
    const title = String(args?.title ?? '').slice(0, 300);
    if (!title) throw failure(400, 'יש לבחור שיחה.');
    return { title, occurrence: Math.max(0, Math.min(50, Number(args?.occurrence) || 0)) };
}

function enqueue(type, rawArgs, host) {
    if (!JOB_TYPES.has(type)) throw failure(400, 'פעולה לא מוכרת.');
    const args = cleanArgs(type, rawArgs);
    const pc = host ? pcs.get(hostName(host)) : choosePc();
    if (!pc) throw failure(400, 'יש לבחור מחשב מחובר.');
    sweepJobs();
    const key = JSON.stringify([pc.host, type, args]);
    for (const job of jobs.values()) {
        if ((job.status === 'queued' || job.status === 'running') && job.key === key) return job;
    }
    if ([...jobs.values()].filter((job) => job.status === 'queued' && job.pc === pc.host).length >= 10) throw failure(429, 'יותר מדי פעולות ממתינות.');
    const now = Date.now();
    const job = { id: crypto.randomBytes(8).toString('hex'), key, type, args, pc: pc.host, status: 'queued', result: null, error: null, createdAt: now, updatedAt: now };
    jobs.set(job.id, job);
    dispatch(pc.host);
    return job;
}

function getJob(id) {
    sweepJobs();
    const job = jobs.get(String(id));
    return job ? publicJob(job) : null;
}

function publicState(host) {
    sweepJobs();
    const pc = choosePc(host);
    return {
        pcs: [...pcs.values()].sort((a, b) => a.host.localeCompare(b.host))
            .map((item) => ({ host: item.host, online: online(item), lastSeen: item.lastSeen || null, version: item.version })),
        pc: pc?.host || null,
        agent: pc
            ? { online: online(pc), lastSeen: pc.lastSeen || null, host: pc.host, version: pc.version, claudeRunning: pc.claudeRunning }
            : { online: false, lastSeen: null, host: '', version: '', claudeRunning: null },
        sessions: pc?.sessions || [],
        current: pc?.current ?? null,
        sessionsAt: pc?.sessionsAt || null,
        links: pc?.links || {},
        screenshotAt: pc?.screenshot?.at || null,
        jobs: [...jobs.values()].filter((job) => job.pc === pc?.host).slice(-12).reverse().map(publicJob),
        now: Date.now(),
    };
}

// ---- agent side ----------------------------------------------------------------

// `send` answers the agent's request; `onClose` registers cleanup if the agent hangs up.
function poll({ host, version, claude }, send, onClose) {
    const name = hostName(host);
    const pc = pcRecord(name);
    pc.lastSeen = Date.now();
    pc.version = String(version || '').slice(0, 20);
    pc.claudeRunning = claude == null ? null : claude === '1';
    const job = nextQueued(name);
    if (job) return send(take(job));
    const previous = waiters.get(name);
    if (previous) { clearTimeout(previous.timer); waiters.delete(name); previous.send({ jobs: [] }); }
    const release = () => { if (waiters.get(name) === current) waiters.delete(name); };
    const current = {
        send,
        timer: setTimeout(() => { release(); pc.lastSeen = Date.now(); send({ jobs: [] }); }, POLL_WAIT_MS),
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

// Reports carry no host; the job they answer names the PC.
function report(body) {
    const job = body.jobId ? jobs.get(String(body.jobId)) : null;
    if (!job) return;
    const pc = pcRecord(job.pc);
    pc.lastSeen = Date.now();
    const sessions = cleanSessions(body.sessions);
    if (sessions) {
        pc.sessions = sessions;
        pc.current = typeof body.current === 'string' ? body.current.slice(0, 300) : null;
        pc.sessionsAt = Date.now();
    }
    if (typeof body.claudeRunning === 'boolean') pc.claudeRunning = body.claudeRunning;
    const result = body.result && typeof body.result === 'object' && !Array.isArray(body.result) ? body.result : null;
    finish(job, Boolean(body.ok), result, body.ok ? null : String(body.error || 'Failed').slice(0, 500));
    if (result && typeof result.title === 'string' && ['connect', 'disconnect', 'status'].includes(job.type)) {
        pc.links[result.title.slice(0, 300)] = {
            link: typeof result.link === 'string' && /^https:\/\/claude\.ai\//.test(result.link) ? result.link.slice(0, 500) : null,
            enabled: Boolean(result.enabled),
            cloud: Boolean(result.cloud),
            at: Date.now(),
        };
    }
    saveState();
}

function screenshot(buf, type, jobId) {
    const job = jobs.get(String(jobId || ''));
    if (!job || job.type !== 'screenshot') return false;
    const pc = pcRecord(job.pc);
    pc.lastSeen = Date.now();
    pc.screenshot = { buf, type, at: Date.now() };
    finish(job, true, { at: pc.screenshot.at, bytes: buf.length });
    return true;
}

const latestScreenshot = (host) => choosePc(host)?.screenshot || null;

const timer = setInterval(sweepJobs, 10e3);
timer.unref();

module.exports = { agentAuthorized, poll, report, screenshot, latestScreenshot, enqueue, getJob, publicState, agentOnline, tokenFile };
