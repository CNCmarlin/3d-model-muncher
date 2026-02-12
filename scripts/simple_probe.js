const http = require('http');

const req = http.request({
    hostname: 'localhost',
    port: 3001,
    path: '/api/admin/library-heal-preview',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
}, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
    res.resume();
});

req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
});

req.write(JSON.stringify({ force: true }));
req.end();
