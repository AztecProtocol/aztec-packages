import { FeePaymentInfo, createDebugLogger } from '@aztec/aztec.js';
import { AuthWitnessProvider, EntrypointInterface } from '@aztec/aztec.js/account';
import { FunctionCall, PackedArguments, TxExecutionRequest } from '@aztec/circuit-types';
import { AztecAddress, FeeLimits, Fr, FunctionData, TxContext } from '@aztec/circuits.js';
import { FunctionAbi, encodeArguments } from '@aztec/foundation/abi';

import { DEFAULT_CHAIN_ID, DEFAULT_VERSION } from './constants.js';
import { buildAppPayload, hashPayload } from './entrypoint_payload.js';
import { buildFeeDistributionPayload, buildFeePrepPayload, hashFeePayload } from './fee_payload.js';

/**
 * Implementation for an entrypoint interface that follows the default entrypoint signature
 * for an account, which accepts an EntrypointPayload as defined in noir-libs/aztec-noir/src/entrypoint.nr.
 */
export class DefaultAccountEntrypoint implements EntrypointInterface {
  private logger = createDebugLogger('aztec:account:entrypoint');
  constructor(
    private address: AztecAddress,
    private auth: AuthWitnessProvider,
    private chainId: number = DEFAULT_CHAIN_ID,
    private version: number = DEFAULT_VERSION,
  ) {}

  async createTxExecutionRequest(
    executions: FunctionCall[],
    feePaymentInfo: FeePaymentInfo = FeePaymentInfo.empty(),
  ): Promise<TxExecutionRequest> {
    const { payload: appPayload, packedArguments: callsPackedArguments } = buildAppPayload(executions);
    const { payload: feePrepPayload, packedArguments: feePrepPackedArguments } = buildFeePrepPayload(
      this.address,
      feePaymentInfo,
    );
    const { payload: feeDistributionPayload, packedArguments: feeDistributionPackedArguments } =
      buildFeeDistributionPayload(this.address, feePaymentInfo);

    const abi = this.getEntrypointAbi();
    const packedArgs = PackedArguments.fromArgs(
      encodeArguments(abi, [appPayload, feePrepPayload, feeDistributionPayload]),
    );

    const appMessage = Fr.fromBuffer(hashPayload(appPayload));
    const appAuthWitness = await this.auth.createAuthWitness(appMessage);

    const feePrepMessage = Fr.fromBuffer(hashFeePayload(feePrepPayload));
    const feePrepAuthWitness = await this.auth.createAuthWitness(feePrepMessage);

    const feeDistributionMessage = Fr.fromBuffer(hashFeePayload(feeDistributionPayload));
    const feeDistributionAuthWitness = await this.auth.createAuthWitness(feeDistributionMessage);

    const feeLimits = new FeeLimits(Fr.random(), Fr.random());

    const txRequest = TxExecutionRequest.from({
      argsHash: packedArgs.hash,
      origin: this.address,
      functionData: FunctionData.fromAbi(abi),
      txContext: TxContext.empty(this.chainId, this.version, feeLimits),
      packedArguments: [
        ...callsPackedArguments,
        ...feePrepPackedArguments,
        ...feeDistributionPackedArguments,
        packedArgs,
      ],
      authWitnesses: [appAuthWitness, feePrepAuthWitness, feeDistributionAuthWitness],
    });
    return txRequest;
  }

  private getEntrypointAbi() {
    return {
      name: 'entrypoint',
      functionType: 'secret',
      isInternal: false,
      parameters: [
        {
          name: 'payload',
          type: {
            kind: 'struct',
            path: 'authwit::entrypoint::EntrypointPayload',
            fields: [
              {
                name: 'function_calls',
                type: {
                  kind: 'array',
                  length: 4,
                  type: {
                    kind: 'struct',
                    path: 'authwit::function_call::FunctionCall',
                    fields: [
                      { name: 'args_hash', type: { kind: 'field' } },
                      {
                        name: 'function_selector',
                        type: {
                          kind: 'struct',
                          path: 'address_note::aztec::protocol_types::abis::function_selector::FunctionSelector',
                          fields: [{ name: 'inner', type: { kind: 'integer', sign: 'unsigned', width: 32 } }],
                        },
                      },
                      {
                        name: 'target_address',
                        type: {
                          kind: 'struct',
                          path: 'address_note::aztec::protocol_types::address::AztecAddress',
                          fields: [{ name: 'inner', type: { kind: 'field' } }],
                        },
                      },
                      { name: 'is_public', type: { kind: 'boolean' } },
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
          name: 'fee_prep',
          type: {
            kind: 'struct',
            path: 'authwit::fee::FeePayload',
            fields: [
              {
                name: 'function_calls',
                type: {
                  kind: 'array',
                  length: 1,
                  type: {
                    kind: 'struct',
                    path: 'authwit::function_call::FunctionCall',
                    fields: [
                      { name: 'args_hash', type: { kind: 'field' } },
                      {
                        name: 'function_selector',
                        type: {
                          kind: 'struct',
                          path: 'address_note::aztec::protocol_types::abis::function_selector::FunctionSelector',
                          fields: [{ name: 'inner', type: { kind: 'integer', sign: 'unsigned', width: 32 } }],
                        },
                      },
                      {
                        name: 'target_address',
                        type: {
                          kind: 'struct',
                          path: 'address_note::aztec::protocol_types::address::AztecAddress',
                          fields: [{ name: 'inner', type: { kind: 'field' } }],
                        },
                      },
                      { name: 'is_public', type: { kind: 'boolean' } },
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
          name: 'fee_distribution',
          type: {
            kind: 'struct',
            path: 'authwit::fee::FeePayload',
            fields: [
              {
                name: 'function_calls',
                type: {
                  kind: 'array',
                  length: 1,
                  type: {
                    kind: 'struct',
                    path: 'authwit::function_call::FunctionCall',
                    fields: [
                      { name: 'args_hash', type: { kind: 'field' } },
                      {
                        name: 'function_selector',
                        type: {
                          kind: 'struct',
                          path: 'address_note::aztec::protocol_types::abis::function_selector::FunctionSelector',
                          fields: [{ name: 'inner', type: { kind: 'integer', sign: 'unsigned', width: 32 } }],
                        },
                      },
                      {
                        name: 'target_address',
                        type: {
                          kind: 'struct',
                          path: 'address_note::aztec::protocol_types::address::AztecAddress',
                          fields: [{ name: 'inner', type: { kind: 'field' } }],
                        },
                      },
                      { name: 'is_public', type: { kind: 'boolean' } },
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
    } as FunctionAbi;
  }
}
