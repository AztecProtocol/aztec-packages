import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { type AztecNode, waitForTx } from '@aztec/aztec.js/node';
import { SecretValue } from '@aztec/foundation/config';

import { jest } from '@jest/globals';
import { privateKeyToAccount } from 'viem/accounts';

import { PIPELINING_SETUP_OPTS } from './fixtures/fixtures.js';
import { getPrivateKeyFromIndex, setup } from './fixtures/utils.js';
import { submitTxsTo } from './shared/submit-transactions.js';
import type { TestWallet } from './test-wallet/test_wallet.js';

jest.setTimeout(1000 * 60 * 10);

// Verifies that the production sequencer (prod seq, PIPELINING_SETUP_OPTS: ethereumSlotDuration=4s,
// aztecSlotDuration=12s, minTxsPerBlock=0) can produce multiple blocks with batches of transactions
// in real wall-time (no automine). Exercises the proposer pipelining path with a pre-registered
// validator (initialValidators) that matches the publisher private key.
describe('e2e_l1_with_wall_time', () => {
  let logger: Logger;
  let teardown: () => Promise<void>;
  let wallet: TestWallet;
  let aztecNode: AztecNode;
  let defaultAccountAddress: AztecAddress;

  const deploymentsPerBlock = 8;
  const numberOfBlocks = 4;

  beforeEach(async () => {
    const privateKey = `0x${getPrivateKeyFromIndex(0)!.toString('hex')}` as `0x${string}`;
    const account = privateKeyToAccount(privateKey);
    const initialValidators = [
      {
        attester: EthAddress.fromString(account.address),
        withdrawer: EthAddress.fromString(account.address),
        privateKey,
        bn254SecretKey: new SecretValue(Fr.random().toBigInt()),
      },
    ];

    // Don't pass ethereumSlotDuration explicitly — the env default is 12s, which would clash with
    // the fixture's pipelining override (aztecSlotDuration=12, ethereumSlotDuration=4). With both at
    // 12s the pipelined timing model can't fit propose+attest+publish in one Aztec slot and txs
    // get dropped from the mempool. Let the fixture pick its pipelining-aware defaults.
    ({
      teardown,
      logger,
      wallet,
      aztecNode,
      accounts: [defaultAccountAddress],
    } = await setup(1, { ...PIPELINING_SETUP_OPTS, initialValidators }));
  });

  afterEach(() => teardown?.());

  // Submits deploymentsPerBlock txs in 4 sequential rounds, waits for each batch to be mined,
  // and asserts all tx hashes are eventually confirmed.
  it('should produce blocks with a bunch of transactions', async () => {
    for (let i = 0; i < numberOfBlocks; i++) {
      const txHashes = await submitTxsTo(wallet, defaultAccountAddress, deploymentsPerBlock, logger);
      // REFACTOR: Promise.all over individual waitForTx calls; a waitForTxs batch helper would
      // consolidate this into a single polling loop.
      await Promise.all(
        txHashes.map((hash, j) => {
          logger.info(`Waiting for tx ${i}-${j}: ${hash.toString()} to be mined`);
          return waitForTx(aztecNode, hash);
        }),
      );
    }
  });
});
