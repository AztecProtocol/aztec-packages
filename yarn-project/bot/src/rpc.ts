import type { ApiHandler } from '@aztec/foundation/json-rpc/server';

import { BotRunnerApiSchema } from './interface.js';
import type { BotRunner } from './runner.js';

export function getBotRunnerApiHandler(botRunner: BotRunner): ApiHandler {
  return [botRunner, BotRunnerApiSchema, botRunner.isHealthy.bind(botRunner)];
}
