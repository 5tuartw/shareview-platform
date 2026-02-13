import React from 'react'
import { CheckCircle2, AlertTriangle, AlertCircle, LucideIcon } from 'lucide-react'
import { COLORS } from '@/lib/colors'

interface PageHeadlineProps {
  status: 'success' | 'warning' | 'critical' | 'info'
  message: string
  subtitle?: string
  actionLink?: {
    href?: string
    label: string
    icon?: LucideIcon
    onClick?: () => void
  }
}

const STATUS_CONFIG = {
  success: {
    icon: CheckCircle2,
    bgColor: COLORS.successBg,
    borderColor: COLORS.success,
    iconColor: COLORS.success,
    textColor: COLORS.successDark,
    subtitleColor: COLORS.tealDark,
    actionBgColor: COLORS.tealBg,
    actionTextColor: COLORS.successDark,
  },
  warning: {
    icon: AlertTriangle,
    bgColor: COLORS.warningBg,
    borderColor: COLORS.warning,
    iconColor: COLORS.warning,
    textColor: COLORS.warningDark,
    subtitleColor: COLORS.deepAmber,
    actionBgColor: COLORS.lightAmber,
    actionTextColor: COLORS.warningDark,
  },
  critical: {
    icon: AlertCircle,
    bgColor: COLORS.criticalBg,
    borderColor: COLORS.critical,
    iconColor: COLORS.critical,
    textColor: COLORS.criticalDark,
    subtitleColor: COLORS.critical,
    actionBgColor: COLORS.criticalBg,
    actionTextColor: COLORS.criticalDark,
  },
  info: {
    icon: AlertCircle,
    bgColor: COLORS.blueBg,
    borderColor: COLORS.blue,
    iconColor: COLORS.blue,
    textColor: COLORS.blueDark,
    subtitleColor: COLORS.blue,
    actionBgColor: COLORS.blueBg,
    actionTextColor: COLORS.blueDark,
  },
}

export default function PageHeadline({ 
  status, 
  message, 
  subtitle, 
  actionLink 
}: PageHeadlineProps) {
  const config = STATUS_CONFIG[status]
  const Icon = config.icon

  return (
    <div 
      className="p-4 rounded-lg border-l-4 flex items-start gap-3"
      style={{ 
        backgroundColor: config.bgColor, 
        borderLeftColor: config.borderColor 
      }}
    >
      <Icon 
        className="w-6 h-6 mt-0.5 flex-shrink-0" 
        style={{ color: config.iconColor }} 
      />
      <div className="flex-1">
        <p 
          className="font-semibold text-lg" 
          style={{ color: config.textColor }}
        >
          {message}
        </p>
        {subtitle && (
          <p 
            className="text-sm mt-1" 
            style={{ color: config.subtitleColor }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {actionLink && (
        actionLink.onClick ? (
          <button
            onClick={actionLink.onClick}
            className="px-3 py-1.5 rounded text-sm font-semibold flex items-center gap-1.5 transition-colors hover:opacity-80"
            style={{
              backgroundColor: config.actionBgColor,
              color: config.actionTextColor,
            }}
          >
            {actionLink.icon && <actionLink.icon className="w-4 h-4" />}
            {actionLink.label}
          </button>
        ) : (
          <a
            href={actionLink.href}
            className="px-3 py-1.5 rounded text-sm font-semibold flex items-center gap-1.5 transition-colors hover:opacity-80"
            style={{
              backgroundColor: config.actionBgColor,
              color: config.actionTextColor,
            }}
          >
            {actionLink.icon && <actionLink.icon className="w-4 h-4" />}
            {actionLink.label}
          </a>
        )
      )}
    </div>
  )
}
