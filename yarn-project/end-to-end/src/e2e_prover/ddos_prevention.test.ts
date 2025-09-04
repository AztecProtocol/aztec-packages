import { type AztecAddress, EthAddress, ProvenTx, Tx, TxReceipt, TxStatus } from '@aztec/aztec.js';
import type { FieldsOf } from '@aztec/foundation/types';
import { Gas } from '@aztec/stdlib/gas';
import { PrivateKernelTailCircuitPublicInputs } from '@aztec/stdlib/kernel';
import { ClientIvcProof } from '@aztec/stdlib/proofs';
import { TX_ERROR_INVALID_PROOF } from '@aztec/stdlib/tx';

import '@jest/globals';

import {
  type ProverTestContext,
  REAL_PROOFS,
  TIMEOUT,
  setupProverTestEnvironment,
} from './shared_prover_test_setup.js';

describe('prover_ddos_prevention', () => {
  const COINBASE_ADDRESS = EthAddress.random();
  let ctx: ProverTestContext;

  let sender: AztecAddress;
  let recipient: AztecAddress;

  beforeAll(async () => {
    ctx = await setupProverTestEnvironment('prover_ddos_prevention', COINBASE_ADDRESS);
    sender = ctx.sender;
    recipient = ctx.recipient;
  }, 120_000);

  afterAll(async () => {
    await ctx.t.teardown();
  });

  afterEach(async () => {
    await ctx.tokenSim.check();
  });

  it(
    'should prevent large influxes of txs with invalid proofs from causing ddos attacks',
    async () => {
      if (!REAL_PROOFS) {
        ctx.logger.warn(`Skipping test with fake proofs`);
        return;
      }

      const NUM_INVALID_TXS = 20;

      // Create and prove a tx
      ctx.logger.info(`Creating and proving tx`);
      const sendAmount = 1n;
      const interaction = ctx.provenAssets[0].methods.transfer(recipient, sendAmount);
      const provenTx = await interaction.prove({ from: sender });
      const wallet = (provenTx as any).wallet;

      // Verify the tx proof
      ctx.logger.info(`Verifying the valid tx proof`);
      const verificationResult = await ctx.t.circuitProofVerifier?.verifyProof(provenTx);
      expect(verificationResult?.valid).toBeTrue();

      // Spam node with invalid txs
      ctx.logger.info(`Submitting ${NUM_INVALID_TXS} invalid transactions to simulate a ddos attack`);
      const data = provenTx.data;
      const invalidTxs = await Promise.all(
        Array.from({ length: NUM_INVALID_TXS }, async (_, i) => {
          // Use a random ClientIvcProof and alter the public tx data to generate a unique invalid tx hash
          const invalidProvenTx = new ProvenTx(
            wallet,
            await Tx.create({
              data: new PrivateKernelTailCircuitPublicInputs(
                data.constants,
                data.gasUsed.add(new Gas(i + 1, 0)),
                data.feePayer,
                data.includeByTimestamp,
                data.forPublic,
                data.forRollup,
              ),
              clientIvcProof: ClientIvcProof.random(),
              contractClassLogFields: provenTx.contractClassLogFields,
              publicFunctionCalldata: provenTx.publicFunctionCalldata,
            }),
            [],
          );
          return invalidProvenTx.send();
        }),
      );

      ctx.logger.info(`Sending proven tx`);
      const validTx = provenTx.send();

      // Flag the valid transfer on the token simulator
      ctx.tokenSim.transferPrivate(sender, recipient, sendAmount);

      // Warp to the next epoch
      const epoch = await ctx.cheatCodes.rollup.getEpoch();
      ctx.logger.info(`Advancing from epoch ${epoch} to next epoch`);
      await ctx.cheatCodes.rollup.advanceToNextEpoch();

      const results = await Promise.allSettled([
        ...invalidTxs.map(tx => tx.wait({ timeout: 10, interval: 0.1, dontThrowOnRevert: true })),
        validTx.wait({ timeout: 300, interval: 10 }),
      ]);

      // Assert that the large influx of invalid txs are rejected and do not ddos the node
      for (let i = 0; i < NUM_INVALID_TXS; i++) {
        expect(String((results[i] as PromiseRejectedResult).reason)).toMatch(TX_ERROR_INVALID_PROOF);
      }

      // Assert that the valid tx is successfully sent and mined
      const validTxReceipt = (results[NUM_INVALID_TXS] as PromiseFulfilledResult<FieldsOf<TxReceipt>>).value;
      expect(validTxReceipt.status).toBe(TxStatus.SUCCESS);

      ctx.logger.info(`Valid tx was mined and invalid txs were dropped by P2P node`);
    },
    TIMEOUT,
  );
});
