const http = require('http');

function postRequest(url, data) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(body);
                    resolve(json);
                } catch (e) {
                    reject(new Error(`Failed to parse response: ${body}`));
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.write(data);
        req.end();
    });
}

async function runVerification() {
    try {
        console.log("🚀 Requesting Heal Preview...");
        const data = await postRequest('http://localhost:3001/api/admin/library-heal-preview', JSON.stringify({ force: true }));

        if (!data.success) {
            console.error("❌ API Failed:", data.error);
            process.exit(1);
        }

        const details = data.previewResults.details;
        console.log(`✅ Preview Received. ${details.length} proposals.`);

        let recoveryContextFound = false;
        let bakFileFound = false;

        details.forEach(detail => {
            detail.additions.forEach(add => {
                // Check for Recovery Context
                if (add.includes('Recovered filePath') && (add.includes('Was: Missing') || add.includes('Was: Empty'))) {
                    recoveryContextFound = true;
                }
                // Check for BAK files (should NOT be present)
                if (add.toLowerCase().includes('.bak')) {
                    bakFileFound = true;
                    console.error(`❌ Found .bak file in additions: ${add}`);
                }
            });
            detail.deletions.forEach(del => {
                if (del.toLowerCase().includes('.bak')) {
                    if (del.includes('(Cleanup - Backup file)')) {
                        // Allow intentional cleanup
                    } else {
                        bakFileFound = true;
                        console.error(`❌ Found .bak file in deletions (unexpected): ${del}`);
                    }
                }
            });
        });

        if (recoveryContextFound) {
            console.log("✅ Recovery Context messages detected!");
        } else {
            console.warn("⚠️ No Recovery Context messages found. (Maybe no files needed recovery?)");
        }

        if (!bakFileFound) {
            console.log("✅ No .bak files found in proposals.");
        } else {
            console.error("❌ .bak files still present in proposals!");
            process.exit(1);
        }

    } catch (err) {
        console.error("❌ Script Error:", err.message);
        process.exit(1);
    }
}

runVerification();
