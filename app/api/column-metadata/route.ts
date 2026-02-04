import { NextResponse } from 'next/server';
import { ALL_AVAILABLE_COLUMNS } from '@/lib/column-config';

// GET /api/column-metadata - Return all available columns with metadata
export async function GET() {
  return NextResponse.json(ALL_AVAILABLE_COLUMNS);
}
