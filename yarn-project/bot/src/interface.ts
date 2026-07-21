import { AztecAddress } from '@aztec/aztec.js/addresses';
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
  start: z.function({ input: z.tuple([]), output: z.void() }),
  stop: z.function({ input: z.tuple([]), output: z.void() }),
  run: z.function({ input: z.tuple([]), output: z.void() }),
  setup: z.function({ input: z.tuple([]), output: z.void() }),
  getInfo: z.function({ input: z.tuple([]), output: BotInfoSchema }),
  getConfig: z.function({ input: z.tuple([]), output: BotConfigSchema }),
  update: z.function({ input: z.tuple([BotConfigSchema]), output: z.void() }),
};
