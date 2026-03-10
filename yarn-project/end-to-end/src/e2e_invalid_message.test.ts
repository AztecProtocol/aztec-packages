import type { AztecAddress } from '@aztec/aztec.js/addresses';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { InvalidMessageContract } from '@aztec/noir-test-contracts.js/InvalidMessage';

import { jest } from '@jest/globals';

import { ensureAccountContractsPublished, setup } from './fixtures/utils.js';

const TIMEOUT = 120_000;

// Tests that PXE gracefully handles invalid private messages (messages whose content does not match any commitment or
// note hash in the tx). A malicious or buggy contract can emit such messages because message content is unconstrained.
// The recipient's PXE should silently drop them instead of crashing.
describe('e2e_invalid_message', () => {
  jest.setTimeout(TIMEOUT);

  let wallet: Wallet;
  let account: AztecAddress;
  let teardown: () => Promise<void>;

  beforeAll(async () => {
    ({
      teardown,
      wallet,
      accounts: [account],
    } = await setup(1));
    await ensureAccountContractsPublished(wallet, [account]);
  });

  afterAll(() => teardown());

  it('should gracefully handle a fake event message with no commitment in tx', async () => {
    const { contract } = await InvalidMessageContract.deploy(wallet).send({ from: account });

    // Emit an invalid event message: properly encrypted but with no commitment nullifier in the tx.
    await contract.methods.emit_fake_event_message(account).send({ from: account });

    // Contract sync is lazy: it only runs when you interact with a contract. We call noop() to force PXE to sync the
    // contract, which discovers and processes the invalid event message from the previous block.
    await contract.methods.noop().simulate({ from: account });
  });
});
