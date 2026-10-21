// Hosting-network detection from the local DB-IP ASN Lite database (CC BY 4.0, "IP data by
// DB-IP"). Visits from data centres are usually automation; consumer ISPs, mobile carriers
// and privacy relays (iCloud Private Relay, Cloudflare WARP) are deliberately not listed.
const fs = require('fs');

const ASN_DB_PATH = process.env.ASN_DB_PATH || '/var/lib/server-monitor/dbip-asn-lite.mmdb';
const HOSTING_ASNS = new Set([
    14618, 16509, 8987, // Amazon
    396982, 15169, 19527, // Google (cloud and crawlers)
    8075, // Microsoft / Azure
    132203, 45090, // Tencent
    45102, 37963, // Alibaba
    14061, // DigitalOcean
    63949, // Linode
    16276, // OVH
    24940, // Hetzner
    51167, // Contabo
    20473, // Vultr / Choopa
    31898, // Oracle Cloud
    12876, // Scaleway
    60781, 28753, // Leaseweb
    9009, // M247
    212238, // Datacamp
    36352, // ColoCrossing
    53667, // FranTech
    47583, // Hostinger
    8560 // IONOS
]);
const HOSTING_NAME = /hosting|\bcloud\b|data ?cent(?:er|re)|\bservers?\b|\bvps\b|colocation|digitalocean|linode|\bovh\b|hetzner|contabo|vultr|choopa|tencent|alibaba|aliyun|oracle|scaleway|leaseweb|\bm247\b|amazon|azure|datacamp|frantech|colocrossing|hostinger/i;
// Consumer privacy relays share hosting-style networks with real people.
const NOT_HOSTING = new Set([13335, 36183, 54113]); // Cloudflare (WARP), Akamai and Fastly (iCloud Private Relay)

let state = { reader: null, mtime: 0, checked: 0 };

function reader() {
    if (Date.now() - state.checked < 3600000) return state.reader;
    state.checked = Date.now();
    try {
        const mtime = fs.statSync(ASN_DB_PATH).mtimeMs;
        if (mtime !== state.mtime) {
            const maxmind = require('maxmind');
            state = { reader: new maxmind.Reader(fs.readFileSync(ASN_DB_PATH)), mtime, checked: state.checked };
        }
    } catch {
        state.reader = null;
    }
    return state.reader;
}

/** `{ asn, org }` when the address belongs to a hosting network, otherwise null. */
function hostingNetwork(ip) {
    const db = reader();
    if (!db || !ip) return null;
    let record;
    try { record = db.get(ip); } catch { return null; }
    const asn = record?.autonomous_system_number;
    const org = record?.autonomous_system_organization || '';
    if (!asn || NOT_HOSTING.has(asn)) return null;
    return HOSTING_ASNS.has(asn) || HOSTING_NAME.test(org) ? { asn, org } : null;
}

module.exports = { hostingNetwork, ASN_DB_PATH, _setReaderForTests: (value) => { state = { reader: value, mtime: -1, checked: Date.now() }; } };
