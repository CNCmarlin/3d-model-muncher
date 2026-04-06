const http = require('http');
const fs = require('fs');

const path = encodeURIComponent('/models/uploads/Sonos_One__gen2__floorstands/Grommet2.stl');
http.get(`http://localhost:3001/api/models?modelUrl=${path}`, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        fs.writeFileSync('test-api.json', JSON.stringify(JSON.parse(data), null, 2));
        console.log("Done");
    });
});
