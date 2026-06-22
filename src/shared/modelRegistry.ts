import type { ModelInfo } from './types';

export const DEFAULT_MODELS: Record<'image' | 'video' | 'text', ModelInfo[]> = {
  image: [
    { id: 'grok-imagine-image-quality', name: 'Grok Imagine Image Quality', type: 'image', provider: 'hermes-grok' },
    { id: 'grok-imagine-image', name: 'Grok Imagine Image', type: 'image', provider: 'hermes-grok' }
  ],
  video: [
    { id: 'grok-imagine-video', name: 'Grok Imagine Video', type: 'video', provider: 'hermes-grok' },
    { id: 'grok-imagine-video-1.5-preview', name: 'Grok Imagine Video 1.5 Preview', type: 'video', provider: 'hermes-grok' }
  ],
  text: [
    { id: 'grok-build-0.1', name: 'Grok Build 0.1', type: 'text', provider: 'hermes-grok' },
    { id: 'grok-composer-2.5-fast', name: 'Grok Composer 2.5 Fast', type: 'text', provider: 'hermes-grok' },
    { id: 'grok-4.3', name: 'Grok 4.3', type: 'text', provider: 'hermes-grok' },
    { id: 'grok-4.20-0309-reasoning', name: 'Grok 4.20 0309 Reasoning', type: 'text', provider: 'hermes-grok' },
    { id: 'grok-4.20-0309-non-reasoning', name: 'Grok 4.20 0309 Non-Reasoning', type: 'text', provider: 'hermes-grok' },
    { id: 'grok-4.20-multi-agent-0309', name: 'Grok 4.20 Multi-Agent 0309', type: 'text', provider: 'hermes-grok' }
  ]
};

export const ALL_DEFAULT_MODELS = Object.values(DEFAULT_MODELS).flat();
