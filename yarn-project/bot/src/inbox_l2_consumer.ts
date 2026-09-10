import { NO_WAIT } from '@aztec/aztec.js/contracts';
import type { TxHash } from '@aztec/aztec.js/tx';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { TestContract } from '@aztec/noir-test-contracts.js/Test';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  TX_ERROR_EXISTING_NULLIFIER,
  TX_ERROR_INSUFFICIENT_FEE_PAYER_BALANCE,
  TX_ERROR_INSUFFICIENT_FEE_PER_GAS,
  TX_ERROR_INSUFFICIENT_GAS_LIMIT,
} from '@aztec/stdlib/tx';
import type { EmbeddedWallet } from '@aztec/wallets/embedded';

import type { BotConfig } from './config.js';
import type { InboxBotMode } from './inbox_bot_metrics.js';
import { getSendInteractionOptions } from './utils.js';

/** Everything needed to build a consumption call for one L1→L2 message. */
export interface InboxConsumptionRequest {
  /** L2 domain to consume through. */
  mode: InboxBotMode;
  content: Fr;
  secret: Fr;
  /** L1 address the Inbox recorded as the sender, which for a batched send is the Multicall3 contract. */
  sender: EthAddress;
  /** Global leaf index of the message in the L1→L2 message tree. */
  leafIndex: Fr;
}

/**
 * The L2 side of the inbox bot, kept behind an interface so the consumption state machine, its checks and its
 * concurrency can be exercised without a wallet or a prover.
 */
export interface InboxL2Consumer {
  /**
   * Runs the real consumption attempt: the wallet simulates, proves and submits it. Resolves with the hash of the
   * submitted transaction, without waiting for it to be mined. Throws if the attempt could not be submitted, in
   * which case nothing was spent.
   */
  send(request: InboxConsumptionRequest): Promise<TxHash>;

  /** Simulates a consumption without submitting it. Used only by the replay probe, which must never spend. */
  simulate(request: InboxConsumptionRequest): Promise<void>;
}

/** {@link InboxL2Consumer} backed by the bot's wallet and its `TestContract` deployment. */
export class WalletInboxL2Consumer implements InboxL2Consumer {
  constructor(
    private readonly wallet: EmbeddedWallet,
    private readonly contract: TestContract,
    private readonly defaultAccountAddress: AztecAddress,
    private readonly config: BotConfig,
  ) {}

  public async send(request: InboxConsumptionRequest): Promise<TxHash> {
    const options = getSendInteractionOptions(this.wallet, this.config, this.defaultAccountAddress);
    const { txHash } = await this.interactionFor(request).send({ ...options, wait: NO_WAIT });
    return txHash;
  }

  public async simulate(request: InboxConsumptionRequest): Promise<void> {
    const options = getSendInteractionOptions(this.wallet, this.config, this.defaultAccountAddress);
    await this.interactionFor(request).simulate({ from: options.from });
  }

  private interactionFor(request: InboxConsumptionRequest) {
    const { content, secret, sender, leafIndex } = request;
    return request.mode === 'public'
      ? this.contract.methods.consume_message_from_arbitrary_sender_public(content, secret, sender, leafIndex)
      : this.contract.methods.consume_message_from_arbitrary_sender_private(content, secret, sender, leafIndex);
  }
}

/**
 * How the public domain reports a message that the block being simulated has not absorbed yet:
 * `PublicContext::consume_l1_to_l2_message` asserts `l1_to_l2_msg_exists` with this text.
 */
const PUBLIC_MESSAGE_MISSING = 'Tried to consume nonexistent L1-to-L2 message';

/**
 * How the private domain reports the same thing. Private execution never reaches an assertion: the PXE's
 * membership-witness oracle (`getL1ToL2MessageWitness`) throws first, because the node has no witness for the
 * message at the anchor block.
 */
const PRIVATE_MESSAGE_MISSING = 'No L1 to L2 message found for message hash';

/** How the public domain reports a message whose nullifier is already in the tree it simulates against. */
const PUBLIC_MESSAGE_NULLIFIED = 'L1-to-L2 message is already nullified';

/** How the private domain reports it: the same oracle refuses to hand out a witness for a spent message. */
const PRIVATE_MESSAGE_NULLIFIED = 'No non-nullified L1 to L2 message found for message hash';

/**
 * Whether a failed consumption attempt says the message is not consumable *yet*, which is the ordinary outcome
 * of racing the block that absorbs it, and is retried rather than reported as a failure.
 *
 * Only the two texts that name the message itself count. In particular the private assertion `Message not in
 * state`, which fires when a witness was returned but does not hash up to the anchor's root, is deliberately not
 * matched: that is an inconsistency between the node's witness and its own header, not a message that has yet to
 * arrive. Nor is a bare simulation revert: an arbitrary failure must never be excused as a message not being ready.
 */
export function isMessageNotYetConsumableError(err: unknown): boolean {
  const text = collectErrorText(err);
  if (isAlreadyNullifiedError(err)) {
    return false;
  }
  return text.includes(PUBLIC_MESSAGE_MISSING) || text.includes(PRIVATE_MESSAGE_MISSING);
}

/**
 * Whether a failed attempt was rejected specifically because the message's nullifier already exists. This is the
 * only rejection that demonstrates replay protection; a wrong secret, a missing message or an RPC failure produce
 * different text and must not be read as one.
 *
 * Covers all three places the rejection can come from: the public assertion, the private witness oracle, and the
 * node's own tx validation when a simulation gets far enough to be validated.
 */
export function isAlreadyNullifiedError(err: unknown): boolean {
  const text = collectErrorText(err);
  return (
    text.includes(PUBLIC_MESSAGE_NULLIFIED) ||
    text.includes(PRIVATE_MESSAGE_NULLIFIED) ||
    text.includes(TX_ERROR_EXISTING_NULLIFIER)
  );
}

/**
 * Whether a failure looks like the node or the network being unavailable rather than the transaction being wrong.
 * These retry on their own cadence and are reported apart from consumption failures.
 */
export function isRpcError(err: unknown): boolean {
  return /econnrefused|econnreset|enotfound|etimedout|socket hang up|fetch failed|network error|request to .* failed/i.test(
    collectErrorText(err),
  );
}

/**
 * Whether a failure is about paying for the transaction rather than about the message. The bot's fee juice running
 * out says nothing about the messaging API, so these are accounted apart from consumption failures.
 */
export function isFeePaymentError(err: unknown): boolean {
  const text = collectErrorText(err);
  return [
    TX_ERROR_INSUFFICIENT_FEE_PAYER_BALANCE,
    TX_ERROR_INSUFFICIENT_FEE_PER_GAS,
    TX_ERROR_INSUFFICIENT_GAS_LIMIT,
  ].some(marker => text.includes(marker));
}

/** Flattens an error and its `cause` chain into one string, so a wrapped simulation error still matches. */
function collectErrorText(err: unknown): string {
  const parts: string[] = [];
  let current: unknown = err;
  for (let depth = 0; current !== undefined && current !== null && depth < 8; depth++) {
    if (current instanceof Error) {
      parts.push(current.message);
      current = current.cause;
      continue;
    }
    if (typeof current === 'string') {
      parts.push(current);
      break;
    }
    try {
      // Something that is not an Error was thrown, such as an RPC layer rejecting with a plain payload. It still
      // has to be searched for the marker texts.
      parts.push(JSON.stringify(current) ?? '');
    } catch {
      // A value that cannot be serialized carries no marker text worth matching.
    }
    break;
  }
  return parts.join(' | ');
}
