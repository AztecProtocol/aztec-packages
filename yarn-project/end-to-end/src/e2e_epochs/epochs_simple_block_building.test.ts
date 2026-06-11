import type { AztecNodeService } from '@aztec/aztec-node';
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { EthAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { waitForTx } from '@aztec/aztec.js/node';
import type { Operator } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import { asyncMap } from '@aztec/foundation/async-map';
import { times, timesAsync } from '@aztec/foundation/collection';
import { SecretValue } from '@aztec/foundation/config';
import { bufferToHex } from '@aztec/foundation/string';
import { executeTimeout } from '@aztec/foundation/timer';
import type { TestContract } from '@aztec/noir-test-contracts.js/Test';

import { jest } from '@jest/globals';
import { privateKeyToAccount } from 'viem/accounts';

import { type EndToEndContext, getPrivateKeyFromIndex } from '../fixtures/utils.js';
import { proveInteraction } from '../test-wallet/utils.js';
import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 10);

const NODE_COUNT = 3;
const TX_COUNT = 8;

// Sets up a lightweight RPC-only node without any account deployment, registers a test contract
// locally, then spawns NODE_COUNT validator nodes connected via a mocked gossip sub network.
// Mines N txs across N blocks, checking that no sequencer errors occur during block building.
describe('e2e_epochs/epochs_simple_block_building', () => {
  let context: EndToEndContext;
  let logger: Logger;

  let test: EpochsTestContext;
  let validators: (Operator & { privateKey: `0x${string}` })[];
  let nodes: AztecNodeService[];
  let contract: TestContract;
  let from: AztecAddress;

  beforeEach(async () => {
    validators = times(NODE_COUNT, i => {
      const privateKey = bufferToHex(getPrivateKeyFromIndex(i + 3)!);
      const attester = EthAddress.fromString(privateKeyToAccount(privateKey).address);
      return { attester, withdrawer: attester, privateKey, bn254SecretKey: new SecretValue(Fr.random().toBigInt()) };
    });

    // Setup context with no initial sequencer (lightweight RPC-only node).
    // The hardcoded account is funded via genesis without needing on-chain deployment.
    test = await EpochsTestContext.setup({
      numberOfAccounts: 0,
      initialValidators: validators,
      mockGossipSubNetwork: true,
      aztecProofSubmissionEpochs: 1024,
      aztecSlotDurationInL1Slots: 3,
      ethereumSlotDuration: 12,
      blockDurationMs: 6000,
      startProverNode: false,
      skipInitialSequencer: true,
      inboxLag: 2,
    });

    ({ context, logger } = test);
    from = context.accounts[0]; // auto-created by setup

    // Register test contract locally for sending txs (no on-chain deployment needed).
    contract = await test.registerTestContract(context.wallet);

    // Start the validator nodes.
    logger.warn(`Initial setup complete. Starting ${NODE_COUNT} validator nodes.`);
    nodes = await asyncMap(validators, ({ privateKey }) =>
      test.createValidatorNode([privateKey], { minTxsPerBlock: 1, maxTxsPerBlock: 1 }),
    );
    logger.warn(`Test setup completed.`, { validators: validators.map(v => v.attester.toString()) });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  it('builds blocks without any errors', async () => {
    const sequencers = nodes.map(node => node.getSequencer()!);
    const { failEvents } = test.watchSequencerEvents(sequencers, i => ({ validator: validators[i].attester }));

    // Create and submit txs from the hardcoded account. Each tx emits a unique
    // nullifier, which is enough side-effect to produce a non-empty block.
    const txs = await timesAsync(TX_COUNT, _i =>
      proveInteraction(context.wallet, contract.methods.emit_nullifier(Fr.random()), { from }),
    );
    const txHashes = await Promise.all(txs.map(tx => tx.send({ wait: NO_WAIT })));
    logger.warn(`Sent ${txHashes.length} transactions`, {
      txs: txHashes,
    });

    // Wait until all txs are mined
    const timeout = test.L2_SLOT_DURATION_IN_S * (TX_COUNT * 2 + 1);
    await executeTimeout(
      () => Promise.all(txHashes.map(txHash => waitForTx(context.aztecNode, txHash, { timeout }))),
      timeout * 1000,
    );
    logger.warn(`All txs have been mined`);

    // Expect no failures from sequencers during block building
    test.assertNoFailuresFromSequencers(failEvents);
  });
});
