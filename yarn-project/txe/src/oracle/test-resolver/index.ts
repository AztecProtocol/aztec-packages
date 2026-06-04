/* eslint-disable camelcase */
import { createSafeJsonRpcServer } from '@aztec/foundation/json-rpc/server';
import type { Logger } from '@aztec/foundation/log';
import type { ApiSchemaFor } from '@aztec/foundation/schemas';
import { zodFor } from '@aztec/stdlib/schemas';

import { z } from 'zod';

import { ForeignCallArgsSchema, type ForeignCallResult, ForeignCallResultSchema } from '../../utils/encoding.js';
import { TXE_ORACLE_REGISTRY } from '../txe_oracle_registry.js';
import { ORACLE_TEST_FIXTURES } from './fixtures.js';
import { type OracleTestCallInput, OracleTestResolver } from './resolver.js';

const OracleTestCallInputSchema = zodFor<OracleTestCallInput>()(
  z.object({
    session_id: z.number().nonnegative(),
    function: z.string(),
    root_path: z.string(),
    package_name: z.string(),
    inputs: ForeignCallArgsSchema,
  }),
);

/** Narrowed interface exposing only the RPC method. */
interface OracleTestRpcHandler {
  resolve_foreign_call(callData: OracleTestCallInput): Promise<ForeignCallResult>;
}

const OracleTestRpcHandlerSchema: ApiSchemaFor<OracleTestRpcHandler> = {
  resolve_foreign_call: z.function({
    input: z.tuple([OracleTestCallInputSchema]),
    output: ForeignCallResultSchema,
  }),
};

/** Creates an RPC server backed by the oracle test resolver. */
export function createOracleTestRpcServer(logger: Logger) {
  const resolver = new OracleTestResolver(TXE_ORACLE_REGISTRY, ORACLE_TEST_FIXTURES, logger);
  const server = createSafeJsonRpcServer<OracleTestRpcHandler>(resolver, OracleTestRpcHandlerSchema, {
    http200OnError: true,
  });
  return { server, resolver };
}

export { OracleTestResolver } from './resolver.js';
