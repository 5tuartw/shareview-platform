'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Eye, Hand, Loader2, Pencil, Plus, Settings, Sparkles, X } from 'lucide-react';

const ASSIGN_AI_BATCH_SIZE_DEFAULT = 12;

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
  profile_last_ai_response?: unknown | null;
  profile_last_ai_model?: string | null;
  assigned_domain_count: number;
};

type MarketProfilesResponse = {
  migration_ready: boolean;
  domains: DomainDefinition[];
  options_by_domain: Record<string, string[]>;
  counts: {
    unassigned: number;
    unconfirmed: number;
    confirmed?: number;
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
  results?: AiAssignResult[];
  configured_model?: string;
  provider?: 'gemini' | 'openai';
  error?: string;
};

type AiExecutionMode = 'chunked_sync' | 'provider_batch';

type LlmBatchJob = {
  id: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  processed_items: number;
  updated_items: number;
  failed_items: number;
  total_items: number;
  last_error?: string | null;
  result_payload?: {
    results?: AiAssignResult[];
    failed?: AiAssignFailure[];
  };
};

type AiAssignResult = {
  retailer_id: string;
  retailer_name: string;
  provider?: 'gemini' | 'openai';
  model: string;
  raw_text: string;
  parsed_json: unknown;
  mapped_domains: Record<string, unknown>;
  missing_domain_keys: string[];
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
  const assignedSectionRef = useRef<HTMLElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingRetailerId, setSavingRetailerId] = useState<string | null>(null);
  const [assigningAi, setAssigningAi] = useState(false);
  const [reassigningRetailerId, setReassigningRetailerId] = useState<string | null>(null);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchProcessed, setBatchProcessed] = useState(0);
  const [batchUpdated, setBatchUpdated] = useState(0);
  const [batchFailed, setBatchFailed] = useState(0);
  const [aiChunkSize, setAiChunkSize] = useState(ASSIGN_AI_BATCH_SIZE_DEFAULT);
  const [aiExecutionMode, setAiExecutionMode] = useState<AiExecutionMode>('chunked_sync');
  const [prioritiseAssigned, setPrioritiseAssigned] = useState(false);
  const [recentAiUpdatedIds, setRecentAiUpdatedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [aiFailures, setAiFailures] = useState<AiAssignFailure[]>([]);
  const [aiResults, setAiResults] = useState<AiAssignResult[]>([]);
  const [rawResponseResult, setRawResponseResult] = useState<AiAssignResult | null>(null);
  const [customValueModal, setCustomValueModal] = useState<{
    retailerId: string;
    domainKey: string;
    label: string;
    value: string;
  } | null>(null);
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

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
      setAiResults([]);
      setRecentAiUpdatedIds(new Set());
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

  useEffect(() => {
    const loadAiSettings = async () => {
      try {
        const response = await fetch('/api/admin/ai-settings');
        if (!response.ok) return;
        const payload = (await response.json()) as {
          settings?: { chunk_size?: number; execution_mode?: AiExecutionMode };
        };
        const configuredChunk = Number(payload.settings?.chunk_size ?? ASSIGN_AI_BATCH_SIZE_DEFAULT);
        if (Number.isFinite(configuredChunk) && configuredChunk >= 1 && configuredChunk <= 100) {
          setAiChunkSize(Math.floor(configuredChunk));
        }
        if (payload.settings?.execution_mode === 'provider_batch') {
          setAiExecutionMode('provider_batch');
        } else {
          setAiExecutionMode('chunked_sync');
        }
      } catch {
        // Keep default chunk size if settings endpoint is unavailable.
      }
    };

    loadAiSettings();
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

  const awaitingConfirmationCount = useMemo(
    () => assignedRows.filter((row) => row.profile_status === 'pending_confirmation').length,
    [assignedRows]
  );

  const completedProfilesCount = useMemo(
    () => assignedRows.filter((row) => row.profile_status === 'confirmed').length,
    [assignedRows]
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

  const setDomainValue = (
    retailerId: string,
    domainKey: string,
    value: string,
    assignmentMethodOverride?: 'manual' | 'ai'
  ) => {
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
          [domainKey]: assignmentMethodOverride ?? draft.mode,
        },
      };
    });
  };

  const executeAiAssignment = async (
    retailerIds: string[],
    onStart?: () => void,
    onFinally?: () => void
  ) => {
    if (retailerIds.length === 0) return;

    onStart?.();
    setError(null);
    setAiFailures([]);
    setAiResults([]);
    setBatchTotal(retailerIds.length);
    setBatchProcessed(0);
    setBatchUpdated(0);
    setBatchFailed(0);

    const aggregatedFailures: AiAssignFailure[] = [];
    const aggregatedResults: AiAssignResult[] = [];
    let updatedCount = 0;

    const runViaBatchJob = async (): Promise<{
      updatedCount: number;
      failures: AiAssignFailure[];
      results: AiAssignResult[];
    }> => {
      const createResponse = await fetch('/api/admin/llm-batch-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_type: 'retailer_profile_assign',
          retailer_ids: retailerIds,
        }),
      });

      if (!createResponse.ok) {
        const message = await parseResponseError(createResponse, 'Failed to create batch job');
        throw new Error(message);
      }

      const createdPayload = (await createResponse.json()) as { job?: LlmBatchJob };
      const createdJob = createdPayload.job;
      if (!createdJob) {
        throw new Error('Batch job creation returned no job details.');
      }

      let currentJob = createdJob;
      let safetyCounter = 0;

      let latestResults: AiAssignResult[] = [];
      let latestFailures: AiAssignFailure[] = [];

      while (safetyCounter < 1000) {
        safetyCounter += 1;

        const processResponse = await fetch(`/api/admin/llm-batch-jobs/${currentJob.id}/process`, {
          method: 'POST',
        });

        if (!processResponse.ok) {
          const message = await parseResponseError(processResponse, 'Batch processing failed');
          throw new Error(message);
        }

        const processPayload = (await processResponse.json()) as { job?: LlmBatchJob };
        if (!processPayload.job) {
          throw new Error('Batch processing returned no job details.');
        }

        currentJob = processPayload.job;

        const resultPayload = currentJob.result_payload || {};
        const currentResults = Array.isArray(resultPayload.results) ? resultPayload.results : [];
        const currentFailures = Array.isArray(resultPayload.failed) ? resultPayload.failed : [];
        latestResults = currentResults;
        latestFailures = currentFailures;

        setAiResults(currentResults);
        setAiFailures(currentFailures);
        setBatchProcessed(Number(currentJob.processed_items || 0));
        setBatchUpdated(Number(currentJob.updated_items || 0));
        setBatchFailed(Number(currentJob.failed_items || 0));

        if (currentResults.length > 0) {
          setRecentAiUpdatedIds(new Set(currentResults.map((row) => row.retailer_id)));
          setPrioritiseAssigned(true);
        }

        await loadData({ preserveFeedback: true });

        if (currentJob.status === 'completed') {
          return {
            updatedCount: Number(currentJob.updated_items || 0),
            failures: latestFailures,
            results: latestResults,
          };
        }

        if (currentJob.status === 'failed' || currentJob.status === 'cancelled') {
          throw new Error(currentJob.last_error || 'Batch assignment job failed.');
        }

        await delay(250);
      }

      throw new Error('Batch assignment did not complete in expected time.');
    };

    const chunks: string[][] = [];
    for (let i = 0; i < retailerIds.length; i += aiChunkSize) {
      chunks.push(retailerIds.slice(i, i + aiChunkSize));
    }

    try {
      if (aiExecutionMode === 'provider_batch' && retailerIds.length > 1) {
        const batchSummary = await runViaBatchJob();
        updatedCount = batchSummary.updatedCount;
        aggregatedFailures.push(...batchSummary.failures);
        aggregatedResults.push(...batchSummary.results);
      } else {
        for (const chunk of chunks) {
          try {
            const response = await fetch('/api/admin/market-profiles/assign-ai', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ retailer_ids: chunk }),
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
            const results = Array.isArray(payload.results) ? payload.results : [];
            const updated = Number(payload.updated ?? 0);

            updatedCount += updated;
            aggregatedFailures.push(...failed);
            aggregatedResults.push(...results);

            setAiFailures([...aggregatedFailures]);
            setAiResults([...aggregatedResults]);
            setBatchUpdated(updatedCount);
            setBatchFailed(aggregatedFailures.length);

            if (aggregatedResults.length > 0) {
              setRecentAiUpdatedIds(new Set(aggregatedResults.map((row) => row.retailer_id)));
            }

            if (updated > 0) {
              setPrioritiseAssigned(true);
            }
          } catch (chunkError) {
            const reason = chunkError instanceof Error ? chunkError.message : 'Chunk request failed';
            for (const retailerId of chunk) {
              aggregatedFailures.push({ retailer_id: retailerId, reason });
            }
            setAiFailures([...aggregatedFailures]);
            setBatchFailed(aggregatedFailures.length);
          }

          setBatchProcessed((current) => Math.min(retailerIds.length, current + chunk.length));
          await loadData({ preserveFeedback: true });
        }
      }

      if (updatedCount > 0) {
        setTimeout(() => {
          assignedSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
      }

      if (updatedCount === 0 && aggregatedFailures.length > 0) {
        setError('AI assignment completed with failures only. See details below.');
      }

      if (updatedCount === 0 && aggregatedFailures.length === 0) {
        setError('AI assignment completed but no retailers were updated.');
      }
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : 'Unable to run AI assignment');
    } finally {
      onFinally?.();
    }
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
    await executeAiAssignment(
      aiQueuedRetailers,
      () => setAssigningAi(true),
      () => setAssigningAi(false)
    );
  };

  const runAssignAllWithAi = async () => {
    const allUnassignedRetailerIds = retailers
      .filter((row) => row.profile_status === 'unassigned')
      .map((row) => row.retailer_id);

    await executeAiAssignment(
      allUnassignedRetailerIds,
      () => setAssigningAi(true),
      () => setAssigningAi(false)
    );
  };

  const reassignWithAi = async (retailerId: string) => {
    await executeAiAssignment(
      [retailerId],
      () => setReassigningRetailerId(retailerId),
      () => setReassigningRetailerId(null)
    );
  };

  const openCustomValueModal = (retailerId: string, domainKey: string, label: string) => {
    setCustomValueModal({ retailerId, domainKey, label, value: '' });
  };

  const saveCustomValue = () => {
    if (!customValueModal) return;
    const trimmed = customValueModal.value.trim();
    if (!trimmed) return;

    setDomainValue(customValueModal.retailerId, customValueModal.domainKey, trimmed, 'manual');
    setCustomValueModal(null);
  };

  const findAiResultByRetailer = (retailerId: string): AiAssignResult | null => {
    const inRun = aiResults.find((row) => row.retailer_id === retailerId);
    if (inRun) return inRun;

    const retailer = retailers.find((row) => row.retailer_id === retailerId);
    if (!retailer?.profile_last_ai_response) return null;

    const stored = retailer.profile_last_ai_response as {
      raw_text?: string;
      parsed_json?: unknown;
      mapped_domains?: Record<string, unknown>;
      missing_domain_keys?: string[];
    };

    return {
      retailer_id: retailer.retailer_id,
      retailer_name: retailer.retailer_name,
      provider: (stored as { provider?: 'gemini' | 'openai' }).provider,
      model: retailer.profile_last_ai_model || 'unknown',
      raw_text: typeof stored.raw_text === 'string' ? stored.raw_text : '',
      parsed_json: stored.parsed_json,
      mapped_domains: stored.mapped_domains || {},
      missing_domain_keys: Array.isArray(stored.missing_domain_keys) ? stored.missing_domain_keys : [],
    };
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-red-200 p-4">
          <p className="text-sm text-gray-500">No profile yet</p>
          <p className="text-2xl font-semibold text-red-600">{unassignedRows.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-amber-200 p-4">
          <p className="text-sm text-gray-500">Awaiting confirmation</p>
          <p className="text-2xl font-semibold text-amber-600">{awaitingConfirmationCount}</p>
        </div>
        <div className="bg-white rounded-lg border border-emerald-200 p-4">
          <p className="text-sm text-gray-500">Completed profiles</p>
          <p className="text-2xl font-semibold text-emerald-600">{completedProfilesCount}</p>
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

      {prioritiseAssigned && (
        <section ref={assignedSectionRef} className="bg-white rounded-lg border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Assigned profiles</h2>
            <p className="text-sm text-gray-500 mt-1">Unconfirmed rows are shown first so they can be reviewed.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="sticky left-0 z-20 bg-gray-50 text-left px-4 py-3 font-medium min-w-[220px]">Retailer</th>
                  {domains.map((domain) => (
                    <th key={`a-prio-head-${domain.key}`} className="text-left px-4 py-3 font-medium">
                      {domain.label}
                    </th>
                  ))}
                  <th className="text-left px-4 py-3 font-medium">State</th>
                  <th className="text-left px-4 py-3 font-medium w-[140px] min-w-[140px]">Action</th>
                </tr>
              </thead>
              <tbody>
                {assignedRows.map((row) => {
                  const isEditing = row.profile_status === 'pending_confirmation' || editingAssigned[row.retailer_id] === true;
                  const draft = drafts[row.retailer_id] ?? toDraftFromRow(row);
                  const isSaving = savingRetailerId === row.retailer_id;
                  const isFreshAiRow = recentAiUpdatedIds.has(row.retailer_id);

                  return (
                    <tr key={`prio-${row.retailer_id}`} className={`border-t border-gray-200 ${isFreshAiRow ? 'bg-emerald-50/60' : ''}`}>
                      <td className={`sticky left-0 z-10 px-4 py-4 min-w-[220px] ${isFreshAiRow ? 'bg-emerald-50/60' : 'bg-white'}`}>
                        <p className="font-medium text-gray-900 break-words">{row.retailer_name}</p>
                      </td>

                      {domains.map((domain) => {
                        const draftValue = draft.domains[domain.key]?.[0] ?? '';
                        const domainMeta = row.profile_domains?.[domain.key];
                        const Icon = domainMeta?.assignment_method === 'manual' ? Hand : Sparkles;
                        const iconColour = domainMeta?.assignment_method === 'manual' ? 'text-blue-600' : 'text-amber-500';
                        const showAssignmentIcon = domain.key !== 'region_focus';

                        return (
                          <td
                            key={`a-prio-${row.retailer_id}-${domain.key}`}
                            className={`px-4 py-4 align-middle ${
                              domain.key === 'region_focus' ? 'w-[90px] min-w-[90px]' : 'max-w-[220px]'
                            }`}
                          >
                            {isEditing ? (
                              <DomainEditor
                                options={optionsByDomain[domain.key] ?? []}
                                value={draftValue}
                                disabled={!migrationReady || isSaving}
                                onChange={(next) => {
                                  if (next === '__custom__') {
                                    openCustomValueModal(row.retailer_id, domain.key, domain.label);
                                    return;
                                  }
                                  setDomainValue(row.retailer_id, domain.key, next, 'manual');
                                }}
                              />
                            ) : (
                              <span className="inline-flex items-start gap-1 text-xs text-gray-700 break-words">
                                {showAssignmentIcon && domainMeta && <Icon className={`w-3 h-3 mt-0.5 shrink-0 ${iconColour}`} />}
                                <span className="break-words">{domainDisplayValue(row, domain.key)}</span>
                              </span>
                            )}
                          </td>
                        );
                      })}

                      <td className="px-4 py-4 align-middle w-[140px] min-w-[140px]">
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
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              title="Reassign with AI"
                              onClick={() => reassignWithAi(row.retailer_id)}
                              disabled={!migrationReady || isSaving || reassigningRetailerId === row.retailer_id}
                              className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50"
                            >
                              <Sparkles className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              title="View raw response"
                              onClick={() => setRawResponseResult(findAiResultByRetailer(row.retailer_id))}
                              disabled={!findAiResultByRetailer(row.retailer_id)}
                              className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-sky-100 text-sky-700 hover:bg-sky-200 disabled:opacity-40"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              title="Confirm profile"
                              onClick={() => persistProfile(row.retailer_id, true, row.profile_assignment_mode ?? 'manual')}
                              disabled={!migrationReady || isSaving || reassigningRetailerId === row.retailer_id}
                              className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:opacity-50"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              title="View raw response"
                              onClick={() => setRawResponseResult(findAiResultByRetailer(row.retailer_id))}
                              disabled={!findAiResultByRetailer(row.retailer_id)}
                              className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-sky-100 text-sky-700 hover:bg-sky-200 disabled:opacity-40"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              title="Edit profile"
                              onClick={() => {
                                const manualisedDraft = toDraftFromRow(row);
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
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className={`bg-white rounded-lg border border-gray-200 transition-opacity ${assigningAi ? 'opacity-50' : ''}`}>
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Unassigned retailers</h2>
              <p className="text-sm text-gray-500 mt-1">
                Choose manual assignment or queue AI assignment for each retailer.
              </p>
              {assigningAi && (
                <p className="mt-2 inline-flex items-center gap-2 text-xs text-amber-700">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Assigning {batchTotal} retailer{batchTotal === 1 ? '' : 's'} with AI... {batchProcessed}/{batchTotal} processed, {batchUpdated} updated, {batchFailed} failed.
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={runAssignAllWithAi}
                disabled={!migrationReady || assigningAi || retailers.filter((row) => row.profile_status === 'unassigned').length === 0}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md bg-gray-900 text-white font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                Assign All with AI
              </button>
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
                <th className="sticky left-0 z-20 bg-gray-50 text-left px-4 py-3 font-medium min-w-[220px]">Retailer</th>
                <th className="text-left px-4 py-3 font-medium">Assignment mode</th>
                {domains.map((domain) => (
                  <th
                    key={`u-head-${domain.key}`}
                    className={`text-left px-4 py-3 font-medium ${
                      domain.key === 'region_focus' ? 'w-[90px] min-w-[90px]' : ''
                    }`}
                  >
                    {domain.label}
                  </th>
                ))}
                <th className="text-left px-4 py-3 font-medium w-[140px] min-w-[140px]">Actions</th>
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
                    <td className="sticky left-0 z-10 bg-white px-4 py-4 min-w-[220px]">
                      <p className="font-medium text-gray-900 break-words">{row.retailer_name}</p>
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
                        <td
                          key={`u-${row.retailer_id}-${domain.key}`}
                          className={`px-4 py-4 align-middle ${
                            domain.key === 'region_focus' ? 'w-[90px] min-w-[90px]' : ''
                          }`}
                        >
                          {isManual ? (
                            <DomainEditor
                              options={optionsByDomain[domain.key] ?? []}
                              value={draftValue}
                              disabled={!migrationReady || isSaving}
                              onChange={(next) => {
                                if (next === '__custom__') {
                                  openCustomValueModal(row.retailer_id, domain.key, domain.label);
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

                    <td className="px-4 py-4 align-middle w-[140px] min-w-[140px]">
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

      {!prioritiseAssigned && (
      <section ref={assignedSectionRef} className="bg-white rounded-lg border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Assigned profiles</h2>
          <p className="text-sm text-gray-500 mt-1">Unconfirmed rows are shown first so they can be reviewed.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="sticky left-0 z-20 bg-gray-50 text-left px-4 py-3 font-medium min-w-[220px]">Retailer</th>
                {domains.map((domain) => (
                  <th
                    key={`a-head-${domain.key}`}
                    className={`text-left px-4 py-3 font-medium ${
                      domain.key === 'region_focus' ? 'w-[90px] min-w-[90px]' : ''
                    }`}
                  >
                    {domain.label}
                  </th>
                ))}
                <th className="text-left px-4 py-3 font-medium">State</th>
                <th className="text-left px-4 py-3 font-medium w-[140px] min-w-[140px]">Action</th>
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
                const isFreshAiRow = recentAiUpdatedIds.has(row.retailer_id);

                return (
                  <tr key={row.retailer_id} className={`border-t border-gray-200 ${isFreshAiRow ? 'bg-emerald-50/60' : ''}`}>
                    <td className={`sticky left-0 z-10 px-4 py-4 min-w-[220px] ${isFreshAiRow ? 'bg-emerald-50/60' : 'bg-white'}`}>
                      <p className="font-medium text-gray-900 break-words">{row.retailer_name}</p>
                    </td>

                    {domains.map((domain) => {
                      const draftValue = draft.domains[domain.key]?.[0] ?? '';
                      const domainMeta = row.profile_domains?.[domain.key];
                      const Icon = domainMeta?.assignment_method === 'manual' ? Hand : Sparkles;
                      const iconColour = domainMeta?.assignment_method === 'manual' ? 'text-blue-600' : 'text-amber-500';
                      const showAssignmentIcon = domain.key !== 'region_focus';

                      return (
                        <td
                          key={`a-${row.retailer_id}-${domain.key}`}
                          className={`px-4 py-4 align-middle ${
                            domain.key === 'region_focus' ? 'w-[90px] min-w-[90px]' : 'max-w-[220px]'
                          }`}
                        >
                          {isEditing ? (
                            <DomainEditor
                              options={optionsByDomain[domain.key] ?? []}
                              value={draftValue}
                              disabled={!migrationReady || isSaving}
                              onChange={(next) => {
                                if (next === '__custom__') {
                                  openCustomValueModal(row.retailer_id, domain.key, domain.label);
                                  return;
                                }
                                setDomainValue(row.retailer_id, domain.key, next, 'manual');
                              }}
                            />
                          ) : (
                            <span className="inline-flex items-start gap-1 text-xs text-gray-700 break-words">
                              {showAssignmentIcon && domainMeta && <Icon className={`w-3 h-3 mt-0.5 shrink-0 ${iconColour}`} />}
                              <span className="break-words">{domainDisplayValue(row, domain.key)}</span>
                            </span>
                          )}
                        </td>
                      );
                    })}

                    <td className="px-4 py-4 align-middle w-[140px] min-w-[140px]">
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
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            title="Reassign with AI"
                            onClick={() => reassignWithAi(row.retailer_id)}
                            disabled={!migrationReady || isSaving || reassigningRetailerId === row.retailer_id}
                            className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50"
                          >
                            <Sparkles className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            title="View raw response"
                            onClick={() => setRawResponseResult(findAiResultByRetailer(row.retailer_id))}
                            disabled={!findAiResultByRetailer(row.retailer_id)}
                            className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-sky-100 text-sky-700 hover:bg-sky-200 disabled:opacity-40"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            title="Confirm profile"
                            onClick={() =>
                              persistProfile(
                                row.retailer_id,
                                true,
                                row.profile_assignment_mode ?? 'manual'
                              )
                            }
                            disabled={!migrationReady || isSaving || reassigningRetailerId === row.retailer_id}
                            className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:opacity-50"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            title="View raw response"
                            onClick={() => setRawResponseResult(findAiResultByRetailer(row.retailer_id))}
                            disabled={!findAiResultByRetailer(row.retailer_id)}
                            className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-sky-100 text-sky-700 hover:bg-sky-200 disabled:opacity-40"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            title="Edit profile"
                            onClick={() => {
                              const manualisedDraft = toDraftFromRow(row);
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
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {rawResponseResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setRawResponseResult(null)} />
          <div className="relative w-full max-w-5xl max-h-[90vh] overflow-hidden bg-white rounded-lg shadow-2xl border border-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Stored AI response</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {rawResponseResult.retailer_name} ({rawResponseResult.retailer_id}) · {rawResponseResult.provider || 'unknown'} · model: {rawResponseResult.model}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRawResponseResult(null)}
                className="p-2 rounded-md hover:bg-gray-100 text-gray-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 grid gap-3 lg:grid-cols-2 overflow-y-auto max-h-[calc(90vh-138px)]">
              <div>
                <p className="mb-1 text-xs font-semibold text-gray-700">Raw LLM text</p>
                <pre className="max-h-72 overflow-auto rounded bg-gray-900 p-2 text-[11px] text-gray-100">
                  {rawResponseResult.raw_text || 'No raw text stored'}
                </pre>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold text-gray-700">Parsed + mapped domains</p>
                <pre className="max-h-72 overflow-auto rounded bg-gray-900 p-2 text-[11px] text-gray-100">
                  {JSON.stringify(
                    {
                      parsed_json: rawResponseResult.parsed_json,
                      mapped_domains: rawResponseResult.mapped_domains,
                      missing_domain_keys: rawResponseResult.missing_domain_keys,
                    },
                    null,
                    2
                  )}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {customValueModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCustomValueModal(null)} />
          <div className="relative w-full max-w-md bg-white rounded-lg shadow-2xl border border-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h3 className="text-base font-semibold text-gray-900">Add custom value</h3>
              <button
                type="button"
                onClick={() => setCustomValueModal(null)}
                className="p-2 rounded-md hover:bg-gray-100 text-gray-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-gray-600">{customValueModal.label}</p>
              <input
                autoFocus
                value={customValueModal.value}
                onChange={(event) =>
                  setCustomValueModal((current) =>
                    current ? { ...current, value: event.target.value } : current
                  )
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    saveCustomValue();
                  }
                }}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder={`Enter ${customValueModal.label.toLowerCase()}...`}
              />
            </div>
            <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setCustomValueModal(null)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveCustomValue}
                disabled={!customValueModal.value.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                Add value
              </button>
            </div>
          </div>
        </div>
      )}

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
