import type { GenerateMode, ModelInfo } from '@shared/types';
import { useStudioStore } from '../stores/studioStore';

export function ModelSelector({ mode, value, onChange }: { mode: GenerateMode | 'text'; value: string; onChange(value: string): void }) {
  const models = useStudioStore((state) => state.models);
  const type: ModelInfo['type'] = mode === 'text' ? 'text' : mode === 'text-to-image' || mode === 'image-edit' ? 'image' : 'video';
  const filtered = models.filter((model) => model.type === type && isCompatible(mode, model.id));
  return <select className="field" value={value} onChange={(event) => onChange(event.target.value)}>
    {filtered.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
  </select>;
}

export const isCompatible = (mode: GenerateMode | 'text', modelId: string) => {
  if (mode === 'image-edit') return modelId === 'grok-imagine-image-quality';
  return !(['text-to-video', 'reference-to-video', 'video-extension'] as Array<GenerateMode | 'text'>).includes(mode) || !/video-1\.5/i.test(modelId);
};
