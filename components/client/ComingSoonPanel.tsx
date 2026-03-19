'use client'

interface ComingSoonPanelProps {
  className?: string
}

export default function ComingSoonPanel({ className }: ComingSoonPanelProps) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-12 ${className ?? ''}`}>
      <div>
        <h3 className="text-xl font-semibold text-gray-800">Something exciting is on its way.</h3>
        <p className="mt-2 text-sm text-gray-500">
          We're building powerful new insights for this section &mdash; stay tuned for features that will give you a
          deeper view of your performance.
        </p>
      </div>
    </div>
  )
}
