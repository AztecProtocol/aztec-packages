import type { ChainInfo } from '@aztec/entrypoints/interfaces';
import { Fr } from '@aztec/foundation/fields';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { type ABIParameterVisibility, type FunctionAbi, type FunctionCall, FunctionType } from '@aztec/stdlib/abi';
import { AuthWitness, computeInnerAuthWitHash, computeOuterAuthWitHash } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { computeVarArgsHash } from '@aztec/stdlib/hash';
import type { TxProfileResult } from '@aztec/stdlib/tx';

import { ContractFunctionInteraction } from '../contract/contract_function_interaction.js';
import type {
  ProfileInteractionOptions,
  SendInteractionOptions,
  SimulateInteractionOptions,
  SimulationReturn,
} from '../contract/interaction_options.js';
import type { SentTx } from '../contract/sent_tx.js';
import type { Wallet } from '../wallet/index.js';

/** Intent with an inner hash */
export type IntentInnerHash = {
  /** The consumer   */
  consumer: AztecAddress;
  /** The action to approve */
  innerHash: Buffer<ArrayBuffer> | Fr;
};

/** Intent with a call */
export type CallIntent = {
  /** The caller to approve  */
  caller: AztecAddress;
  /** The call to approve */
  call: FunctionCall;
};

/** Intent with a ContractFunctionInteraction */
export type ContractFunctionInteractionCallIntent = {
  /** The caller to approve  */
  caller: AztecAddress;
  /** The action to approve */
  action: ContractFunctionInteraction;
};

/** Identifies ContractFunctionInteractionCallIntents */
function isContractFunctionIntractionCallIntent(
  messageHashOrIntent: Fr | Buffer | IntentInnerHash | CallIntent | ContractFunctionInteractionCallIntent,
): messageHashOrIntent is ContractFunctionInteractionCallIntent {
  return (
    'caller' in messageHashOrIntent &&
    'action' in messageHashOrIntent &&
    messageHashOrIntent.action instanceof ContractFunctionInteraction
  );
}

/**
 * Compute an authentication witness message hash from an intent and metadata
 *
 * If using the `IntentInnerHash`, the consumer is the address that can "consume" the authwit, for token approvals it is the token contract itself.
 * The `innerHash` itself will be the message that a contract is allowed to execute.
 * At the point of "approval checking", the validating contract (account for private and registry for public) will be computing the message hash
 * (`H(consumer, chainid, version, inner_hash)`) where the all but the `inner_hash` is injected from the context (consumer = msg_sender),
 * and use it for the authentication check.
 * Therefore, any allowed `innerHash` will therefore also have information around where it can be spent (version, chainId) and who can spend it (consumer).
 *
 * If using the `CallIntent`, the caller is the address that is making the call, for a token approval from Alice to Bob, this would be Bob.
 * The action is then used along with the `caller` to compute the `innerHash` and the consumer.
 *
 *
 * @param intent - The intent to approve (consumer and innerHash or caller and action)
 *                 The consumer is the address that can "consume" the authwit, for token approvals it is the token contract itself.
 *                 The caller is the address that is making the call, for a token approval from Alice to Bob, this would be Bob.
 *                 The caller becomes part of the `inner_hash` and is dealt with entirely in application logic.
 * @param metadata - The metadata for the intent (chainId, version)
 * @returns The message hash for the action
 */
export const computeAuthWitMessageHash = async (
  intent: IntentInnerHash | CallIntent | ContractFunctionInteractionCallIntent,
  metadata: ChainInfo,
) => {
  const chainId = metadata.chainId;
  const version = metadata.version;

  if ('caller' in intent) {
    const call = isContractFunctionIntractionCallIntent(intent) ? await intent.action.getFunctionCall() : intent.call;
    return computeOuterAuthWitHash(
      call.to,
      chainId,
      version,
      await computeInnerAuthWitHashFromAction(intent.caller, call),
    );
  } else {
    const inner = Buffer.isBuffer(intent.innerHash) ? Fr.fromBuffer(intent.innerHash) : intent.innerHash;
    return computeOuterAuthWitHash(intent.consumer, chainId, version, inner);
  }
};

/**
 * Compute an authentication witness message hash from an intent and metadata. This is just
 * a wrapper around computeAuthwitMessageHash that allows receiving an already computed messageHash as input
 * @param messageHashOrIntent - The precomputed messageHash or intent to approve (consumer and innerHash or caller and call/action)
 * @param metadata - The metadata for the intent (chainId, version)
 * @returns The message hash for the intent
 */
export async function getMessageHashFromIntent(
  messageHashOrIntent: Fr | Buffer | IntentInnerHash | CallIntent | ContractFunctionInteractionCallIntent,
  chainInfo: ChainInfo,
) {
  let messageHash: Fr;
  const { chainId, version } = chainInfo;
  if (Buffer.isBuffer(messageHashOrIntent)) {
    messageHash = Fr.fromBuffer(messageHashOrIntent);
  } else if (messageHashOrIntent instanceof Fr) {
    messageHash = messageHashOrIntent;
  } else {
    messageHash = await computeAuthWitMessageHash(messageHashOrIntent, { chainId, version });
  }
  return messageHash;
}

/**
 * Computes the inner authwitness hash for either a function call or an action, for it to later be combined with the metadata
 * required for the outer hash and eventually the full AuthWitness.
 * @param caller - Who is going to be calling the function
 * @param action - The action to compute the inner hash from
 * @returns The inner hash for the action
 **/
