import { type ApiHandler } from '@aztec/foundation/json-rpc/server';
import { createTracedJsonRpcServer } from '@aztec/telemetry-client';

import { BotRunnerApiSchema } from './interface.js';
import { type BotRunner } from './runner.js';

/**
 * Wraps a bot runner with a JSON RPC HTTP server.
 * @param botRunner - The BotRunner.
 * @returns An JSON-RPC HTTP server
 */
export function createBotRunnerRpcServer(botRunner: BotRunner) {
  createTracedJsonRpcServer(botRunner, BotRunnerApiSchema, {
    http200OnError: false,
    healthCheck: botRunner.isHealthy.bind(botRunner),
  });
}

export function getBotRunnerApiHandler(botRunner: BotRunner): ApiHandler {
  return [botRunner, BotRunnerApiSchema, botRunner.isHealthy.bind(botRunner)];
}
