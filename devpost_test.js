const axios = require('axios');
const cheerio = require('cheerio');

async function testDevpost() {
    try {
        const response = await axios.get('https://devpost.com/hackathons?search=open-to-all', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        const $ = cheerio.load(response.data);
        console.log("Loaded Devpost");

        $('.hackathon-tile').each((i, el) => {
            const url = $(el).find('a').attr('href');
            const title = $(el).find('.title').text().trim() || $(el).find('h3').text().trim();
            if (title && url) {
               console.log("Found:", title, url);
            }
        });

    } catch (e) {
        console.error(e.message);
    }
}
testDevpost();
