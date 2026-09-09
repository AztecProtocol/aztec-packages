import type { InboxContract, InboxContractState } from '@aztec/ethereum/contracts';
import type { L1BlockId } from '@aztec/ethereum/l1-types';
import type { ViemPublicClient } from '@aztec/ethereum/types';
import { maxBigint, minBigint } from '@aztec/foundation/bigint';
import { Buffer32 } from '@aztec/foundation/buffer';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import type { L2Block } from '@aztec/stdlib/block';
import type { InboxMessagePosition } from '@aztec/stdlib/messaging';

import { InboxMessagePrefixChangedError } from '../errors.js';
import { retrieveL1ToL2Message, retrieveL1ToL2Messages } from '../l1/data_retrieval.js';
import type { ArchiverDataStores } from '../store/data_stores.js';
import { MessageStoreError, type MessageSyncState, zeroMessagePosition } from '../store/message_store.js';
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
  /** Proposed blocks pruned in this pass because a message they consumed was rolled back. */
  prunedBlocks: L2Block[];
  /** Whether a rollback in this pass reached below the checkpointed tip's consumed message count. */
  checkpointedTipAffected: boolean;
};

/** A recovery in progress, pinned to the L1 head it was started against. */
type RecoveryState = {
  /** The captured L1 head the Inbox position was read at. Recovery compares against this head until it is replaced. */
  head: L1BlockId;
  /** The Inbox's position at `head`. */
  remote: InboxContractState;
  /** The next stored message to look up on L1, or undefined once the search has run out of candidates. */
  nextCandidateIndex: bigint | undefined;
  /** Number of per-message event lookups made so far, for progress reporting. */
  lookups: number;
  startedAt: Timer;
};

/** The prefix a rollback retains, and the L1 block the deleted suffix is re-fetched from. */
type RecoveryAnchor = {
  /** Cumulative count and rolling hash of the prefix to keep. */
  keep: InboxMessagePosition;
  /** The anchor's canonical L1 block; the scanned cursor rewinds to the block before it. */
  anchorL1Block: bigint;
};

/** Progress of an ongoing recovery, for logging and inspection. */
export type InboxMessageRecoveryProgress = {
  headL1BlockNumber: bigint;
  remoteTotalMessageCount: bigint;
  nextCandidateIndex?: bigint;
  lookups: number;
  elapsedMs: number;
};

