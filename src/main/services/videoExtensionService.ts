import type { CreateTaskInput, GenerationTask } from '@shared/types';
import { GenerationQueue } from './generationQueue';

export class VideoExtensionService {
  constructor(private queue: GenerationQueue) {}

  extend(input: Omit<CreateTaskInput, 'mode'> & { sourceVideoId: string }): GenerationTask {
    return this.queue.create({ ...input, mode: 'video-extension' });
  }
}
