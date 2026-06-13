import { NextResponse } from 'next/server';
import Parser from 'rss-parser';

const parser = new Parser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/110.0 FreeAccessHub/1.0'
  }
});

const feeds = [
  { url: 'https://dev.to/feed/tag/giveaway', category: 'Swag & Goodies' },
  { url: 'https://dev.to/feed/tag/opensource', category: 'Open Source' },
  { url: 'https://dev.to/feed/tag/events', category: 'Tech Events' },
  { url: 'https://dev.to/feed/tag/hackathon', category: 'Hackathons' },
  { url: 'https://www.reddit.com/r/freebies/.rss', category: 'Freebies' },
  { url: 'https://www.reddit.com/r/UdemyFreebies/.rss', category: 'Free Courses' },
  { url: 'https://www.reddit.com/r/FreeEBOOKS/.rss', category: 'Free Books' },
  { url: 'https://hnrss.org/newest?q=hackathon', category: 'Hackathons' },
  { url: 'https://hnrss.org/newest?q=meetup', category: 'Tech Events' },
  { url: 'https://www.reddit.com/r/csmajors/.rss', category: 'Opportunities' }
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
