const axios = require('axios');
const cheerio = require('cheerio');

async function testMeetup() {
    try {
        const response = await axios.get('https://www.meetup.com/find/?location=Bangalore%2C%20IN&source=EVENTS', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        const $ = cheerio.load(response.data);
        console.log("Loaded Meetup");

        $('script[type="application/ld+json"]').each((i, el) => {
            const data = JSON.parse($(el).html());
            console.log(data);
        });

    } catch (e) {
        console.error(e.message);
    }
}
testMeetup();
