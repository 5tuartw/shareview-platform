'use client'

import React, { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import ViewSelector from '@/components/dashboard/ViewSelector';
import ViewEditorModal from '@/components/dashboard/ViewEditorModal';
import { PerformanceTable } from '@/components/shared';
import { DashboardView, ColumnDefinition, getColumnDefinitions } from '@/lib/column-config';
import { saveActiveView, getActiveView } from '@/lib/view-storage';

interface Retailer {
  retailer_id: string;
  retailer_name: string;
  status: string;
  category?: string;
  tier?: string;
  account_manager?: string;
  gmv?: number;
  profit?: number;
  roi?: number;
  conversion_rate?: number;
  validation_rate?: number;
  impressions?: number;
  alert_count: number;
  [key: string]: string | number | boolean | null | undefined;
}


export default function SalesDashboardPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  
  const [views, setViews] = useState<DashboardView[]>([]);
  const [activeView, setActiveView] = useState<DashboardView | null>(null);
  const [activeViewColumns, setActiveViewColumns] = useState<ColumnDefinition[]>([]);
  const [columnMetadata, setColumnMetadata] = useState<ColumnDefinition[]>([]);
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showViewEditor, setShowViewEditor] = useState(false);
  const [editingView, setEditingView] = useState<DashboardView | null>(null);

  // Authentication check
  useEffect(() => {
    if (status === 'loading') return;
    
    if (!session) {
      router.push('/login');
      return;
    }

    const userRole = session.user?.role;
    if (!userRole || !['SALES_TEAM', 'CSS_ADMIN'].includes(userRole)) {
      // Redirect clients to their retailer page
      if (userRole?.startsWith('CLIENT_')) {
        router.push('/client');
      } else {
        router.push('/login');
      }
    }
  }, [session, status, router]);

  // Fetch initial data
  useEffect(() => {
    if (status !== 'authenticated') return;

    const fetchData = async () => {
      try {
        const [viewsRes, columnsRes, retailersRes] = await Promise.all([
          fetch('/api/views'),
          fetch('/api/column-metadata'),
          fetch('/api/retailers/performance'),
        ]);

        if (!viewsRes.ok) {
          const error = await viewsRes.json().catch(() => ({ error: 'Unknown error' }));
          console.error('Views API error:', viewsRes.status, error);
          throw new Error(`Failed to fetch views: ${error.error || viewsRes.statusText}`);
        }
        if (!columnsRes.ok) {
          const error = await columnsRes.json().catch(() => ({ error: 'Unknown error' }));
          console.error('Columns API error:', columnsRes.status, error);
          throw new Error(`Failed to fetch columns: ${error.error || columnsRes.statusText}`);
        }
        if (!retailersRes.ok) {
          const error = await retailersRes.json().catch(() => ({ error: 'Unknown error' }));
          console.error('Retailers API error:', retailersRes.status, error);
          throw new Error(`Failed to fetch retailers: ${error.error || retailersRes.statusText}`);
        }

        const viewsData = await viewsRes.json();
        const columnsData = await columnsRes.json();
        const retailersData = await retailersRes.json();

        setViews(viewsData);
        setColumnMetadata(columnsData);
        setRetailers(retailersData);

        // Set active view (from localStorage or default)
        const savedViewId = getActiveView();
        const defaultView = savedViewId 
          ? viewsData.find((v: DashboardView) => v.id === savedViewId)
          : viewsData.find((v: DashboardView) => v.is_default);
        
        const viewToUse = defaultView || viewsData[0];
        if (viewToUse) {
          setActiveView(viewToUse);
          setActiveViewColumns(getColumnDefinitions(viewToUse.column_order));
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [status]);

  const handleViewChange = (view: DashboardView) => {
    setActiveView(view);
    setActiveViewColumns(getColumnDefinitions(view.column_order));
    saveActiveView(view.id);
  };

  const handleCreateView = () => {
    setEditingView(null);
    setShowViewEditor(true);
  };

  const handleEditView = (view: DashboardView) => {
    setEditingView(view);
    setShowViewEditor(true);
  };

  const handleDeleteView = async (view: DashboardView) => {
    if (!confirm(`Are you sure you want to delete "${view.name}"?`)) return;

    try {
      const res = await fetch(`/api/views/${view.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const error = await res.json();
        alert(error.error || 'Failed to delete view');
        return;
      }

      // Remove from views list
      const updatedViews = views.filter(v => v.id !== view.id);
      setViews(updatedViews);

      // If deleted view was active, switch to default
      if (activeView?.id === view.id) {
        const defaultView = updatedViews.find(v => v.is_default) || updatedViews[0];
        if (defaultView) {
          handleViewChange(defaultView);
        }
      }
    } catch (error) {
      console.error('Error deleting view:', error);
      alert('Failed to delete view');
    }
  };

  const handleSaveView = async (viewData: Partial<DashboardView>) => {
    try {
      const method = editingView ? 'PUT' : 'POST';
      const url = editingView ? `/api/views/${editingView.id}` : '/api/views';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(viewData),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(error.error || 'Failed to save view');
        return;
      }

      const savedView = await res.json();

      if (editingView) {
        // Update existing view
        setViews(views.map(v => v.id === savedView.id ? savedView : v));
        if (activeView?.id === savedView.id) {
          handleViewChange(savedView);
        }
      } else {
        // Add new view
        setViews([...views, savedView]);
        handleViewChange(savedView);
      }

      setShowViewEditor(false);
      setEditingView(null);
    } catch (error) {
      console.error('Error saving view:', error);
      alert('Failed to save view');
    }
  };

  const handleRowClick = (retailer: Retailer) => {
    router.push(`/client/${retailer.retailer_id}`);
  };

  const tableColumns = useMemo(() => (
    activeViewColumns.map((column) => {
      const align = column.align || (column.type === 'number' || column.type === 'currency' || column.type === 'percent' ? 'right' : 'left');
      const format = column.type === 'currency'
        ? 'currency'
        : column.type === 'percent'
        ? 'percent'
        : column.type === 'number'
        ? 'number'
        : undefined;

      const render = column.render
        ? (row: Retailer) => column.render?.(row, column)
        : column.field === 'retailer_name'
        ? (row: Retailer) => (
            <span className="font-semibold text-blue-600">{row.retailer_name}</span>
          )
        : column.type === 'date'
        ? (row: Retailer) => {
            const value = row[column.field];
            if (!value) return '-';
            if (typeof value === 'string') {
              const date = new Date(value);
              return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            }
            return value;
          }
        : undefined;

      return {
        key: column.field,
        label: column.display,
        sortable: column.sortable !== false,
        align,
        format,
        render,
      };
    })
  ), [activeViewColumns]);


  if (loading || status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gray-300 border-t-[#1B1C1B] rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!session || !activeView) {
    return null;
  }

  return (
    <div className="min-h-screen bg-white">
      <DashboardHeader user={session.user} />
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto">
          <nav className="flex gap-1 px-6 overflow-x-auto">
            <button className="px-4 py-3 text-sm font-bold whitespace-nowrap transition-all border-b-2 border-[#F59E0B] text-gray-900">
              Retailers
            </button>
          </nav>
        </div>
      </div>
      <main className="bg-gray-50 min-h-screen">
        <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
          <ViewSelector 
            views={views}
            activeView={activeView}
            onViewChange={handleViewChange}
            onCreateView={handleCreateView}
            onEditView={handleEditView}
            onDeleteView={handleDeleteView}
          />

          <div className="max-h-[calc(100vh-300px)] overflow-y-auto">
            <PerformanceTable
              data={retailers}
              columns={tableColumns}
              defaultFilter="all"
              pageSize={25}
              onRowClick={handleRowClick}
            />
          </div>
        </div>
      </main>
      
      {showViewEditor && (
        <ViewEditorModal
          view={editingView}
          allColumns={columnMetadata}
          onSave={handleSaveView}
          onCancel={() => {
            setShowViewEditor(false);
            setEditingView(null);
          }}
        />
      )}
    </div>
  );
}
