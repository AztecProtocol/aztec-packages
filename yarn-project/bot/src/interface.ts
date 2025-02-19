import { type ApiSchemaFor } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { type BotConfig, BotConfigSchema } from './config.js';

export interface BotRunnerApi {
  start(): Promise<void>;
  stop(): Promise<void>;
  run(): Promise<void>;
  setup(): Promise<void>;
  getConfig(): Promise<BotConfig>;
  update(config: BotConfig): Promise<void>;
}

export const BotRunnerApiSchema: ApiSchemaFor<BotRunnerApi> = {
  start: z.function().args().returns(z.void()),
  stop: z.function().args().returns(z.void()),
  run: z.function().args().returns(z.void()),
  setup: z.function().args().returns(z.void()),
  getConfig: z.function().args().returns(BotConfigSchema),
  update: z.function().args(BotConfigSchema).returns(z.void()),
};