export const computeInnerAuthWitHashFromAction = async (
  caller: AztecAddress,
  action: FunctionCall | ContractFunctionInteraction,
) => {
  const call = action instanceof ContractFunctionInteraction ? await action.getFunctionCall() : action;
  return computeInnerAuthWitHash([caller.toField(), call.selector.toField(), await computeVarArgsHash(call.args)]);
};

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
export async function lookupValidity(
  wallet: Wallet,
  onBehalfOf: AztecAddress,
  intent: IntentInnerHash | CallIntent | ContractFunctionInteractionCallIntent,
  witness: AuthWitness,
): Promise<{
  /** boolean flag indicating if the authwit is valid in private context */
  isValidInPrivate: boolean;
  /** boolean flag indicating if the authwit is valid in public context */
  isValidInPublic: boolean;
}> {
  let innerHash, consumer;
  if ('caller' in intent) {
    const call = isContractFunctionIntractionCallIntent(intent) ? await intent.action.getFunctionCall() : intent.call;
    innerHash = await computeInnerAuthWitHashFromAction(intent.caller, call);
    consumer = call.to;
  } else if (Buffer.isBuffer(intent.innerHash)) {
    innerHash = Fr.fromBuffer(intent.innerHash);
    consumer = intent.consumer;
  } else {
    ({ innerHash, consumer } = intent);
  }
  const chainInfo = await wallet.getChainInfo();
  const messageHash = await getMessageHashFromIntent(intent, chainInfo);
  const results = { isValidInPrivate: false, isValidInPublic: false };

  // Check private
  const lookupValidityAbi = {
    name: 'lookup_validity',
    isInitializer: false,
    functionType: FunctionType.UTILITY,
    isInternal: false,
    isStatic: false,
    parameters: [{ name: 'message_hash', type: { kind: 'field' }, visibility: 'private' as ABIParameterVisibility }],
    returnTypes: [{ kind: 'boolean' }],
    errorTypes: {},
  } as FunctionAbi;
  try {
    results.isValidInPrivate = (await new ContractFunctionInteraction(wallet, onBehalfOf, lookupValidityAbi, [
      consumer,
      innerHash,
    ]).simulate({ from: onBehalfOf, authWitnesses: [witness] })) as boolean;
    // TODO: Narrow down the error to make sure simulation failed due to an invalid authwit
    // eslint-disable-next-line no-empty
  } catch {}

  // check public
  const isConsumableAbi = {
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
  } as FunctionAbi;
  results.isValidInPublic = (await new ContractFunctionInteraction(
    wallet,
    ProtocolContractAddress.AuthRegistry,
    isConsumableAbi,
    [onBehalfOf, messageHash],
  ).simulate({ from: onBehalfOf })) as boolean;

  return results;
}

/**
 * Convenience class designed to wrap the very common interaction of setting a public authwit in the AuthRegistry contract
 */
export class SetPublicAuthwitContractInteraction extends ContractFunctionInteraction {
  private constructor(
    wallet: Wallet,
    private from: AztecAddress,
    messageHash: Fr,
    authorized: boolean,
  ) {
    super(wallet, ProtocolContractAddress.AuthRegistry, SetPublicAuthwitContractInteraction.getSetAuthorizedAbi(), [
      messageHash,
      authorized,
    ]);
  }

  static async create(
    wallet: Wallet,
    from: AztecAddress,
    messageHashOrIntent: Fr | Buffer | IntentInnerHash | CallIntent | ContractFunctionInteractionCallIntent,
    authorized: boolean,
  ) {
    const chainInfo = await wallet.getChainInfo();
    const messageHash = await getMessageHashFromIntent(messageHashOrIntent, chainInfo);
    return new SetPublicAuthwitContractInteraction(wallet, from, messageHash, authorized);
  }

  /**
   * Overrides the proveInternal method, adding the sender of the authwit (authorizer) as from
   * and preventing misuse
   * @param options - An optional object containing additional configuration for the transaction.
   * @returns The result of the transaction as returned by the contract function.
   */
  public override proveInternal(options: Omit<SendInteractionOptions, 'from'>) {
    return super.proveInternal({ ...options, from: this.from });
  }

  /**
   * Overrides the simulate method, adding the sender of the authwit (authorizer) as from
   * and preventing misuse
   * @param options - An optional object containing additional configuration for the transaction.
   * @returns The result of the transaction as returned by the contract function.
   */
  public override simulate<T extends SimulateInteractionOptions>(
    options: Omit<T, 'from'>,
  ): Promise<SimulationReturn<T['includeMetadata']>>;
  // eslint-disable-next-line jsdoc/require-jsdoc
  public override simulate(
    options: Omit<SimulateInteractionOptions, 'from'> = {},
  ): Promise<SimulationReturn<typeof options.includeMetadata>> {
    return super.simulate({ ...options, from: this.from });
  }

  /**
   * Overrides the profile method, adding the sender of the authwit (authorizer) as from
   * and preventing misuse
   * @param options - Same options as `simulate`, plus profiling method
   * @returns An object containing the function return value and profile result.
   */
  public override profile(
    options: Omit<ProfileInteractionOptions, 'from'> = { profileMode: 'gates' },
  ): Promise<TxProfileResult> {
    return super.profile({ ...options, from: this.from });
  }

  /**
   * Overrides the send method, adding the sender of the authwit (authorizer) as from
   * and preventing misuse
   * @param options - An optional object containing 'fee' options information
   * @returns A SentTx instance for tracking the transaction status and information.
   */
  public override send(options: Omit<SendInteractionOptions, 'from'> = {}): SentTx {
    return super.send({ ...options, from: this.from });
  }

  private static getSetAuthorizedAbi(): FunctionAbi {
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
}
