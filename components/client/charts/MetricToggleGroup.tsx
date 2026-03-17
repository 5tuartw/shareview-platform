'use client'

type MetricOption<T extends string> = {
  key: T
  label: string
}

interface MetricToggleGroupProps<T extends string> {
  options: MetricOption<T>[]
  selected: T
  onSelect: (key: T) => void
}

export default function MetricToggleGroup<T extends string>({
  options,
  selected,
  onSelect,
}: MetricToggleGroupProps<T>) {
  return (
    <div className="inline-flex items-center rounded-md border border-slate-200 bg-white p-0.5">
      {options.map((option) => (
        <button
          key={`metric-toggle-${option.key}`}
          type="button"
          onClick={() => onSelect(option.key)}
          className={`rounded px-2.5 py-1 text-xs font-medium ${selected === option.key
            ? 'border border-amber-300 bg-amber-100 text-amber-900'
            : 'text-slate-700 hover:bg-slate-50'
            }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
