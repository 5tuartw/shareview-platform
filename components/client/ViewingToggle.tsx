'use client'

import React from 'react'

interface ViewingToggleProps {
  isViewingAsClient: boolean
  onToggle: (nextValue: boolean) => void
}

export default function ViewingToggle({ isViewingAsClient, onToggle }: ViewingToggleProps) {
  const announcement = isViewingAsClient
    ? 'Viewing as client enabled.'
    : 'Viewing as client disabled.'

  return (
    <div className="flex flex-col items-end gap-2">
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
      <button
        type="button"
        className="flex items-center gap-3 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        role="switch"
        aria-checked={isViewingAsClient}
        aria-label="Viewing as Client"
        onClick={() => onToggle(!isViewingAsClient)}
      >
        <span>Viewing as Client</span>
        <span
          className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${
            isViewingAsClient ? 'bg-blue-500' : 'bg-white/30'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              isViewingAsClient ? 'translate-x-5' : 'translate-x-1'
            }`}
          />
        </span>
      </button>

      <div
        className={`w-full overflow-hidden transition-all duration-300 ${
          isViewingAsClient ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0'
        }`}
        aria-hidden={!isViewingAsClient}
      >
        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          Viewing as Client - You are seeing exactly what the client sees.
        </div>
      </div>
    </div>
  )
}
