export interface PlaceholderResponse {
  messages: string[]
}

export const callPlaceholderLLM = (context: Record<string, unknown>): PlaceholderResponse => {
  // Placeholder for demo use; replace with LLM integration post-demo.
  const retailer = String(context.retailerId || 'this retailer')
  return {
    messages: [
      `Performance remains steady for ${retailer}.`,
      'Focus on scaling top performers while trimming low-quality coverage.',
      'Prioritise budget where conversion rates are strongest.',
    ],
  }
}
