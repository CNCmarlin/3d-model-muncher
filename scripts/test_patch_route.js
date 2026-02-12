const http = require('http');

const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/models/test-id-for-verification',
    method: 'PATCH',
    headers: {
        'Content-Type': 'application/json'
    }
};

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    console.log(`HEADERS: ${JSON.stringify(res.headers)}`);

    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        console.log('BODY:', data);
        if (res.headers['content-type'] && res.headers['content-type'].includes('application/json')) {
            console.log('✅ Success: Response is JSON');
            try {
                const json = JSON.parse(data);
                // It might return 404 "Model not found" which is fine, as long as it's JSON
                if (json.error === 'Model not found' || json.success === false) {
                    console.log('✅ Route exists (returned expected 404/400 JSON for non-existent model)');
                } else {
                    console.log('✅ Route exists and returned result');
                }
            } catch (e) {
                console.error('❌ Failed to parse JSON:', e);
            }
        } else {
            console.error('❌ Failure: Response is NOT JSON (likely HTML 404/500)');
        }
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

// Write data to request body
req.write(JSON.stringify({ description: 'Test Patch' }));
req.end();
