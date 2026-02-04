'use client'

import React, { useState } from 'react';
import { MoreVertical, Edit2, Trash2 } from 'lucide-react';
import { DashboardView } from '@/lib/column-config';

interface ViewSelectorProps {
  views: DashboardView[];
  activeView: DashboardView;
  onViewChange: (view: DashboardView) => void;
  onCreateView: () => void;
  onEditView: (view: DashboardView) => void;
  onDeleteView: (view: DashboardView) => void;
}

export default function ViewSelector({
  views,
  activeView,
  onViewChange,
  onCreateView,
  onEditView,
  onDeleteView,
}: ViewSelectorProps) {
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

  return (
    <div className="flex items-center gap-2 bg-white p-2 md:p-3 rounded-lg border border-gray-200 mb-4 overflow-x-auto">
      {views.map(view => (
        <div key={view.id} className="relative group flex-shrink-0">
          <div className="flex items-center gap-1">
            <button
              onClick={() => onViewChange(view)}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                activeView.id === view.id 
                  ? 'bg-[#1B1C1B] text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {view.icon} {view.name}
            </button>
            <button
              onClick={() => setOpenMenuId(openMenuId === view.id ? null : view.id)}
              className={`p-1 rounded hover:bg-gray-200 transition-colors ${
                activeView.id === view.id ? 'text-white hover:bg-white/20' : 'text-gray-600'
              }`}
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>
          
          {openMenuId === view.id && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setOpenMenuId(null)}
              />
              <div className="absolute right-0 mt-1 w-32 bg-white border border-gray-200 rounded-md shadow-lg z-50">
                <button
                  onClick={() => {
                    onEditView(view);
                    setOpenMenuId(null);
                  }}
                  className="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Edit2 className="w-3 h-3" />
                  Edit
                </button>
                {!view.is_default && (
                  <button
                    onClick={() => {
                      onDeleteView(view);
                      setOpenMenuId(null);
                    }}
                    className="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      ))}
      <button 
        onClick={onCreateView}
        className="px-3 py-2 rounded-md text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 whitespace-nowrap flex-shrink-0"
      >
        + New View
      </button>
    </div>
  );
}
