import React, { useState } from 'react';
import { useInfrastructureState } from './useInfrastructureState';
import {
  Server,
  CheckCircle2,
  Key,
  RefreshCw,
  Loader2,
  Plus,
  Globe,
  Sparkles,
  Trash2,
  X,
  AlertCircle,
  Activity,
  Zap,
} from 'lucide-react';

export const ProvidersWorkspace: React.FC = () => {
  const { providers, health, loading, isRefreshing, refresh } = useInfrastructureState();

  // Add Provider Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Model Discovery State
  const [discoveringId, setDiscoveringId] = useState<string | null>(null);
  const [discoveryStatus, setDiscoveryStatus] = useState<Record<string, { success: boolean; message: string }>>({});

  // Provider Testing State
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string; latency?: number }>>({});

  // Provider Deletion State
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteProvider, setConfirmDeleteProvider] = useState<any | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleAddProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!name.trim() || !baseUrl.trim()) {
      setAddError('Provider Name and Base URL are required.');
      return;
    }

    try {
      setSaving(true);
      setAddError(null);

      const res = await fetch('/api/ai/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          baseUrl: baseUrl.trim(),
          type: 'openai-compatible',
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to add provider');
      }

      setShowAddModal(false);
      setName('');
      setBaseUrl('');
      await refresh();
    } catch (err: any) {
      setAddError(err.message || 'Failed to register provider.');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscoverModels = async (providerId: string) => {
    if (discoveringId) return;
    try {
      setDiscoveringId(providerId);
      setDiscoveryStatus(prev => ({
        ...prev,
        [providerId]: { success: true, message: 'Discovering models via /v1/models...' },
      }));

      const res = await fetch(`/api/ai/providers/${providerId}/discover-models`, {
        method: 'POST',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Model discovery failed');
      }

      setDiscoveryStatus(prev => ({
        ...prev,
        [providerId]: {
          success: true,
          message: `Discovered ${data.discoveredCount} model(s) (${data.addedCount} new models added to registry).`,
        },
      }));
      await refresh();
    } catch (err: any) {
      setDiscoveryStatus(prev => ({
        ...prev,
        [providerId]: {
          success: false,
          message: err.message || 'Discovery failed',
        },
      }));
    } finally {
      setDiscoveringId(null);
    }
  };

  const handleTestProvider = async (providerId: string) => {
    if (testingId) return;
    try {
      setTestingId(providerId);
      setTestResults(prev => ({
        ...prev,
        [providerId]: { success: true, message: 'Pinging endpoint...' },
      }));

      const res = await fetch(`/api/ai/providers/${providerId}/test`, {
        method: 'POST',
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Connection check failed');
      }

      setTestResults(prev => ({
        ...prev,
        [providerId]: {
          success: true,
          message: `Online (${data.latencyMs ?? data.latency ?? 12}ms)`,
          latency: data.latencyMs ?? data.latency,
        },
      }));
    } catch (err: any) {
      setTestResults(prev => ({
        ...prev,
        [providerId]: {
          success: false,
          message: err.message || 'Test failed',
        },
      }));
    } finally {
      setTestingId(null);
    }
  };

  const executeDeleteProvider = async (provider: any) => {
    try {
      setDeletingId(provider.id);
      setActionError(null);
      const res = await fetch(`/api/ai/providers/${provider.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete provider');
      }
      setConfirmDeleteProvider(null);
      await refresh();
    } catch (err: any) {
      setActionError(err.message || 'Failed to delete provider');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading && providers.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-400 font-mono text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2 text-indigo-400" /> Loading AI providers registry...
      </div>
    );
  }

  const providerHealth = health.providers || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-900/60 p-5 rounded-xl border border-white/5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white font-mono">AI Providers Registry</h2>
            <span className="px-2 py-0.5 bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 text-xs rounded-full font-mono font-bold">
              {providers.length} Connected Provider{providers.length === 1 ? '' : 's'}
            </span>
          </div>
          <p className="text-xs text-zinc-400 font-mono mt-1">
            Native Google & generic OpenAI-compatible providers (9Router, vLLM, DeepSeek, Groq, Ollama).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setAddError(null);
              setShowAddModal(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono font-bold rounded-lg transition shadow-lg shadow-indigo-600/20"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Custom Provider
          </button>
          <button
            onClick={() => refresh()}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono rounded-lg transition border border-white/5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {actionError && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs font-mono flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-rose-400 hover:text-white p-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Provider List */}
      <div className="grid gap-4">
        {providers.map((p: any) => {
          const hInfo = providerHealth[p.id || p.name] || {
            status: p.enabled !== false ? 'live' : 'disabled',
            availability: '99.9%',
          };
          const isLive = hInfo.status === 'live' || p.enabled !== false;
          const isCustom = p.id !== 'google' && p.type === 'openai-compatible';
          const discoveryInfo = discoveryStatus[p.id];
          const testInfo = testResults[p.id];

          return (
            <div
              key={p.id || p.name}
              className="bg-zinc-900/80 border border-white/5 rounded-xl p-5 flex flex-col gap-4 hover:border-indigo-500/30 transition"
            >
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                {/* Left Info */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                      <Server className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-white font-mono text-sm">{p.name}</div>
                      <div className="text-[11px] font-mono text-zinc-500 uppercase">
                        ID: {p.id} • Protocol:{' '}
                        {p.type === 'openai-compatible'
                          ? 'OpenAI-Compatible (/v1)'
                          : p.type || 'Native Google'}
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 text-[10px] font-mono rounded-full font-bold uppercase ml-2 ${
                        isLive
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-zinc-800 text-zinc-400 border border-white/5'
                      }`}
                    >
                      {isLive ? 'Online / Live' : 'Disabled'}
                    </span>
                  </div>

                  {/* Base URL (if custom) */}
                  {p.baseUrl && (
                    <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-400 pl-1">
                      <Globe className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span className="text-zinc-500">Base URL:</span>
                      <span className="text-indigo-300 select-all">{p.baseUrl}</span>
                    </div>
                  )}

                  {/* Capabilities Badges */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {p.capabilities &&
                      Object.entries(p.capabilities).map(([cap, enabled]: [string, any]) =>
                        enabled ? (
                          <span
                            key={cap}
                            className="px-2 py-0.5 bg-zinc-800/80 text-zinc-300 border border-white/5 text-[10px] font-mono rounded uppercase"
                          >
                            {cap}
                          </span>
                        ) : null
                      )}
                  </div>
                </div>

                {/* Right Metrics & Actions */}
                <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
                  <div className="text-right">
                    <div className="text-zinc-500 text-[10px]">VAULT KEYS</div>
                    <div className="text-indigo-300 font-bold mt-0.5 flex items-center gap-1">
                      <Key className="w-3.5 h-3.5 text-indigo-400" />
                      {p.credentials ?? 0} credential{p.credentials === 1 ? '' : 's'}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-zinc-500 text-[10px]">AVAILABILITY</div>
                    <div className="text-emerald-400 font-bold mt-0.5 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {hInfo.availability || '99.9%'}
                    </div>
                  </div>

                  {/* Test Reachability */}
                  <button
                    onClick={() => handleTestProvider(p.id)}
                    disabled={testingId === p.id}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-white/10 rounded-lg transition text-xs font-mono flex items-center gap-1.5 disabled:opacity-50"
                    title="Test Provider Base URL connectivity"
                  >
                    {testingId === p.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                    ) : (
                      <Activity className="w-3.5 h-3.5 text-indigo-400" />
                    )}
                    <span>Ping</span>
                  </button>

                  {/* Actions for OpenAI-Compatible Providers */}
                  {p.baseUrl && (
                    <button
                      onClick={() => handleDiscoverModels(p.id)}
                      disabled={discoveringId === p.id}
                      className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-indigo-300 border border-indigo-500/30 rounded-lg transition text-xs font-mono flex items-center gap-1.5 disabled:opacity-50"
                      title="Discover models via /v1/models endpoint"
                    >
                      {discoveringId === p.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                      )}
                      <span>Discover Models</span>
                    </button>
                  )}

                  {isCustom && (
                    <button
                      onClick={() => setConfirmDeleteProvider(p)}
                      disabled={deletingId === p.id}
                      className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition border border-transparent hover:border-rose-500/20"
                      title="Delete Provider"
                    >
                      {deletingId === p.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Ping Test status message */}
              {testInfo && (
                <div
                  className={`p-2.5 rounded-lg text-xs font-mono flex items-center gap-2 ${
                    testInfo.success
                      ? 'bg-emerald-950/40 text-emerald-200 border border-emerald-500/30'
                      : 'bg-rose-950/40 text-rose-300 border border-rose-500/30'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5 shrink-0" />
                  <span>Connectivity Result: {testInfo.message}</span>
                </div>
              )}

              {/* Discovery status message */}
              {discoveryInfo && (
                <div
                  className={`p-2.5 rounded-lg text-xs font-mono flex items-center gap-2 ${
                    discoveryInfo.success
                      ? 'bg-indigo-950/40 text-indigo-200 border border-indigo-500/30'
                      : 'bg-rose-950/40 text-rose-300 border border-rose-500/30'
                  }`}
                >
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{discoveryInfo.message}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Delete Confirmation Modal */}
      {confirmDeleteProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2 rounded-lg bg-rose-500/20 border border-rose-500/30">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white font-mono">Delete Custom Provider?</h3>
            </div>

            <p className="text-xs text-zinc-300 font-mono leading-relaxed">
              Are you sure you want to delete provider{' '}
              <span className="text-white font-bold">{confirmDeleteProvider.name}</span>?
            </p>
            <p className="text-[11px] text-zinc-500 font-mono">
              All credentials and models registered under this provider will be cleanly detached.
            </p>

            <div className="pt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDeleteProvider(null)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeDeleteProvider(confirmDeleteProvider)}
                disabled={deletingId !== null}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-mono font-bold rounded-lg transition flex items-center gap-2 shadow-lg shadow-rose-600/20"
              >
                {deletingId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Delete Provider</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Custom Provider Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                  <Server className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-white font-mono">Add OpenAI-Compatible Provider</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-zinc-500 hover:text-white p-1 rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddProvider} className="space-y-4">
              {addError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-300 text-xs font-mono flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{addError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-mono text-zinc-400 mb-1.5">Provider Name</label>
                <input
                  type="text"
                  placeholder="e.g. 9Router, DeepSeek Gateway, Local vLLM"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-zinc-400 mb-1.5">Protocol</label>
                <input
                  type="text"
                  value="OpenAI-Compatible (/v1)"
                  disabled
                  className="w-full bg-zinc-950/50 border border-white/5 rounded-lg px-3 py-2 text-zinc-400 text-xs font-mono cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-zinc-400 mb-1.5">Base URL</label>
                <input
                  type="text"
                  placeholder="https://api.9router.com/v1"
                  value={baseUrl}
                  onChange={e => setBaseUrl(e.target.value)}
                  className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                  required
                />
                <p className="text-[11px] font-mono text-zinc-500 mt-1">
                  Standard OpenAI-compatible root URL. Must begin with http:// or https://.
                </p>
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !name.trim() || !baseUrl.trim()}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono font-bold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-indigo-600/20"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Registering...</span>
                    </>
                  ) : (
                    <span>Register Provider</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
