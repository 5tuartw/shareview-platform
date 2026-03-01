import { NextRequest, NextResponse } from 'next/server'
import { validateAccessToken } from '@/lib/validate-access-token'
import { getRetailerProducts } from '@/services/retailer/products'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string; id: string }> }
) {
  try {
    const { token, id: retailerId } = await context.params
    const validation = await validateAccessToken(request, token, retailerId)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: validation.status })
    }

    const { searchParams } = new URL(request.url)
    const result = await getRetailerProducts(retailerId, searchParams)
    return NextResponse.json(result.data, { status: result.status })
  } catch (error) {
    console.error('Error in access token products proxy:', error)
    return NextResponse.json(
      { error: 'Failed to fetch products', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
