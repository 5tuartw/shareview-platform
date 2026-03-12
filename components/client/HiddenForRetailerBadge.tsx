'use client'

interface HiddenForRetailerBadgeProps {
  className?: string
  label?: string
}

export default function HiddenForRetailerBadge({
  className,
  label = 'Hidden for retailer',
}: HiddenForRetailerBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700 ${className ?? ''}`}
    >
      {label}
    </span>
  )
}
