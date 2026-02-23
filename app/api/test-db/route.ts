import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET() {
    try {
        const retailerId = 'boots'
        const result = await query('SELECT retailer_name FROM retailer_metadata WHERE retailer_id = $1', [retailerId])
        return NextResponse.json({ success: true, rows: result.rows })
    } catch (error) {
        console.error('Test error:', error)
        return NextResponse.json({ success: false, error: String(error) })
    }
}
