const http = require('http');
const fs = require('fs');
const path = require('path');

// Test Config
const PORT = 3001;
// Path obtained from logs: '3D Printer/ADXL/ADXL Mount Test/ADXL mount.stl'
const TEST_PATH = '3D Printer/ADXL/ADXL Mount Test/ADXL mount.stl';
const ENCODED_PATH = encodeURIComponent(TEST_PATH);

const options = {
    hostname: 'localhost',
    port: PORT,
    path: `/api/models/download?path=${ENCODED_PATH}`,
    method: 'GET',
};

console.log(`Testing GET http://localhost:${PORT}${options.path}`);

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    console.log(`HEADERS: ${JSON.stringify(res.headers)}`);

    if (res.statusCode === 200) {
        console.log("✅ Download Successful!");
    } else {
        console.error("❌ Download Failed");
    }

    // Consume response to free memory
    res.resume();
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
    console.error("Make sure the server is running on port 3001!");
});

req.end();
