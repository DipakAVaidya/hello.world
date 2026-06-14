import { NextRequest } from 'next/server';
import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Single global subscriber for the process
const redisSub = new Redis(redisUrl, { maxRetriesPerRequest: null });
redisSub.subscribe('events:live');

// Store all active client streams
const clients = new Set<ReadableStreamDefaultController>();

redisSub.on('message', (channel, message) => {
  if (channel === 'events:live') {
      const payload = `data: ${message}\n\n`;
      clients.forEach(controller => {
          try {
              controller.enqueue(new TextEncoder().encode(payload));
          } catch (e) {
              clients.delete(controller);
          }
      });
  }
});

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  const customReadable = new ReadableStream({
    start(controller) {
      clients.add(controller);

      // Send initial connection event
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'CONNECTED', message: 'Stream connected successfully.' })}\n\n`));

      // Keep connection alive with heartbeat
      const heartbeat = setInterval(() => {
        try {
            controller.enqueue(encoder.encode(`:\n\n`));
        } catch (e) {
            clearInterval(heartbeat);
            clients.delete(controller);
        }
      }, 15000);

      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        clients.delete(controller);
        try {
            controller.close();
        } catch(e) {}
      });
    },
    cancel() {
        // Handled by abort listener usually
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