/**
 * Keeps the archiver's ordered Inbox message log equal to L1's.
 *
 * The invariant every path here maintains: a persisted message syncpoint certifies the entire stored prefix, and the
 * completeness of a log response is never inferred from block identity. Two positions are therefore persisted. The
 * scanned cursor is where the log responses read so far end; it only says which L1 blocks were queried, and a
 * canonical block at that height says nothing about whether its response held every message it emitted. The syncpoint
 * is the L1 block at which the stored log's position was found equal to the Inbox's own position; storing messages
 * without such a comparison clears it, so a syncpoint is only ever a verified position. Only the syncpoint may answer
 * a head as synced, advance the finality marker or be inherited as canonical; the cursor only says where fetching
 * resumes.
 *
 * Normal ingestion captures an L1 head, reads the Inbox's position (message count and rolling hash) at that head,
 * fetches the MessageSent events forward from the scanned cursor in bounded L1 block ranges and commits each batch
 * with the cursor covering it, so completed batches are usable immediately and a later RPC failure leaves them in
 * place. The batch reaching the head is staged and committed with the head as syncpoint only once the position after
 * it equals the captured one, which certifies the intermediate batches with it; a disagreement means either an L1
 * reorg changed messages this node already holds or a response was incomplete, and recovery starts.
 *
 * Recovery is conservative: it keeps what it can still authenticate on L1 and reconstructs the rest. It first finds
 * an anchor: either the canonical tip itself is a shorter prefix of the local log (checked by hash, so truncation
 * needs no event lookups), or a stored message whose event L1 still emits at the same index and hash within five L1
 * blocks of the height it was observed at, found by walking the log backwards with a bounded number of event lookups
 * per pass. A lookup that misses moves the search to an older candidate, and running out of candidates falls back to
 * the deployment block, which is itself re-read: the Inbox's first message can be emitted by a later transaction in
 * the block the contracts were deployed in, so the deployment block is the one block an exclusive cursor may not
 * skip. Once an anchor is chosen the log is rolled back to it in one store transaction: the suffix
 * rows are deleted, the proposed blocks that consumed more messages than the retained count are pruned with their
 * descendants, the scanned cursor rewinds to the block before the anchor's and the syncpoint is cleared. Nothing is
 * fetched in that pass; ordinary forward ingestion refills the log from the rewound cursor, rewriting the retained
 * rows in place and appending the canonical suffix.
 *
 * The accepted cost is that a message the bounded search cannot place is discarded even if its content is unchanged
 * and comes straight back: the reference case is a message re-mined far from its old height, whose lookup misses, so
 * the anchor lands before it and the proposed blocks that consumed it are pruned. A provider answering `eth_getLogs`
 * with an empty result rather than an error has the same effect on a larger scale, walking the search back to the
 * finality marker or the deployment block. This is a liveness cost, not a safety one: L1 stays authoritative, the
 * deleted rows are re-fetched, and published checkpoints are never deleted by this path. An RPC exception is not a
 * miss and commits nothing.
 *
 * Recovery is pinned to the head it started against: a merely advancing `latest` does not reset it, only a positively
 * replaced head does. Event lookups are bounded above by that head, so an anchor can never sit at or past it and
 * leave the rewound cursor unreachable. The search position is process-local; after a restart, anchor discovery
 * starts over from the stored log, which is correct.
 *
 * Every L1 block this class depends on is checked with three outcomes, not two: canonical, positively replaced, or
 * unreadable. An RPC exception, a provider behind the height and a pruned range all read as unreadable, and none of
 * them is evidence of a reorg. Unreadable therefore commits nothing, deletes nothing, logs no replacement and keeps
 * an in-flight recovery's search position; only a block that reads back with a different hash restarts recovery. For
 * the same reason a head reporting fewer messages than the local log is not truncated against while a syncpoint
 * above it is still canonical: that syncpoint certified the whole log at a higher block, so the shortfall is the
 * provider's view, not the chain's. When neither reading can settle the ambiguity the pass reports pending rather
 * than inventing evidence either way.
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
      nextCandidateIndex: recovery.nextCandidateIndex,
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
      const pinnedStatus = await this.checkL1Block(this.recovery.head);
      if (pinnedStatus === 'canonical') {
        return await this.continueRecovery();
      }
      if (pinnedStatus === 'unknown') {
        // The pinned head could not be read. That is a provider problem, not evidence its chain is gone: keep the
        // search position and its lookup progress and try again next pass.
        this.log.verbose(`Could not confirm the L1 head recovery is pinned to; keeping recovery progress`, {
          ...this.getRecoveryProgress(),
        });
        return pending();
      }
      this.log.warn(`L1 head ${this.recovery.head.l1BlockNumber} recovery was pinned to has been replaced`, {
        ...this.getRecoveryProgress(),
      });
      this.recovery = undefined;
    }

    const persistedSyncPoint = await this.stores.messages.getSynchedL1Block();
    const persistedCursor = await this.stores.messages.getScannedL1Block();
    const cursor = persistedCursor ?? this.l1Start;
    if (persistedSyncPoint !== undefined && sameL1Block(head, persistedSyncPoint)) {
      // The syncpoint only ever reaches a head once the log agrees with the Inbox there (a replacement batch ending
      // at the head is the canonical sequence through it), so finality may advance over the whole log. The deployment
      // block is not a syncpoint: nothing has compared the log with the Inbox there, so a head at it is compared like
      // any other rather than answered from the absence of a syncpoint.
      this.log.trace(`L1 to L2 messages already synced to L1 block ${head.l1BlockNumber}`);
      if (finalizedL1Block !== undefined) {
        await this.stores.messages.setMessageSyncState({ l1Block: head, authenticated: true, finalizedL1Block });
      }
      return synced();
    }

    // The Inbox's position at the captured head is the single point of comparison for this pass: a fetch bounded by
    // that head is never compared with a newer `latest` position, so a normal append cannot look like a reorg.
    const remote = await this.inbox.getState({ blockNumber: head.l1BlockNumber });
    const local = await this.stores.messages.getSyncedMessagePosition();
    if (positionMatches(local, remote)) {
      // The state was read by block number: only a head that is still canonical proves it was this head's.
      if ((await this.checkL1Block(head)) !== 'canonical') {
        this.log.verbose(`Could not confirm L1 head ${head.l1BlockNumber} after reading the Inbox state`);
        return pending();
      }
      await this.stores.messages.setMessageSyncState({ l1Block: head, authenticated: true, finalizedL1Block });
      return synced();
    }

    if (remote.totalMessagesInserted < local.totalMessageCount) {
      // A head shorter than the local log is ambiguous: the chain really did shorten, or this provider is behind the
      // one the log was certified against. A retained syncpoint above this head that is still canonical settles it as
      // lag, and lag must not delete messages or claim a lower head as synced.
      if (await this.isLaggedView(head, persistedSyncPoint)) {
        return pending();
      }
      // A shorter canonical sequence whose tip hash is our prefix hash at that count is a pure truncation; the tip
      // itself proves where it ends, so no old placement lookup is needed.
      const localAtRemote = await this.stores.messages.getMessagePosition(remote.totalMessagesInserted);
      if (localAtRemote !== undefined && localAtRemote.rollingHash.equals(remote.rollingHash)) {
        if ((await this.checkL1Block(head)) !== 'canonical') {
          this.log.verbose(
            `Could not confirm L1 head ${head.l1BlockNumber} after reading the Inbox state; ` + `not truncating`,
          );
          return pending();
        }
        return this.truncate(localAtRemote, head, finalizedL1Block);
      }
      return this.startRecovery(head, remote);
    }

    const ingestFrom = this.ingestionStartFor(cursor);
    if (head.l1BlockNumber < ingestFrom) {
      // A head below the first block still to be scanned, and the log does not agree with it: there is no forward
      // range to fetch, so find where the local log and the canonical one part ways.
      return this.startRecovery(head, remote);
    }

    // Forward ingestion inherits the scanned log as canonical, and the head batch's comparison then certifies that
    // inherited prefix. That is only sound while the cursor's block is still on the chain: after a reorg below it, the
    // messages read up to it may belong to a chain L1 no longer has, so the log has to be compared with the canonical
    // one instead.
    if (persistedCursor !== undefined) {
      const cursorStatus = await this.checkL1Block(persistedCursor);
      if (cursorStatus === 'unknown') {
        // Nothing was learned about the cursor's block, so the inherited prefix is neither proven nor disproven.
        // Fetching forward would inherit an unverified prefix and recovering would delete on no evidence: wait.
        this.log.verbose(`Could not confirm L1 block ${cursor.l1BlockNumber} the message log was scanned through`, {
          cursor,
          syncPoint: persistedSyncPoint,
          headL1BlockNumber: head.l1BlockNumber,
        });
        return pending();
      }
      if (cursorStatus === 'replaced') {
        this.log.warn(`L1 block ${cursor.l1BlockNumber} the message log was scanned through has been replaced`, {
          cursor,
          syncPoint: persistedSyncPoint,
          headL1BlockNumber: head.l1BlockNumber,
        });
        return this.startRecovery(head, remote);
      }
    }

    let headBatch: InboxMessage[];
    try {
      headBatch = await this.ingestForward(ingestFrom, head);
    } catch (err) {
      if (err instanceof CapturedHeadReplacedError) {
        this.log.verbose(`L1 head ${head.l1BlockNumber} was replaced while fetching L1 to L2 messages`);
        return pending();
      }
      if (err instanceof MessageStoreError) {
        this.log.warn(`Fetched L1 to L2 messages do not continue the local log: ${err.message}`, {
          inboxMessage: err.inboxMessage,
        });
        return this.startRecovery(head, remote);
      }
      throw err;
    }

    if ((await this.checkL1Block(head)) !== 'canonical') {
      // The chain may have moved under the fetch: the logs would then belong to another chain than the position they
      // are compared with, so neither the head batch nor a recovery is committed; the next pass reads a fresh head.
      this.log.verbose(`Could not confirm L1 head ${head.l1BlockNumber} after fetching L1 to L2 messages`);
      return pending();
    }
    const positionAfterHeadBatch =
      headBatch.length === 0 ? await this.stores.messages.getSyncedMessagePosition() : positionAfter(headBatch);
    if (positionMatches(positionAfterHeadBatch, remote)) {
      // The staged head batch continues the log and lands exactly on the Inbox's position: commit it with the head
      // as syncpoint in one transaction. A batch that does not chain onto the log is a reorg to recover from.
      try {
        await this.storeMessages(headBatch, { l1Block: head, authenticated: true, finalizedL1Block });
      } catch (err) {
        if (err instanceof MessageStoreError) {
          this.log.warn(`Head batch of L1 to L2 messages does not continue the local log: ${err.message}`, {
            inboxMessage: err.inboxMessage,
          });
          return this.startRecovery(head, remote);
        }
        throw err;
      }
      return synced();
    }
    return this.startRecovery(head, remote);
  }

  /**
   * Whether a head shorter than the local log is a lagged provider view rather than a real chain replacement.
   *
   * The syncpoint is the highest L1 block at which the whole stored log was found equal to the Inbox's own position.
   * If that block is above this head and still canonical, the chain did not shorten past it: the messages the head
   * appears to be missing are on the chain, and this provider simply has not reached them. Deleting them here would
   * throw away certified messages and prune the proposed blocks that consumed them, only for the next pass to fetch
   * them straight back.
   *
   * An unreadable syncpoint block is not treated as lag: without positive evidence the shorter head is handled by the
   * ordinary path, which authenticates whatever it retains.
   */
  private async isLaggedView(head: L1BlockId, syncPoint: L1BlockId | undefined): Promise<boolean> {
    if (syncPoint === undefined || syncPoint.l1BlockNumber <= head.l1BlockNumber) {
      return false;
    }
    if ((await this.checkL1Block(syncPoint)) !== 'canonical') {
      return false;
    }
    this.log.verbose(
      `L1 head ${head.l1BlockNumber} is behind the certified syncpoint at ${syncPoint.l1BlockNumber}, which is ` +
        `still canonical; keeping the message log and waiting for the provider to catch up`,
      { headL1BlockNumber: head.l1BlockNumber, syncPointL1BlockNumber: syncPoint.l1BlockNumber },
    );
    return true;
  }

  /**
   * First L1 block ordinary ingestion must read, given the scanned cursor.
   *
   * The cursor is exclusive, so fetching normally resumes at the block after it. The deployment block is the
   * exception: message index 0 can be emitted by a later transaction in that very block, and a cursor sitting at it
   * means nothing has read it yet — that is where the archiver starts with no persisted cursor, and where the
   * zero-anchor rollback rewinds to. Resuming one block later would skip index 0 permanently, since no later message
   * can fill the gap and every pass would rediscover the same disagreement. Only the deployment block is re-read;
   * genuine completed cursors keep exclusive semantics, and re-reading it is harmless because the store rewrites an
   * unchanged message in place.
   */
  private ingestionStartFor(cursor: L1BlockId): bigint {
    return cursor.l1BlockNumber <= this.l1Start.l1BlockNumber ? this.l1Start.l1BlockNumber : cursor.l1BlockNumber + 1n;
  }

  /**
   * Fetches messages forward in bounded L1 block ranges and commits each batch with the scanned cursor that covers
   * it, except for the batch reaching the head, which is returned staged instead of stored. No intermediate batch is
   * compared with the Inbox's position at its end block, so none of them may move the syncpoint: an incomplete
   * response would otherwise be certified by the mere identity of a canonical block, and a later head at that block
   * would take the same-head shortcut over a message L1 does hold. The caller commits the staged batch together with
   * the head as syncpoint once the log agrees with the Inbox there, which certifies the intermediate batches too.
   * Throws `MessageStoreError` when an intermediate batch does not continue the stored chain and
   * `CapturedHeadReplacedError` when the chain moved under a batch, leaving the earlier batches in place either way.
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
        // Logs and the batch-end block are read by number: only a head still canonical after both reads proves they
        // came from the captured chain, so a batch is never committed under a replacement chain's cursor.
        const l1Block = await this.l1BlockIdFor(end, head);
        if ((await this.checkL1Block(head)) !== 'canonical') {
          throw new CapturedHeadReplacedError(head);
        }
        await this.storeMessages(messages, { l1Block, authenticated: false });
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

  private async storeMessages(messages: InboxMessage[], syncState: MessageSyncState | undefined): Promise<void> {
    const timer = new Timer();
    await this.stores.messages.addL1ToL2Messages(messages, syncState);
    if (messages.length > 0) {
      this.onMessagesStored(messages.length, timer.ms() / messages.length);
      for (const message of messages) {
        this.log.debug(`Stored L1 to L2 message`, { ...message, leaf: message.leaf.toString() });
      }
    }
  }

  private async startRecovery(head: L1BlockId, remote: InboxContractState): Promise<InboxMessageSyncResult> {
    const local = await this.stores.messages.getSyncedMessagePosition();
    // Messages past the canonical count cannot be on the canonical chain at their index, so the search for a common
    // message starts at the canonical tip or the local one, whichever is lower.
    const lastCandidate = minBigint(local.totalMessageCount, remote.totalMessagesInserted) - 1n;
    this.recovery = {
      head,
      remote,
      nextCandidateIndex: lastCandidate < 0n ? undefined : lastCandidate,
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

  /**
   * Runs the anchor search and, once it settles on a prefix, commits the rollback to it. Returns `pending` either
   * way: a spent lookup budget resumes on the next pass, and a committed rollback leaves the refetch to ordinary
   * forward ingestion.
   */
  private async continueRecovery(): Promise<InboxMessageSyncResult> {
    const recovery = this.recovery!;
    const anchor = await this.searchAnchor(recovery);
    if (anchor === undefined) {
      return pending();
    }
    return await this.rollbackTo(anchor, recovery);
  }

  /**
   * Walks the local log backwards from the current candidate looking for a message L1 still emits at the same index
   * and hash, spending at most the per-pass lookup budget. Returns the prefix to roll back to, or undefined when the
   * budget ran out first. A message at or below the finalized L1 block is accepted without a lookup; a search that
   * runs out of candidates keeps nothing and starts again from the deployment block.
   */
  private async searchAnchor(recovery: RecoveryState): Promise<RecoveryAnchor | undefined> {
    // Only the finality marker persisted by the last sync that reached agreement with L1 is trusted here: a fresher
    // finalized height covers messages this node never verified against it, and trusting them would widen the
    // inherited shortcut to whatever the local log happens to hold.
    const finalizedL1Block = await this.stores.messages.getMessagesFinalizedL1Block();
    let lookups = 0;
    while (true) {
      const candidateIndex = recovery.nextCandidateIndex;
      if (candidateIndex === undefined) {
        this.log.warn(`No local L1 to L2 message is still on L1; replaying the Inbox from its deployment`, {
          headL1BlockNumber: recovery.head.l1BlockNumber,
          lookups: recovery.lookups,
        });
        return { keep: zeroMessagePosition(), anchorL1Block: this.l1Start.l1BlockNumber };
      }
      const candidate = await this.stores.messages.getL1ToL2Message(candidateIndex);
      if (candidate === undefined) {
        // The row the search expected is gone; nothing here knows what its rolling hash was, so report the position
        // with no expected value rather than the Inbox's tip hash, which belongs to a different count entirely.
        throw new InboxMessagePrefixChangedError(candidateIndex + 1n, undefined, undefined);
      }
      if (finalizedL1Block !== undefined && candidate.l1BlockNumber <= finalizedL1Block.l1BlockNumber) {
        this.log.info(`Anchoring L1 to L2 message recovery at finalized L1 block ${candidate.l1BlockNumber}`, {
          candidateIndex,
          l1BlockNumber: candidate.l1BlockNumber,
        });
        return { keep: positionAfter([candidate]), anchorL1Block: candidate.l1BlockNumber };
      }
      if (lookups >= this.opts.maxAnchorLookupsPerPass) {
        this.log.verbose(`L1 to L2 message anchor search paused after ${lookups} lookups`, this.getRecoveryProgress());
        return undefined;
      }
      lookups++;
      recovery.lookups++;
      // The lookup is bounded above by the captured head: an event only reachable past it would rewind the scanned
      // cursor to at or beyond the head, leaving the next pass with no forward range and re-entering recovery.
      const remoteMessage = await retrieveL1ToL2Message(this.inbox, candidate, recovery.head.l1BlockNumber);
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
        return { keep: positionAfter([candidate]), anchorL1Block: remoteMessage.l1BlockNumber };
      }
      // A miss near the old height says nothing about where the message is now; only an older candidate can anchor.
      this.log.debug(
        `L1 to L2 message ${candidate.index} not found unchanged near L1 block ${candidate.l1BlockNumber}`,
        {
          candidateIndex,
          remoteMessage,
        },
      );
      recovery.nextCandidateIndex = candidateIndex === 0n ? undefined : candidateIndex - 1n;
    }
  }

  /**
   * Commits the one conservative rollback a recovery makes: the log suffix after the anchor is deleted, the proposed
   * blocks that consumed more than the retained count are pruned with their descendants, the scanned cursor rewinds
   * to the block before the anchor's and the syncpoint is cleared, all in one store transaction. Nothing is fetched
   * here, so the prune this pass reports cannot be lost behind a later failed log request; the next ordinary forward
   * pass re-reads the anchor's block onwards, rewriting the retained rows in place and appending the canonical
   * suffix.
   */
  private async rollbackTo(anchor: RecoveryAnchor, recovery: RecoveryState): Promise<InboxMessageSyncResult> {
    const { head } = recovery;
    const local = await this.stores.messages.getSyncedMessagePosition();
    const cursor = await this.l1BlockIdFor(maxBigint(anchor.anchorL1Block - 1n, this.l1Start.l1BlockNumber), head);
    // The anchor event and the cursor block were both read by number: only a head still canonical after both reads
    // proves they came from the captured chain, so a rollback never commits against a replacement chain.
    const headStatus = await this.checkL1Block(head);
    if (headStatus !== 'canonical') {
      // A replaced head invalidates the anchor evidence, so the search starts over against the new view. An
      // unreadable one proves nothing: keep the recovery and its lookup progress and retry next pass.
      this.log.warn(`Could not confirm L1 head ${head.l1BlockNumber} during L1 to L2 message recovery`, {
        headStatus,
        ...this.getRecoveryProgress(),
      });
      if (headStatus === 'replaced') {
        this.recovery = undefined;
      }
      return pending();
    }
    this.log.warn(
      `Rolling local L1 to L2 messages back from ${local.totalMessageCount} to ${anchor.keep.totalMessageCount}`,
      {
        headL1BlockNumber: head.l1BlockNumber,
        keptCount: anchor.keep.totalMessageCount,
        localCount: local.totalMessageCount,
        anchorL1BlockNumber: anchor.anchorL1Block,
      },
    );
    const result = await this.updater.rollbackMessagesAndPruneProposedBlocks({
      keep: anchor.keep,
      // Unauthenticated on purpose: the retained prefix was never compared with the Inbox at the cursor's block, and
      // the log is missing everything the refetch is about to restore.
      syncState: { l1Block: cursor, authenticated: false },
    });
    this.recovery = undefined;
    return { status: 'pending', ...result };
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
    // The whole retained log was compared with the Inbox at the head, so unlike a recovery rollback this one may
    // certify the head, and finality may advance over it.
    const result = await this.updater.rollbackMessagesAndPruneProposedBlocks({
      keep,
      syncState: { l1Block: head, authenticated: true, finalizedL1Block },
    });
    return { status: 'synced', ...result };
  }

  private async l1BlockIdFor(l1BlockNumber: bigint, head: L1BlockId): Promise<L1BlockId> {
    if (l1BlockNumber === head.l1BlockNumber) {
      return head;
    }
    const block = await this.publicClient.getBlock({ blockNumber: l1BlockNumber, includeTransactions: false });
    return { l1BlockNumber, l1BlockHash: Buffer32.fromString(block.hash) };
  }

  /**
   * Whether an L1 block this pass depends on is still the one that was captured.
   *
   * An exception or a missing answer is `unknown`, not `replaced`: a provider that lags behind the height, is
   * temporarily unreachable, or answers a pruned range cannot distinguish a reorg from its own view. Treating that
   * as a replacement would delete messages and restart recovery on nothing more than an RPC failure, so callers keep
   * their pending work and retry instead. Only a block that reads back with a different hash is `replaced`.
   */
  private async checkL1Block(block: L1BlockId): Promise<L1BlockStatus> {
    let remote;
    try {
      remote = await this.publicClient.getBlock({ blockNumber: block.l1BlockNumber, includeTransactions: false });
    } catch (err) {
      this.log.debug(`Could not read L1 block ${block.l1BlockNumber} to confirm it is still canonical: ${err}`);
      return 'unknown';
    }
    if (remote?.hash === undefined || remote.hash === null) {
      this.log.debug(`L1 block ${block.l1BlockNumber} was returned without a hash; canonicality is unknown`);
      return 'unknown';
    }
    return Buffer32.fromString(remote.hash).equals(block.l1BlockHash) ? 'canonical' : 'replaced';
  }
}

/**
 * Whether a captured L1 block is still the canonical one at its height, was positively replaced, or could not be
 * read. `unknown` is deliberately not merged into `replaced`: only the latter is evidence of a chain replacement.
 */
type L1BlockStatus = 'canonical' | 'replaced' | 'unknown';

/** The L1 head a sync pass was captured against is no longer canonical; the pass's uncommitted work is discarded. */
class CapturedHeadReplacedError extends Error {
  constructor(head: L1BlockId) {
    super(`L1 head ${head.l1BlockNumber} (${head.l1BlockHash.toString()}) was replaced during message sync`);
    this.name = 'CapturedHeadReplacedError';
  }
}

function sameL1Block(a: L1BlockId, b: L1BlockId): boolean {
  return a.l1BlockNumber === b.l1BlockNumber && a.l1BlockHash.equals(b.l1BlockHash);
}

/** The message position the log ends at once `messages`, a non-empty batch, is its tail. */
function positionAfter(messages: InboxMessage[]): InboxMessagePosition {
  const last = messages.at(-1)!;
  return { totalMessageCount: last.index + 1n, rollingHash: last.inboxRollingHash };
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
