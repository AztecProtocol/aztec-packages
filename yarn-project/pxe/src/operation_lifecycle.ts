import type { Logger } from '@aztec/foundation/log';
import { allToCompletion } from '@aztec/foundation/promise';

import type { ChangeSetId, StagedWriteCoordinator } from './storage/staged_write_coordinator.js';

/**
 * Contributes work to every synced operation (e.g. writes into its change set). The operation waits for a
 * contributor's work to settle before deciding its change set, and informs it of the outcome.
 */
export interface OperationContributor {
  /**
   * Waits for any work the contributor still has in flight. Awaited before the operation's change set is decided, so
   * that no contributor is still writing when it is committed or discarded. A rejection causes the operation to
   * discard instead of commit.
   */
  settle?(changeSetId: ChangeSetId): Promise<void>;

  /**
   * Called once the operation's change set has been committed or discarded. A throw is logged and swallowed: the outcome is
   * already decided by this point, so it cannot change it.
   */
  onOperationEnd(changeSetId: ChangeSetId, outcome: 'committed' | 'discarded'): void;
}

/**
 * Runs `fn` as the operation's work and decides its change set.
 *
 * On success:
 * 1. Waits for every contributor to settle. A rejection vetoes the commit and the failure path below runs instead.
 * 2. Commits the change set.
 * 3. Notifies contributors of the outcome.
 *
 * On failure:
 * 1. Drains contributors, logging failures instead of propagating them so the discard runs to completion and the
 *    error that aborted the operation is not masked.
 * 2. Aborts the change set.
 * 3. Notifies contributors of the outcome.
 * 4. Rethrows.
 */
export async function runOperation<T>(args: RunOperationArgs, fn: () => Promise<T>): Promise<T> {
  const { stagedWriteCoordinator, contributors, changeSetId, log } = args;
  try {
    const result = await fn();

    // Settling must stay outside the commit transaction: it can take arbitrarily long.
    await allToCompletion(contributors.map(contributor => contributor.settle?.(changeSetId)));
    log.verbose(`Committing operation ${changeSetId}`, { changeSetId });

    await stagedWriteCoordinator.commit(changeSetId);
    notifyOperationEnd(args, 'committed');
    return result;
  } catch (err) {
    log.verbose(`Aborting operation ${changeSetId}`, { changeSetId });
    await settleContributorsLoggingFailures(args);
    try {
      stagedWriteCoordinator.abort(changeSetId);
    } catch (abortErr) {
      // Nothing here can undo a failed abort, so it is logged, but the error that ended the operation is the one
      // reported.
      log.error(`Failed to abort operation ${changeSetId}`, abortErr, { changeSetId });
    }
    notifyOperationEnd(args, 'discarded');
    throw err;
  }
}

function notifyOperationEnd(
  { contributors, changeSetId, log }: RunOperationArgs,
  outcome: 'committed' | 'discarded',
): void {
  for (const contributor of contributors) {
    // The change set has already been decided at this point, so a failed notification must not turn a committed
    // operation into a rejected one, nor mask the error that caused a discard.
    try {
      contributor.onOperationEnd(changeSetId, outcome);
    } catch (err) {
      log.warn(`Contributor failed to handle the end of operation ${changeSetId}`, { changeSetId, outcome, err });
    }
  }
}

async function settleContributorsLoggingFailures({ contributors, changeSetId, log }: RunOperationArgs): Promise<void> {
  await allToCompletion(
    contributors.map(contributor =>
      contributor.settle?.(changeSetId).catch(err => {
        log.warn(`Contributor failed to settle while discarding operation ${changeSetId}`, { changeSetId, err });
      }),
    ),
  );
}

/** What {@link runOperation} needs to decide an operation's change set. */
type RunOperationArgs = {
  stagedWriteCoordinator: StagedWriteCoordinator;
  contributors: OperationContributor[];
  /** The change set the operation's writes are staged under, from {@link StagedWriteCoordinator.begin}. */
  changeSetId: ChangeSetId;
  log: Logger;
};
