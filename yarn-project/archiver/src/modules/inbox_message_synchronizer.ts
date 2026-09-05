import type { InboxContract, InboxContractState } from '@aztec/ethereum/contracts';
import type { L1BlockId } from '@aztec/ethereum/l1-types';
import type { ViemPublicClient } from '@aztec/ethereum/types';
import { minBigint } from '@aztec/foundation/bigint';
import { Buffer32 } from '@aztec/foundation/buffer';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import type { L2Block } from '@aztec/stdlib/block';
import type { InboxMessagePosition } from '@aztec/stdlib/messaging';

import { InboxMessagePrefixChangedError } from '../errors.js';
import { retrieveL1ToL2Message, retrieveL1ToL2Messages } from '../l1/data_retrieval.js';
import type { ArchiverDataStores } from '../store/data_stores.js';
import { MessageStoreError } from '../store/message_store.js';
import type { InboxMessage } from '../structs/inbox_message.js';
import type { ArchiverDataStoreUpdater } from './data_store_updater.js';

/**
 * Outcome of one message sync pass. `synced` means the local message log equals the Inbox's position at the captured
 * L1 head and the message syncpoint is that head. `pending` means the pass did bounded work (a recovery step, or a
 * commit that leaves normal forward ingestion to continue) and the caller must run another pass before advertising
 * the head as synced.
 */
export type InboxMessageSyncStatus = 'synced' | 'pending';

export type InboxMessageSyncResult = {
  status: InboxMessageSyncStatus;
  /** Proposed blocks pruned in this pass because a message they consumed was replaced or removed. */
  prunedBlocks: L2Block[];
  /** Whether a replacement in this pass reached below the checkpointed tip's consumed message count. */
  checkpointedTipAffected: boolean;
};

/**
 * Where a recovery pass stands. The anchor phase walks the local log backwards looking for a message L1 still holds
 * at the same index and hash; the replay phase re-fetches the canonical messages forward from the anchor's L1 block,
 * one batch per pass, comparing them with the stored ones before touching anything.
 */
type RecoveryPhase =
  | { kind: 'anchor'; nextCandidateIndex: bigint | undefined }
  | { kind: 'replay'; nextL1Block: bigint; batchesReplayed: number };

/** A recovery in progress, pinned to the L1 head it was started against. */
type RecoveryState = {
  /** The captured L1 head the Inbox position was read at. Recovery compares against this head until it is replaced. */
  head: L1BlockId;
  /** The Inbox's position at `head`. */
  remote: InboxContractState;
  finalizedL1Block: L1BlockId | undefined;
  phase: RecoveryPhase;
  /** Number of per-message event lookups made so far, for progress reporting. */
  lookups: number;
  startedAt: Timer;
};

/** Progress of an ongoing recovery, for logging and inspection. */
export type InboxMessageRecoveryProgress = {
  headL1BlockNumber: bigint;
  remoteTotalMessageCount: bigint;
  phase: RecoveryPhase['kind'];
  nextCandidateIndex?: bigint;
  nextL1Block?: bigint;
  lookups: number;
  elapsedMs: number;
};

/**
 * Keeps the archiver's ordered Inbox message log equal to L1's.
 *
 * Normal ingestion captures an L1 head, reads the Inbox's position (message count and rolling hash) at that head,
 * fetches the MessageSent events forward from the persisted syncpoint in bounded L1 block ranges and commits each
 * batch together with the syncpoint covering it, so completed batches are usable immediately and a later RPC failure
 * leaves them in place. The batch reaching the head is staged and committed with the head only once the position
 * after it equals the captured one, so the log never holds messages past its syncpoint; a disagreement means an L1
 * reorg changed messages this node already holds, and recovery starts.
 *
 * Recovery never deletes on a failed lookup. It first finds an anchor: either the canonical tip itself is a shorter
 * prefix of the local log (checked by hash, so truncation needs no event lookups), or a stored message whose event L1
 * still emits at the same index and hash, found by walking the log backwards with a bounded number of event lookups
 * per pass. A lookup that misses only moves the search to an older candidate. From the anchor's canonical L1 block it
 * replays the canonical messages forward one batch per pass, comparing each with the stored message at its index.
 * Rows and proposed blocks are preserved until an actual content difference is found; at that first difference the
 * old suffix is removed, the verified replacement batch appended, the syncpoint moved and the proposed blocks that
 * consumed the replaced messages pruned, all in one store transaction. A moved prefix followed by new messages is
 * plain append. Recovery is pinned to the head it started against: a merely advancing `latest` does not reset it,
 * only a replaced or unavailable head does. The cursor is process-local; after a restart, anchor discovery starts
 * over from the committed syncpoint, which is correct.
 *
 * The inherited finalized-height shortcut is kept: a stored message observed at or below the finality marker
 * persisted by the last sync that reached agreement with L1 is accepted as an anchor without a lookup, and the marker
 * only advances on such agreement. A message re-mined above the finalized height whose old height was below it can
 * therefore be trusted wrongly; that exception is deliberately retained and not repaired here.
 */
