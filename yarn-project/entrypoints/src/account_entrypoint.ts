import { Fr } from '@aztec/foundation/fields';
import { type FunctionAbi, FunctionSelector, encodeArguments } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { GasSettings } from '@aztec/stdlib/gas';
import { HashedValues, TxContext, TxExecutionRequest } from '@aztec/stdlib/tx';

import { DEFAULT_CHAIN_ID, DEFAULT_VERSION } from './constants.js';
import { EncodedAppEntrypointCalls } from './encoding.js';
import type { AuthWitnessProvider, EntrypointInterface } from './interfaces.js';
import { ExecutionPayload } from './payload.js';

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
    private chainId: number = DEFAULT_CHAIN_ID,
    private version: number = DEFAULT_VERSION,
  ) {}

  async createTxExecutionRequest(
    exec: ExecutionPayload,
    gasSettings: GasSettings,
    options: DefaultAccountEntrypointOptions,
  ): Promise<TxExecutionRequest> {
    // Initial request with calls, authWitnesses and capsules
    const { calls, authWitnesses, capsules, extraHashedArgs } = exec;
    // Global tx options
    const { cancellable, txNonce, feePaymentMethodOptions } = options;
    // Encode the calls for the app
    const encodedCalls = await EncodedAppEntrypointCalls.create(calls, txNonce);

    // Obtain the entrypoint hashed args, built from the app encoded calls and global options
    const abi = this.getEntrypointAbi();
    const entrypointHashedArgs = await HashedValues.fromArgs(
      encodeArguments(abi, [encodedCalls, feePaymentMethodOptions, !!cancellable]),
    );

    // Generate the payload auth witness, by signing the hash of the payload
    const appPayloadAuthwitness = await this.auth.createAuthWit(await encodedCalls.hash());

    // Assemble the tx request
    const txRequest = TxExecutionRequest.from({
      firstCallArgsHash: entrypointHashedArgs.hash,
      origin: this.address,
      functionSelector: await FunctionSelector.fromNameAndParameters(abi.name, abi.parameters),
      txContext: new TxContext(this.chainId, this.version, gasSettings),
      argsOfCalls: [...encodedCalls.hashedArguments, entrypointHashedArgs, ...extraHashedArgs],
      authWitnesses: [...authWitnesses, appPayloadAuthwitness],
      capsules,
      salt: Fr.random(),
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
