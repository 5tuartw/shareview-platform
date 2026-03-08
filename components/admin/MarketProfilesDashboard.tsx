'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Hand, Pencil, Settings, Sparkles, X } from 'lucide-react';

type DomainDefinition = {
  key: string;
  label: string;
};

type DomainValue = {
  values: string[];
  assignment_method: 'manual' | 'ai';
};

type RetailerProfileRow = {
  retailer_id: string;
  retailer_name: string;
  category: string | null;
  tier: string | null;
  status: string | null;
  data_activity_status?: string | null;
  last_data_date?: string | null;
  is_enrolled?: boolean;
  is_active_retailer?: boolean;
  profile_status: 'unassigned' | 'pending_confirmation' | 'confirmed';
  profile_assignment_mode: 'manual' | 'ai' | null;
  profile_domains: Record<string, DomainValue>;
  profile_updated_at: string | null;
  profile_confirmed_at: string | null;
  profile_last_ai_at: string | null;
  assigned_domain_count: number;
};

type MarketProfilesResponse = {
  migration_ready: boolean;
  domains: DomainDefinition[];
  options_by_domain: Record<string, string[]>;
  counts: {
    unassigned: number;
    unconfirmed: number;
  };
  retailers: RetailerProfileRow[];
};

type AiAssignFailure = {
  retailer_id: string;
  reason: string;
};

type AiAssignResponse = {
  updated?: number;
  failed?: AiAssignFailure[];
  error?: string;
};

type DraftEntry = {
  mode: 'manual' | 'ai';
  domains: Record<string, string[]>;
  assignmentByDomain: Record<string, 'manual' | 'ai'>;
  inputByDomain: Record<string, string>;
};

const emptyDraft = (mode: 'manual' | 'ai' = 'manual'): DraftEntry => ({
  mode,
  domains: {},
  assignmentByDomain: {},
  inputByDomain: {},
});

const profileSort = (rows: RetailerProfileRow[]): RetailerProfileRow[] => {
  return [...rows].sort((a, b) => {
    if (a.profile_status !== b.profile_status) {
      if (a.profile_status === 'pending_confirmation') return -1;
      if (b.profile_status === 'pending_confirmation') return 1;
    }

    return a.retailer_name.localeCompare(b.retailer_name);
  });
};

const toDraftFromRow = (row: RetailerProfileRow): DraftEntry => {
  const domains: Record<string, string[]> = {};
  const assignmentByDomain: Record<string, 'manual' | 'ai'> = {};

  for (const [domainKey, domainValue] of Object.entries(row.profile_domains || {})) {
    domains[domainKey] = [...domainValue.values];
    assignmentByDomain[domainKey] = domainValue.assignment_method;
  }

  return {
    mode: row.profile_assignment_mode ?? 'manual',
    domains,
    assignmentByDomain,
    inputByDomain: {},
  };
};

const isActiveRetailer = (row: RetailerProfileRow): boolean => {
  if (typeof row.is_active_retailer === 'boolean') return row.is_active_retailer;
  const dataActive = (row.data_activity_status || '').toLowerCase() === 'active';
  const recentData = row.last_data_date
    ? (Date.now() - new Date(row.last_data_date).getTime()) <= 90 * 24 * 60 * 60 * 1000
    : false;
  return dataActive || recentData || row.is_enrolled === true;
};