export class InboxMessageSynchronizer {
  private recovery: RecoveryState | undefined;

  constructor(
    private readonly publicClient: Pick<ViemPublicClient, 'getBlock'>,
    private readonly inbox: InboxContract,
    private readonly stores: ArchiverDataStores,
    private readonly updater: ArchiverDataStoreUpdater,
    private readonly l1Start: L1BlockId,
    private readonly getBatchSizeInL1Blocks: () => bigint,
    private readonly opts: { maxAnchorLookupsPerPass: number } = { maxAnchorLookupsPerPass: 32 },
    private readonly onMessagesStored: (count: number, msPerMessage: number) => void = () => {},
    private readonly log: Logger = createLogger('archiver:inbox-sync'),
  ) {}

  /** Whether a recovery is in progress, i.e. the local log is not yet known to equal L1's at the captured head. */
  public isRecovering(): boolean {
    return this.recovery !== undefined;
  }

  public getRecoveryProgress(): InboxMessageRecoveryProgress | undefined {
    const recovery = this.recovery;
    if (recovery === undefined) {
      return undefined;
    }
    return {
      headL1BlockNumber: recovery.head.l1BlockNumber,
      remoteTotalMessageCount: recovery.remote.totalMessagesInserted,
      phase: recovery.phase.kind,
      nextCandidateIndex: recovery.phase.kind === 'anchor' ? recovery.phase.nextCandidateIndex : undefined,
      nextL1Block: recovery.phase.kind === 'replay' ? recovery.phase.nextL1Block : undefined,
      lookups: recovery.lookups,
      elapsedMs: recovery.startedAt.ms(),
    };
  }

  /**
   * Runs one bounded sync pass against the given L1 head. An active recovery is continued before anything else, so
   * a head that merely advanced does not interrupt it; a replaced head restarts recovery against the new view.
   */
  public async sync(head: L1BlockId, finalizedL1Block: L1BlockId | undefined): Promise<InboxMessageSyncResult> {
    try {
      return await this.syncPass(head, finalizedL1Block);
    } catch (err) {
      if (err instanceof InboxMessagePrefixChangedError) {
        this.log.warn(`Local Inbox messages changed while a replacement was being prepared; restarting recovery`, {
          error: err.message,
        });
        this.recovery = undefined;
        return pending();
      }
      throw err;
    }
  }

