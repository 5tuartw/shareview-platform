import React from 'react'
import { BenchmarkPosition } from './types'
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react'

interface BenchmarkCardProps {
  title: string
  value: string | number
  subtitle: string
  position: BenchmarkPosition
  icon?: React.ReactNode
}

const positionStyles: Record<BenchmarkPosition, { bg: string; text: string; border: string; icon: React.ReactNode }> = {
  above: {
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200',
    icon: <TrendingUp className="w-5 h-5 text-green-600" />,
  },
  average: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    icon: <Minus className="w-5 h-5 text-amber-600" />,
  },
  below: {
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    border: 'border-orange-200',
    icon: <TrendingDown className="w-5 h-5 text-orange-600" />,
  },
  critical: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
    icon: <AlertTriangle className="w-5 h-5 text-red-600" />,
  },
}

export default function BenchmarkCard({ title, value, subtitle, position, icon }: BenchmarkCardProps) {
  const style = positionStyles[position]

  return (
    <div className={`${style.bg} ${style.border} border-2 rounded-lg p-6 transition-all hover:shadow-md`}>
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-600">{title}</h3>
        {icon || style.icon}
      </div>
      <div className={`text-3xl font-bold ${style.text} mb-2`}>{value}</div>
      <p className="text-sm text-gray-600 border-t border-gray-200 pt-3 mt-3">{subtitle}</p>
    </div>
  )
}
