'use client'

import React, { useState } from 'react';
import { X, GripVertical } from 'lucide-react';
import { DashboardView, ColumnDefinition } from '@/lib/column-config';

interface ViewEditorModalProps {
  view?: DashboardView | null;
  allColumns: ColumnDefinition[];
  onSave: (viewData: Partial<DashboardView>) => Promise<void>;
  onCancel: () => void;
}

const ICON_OPTIONS = ['🔷', '🔥', '💫', '📊', '📈', '🎯', '⭐', '🚀'];

export default function ViewEditorModal({
  view,
  allColumns,
  onSave,
  onCancel,
}: ViewEditorModalProps) {
  const [name, setName] = useState(view?.name || '');
  const [icon, setIcon] = useState(view?.icon || '📊');
  const [selectedColumns, setSelectedColumns] = useState<string[]>(view?.column_order || ['retailer_name']);
  const [isDefault, setIsDefault] = useState(view?.is_default || false);
  const [saving, setSaving] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const isValid = name.trim().length > 0 && selectedColumns.length > 0;

  const toggleColumn = (field: string) => {
    if (field === 'retailer_name') return; // Always required
    
    if (selectedColumns.includes(field)) {
      setSelectedColumns(selectedColumns.filter(f => f !== field));
    } else {
      setSelectedColumns([...selectedColumns, field]);
    }
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newColumns = [...selectedColumns];
    const draggedItem = newColumns[draggedIndex];
    newColumns.splice(draggedIndex, 1);
    newColumns.splice(index, 0, draggedItem);
    
    setSelectedColumns(newColumns);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleSave = async () => {
    if (!isValid) return;

    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        icon,
        column_order: selectedColumns,
        is_default: isDefault,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">{view ? 'Edit View' : 'Create New View'}</h2>
            <button
              onClick={onCancel}
              className="p-1 hover:bg-gray-100 rounded-md transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {/* View Name */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">View Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1B1C1B]"
              placeholder="e.g., My Custom View"
            />
          </div>
          
          {/* Icon Picker */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Icon</label>
            <div className="flex gap-2 flex-wrap">
              {ICON_OPTIONS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => setIcon(emoji)}
                  className={`text-2xl p-2 rounded transition-colors ${
                    icon === emoji ? 'bg-[#1B1C1B] text-white' : 'bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
          
          {/* Column Selector */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              Columns ({selectedColumns.length} selected)
            </label>
            <div className="border border-gray-300 rounded-md p-3 max-h-64 overflow-y-auto">
              {/* Selected columns (draggable) */}
              <div className="mb-3">
                <p className="text-xs font-semibold text-gray-600 mb-2">SELECTED (drag to reorder)</p>
                {selectedColumns.map((field, index) => {
                  const col = allColumns.find(c => c.field === field);
                  if (!col) return null;
                  
                  return (
                    <div
                      key={field}
                      draggable={field !== 'retailer_name'}
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragEnd={handleDragEnd}
                      className={`flex items-center gap-2 p-2 mb-1 rounded ${
                        field === 'retailer_name' 
                          ? 'bg-gray-100 cursor-not-allowed' 
                          : 'bg-blue-50 cursor-move hover:bg-blue-100'
                      }`}
                    >
                      {field !== 'retailer_name' && <GripVertical className="w-4 h-4 text-gray-400" />}
                      <span className="flex-1 text-sm">{col.display}</span>
                      {field !== 'retailer_name' && (
                        <button
                          onClick={() => toggleColumn(field)}
                          className="text-xs text-red-600 hover:text-red-700"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              
              {/* Available columns */}
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">AVAILABLE</p>
                {allColumns
                  .filter(col => !selectedColumns.includes(col.field))
                  .map(col => (
                    <label
                      key={col.field}
                      className="flex items-center gap-2 p-2 mb-1 hover:bg-gray-50 rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => toggleColumn(col.field)}
                        className="rounded"
                      />
                      <span className="text-sm">{col.display}</span>
                      <span className="text-xs text-gray-500">({col.type})</span>
                    </label>
                  ))}
              </div>
            </div>
          </div>
          
          {/* Set as Default */}
          <div className="mb-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm font-medium">Set as default view</span>
            </label>
            {isDefault && !view?.is_default && (
              <p className="text-xs text-amber-600 mt-1 ml-6">
                This will replace the current default view
              </p>
            )}
          </div>
          
          {/* Buttons */}
          <div className="flex gap-2 justify-end">
            <button
              onClick={onCancel}
              disabled={saving}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!isValid || saving}
              className="px-4 py-2 bg-[#1B1C1B] text-white rounded-md hover:bg-[#2B2C2B] transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save View'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
