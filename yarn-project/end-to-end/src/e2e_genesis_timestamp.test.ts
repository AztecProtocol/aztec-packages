import { generateSchnorrAccounts } from '@aztec/accounts/testing';
import { NO_FROM } from '@aztec/aztec.js/account';
import { createLogger } from '@aztec/aztec.js/log';
import { retryUntil } from '@aztec/foundation/retry';

import { AUTOMINE_E2E_OPTS } from './fixtures/fixtures.js';
import { type EndToEndContext, setup } from './fixtures/utils.js';
import { proveInteraction } from './test-wallet/utils.js';

// Verifies that genesis-anchored transactions (proved while PXE is pinned to block 0) can be
// included in blocks after block 1, and that PXE can prove transactions anchored to genesis even
// after the chain has advanced (public data tree diverged). Uses AUTOMINE_E2E_OPTS with
// advancePastGenesis=false, two deployable accounts in additionallyFundedAccounts, and pxe
// syncChainTip='proven' so the anchor stays at genesis until a real proof lands, which never happens
// in these tests (no prover node running). (v5: replaced skipAccountDeployment with
// advancePastGenesis=false + explicit additionallyFundedAccounts.)
describe('e2e_genesis_timestamp', () => {
  let context: EndToEndContext;

  const logger = createLogger('e2e:genesis_timestamp');

  beforeEach(async () => {
    // Configure PXE to sync its anchor only to proven blocks so its
    // anchor lags behind proposed blocks. Under AUTOMINE_E2E_OPTS the AnvilTestWatcher is disabled
    // and the AutomineSequencer never marks blocks as proven on its own, so without a prover node
    // the proven tip stays at genesis for the duration of the test.
    context = await setup(
      0,
      {
        ...AUTOMINE_E2E_OPTS,
        // This suite pins the proven tip at genesis (no prover node, syncChainTip:'proven',
        // advancePastGenesis:false) and asserts on genesis-anchored txs. Mining the L1 setup txs
        // instantly shifts how far L1 time advances past the rollup genesis during deployment, which
        // breaks those genesis-anchoring assumptions, so keep L1 setup on the anvil block interval.
        automineL1Setup: false,
        advancePastGenesis: false,
        // This test proves genesis-anchored account deployment txs, so it needs deployable accounts
        additionallyFundedAccounts: await generateSchnorrAccounts(2, 'schnorr'),
      },
      { syncChainTip: 'proven' },
    );
  });

  afterEach(() => context.teardown());

  // Creates and proves a tx, and asserts it's anchored to the genesis block
  const proveTxAnchoredToGenesis = async (accountIndex = 0) => {
    const { wallet, additionallyFundedAccounts } = context;
    const { secret, salt, signingKey } = additionallyFundedAccounts[accountIndex];
    const accountManager = await wallet.createSchnorrAccount(secret, salt, signingKey);
    const deployMethod = await accountManager.getDeployMethod();
    const provenTx = await proveInteraction(wallet, deployMethod, {
      from: NO_FROM,
      skipClassPublication: true,
      additionalScopes: [accountManager.address],
    });

    const anchorBlockNumber = provenTx.data.constants.anchorBlockHeader.globalVariables.blockNumber;
    expect(anchorBlockNumber).toBe(0);
    logger.info(`Proved genesis-anchored deploy tx for account ${accountIndex}`);
    return provenTx;
  };

  const awaitBlockCheckpointed = async () => {
    const { aztecNode } = context;
    // REFACTOR: hand-rolled retryUntil polling on block number and checkpoint number; a helper like
    // waitForBlockNumber / waitForCheckpointNumber would replace both calls.
    await retryUntil(async () => (await aztecNode.getBlockNumber()) >= 1, 'wait for block >= 1', 60);
    await retryUntil(async () => (await aztecNode.getCheckpointNumber()) >= 1, 'wait for checkpoint >= 1', 60);
    logger.info(`Block number after advancing: ${await aztecNode.getBlockNumber()}`);
  };

  // Proves an account-deploy tx while at block 0, mines an empty block via mineBlock(), then
  // sends the genesis-anchored proven tx and asserts it lands after block 1.
  it('can include genesis-anchored tx in a block after block 1', async () => {
    const { aztecNode } = context;

    // We're at block 0 -- no blocks have been mined yet.
    expect(await aztecNode.getBlockNumber()).toBe(0);

    // Step 1: Prove the account deploy tx while PXE is still anchored to genesis (block 0).
    const provenTx = await proveTxAnchoredToGenesis();

    // Step 2: Mine an empty block to advance past genesis. Under AUTOMINE_E2E_OPTS the sequencer
    // only mines on tx submission or explicit `mineBlock()`, so we drive it directly here.
    await aztecNode.mineBlock();
    await awaitBlockCheckpointed();

    // Step 3: Send the genesis-anchored proven tx. It should land in a block after block 1.
    const receipt = await provenTx.send();
    logger.info(`Tx mined in block ${receipt.blockNumber}`);

    // The tx landed after block 1, proving that genesis-anchored transactions
    // are valid beyond the first block when the genesis has a non-zero timestamp.
    expect(receipt.blockNumber).toBeGreaterThan(1);
  }, 300_000);

  // Regression for an issue where PXE failed to prove txs while anchored to block zero
  // if there were new blocks mined that modified the public data tree.
  // Sends a first genesis-anchored account deploy (modifies public data tree), then proves and
  // sends a second genesis-anchored deploy for a different account and asserts it also lands.
  it('can generate genesis-anchored tx after chain advances when PXE anchor is pinned to zero', async () => {
    const { aztecNode } = context;

    // We're at block 0 -- no blocks have been mined yet.
    expect(await aztecNode.getBlockNumber()).toBe(0);

    // Step 1: Prove and send a first genesis-anchored account deploy. This deploy publishes the
    // contract instance to the public registry and pays fee juice, both of which modify the
    // public data tree. Once this tx lands the node advances past genesis with real public-data
    // changes (not an empty block).
    const firstProvenTx = await proveTxAnchoredToGenesis(0);
    const firstReceipt = await firstProvenTx.send();
    logger.info(`First genesis-anchored deploy mined in block ${firstReceipt.blockNumber}`);
    expect(firstReceipt.blockNumber).toBeGreaterThanOrEqual(1);

    // Wait for the PXE to observe the new block so it syncs its notes/state to the tip, but the
    // anchor itself should stay pinned to genesis because syncChainTip='proven' is set and no
    // prover is marking blocks as proven.
    await awaitBlockCheckpointed();

    // Step 2: Prove a second genesis-anchored account deploy for a different funded account.
    // PXE's anchor is still genesis (block 0) because syncChainTip='proven' only advances the
    // anchor when an epoch is proven on L1, and no prover node is running in this test. The
    // public data tree, however, has diverged from genesis (thanks to the first deploy).
    const secondProvenTx = await proveTxAnchoredToGenesis(1);

    // Step 3: Send the genesis-anchored proven tx
    const secondReceipt = await secondProvenTx.send();
    logger.info(`Second genesis-anchored deploy mined in block ${secondReceipt.blockNumber}`);
    expect(secondReceipt.blockNumber).toBeDefined();
    expect(secondReceipt.blockNumber!).toBeGreaterThan(firstReceipt.blockNumber!);
  }, 400_000);
});
