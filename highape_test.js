const axios = require('axios');
const cheerio = require('cheerio');

async function testHighApe() {
    try {
        const response = await axios.get('https://highape.com/bangalore/free-events', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        const $ = cheerio.load(response.data);
        console.log("Loaded highape free events");

        $('a[href^="/bangalore/events/"]').each((i, el) => {
            const url = 'https://highape.com' + $(el).attr('href');
            const title = $(el).find('h3').text().trim() || $(el).find('img').attr('alt');
            if (title && url) {
               console.log("Found:", title, url);
            }
        });

    } catch (e) {
        console.error(e.message);
    }
}
testHighApe();
