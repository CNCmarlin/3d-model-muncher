const http = require('http');

const data = JSON.stringify({
    modelIds: ['tv-4702633-M0QgUHJp-1'],
    force: true
});

const req = http.request({
    hostname: 'localhost',
    port: 3001,
    path: '/api/admin/generate-thumbnails',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
}, (res) => {
    let response = '';
    res.on('data', chunk => response += chunk);
    res.on('end', () => console.log('Response:', response));
});

req.on('error', console.error);
req.write(data);
req.end();
