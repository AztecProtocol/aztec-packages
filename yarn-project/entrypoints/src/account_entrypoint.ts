import { Fr } from '@aztec/foundation/curves/bn254';
import { type FunctionAbi, FunctionCall, FunctionSelector, encodeArguments } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { GasSettings } from '@aztec/stdlib/gas';
import { ExecutionPayload, HashedValues, TxContext, TxExecutionRequest } from '@aztec/stdlib/tx';

import { EncodedAppEntrypointCalls } from './encoding.js';
import type { AuthWitnessProvider, ChainInfo, EntrypointInterface } from './interfaces.js';

/**
 * The mechanism via which an account contract will pay for a transaction in which it gets invoked.
 */
export enum AccountFeePaymentMethodOptions {
  /**
   * Signals that some other contract is in charge of paying the fee, nothing needs to be done.
   */
  EXTERNAL = 0,
  /**
   * Used to make the account contract publicly pay for the transaction with its own fee juice balance,
   * **which it must already have prior to this transaction**.
   *
   * The contract will set itself as the fee payer and end the setup phase.
   */
  PREEXISTING_FEE_JUICE = 1,
  /**
   * Used to make the account contract publicly pay for the transaction with its own fee juice balance
   * **which is being claimed in the same transaction**.
   *
   * The contract will set itself as the fee payer but not end setup phase - this is done by the Fee Juice
   * contract after enqueuing a public call, which unlike most public calls is whitelisted by the nodes
   * to be executable during the setup phase.
   */
  FEE_JUICE_WITH_CLAIM = 2,
}

/**
 * General options for the tx execution.
 */
export type DefaultAccountEntrypointOptions = {
  /** Whether the transaction can be cancelled. */
  cancellable?: boolean;
  /**
   * A nonce to inject into the app payload of the transaction. When used with cancellable=true, this nonce will be
   * used to compute a nullifier that allows cancelling this transaction by submitting a new one with the same nonce
   * but higher fee. The nullifier ensures only one transaction can succeed.
   */
  txNonce?: Fr;
  /** Options that configure how the account contract behaves depending on the fee payment method of the tx */
  feePaymentMethodOptions: AccountFeePaymentMethodOptions;
};

/**
 * Implementation for an entrypoint interface that follows the default entrypoint signature
 * for an account, which accepts an AppPayload and a FeePayload as defined in noir-libs/aztec-noir/src/entrypoint module
 */
export class DefaultAccountEntrypoint implements EntrypointInterface {
  constructor(
    private address: AztecAddress,
    private auth: AuthWitnessProvider,
  ) {}

  async createTxExecutionRequest(
    exec: ExecutionPayload,
    gasSettings: GasSettings,
    chainInfo: ChainInfo,
    options: DefaultAccountEntrypointOptions,
  ): Promise<TxExecutionRequest> {
    const { authWitnesses, capsules, extraHashedArgs } = exec;
    const callData = await this.#buildEntrypointCallData(exec, options);
    const entrypointHashedArgs = await HashedValues.fromArgs(callData.encodedArgs);
    const txRequest = TxExecutionRequest.from({
      firstCallArgsHash: entrypointHashedArgs.hash,
      origin: this.address,
      functionSelector: callData.functionSelector,
      txContext: new TxContext(chainInfo.chainId.toNumber(), chainInfo.version.toNumber(), gasSettings),
      argsOfCalls: [...callData.encodedCalls.hashedArguments, entrypointHashedArgs, ...extraHashedArgs],
      authWitnesses: [...authWitnesses, callData.payloadAuthWitness],
      capsules,
      salt: Fr.random(),
    });

    return txRequest;
  }

  async wrapExecutionPayload(
    exec: ExecutionPayload,
    options: DefaultAccountEntrypointOptions,
  ): Promise<ExecutionPayload> {
    const { authWitnesses, capsules, extraHashedArgs, feePayer } = exec;
    const callData = await this.#buildEntrypointCallData(exec, options);

    // Build the entrypoint function call
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
      [callData.payloadAuthWitness, ...authWitnesses],
      capsules,
      [...callData.encodedCalls.hashedArguments, ...extraHashedArgs],
      feePayer ?? this.address,
    );
  }

  /**
   * Builds the shared data needed for both creating a tx execution request and wrapping an execution payload.
   * This includes encoding calls, building entrypoint arguments, and creating the authwitness.
   * @param exec - The execution payload containing calls to encode
   * @param options - Account entrypoint options including tx nonce and fee payment method
   * @returns Encoded call data, ABI, function selector, and auth witness
   */
  async #buildEntrypointCallData(exec: ExecutionPayload, options: DefaultAccountEntrypointOptions) {
    const { calls } = exec;
    const { cancellable, txNonce, feePaymentMethodOptions } = options;

    const encodedCalls = await EncodedAppEntrypointCalls.create(calls, txNonce);

    const abi = this.getEntrypointAbi();
    const args = [encodedCalls, feePaymentMethodOptions, !!cancellable];
    const encodedArgs = encodeArguments(abi, args);

    const functionSelector = await FunctionSelector.fromNameAndParameters(abi.name, abi.parameters);

    const payloadAuthWitness = await this.auth.createAuthWit(await encodedCalls.hash());

    return {
      encodedCalls,
      abi,
      encodedArgs,
      functionSelector,
      payloadAuthWitness,
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
        { name: 'fee_payment_method', type: { kind: 'integer', sign: 'unsigned', width: 8 } },
        { name: 'cancellable', type: { kind: 'boolean' } },
      ],
      returnTypes: [],
      errorTypes: {},
    } as FunctionAbi;
  }
}
