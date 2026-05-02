const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
require('./monitor'); // Start background monitor

const app = express();
const PORT = process.env.PORT || 4010;

app.use(cors());
app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for now to ensure resources load
    hsts: false,                 // Disable HSTS since we are on HTTP
}));
app.use(express.json());
app.use(morgan('dev'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/apps', apiRoutes);

// Serve frontend
const distPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(distPath));

app.use((req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server Monitor API running on port ${PORT}`);
});
