import { NO_FROM } from '@aztec/aztec.js/account';
import { createLogger } from '@aztec/aztec.js/log';
import { retryUntil } from '@aztec/foundation/retry';

import { type EndToEndContext, setup } from './fixtures/utils.js';
import { proveInteraction } from './test-wallet/utils.js';

describe('e2e_genesis_timestamp', () => {
  let context: EndToEndContext;

  const logger = createLogger('e2e:genesis_timestamp');

  beforeAll(async () => {
    // Skip account deployment and prevent the sequencer from mining empty blocks.
    context = await setup(0, {
      skipAccountDeployment: true,
      minTxsPerBlock: 1,
    });
  });

  afterAll(() => context.teardown());

  it('can include genesis-anchored tx in a block after block 1', async () => {
    const { wallet, aztecNode, aztecNodeAdmin, initialFundedAccounts } = context;

    // We're at block 0 -- no blocks have been mined yet.
    expect(await aztecNode.getBlockNumber()).toBe(0);

    // Step 1: Prove the account deploy tx while PXE is still anchored to genesis (block 0).
    const { secret, salt, signingKey } = initialFundedAccounts[0];
    const accountManager = await wallet.createSchnorrAccount(secret, salt, signingKey);
    const deployMethod = await accountManager.getDeployMethod();
    const provenTx = await proveInteraction(wallet, deployMethod, {
      from: NO_FROM,
      skipClassPublication: true,
    });

    // Verify the tx is anchored to block 0 (genesis).
    const anchorBlockNumber = provenTx.data.constants.anchorBlockHeader.globalVariables.blockNumber;
    expect(anchorBlockNumber).toBe(0);
    logger.info('Proved genesis-anchored deploy tx');

    // Step 2: Mine an empty block to advance past genesis.
    await aztecNodeAdmin.setConfig({ minTxsPerBlock: 0 });
    await retryUntil(async () => (await aztecNode.getBlockNumber()) >= 1, 'wait for block >= 1', 60);
    await retryUntil(async () => (await aztecNode.getCheckpointNumber()) >= 1, 'wait for checkpoint >= 1', 60);
    logger.info(`Block number before sending tx: ${await aztecNode.getBlockNumber()}`);

    // Step 3: Prevent further empty blocks so the next block only mines when our tx arrives.
    await aztecNodeAdmin.setConfig({ minTxsPerBlock: 1 });

    // Step 4: Send the genesis-anchored proven tx. It should land in a block after block 1.
    const receipt = await provenTx.send();
    logger.info(`Tx mined in block ${receipt.blockNumber}`);

    // The tx landed after block 1, proving that genesis-anchored transactions
    // are valid beyond the first block when the genesis has a non-zero timestamp.
    expect(receipt.blockNumber).toBeGreaterThan(1);
  }, 120_000);
});
