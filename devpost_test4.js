const axios = require('axios');

async function testDevpost() {
    try {
        const response = await axios.get('https://devpost.com/api/hackathons', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        console.log("Loaded Devpost API");

        response.data.hackathons.forEach(h => {
             console.log(h.title, h.url);
        })
    } catch (e) {
        console.error(e.message);
    }
}
testDevpost();
