import { Fr } from '@aztec/foundation/curves/bn254';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { type FunctionAbi, FunctionCall, FunctionSelector, encodeArguments } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { GasSettings } from '@aztec/stdlib/gas';
import { ExecutionPayload, HashedValues, TxContext, TxExecutionRequest } from '@aztec/stdlib/tx';

import { EncodedAppEntrypointCalls } from './encoding.js';
import type { ChainInfo, EntrypointInterface } from './interfaces.js';

/**
 * Implementation for an entrypoint interface that can execute multiple function calls in a single transaction
 */
export class DefaultMultiCallEntrypoint implements EntrypointInterface {
  constructor(private address: AztecAddress = ProtocolContractAddress.MultiCallEntrypoint) {}

  async createTxExecutionRequest(
    exec: ExecutionPayload,
    gasSettings: GasSettings,
    chainInfo: ChainInfo,
  ): Promise<TxExecutionRequest> {
    const { authWitnesses, capsules, extraHashedArgs } = exec;
    const callData = await this.#buildEntrypointCallData(exec);

    const entrypointHashedArgs = await HashedValues.fromArgs(callData.encodedArgs);
    const txRequest = TxExecutionRequest.from({
      firstCallArgsHash: entrypointHashedArgs.hash,
      origin: this.address,
      functionSelector: callData.functionSelector,
      txContext: new TxContext(chainInfo.chainId.toNumber(), chainInfo.version.toNumber(), gasSettings),
      argsOfCalls: [...callData.encodedCalls.hashedArguments, entrypointHashedArgs, ...extraHashedArgs],
      authWitnesses,
      capsules,
      salt: Fr.random(),
    });

    return Promise.resolve(txRequest);
  }

  async wrapExecutionPayload(exec: ExecutionPayload, _options?: any): Promise<ExecutionPayload> {
    const { authWitnesses, capsules, extraHashedArgs } = exec;
    const callData = await this.#buildEntrypointCallData(exec);
    const entrypointCall = FunctionCall.from({
      name: callData.abi.name,
      to: this.address,
      selector: callData.functionSelector,
      type: callData.abi.functionType,
      hideMsgSender: false,
      isStatic: callData.abi.isStatic,
      args: callData.encodedArgs,
      returnTypes: callData.abi.returnTypes,
    });

    return new ExecutionPayload(
      [entrypointCall],
      authWitnesses,
      capsules,
      [...callData.encodedCalls.hashedArguments, ...extraHashedArgs],
      exec.feePayer,
    );
  }

  /**
   * Builds the shared data needed for both creating a tx execution request and wrapping an execution payload.
   * This includes encoding calls and building entrypoint arguments.
   * @param exec - The execution payload containing calls to encode
   * @returns Encoded call data, ABI, encoded arguments, and function selector
   */
  async #buildEntrypointCallData(exec: ExecutionPayload) {
    const { calls } = exec;

    const encodedCalls = await EncodedAppEntrypointCalls.create(calls);

    const abi = this.getEntrypointAbi();
    const encodedArgs = encodeArguments(abi, [encodedCalls]);

    const functionSelector = await FunctionSelector.fromNameAndParameters(abi.name, abi.parameters);

    return {
      encodedCalls,
      abi,
      encodedArgs,
      functionSelector,
    };
  }

  private getEntrypointAbi() {
    return {
      name: 'entrypoint',
      isInitializer: false,
      functionType: 'private',
      isOnlySelf: false,
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
                  length: 5,
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
                      { name: 'hide_msg_sender', type: { kind: 'boolean' } },
                      { name: 'is_static', type: { kind: 'boolean' } },
                    ],
                  },
                },
              },
              { name: 'tx_nonce', type: { kind: 'field' } },
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
