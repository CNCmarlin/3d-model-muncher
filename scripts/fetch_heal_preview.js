const http = require('http');
const fs = require('fs');

const postData = JSON.stringify({});

const options = {
    hostname: 'localhost',
    port: 3001, // Assuming standard port
    path: '/api/admin/library-heal-preview',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': postData.length
    }
};

console.log(`Fetching Heal Preview from http://localhost:3001...`);

const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        if (res.statusCode === 200) {
            console.log('Success! Writing output to heal_preview_full.json');
            fs.writeFileSync('heal_preview_full.json', data);

            try {
                const json = JSON.parse(data);
                console.log(`Preview returned ${json.previewResults.details.length} changes.`);

                // Summarize for console
                const summary = json.previewResults.details.slice(0, 10).map(d => ({
                    model: d.model,
                    add: d.additions.length,
                    del: d.deletions.length
                }));
                console.log('Sample:', summary);
            } catch (e) {
                console.error('Failed to parse JSON response');
            }
        } else {
            console.error(`API Error: ${res.statusCode}`);
            console.error(data);
        }
    });
});

req.on('error', (e) => {
    console.error('Request failed:', e.message);
});

req.write(postData);
req.end();
