import { AztecAddress } from '@aztec/aztec.js';
import type { ApiSchemaFor } from '@aztec/stdlib/schemas';

import { z } from 'zod';

import { type BotConfig, BotConfigSchema } from './config.js';

export const BotInfoSchema = z.object({
  botAddress: AztecAddress.schema,
});

export type BotInfo = z.infer<typeof BotInfoSchema>;

export interface BotRunnerApi {
  start(): Promise<void>;
  stop(): Promise<void>;
  run(): Promise<void>;
  setup(): Promise<void>;
  getConfig(): Promise<BotConfig>;
  getInfo(): Promise<BotInfo>;
  update(config: BotConfig): Promise<void>;
}

export const BotRunnerApiSchema: ApiSchemaFor<BotRunnerApi> = {
  start: z.function().args().returns(z.void()),
  stop: z.function().args().returns(z.void()),
  run: z.function().args().returns(z.void()),
  setup: z.function().args().returns(z.void()),
  getInfo: z.function().args().returns(BotInfoSchema),
  getConfig: z.function().args().returns(BotConfigSchema),
  update: z.function().args(BotConfigSchema).returns(z.void()),
};
