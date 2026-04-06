const express = require('express');
const systemRoutes = require('./server/routes/system_db');

const app = express();
app.use(express.json());
app.use('/api/system', systemRoutes);

const mockRes = {
    json: (data) => console.log(JSON.stringify(data, null, 2)),
    status: (code) => {
        console.log(`Status: ${code}`);
        return {
            json: (data) => console.log(JSON.stringify(data, null, 2))
        };
    }
};

const mockReq = {
    query: { dryRun: 'true' },
    method: 'POST',
    url: '/wipe-and-scan'
};

app._router.handle(mockReq, mockRes, (err) => {
    if (err) console.error('Router error:', err);
    else console.log('Route not handled');
});
