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
        const response = await axios.get('https://hn.algolia.com/api/v1/search?query=swag%20free', {
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

            const upsertedEvent = await prisma.unifiedEvent.upsert({
                where: { id },
                update: { updatedAt: new Date(), isActive: true },
                create: {
                    id,
                    title,
                    sourcePlatform: 'HackerNews',
                    category: 'TECH_MEETUP',
                    deliveryType: 'VIRTUAL',
                    perks: ['Open Source Swag'],
                    eventTimestamp,
                    registrationUrl: url,
                    venueName: 'Hacker News Thread',
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
        console.error('HN Ingestion blocked ->', (err as Error).message);
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

            const upsertedEvent = await prisma.unifiedEvent.upsert({
                where: { id },
                update: { updatedAt: new Date(), isActive: true },
                create: {
                    id,
                    title: `PH Launch: ${item.title}`,
                    sourcePlatform: 'ProductHunt',
                    category: 'SWAG_GOODIES',
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
        console.error('PH Ingestion blocked ->', (err as Error).message);
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
        console.error('Devpost API Ingestion blocked ->', (err as Error).message);
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
        console.error('Reddit Ingestion blocked ->', (err as Error).message);
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
        console.error('GitHub Ingestion blocked ->', (err as Error).message);
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
                        spamScore
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
        console.error('HighApe Ingestion blocked ->', (err as Error).message);
        return 0;
    }
}

// Queue Processing
const worker = new Worker('ingestion-queue', async job => {
    if (job.name === 'fetch-high-yield') {
        let total = 0;

        total += await ingestDevpostAPI();
        await delay(3000);
        total += await ingestRedditJSON();
        await delay(3000);
        total += await ingestHNAlgolia();
        await delay(3000);
        total += await ingestProductHuntRSS();
        await delay(3000);
        total += await ingestGithubIssues();
        await delay(3000);
        total += await ingestHighApe();

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