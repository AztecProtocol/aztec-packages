import type { FeeOptions, TxExecutionOptions } from '@aztec/entrypoints/interfaces';
import type { ExecutionPayload } from '@aztec/entrypoints/payload';
import { Fr } from '@aztec/foundation/fields';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { ABIParameterVisibility, type FunctionAbi, FunctionType } from '@aztec/stdlib/abi';
import { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { TxExecutionRequest } from '@aztec/stdlib/tx';

import { ContractFunctionInteraction } from '../contract/contract_function_interaction.js';
import {
  type IntentAction,
  type IntentInnerHash,
  computeAuthWitMessageHash,
  computeInnerAuthWitHashFromAction,
} from '../utils/authwit.js';
import type { Wallet } from '../wallet/wallet.js';
import type { AccountInterface } from './interface.js';

/**
 * An authwit provider that can create both private and public authwits
 * with an intent as input, as opposed to just a precomputed inner hash
 */
interface AuthwitnessIntentProvider {
  /**
   * Creates a private authwit from an intent or inner hash, to be provided
   * during function execution
   * @param intent - The action (or inner hash) to authorize
   */
  createAuthWit(intent: IntentInnerHash | IntentAction | Buffer | Fr): Promise<AuthWitness>;
  /**
   * Sets a public authwit for an intent or inner hash
   * @param wallet - The wallet to send the transaction authorizing the action from
   * @param messageHashOrIntent - The action (or inner hash) to authorize/deny
   * @param authorized - Whether to authorize or deny the action
   */
  setPublicAuthWit(
    wallet: Wallet,
    messageHashOrIntent: Fr | Buffer | IntentInnerHash | IntentAction,
    authorized: boolean,
  ): Promise<ContractFunctionInteraction>;
}

/**
 * A type defining an account, capable of both creating authwits and using them
 * to authenticate transaction execution requests.
 */
export type Account = AccountInterface & AuthwitnessIntentProvider;

/**
 * An account implementation that uses authwits as an authentication mechanism
 * and can assemble transaction execution requests for an entrypoint.
 */
export class BaseAccount implements Account {
  constructor(protected account: AccountInterface) {}

  createTxExecutionRequest(
    exec: ExecutionPayload,
    fee: FeeOptions,
    options: TxExecutionOptions,
  ): Promise<TxExecutionRequest> {
    return this.account.createTxExecutionRequest(exec, fee, options);
  }

  getChainId(): Fr {
    return this.account.getChainId();
  }

  getVersion(): Fr {
    return this.account.getVersion();
  }

  /** Returns the complete address of the account that implements this wallet. */
  public getCompleteAddress() {
    return this.account.getCompleteAddress();
  }

  /** Returns the address of the account that implements this wallet. */
  public getAddress() {
    return this.getCompleteAddress().address;
  }

  /**
   * Computes an authentication witness from either a message hash or an intent.
   *
   * If a message hash is provided, it will create a witness for the hash directly.
   * Otherwise, it will compute the message hash using the intent, along with the
   * chain id and the version values provided by the wallet.
   *
   * @param messageHashOrIntent - The message hash of the intent to approve
   * @returns The authentication witness
   */
  async createAuthWit(messageHashOrIntent: Fr | Buffer | IntentAction | IntentInnerHash): Promise<AuthWitness> {
    let messageHash: Fr;
    if (Buffer.isBuffer(messageHashOrIntent)) {
      messageHash = Fr.fromBuffer(messageHashOrIntent);
    } else if (messageHashOrIntent instanceof Fr) {
      messageHash = messageHashOrIntent;
    } else {
      messageHash = await this.getMessageHash(messageHashOrIntent);
    }

    return this.account.createAuthWit(messageHash);
  }

  /**
   * Returns a function interaction to set a message hash as authorized or revoked in this account.
   *
   * Public calls can then consume this authorization.
   *
   * @param wallet - The wallet to send the transaction authorizing the action from
   * @param messageHashOrIntent - The message hash or intent to authorize/revoke
   * @param authorized - True to authorize, false to revoke authorization.
   * @returns - A function interaction.
   */
  public async setPublicAuthWit(
    wallet: Wallet,
    messageHashOrIntent: Fr | Buffer | IntentInnerHash | IntentAction,
    authorized: boolean,
  ): Promise<ContractFunctionInteraction> {
    let messageHash: Fr;
    if (Buffer.isBuffer(messageHashOrIntent)) {
      messageHash = Fr.fromBuffer(messageHashOrIntent);
    } else if (messageHashOrIntent instanceof Fr) {
      messageHash = messageHashOrIntent;
    } else {
      messageHash = await this.getMessageHash(messageHashOrIntent);
    }

    return new ContractFunctionInteraction(wallet, ProtocolContractAddress.AuthRegistry, this.getSetAuthorizedAbi(), [
      messageHash,
      authorized,
    ]);
  }

  private async getInnerHashAndConsumer(intent: IntentInnerHash | IntentAction): Promise<{
    /** The inner hash */
    innerHash: Fr;
    /** The consumer of the authwit */
    consumer: AztecAddress;
  }> {
    if ('caller' in intent && 'action' in intent) {
      const action =
        intent.action instanceof ContractFunctionInteraction ? (await intent.action.request()).calls[0] : intent.action;
      return {
        innerHash: await computeInnerAuthWitHashFromAction(intent.caller, action),
        consumer: action.to,
      };
    } else if (Buffer.isBuffer(intent.innerHash)) {
      return { innerHash: Fr.fromBuffer(intent.innerHash), consumer: intent.consumer };
    }
    return { innerHash: intent.innerHash, consumer: intent.consumer };
  }

  /**
   * Returns the message hash for the given intent
   *
   * @param intent - A tuple of (consumer and inner hash) or (caller and action)
   * @returns The message hash
   */
  private getMessageHash(intent: IntentInnerHash | IntentAction): Promise<Fr> {
    const chainId = this.getChainId();
    const version = this.getVersion();
    return computeAuthWitMessageHash(intent, { chainId, version });
  }

  /**
   * Lookup the validity of an authwit in private and public contexts.
   *
   * Uses the chain id and version of the wallet.
   *
   * @param wallet - The wallet use to simulate and read the public data
   * @param onBehalfOf - The address of the "approver"
   * @param intent - The consumer and inner hash or the caller and action to lookup
   * @param witness - The computed authentication witness to check
   * @returns - A struct containing the validity of the authwit in private and public contexts.
   */
  async lookupValidity(
    wallet: Wallet,
    onBehalfOf: AztecAddress,
    intent: IntentInnerHash | IntentAction,
    witness: AuthWitness,
  ): Promise<{
    /** boolean flag indicating if the authwit is valid in private context */
    isValidInPrivate: boolean;
    /** boolean flag indicating if the authwit is valid in public context */
    isValidInPublic: boolean;
  }> {
    const { innerHash, consumer } = await this.getInnerHashAndConsumer(intent);

    const messageHash = await this.getMessageHash(intent);
    const results = { isValidInPrivate: false, isValidInPublic: false };

    // Check private
    try {
      results.isValidInPrivate = (await new ContractFunctionInteraction(
        wallet,
        onBehalfOf,
        this.getLookupValidityAbi(),
        [consumer, innerHash],
      ).simulate({ from: this.getAddress(), authWitnesses: [witness] })) as boolean;
      // TODO: Narrow down the error to make sure simulation failed due to an invalid authwit
      // eslint-disable-next-line no-empty
    } catch {}

    // check public
    results.isValidInPublic = (await new ContractFunctionInteraction(
      wallet,
      ProtocolContractAddress.AuthRegistry,
      this.getIsConsumableAbi(),
      [onBehalfOf, messageHash],
    ).simulate({ from: this.getAddress() })) as boolean;

    return results;
  }

  private getSetAuthorizedAbi(): FunctionAbi {
    return {
      name: 'set_authorized',
      isInitializer: false,
      functionType: FunctionType.PUBLIC,
      isInternal: true,
      isStatic: false,
      parameters: [
        {
          name: 'message_hash',
          type: { kind: 'field' },
          visibility: 'private' as ABIParameterVisibility,
        },
        {
          name: 'authorize',
          type: { kind: 'boolean' },
          visibility: 'private' as ABIParameterVisibility,
        },
      ],
      returnTypes: [],
      errorTypes: {},
    };
  }

  private getLookupValidityAbi(): FunctionAbi {
    return {
      name: 'lookup_validity',
      isInitializer: false,
      functionType: FunctionType.UTILITY,
      isInternal: false,
      isStatic: false,
      parameters: [{ name: 'message_hash', type: { kind: 'field' }, visibility: 'private' as ABIParameterVisibility }],
      returnTypes: [{ kind: 'boolean' }],
      errorTypes: {},
    };
  }

  private getIsConsumableAbi(): FunctionAbi {
    return {
      name: 'utility_is_consumable',
      isInitializer: false,
      functionType: FunctionType.UTILITY,
      isInternal: false,
      isStatic: false,
      parameters: [
        {
          name: 'address',
          type: {
            fields: [{ name: 'inner', type: { kind: 'field' } }],
            kind: 'struct',
            path: 'authwit::aztec::protocol_types::address::aztec_address::AztecAddress',
          },
          visibility: 'private' as ABIParameterVisibility,
        },
        { name: 'message_hash', type: { kind: 'field' }, visibility: 'private' as ABIParameterVisibility },
      ],
      returnTypes: [{ kind: 'boolean' }],
      errorTypes: {},
    };
  }
}
