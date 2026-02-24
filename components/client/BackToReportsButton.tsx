'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

interface BackToReportsButtonProps {
  retailerId: string
}

export default function BackToReportsButton({ retailerId }: BackToReportsButtonProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleClick = () => {
    // Navigate to admin dashboard Reports section
    const params = new URLSearchParams(searchParams.toString())
    params.set('section', 'reports')
    router.push(`/dashboard/retailer/${retailerId}?${params.toString()}`)
  }

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors mb-3 cursor-pointer"
    >
      <ArrowLeft className="w-4 h-4" />
      <span>Back to Reports</span>
    </button>
  )
}
