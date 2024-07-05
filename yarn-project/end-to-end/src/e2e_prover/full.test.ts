import { type Fr, Tx } from '@aztec/aztec.js';
import { writeFile, mkdtemp } from 'fs/promises';
import { getTestData, isGenerateTestDataEnabled, writeTestData } from '@aztec/foundation/testing';
import * as fs from 'fs';

import { FullProverTest } from './e2e_prover_test.js';
import { runInDirectory } from '@aztec/foundation/fs';
import path from 'path';
import { BB_RESULT, generateTubeProof } from '../../../bb-prover/src/bb/execute.js';
import { tmpdir } from 'os';

const TIMEOUT = 1_800_000;

// This makes AVM proving throw if there's a failure.
process.env.AVM_PROVING_STRICT = '1';
// Enable proving the full lookup tables (no truncation).
process.env.AVM_ENABLE_FULL_PROVING = '1';

describe('full_prover', () => {
  const t = new FullProverTest('full_prover', 2);
  let { provenAssets, accounts, tokenSim, logger } = t;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyMintSnapshot();
    await t.setup();
    // TODO(https://github.com/AztecProtocol/aztec-packages/issues/7373) deploy honk solidity verifier
    // await t.deployVerifier();
    ({ provenAssets, accounts, tokenSim, logger } = t);
  });

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  it.skip(
    'makes both public and private transfers',
    async () => {
      logger.info(
        `Starting test using function: ${provenAssets[0].address}:${provenAssets[0].methods.balance_of_private.selector}`,
      );

      const privateBalance = await provenAssets[0].methods.balance_of_private(accounts[0].address).simulate();
      const privateSendAmount = privateBalance / 2n;
      expect(privateSendAmount).toBeGreaterThan(0n);
      const privateInteraction = provenAssets[0].methods.transfer(accounts[1].address, privateSendAmount);

      const publicBalance = await provenAssets[1].methods.balance_of_public(accounts[0].address).simulate();
      const publicSendAmount = publicBalance / 2n;
      expect(publicSendAmount).toBeGreaterThan(0n);
      const publicInteraction = provenAssets[1].methods.transfer_public(
        accounts[0].address,
        accounts[1].address,
        publicSendAmount,
        0,
      );

      const sentPrivateTx = privateInteraction.send({ skipPublicSimulation: true });
      const sentPublicTx = publicInteraction.send({ skipPublicSimulation: true });
      await Promise.all([
        sentPrivateTx.wait({ timeout: 1200, interval: 10 }),
        sentPublicTx.wait({ timeout: 1200, interval: 10 }),
      ]);
      tokenSim.transferPrivate(accounts[0].address, accounts[1].address, privateSendAmount);
      tokenSim.transferPublic(accounts[0].address, accounts[1].address, publicSendAmount);

      if (isGenerateTestDataEnabled()) {
        const blockResults = getTestData('blockResults');
        // the first blocks were setup blocks with fake proofs
        // the last block is the one that was actually proven to the end
        const blockResult: any = blockResults.at(-1);

        if (!blockResult) {
          // fail the test. User asked for fixtures but we don't have any
          throw new Error('No block result found in test data');
        }

        writeTestData(
          'yarn-project/end-to-end/src/fixtures/dumps/block_result.json',
          JSON.stringify({
            block: blockResult.block.toString(),
            proof: blockResult.proof.toString(),
            aggregationObject: blockResult.aggregationObject.map((x: Fr) => x.toString()),
          }),
        );
      }
    },
    TIMEOUT,
  );

  // LONDONTODO: Does this still pass?
  it('rejects txs with invalid proofs', async () => {
    const privateInteraction = t.fakeProofsAsset.methods.transfer(accounts[1].address, 1);
    const publicInteraction = t.fakeProofsAsset.methods.transfer_public(accounts[0].address, accounts[1].address, 1, 0);

    const sentPrivateTx = privateInteraction.send();
    const sentPublicTx = publicInteraction.send();

    const results = await Promise.allSettled([
      sentPrivateTx.wait({ timeout: 10, interval: 0.1 }),
      sentPublicTx.wait({ timeout: 10, interval: 0.1 }),
    ]);

    expect(String((results[0] as PromiseRejectedResult).reason)).toMatch(/Tx dropped by P2P node/);
    expect(String((results[1] as PromiseRejectedResult).reason)).toMatch(/Tx dropped by P2P node/);
  });
});
