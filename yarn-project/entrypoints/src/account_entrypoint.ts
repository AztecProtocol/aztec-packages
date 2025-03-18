import { type FunctionAbi, FunctionSelector, encodeArguments } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { HashedValues, TxContext, TxExecutionRequest } from '@aztec/stdlib/tx';

import { DEFAULT_CHAIN_ID, DEFAULT_VERSION } from './constants.js';
import type { AuthWitnessProvider, EntrypointInterface, FeeOptions, TxExecutionOptions } from './interfaces.js';
import { EncodedExecutionPayloadForEntrypoint, ExecutionPayload, computeCombinedPayloadHash } from './payload.js';
import { mergeAndEncodeExecutionPayloads } from './utils.js';

/**
 * Implementation for an entrypoint interface that follows the default entrypoint signature
 * for an account, which accepts an AppPayload and a FeePayload as defined in noir-libs/aztec-noir/src/entrypoint module
 */
export class DefaultAccountEntrypoint implements EntrypointInterface {
  constructor(
    private address: AztecAddress,
    private auth: AuthWitnessProvider,
    private chainId: number = DEFAULT_CHAIN_ID,
    private version: number = DEFAULT_VERSION,
  ) {}

  async createTxExecutionRequest(
    exec: ExecutionPayload,
    fee: FeeOptions,
    options: TxExecutionOptions,
  ): Promise<TxExecutionRequest> {
    const { calls, authWitnesses: userAuthWitnesses = [], capsules: userCapsules = [] } = exec;
    const { cancellable, nonce } = options;
    const appPayload = await EncodedExecutionPayloadForEntrypoint.fromAppExecution(calls, nonce);
    const feePayload = await EncodedExecutionPayloadForEntrypoint.fromFeeOptions(this.address, fee);

    const abi = this.getEntrypointAbi();
    const entrypointHashedArgs = await HashedValues.fromValues(
      encodeArguments(abi, [appPayload, feePayload, !!cancellable]),
    );

    const combinedPayloadAuthWitness = await this.auth.createAuthWit(
      await computeCombinedPayloadHash(appPayload, feePayload),
    );

    const encodedExecutionPayload = await mergeAndEncodeExecutionPayloads([appPayload, feePayload], {
      extraHashedArgs: [entrypointHashedArgs],
      extraAuthWitnesses: [combinedPayloadAuthWitness, ...userAuthWitnesses],
      extraCapsules: userCapsules,
    });

    const txRequest = TxExecutionRequest.from({
      firstCallArgsHash: entrypointHashedArgs.hash,
      origin: this.address,
      functionSelector: await FunctionSelector.fromNameAndParameters(abi.name, abi.parameters),
      txContext: new TxContext(this.chainId, this.version, fee.gasSettings),
      argsOfCalls: encodedExecutionPayload.hashedArguments,
      authWitnesses: encodedExecutionPayload.authWitnesses,
      capsules: encodedExecutionPayload.capsules,
    });

    return txRequest;
  }

  private getEntrypointAbi() {
    return {
      name: 'entrypoint',
      isInitializer: false,
      functionType: 'private',
      isInternal: false,
      isStatic: false,
      parameters: [
        {
          name: 'app_payload',
          type: {
            kind: 'struct',
            path: 'authwit::entrypoint::app::AppPayload',
            fields: [
              {
                name: 'function_calls',
                type: {
                  kind: 'array',
                  length: 4,
                  type: {
                    kind: 'struct',
                    path: 'authwit::entrypoint::function_call::FunctionCall',
                    fields: [
                      { name: 'args_hash', type: { kind: 'field' } },
                      {
                        name: 'function_selector',
                        type: {
                          kind: 'struct',
                          path: 'authwit::aztec::protocol_types::abis::function_selector::FunctionSelector',
                          fields: [{ name: 'inner', type: { kind: 'integer', sign: 'unsigned', width: 32 } }],
                        },
                      },
                      {
                        name: 'target_address',
                        type: {
                          kind: 'struct',
                          path: 'authwit::aztec::protocol_types::address::AztecAddress',
                          fields: [{ name: 'inner', type: { kind: 'field' } }],
                        },
                      },
                      { name: 'is_public', type: { kind: 'boolean' } },
                      { name: 'is_static', type: { kind: 'boolean' } },
                    ],
                  },
                },
              },
              { name: 'nonce', type: { kind: 'field' } },
            ],
          },
          visibility: 'public',
        },
        {
          name: 'fee_payload',
          type: {
            kind: 'struct',
            path: 'authwit::entrypoint::fee::FeePayload',
            fields: [
              {
                name: 'function_calls',
                type: {
                  kind: 'array',
                  length: 2,
                  type: {
                    kind: 'struct',
                    path: 'authwit::entrypoint::function_call::FunctionCall',
                    fields: [
                      { name: 'args_hash', type: { kind: 'field' } },
                      {
                        name: 'function_selector',
                        type: {
                          kind: 'struct',
                          path: 'authwit::aztec::protocol_types::abis::function_selector::FunctionSelector',
                          fields: [{ name: 'inner', type: { kind: 'integer', sign: 'unsigned', width: 32 } }],
                        },
                      },
                      {
                        name: 'target_address',
                        type: {
                          kind: 'struct',
                          path: 'authwit::aztec::protocol_types::address::AztecAddress',
                          fields: [{ name: 'inner', type: { kind: 'field' } }],
                        },
                      },
                      { name: 'is_public', type: { kind: 'boolean' } },
                      { name: 'is_static', type: { kind: 'boolean' } },
                    ],
                  },
                },
              },
              { name: 'nonce', type: { kind: 'field' } },
              { name: 'is_fee_payer', type: { kind: 'boolean' } },
            ],
          },
          visibility: 'public',
        },
        { name: 'cancellable', type: { kind: 'boolean' } },
      ],
      returnTypes: [],
      errorTypes: {},
    } as FunctionAbi;
  }
}
