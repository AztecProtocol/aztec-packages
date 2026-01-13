import { AztecNodeService } from '@aztec/aztec-node';
/**
 * Re-exports from the unified setup module for backward compatibility.
 * Tests that previously used snapshot_manager.ts should continue to work.
 */
import type { Logger } from '@aztec/aztec.js/log';
import type { AnvilTestWatcher } from '@aztec/aztec/testing';
import type { DeployAztecL1ContractsArgs } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import type { TestDateProvider } from '@aztec/foundation/timer';
import type { SequencerClient } from '@aztec/sequencer-client';

import type { Anvil } from '@viem/anvil';

import {
  type EndToEndContext,
  type SetupOptions,
  deployAccounts,
  getLogger,
  getPrivateKeyFromIndex,
  publicDeployAccounts,
  setup,
  setupSharedBlobStorage,
  teardown as teardownContext,
} from './setup.js';

// Re-export types and functions
export { deployAccounts, getLogger, getPrivateKeyFromIndex, publicDeployAccounts, setup, setupSharedBlobStorage };
export type { EndToEndContext, SetupOptions };

/**
 * Backward-compatible context type for tests that used the old snapshot_manager.
 * This type narrows the optional fields to non-optional for tests that always run locally.
 */
export type SubsystemsContext = Omit<
  EndToEndContext,
  'anvil' | 'aztecNode' | 'dateProvider' | 'watcher' | 'sequencer'
> & {
  anvil: Anvil;
  aztecNode: AztecNodeService;
  dateProvider: TestDateProvider;
  watcher: AnvilTestWatcher;
  sequencer: SequencerClient;
};

/**
 * Backward-compatible wrapper for setupFromFresh.
 * The old signature was: setupFromFresh(logger, opts, deployL1ContractsArgs)
 * This wrapper maps it to the new setup function.
 */
export async function setupFromFresh(
  _logger: Logger, // Logger is ignored - setup creates its own
  opts: SetupOptions = {},
  deployL1ContractsArgs: Partial<DeployAztecL1ContractsArgs> = { initialValidators: [] },
): Promise<SubsystemsContext> {
  // Map old parameters to new setup options
  const mergedOpts: SetupOptions = {
    ...opts,
    // Merge l1ContractsArgs from both sources
    l1ContractsArgs: {
      ...deployL1ContractsArgs,
      ...opts.l1ContractsArgs,
    },
    // The old setupFromFresh funded the sponsored FPC by default
    fundSponsoredFPC: opts.fundSponsoredFPC ?? true,
    // The old setupFromFresh didn't deploy accounts during setup
    skipAccountDeployment: opts.skipAccountDeployment ?? true,
    // Pass through slasher flavor
    slasherFlavor: opts.slasherFlavor ?? deployL1ContractsArgs.slasherFlavor ?? 'none',
    // Don't pass aztecTargetCommitteeSize to setup - P2P tests handle committee setup via applyBaseSetup()
    // which adds validators and advances time. The unified setup also advances time when aztecTargetCommitteeSize > 0,
    // which would cause double time advancement if we passed it through here.
    aztecTargetCommitteeSize: 0,
  };

  // Call the unified setup with 0 accounts (old behavior was to not deploy accounts)
  const context = await setup(0, mergedOpts);

  // Validate that required fields are defined (setupFromFresh always runs locally)
  if (!context.anvil) {
    throw new Error('setupFromFresh requires anvil to be running');
  }
  if (!context.aztecNodeService) {
    throw new Error('setupFromFresh requires aztecNodeService to be defined');
  }
  if (!context.dateProvider) {
    throw new Error('setupFromFresh requires dateProvider to be defined');
  }
  if (!context.watcher) {
    throw new Error('setupFromFresh requires watcher to be defined');
  }
  if (!context.sequencer) {
    throw new Error('setupFromFresh requires sequencer to be defined');
  }

  // Return with narrowed types
  return {
    ...context,
    anvil: context.anvil,
    aztecNode: context.aztecNodeService,
    dateProvider: context.dateProvider,
    watcher: context.watcher,
    sequencer: context.sequencer,
  };
}

/**
 * Destroys the current context.
 */
export async function teardown(context: SubsystemsContext | EndToEndContext | undefined) {
  await teardownContext(context as EndToEndContext | undefined);
}
