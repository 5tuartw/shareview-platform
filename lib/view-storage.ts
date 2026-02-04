export function saveActiveView(viewId: number): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('activeViewId', viewId.toString());
  }
}

export function getActiveView(): number | null {
  if (typeof window === 'undefined') return null;
  const viewId = localStorage.getItem('activeViewId');
  return viewId ? parseInt(viewId, 10) : null;
}

export function saveSortPreference(viewId: number, sortKey: string, direction: 'asc' | 'desc'): void {
  if (typeof window !== 'undefined') {
    const key = `view_${viewId}_sort`;
    localStorage.setItem(key, JSON.stringify({ sortKey, direction }));
  }
}

export function getSortPreference(viewId: number): { sortKey: string; direction: 'asc' | 'desc' } | null {
  if (typeof window === 'undefined') return null;
  const key = `view_${viewId}_sort`;
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : null;
}

export function clearViewPreferences(): void {
  if (typeof window !== 'undefined') {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('view_') || k === 'activeViewId');
    keys.forEach(k => localStorage.removeItem(k));
  }
}
