import { Router, Request, Response } from 'express';
import { providerService } from '../ai_infrastructure/provider_service';
import { credentialService } from '../ai_infrastructure/credential_service';
import { modelRegistryService } from '../ai_infrastructure/model_registry_service';
import { intelligenceService } from '../ai_infrastructure/intelligence_service';
import { healthService } from '../ai_infrastructure/health_service';
import { usageService } from '../ai_infrastructure/usage_service';
import { observabilityService } from '../ai_infrastructure/observability_service';
import { openaiCompatibleDriver } from '../ai_infrastructure/openai_compatible_driver';
import { resolveProviderAdapter, getAdapterLabel, PROVIDER_PROTOCOLS, normalizeLegacyProtocol } from '../ai_infrastructure/provider_adapter_registry';
import { secretVault } from '../security/secret_vault';

import { databaseHealthService } from '../ai_infrastructure/database_health_service';

export const aiInfrastructureRouter = Router();

// 1. Provider Management
aiInfrastructureRouter.get('/providers', async (req: Request, res: Response) => {
  try {
    const providers = await providerService.listProviders();
    const credentials = await credentialService.listCredentials();

    const result = providers.map(p => {
      const credCount = credentials.filter(c => c.providerId === p.id).length;
      return {
        ...p,
        credentials: credCount,
      };
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Protocol registry endpoint for the UI dropdown
aiInfrastructureRouter.get('/providers/protocols', async (_req: Request, res: Response) => {
  res.json(PROVIDER_PROTOCOLS);
});

// 1a. Add Provider (protocol-driven; baseUrl requirement decided by protocol registry)
aiInfrastructureRouter.post('/providers', async (req: Request, res: Response) => {
  try {
    const { name, baseUrl, protocol: rawProtocol, description, metadata, capabilities } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Provider name is required.' });
    }

    const protocol = normalizeLegacyProtocol(rawProtocol) || 'openai-compatible';
    const protocolDef = PROVIDER_PROTOCOLS.find(p => p.id === protocol);
    if (!protocolDef) {
      return res.status(400).json({ error: `Unknown protocol: "${protocol}". Allowed: ${PROVIDER_PROTOCOLS.map(p => p.id).join(', ')}.` });
    }

    // Base URL required-ness comes from the protocol registry, not hardcoded logic
    let normalizedUrl: string | undefined = undefined;
    if (baseUrl && baseUrl.trim()) {
      const urlValidation = openaiCompatibleDriver.validateBaseUrl(baseUrl);
      if (!urlValidation.isValid || !urlValidation.normalizedUrl) {
        return res.status(400).json({ error: `Invalid Base URL: ${urlValidation.error}` });
      }
      normalizedUrl = urlValidation.normalizedUrl;
    } else if (protocolDef.baseUrlRequired) {
      return res.status(400).json({ error: `Base URL is required for protocol "${protocolDef.label}".` });
    }

    const existingProviders = await providerService.listProviders();
    const duplicate = existingProviders.find(
      p => p.name.trim().toLowerCase() === name.trim().toLowerCase() ||
           (p.baseUrl && normalizedUrl && p.baseUrl.toLowerCase() === normalizedUrl.toLowerCase())
    );
    if (duplicate) {
      return res.status(409).json({
        error: `A provider with this name ("${duplicate.name}") or Base URL already exists (ID: ${duplicate.id}).`,
      });
    }

    // Auto-generate safe provider ID
    const sanitizedName = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 24);
    const id = `${sanitizedName}_${Date.now().toString(36)}`;

    const newProvider = await providerService.addProvider({
      id,
      name: name.trim(),
      type: protocol,
      protocol,
      description,
      metadata,
      baseUrl: normalizedUrl,
      enabled: true,
      capabilities: capabilities || { text: true, vision: false, image: false, video: false },
    });

    res.status(201).json(newProvider);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 1b. Delete Custom Provider
aiInfrastructureRouter.delete('/providers/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (id === 'google') {
      return res.status(400).json({ error: 'Cannot delete default native Google provider.' });
    }

    const result = await providerService.removeProvider(id);
    if (!result.success) {
      return res.status(404).json({ error: 'Provider not found.' });
    }
    res.json({
      success: true,
      id,
      detachedCredentials: result.detachedCredentials,
      detachedModels: result.detachedModels,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 1b2. Update Provider (Name, BaseURL, Enabled)
aiInfrastructureRouter.patch('/providers/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, baseUrl, enabled, capabilities, protocol, description, metadata } = req.body;
    const provider = await providerService.getProvider(id);
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found.' });
    }

    let normalizedUrl = provider.baseUrl;
    if (baseUrl !== undefined && baseUrl !== provider.baseUrl) {
      if (baseUrl && baseUrl.trim()) {
        const urlValidation = openaiCompatibleDriver.validateBaseUrl(baseUrl);
        if (!urlValidation.isValid) {
          return res.status(400).json({ error: `Invalid Base URL: ${urlValidation.error}` });
        }
        normalizedUrl = urlValidation.normalizedUrl;
      } else {
        normalizedUrl = undefined;
      }
    }

    const nextProtocol = protocol !== undefined ? normalizeLegacyProtocol(protocol) : (provider.protocol || provider.type);

    const updated = await providerService.updateProvider(id, {
      name: name !== undefined ? name.trim() : provider.name,
      baseUrl: normalizedUrl,
      protocol: nextProtocol,
      description: description !== undefined ? description : provider.description,
      metadata: metadata !== undefined ? metadata : provider.metadata,
      enabled: enabled !== undefined ? Boolean(enabled) : provider.enabled,
      capabilities: capabilities || provider.capabilities,
    });

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 1b3. Test Provider Base URL Reachability
aiInfrastructureRouter.post('/providers/:id/test', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const provider = await providerService.getProvider(id);
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found.' });
    }

    // Resolve adapter by protocol (no hardcoded provider names)
    const adapter = resolveProviderAdapter(provider);

    // Try finding credential or do public ping
    const creds = await credentialService.listCredentials();
    const cred = creds.find(c => c.providerId === id);
    const apiKey = cred ? secretVault.decryptSecret(cred.encryptedSecret) : '';

    const testResult = await adapter.testConnection(provider, apiKey);

    // Persist health result on provider
    await providerService.updateProvider(id, {
      healthStatus: testResult.success ? 'connected' : 'failed',
      healthLatency: testResult.latencyMs,
      healthLastCheckedAt: Date.now(),
      healthError: testResult.error,
    });

    res.json(testResult);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 1c. Discover Models from Provider (protocol-driven; falls back to manual input)
aiInfrastructureRouter.post('/providers/:id/discover-models', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const provider = await providerService.getProvider(id);
    if (!provider) {
      return res.status(404).json({ error: `Provider "${id}" not found.` });
    }

    const adapter = resolveProviderAdapter(provider);
    if (!adapter.discoverModels) {
      return res.status(400).json({
        error: `Protocol "${provider.protocol || provider.type}" does not support automatic model discovery. Use manual model input.`,
        manualInputRequired: true,
      });
    }

    // Find first active credential for this provider to authenticate discovery
    const creds = await credentialService.listCredentials();
    const providerCreds = creds.filter(c => c.providerId === id && c.status === 'active');
    if (providerCreds.length === 0) {
      return res.status(400).json({
        error: `Please add an active API key credential for provider "${provider.name}" before discovering models.`,
      });
    }

    const apiKey = secretVault.decryptSecret(providerCreds[0].encryptedSecret);
    const result = await adapter.discoverModels(provider, apiKey);

    if (!result) {
      return res.status(400).json({
        error: 'Discovery unavailable for this provider; use manual model input.',
        manualInputRequired: true,
      });
    }

    // Idempotently upsert models into Model Registry preserving providerId distinction
    const existingModels = await modelRegistryService.listModels();
    const addedModels = [];

    for (const m of result.models) {
      const exists = existingModels.some(existing => existing.id === m.id && existing.providerId === id);
      if (!exists) {
        const newModel = await modelRegistryService.addModel({
          id: m.id,
          providerId: id,
          displayName: m.displayName,
          tier: 'flash',
          capabilities: m.capabilities,
          enabled: true,
        });
        addedModels.push(newModel);
      }
    }

    const allModels = await modelRegistryService.listModels();
    const providerModels = allModels.filter(m => m.providerId === id);

    res.json({
      success: true,
      discoveredCount: result.models.length,
      addedCount: addedModels.length,
      models: providerModels,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 1b. Model Catalog & Registry
aiInfrastructureRouter.get('/models', async (req: Request, res: Response) => {
  try {
    const models = await modelRegistryService.listModels();
    res.json(models);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 1c. Add Model Manually
aiInfrastructureRouter.post('/models', async (req: Request, res: Response) => {
  try {
    const { id, displayName, providerId = 'google', tier = 'flash', capabilities = ['text'], contextWindow, enabled = true } = req.body;
    if (!id || !id.trim()) {
      return res.status(400).json({ error: 'Model ID is required.' });
    }

    const newModel = await modelRegistryService.addModel({
      id: id.trim(),
      displayName: (displayName || id).trim(),
      providerId,
      tier,
      capabilities: Array.isArray(capabilities) ? capabilities : ['text'],
      contextWindow: contextWindow ? Number(contextWindow) : undefined,
      enabled: enabled !== false,
    });

    res.status(201).json(newModel);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 1d. Update Model (e.g. Toggle enabled, tier, contextWindow)
aiInfrastructureRouter.patch('/models/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { providerId, enabled, tier, displayName, contextWindow, capabilities } = req.body;
    const partial: any = {};
    if (enabled !== undefined) partial.enabled = Boolean(enabled);
    if (tier !== undefined) partial.tier = tier;
    if (displayName !== undefined) partial.displayName = displayName;
    if (contextWindow !== undefined) partial.contextWindow = Number(contextWindow);
    if (capabilities !== undefined) partial.capabilities = capabilities;

    const updated = await modelRegistryService.updateModel(id, partial, providerId || (req.query.providerId as string));
    if (!updated) {
      return res.status(404).json({ error: 'Model not found.' });
    }
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 1e. Delete Model
aiInfrastructureRouter.delete('/models/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const providerId = (req.query.providerId as string) || (req.body?.providerId as string);
    const success = await modelRegistryService.removeModel(id, providerId);
    if (!success) {
      return res.status(404).json({ error: 'Model not found or already deleted.' });
    }
    res.json({ success: true, id, providerId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 1f. Bulk Delete Models
aiInfrastructureRouter.post('/models/bulk-delete', async (req: Request, res: Response) => {
  try {
    const { models } = req.body; // Array of { id: string, providerId?: string }
    if (!Array.isArray(models) || models.length === 0) {
      return res.status(400).json({ error: 'Array of models is required.' });
    }

    let deletedCount = 0;
    for (const item of models) {
      const modelId = typeof item === 'string' ? item : item.id;
      const provId = typeof item === 'string' ? undefined : item.providerId;
      if (modelId) {
        const deleted = await modelRegistryService.removeModel(modelId, provId);
        if (deleted) deletedCount++;
      }
    }

    res.json({ success: true, deletedCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 1g. Reset Models to Baseline Defaults
aiInfrastructureRouter.post('/models/reset-defaults', async (req: Request, res: Response) => {
  try {
    const models = await modelRegistryService.resetToDefaults();
    res.json({ success: true, models });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Credential Pool (Never expose encryptedSecret or plaintext)
aiInfrastructureRouter.get('/credentials', async (req: Request, res: Response) => {
  try {
    const credentials = await credentialService.listCredentials();
    const intelligenceList = await intelligenceService.getAllCredentialsIntelligence();
    const intelMap = new Map(intelligenceList.map(i => [i.credentialId, i]));

    const sanitized = credentials.map(c => {
      const intel = intelMap.get(c.id);
      return {
        id: c.id,
        providerId: c.providerId,
        name: c.name,
        maskedKey: c.maskedKey,
        status: c.status,
        priority: c.priority,
        weight: c.weight,
        lastUsedAt: c.lastUsedAt || null,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        quota: c.quota || null,
        usage: c.usage || null,
        successRate: intel?.health.successRate ?? c.usage?.successRate ?? 100,
        totalTokens: intel?.metrics.totalTokens ?? c.usage?.totalTokens ?? 0,
        totalRequests: intel?.metrics.totalRequests ?? c.usage?.totalRequests ?? 0,
        healthStatus: intel?.health.status ?? 'healthy',
        cooldownRemainingSec: intel?.health.cooldownRemainingSec ?? null,
      };
    });

    res.json(sanitized);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Add API Key
aiInfrastructureRouter.post('/credentials', async (req: Request, res: Response) => {
  try {
    const { providerId, providerName, name, secret, apiKey, baseUrl, protocol, description, metadata, capabilities, priority, weight, quota } = req.body;
    if (!name || !(secret || apiKey)) {
      return res.status(400).json({ error: 'name and apiKey are required.' });
    }

    // A connection may create its provider inline; provider IDs are not registry-enforced.
    let provider = providerId ? await providerService.getProvider(providerId) : null;
    let resolvedProviderId = providerId;
    if (!provider) {
      if (!baseUrl) {
        return res.status(400).json({ error: 'baseUrl is required when creating a new provider connection.' });
      }
      const generatedId = `provider_${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}_${Date.now().toString(36)}`;
      provider = await providerService.addProvider({
        id: resolvedProviderId || generatedId,
        name: providerName?.trim() || name.trim(),
        type: protocol || 'openai-compatible',
        baseUrl,
        protocol: protocol || 'openai-compatible',
        description,
        metadata,
        enabled: true,
        capabilities: capabilities || { text: true, vision: false, image: false, video: false },
      });
      resolvedProviderId = provider.id;
    }

    const existingCreds = await credentialService.listCredentials();
    const duplicateName = existingCreds.find(
      c => c.providerId === resolvedProviderId && c.name.trim().toLowerCase() === name.trim().toLowerCase()
    );
    if (duplicateName) {
      return res.status(400).json({
        error: `A credential named "${name.trim()}" already exists for provider "${resolvedProviderId}".`,
      });
    }

    const newCred = await credentialService.addCredential({
      providerId: resolvedProviderId,
      name: name.trim(),
      secret: (secret || apiKey).trim(),
      status: 'active',
      priority: priority || 1,
      weight: weight || 10,
      quota,
    });

    res.status(201).json({
      id: newCred.id,
      providerId: newCred.providerId,
      name: newCred.name,
      maskedKey: newCred.maskedKey,
      status: newCred.status,
      priority: newCred.priority,
      weight: newCred.weight,
      createdAt: newCred.createdAt,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4b. Update Credential (Priority, Weight, Status)
aiInfrastructureRouter.patch('/credentials/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, priority, weight, status } = req.body;
    const cred = await credentialService.getCredential(id);
    if (!cred) {
      return res.status(404).json({ error: 'Credential not found.' });
    }

    const updated = await credentialService.updateCredential(id, {
      name: name !== undefined ? name.trim() : cred.name,
      priority: priority !== undefined ? Number(priority) : cred.priority,
      weight: weight !== undefined ? Number(weight) : cred.weight,
      status: status !== undefined ? status : cred.status,
    });

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Delete Credential
aiInfrastructureRouter.delete('/credentials/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const success = await credentialService.removeCredential(id);
    if (!success) {
      return res.status(404).json({ error: 'Credential not found.' });
    }
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Test Credential Connectivity
aiInfrastructureRouter.post('/credentials/:id/test', async (req: Request, res: Response) => {
  const { id } = req.params;
  const startTime = Date.now();
  try {
    const cred = await credentialService.getCredential(id);
    if (!cred) {
      return res.status(404).json({ success: false, error: 'Credential not found.' });
    }

    const apiKey = secretVault.decryptSecret(cred.encryptedSecret);
    const provider = await providerService.getProvider(cred.providerId);

    let testModel = 'gemini-3.7-flash';
    let responseSample = '';
    let latencyMs = 0;

    if (provider) {
      const adapter = resolveProviderAdapter(provider);
      const protocol = (provider.protocol || provider.type || '').toLowerCase();
      testModel = protocol === 'google-generative-ai' || protocol === 'gemini' ? 'gemini-3.7-flash' : 'openai-compatible-model';
      const testResult = await adapter.testConnection(provider, apiKey);
      latencyMs = testResult.latencyMs;

      if (!testResult.success) {
        throw new Error(testResult.error || 'Connection check failed');
      }
      responseSample = 'Connection verified successfully';

      // Persist provider health
      await providerService.updateProvider(provider.id, {
        healthStatus: 'connected',
        healthLatency: latencyMs,
        healthLastCheckedAt: Date.now(),
        healthError: undefined,
      });
    } else {
      throw new Error('Provider not found for credential.');
    }

    await usageService.recordUsage({
      credentialId: cred.id,
      modelId: testModel,
      requestType: 'connectivity_test',
      stage: 'test',
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      latencyMs,
      success: true,
    });
    await healthService.recordSuccess(cred.id);

    res.json({
      success: true,
      latency: latencyMs,
      model: testModel,
      responseSample,
    });
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    const errorMsg = err.message || 'Unknown connection error';

    try {
      const cred = await credentialService.getCredential(id);
      if (cred) {
        await usageService.recordUsage({
          credentialId: cred.id,
          modelId: 'connectivity-test',
          requestType: 'connectivity_test',
          stage: 'test',
          latencyMs,
          success: false,
          errorType: errorMsg,
        });
        await healthService.recordFailure(cred.id, errorMsg);
      }
    } catch {}

    res.status(400).json({
      success: false,
      latency: latencyMs,
      error: errorMsg,
    });
  }
});

// 6. Health & Intelligence Dashboard
aiInfrastructureRouter.get('/intelligence', async (req: Request, res: Response) => {
  try {
    const overview = await intelligenceService.getDashboardOverview();
    const credentials = await credentialService.listCredentials();

    res.json({
      totalCredentials: credentials.length,
      healthy: overview.healthyCount,
      cooldown: overview.cooldownCount,
      down: overview.downCount,
      totalTokensToday: overview.totalTokensUsed,
      successRate: overview.overallSuccessRate,
      credentials: overview.credentials,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Request Execution Logs & Telemetry
aiInfrastructureRouter.get('/logs', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 500);
    const usages = await usageService.listUsage(limit);

    const logs = usages.map(u => ({
      id: u.id,
      timestamp: u.timestamp,
      credentialId: u.credentialId,
      modelId: u.modelId,
      requestType: u.requestType || 'generation',
      stage: u.stage || 'unknown',
      promptTokens: u.promptTokens || 0,
      completionTokens: u.completionTokens || 0,
      totalTokens: u.totalTokens || ((u.promptTokens || 0) + (u.completionTokens || 0)),
      latencyMs: u.latencyMs || 0,
      success: u.success,
      errorType: u.errorType || null,
    }));

    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7b. Clear Execution Logs
aiInfrastructureRouter.delete('/logs', async (req: Request, res: Response) => {
  try {
    const success = await usageService.clearUsage();
    await observabilityService.clearTelemetry();
    res.json({ success, message: 'Execution logs and telemetry cleared successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7c. Full Control Plane Telemetry Traces
aiInfrastructureRouter.get('/telemetry', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 500);
    const agentName = req.query.agentName as string | undefined;
    const providerId = req.query.providerId as string | undefined;
    const modelId = req.query.modelId as string | undefined;
    const successParam = req.query.success as string | undefined;

    let success: boolean | undefined = undefined;
    if (successParam === 'true') success = true;
    if (successParam === 'false') success = false;

    const telemetry = await observabilityService.listTelemetry({
      limit,
      agentName,
      providerId,
      modelId,
      success,
    });

    res.json(telemetry);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7d. Control Plane Telemetry Summary Metrics
aiInfrastructureRouter.get('/telemetry/summary', async (req: Request, res: Response) => {
  try {
    const metrics = await observabilityService.getSummaryMetrics();
    res.json(metrics);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Run Comprehensive System Health Check
aiInfrastructureRouter.post('/health/check-all', async (req: Request, res: Response) => {
  try {
    const credentials = await credentialService.listCredentials();
    const activeCreds = credentials.filter(c => c.status === 'active');
    const results: Array<{ credentialId: string; name: string; providerId: string; success: boolean; latencyMs?: number; error?: string }> = [];

    for (const cred of activeCreds) {
      const startTime = Date.now();
      try {
        const apiKey = secretVault.decryptSecret(cred.encryptedSecret);
        const provider = await providerService.getProvider(cred.providerId);
        let latencyMs = 0;

        if (provider) {
          const adapter = resolveProviderAdapter(provider);
          const testRes = await adapter.testConnection(provider, apiKey);
          latencyMs = testRes.latencyMs;
          if (!testRes.success) throw new Error(testRes.error || 'Connection failed');

          // Persist provider health
          await providerService.updateProvider(provider.id, {
            healthStatus: 'connected',
            healthLatency: latencyMs,
            healthLastCheckedAt: Date.now(),
            healthError: undefined,
          });
        } else {
          throw new Error(`Provider not found for credential ${cred.id}.`);
        }

        await healthService.recordSuccess(cred.id);
        results.push({ credentialId: cred.id, name: cred.name, providerId: cred.providerId, success: true, latencyMs });
      } catch (err: any) {
        const latencyMs = Date.now() - startTime;
        await healthService.recordFailure(cred.id, err.message);
        results.push({ credentialId: cred.id, name: cred.name, providerId: cred.providerId, success: false, latencyMs, error: err.message });
      }
    }

    const overview = await intelligenceService.getDashboardOverview();
    res.json({
      success: true,
      timestamp: Date.now(),
      checkedCount: results.length,
      results,
      overview,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 9. SINEMA Control Center & Database Health Dashboard
aiInfrastructureRouter.get('/control-center', async (req: Request, res: Response) => {
  try {
    const dbHealth = await databaseHealthService.getHealthReport();
    const overview = await intelligenceService.getDashboardOverview();
    const summaryMetrics = await observabilityService.getSummaryMetrics();

    res.json({
      timestamp: new Date().toISOString(),
      database: {
        status: dbHealth.connectionStatus,
        pool: dbHealth.connectionPool,
        latency: dbHealth.latency,
        metrics: dbHealth.metrics,
        tableBaselines: dbHealth.tableBaselines,
      },
      aiSystem: {
        healthyProviders: overview.healthyCount,
        cooldownProviders: overview.cooldownCount,
        downProviders: overview.downCount,
        totalTokensToday: summaryMetrics.totalTokensUsed,
        overallSuccessRate: summaryMetrics.overallSuccessRate,
        totalFailovers: summaryMetrics.totalFailovers,
        modelBreakdown: summaryMetrics.modelBreakdown,
      },
      pipeline: {
        stages: dbHealth.pipelineStageHealth,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

aiInfrastructureRouter.get('/observability/dashboard', async (req: Request, res: Response) => {
  try {
    const dbHealth = await databaseHealthService.getHealthReport();
    res.json(dbHealth);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