  private async syncPass(head: L1BlockId, finalizedL1Block: L1BlockId | undefined): Promise<InboxMessageSyncResult> {
    if (this.recovery !== undefined) {
      const pinnedHead = this.recovery.head;
      if (await this.isHeadStillCanonical(pinnedHead)) {
        const result = await this.continueRecovery();
        // Recovery is complete relative to the head it was pinned to; blocks after it still need normal ingestion.
        return result.status === 'synced' && !sameL1Block(pinnedHead, head) ? { ...result, status: 'pending' } : result;
      }
      this.log.warn(`L1 head ${this.recovery.head.l1BlockNumber} recovery was pinned to has been replaced`, {
        ...this.getRecoveryProgress(),
      });
      this.recovery = undefined;
    }

    const syncPoint = (await this.stores.messages.getSynchedL1Block()) ?? this.l1Start;
    if (sameL1Block(head, syncPoint)) {
      // The syncpoint only ever reaches a head once the log agrees with the Inbox there (a replacement batch ending
      // at the head is the canonical sequence through it), so finality may advance over the whole log.
      this.log.trace(`L1 to L2 messages already synced to L1 block ${head.l1BlockNumber}`);
      if (finalizedL1Block !== undefined) {
        await this.stores.messages.setMessageSyncState(head, finalizedL1Block);
      }
      return synced();
    }

    // The Inbox's position at the captured head is the single point of comparison for this pass: a fetch bounded by
    // that head is never compared with a newer `latest` position, so a normal append cannot look like a reorg.
    const remote = await this.inbox.getState({ blockNumber: head.l1BlockNumber });
    const local = await this.stores.messages.getSyncedMessagePosition();
    if (positionMatches(local, remote)) {
      // The state was read by block number: only a head that is still canonical proves it was this head's.
      if (!(await this.isHeadStillCanonical(head))) {
        this.log.verbose(`L1 head ${head.l1BlockNumber} was replaced while reading the Inbox state`);
        return pending();
      }
      await this.stores.messages.setMessageSyncState(head, finalizedL1Block);
      return synced();
    }

    if (remote.totalMessagesInserted < local.totalMessageCount) {
      // A shorter canonical sequence whose tip hash is our prefix hash at that count is a pure truncation; the tip
      // itself proves where it ends, so no old placement lookup is needed.
      const localAtRemote = await this.stores.messages.getMessagePosition(remote.totalMessagesInserted);
      if (localAtRemote !== undefined && localAtRemote.rollingHash.equals(remote.rollingHash)) {
        if (!(await this.isHeadStillCanonical(head))) {
          this.log.verbose(`L1 head ${head.l1BlockNumber} was replaced while reading the Inbox state; not truncating`);
          return pending();
        }
        return this.truncate(localAtRemote, head, finalizedL1Block);
      }
      return this.startRecovery(head, remote, finalizedL1Block);
    }

    if (head.l1BlockNumber <= syncPoint.l1BlockNumber) {
      // A same-height or shorter replacement head that does not simply shorten our log: there is no forward range to
      // fetch, so find where the local log and the canonical one part ways.
      return this.startRecovery(head, remote, finalizedL1Block);
    }

    let headBatch: InboxMessage[];
    try {
      headBatch = await this.ingestForward(syncPoint.l1BlockNumber + 1n, head);
    } catch (err) {
      if (err instanceof MessageStoreError) {
        this.log.warn(`Fetched L1 to L2 messages do not continue the local log: ${err.message}`, {
          inboxMessage: err.inboxMessage,
        });
        return this.startRecovery(head, remote, finalizedL1Block);
      }
      throw err;
    }

    if (!(await this.isHeadStillCanonical(head))) {
      // The chain moved under the fetch: the logs may belong to another chain than the position they are compared
      // with, so neither the head batch nor a recovery is committed; the next pass reads the replacement head.
      this.log.verbose(`L1 head ${head.l1BlockNumber} was replaced while fetching L1 to L2 messages`);
      return pending();
    }
    const localAfterFetch = await this.stores.messages.getSyncedMessagePosition();
    const lastStaged = headBatch.at(-1);
    const positionAfterHeadBatch =
      lastStaged === undefined
        ? localAfterFetch
        : { totalMessageCount: lastStaged.index + 1n, rollingHash: lastStaged.inboxRollingHash };
    if (positionMatches(positionAfterHeadBatch, remote)) {
      // The staged head batch continues the log and lands exactly on the Inbox's position: commit it with the head
      // as syncpoint in one transaction. A batch that does not chain onto the log is a reorg to recover from.
      try {
        await this.storeMessages(headBatch, { l1Block: head, finalizedL1Block });
      } catch (err) {
        if (err instanceof MessageStoreError) {
          this.log.warn(`Head batch of L1 to L2 messages does not continue the local log: ${err.message}`, {
            inboxMessage: err.inboxMessage,
          });
          return this.startRecovery(head, remote, finalizedL1Block);
        }
        throw err;
      }
      return synced();
    }
    return this.startRecovery(head, remote, finalizedL1Block);
  }

  /**
   * Fetches messages forward in bounded L1 block ranges and commits each batch with the syncpoint that covers it,
   * except for the batch reaching the head, which is returned staged instead of stored: the log must never hold
   * messages past its syncpoint, or a later head equal to that syncpoint would pass the same-head shortcut over
   * messages the canonical chain may have dropped. The caller commits the staged batch together with the head once
   * the log agrees with the Inbox there. Throws `MessageStoreError` when an intermediate batch does not continue the
   * stored chain, leaving the earlier batches in place.
   */
  private async ingestForward(fromL1Block: bigint, head: L1BlockId): Promise<InboxMessage[]> {
    let start = fromL1Block;
    let stored = 0;
    let headBatch: InboxMessage[] = [];
    while (start <= head.l1BlockNumber) {
      const end = minBigint(start + this.getBatchSizeInL1Blocks() - 1n, head.l1BlockNumber);
      this.log.trace(`Retrieving L1 to L2 messages in L1 blocks ${start}-${end}`);
      const messages = await retrieveL1ToL2Messages(this.inbox, start, end);
      if (end === head.l1BlockNumber) {
        headBatch = messages;
      } else {
        await this.storeMessages(messages, { l1Block: await this.l1BlockIdFor(end, head) });
        stored += messages.length;
      }
      start = end + 1n;
    }
    if (stored > 0) {
      const last = await this.stores.messages.getLastMessage();
      this.log.info(`Retrieved ${stored} new L1 to L2 messages up to message with index ${last?.index}`, {
        messageCount: stored,
        lastMessage: last,
      });
    }
    return headBatch;
  }

