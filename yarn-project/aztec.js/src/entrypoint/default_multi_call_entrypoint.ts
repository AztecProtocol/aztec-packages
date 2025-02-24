import { HashedValues, TxExecutionRequest } from '@aztec/circuit-types';
import { type FunctionAbi, FunctionSelector, encodeArguments } from '@aztec/circuits.js/abi';
import { type AztecAddress } from '@aztec/circuits.js/aztec-address';
import { TxContext } from '@aztec/circuits.js/tx';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';

import { type EntrypointInterface, EntrypointPayload, type ExecutionRequestInit } from './entrypoint.js';

/**
 * Implementation for an entrypoint interface that can execute multiple function calls in a single transaction
 */
export class DefaultMultiCallEntrypoint implements EntrypointInterface {
  constructor(
    private chainId: number,
    private version: number,
    private address: AztecAddress = ProtocolContractAddress.MultiCallEntrypoint,
  ) {}

  async createTxExecutionRequest(executions: ExecutionRequestInit): Promise<TxExecutionRequest> {
    const { fee, calls, authWitnesses = [], hashedArguments = [], capsules = [] } = executions;
    const payload = await EntrypointPayload.fromAppExecution(calls);
    const abi = this.getEntrypointAbi();
    const entrypointHashedArgs = await HashedValues.fromValues(encodeArguments(abi, [payload]));

    const txRequest = TxExecutionRequest.from({
      firstCallArgsHash: entrypointHashedArgs.hash,
      origin: this.address,
      functionSelector: await FunctionSelector.fromNameAndParameters(abi.name, abi.parameters),
      txContext: new TxContext(this.chainId, this.version, fee.gasSettings),
      argsOfCalls: [...payload.hashedArguments, ...hashedArguments, entrypointHashedArgs],
      authWitnesses,
      capsules,
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
