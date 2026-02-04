import React from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { COLORS } from '@/lib/colors'

interface TrendIndicatorProps {
  value: number
  format?: 'percent' | 'currency' | 'number'
  goodDirection?: 'up' | 'down' | 'neutral'
  size?: 'sm' | 'md' | 'lg'
}

export default function TrendIndicator({
  value,
  format = 'percent',
  goodDirection = 'up',
  size = 'md',
}: TrendIndicatorProps) {
  const isPositive = value > 0
  const isNegative = value < 0
  const isNeutral = Math.abs(value) < 1

  // Determine if this is a "good" change based on direction
  const isGood = isNeutral 
    ? false 
    : goodDirection === 'neutral'
    ? false
    : goodDirection === 'up'
    ? isPositive
    : isNegative

  const isBad = isNeutral
    ? false
    : goodDirection === 'neutral'
    ? false
    : goodDirection === 'up'
    ? isNegative
    : isPositive

  // Choose colors
  const bgColor = isNeutral
    ? COLORS.neutral
    : isGood
    ? COLORS.successBg
    : isBad
    ? COLORS.criticalBg
    : COLORS.neutral

  const textColor = isNeutral
    ? '#6B7280'
    : isGood
    ? COLORS.successDark
    : isBad
    ? COLORS.criticalDark
    : '#6B7280'

  const iconColor = isNeutral
    ? '#6B7280'
    : isGood
    ? COLORS.success
    : isBad
    ? COLORS.critical
    : '#6B7280'

  // Choose icon
  const Icon = isNeutral ? Minus : isPositive ? TrendingUp : TrendingDown

  // Format value
  const formatValue = () => {
    const absValue = Math.abs(value)
    const prefix = isPositive ? '+' : isNegative ? '-' : ''
    
    switch (format) {
      case 'currency':
        return `${prefix}£${absValue.toFixed(0)}`
      case 'number':
        return `${prefix}${absValue.toFixed(0)}`
      case 'percent':
      default:
        return `${prefix}${absValue.toFixed(1)}%`
    }
  }

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-2.5 py-1.5',
  }

  const iconSizes = {
    sm: 14,
    md: 16,
    lg: 18,
  }

  return (
    <div 
      className={`flex items-center gap-1 rounded ${sizeClasses[size]}`}
      style={{ backgroundColor: bgColor }}
    >
      <Icon size={iconSizes[size]} style={{ color: iconColor }} />
      <span className="font-semibold" style={{ color: textColor }}>
        {formatValue()}
      </span>
    </div>
  )
}