  private async storeMessages(
    messages: InboxMessage[],
    syncState: { l1Block: L1BlockId; finalizedL1Block?: L1BlockId } | undefined,
  ): Promise<void> {
    const timer = new Timer();
    await this.stores.messages.addL1ToL2Messages(messages, syncState);
    if (messages.length > 0) {
      this.onMessagesStored(messages.length, timer.ms() / messages.length);
      for (const message of messages) {
        this.log.debug(`Stored L1 to L2 message`, { ...message, leaf: message.leaf.toString() });
      }
    }
  }

  private async startRecovery(
    head: L1BlockId,
    remote: InboxContractState,
    finalizedL1Block: L1BlockId | undefined,
  ): Promise<InboxMessageSyncResult> {
    const local = await this.stores.messages.getSyncedMessagePosition();
    // Messages past the canonical count cannot be on the canonical chain at their index, so the search for a common
    // message starts at the canonical tip or the local one, whichever is lower.
    const lastCandidate = minBigint(local.totalMessageCount, remote.totalMessagesInserted) - 1n;
    this.recovery = {
      head,
      remote,
      finalizedL1Block,
      phase: { kind: 'anchor', nextCandidateIndex: lastCandidate < 0n ? undefined : lastCandidate },
      lookups: 0,
      startedAt: new Timer(),
    };
    this.log.warn(`Local L1 to L2 messages disagree with the Inbox at L1 block ${head.l1BlockNumber}; recovering`, {
      headL1BlockNumber: head.l1BlockNumber,
      localTotalMessageCount: local.totalMessageCount,
      localRollingHash: local.rollingHash.toString(),
      remoteTotalMessageCount: remote.totalMessagesInserted,
      remoteRollingHash: remote.rollingHash.toString(),
    });
    return this.continueRecovery();
  }

  private async continueRecovery(): Promise<InboxMessageSyncResult> {
    const recovery = this.recovery!;
    if (recovery.phase.kind === 'anchor') {
      const anchored = await this.searchAnchor(recovery);
      if (!anchored) {
        return pending();
      }
    }
    return this.replayBatch(recovery);
  }

