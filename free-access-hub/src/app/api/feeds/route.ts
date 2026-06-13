import { NextResponse } from 'next/server';
import Parser from 'rss-parser';

const parser = new Parser();

const feeds = [
  { url: 'https://dev.to/feed/tag/giveaway', category: 'Swag & Goodies' },
  { url: 'https://www.reddit.com/r/freebies/.rss', category: 'Freebies' },
  { url: 'https://dev.to/feed/tag/events', category: 'Tech Events' },
  { url: 'https://dev.to/feed/tag/hackathon', category: 'Hackathons' },
  { url: 'https://www.reddit.com/r/WebDeveloperJobs/.rss', category: 'Opportunities' }
];

export const revalidate = 60;

type FeedItemType = {
  title: string;
  link: string;
  pubDate: string;
  category: string;
  contentSnippet: string;
};

export async function GET() {
  try {
    let allItems: FeedItemType[] = [];

    await Promise.allSettled(
      feeds.map(async (feed) => {
        try {
          const feedData = await parser.parseURL(feed.url);
          const mappedItems: FeedItemType[] = feedData.items.slice(0, 10).map((item) => ({
            title: item.title || 'No Title',
            link: item.link || '',
            pubDate: item.pubDate || new Date().toISOString(),
            category: feed.category,
            contentSnippet: item.contentSnippet ? item.contentSnippet.slice(0, 150) + '...' : ''
          }));
          allItems = allItems.concat(mappedItems);
        } catch (err) {
          console.error(`Failed to parse feed ${feed.url}`, err);
        }
      })
    );

    allItems.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

    return NextResponse.json(allItems);
  } catch (error) {
    console.error('Error fetching feeds:', error);
    return NextResponse.json({ error: 'Failed to fetch feeds' }, { status: 500 });
  }
}
