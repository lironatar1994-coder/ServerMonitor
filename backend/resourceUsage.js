const fs = require('fs');
const path = require('path');
const { execFile, execFileSync } = require('child_process');

const STORAGE_CACHE_MS = 30 * 60 * 1000;
let storageCache = { fetchedAt: 0, snapshot: null, pending: null };

const PROJECTS = [
    { id: 'vee', name: 'Vee', path: '/root/Vee', dependencies: ['/root/Vee/backend/node_modules', '/root/Vee/frontend/node_modules'] },
    { id: 'on-your-way', name: 'On Your Way', path: '/root/OnYourWay', dependencies: ['/root/OnYourWay/backend/node_modules', '/root/OnYourWay/frontend/node_modules', '/root/OnYourWay/admin/node_modules'] },
    { id: 'libi-live', name: 'Libi Diamonds', path: '/root/LibiDiamonds-live', dependencies: ['/root/LibiDiamonds-live/node_modules'] },
    { id: 'libi-rollback', name: 'Libi rollback', path: '/root/LibiDiamonds-live.rollback', type: 'rollback', dependencies: ['/root/LibiDiamonds-live.rollback/node_modules'] },
    { id: 'text-to-pdf', name: 'Text to PDF', path: '/root/TextToPDF', dependencies: ['/root/TextToPDF/node_modules'] },
    { id: 'sos', name: 'SOS Landing', path: '/root/sos-landing-standalone', dependencies: ['/root/sos-landing-standalone/node_modules'] },
    { id: 'server-monitor', name: 'Server Monitor', path: '/root/ServerMonitor', dependencies: ['/root/ServerMonitor/backend/node_modules', '/root/ServerMonitor/frontend/node_modules'] },
    { id: 'pixel-dungeon', name: 'Pixel Dungeon', path: '/root/PixelDungeon', dependencies: ['/root/PixelDungeon/node_modules'] },
    { id: 'manager-site', name: 'Manager Site', path: '/root/Manager_Site', dependencies: ['/root/Manager_Site/node_modules'] },
    { id: 'dfus-reuven-preview', name: 'Dfus Reuven Preview', path: '/root/DfusReuven', dependencies: ['/root/DfusReuven/node_modules'] },
    { id: 'dfus-reuven-live', name: 'Dfus Reuven', path: '/root/DfusReuven-live', dependencies: ['/root/DfusReuven-live/node_modules'] },
    { id: 'miryam-zelig', name: 'Miryam Zelig', path: '/root/Miryam_Zelig', dependencies: [] }
];

const OTHER_STORAGE = [
    { id: 'monitor-backups', name: 'Monitor backups', path: '/root/server-monitor-backups', type: 'backup' },
    { id: 'deployment-backups', name: 'Deployment backups', path: '/root/deployment-backups', type: 'backup' },
    { id: 'database-backups', name: 'Database backups', path: '/root/db_backups', type: 'backup' },
    { id: 'pm2-logs', name: 'PM2 logs', path: '/root/.pm2/logs', type: 'log' },
    { id: 'system-logs', name: 'System logs', path: '/var/log', type: 'log' },
    { id: 'npm-cache', name: 'NPM cache', path: '/root/.npm', type: 'cache' },
    { id: 'apt-lists', name: 'APT package lists', path: '/var/lib/apt/lists', type: 'cache' },
    { id: 'node-runtimes', name: 'Node runtimes', path: '/root/.nvm', type: 'runtime' }
];

function parseProcessTable(output) {
    return String(output || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const match = line.match(/^(\d+)\s+(\d+)\s+([0-9.]+)\s+(\d+)\s+(.*)$/);
            if (!match) return null;
            return {
                pid: Number(match[1]),
                ppid: Number(match[2]),
                cpu: Number(match[3]) || 0,
                rss_bytes: (Number(match[4]) || 0) * 1024,
                command: match[5]
            };
        })
        .filter(Boolean);
}

function collectProcessTree(rootPid, processes) {
    const byParent = new Map();
    processes.forEach((process) => {
        if (!byParent.has(process.ppid)) byParent.set(process.ppid, []);
        byParent.get(process.ppid).push(process);
    });
    const byPid = new Map(processes.map((process) => [process.pid, process]));
    const collected = [];
    const pending = [Number(rootPid)];
    const seen = new Set();
    while (pending.length) {
        const pid = pending.pop();
        if (!pid || seen.has(pid)) continue;
        seen.add(pid);
        const process = byPid.get(pid);
        if (process) collected.push(process);
        (byParent.get(pid) || []).forEach((child) => pending.push(child.pid));
    }
    return collected;
}

