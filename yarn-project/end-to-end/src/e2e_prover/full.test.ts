import { type Fr, Tx } from '@aztec/aztec.js';
import { writeFile, mkdtemp } from 'fs/promises';
import { getTestData, isGenerateTestDataEnabled, writeTestData } from '@aztec/foundation/testing';
import * as fs from 'fs';


// LONDONTODO(Client): PXE created via the import below. Real proving turned on therein
import { FullProverTest } from './e2e_prover_test.js';
import { runInDirectory } from '@aztec/foundation/fs';
import path from 'path';
import { BB_RESULT, generateTubeProof } from '../../../bb-prover/src/bb/execute.js';
import { tmpdir } from 'os';

const TIMEOUT = 1_800_000;

describe('full_prover', () => {
  const t = new FullProverTest('full_prover', 2);
  let { provenAssets, accounts, tokenSim, logger } = t;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyMintSnapshot();
    await t.setup();
    // await t.deployVerifier();
    ({ provenAssets, accounts, tokenSim, logger } = t);
  });

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  // LONDONTODO(Client): Revert this to full
  it(
    'makes both public and private transfers',
    async () => {
      logger.info(
        `Starting test using function: ${provenAssets[0].address}:${provenAssets[0].methods.balance_of_private.selector}`,
      );

      const privateBalance = await provenAssets[0].methods.balance_of_private(accounts[0].address).simulate();
      const privateSendAmount = privateBalance / 2n;
      expect(privateSendAmount).toBeGreaterThan(0n);
      const privateInteraction = provenAssets[0].methods.transfer(
        accounts[0].address,
        accounts[1].address,
        privateSendAmount,
        0,
      );

      const publicBalance = await provenAssets[1].methods.balance_of_public(accounts[0].address).simulate();
      const publicSendAmount = publicBalance / 2n;
      expect(publicSendAmount).toBeGreaterThan(0n);
      const publicInteraction = provenAssets[1].methods.transfer_public(
        accounts[0].address,
        accounts[1].address,
        publicSendAmount,
        0,
      );

      const cachedPrivateTxPath = '../../../e2e_private.tx';
      const privateTxBuffer = fs.existsSync(cachedPrivateTxPath) ? fs.readFileSync(cachedPrivateTxPath) : undefined;
      const privateTx = await privateInteraction.prove({ isPrivate: true, cachedTxBuffer: privateTxBuffer });
      const cachedPublicTxPath = '../../../e2e_public.tx';
      const publicTxBuffer = fs.existsSync(cachedPublicTxPath) ? fs.readFileSync(cachedPublicTxPath) : undefined;
      const publicTx = await publicInteraction.prove({ isPrivate: false, cachedTxBuffer: publicTxBuffer });

      // This will recursively verify all app and kernel circuits involved in the private stage of this transaction!
      logger.info(`Verifying kernel tail to public proof`);
      await expect(t.circuitProofVerifier?.verifyProof(publicTx)).resolves.not.toThrow();

      // This will recursively verify all app and kernel circuits involved in the private stage of this transaction!
      logger.info(`Verifying private kernel tail proof`);
      await expect(t.circuitProofVerifier?.verifyProof(privateTx)).resolves.not.toThrow();
      const bbPath = path.resolve('../../barretenberg/cpp/build/bin/bb');
      const bbWorkingDirectory = await mkdtemp(path.join(tmpdir(), 'bb-'));
      await runInDirectory(bbWorkingDirectory, async (dir: string) => {
        await privateTx.clientIvcProof!.writeToOutputDirectory(dir);
        const result = await generateTubeProof(bbPath, dir, logger.info)
        logger.info(`tube result: ${result.status}`);
        if (result.status == BB_RESULT.FAILURE) {
          logger.info(`tube result: ${result.reason}`);
        }
        expect(result.status).toBe(BB_RESULT.SUCCESS)
      });

      const sentPrivateTx = privateInteraction.send();
      const sentPublicTx = publicInteraction.send();
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

  it.skip('rejects txs with invalid proofs', async () => {
    const privateInteraction = t.fakeProofsAsset.methods.transfer(accounts[0].address, accounts[1].address, 1, 0);
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
