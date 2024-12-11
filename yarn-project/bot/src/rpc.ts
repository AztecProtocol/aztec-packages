import { type ApiHandler, createSafeJsonRpcServer } from '@aztec/foundation/json-rpc/server';

import { BotRunnerApiSchema } from './interface.js';
import { type BotRunner } from './runner.js';

/**
 * Wraps a bot runner with a JSON RPC HTTP server.
 * @param botRunner - The BotRunner.
 * @returns An JSON-RPC HTTP server
 */
export function createBotRunnerRpcServer(botRunner: BotRunner) {
  createSafeJsonRpcServer(botRunner, BotRunnerApiSchema, botRunner.isHealthy.bind(botRunner));
}

export function getBotRunnerApiHandler(botRunner: BotRunner): ApiHandler {
  return [botRunner, BotRunnerApiSchema, botRunner.isHealthy.bind(botRunner)];
}