  /**
   * Walks the local log backwards from the current candidate looking for a message L1 still emits at the same index
   * and hash, spending at most the per-pass lookup budget. Returns true once the replay start is set, false when the
   * budget ran out first. A message at or below the finalized L1 block is accepted without a lookup.
   */
  private async searchAnchor(recovery: RecoveryState): Promise<boolean> {
    const phase = recovery.phase as RecoveryPhase & { kind: 'anchor' };
    // Only the finality marker persisted by the last sync that reached agreement with L1 is trusted here: a fresher
    // finalized height covers messages this node never verified against it, and trusting them would widen the
    // inherited shortcut to whatever the local log happens to hold.
    const finalizedL1Block = await this.stores.messages.getMessagesFinalizedL1Block();
    let lookups = 0;
    while (true) {
      const candidateIndex = phase.nextCandidateIndex;
      if (candidateIndex === undefined) {
        this.log.warn(`No local L1 to L2 message is still on L1; replaying the Inbox from its deployment`, {
          headL1BlockNumber: recovery.head.l1BlockNumber,
          lookups: recovery.lookups,
        });
        recovery.phase = { kind: 'replay', nextL1Block: this.l1Start.l1BlockNumber + 1n, batchesReplayed: 0 };
        return true;
      }
      const candidate = await this.stores.messages.getL1ToL2Message(candidateIndex);
      if (candidate === undefined) {
        throw new InboxMessagePrefixChangedError(candidateIndex + 1n, recovery.remote.rollingHash, undefined);
      }
      if (finalizedL1Block !== undefined && candidate.l1BlockNumber <= finalizedL1Block.l1BlockNumber) {
        this.log.info(`Anchoring L1 to L2 message recovery at finalized L1 block ${candidate.l1BlockNumber}`, {
          candidateIndex,
          l1BlockNumber: candidate.l1BlockNumber,
        });
        recovery.phase = { kind: 'replay', nextL1Block: candidate.l1BlockNumber, batchesReplayed: 0 };
        return true;
      }
      if (lookups >= this.opts.maxAnchorLookupsPerPass) {
        this.log.verbose(`L1 to L2 message anchor search paused after ${lookups} lookups`, this.getRecoveryProgress());
        return false;
      }
      lookups++;
      recovery.lookups++;
      const remoteMessage = await retrieveL1ToL2Message(this.inbox, candidate);
      if (
        remoteMessage !== undefined &&
        remoteMessage.index === candidate.index &&
        remoteMessage.inboxRollingHash.equals(candidate.inboxRollingHash)
      ) {
        this.log.info(
          `Anchoring L1 to L2 message recovery at message ${candidate.index} in L1 block ${remoteMessage.l1BlockNumber}`,
          {
            candidateIndex,
            l1BlockNumber: remoteMessage.l1BlockNumber,
            previousL1BlockNumber: candidate.l1BlockNumber,
          },
        );
        recovery.phase = { kind: 'replay', nextL1Block: remoteMessage.l1BlockNumber, batchesReplayed: 0 };
        return true;
      }
      // A miss near the old height says nothing about where the message is now; only an older candidate can anchor.
      this.log.debug(
        `L1 to L2 message ${candidate.index} not found unchanged near L1 block ${candidate.l1BlockNumber}`,
        {
          candidateIndex,
          remoteMessage,
        },
      );
      phase.nextCandidateIndex = candidateIndex === 0n ? undefined : candidateIndex - 1n;
    }
  }

  /**
   * Replays one batch of canonical messages from the recovery cursor and compares it with the stored log. Commits
   * only at an actual difference (a replacement plus prune, or an append), or refreshes L1 block hints for a batch
   * that matched in full.
   */
  private async replayBatch(recovery: RecoveryState): Promise<InboxMessageSyncResult> {
    const phase = recovery.phase as RecoveryPhase & { kind: 'replay' };
    const { head, remote, finalizedL1Block } = recovery;
    const start = phase.nextL1Block;
    const end = minBigint(start + this.getBatchSizeInL1Blocks() - 1n, head.l1BlockNumber);
    this.log.verbose(
      `Replaying L1 to L2 messages in L1 blocks ${start}-${end} for recovery`,
      this.getRecoveryProgress(),
    );
    const canonical = await retrieveL1ToL2Messages(this.inbox, start, end);
    if (!(await this.isHeadStillCanonical(head))) {
      this.log.warn(`L1 head ${head.l1BlockNumber} was replaced during L1 to L2 message replay; restarting recovery`);
      this.recovery = undefined;
      return pending();
    }

    let firstNew: number | undefined;
    let firstDivergent: number | undefined;
    for (let i = 0; i < canonical.length; i++) {
      const message = canonical[i];
      const stored = await this.stores.messages.getL1ToL2Message(message.index);
      if (stored === undefined) {
        firstNew = i;
        break;
      }
      if (!stored.leaf.equals(message.leaf) || !stored.inboxRollingHash.equals(message.inboxRollingHash)) {
        firstDivergent = i;
        break;
      }
    }

    const l1Block = await this.l1BlockIdFor(end, head);
    phase.batchesReplayed++;

    if (firstDivergent !== undefined) {
      const divergent = canonical[firstDivergent];
      const expectedPrefix = await this.stores.messages.getMessagePosition(divergent.index);
      if (expectedPrefix === undefined) {
        throw new InboxMessagePrefixChangedError(divergent.index, remote.rollingHash, undefined);
      }
      this.log.warn(`L1 to L2 message ${divergent.index} differs from L1; replacing the local suffix from it`, {
        firstDivergentIndex: divergent.index,
        l1BlockNumber: divergent.l1BlockNumber,
        replacementCount: canonical.length - firstDivergent,
      });
      // The whole batch goes to the store: the matching prefix of it is rewritten in place (refreshing L1 block
      // hints), the suffix from the divergence replaces what was there.
      const result = await this.updater.replaceMessageSuffixAndPruneProposedBlocks({
        firstDivergentIndex: divergent.index,
        expectedPrefix,
        messages: canonical,
        syncState: { l1Block },
      });
      this.recovery = undefined;
      return { status: 'pending', ...result };
    }

    if (firstNew !== undefined) {
      this.log.info(
        `Canonical L1 to L2 messages rejoin the local log at index ${canonical[firstNew].index}; appending`,
        {
          firstNewIndex: canonical[firstNew].index,
          appendCount: canonical.length - firstNew,
        },
      );
      await this.storeMessages(canonical, { l1Block });
      this.recovery = undefined;
      return pending();
    }

    if (canonical.length > 0) {
      // Everything matched; only the L1 block hints may have moved.
      await this.storeMessages(canonical, undefined);
    }
    if (end < head.l1BlockNumber) {
      phase.nextL1Block = end + 1n;
      return pending();
    }

    // Replayed through the head without a difference: the local log holds the canonical sequence, possibly followed
    // by a stale tail the canonical chain no longer has.
    const local = await this.stores.messages.getSyncedMessagePosition();
    if (positionMatches(local, remote)) {
      await this.stores.messages.setMessageSyncState(head, finalizedL1Block);
      this.log.info(`L1 to L2 message recovery found no content change`, this.getRecoveryProgress());
      this.recovery = undefined;
      return synced();
    }
    const localAtRemote = await this.stores.messages.getMessagePosition(remote.totalMessagesInserted);
    if (localAtRemote !== undefined && localAtRemote.rollingHash.equals(remote.rollingHash)) {
      this.recovery = undefined;
      return this.truncate(localAtRemote, head, finalizedL1Block);
    }
    this.log.error(`Inbox events and state at L1 block ${head.l1BlockNumber} disagree; retrying recovery`, {
      localTotalMessageCount: local.totalMessageCount,
      remoteTotalMessageCount: remote.totalMessagesInserted,
    });
    this.recovery = undefined;
    return pending();
  }

