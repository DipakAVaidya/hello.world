import { NextRequest } from 'next/server';
import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  const redisSub = new Redis(redisUrl, { maxRetriesPerRequest: null });

  const customReadable = new ReadableStream({
    async start(controller) {
      // Send initial connection event
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'CONNECTED', message: 'Stream connected successfully.' })}\n\n`));

      await redisSub.subscribe('events:live');

      redisSub.on('message', (channel, message) => {
        if (channel === 'events:live') {
           controller.enqueue(encoder.encode(`data: ${message}\n\n`));
        }
      });

      // Keep connection alive with heartbeat
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`:\n\n`));
      }, 15000);

      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        redisSub.quit();
        controller.close();
      });
    },
    cancel() {
        redisSub.quit();
    }
  });

  return new Response(customReadable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
