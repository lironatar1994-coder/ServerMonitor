function normalizeWhatsappStatus(rawStatus) {
    const qr = rawStatus?.qr || rawStatus?.qrCode || rawStatus?.qr_code || null;
    const status = (rawStatus?.status || '').toString().trim().toUpperCase();
    return { status: status || (qr ? 'NEEDS_SCAN' : 'UNKNOWN'), qr,
        updatedAt: rawStatus?.updatedAt || rawStatus?.updated_at || null };
}

function whatsappRuntimeStatus(rawStatus, pm2Online) {
    const connection = normalizeWhatsappStatus(rawStatus);
    return { ...connection, status: pm2Online ? connection.status : 'STOPPED',
        qr: pm2Online ? connection.qr : null, isOnline: Boolean(pm2Online), pm2Online: Boolean(pm2Online) };
}

module.exports = { normalizeWhatsappStatus, whatsappRuntimeStatus };
