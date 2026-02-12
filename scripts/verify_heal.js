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
        console.log("🚀 Requesting Heal Preview (Native HTTP)...");
        const data = await postRequest('http://localhost:3001/api/admin/library-heal-preview', JSON.stringify({ force: true }));

        if (!data.success) {
            console.error("❌ API Failed:", data.error);
            process.exit(1);
        }

        console.log(`✅ Preview Received. Changes proposed: ${data.previewResults.details.length}`);

        const lagartoFix = data.previewResults.details.find(d => d.model.includes('Lagarto'));

        if (lagartoFix) {
            const claimsSlug = lagartoFix.additions.some(a => a.includes('Slug') || a.includes('Slugs'));
            if (claimsSlug) {
                console.error("❌ TEST FAILED: Lagarto is still claiming Slug files!");
                console.log(JSON.stringify(lagartoFix, null, 2));
                process.exit(1);
            } else {
                console.log("✅ Lagarto is clean (no Slug claims).");
                console.log("Details for Lagarto:", JSON.stringify(lagartoFix, null, 2));
            }
        } else {
            console.log("ℹ️ No changes proposed for Lagarto (Good sign if it was previously claiming things).");
        }

        // Also check if Short_BTT_EDDY is claiming its own thumb correctly
        const bttFix = data.previewResults.details.find(d => d.model.includes('SHORT_BTT_EDDY'));
        if (bttFix) {
            console.log("Details for SHORT_BTT_EDDY:", JSON.stringify(bttFix, null, 2));
        }

        console.log("✅ Verification Passed.");

    } catch (err) {
        console.error("❌ Script Error:", err.message);
        process.exit(1);
    }
}

runVerification();
