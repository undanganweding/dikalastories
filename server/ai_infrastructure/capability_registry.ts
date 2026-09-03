export type AICapability = 'text' | 'vision' | 'image' | 'video';

export interface ModelCapability {
  id: string;
  name: string;
  providerId: string;
  supportedCapabilities: string[];
  costPer1kInputTokens?: number;
  costPer1kOutputTokens?: number;
  tier?: 'flash' | 'pro' | 'ultra';
}

export interface ModelDefinition {
  id: string;
  requiredCapability: AICapability;
  providers: {
    [providerId: string]: {
      supported: boolean;
      nativeModelName?: string;
    };
  };
}

export class AICapabilityError extends Error {
  readonly isCapabilityError = true;
  constructor(message: string) {
    super(message);
    this.name = 'AICapabilityError';
  }
}

// Config-driven capability registry
export const modelsRegistry: Record<string, ModelDefinition> = {
  'ops-5': {
    id: 'ops-5',
    requiredCapability: 'text',
    providers: {
      'google': {
        supported: true,
        nativeModelName: 'gemini-3.7-flash',
      },
      // Any custom provider id will support ops-5 by default (native exact match)
      'custom_gate_provider': {
        supported: true,
        nativeModelName: 'ops-5',
      },
    },
  },
  'gemini-2.5-flash': {
    id: 'gemini-2.5-flash',
    requiredCapability: 'text',
    providers: {
      'google': {
        supported: true,
        nativeModelName: 'gemini-2.5-flash',
      },
    },
  },
  'gemini-2.5-pro': {
    id: 'gemini-2.5-pro',
    requiredCapability: 'text',
    providers: {
      'google': {
        supported: true,
        nativeModelName: 'gemini-2.5-pro',
      },
    },
  },
  'gemini-3.7-flash': {
    id: 'gemini-3.7-flash',
    requiredCapability: 'text',
    providers: {
      'google': {
        supported: true,
        nativeModelName: 'gemini-3.7-flash',
      },
    },
  },
  'gemini-3.1-pro-preview': {
    id: 'gemini-3.1-pro-preview',
    requiredCapability: 'text',
    providers: {
      'google': {
        supported: true,
        nativeModelName: 'gemini-3.1-pro-preview',
      },
    },
  },
  'gemini-3.6-flash': {
    id: 'gemini-3.6-flash',
    requiredCapability: 'text',
    providers: {
      'google': {
        supported: true,
        nativeModelName: 'gemini-3.6-flash',
      },
    },
  },
  'gemini-3.5-flash': {
    id: 'gemini-3.5-flash',
    requiredCapability: 'text',
    providers: {
      'google': {
        supported: true,
        nativeModelName: 'gemini-3.5-flash',
      },
    },
  },
  'gemini-3.1-flash-lite': {
    id: 'gemini-3.1-flash-lite',
    requiredCapability: 'text',
    providers: {
      'google': {
        supported: true,
        nativeModelName: 'gemini-3.1-flash-lite',
      },
    },
  },
  'gemini-3.8-flash': {
    id: 'gemini-3.8-flash',
    requiredCapability: 'text',
    providers: {
      'google': {
        supported: true,
        nativeModelName: 'gemini-3.8-flash',
      },
    },
  },
  'gemini-3.1-flash-image': {
    id: 'gemini-3.1-flash-image',
    requiredCapability: 'image',
    providers: {
      'google': {
        supported: true,
        nativeModelName: 'gemini-3.1-flash-image',
      },
    },
  },
  'veo-3.1-lite-generate-preview': {
    id: 'veo-3.1-lite-generate-preview',
    requiredCapability: 'video',
    providers: {
      'google': {
        supported: true,
        nativeModelName: 'veo-3.1-lite-generate-preview',
      },
    },
  },
};

export const capabilityRegistry = {
  // Get canonical capability required for a model
  getRequiredCapability(modelId: string): AICapability {
    const model = modelsRegistry[modelId];
    if (model) {
      return model.requiredCapability;
    }
    // Default to text if unknown
    return 'text';
  },

  // Check if provider is capable based on requested model, required capability, and provider capabilities config
  isProviderCapable(providerId: string, modelId: string, provider: any): { capable: boolean; reason?: string } {
    // 1. Check provider-wide capabilities from db config
    const reqCap = this.getRequiredCapability(modelId);
    if (provider && provider.capabilities) {
      const capEnabled = provider.capabilities[reqCap];
      if (!capEnabled) {
        return {
          capable: false,
          reason: `Provider '${providerId}' does not support required capability '${reqCap}'`,
        };
      }
    }

    // 2. Check model-specific registry
    const modelDef = modelsRegistry[modelId];
    if (!modelDef) {
      // If it's a completely unknown model, we class it as model-not-found
      return {
        capable: false,
        reason: `Model '${modelId}' not found in registry`,
      };
    }

    // If custom provider has exact model matching
    const provConfig = modelDef.providers[providerId];
    if (provConfig && provConfig.supported) {
      return { capable: true };
    }

    // For any custom provider (openai-compatible), we assume it natively supports 'ops-5' unless specifically registered otherwise
    if (providerId !== 'google' && modelId === 'ops-5') {
      return { capable: true };
    }

    return {
      capable: false,
      reason: `Provider '${providerId}' does not support model '${modelId}'`,
    };
  },

  // Resolve native model name for a provider
  resolveNativeModel(providerId: string, modelId: string): string {
    const modelDef = modelsRegistry[modelId];
    if (modelDef) {
      const provConfig = modelDef.providers[providerId];
      if (provConfig && provConfig.nativeModelName) {
        return provConfig.nativeModelName;
      }
    }
    return modelId;
  },
};