  /** Removes every local message past `keep`, which the canonical chain has authenticated as its tip. */
  private async truncate(
    keep: InboxMessagePosition,
    head: L1BlockId,
    finalizedL1Block: L1BlockId | undefined,
  ): Promise<InboxMessageSyncResult> {
    const local = await this.stores.messages.getSyncedMessagePosition();
    this.log.warn(
      `Truncating local L1 to L2 messages from ${local.totalMessageCount} to ${keep.totalMessageCount} to match L1`,
      { headL1BlockNumber: head.l1BlockNumber, keptCount: keep.totalMessageCount, localCount: local.totalMessageCount },
    );
    const result = await this.updater.replaceMessageSuffixAndPruneProposedBlocks({
      firstDivergentIndex: keep.totalMessageCount,
      expectedPrefix: keep,
      messages: [],
      syncState: { l1Block: head },
    });
    // The remaining log is the canonical sequence at the head, so finality may advance over it.
    if (finalizedL1Block !== undefined) {
      await this.stores.messages.setMessageSyncState(head, finalizedL1Block);
    }
    return { status: 'synced', ...result };
  }

  private async l1BlockIdFor(l1BlockNumber: bigint, head: L1BlockId): Promise<L1BlockId> {
    if (l1BlockNumber === head.l1BlockNumber) {
      return head;
    }
    const block = await this.publicClient.getBlock({ blockNumber: l1BlockNumber, includeTransactions: false });
    return { l1BlockNumber, l1BlockHash: Buffer32.fromString(block.hash) };
  }

  private async isHeadStillCanonical(head: L1BlockId): Promise<boolean> {
    try {
      const block = await this.publicClient.getBlock({ blockNumber: head.l1BlockNumber, includeTransactions: false });
      return Buffer32.fromString(block.hash).equals(head.l1BlockHash);
    } catch (err) {
      this.log.debug(`Could not read L1 block ${head.l1BlockNumber} to confirm the captured head: ${err}`);
      return false;
    }
  }
}

function sameL1Block(a: L1BlockId, b: L1BlockId): boolean {
  return a.l1BlockNumber === b.l1BlockNumber && a.l1BlockHash.equals(b.l1BlockHash);
}

function positionMatches(local: InboxMessagePosition, remote: InboxContractState): boolean {
  return local.totalMessageCount === remote.totalMessagesInserted && local.rollingHash.equals(remote.rollingHash);
}

function synced(): InboxMessageSyncResult {
  return { status: 'synced', prunedBlocks: [], checkpointedTipAffected: false };
}

function pending(): InboxMessageSyncResult {
  return { status: 'pending', prunedBlocks: [], checkpointedTipAffected: false };
}
