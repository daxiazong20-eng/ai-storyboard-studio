import type { GenerateMode } from '@shared/types';
import { MODE_LABELS } from '@shared/constants';

export function ModeSelector({ value, onChange, compact = false }: { value: GenerateMode; onChange(value: GenerateMode): void; compact?: boolean }) {
  return <select className={`field ${compact ? 'compact' : ''}`} value={value} onChange={(event) => onChange(event.target.value as GenerateMode)}>
    {Object.entries(MODE_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
  </select>;
}
