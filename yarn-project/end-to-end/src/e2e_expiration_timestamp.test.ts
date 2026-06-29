import { AztecAddress } from '@aztec/aztec.js/addresses';
import type { CheatCodes } from '@aztec/aztec/testing';
import { getL1ContractsConfigEnvVars } from '@aztec/ethereum/config';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import type { AztecNode, AztecNodeDebug } from '@aztec/stdlib/interfaces/client';
import { TX_ERROR_INVALID_EXPIRATION_TIMESTAMP } from '@aztec/stdlib/tx';

import { AUTOMINE_E2E_OPTS } from './fixtures/fixtures.js';
import { setup } from './fixtures/utils.js';
import type { TestWallet } from './test-wallet/test_wallet.js';
import { proveInteraction } from './test-wallet/utils.js';

// Covers transaction expiration-timestamp enforcement: setting a valid expiration succeeds, setting
// one below the mined block timestamp fails at prove time, and setting one that is then warped past
// by L1 time causes rejection at submission. Uses a single automine node; L1 time is warped via
// cheatCodes.eth.warp in the invalidation tests.
describe('e2e_expiration_timestamp', () => {
  let wallet: TestWallet;
  let defaultAccountAddress: AztecAddress;
  let aztecNode: AztecNode & AztecNodeDebug;
  let cheatCodes: CheatCodes;
  let teardown: () => Promise<void>;

  let contract: TestContract;

  const aztecSlotDuration = BigInt(getL1ContractsConfigEnvVars().aztecSlotDuration);

  beforeAll(async () => {
    ({
      teardown,
      wallet,
      aztecNode,
      cheatCodes,
      accounts: [defaultAccountAddress],
    } = await setup(1, { ...AUTOMINE_E2E_OPTS }));
    ({ contract } = await TestContract.deploy(wallet).send({ from: defaultAccountAddress }));
  });

  afterAll(() => teardown());

  // Expiration is set two slots ahead of the latest block, so it is above the next slot's
  // timestamp. Expects the tx to prove and land without error.
  describe('when requesting expiration timestamp higher than the one of a mined block', () => {
    let expirationTimestamp: bigint;

    beforeEach(async () => {
      const header = (await aztecNode.getBlockData('latest'))?.header;
      if (!header) {
        throw new Error('Block header not found in the setup of e2e_expiration_timestamp.test.ts');
      }
      // Two slots ahead of the latest mined block — gives enough headroom that the expiration
      // is safely above the next block's timestamp even if there's a brief delay between
      // fetching the header and proving the tx.
      expirationTimestamp = header.globalVariables.timestamp + aztecSlotDuration * 2n;
    });

    describe('with no enqueued public calls', () => {
      const enqueuePublicCall = false;

      // Proves a private-only tx and asserts the expirationTimestamp in the tx data equals the
      // requested value.
      it('sets the expiration timestamp', async () => {
        const tx = await proveInteraction(
          wallet,
          contract.methods.set_expiration_timestamp(expirationTimestamp, enqueuePublicCall),
          { from: defaultAccountAddress },
        );
        expect(tx.data.expirationTimestamp).toEqual(expirationTimestamp);
        // Note: If the expected value doesn't match, it might be because the expirationTimestamp is rounded down.
        // See compute_tx_expiration_timestamp.ts for the rounding logic.
      });

      // Sends a private-only tx with a future expiration and expects it to be mined successfully.
      it('does not invalidate the transaction', async () => {
        await contract.methods
          .set_expiration_timestamp(expirationTimestamp, enqueuePublicCall)
          .send({ from: defaultAccountAddress });
      });
    });

    describe('with an enqueued public call', () => {
      const enqueuePublicCall = true;

      // Proves a hybrid (private+public) tx and asserts the expirationTimestamp equals the
      // requested value.
      it('sets expiration timestamp', async () => {
        const tx = await proveInteraction(
          wallet,
          contract.methods.set_expiration_timestamp(expirationTimestamp, enqueuePublicCall),
          { from: defaultAccountAddress },
        );
        expect(tx.data.expirationTimestamp).toEqual(expirationTimestamp);
      });

      // Sends a hybrid tx with a future expiration and expects it to be mined successfully.
      it('does not invalidate the transaction', async () => {
        await contract.methods
          .set_expiration_timestamp(expirationTimestamp, enqueuePublicCall)
          .send({ from: defaultAccountAddress });
      });
    });
  });

  // Expiration is set one timestamp unit below the next slot's start, so it is provable
  // (expiration > anchor block) but rejected at submission. The invalidation tests also warp L1
  // time via cheatCodes.eth.warp to force expiration in the node's slot check.
  describe('when requesting expiration timestamp lower than the next block', () => {
    let expirationTimestamp: bigint;

    beforeEach(async () => {
      const header = (await aztecNode.getBlockData('latest'))?.header;
      if (!header) {
        throw new Error('Block header not found in the setup of e2e_expiration_timestamp.test.ts');
      }
      // 1n below the start of the next slot (header.timestamp + slotDuration). Under
      // AutomineSequencer the next block is always one slot ahead, so an expiration just
      // before that boundary is provable (expiration > anchor block timestamp) but rejected
      // at submission because nextSlotTimestamp >= expiration.
      expirationTimestamp = header.globalVariables.timestamp + aztecSlotDuration - 1n;
    });

    describe('with no enqueued public calls', () => {
      const enqueuePublicCall = false;

      // Proves a private-only tx; even though expiration < nextSlot the prove-time check passes
      // because expiration > anchor block timestamp. Asserts the field is set.
      it('sets expiration timestamp', async () => {
        const tx = await proveInteraction(
          wallet,
          contract.methods.set_expiration_timestamp(expirationTimestamp, enqueuePublicCall),
          { from: defaultAccountAddress },
        );
        expect(tx.data.expirationTimestamp).toEqual(expirationTimestamp);
      });

      // Proves a tx with a safe expiration, then warps L1 time past it via cheatCodes.eth.warp,
      // then sends the proven tx and expects TX_ERROR_INVALID_EXPIRATION_TIMESTAMP.
      it('invalidates the transaction', async () => {
        await runInvalidatesTest(enqueuePublicCall);
      });
    });

    describe('with an enqueued public call', () => {
      const enqueuePublicCall = true;

      // Proves a hybrid tx; even though expiration < nextSlot the prove-time check passes. Asserts
      // the expirationTimestamp field is set.
      it('sets expiration timestamp', async () => {
        const tx = await proveInteraction(
          wallet,
          contract.methods.set_expiration_timestamp(expirationTimestamp, enqueuePublicCall),
          { from: defaultAccountAddress },
        );
        expect(tx.data.expirationTimestamp).toEqual(expirationTimestamp);
      });

      // Proves a hybrid tx with a safe expiration, warps L1 time past it, then expects
      // TX_ERROR_INVALID_EXPIRATION_TIMESTAMP on send.
      it('invalidates the transaction', async () => {
        await runInvalidatesTest(enqueuePublicCall);
      });
    });

    // Prove a tx with an expiration a few slots above the latest mined block's timestamp (so it passes
    // the PXE's prove-time check that requires `expirationTimestamp > anchor block timestamp`), then
    // warp L1 time past the expiration. Submitting the proven tx must then be rejected by the node
    // because the next slot's timestamp (derived from L1 time) is greater than the tx expiration.
    async function runInvalidatesTest(enqueuePublicCall: boolean) {
      const header = (await aztecNode.getBlockData('latest'))?.header;
      if (!header) {
        throw new Error('Block header not found in invalidates-the-transaction setup');
      }
      const requestedExpiration = header.globalVariables.timestamp + aztecSlotDuration * 5n;

      const provenTx = await proveInteraction(
        wallet,
        contract.methods.set_expiration_timestamp(requestedExpiration, enqueuePublicCall),
        { from: defaultAccountAddress },
      );
      const provedExpiration = provenTx.data.expirationTimestamp;
      expect(provedExpiration).toBeGreaterThan(0n);

      // Warp L1 time past the tx expiration. The node's `isValidTx` uses the next L1 slot timestamp
      // (via `epochCache.getEpochAndSlotInNextL1Slot()`), so warping L1 alone is enough — we don't
      // mine an L2 block here. Warping multiple slots forward and then mining would cause the
      // archiver to predict-reorg prior checkpoints (their L1 publish blocks fall in a stale
      // anvil layout after the warp). We use the lower-level `cheatCodes.eth.warp` rather than
      // the queue-aware `warpL2TimeAtLeastTo` helper, since the latter also forces an L2 block.
      // No mempool poller race here — no txs are pending until `provenTx.send()` below.
      // If L1 time has already advanced past the expiration (e.g. due to a prior test's warp), skip
      // the warp — the tx is already invalid against the current L1 slot.
      const currentL1Timestamp = BigInt(await cheatCodes.eth.lastBlockTimestamp());
      const targetTimestamp = provedExpiration + aztecSlotDuration;
      if (targetTimestamp > currentL1Timestamp) {
        await cheatCodes.eth.warp(Number(targetTimestamp), { resetBlockInterval: true });
      }

      await expect(provenTx.send()).rejects.toThrow(TX_ERROR_INVALID_EXPIRATION_TIMESTAMP);
    }
  });

  // Expiration is set below the already-mined block's timestamp, so proving itself must fail.
  describe('when requesting expiration timestamp lower than the one of a mined block', () => {
    let expirationTimestamp: bigint;

    beforeEach(async () => {
      const header = (await aztecNode.getBlockData('latest'))?.header;
      if (!header) {
        throw new Error('Block header not found in the setup of e2e_expiration_timestamp.test.ts');
      }
      // 1n lower than the mined block.
      expirationTimestamp = header.globalVariables.timestamp - 1n;
    });

    describe('with no enqueued public calls', () => {
      const enqueuePublicCall = false;

      // Sends a private-only tx with an expiration already below the current block timestamp;
      // expects rejection before it can be proven.
      it('fails to prove the tx', async () => {
        await expect(
          contract.methods
            .set_expiration_timestamp(expirationTimestamp, enqueuePublicCall)
            .send({ from: defaultAccountAddress }),
        ).rejects.toThrow();
      });
    });

    describe('with an enqueued public call', () => {
      const enqueuePublicCall = true;

      // Sends a hybrid tx with an expiration below the current block; expects prove-time rejection.
      it('fails to prove the tx', async () => {
        await expect(
          contract.methods
            .set_expiration_timestamp(expirationTimestamp, enqueuePublicCall)
            .send({ from: defaultAccountAddress }),
        ).rejects.toThrow();
      });
    });
  });
});
