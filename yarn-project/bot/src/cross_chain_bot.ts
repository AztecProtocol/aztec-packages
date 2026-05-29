/**
 * CrossChainBot exercises L2->L1 and L1->L2 messaging.
 *
 *   createAndSendTx                          onTxMined
 *   ──────────────────────────────────────   ──────────────────────────────
 *
 *   1. SEED (fire-and-forget)                3. VERIFY L2->L1
 *      if store has fewer pending messages       Query getTxEffect, confirm
 *      than seedCount and no seed is              the expected L2->L1 messages
 *      in-flight:                                appeared in tx effects.
 *        * kick off L1 inbox tx
 *        * store msg on completion
 *
 *   2. BUILD & SEND BATCH
 *      Always:
 *        N x create_l2_to_l1_message
 *            (random content, fixed
 *             L1 recipient)
 *      If a ready L1->L2 msg exists:
 *        1 x consume_message_from_
 *            arbitrary_sender_public
 *        delete consumed msg from store
 *      Send batch tx (no wait)
 *
 */
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { BatchCall, NO_WAIT } from '@aztec/aztec.js/contracts';
import { isL1ToL2MessageReady } from '@aztec/aztec.js/messaging';
import type { TxHash, TxReceipt } from '@aztec/aztec.js/tx';
import type { ExtendedViemWalletClient } from '@aztec/ethereum/types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { TestContract } from '@aztec/noir-test-contracts.js/Test';
import type { AztecNode, AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import type { EmbeddedWallet } from '@aztec/wallets/embedded';

import { BaseBot } from './base_bot.js';
import type { BotConfig } from './config.js';
import { BotFactory } from './factory.js';
import { seedL1ToL2Message } from './l1_to_l2_seeding.js';
import type { BotStore, PendingL1ToL2Message } from './store/index.js';

/** Stale message threshold: messages older than this are removed. */
const STALE_MESSAGE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

/** Bot that exercises both L2→L1 and L1→L2 cross-chain messaging. */
export class CrossChainBot extends BaseBot {
  private l2ToL1Sent = 0;
  private l1ToL2Consumed = 0;
  private pendingSeedPromise: Promise<void> | undefined;

  protected constructor(
    node: AztecNode,
    wallet: EmbeddedWallet,
    defaultAccountAddress: AztecAddress,
    private readonly contract: TestContract,
    private readonly l1Client: ExtendedViemWalletClient,
    private readonly l1Recipient: EthAddress,
    private readonly inboxAddress: EthAddress,
    private readonly rollupVersion: bigint,
    private readonly store: BotStore,
    config: BotConfig,
  ) {
    super(node, wallet, defaultAccountAddress, config);
  }

  static async create(
    config: BotConfig,
    wallet: EmbeddedWallet,
    aztecNode: AztecNode,
    aztecNodeAdmin: AztecNodeAdmin | undefined,
    store: BotStore,
  ): Promise<CrossChainBot> {
    if (config.followChain === 'NONE') {
      throw new Error(`CrossChainBot requires followChain to be set (got NONE)`);
    }
    const factory = new BotFactory(config, wallet, store, aztecNode, aztecNodeAdmin);
    const { defaultAccountAddress, contract, l1Client, rollupVersion } = await factory.setupCrossChain();
    const l1Recipient = EthAddress.fromString(l1Client.account!.address);
    const { l1ContractAddresses } = await aztecNode.getNodeInfo();
    const inboxAddress = EthAddress.fromString(l1ContractAddresses.inboxAddress.toString());
    return new CrossChainBot(
      aztecNode,
      wallet,
      defaultAccountAddress,
      contract,
      l1Client,
      l1Recipient,
      inboxAddress,
      rollupVersion,
      store,
      config,
    );
  }

  protected async createAndSendTx(logCtx: object): Promise<TxHash> {
    const pendingMessages = await this.store.getUnconsumedL1ToL2Messages();

    // Send an L1→L2 message if we're below the threshold and not already seeding one
    if (pendingMessages.length < this.config.l1ToL2SeedCount && !this.pendingSeedPromise) {
      this.pendingSeedPromise = this.seedNewL1ToL2Message()
        .catch(err => this.log.warn(`Failed to seed L1→L2 message: ${err}`, logCtx))
        .finally(() => {
          this.pendingSeedPromise = undefined;
        });
    }

    // Build batch: always L2→L1, optionally consume L1→L2
    const calls = [];

    // L2→L1: create messages with random content
    for (let i = 0; i < this.config.l2ToL1MessagesPerTx; i++) {
      calls.push(
        this.contract.methods.create_l2_to_l1_message_arbitrary_recipient_public(Fr.random(), this.l1Recipient),
      );
    }

    // L1→L2: consume oldest ready message if available
    const readyMsg = await this.getReadyL1ToL2Message(pendingMessages);
    if (readyMsg) {
      calls.push(
        this.contract.methods.consume_message_from_arbitrary_sender_public(
          Fr.fromHexString(readyMsg.content),
          Fr.fromHexString(readyMsg.secret),
          EthAddress.fromString(readyMsg.sender),
          new Fr(BigInt(readyMsg.globalLeafIndex)),
        ),
      );
      // Delete consumed message immediately so it works with FOLLOW_CHAIN=NONE
      await this.store.deleteL1ToL2Message(readyMsg.msgHash);
      this.l1ToL2Consumed++;
    } else {
      this.log.warn(`No ready L1→L2 message to consume`, {
        ...logCtx,
        pendingCount: pendingMessages.length,
      });
    }

    const batch = new BatchCall(this.wallet, calls);
    const opts = this.getSendMethodOpts();

    this.log.verbose(`Sending cross-chain batch with ${calls.length} calls`, logCtx);
    const { txHash } = await batch.send({ ...opts, wait: NO_WAIT });
    return txHash;
  }

  protected override async onTxMined(receipt: TxReceipt, logCtx: object): Promise<void> {
    // Verify L2→L1 messages appeared in this tx's effects
    const indexed = await this.node.getTxEffect(receipt.txHash);
    if (indexed) {
      const l2ToL1Msgs = indexed.data.l2ToL1Msgs.filter(m => !m.isZero());
      if (l2ToL1Msgs.length >= this.config.l2ToL1MessagesPerTx) {
        this.l2ToL1Sent += l2ToL1Msgs.length;
      } else {
        this.log.error(`Expected ${this.config.l2ToL1MessagesPerTx} L2→L1 messages but found ${l2ToL1Msgs.length}`, {
          ...logCtx,
          blockNumber: receipt.blockNumber,
          txHash: receipt.txHash.toString(),
        });
      }
    }

    const pendingCount = (await this.store.getUnconsumedL1ToL2Messages()).length;
    this.log.info(`CrossChainBot txs mined`, {
      ...logCtx,
      l2ToL1Sent: this.l2ToL1Sent,
      l1ToL2Consumed: this.l1ToL2Consumed,
      l1ToL2Pending: pendingCount,
    });
  }

  /** Finds the oldest pending message that is ready for consumption. */
  private async getReadyL1ToL2Message(
    pendingMessages: PendingL1ToL2Message[],
  ): Promise<PendingL1ToL2Message | undefined> {
    const now = Date.now();
    for (const msg of pendingMessages) {
      const ready = await isL1ToL2MessageReady(this.node, Fr.fromHexString(msg.msgHash));
      if (ready) {
        return msg;
      }

      // Time-based stale detection: if the message is old and still not ready, remove it
      if (now - msg.timestamp > STALE_MESSAGE_THRESHOLD_MS) {
        await this.store.deleteL1ToL2Message(msg.msgHash);
        this.log.warn(`Removed stale L1→L2 message ${msg.msgHash}`);
      }
    }
    return undefined;
  }

  /** Seeds a new L1→L2 message on L1 and stores it. */
  private async seedNewL1ToL2Message(): Promise<void> {
    await seedL1ToL2Message(
      this.l1Client,
      this.inboxAddress,
      this.contract.address,
      this.rollupVersion,
      this.store,
      this.log,
    );
  }
}
