'use client'

interface ComingSoonPanelProps {
  className?: string
}

export default function ComingSoonPanel({ className }: ComingSoonPanelProps) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-12 text-center ${className ?? ''}`}>
      <p className="text-sm font-medium text-gray-500">This feature is coming soon.</p>
    </div>
  )
}
