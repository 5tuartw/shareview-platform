import React from 'react'
import { COLORS } from '@/lib/colors'

interface ContextualInfoItem {
  label: string
  text: string
}

interface ContextualInfoPanelProps {
  title: string
  style?: 'info' | 'success' | 'warning'
  items: ContextualInfoItem[]
}

const STYLE_CONFIG = {
  info: {
    background: COLORS.blueBg,
    border: COLORS.blue,
    text: COLORS.blueDark,
    bullet: COLORS.blue,
  },
  success: {
    background: COLORS.successBg,
    border: COLORS.success,
    text: COLORS.successDark,
    bullet: COLORS.success,
  },
  warning: {
    background: COLORS.warningBg,
    border: COLORS.warning,
    text: COLORS.warningDark,
    bullet: COLORS.warning,
  },
} as const

export default function ContextualInfoPanel({
  title,
  style = 'info',
  items,
}: ContextualInfoPanelProps) {
  const config = STYLE_CONFIG[style]

  return (
    <div
      className="rounded-lg border p-6"
      style={{ backgroundColor: config.background, borderColor: config.border }}
    >
      <h3 className="text-base font-semibold mb-4" style={{ color: config.text }}>
        {title}
      </h3>
      <ul className="space-y-3 text-sm" style={{ color: config.text }}>
        {items.map((item) => (
          <li key={item.label} className="flex items-start">
            <span className="mr-2 mt-0.5" style={{ color: config.bullet }}>
              •
            </span>
            <span>
              <strong>{item.label}:</strong> {item.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
