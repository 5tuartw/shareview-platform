import React from 'react'

interface SVBadgeProps {
  className?: string
}

export default function SVBadge({ className = '' }: SVBadgeProps) {
  return (
    <span 
      className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-[#F59E0B] ${className}`}
      title="ShareView Enrolled"
    >
      <span className="text-[10px] font-bold text-black leading-none tracking-tight" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        SV
      </span>
    </span>
  )
}
