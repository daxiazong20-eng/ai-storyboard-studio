import type { Asset, GenerateMode } from '@shared/types';

export type PromptBuildResult = { finalPrompt: string; referencedAssets: Asset[]; missingNames: string[] };

export function parseAssetMentions(prompt: string): string[] {
  return [...prompt.matchAll(/@([^\s，。！？、；：,.!?;:"“”]+)/g)].map((match) => match[1].trim()).filter(Boolean);
}

export function buildPrompt(prompt: string, assets: Asset[], _mode: GenerateMode, explicitAssets: Asset[] = []): PromptBuildResult {
  const names = parseAssetMentions(prompt);
  const found: Asset[] = [];
  const missingNames: string[] = [];
  names.forEach((name) => {
    const asset = assets.find((item) => item.name === name || item.name.toLowerCase() === name.toLowerCase());
    if (asset && !found.some((item) => item.id === asset.id)) found.push(asset);
    else if (!asset) missingNames.push(name);
  });

  const referencedAssets = [...explicitAssets, ...found.filter((asset) => !explicitAssets.some((item) => item.id === asset.id))];
  return { finalPrompt: prompt, referencedAssets, missingNames };
}

export function buildStoryPrompt(shot: { title: string; camera: string; action: string; dialogueCN?: string; dialogueEN?: string; prompt: string }): string {
  return shot.prompt;
}