function buildApplicationUsage(pm2Processes, apps, processes, totalMemory) {
    const appByPm2 = new Map(apps.filter((app) => app.pm2_name).map((app) => [app.pm2_name, app]));
    return pm2Processes
        .filter((process) => Number(process.pid) > 0)
        .map((process) => {
            const app = appByPm2.get(process.name);
            const tree = collectProcessTree(process.pid, processes);
            const root = tree.find((item) => item.pid === Number(process.pid));
            const memoryBytes = tree.reduce((sum, item) => sum + item.rss_bytes, 0);
            const swapBytes = tree.reduce((sum, item) => sum + (item.swap_bytes || 0), 0);
            const cpuPercent = tree.reduce((sum, item) => sum + item.cpu, 0);
            const dominant = tree.reduce((largest, item) => !largest || item.rss_bytes > largest.rss_bytes ? item : largest, null);
            const wrapperBytes = root?.rss_bytes || Number(process.monit?.memory) || 0;
            return {
                app_id: app?.id || null,
                name: app?.name || process.name,
                pm2_name: process.name,
                status: process.pm2_env?.status || 'unknown',
                pid: Number(process.pid),
                process_count: tree.length,
                cpu_percent: cpuPercent,
                memory_bytes: memoryBytes,
                swap_bytes: swapBytes,
                footprint_bytes: memoryBytes + swapBytes,
                memory_percent: totalMemory ? (memoryBytes / totalMemory) * 100 : 0,
                wrapper_memory_bytes: wrapperBytes,
                child_memory_bytes: Math.max(0, memoryBytes - wrapperBytes),
                dominant_process: dominant?.command || process.name
            };
        })
        .sort((a, b) => b.footprint_bytes - a.footprint_bytes);
}

function readProcessSwapBytes(pid) {
    try {
        const match = fs.readFileSync(`/proc/${pid}/status`, 'utf8').match(/^VmSwap:\s+(\d+)\s+kB$/m);
        return match ? Number(match[1]) * 1024 : 0;
    } catch (error) {
        return 0;
    }
}

function readProcessTable() {
    if (process.platform !== 'linux') return [];
    const output = execFileSync('/bin/ps', ['-eo', 'pid=,ppid=,pcpu=,rss=,args='], {
        encoding: 'utf8',
        timeout: 3000
    });
    return parseProcessTable(output).map((process) => ({
        ...process,
        swap_bytes: readProcessSwapBytes(process.pid)
    }));
}

function readDuSizes(targets) {
    const existing = targets.filter((target) => fs.existsSync(target.path));
    if (!existing.length || process.platform !== 'linux') return Promise.resolve(new Map());
    return new Promise((resolve, reject) => {
        const useIonice = fs.existsSync('/usr/bin/ionice');
        const command = useIonice ? '/usr/bin/ionice' : '/usr/bin/du';
        const args = useIonice
            ? ['-c', '3', '/usr/bin/du', '-s', '-x', '-B1', '--', ...existing.map((target) => target.path)]
            : ['-s', '-x', '-B1', '--', ...existing.map((target) => target.path)];
        execFile(command, args, {
            encoding: 'utf8',
            timeout: 20000,
            maxBuffer: 1024 * 1024
        }, (error, output) => {
            if (error) return reject(error);
            const sizes = new Map();
            output.split('\n').filter(Boolean).forEach((line) => {
                const match = line.match(/^(\d+)\s+(.+)$/);
                if (match) sizes.set(path.normalize(match[2]), Number(match[1]) || 0);
            });
            resolve(sizes);
        });
    });
}

