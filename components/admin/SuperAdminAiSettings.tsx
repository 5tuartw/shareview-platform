'use client';

import { useEffect, useMemo, useState } from 'react';
import { Cpu, KeyRound, Save, SlidersHorizontal } from 'lucide-react';

type AiProvider = 'gemini' | 'openai';
type AiExecutionMode = 'chunked_sync' | 'provider_batch';

type Settings = {
  provider: AiProvider;
  model: string;
  execution_mode: AiExecutionMode;
  chunk_size: number;
  api_key_env_var: string | null;
};

type ProviderModel = {
  model: string;
  supports_batch: boolean;
};

type ApiResponse = {
  settings: Settings;
  defaults: Settings;
  provider_models: Record<AiProvider, ProviderModel[]>;
  supports_batch: boolean;
  api_key_configured: boolean;
  api_key_hint: string;
};

export default function SuperAdminAiSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [keySaved, setKeySaved] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [secretIdInput, setSecretIdInput] = useState('');
  const [providerModels, setProviderModels] = useState<Record<AiProvider, ProviderModel[]>>({
    gemini: [],
    openai: [],
  });
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [apiKeyHint, setApiKeyHint] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/ai-settings');
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || 'Failed to load AI settings.');
      }

      const payload = (await response.json()) as ApiResponse;
      setSettings(payload.settings);
      setSecretIdInput(payload.settings.provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY');
      setProviderModels(payload.provider_models);
      setApiKeyConfigured(payload.api_key_configured);
      setApiKeyHint(payload.api_key_hint);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load AI settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const currentModels = useMemo(() => {
    if (!settings) return [] as ProviderModel[];
    return providerModels[settings.provider] || [];
  }, [providerModels, settings]);

  const currentModelSupportsBatch = useMemo(() => {
    if (!settings) return false;
    return currentModels.some((row) => row.model === settings.model && row.supports_batch);
  }, [currentModels, settings]);

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => {
      if (!prev) return prev;
      return { ...prev, [key]: value };
    });
  };

  const onProviderChanged = (provider: AiProvider) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const firstModel = (providerModels[provider] || [])[0]?.model || prev.model;
      return {
        ...prev,
        provider,
        model: firstModel,
      };
    });
    setSecretIdInput(provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY');
  };

  const save = async () => {
    if (!settings) return;

    setSaving(true);
    setError(null);
    setSaved(null);

    try {
      const response = await fetch('/api/admin/ai-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || 'Failed to save AI settings.');
      }

      const payload = (await response.json()) as ApiResponse;
      setSettings(payload.settings);
      setProviderModels(payload.provider_models);
      setApiKeyConfigured(payload.api_key_configured);
      setApiKeyHint(payload.api_key_hint);
      setSaved('AI settings saved.');
      setTimeout(() => setSaved(null), 3000);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save AI settings.');
    } finally {
      setSaving(false);
    }
  };

  const saveApiKey = async () => {
    if (!settings) return;

    setSavingKey(true);
    setError(null);
    setSaved(null);
    setKeySaved(null);

    try {
      const response = await fetch('/api/admin/ai-settings/secret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: settings.provider,
          api_key: apiKeyInput,
          secret_id: secretIdInput || undefined,
          sync_api_key_env_var: true,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || 'Failed to update API key secret.');
      }

      const payload = (await response.json()) as { deploy_binding_required?: string };
      setApiKeyInput('');
      setKeySaved(payload.deploy_binding_required || 'API key updated in Secret Manager.');
      setTimeout(() => setKeySaved(null), 6000);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to update API key secret.');
    } finally {
      setSavingKey(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <p className="text-sm text-gray-500">Loading AI settings...</p>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="bg-white border border-red-200 rounded-lg p-6">
        <p className="text-sm text-red-700">AI settings are unavailable.</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-5">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="w-5 h-5 text-[#F59E0B]" />
        <h3 className="text-lg font-semibold text-gray-900">AI Provider Settings</h3>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {saved && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {saved}
        </div>
      )}

      {keySaved && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {keySaved}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
          <select
            value={settings.provider}
            onChange={(event) => onProviderChanged(event.target.value as AiProvider)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="gemini">Gemini</option>
            <option value="openai">OpenAI (ChatGPT)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
          <select
            value={settings.model}
            onChange={(event) => updateSetting('model', event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {currentModels.map((row) => (
              <option key={row.model} value={row.model}>
                {row.model}{row.supports_batch ? ' (batch)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Execution mode</label>
          <select
            value={settings.execution_mode}
            onChange={(event) => updateSetting('execution_mode', event.target.value as AiExecutionMode)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="chunked_sync">Chunked sync</option>
            <option value="provider_batch">Provider batch</option>
          </select>
          {settings.execution_mode === 'provider_batch' && !currentModelSupportsBatch && (
            <p className="mt-1 text-xs text-amber-700">Selected model is not marked as batch-capable.</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Chunk size</label>
          <input
            type="number"
            min={1}
            max={100}
            value={settings.chunk_size}
            onChange={(event) => updateSetting('chunk_size', Number(event.target.value || 1))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">API key env var (optional override)</label>
          <input
            type="text"
            value={settings.api_key_env_var || ''}
            onChange={(event) => updateSetting('api_key_env_var', event.target.value || null)}
            placeholder={settings.provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY'}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono"
          />
        </div>
      </div>

      <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 space-y-2">
        <div className="flex items-center gap-2">
          <Cpu className="w-3.5 h-3.5" />
          <span>Batch capability: {currentModelSupportsBatch ? 'Supported' : 'Not marked as supported'}</span>
        </div>
        <div className="flex items-center gap-2">
          <KeyRound className="w-3.5 h-3.5" />
          <span>Key status: {apiKeyConfigured ? 'Configured' : 'Missing'} ({apiKeyHint})</span>
        </div>
      </div>

      <div className="border border-gray-200 rounded-md p-4 space-y-3">
        <h4 className="text-sm font-semibold text-gray-900">Rotate provider API key (Secret Manager)</h4>
        <p className="text-xs text-gray-600">
          This stores a new secret version in Google Secret Manager. The key value is never stored in this database.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">API key value</label>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(event) => setApiKeyInput(event.target.value)}
              placeholder={settings.provider === 'gemini' ? 'Paste Gemini API key' : 'Paste OpenAI API key'}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              autoComplete="off"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Secret ID</label>
            <input
              type="text"
              value={secretIdInput}
              onChange={(event) => setSecretIdInput(event.target.value)}
              placeholder={settings.provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY'}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono"
            />
          </div>
        </div>

        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={saveApiKey}
            disabled={savingKey || !apiKeyInput.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#1C1D1C] text-white text-sm font-semibold hover:bg-black disabled:opacity-50"
          >
            <KeyRound className="w-4 h-4" />
            {savingKey ? 'Updating key...' : 'Update API key'}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#1C1D1C] text-white text-sm font-semibold hover:bg-black disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save AI settings'}
        </button>
      </div>
    </div>
  );
}
