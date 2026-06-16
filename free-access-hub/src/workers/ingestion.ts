import { Worker, Queue } from 'bullmq';
import prisma from "../lib/prisma";
import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import redis from '../lib/redis';
import Parser from 'rss-parser';

export const ingestionQueue = new Queue('ingestion-queue', { connection: redis as unknown as import("bullmq").ConnectionOptions });
const parser = new Parser();

const hashEvent = (title: string, source: string) => {
  return crypto.createHash('sha256').update(`${title}-${source}`).digest('hex');
};

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

export function calculateSpamRating(title: string, description: string): number {
  let score = 0;
  const targetText = `${title} ${description}`.toLowerCase();
  const penaltyWords = ['course discount', 'buy ticket', 'consultation call', 'marketing webinar', 'paid upgrade'];
  for (const word of penaltyWords) {
    if (targetText.includes(word)) score += 35;
  }
  return score;
}

export async function validateActiveLinks(): Promise<void> {
  const activeEvents = await prisma.unifiedEvent.findMany({
    where: { isActive: true },
    take: 50
  });

  for (const event of activeEvents) {
    try {
      const response = await axios.get(event.registrationUrl, {
        timeout: 5000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const bodyText = (typeof response.data === 'string' ? response.data : JSON.stringify(response.data)).toLowerCase();
      if (
        bodyText.includes("no longer accepting responses") ||
        bodyText.includes("form has been closed") ||
        bodyText.includes("registration is full") ||
        response.status >= 400
      ) {
        await prisma.unifiedEvent.update({ where: { id: event.id }, data: { isActive: false } });
      }
    } catch (error) {
       await prisma.unifiedEvent.update({ where: { id: event.id }, data: { isActive: false } });
    }
    await delay(1000);
  }
}

export async function ingestHNAlgolia() {
    try {
        console.log("Fetching HN Algolia...");
        // Modified query to capture broader AI launches
        const response = await axios.get('https://hn.algolia.com/api/v1/search?query=(swag OR "free credits" OR "launch hn" OR "free api")', {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const hits = response.data.hits;
        let count = 0;

        for (const hit of hits.slice(0, 5)) {
            const title = hit.title || hit.story_title;
            if (!title) continue;

            const url = hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`;
            const spamScore = calculateSpamRating(title, hit.story_text || '');
            if (spamScore > 30) continue;

            const id = hashEvent(title, 'HackerNews');
            const eventTimestamp = new Date(hit.created_at);

            // Basic categorization based on title context
            const isAI = title.toLowerCase().includes('ai') || title.toLowerCase().includes('model') || title.toLowerCase().includes('llm');

            const upsertedEvent = await prisma.unifiedEvent.upsert({
                where: { id },
                update: { updatedAt: new Date(), isActive: true },
                create: {
                    id,
                    title,
                    sourcePlatform: 'HackerNews',
                    category: isAI ? 'AI_TOOLS' : 'TECH_MEETUP',
                    deliveryType: 'VIRTUAL',
                    perks: isAI ? ['Free AI Credits', 'Launch'] : ['Open Source Swag'],
                    eventTimestamp,
                    registrationUrl: url,
                    venueName: 'Hacker News Thread',
                    city: 'global',
                    mediaType: isAI ? 'DEVELOPER_API' : null,
                    spamScore
                }
            });

            if (upsertedEvent.createdAt.getTime() === upsertedEvent.updatedAt.getTime() || (Date.now() - upsertedEvent.updatedAt.getTime() < 10000)) {
                count++;
                await redis.publish('events:live', JSON.stringify({ type: 'NEW_EVENT', data: upsertedEvent }));
            }
        }
        return count;
    } catch (err: unknown) {
        return 0;
    }
}

export async function ingestProductHuntRSS() {
    try {
        console.log("Fetching ProductHunt RSS...");
        const feedData = await parser.parseURL('https://www.producthunt.com/feed');
        let count = 0;

        for (const item of feedData.items.slice(0, 5)) {
            if (!item.title || !item.link) continue;

            const spamScore = calculateSpamRating(item.title, item.contentSnippet || '');
            if (spamScore > 30) continue;

            const id = hashEvent(item.title, 'ProductHunt');
            const eventTimestamp = item.pubDate ? new Date(item.pubDate) : new Date();

            const isAI = item.title.toLowerCase().includes('ai') || (item.contentSnippet || '').toLowerCase().includes('ai');

            const upsertedEvent = await prisma.unifiedEvent.upsert({
                where: { id },
                update: { updatedAt: new Date(), isActive: true },
                create: {
                    id,
                    title: `PH Launch: ${item.title}`,
                    sourcePlatform: 'ProductHunt',
                    category: isAI ? 'AI_TOOLS' : 'SWAG_GOODIES',
                    deliveryType: 'VIRTUAL',
                    perks: ['Beta Access', 'Credits'],
                    eventTimestamp,
                    registrationUrl: item.link,
                    venueName: 'Product Hunt',
                    city: 'global',
                    spamScore
                }
            });

            if (upsertedEvent.createdAt.getTime() === upsertedEvent.updatedAt.getTime() || (Date.now() - upsertedEvent.updatedAt.getTime() < 10000)) {
                count++;
                await redis.publish('events:live', JSON.stringify({ type: 'NEW_EVENT', data: upsertedEvent }));
            }
        }
        return count;
    } catch (err: unknown) {
        return 0;
    }
}

export async function ingestDevpostAPI() {
    try {
        console.log("Fetching Devpost API...");
        const response = await axios.get('https://devpost.com/api/hackathons', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });

        let count = 0;
        const hackathons = response.data.hackathons || [];

        for (const h of hackathons.slice(0, 5)) {
            const title = h.title;
            const url = h.url;
            if (!title || !url) continue;

            const spamScore = calculateSpamRating(title, '');
            if (spamScore > 30) continue;

            const id = hashEvent(title, 'Devpost');
            const eventTimestamp = new Date(Date.now() + 86400000 * 7);

            const upsertedEvent = await prisma.unifiedEvent.upsert({
                where: { id },
                update: { updatedAt: new Date(), isActive: true },
                create: {
                    id,
                    title: `Hackathon Launch: ${title}`,
                    sourcePlatform: 'Devpost',
                    category: 'SWAG_GOODIES',
                    deliveryType: 'VIRTUAL',
                    perks: ['Developer Swag', 'Cloud Credits'],
                    eventTimestamp,
                    registrationUrl: url,
                    venueName: 'Global Online Submission',
                    city: 'global',
                    spamScore
                }
            });

            if (upsertedEvent.createdAt.getTime() === upsertedEvent.updatedAt.getTime() || (Date.now() - upsertedEvent.updatedAt.getTime() < 10000)) {
                count++;
                await redis.publish('events:live', JSON.stringify({ type: 'NEW_EVENT', data: upsertedEvent }));
            }
        }
        return count;
    } catch (err: unknown) {
        return 0;
    }
}

export async function ingestRedditJSON() {
    try {
        console.log("Fetching Reddit JSON...");
        const response = await axios.get('https://www.reddit.com/r/freebies/new.json?limit=5', {
             headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const posts = response.data.data.children;
        let count = 0;

        for (const post of posts) {
            const data = post.data;
            if (!data.title || data.is_self) continue;

            const spamScore = calculateSpamRating(data.title, data.selftext || '');
            if (spamScore > 30) continue;

            const id = hashEvent(data.title, 'Reddit');
            const eventTimestamp = new Date(data.created_utc * 1000);

            const upsertedEvent = await prisma.unifiedEvent.upsert({
                where: { id },
                update: { updatedAt: new Date(), isActive: true },
                create: {
                    id,
                    title: data.title,
                    sourcePlatform: 'Reddit',
                    category: 'SWAG_GOODIES',
                    deliveryType: 'VIRTUAL',
                    perks: ['Freebie'],
                    eventTimestamp,
                    registrationUrl: data.url || `https://reddit.com${data.permalink}`,
                    venueName: 'Online',
                    city: 'global',
                    spamScore
                }
            });

            if (upsertedEvent.createdAt.getTime() === upsertedEvent.updatedAt.getTime() || (Date.now() - upsertedEvent.updatedAt.getTime() < 10000)) {
                count++;
                await redis.publish('events:live', JSON.stringify({ type: 'NEW_EVENT', data: upsertedEvent }));
            }
        }
        return count;
    } catch (err: unknown) {
        return 0;
    }
}

export async function ingestGithubIssues() {
    try {
        console.log("Fetching GitHub Issues...");
        const response = await axios.get('https://api.github.com/search/issues?q=label:free-swag+state:open', {
             headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const items = response.data.items || [];
        let count = 0;

        for (const item of items.slice(0, 5)) {
            if (!item.title || !item.html_url) continue;

            const spamScore = calculateSpamRating(item.title, item.body || '');
            if (spamScore > 30) continue;

            const id = hashEvent(item.title, 'GitHub');
            const eventTimestamp = new Date(item.created_at);

            const upsertedEvent = await prisma.unifiedEvent.upsert({
                where: { id },
                update: { updatedAt: new Date(), isActive: true },
                create: {
                    id,
                    title: `GitHub Issue: ${item.title}`,
                    sourcePlatform: 'GitHub',
                    category: 'SWAG_GOODIES',
                    deliveryType: 'VIRTUAL',
                    perks: ['Open Source Swag'],
                    eventTimestamp,
                    registrationUrl: item.html_url,
                    venueName: 'GitHub Repo',
                    city: 'global',
                    spamScore
                }
            });

            if (upsertedEvent.createdAt.getTime() === upsertedEvent.updatedAt.getTime() || (Date.now() - upsertedEvent.updatedAt.getTime() < 10000)) {
                count++;
                await redis.publish('events:live', JSON.stringify({ type: 'NEW_EVENT', data: upsertedEvent }));
            }
        }
        return count;
    } catch (err: unknown) {
        return 0;
    }
}

export async function ingestCNCFEvents() {
    try {
        console.log("Fetching CNCF Events...");
        const response = await axios.get('https://community.cncf.io/api/event/', {
             headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const items = response.data.results || [];
        let count = 0;

        for (const item of items.slice(0, 5)) {
            if (!item.title || !item.url || item.status !== 'Published') continue;

            const spamScore = calculateSpamRating(item.title, '');
            if (spamScore > 30) continue;

            const id = hashEvent(item.title, 'CNCF');
            const eventTimestamp = item.start_date ? new Date(item.start_date) : new Date();

            const upsertedEvent = await prisma.unifiedEvent.upsert({
                where: { id },
                update: { updatedAt: new Date(), isActive: true },
                create: {
                    id,
                    title: `${item.title}`,
                    sourcePlatform: 'CNCF',
                    category: 'TECH_MEETUP',
                    deliveryType: 'ONSITE',
                    perks: ['Networking', 'Swag Potential'],
                    eventTimestamp,
                    registrationUrl: item.url,
                    venueName: 'CNCF Chapter',
                    city: item.chapter?.city?.toLowerCase() || 'global',
                    spamScore,
                    spotsRemaining: null
                }
            });

            if (upsertedEvent.createdAt.getTime() === upsertedEvent.updatedAt.getTime() || (Date.now() - upsertedEvent.updatedAt.getTime() < 10000)) {
                count++;
                await redis.publish('events:live', JSON.stringify({ type: 'NEW_EVENT', data: upsertedEvent }));
            }
        }
        return count;
    } catch (err: unknown) {
        return 0;
    }
}

export async function ingestGDGEvents() {
    try {
        console.log("Fetching GDG Events...");
        const response = await axios.get('https://gdg.community.dev/api/event/', {
             headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const items = response.data.results || [];
        let count = 0;

        for (const item of items.slice(0, 5)) {
            if (!item.title || !item.url || item.status !== 'Published') continue;

            const spamScore = calculateSpamRating(item.title, '');
            if (spamScore > 30) continue;

            const id = hashEvent(item.title, 'GDG');
            const eventTimestamp = item.start_date ? new Date(item.start_date) : new Date();

            const upsertedEvent = await prisma.unifiedEvent.upsert({
                where: { id },
                update: { updatedAt: new Date(), isActive: true },
                create: {
                    id,
                    title: `${item.title}`,
                    sourcePlatform: 'GDG',
                    category: 'TECH_MEETUP',
                    deliveryType: 'ONSITE',
                    perks: ['Google Tech', 'Swag Kit'],
                    eventTimestamp,
                    registrationUrl: item.url,
                    venueName: 'GDG Chapter',
                    city: item.chapter?.city?.toLowerCase() || 'global',
                    spamScore,
                    spotsRemaining: null
                }
            });

            if (upsertedEvent.createdAt.getTime() === upsertedEvent.updatedAt.getTime() || (Date.now() - upsertedEvent.updatedAt.getTime() < 10000)) {
                count++;
                await redis.publish('events:live', JSON.stringify({ type: 'NEW_EVENT', data: upsertedEvent }));
            }
        }
        return count;
    } catch (err: unknown) {
        return 0;
    }
}

export async function ingestAtlassianEvents() {
    try {
        console.log("Fetching Atlassian Events...");
        const response = await axios.get('https://ace.atlassian.com/api/event/', {
             headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const items = response.data.results || [];
        let count = 0;

        for (const item of items.slice(0, 5)) {
            if (!item.title || !item.url || item.status !== 'Published') continue;

            const spamScore = calculateSpamRating(item.title, '');
            if (spamScore > 30) continue;

            const id = hashEvent(item.title, 'Atlassian');
            const eventTimestamp = item.start_date ? new Date(item.start_date) : new Date();

            const upsertedEvent = await prisma.unifiedEvent.upsert({
                where: { id },
                update: { updatedAt: new Date(), isActive: true },
                create: {
                    id,
                    title: `${item.title}`,
                    sourcePlatform: 'Atlassian',
                    category: 'TECH_MEETUP',
                    deliveryType: 'ONSITE',
                    perks: ['Networking', 'Atlassian Swag'],
                    eventTimestamp,
                    registrationUrl: item.url,
                    venueName: 'Atlassian ACE Chapter',
                    city: item.chapter?.city?.toLowerCase() || 'global',
                    spamScore,
                    spotsRemaining: null
                }
            });

            if (upsertedEvent.createdAt.getTime() === upsertedEvent.updatedAt.getTime() || (Date.now() - upsertedEvent.updatedAt.getTime() < 10000)) {
                count++;
                await redis.publish('events:live', JSON.stringify({ type: 'NEW_EVENT', data: upsertedEvent }));
            }
        }
        return count;
    } catch (err: unknown) {
        return 0;
    }
}

export async function ingestHighApe() {
    try {
        console.log("Fetching HighApe Free Events...");
        const response = await axios.get('https://highape.com/bangalore/free-events', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        const $ = cheerio.load(response.data);
        let count = 0;

        const tiles = $('a[href^="/bangalore/events/"]').toArray();
        for (const element of tiles.slice(0, 5)) {
            const urlPath = $(element).attr('href');
            const title = $(element).find('h3').text().trim();

            if (title && urlPath) {
                const fullUrl = `https://highape.com${urlPath}`;
                const spamScore = calculateSpamRating(title, '');
                if (spamScore > 30) continue;

                const id = hashEvent(title, 'HighApe');
                const eventTimestamp = new Date(Date.now() + 86400000);

                const upsertedEvent = await prisma.unifiedEvent.upsert({
                    where: { id },
                    update: { updatedAt: new Date(), isActive: true },
                    create: {
                        id,
                        title: `${title}`,
                        sourcePlatform: 'HighApe',
                        category: 'NIGHTLIFE',
                        deliveryType: 'ONSITE',
                        perks: ['Free Entry'],
                        eventTimestamp,
                        registrationUrl: fullUrl,
                        venueName: 'Bangalore Club',
                        city: 'bangalore',
                        spamScore,
                        spotsRemaining: null
                    }
                });

                if (upsertedEvent.createdAt.getTime() === upsertedEvent.updatedAt.getTime() || (Date.now() - upsertedEvent.updatedAt.getTime() < 10000)) {
                    count++;
                    await redis.publish('events:live', JSON.stringify({ type: 'NEW_EVENT', data: upsertedEvent }));
                }
            }
        }
        return count;
    } catch (err: unknown) {
        return 0;
    }
}

export async function ingestMeetupEvents() {
    const cities = ["Bangalore%2C%20IN", "Mumbai%2C%20IN", "San%20Francisco%2C%20CA", "New%20York%2C%20NY"];
    let count = 0;

    for (const city of cities) {
        try {
            console.log(`Fetching Meetup Events for ${city}...`);
            const response = await axios.get(`https://www.meetup.com/find/?location=${city}&source=EVENTS`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
            });
            const $ = cheerio.load(response.data);

            const scripts = $('script[type="application/ld+json"]').toArray();
            for (const element of scripts) {
                try {
                    const data = JSON.parse($(element).html() || '[]');
                    if (Array.isArray(data)) {
                        for (const item of data) {
                            if (item['@type'] === 'Event' && item.name && item.url) {

                                const spamScore = calculateSpamRating(item.name, '');
                                if (spamScore > 30) continue;

                                const id = hashEvent(item.name, 'Meetup');
                                const eventTimestamp = item.startDate ? new Date(item.startDate) : new Date(Date.now() + 86400000);
                                const deliveryType = item.location?.name ? 'ONSITE' : 'VIRTUAL';
                                const venueName = item.location?.name || 'Virtual Meetup';
                                const parsedCity = item.location?.address?.addressLocality || 'global';

                                const upsertedEvent = await prisma.unifiedEvent.upsert({
                                    where: { id },
                                    update: { updatedAt: new Date(), isActive: true },
                                    create: {
                                        id,
                                        title: `${item.name}`,
                                        sourcePlatform: 'Meetup',
                                        category: 'TECH_MEETUP',
                                        deliveryType,
                                        perks: ['Networking'],
                                        eventTimestamp,
                                        registrationUrl: item.url,
                                        venueName,
                                        city: parsedCity.toLowerCase(),
                                        spamScore,
                                        spotsRemaining: null
                                    }
                                });

                                if (upsertedEvent.createdAt.getTime() === upsertedEvent.updatedAt.getTime() || (Date.now() - upsertedEvent.updatedAt.getTime() < 10000)) {
                                    count++;
                                    await redis.publish('events:live', JSON.stringify({ type: 'NEW_EVENT', data: upsertedEvent }));
                                }
                            }
                        }
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            }
        } catch (err: unknown) {
             console.error(`Meetup fetch failed for ${city}`);
        }
        await delay(1500); // Small backoff between cities
    }
    return count;
}

export async function ingestHasGeekEvents() {
    try {
        console.log("Fetching HasGeek Events...");
        const response = await axios.get('https://hasgeek.com/', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        const $ = cheerio.load(response.data);
        let count = 0;

        const links = $('.card__body__title a').toArray();
        for (const element of links.slice(0, 5)) {
            const urlPath = $(element).attr('href');
            const title = $(element).text().trim();

            if (title && urlPath && urlPath.startsWith('/')) {
                const fullUrl = `https://hasgeek.com${urlPath}`;
                const spamScore = calculateSpamRating(title, '');
                if (spamScore > 30) continue;

                const id = hashEvent(title, 'HasGeek');
                const eventTimestamp = new Date(Date.now() + 86400000 * 3);

                const upsertedEvent = await prisma.unifiedEvent.upsert({
                    where: { id },
                    update: { updatedAt: new Date(), isActive: true },
                    create: {
                        id,
                        title: `${title}`,
                        sourcePlatform: 'HasGeek',
                        category: 'TECH_MEETUP',
                        deliveryType: 'ONSITE',
                        perks: ['HasGeek Network'],
                        eventTimestamp,
                        registrationUrl: fullUrl,
                        venueName: 'TBA',
                        city: 'bangalore',
                        spamScore,
                        spotsRemaining: null
                    }
                });

                if (upsertedEvent.createdAt.getTime() === upsertedEvent.updatedAt.getTime() || (Date.now() - upsertedEvent.updatedAt.getTime() < 10000)) {
                    count++;
                    await redis.publish('events:live', JSON.stringify({ type: 'NEW_EVENT', data: upsertedEvent }));
                }
            }
        }
        return count;
    } catch (err: unknown) {
        return 0;
    }
}

export async function ingestHeadstartEvents() {
    try {
        console.log("Fetching Headstart Events...");
        const response = await axios.get('https://headstart.in/', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        const $ = cheerio.load(response.data);
        let count = 0;

        const nextData = $('#__NEXT_DATA__').html();
        if (nextData) {
            const parsed = JSON.parse(nextData);
            const events = parsed.props?.pageProps?.events || [];

            for (const e of events.slice(0, 5)) {
                if (!e.title || !e.slug) continue;

                const fullUrl = `https://headstart.in/event/${e.slug}`;
                const spamScore = calculateSpamRating(e.title, '');
                if (spamScore > 30) continue;

                const id = hashEvent(e.title, 'Headstart');
                const eventTimestamp = e.starts_at ? new Date(e.starts_at) : new Date(Date.now() + 86400000 * 3);

                const cityObj = e.location?.address_components?.find((c: { types: string[], long_name: string }) => c.types.includes('locality'));
                const city = cityObj?.long_name?.toLowerCase() || 'global';

                const upsertedEvent = await prisma.unifiedEvent.upsert({
                    where: { id },
                    update: { updatedAt: new Date(), isActive: true },
                    create: {
                        id,
                        title: `${e.title}`,
                        sourcePlatform: 'Headstart',
                        category: 'TECH_MEETUP',
                        deliveryType: 'ONSITE',
                        perks: ['Startup Network'],
                        eventTimestamp,
                        registrationUrl: fullUrl,
                        venueName: e.location?.name || 'TBA',
                        city: city,
                        spamScore,
                        spotsRemaining: null
                    }
                });

                if (upsertedEvent.createdAt.getTime() === upsertedEvent.updatedAt.getTime() || (Date.now() - upsertedEvent.updatedAt.getTime() < 10000)) {
                    count++;
                    await redis.publish('events:live', JSON.stringify({ type: 'NEW_EVENT', data: upsertedEvent }));
                }
            }
        }
        return count;
    } catch (err: unknown) {
        return 0;
    }
}

export async function ingestHuggingFace() {
    try {
        console.log("Fetching Hugging Face Models...");
        const response = await axios.get('https://huggingface.co/api/models?sort=createdAt&limit=5', {
             headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        let count = 0;

        for (const model of response.data) {
            if (!model.id) continue;

            const id = hashEvent(model.id, 'HuggingFace');
            const eventTimestamp = new Date(model.createdAt);

            const upsertedEvent = await prisma.unifiedEvent.upsert({
                where: { id },
                update: { updatedAt: new Date(), isActive: true },
                create: {
                    id,
                    title: `New Model: ${model.id}`,
                    sourcePlatform: 'HuggingFace',
                    category: 'AI_TOOLS',
                    deliveryType: 'VIRTUAL',
                    perks: ['Open Source Model'],
                    eventTimestamp,
                    registrationUrl: `https://huggingface.co/${model.id}`,
                    venueName: 'HF Hub',
                    city: 'global',
                    mediaType: 'TEXT_REASONING',
                    isFreeTierActive: true
                }
            });

            if (upsertedEvent.createdAt.getTime() === upsertedEvent.updatedAt.getTime() || (Date.now() - upsertedEvent.updatedAt.getTime() < 10000)) {
                count++;
                await redis.publish('events:live', JSON.stringify({ type: 'NEW_EVENT', data: upsertedEvent }));
            }
        }
        return count;
    } catch (err: unknown) {
        return 0;
    }
}

export async function ingestOpenRouter() {
    try {
        console.log("Fetching OpenRouter Free Models...");
        const response = await axios.get('https://openrouter.ai/api/v1/models', {
             headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const freeModels = response.data.data.filter((m: { pricing?: { prompt?: string } }) => m.pricing?.prompt === "0").slice(0, 5);
        let count = 0;

        for (const model of freeModels) {
            if (!model.id || !model.name) continue;

            const id = hashEvent(model.id, 'OpenRouter');
            const eventTimestamp = new Date(model.created * 1000);

            const upsertedEvent = await prisma.unifiedEvent.upsert({
                where: { id },
                update: { updatedAt: new Date(), isActive: true },
                create: {
                    id,
                    title: `Free API: ${model.name}`,
                    sourcePlatform: 'OpenRouter',
                    category: 'AI_TOOLS',
                    deliveryType: 'VIRTUAL',
                    perks: ['Free API Tokens'],
                    eventTimestamp,
                    registrationUrl: `https://openrouter.ai/models/${model.id}`,
                    venueName: 'OpenRouter API',
                    city: 'global',
                    mediaType: 'DEVELOPER_API',
                    isFreeTierActive: true
                }
            });

            if (upsertedEvent.createdAt.getTime() === upsertedEvent.updatedAt.getTime() || (Date.now() - upsertedEvent.updatedAt.getTime() < 10000)) {
                count++;
                await redis.publish('events:live', JSON.stringify({ type: 'NEW_EVENT', data: upsertedEvent }));
            }
        }
        return count;
    } catch (err: unknown) {
        return 0;
    }
}

// Queue Processing
const worker = new Worker('ingestion-queue', async job => {
    if (job.name === 'fetch-high-yield') {
        let total = 0;

        total += await ingestDevpostAPI();
        await delay(2000);
        total += await ingestRedditJSON();
        await delay(2000);
        total += await ingestHNAlgolia();
        await delay(2000);
        total += await ingestProductHuntRSS();
        await delay(2000);
        total += await ingestGithubIssues();
        await delay(2000);
        total += await ingestHighApe();
        await delay(2000);
        total += await ingestCNCFEvents();
        await delay(2000);
        total += await ingestGDGEvents();
        await delay(2000);
        total += await ingestAtlassianEvents();
        await delay(2000);
        total += await ingestMeetupEvents();
        await delay(2000);
        total += await ingestHasGeekEvents();
        await delay(2000);
        total += await ingestHeadstartEvents();
        await delay(2000);
        total += await ingestHuggingFace();
        await delay(2000);
        total += await ingestOpenRouter();

        console.log(`Ingestion cycle complete. Published ${total} active events.`);
    } else if (job.name === 'validate-links') {
        await validateActiveLinks();
        console.log(`Validation cycle complete.`);
    }
}, { connection: redis as unknown as import("bullmq").ConnectionOptions });

// Start recurring jobs
const startWorker = async () => {
    const repeatableJobs = await ingestionQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
        await ingestionQueue.removeRepeatableByKey(job.key);
    }

    await ingestionQueue.add('fetch-high-yield', {}, {
        repeat: {
            every: 60000 // every 60 seconds
        }
    });

    await ingestionQueue.add('validate-links', {}, {
        repeat: {
            every: 300000 // every 5 minutes
        }
    });

    // Run immediately once
    await ingestionQueue.add('fetch-high-yield', {});
    console.log("Worker started, polling every 60 seconds with backoff.");
}

startWorker();