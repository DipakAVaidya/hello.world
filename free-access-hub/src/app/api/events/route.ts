import { NextResponse } from 'next/server';
import prisma from '../../../lib/prisma';

export async function GET() {
  try {
    const events = await prisma.unifiedEvent.findMany({
      where: { isActive: true },
      orderBy: { eventTimestamp: 'desc' },
      take: 50
    });
    return NextResponse.json(events);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}
