import {
  type EntrypointInterface,
  type ExecutionRequestInit,
  type FeeOptions,
  type UserExecutionRequest,
} from '@aztec/entrypoints/interfaces';
import { EntrypointPayload } from '@aztec/entrypoints/payload';
import { mergeEncodedExecutionPayloads } from '@aztec/entrypoints/utils';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { type FunctionAbi, FunctionSelector, encodeArguments } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { HashedValues, TxContext, TxExecutionRequest } from '@aztec/stdlib/tx';

/**
 * Implementation for an entrypoint interface that can execute multiple function calls in a single transaction
 */
export class DefaultMultiCallEntrypoint implements EntrypointInterface {
  constructor(
    private chainId: number,
    private version: number,
    private address: AztecAddress = ProtocolContractAddress.MultiCallEntrypoint,
  ) {}

  async createTxExecutionRequest(exec: UserExecutionRequest, fee: FeeOptions): Promise<TxExecutionRequest> {
    const { calls, authWitnesses: userAuthWitnesses = [], capsules: userCapsules = [] } = exec;
    const payload = await EntrypointPayload.fromAppExecution(calls);
    const abi = this.getEntrypointAbi();
    const entrypointHashedArgs = await HashedValues.fromValues(encodeArguments(abi, [payload]));

    const executionPayload = mergeEncodedExecutionPayloads([payload], {
      extraHashedArgs: [entrypointHashedArgs],
      extraAuthWitnesses: userAuthWitnesses,
      extraCapsules: userCapsules,
    });

    const txRequest = TxExecutionRequest.from({
      firstCallArgsHash: entrypointHashedArgs.hash,
      origin: this.address,
      functionSelector: await FunctionSelector.fromNameAndParameters(abi.name, abi.parameters),
      txContext: new TxContext(this.chainId, this.version, fee.gasSettings),
      argsOfCalls: executionPayload.hashedArguments,
      authWitnesses: executionPayload.authWitnesses,
      capsules: executionPayload.capsules,
    });

    return Promise.resolve(txRequest);
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
      ],
      returnTypes: [],
      errorTypes: {},
    } as FunctionAbi;
  }
}
