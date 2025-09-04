import { type AztecAddress, EthAddress } from '@aztec/aztec.js';
import { TX_ERROR_INVALID_PROOF } from '@aztec/stdlib/tx';

import '@jest/globals';

import { type ProverTestContext, REAL_PROOFS, setupProverTestEnvironment } from './shared_prover_test_setup.js';

describe('prover_invalid_proofs', () => {
  const COINBASE_ADDRESS = EthAddress.random();
  let ctx: ProverTestContext;

  let sender: AztecAddress;
  let recipient: AztecAddress;

  beforeAll(async () => {
    ctx = await setupProverTestEnvironment('prover_invalid_proofs', COINBASE_ADDRESS);
    sender = ctx.sender;
    recipient = ctx.recipient;
  }, 120_000);

  afterAll(async () => {
    await ctx.t.teardown();
  });

  afterEach(async () => {
    await ctx.tokenSim.check();
  });

  it('rejects txs with invalid proofs', async () => {
    if (!REAL_PROOFS) {
      ctx.logger.warn(`Skipping test with fake proofs`);
      return;
    }

    const privateInteraction = ctx.t.fakeProofsAsset.methods.transfer(recipient, 1n);
    const publicInteraction = ctx.t.fakeProofsAsset.methods.transfer_in_public(sender, recipient, 1n, 0);

    const sentPrivateTx = privateInteraction.send({ from: sender });
    const sentPublicTx = publicInteraction.send({ from: sender });

    const results = await Promise.allSettled([
      sentPrivateTx.wait({ timeout: 10, interval: 0.1 }),
      sentPublicTx.wait({ timeout: 10, interval: 0.1 }),
    ]);

    expect(String((results[0] as PromiseRejectedResult).reason)).toMatch(TX_ERROR_INVALID_PROOF);
    expect(String((results[1] as PromiseRejectedResult).reason)).toMatch(TX_ERROR_INVALID_PROOF);
  });
});