async function buildStorageSnapshot(diskTotal) {
        const projectSizes = await readDuSizes(PROJECTS);
        const dependencyTargets = PROJECTS.flatMap((project) => project.dependencies.map((dependencyPath) => ({ path: dependencyPath })));
        const dependencySizes = await readDuSizes(dependencyTargets);
        const otherSizes = await readDuSizes(OTHER_STORAGE);
        const projects = PROJECTS
            .filter((project) => projectSizes.has(path.normalize(project.path)))
            .map((project) => {
                const bytes = projectSizes.get(path.normalize(project.path)) || 0;
                const dependencyBytes = project.dependencies.reduce((sum, dependencyPath) => sum + (dependencySizes.get(path.normalize(dependencyPath)) || 0), 0);
                return {
                    id: project.id,
                    name: project.name,
                    path: project.path,
                    type: project.type || 'application',
                    bytes,
                    dependency_bytes: dependencyBytes,
                    dependency_percent: bytes ? (dependencyBytes / bytes) * 100 : 0,
                    disk_percent: diskTotal ? (bytes / diskTotal) * 100 : 0
                };
            })
            .sort((a, b) => b.bytes - a.bytes);
        const other = OTHER_STORAGE
            .filter((item) => otherSizes.has(path.normalize(item.path)))
            .map((item) => ({
                ...item,
                bytes: otherSizes.get(path.normalize(item.path)) || 0,
                disk_percent: diskTotal ? ((otherSizes.get(path.normalize(item.path)) || 0) / diskTotal) * 100 : 0
            }))
            .sort((a, b) => b.bytes - a.bytes);
        return {
            updated_at: new Date().toISOString(),
            cached: false,
            projects,
            other,
            top_level: [],
            totals: {
                project_bytes: projects.reduce((sum, item) => sum + item.bytes, 0),
                dependency_bytes: projects.reduce((sum, item) => sum + item.dependency_bytes, 0),
                rollback_bytes: projects.filter((item) => item.type === 'rollback').reduce((sum, item) => sum + item.bytes, 0),
                backup_bytes: other.filter((item) => item.type === 'backup').reduce((sum, item) => sum + item.bytes, 0),
                log_bytes: other.filter((item) => item.type === 'log').reduce((sum, item) => sum + item.bytes, 0),
                cache_bytes: other.filter((item) => item.type === 'cache').reduce((sum, item) => sum + item.bytes, 0)
            }
        };
}

function startStorageRefresh(diskTotal) {
    const refresh = buildStorageSnapshot(diskTotal)
        .then((snapshot) => {
            storageCache.fetchedAt = Date.now();
            storageCache.snapshot = snapshot;
            return snapshot;
        })
        .catch((error) => storageCache.snapshot
            ? { ...storageCache.snapshot, cached: true, error: error.message }
            : { updated_at: new Date().toISOString(), cached: false, projects: [], other: [], top_level: [], totals: {}, error: error.message })
        .finally(() => {
            if (storageCache.pending === refresh) storageCache.pending = null;
        });
    storageCache.pending = refresh;
    return refresh;
}

async function getStorageSnapshot(diskTotal) {
    const now = Date.now();
    if (storageCache.snapshot && now - storageCache.fetchedAt < STORAGE_CACHE_MS) {
        return { ...storageCache.snapshot, cached: true };
    }

    const refresh = storageCache.pending || startStorageRefresh(diskTotal);
    if (storageCache.snapshot) return { ...storageCache.snapshot, cached: true, refreshing: true };
    return refresh;
}

async function getResourceUsage({ pm2Processes, apps, totalMemory, diskTotal }) {
    try {
        const processes = readProcessTable();
        const applications = buildApplicationUsage(pm2Processes, apps, processes, totalMemory);
        const ownerByPid = new Map();
        applications.forEach((application) => {
            collectProcessTree(application.pid, processes).forEach((process) => ownerByPid.set(process.pid, application.name));
        });
        return {
            updated_at: new Date().toISOString(),
            applications,
            top_memory_processes: [...processes]
                .sort((a, b) => b.rss_bytes - a.rss_bytes)
                .slice(0, 12)
                .map((process) => ({ ...process, owner: ownerByPid.get(process.pid) || null })),
            top_cpu_processes: [...processes]
                .sort((a, b) => b.cpu - a.cpu)
                .slice(0, 12)
                .map((process) => ({ ...process, owner: ownerByPid.get(process.pid) || null })),
            storage: await getStorageSnapshot(diskTotal)
        };
    } catch (error) {
        return { updated_at: new Date().toISOString(), applications: [], top_memory_processes: [], top_cpu_processes: [], storage: await getStorageSnapshot(diskTotal), error: error.message };
    }
}

module.exports = { buildApplicationUsage, collectProcessTree, getResourceUsage, parseProcessTable };
