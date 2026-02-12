import React from 'react'
import { BenchmarkMetric } from './types'

interface BenchmarkTableProps {
  metrics: BenchmarkMetric[]
}

export default function BenchmarkTable({ metrics }: BenchmarkTableProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Metric
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Your Value
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Sector Avg
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Top 10%
              </th>
              <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Your Position
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Gap to Avg
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {metrics.map((metric, idx) => (
              <tr key={idx} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm font-medium text-[#1C1D1C]">{metric.metric}</td>
                <td className="px-6 py-4 text-sm text-right font-semibold text-[#1C1D1C]">{metric.yourValue}</td>
                <td className="px-6 py-4 text-sm text-right text-gray-600">{metric.sectorAvg}</td>
                <td className="px-6 py-4 text-sm text-right text-purple-600 font-medium">
                  {metric.topPerformers}
                </td>
                <td className="px-6 py-4 text-sm text-center">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      metric.position.includes('Top')
                        ? 'bg-green-100 text-green-800'
                        : metric.position.includes('Bottom') || metric.position.includes('▼▼')
                        ? 'bg-red-100 text-red-800'
                        : metric.position.includes('▼')
                        ? 'bg-orange-100 text-orange-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {metric.position}
                  </span>
                </td>
                <td
                  className={`px-6 py-4 text-sm text-right font-medium ${
                    metric.gap.startsWith('-')
                      ? 'text-red-600'
                      : metric.gap.startsWith('+') &&
                        !metric.metric.toLowerCase().includes('cost') &&
                        !metric.metric.toLowerCase().includes('cpc')
                      ? 'text-green-600'
                      : 'text-red-600'
                  }`}
                >
                  {metric.gap}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
