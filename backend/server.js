const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
if (process.env.NODE_ENV === 'production') process.umask(0o077);

const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const browserSignalRoutes = require('./routes/browserSignals');
const visitorAnalyticsRoutes = require('./routes/visitorAnalytics');
const { startVisitorIngestion } = require('./visitorAnalytics');
const { startEmailReports } = require('./emailReports');
const security = require('./security');

const app = express();
const PORT = process.env.PORT || 4010;

app.set('trust proxy', 'loopback');
app.disable('x-powered-by');
app.use(helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'blob:'], fontSrc: ["'self'"], connectSrc: ["'self'"], workerSrc: ["'self'"], objectSrc: ["'none'"], baseUri: ["'none'"], frameAncestors: ["'none'"], formAction: ["'self'"], upgradeInsecureRequests: security.production() ? [] : null } },
    hsts: security.production() ? { maxAge: 31536000, includeSubDomains: false } : false,
    referrerPolicy: { policy: 'no-referrer' }
}));
app.use((req,res,next) => {
    if (security.production() && req.hostname !== new URL(security.origin()).hostname) {
        if (/^\/serve-monitor\/api\/(auth|vault)(\/|$)/.test(req.path)) return res.status(403).json({ error: 'יש להשתמש בכתובת הניטור הראשית.' });
        if (req.path.startsWith('/serve-monitor') && !req.path.startsWith('/serve-monitor/api/')) return res.redirect(302, security.origin() + req.originalUrl);
    }
    next();
});
app.use('/serve-monitor/api/vault/rotate', authRoutes.authenticateToken, security.owner, (req,res,next)=>security.limit(require('./database'),req,res,'rotation-body',5)?next():undefined, express.json({ limit: '16mb' }));
app.use(express.json({ limit: '128kb' }));
app.use(morgan(':method :url :status :response-time ms', { skip: req => /^\/serve-monitor\/api\/(auth|vault)/.test(req.originalUrl) }));

// Routes
app.use('/serve-monitor/api/auth', authRoutes);
app.use('/serve-monitor/api/vault', require('./routes/vault'));
app.use('/serve-monitor/api/apps', apiRoutes);
app.use('/serve-monitor/api/browser-signals', browserSignalRoutes);
app.use('/serve-monitor/api/visitor-analytics', visitorAnalyticsRoutes);
app.use('/serve-monitor/api/client-growth', require('./routes/clientGrowth'));
app.use('/serve-monitor/api', (req, res) => res.status(404).json({ error: 'הנתיב לא נמצא.' }));

// Serve frontend
const distPath = path.join(__dirname, '../frontend/dist');
app.use('/serve-monitor', express.static(distPath, {
    setHeaders: (res, file) => { if (file.endsWith('.html')) res.set('Cache-Control', 'no-store'); }
}));

app.use('/serve-monitor', (req, res) => {
    // A missing deployment chunk must fail, never return HTML as JavaScript.
    if (req.path.startsWith('/assets/')) return res.sendStatus(404);
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(distPath, 'index.html'));
});

app.use((req, res) => {
    res.redirect('/serve-monitor');
});

app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.type === 'entity.too.large' ? 413 : error instanceof SyntaxError ? 400 : 500;
    res.status(status).json({ error: status === 413 ? 'הבקשה גדולה מדי.' : status === 400 ? 'הבקשה אינה תקינה.' : 'הפעולה נכשלה. נסו שוב.' });
});

if (require.main === module) app.listen(PORT, '127.0.0.1', () => {
    require('./monitor');
    console.log(`Server Monitor API running on port ${PORT}`);
    startVisitorIngestion();
    startEmailReports();
    require('./growthSources').startGrowthSources();
});
module.exports = app;
