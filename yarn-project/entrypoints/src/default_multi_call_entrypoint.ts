import { Fr } from '@aztec/foundation/fields';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { type FunctionAbi, FunctionSelector, encodeArguments } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { HashedValues, TxContext, TxExecutionRequest } from '@aztec/stdlib/tx';

import { EncodedCallsForEntrypoint } from './encoding.js';
import type { EntrypointInterface, FeeOptions } from './interfaces.js';
import type { ExecutionPayload } from './payload.js';

/**
 * Implementation for an entrypoint interface that can execute multiple function calls in a single transaction
 */
export class DefaultMultiCallEntrypoint implements EntrypointInterface {
  constructor(
    private chainId: number,
    private version: number,
    private address: AztecAddress = ProtocolContractAddress.MultiCallEntrypoint,
  ) {}

  async createTxExecutionRequest(exec: ExecutionPayload, fee: FeeOptions): Promise<TxExecutionRequest> {
    // Initial request with calls, authWitnesses and capsules
    const { calls, authWitnesses, capsules, extraHashedArgs } = exec;

    // Get the execution payload for the fee, it includes the calls and potentially authWitnesses
    const {
      calls: feeCalls,
      authWitnesses: feeAuthwitnesses,
      extraHashedArgs: feeExtraHashedArgs,
    } = await fee.paymentMethod.getExecutionPayload(fee.gasSettings);

    // Encode the calls, including the fee calls
    // (since this entrypoint does not distinguish between app and fee calls)
    const encodedCalls = await EncodedCallsForEntrypoint.fromAppExecution(calls.concat(feeCalls));

    // Obtain the entrypoint hashed args, built from the encoded calls
    const abi = this.getEntrypointAbi();
    const entrypointHashedArgs = await HashedValues.fromArgs(encodeArguments(abi, [encodedCalls]));

    // Assemble the tx request
    const txRequest = TxExecutionRequest.from({
      firstCallArgsHash: entrypointHashedArgs.hash,
      origin: this.address,
      functionSelector: await FunctionSelector.fromNameAndParameters(abi.name, abi.parameters),
      txContext: new TxContext(this.chainId, this.version, fee.gasSettings),
      argsOfCalls: [...encodedCalls.hashedArguments, entrypointHashedArgs, ...extraHashedArgs, ...feeExtraHashedArgs],
      authWitnesses: [...feeAuthwitnesses, ...authWitnesses],
      capsules,
      salt: Fr.random(),
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