function DomainEditor({
  options,
  value,
  disabled,
  onChange,
}: {
  options: string[];
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const uniqueOptions = useMemo(() => {
    const set = new Set<string>(options);
    if (value) set.add(value);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [options, value]);

  return (
    <select
      value={value || ''}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="w-full min-w-[150px] text-xs border border-gray-300 rounded-md px-2 py-1.5 bg-white disabled:bg-gray-100"
    >
      <option value="">Select...</option>
      {uniqueOptions.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
      <option value="__custom__">Custom...</option>
    </select>
  );
}

export default function MarketProfilesDashboard() {
  const [loading, setLoading] = useState(true);
  const [savingRetailerId, setSavingRetailerId] = useState<string | null>(null);
  const [assigningAi, setAssigningAi] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiFailures, setAiFailures] = useState<AiAssignFailure[]>([]);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [migrationReady, setMigrationReady] = useState(true);
  const [domains, setDomains] = useState<DomainDefinition[]>([]);
  const [optionsByDomain, setOptionsByDomain] = useState<Record<string, string[]>>({});
  const [retailers, setRetailers] = useState<RetailerProfileRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftEntry>>({});
  const [editingAssigned, setEditingAssigned] = useState<Record<string, boolean>>({});
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [promptSource, setPromptSource] = useState<'db' | 'default'>('default');
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptSaving, setPromptSaving] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [promptSaved, setPromptSaved] = useState(false);
  const [retailerFilter, setRetailerFilter] = useState<'enrolled' | 'active' | 'all'>('active');

  const parseResponseError = async (response: Response, fallback: string): Promise<string> => {
    try {
      const payload = (await response.json()) as { error?: string };
      return payload.error || fallback;
    } catch {
      return fallback;
    }
  };

  const openPromptModal = async () => {
    setShowPromptModal(true);
    setPromptLoading(true);
    setPromptError(null);
    setPromptSaved(false);

    try {
      const response = await fetch('/api/admin/market-profiles/prompt');
      if (!response.ok) {
        const message = await parseResponseError(response, 'Failed to load AI prompt');
        throw new Error(message);
      }

      const payload = (await response.json()) as {
        prompt_text?: string;
        source?: 'db' | 'default';
      };

      setPromptText(payload.prompt_text || '');
      setPromptSource(payload.source === 'db' ? 'db' : 'default');
    } catch (error) {
      setPromptError(error instanceof Error ? error.message : 'Failed to load AI prompt');
    } finally {
      setPromptLoading(false);
    }
  };

  const savePrompt = async () => {
    setPromptSaving(true);
    setPromptError(null);
    setPromptSaved(false);

    try {
      const response = await fetch('/api/admin/market-profiles/prompt', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt_text: promptText,
          style_directive: 'standard',
        }),
      });

      if (!response.ok) {
        const message = await parseResponseError(response, 'Failed to save AI prompt');
        throw new Error(message);
      }

      setPromptSource('db');
      setPromptSaved(true);
      setTimeout(() => setPromptSaved(false), 2500);
    } catch (error) {
      setPromptError(error instanceof Error ? error.message : 'Failed to save AI prompt');
    } finally {
      setPromptSaving(false);
    }
  };

  const loadData = async (options?: { preserveFeedback?: boolean }) => {
    setLoading(true);
    setError(null);
    if (!options?.preserveFeedback) {
      setAiFailures([]);
      setInfoMessage(null);
    }

    try {
      const response = await fetch('/api/admin/market-profiles');
      if (!response.ok) {
        const message = await parseResponseError(response, 'Failed to load market profiles');
        throw new Error(message);
      }

      const payload = (await response.json()) as MarketProfilesResponse;
      setMigrationReady(payload.migration_ready);
      setDomains(payload.domains);
      setOptionsByDomain(payload.options_by_domain || {});
      setRetailers(payload.retailers || []);

      const draftMap: Record<string, DraftEntry> = {};
      for (const row of payload.retailers || []) {
        draftMap[row.retailer_id] = toDraftFromRow(row);
      }
      setDrafts(draftMap);
      setEditingAssigned({});
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load market profiles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredRetailers = useMemo(() => {
    if (retailerFilter === 'enrolled') {
      return retailers.filter((row) => row.is_enrolled === true);
    }

    if (retailerFilter === 'active') {
      return retailers.filter((row) => isActiveRetailer(row));
    }

    return retailers;
  }, [retailerFilter, retailers]);

  const activeRetailerCount = useMemo(
    () => retailers.filter((row) => isActiveRetailer(row)).length,
    [retailers]
  );
  const allRetailerCount = retailers.length;
  const enrolledRetailerCount = useMemo(
    () => retailers.filter((row) => row.is_enrolled === true).length,
    [retailers]
  );

  const unassignedRows = useMemo(
    () => filteredRetailers.filter((row) => row.profile_status === 'unassigned'),
    [filteredRetailers]
  );

  const assignedRows = useMemo(
    () => profileSort(filteredRetailers.filter((row) => row.profile_status !== 'unassigned')),
    [filteredRetailers]
  );

  const aiQueuedRetailers = useMemo(() => {
    return unassignedRows.filter((row) => drafts[row.retailer_id]?.mode === 'ai').map((row) => row.retailer_id);
  }, [drafts, unassignedRows]);

  const updateDraft = (retailerId: string, updater: (draft: DraftEntry) => DraftEntry) => {
    setDrafts((current) => {
      const currentDraft = current[retailerId] ?? emptyDraft();
      return {
        ...current,
        [retailerId]: updater(currentDraft),
      };
    });
  };

  const setDomainValue = (retailerId: string, domainKey: string, value: string) => {
    updateDraft(retailerId, (draft) => {
      const trimmed = value.trim();
      return {
        ...draft,
        domains: {
          ...draft.domains,
          [domainKey]: trimmed ? [trimmed] : [],
        },
        assignmentByDomain: {
          ...draft.assignmentByDomain,
          [domainKey]: draft.mode,
        },
      };
    });
  };

  const domainDisplayValue = (row: RetailerProfileRow, domainKey: string): string => {
    const domain = row.profile_domains?.[domainKey];
    if (!domain || domain.values.length === 0) return '-';
    return domain.values.join(', ');
  };

  const persistProfile = async (
    retailerId: string,
    confirm: boolean,
    fallbackAssignment: 'manual' | 'ai' = 'manual'
  ) => {
    const draft = drafts[retailerId] ?? emptyDraft(fallbackAssignment);
    const profileDomains = Object.entries(draft.domains).reduce<Record<string, { values: string[]; assignment_method: 'manual' | 'ai' }>>(
      (acc, [domainKey, values]) => {
        const cleanValues = values.map((value) => value.trim()).filter((value) => value.length > 0);
        if (cleanValues.length > 0) {
          acc[domainKey] = {
            values: cleanValues,
            assignment_method: draft.assignmentByDomain[domainKey] ?? fallbackAssignment,
          };
        }
        return acc;
      },
      {}
    );

    if (Object.keys(profileDomains).length === 0) {
      setError('Manual assignment requires at least one domain value.');
      return;
    }

    setSavingRetailerId(retailerId);
    setError(null);

    try {
      const response = await fetch(`/api/admin/market-profiles/${retailerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: fallbackAssignment,
          domains: profileDomains,
          confirm,
        }),
      });

      if (!response.ok) {
        const message = await parseResponseError(response, 'Failed to save profile');
        throw new Error(message);
      }

      await loadData({ preserveFeedback: true });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save profile');
    } finally {
      setSavingRetailerId(null);
    }
  };

  const runAiAssignments = async () => {
    if (aiQueuedRetailers.length === 0) return;

    setAssigningAi(true);
    setError(null);
    setAiFailures([]);
    setInfoMessage(null);

    try {
      const response = await fetch('/api/admin/market-profiles/assign-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retailer_ids: aiQueuedRetailers }),
      });

      if (!response.ok) {
        const message = await parseResponseError(response, 'AI assignment failed');
        throw new Error(message);
      }

      let payload: AiAssignResponse;
      try {
        payload = (await response.json()) as AiAssignResponse;
      } catch {
        throw new Error('AI assignment response could not be parsed.');
      }

      const failed = Array.isArray(payload.failed) ? payload.failed : [];
      const updated = Number(payload.updated ?? 0);

      if (failed.length > 0) {
        setAiFailures(failed);
      }

      if (updated > 0) {
        setInfoMessage(`${updated} retailer profile${updated === 1 ? '' : 's'} assigned by AI.`);
      }

      if (updated === 0 && failed.length > 0) {
        setError('AI assignment completed with failures only. See details below.');
      }

      if (updated === 0 && failed.length === 0) {
        setError('AI assignment completed but no retailers were updated.');
      }

      await loadData({ preserveFeedback: true });
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : 'Unable to run AI assignment');
    } finally {
      setAssigningAi(false);
    }
  };

  if (loading) {
    return <p className="text-gray-500">Loading market profiles...</p>;
  }

  return (
    <div className="space-y-6">
      {!migrationReady && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Market profile columns are not yet available in this environment. Run migration
          <code className="mx-1">20260308010000_add_market_profile_fields_to_retailers_up.sql</code>
          before saving changes.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {infoMessage && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{infoMessage}</div>
      )}

      {aiFailures.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold mb-2">Some AI assignments failed:</p>
          <ul className="list-disc pl-5 space-y-1">
            {aiFailures.slice(0, 12).map((item) => (
              <li key={`${item.retailer_id}-${item.reason}`}>
                <span className="font-medium">{item.retailer_id}</span>: {item.reason}
              </li>
            ))}
          </ul>
          {aiFailures.length > 12 && (
            <p className="mt-2 text-xs">+ {aiFailures.length - 12} more failures</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-red-200 p-4">
          <p className="text-sm text-gray-500">No profile yet</p>
          <p className="text-2xl font-semibold text-red-600">{unassignedRows.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-amber-200 p-4">
          <p className="text-sm text-gray-500">AI/manual assigned, not confirmed</p>
          <p className="text-2xl font-semibold text-amber-600">
            {assignedRows.filter((row) => row.profile_status === 'pending_confirmation').length}
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-end justify-end gap-2">
        <div className="inline-flex rounded-md border border-gray-300 overflow-hidden bg-white">
          <button
            type="button"
            onClick={() => setRetailerFilter('enrolled')}
            className={`px-3 py-1.5 text-xs font-medium ${
              retailerFilter === 'enrolled' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700'
            }`}
          >
            Enrolled ({enrolledRetailerCount})
          </button>
          <button
            type="button"
            onClick={() => setRetailerFilter('active')}
            className={`px-3 py-1.5 text-xs font-medium border-l border-gray-300 ${
              retailerFilter === 'active' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700'
            }`}
          >
            Active Retailers ({activeRetailerCount})
          </button>
          <button
            type="button"
            onClick={() => setRetailerFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium border-l border-gray-300 ${
              retailerFilter === 'all' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700'
            }`}
          >
            All retailers ({allRetailerCount})
          </button>
        </div>
      </div>

      <section className="bg-white rounded-lg border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Unassigned retailers</h2>
              <p className="text-sm text-gray-500 mt-1">
                Choose manual assignment or queue AI assignment for each retailer.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {aiQueuedRetailers.length > 0 && (
                <button
                  type="button"
                  onClick={runAiAssignments}
                  disabled={!migrationReady || assigningAi}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md bg-amber-500 text-black font-medium hover:bg-amber-400 disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4" />
                  {assigningAi ? 'Assigning using AI...' : 'Assigning using AI'}
                </button>
              )}
              <button
                type="button"
                onClick={openPromptModal}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
              >
                <Settings className="w-4 h-4" />
                View/Edit AI prompt
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Retailer</th>
                <th className="text-left px-4 py-3 font-medium">Assignment mode</th>
                {domains.map((domain) => (
                  <th key={`u-head-${domain.key}`} className="text-left px-4 py-3 font-medium whitespace-nowrap">
                    {domain.label}
                  </th>
                ))}
                <th className="text-left px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {unassignedRows.length === 0 && (
                <tr>
                  <td colSpan={domains.length + 3} className="px-4 py-6 text-center text-gray-500">
                    No unassigned retailers.
                  </td>
                </tr>
              )}

              {unassignedRows.map((row) => {
                const draft = drafts[row.retailer_id] ?? emptyDraft();
                const isManual = draft.mode === 'manual';
                const isSaving = savingRetailerId === row.retailer_id;

                return (
                  <tr key={row.retailer_id} className="border-t border-gray-200">
                    <td className="px-4 py-4">
                      <p className="font-medium text-gray-900">{row.retailer_name}</p>
                      <p className="text-xs text-gray-500">{row.retailer_id} · {row.category || 'Uncategorised'}</p>
                    </td>
                    <td className="px-4 py-4 align-middle">
                      <div className="inline-flex rounded-md border border-gray-300 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => updateDraft(row.retailer_id, (current) => ({ ...current, mode: 'manual' }))}
                          className={`px-3 py-1.5 text-xs font-medium ${
                            isManual ? 'bg-gray-900 text-white' : 'bg-white text-gray-700'
                          }`}
                        >
                          Manual
                        </button>
                        <button
                          type="button"
                          onClick={() => updateDraft(row.retailer_id, (current) => ({ ...current, mode: 'ai' }))}
                          className={`px-3 py-1.5 text-xs font-medium border-l border-gray-300 ${
                            !isManual ? 'bg-gray-900 text-white' : 'bg-white text-gray-700'
                          }`}
                        >
                          AI
                        </button>
                      </div>
                    </td>

                    {domains.map((domain) => {
                      const draftValue = draft.domains[domain.key]?.[0] ?? '';

                      return (
                        <td key={`u-${row.retailer_id}-${domain.key}`} className="px-4 py-4 align-middle">
                          {isManual ? (
                            <DomainEditor
                              options={optionsByDomain[domain.key] ?? []}
                              value={draftValue}
                              disabled={!migrationReady || isSaving}
                              onChange={(next) => {
                                if (next === '__custom__') {
                                  const custom = window.prompt(`Enter ${domain.label}`);
                                  if (custom) setDomainValue(row.retailer_id, domain.key, custom);
                                  return;
                                }
                                setDomainValue(row.retailer_id, domain.key, next);
                              }}
                            />
                          ) : (
                            <span className="text-xs text-gray-500">Queued for AI</span>
                          )}
                        </td>
                      );
                    })}

                    <td className="px-4 py-4 align-middle">
                      {isManual ? (
                        <button
                          type="button"
                          title="Confirm profile"
                          onClick={() => persistProfile(row.retailer_id, true, 'manual')}
                          disabled={!migrationReady || isSaving}
                          className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:opacity-50"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      ) : (
                        <span className="text-xs text-gray-500">Queued for AI</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white rounded-lg border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Assigned profiles</h2>
          <p className="text-sm text-gray-500 mt-1">Unconfirmed rows are shown first so they can be reviewed.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Retailer</th>
                {domains.map((domain) => (
                  <th key={`a-head-${domain.key}`} className="text-left px-4 py-3 font-medium whitespace-nowrap">
                    {domain.label}
                  </th>
                ))}
                <th className="text-left px-4 py-3 font-medium">State</th>
                <th className="text-left px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {assignedRows.length === 0 && (
                <tr>
                  <td colSpan={domains.length + 3} className="px-4 py-6 text-center text-gray-500">
                    No assigned profiles yet.
                  </td>
                </tr>
              )}

              {assignedRows.map((row) => {
                const isEditing = row.profile_status === 'pending_confirmation' || editingAssigned[row.retailer_id] === true;
                const draft = drafts[row.retailer_id] ?? toDraftFromRow(row);
                const isSaving = savingRetailerId === row.retailer_id;

                return (
                  <tr key={row.retailer_id} className="border-t border-gray-200">
                    <td className="px-4 py-4">
                      <p className="font-medium text-gray-900">{row.retailer_name}</p>
                      <p className="text-xs text-gray-500">{row.retailer_id}</p>
                    </td>

                    {domains.map((domain) => {
                      const draftValue = draft.domains[domain.key]?.[0] ?? '';
                      const domainMeta = row.profile_domains?.[domain.key];
                      const Icon = domainMeta?.assignment_method === 'manual' ? Hand : Sparkles;
                      const iconColour = domainMeta?.assignment_method === 'manual' ? 'text-blue-600' : 'text-amber-500';

                      return (
                        <td key={`a-${row.retailer_id}-${domain.key}`} className="px-4 py-4 align-middle">
                          {isEditing ? (
                            <DomainEditor
                              options={optionsByDomain[domain.key] ?? []}
                              value={draftValue}
                              disabled={!migrationReady || isSaving}
                              onChange={(next) => {
                                if (next === '__custom__') {
                                  const custom = window.prompt(`Enter ${domain.label}`);
                                  if (custom) setDomainValue(row.retailer_id, domain.key, custom);
                                  return;
                                }
                                setDomainValue(row.retailer_id, domain.key, next);
                              }}
                            />
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-gray-700 whitespace-nowrap">
                              {domainMeta && <Icon className={`w-3 h-3 ${iconColour}`} />}
                              {domainDisplayValue(row, domain.key)}
                            </span>
                          )}
                        </td>
                      );
                    })}

                    <td className="px-4 py-4 align-middle">
                      {row.profile_status === 'confirmed' ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Confirmed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                          Awaiting confirmation
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-4 align-middle">
                      {isEditing ? (
                        <button
                          type="button"
                          title="Confirm profile"
                          onClick={() =>
                            persistProfile(
                              row.retailer_id,
                              true,
                              editingAssigned[row.retailer_id] ? 'manual' : (row.profile_assignment_mode ?? 'manual')
                            )
                          }
                          disabled={!migrationReady || isSaving}
                          className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:opacity-50"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          title="Edit profile"
                          onClick={() => {
                            const manualisedDraft = toDraftFromRow(row);
                            for (const domainKey of Object.keys(manualisedDraft.assignmentByDomain)) {
                              manualisedDraft.assignmentByDomain[domainKey] = 'manual';
                            }
                            setEditingAssigned((current) => ({ ...current, [row.retailer_id]: true }));
                            setDrafts((current) => ({
                              ...current,
                              [row.retailer_id]: manualisedDraft,
                            }));
                          }}
                          disabled={!migrationReady}
                          className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {showPromptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowPromptModal(false)} />
          <div className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden bg-white rounded-lg shadow-2xl border border-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">AI domain categorisation prompt</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Source: {promptSource === 'db' ? 'Saved template' : 'Default fallback template'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPromptModal(false)}
                className="p-2 rounded-md hover:bg-gray-100 text-gray-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 overflow-y-auto max-h-[calc(90vh-138px)]">
              {promptError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {promptError}
                </div>
              )}
              {promptSaved && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  Prompt saved successfully.
                </div>
              )}
              {promptLoading ? (
                <p className="text-sm text-gray-500">Loading prompt...</p>
              ) : (
                <textarea
                  value={promptText}
                  onChange={(event) => setPromptText(event.target.value)}
                  className="w-full min-h-[360px] text-sm border border-gray-300 rounded-md px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
              )}
            </div>

            <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowPromptModal(false)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Close
              </button>
              <button
                type="button"
                onClick={savePrompt}
                disabled={promptLoading || promptSaving}
                className="px-4 py-2 text-sm rounded-md bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {promptSaving ? 'Saving...' : 'Save prompt'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
