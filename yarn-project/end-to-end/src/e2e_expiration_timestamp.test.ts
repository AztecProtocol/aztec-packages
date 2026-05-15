import { AztecAddress } from '@aztec/aztec.js/addresses';
import type { CheatCodes } from '@aztec/aztec/testing';
import { getL1ContractsConfigEnvVars } from '@aztec/ethereum/config';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import type { AztecNode, AztecNodeDebug } from '@aztec/stdlib/interfaces/client';
import { TX_ERROR_INVALID_EXPIRATION_TIMESTAMP } from '@aztec/stdlib/tx';

import { PIPELINING_SETUP_OPTS } from './fixtures/fixtures.js';
import { setup } from './fixtures/utils.js';
import type { TestWallet } from './test-wallet/test_wallet.js';
import { proveInteraction } from './test-wallet/utils.js';

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
    } = await setup(1, { ...PIPELINING_SETUP_OPTS }));
    ({ contract } = await TestContract.deploy(wallet).send({ from: defaultAccountAddress }));
  });

  afterAll(() => teardown());

  describe('when requesting expiration timestamp higher than the one of a mined block', () => {
    let expirationTimestamp: bigint;

    beforeEach(async () => {
      const header = (await aztecNode.getBlockData('latest'))?.header;
      if (!header) {
        throw new Error('Block header not found in the setup of e2e_expiration_timestamp.test.ts');
      }
      // Two slots ahead of the latest mined block, to leave room for the anchor block to advance
      // by one slot under proposer pipelining between fetching the header and proving the tx.
      expirationTimestamp = header.globalVariables.timestamp + aztecSlotDuration * 2n;
    });

    describe('with no enqueued public calls', () => {
      const enqueuePublicCall = false;

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

      it('does not invalidate the transaction', async () => {
        await contract.methods
          .set_expiration_timestamp(expirationTimestamp, enqueuePublicCall)
          .send({ from: defaultAccountAddress });
      });
    });

    describe('with an enqueued public call', () => {
      const enqueuePublicCall = true;

      it('sets expiration timestamp', async () => {
        const tx = await proveInteraction(
          wallet,
          contract.methods.set_expiration_timestamp(expirationTimestamp, enqueuePublicCall),
          { from: defaultAccountAddress },
        );
        expect(tx.data.expirationTimestamp).toEqual(expirationTimestamp);
      });

      it('does not invalidate the transaction', async () => {
        await contract.methods
          .set_expiration_timestamp(expirationTimestamp, enqueuePublicCall)
          .send({ from: defaultAccountAddress });
      });
    });
  });

  describe('when requesting expiration timestamp lower than the next block', () => {
    let expirationTimestamp: bigint;

    beforeEach(async () => {
      const header = (await aztecNode.getBlockData('latest'))?.header;
      if (!header) {
        throw new Error('Block header not found in the setup of e2e_expiration_timestamp.test.ts');
      }
      // 1n lower than two slots ahead. Under proposer pipelining the anchor block may already
      // have advanced one slot past the latest mined header, so the next slot to be mined is
      // typically two slots ahead; this expiration sits just below that slot's start.
      expirationTimestamp = header.globalVariables.timestamp + aztecSlotDuration * 2n - 1n;
    });

    describe('with no enqueued public calls', () => {
      const enqueuePublicCall = false;

      it('sets expiration timestamp', async () => {
        const tx = await proveInteraction(
          wallet,
          contract.methods.set_expiration_timestamp(expirationTimestamp, enqueuePublicCall),
          { from: defaultAccountAddress },
        );
        expect(tx.data.expirationTimestamp).toEqual(expirationTimestamp);
      });

      it('invalidates the transaction', async () => {
        await runInvalidatesTest(enqueuePublicCall);
      });
    });

    describe('with an enqueued public call', () => {
      const enqueuePublicCall = true;

      it('sets expiration timestamp', async () => {
        const tx = await proveInteraction(
          wallet,
          contract.methods.set_expiration_timestamp(expirationTimestamp, enqueuePublicCall),
          { from: defaultAccountAddress },
        );
        expect(tx.data.expirationTimestamp).toEqual(expirationTimestamp);
      });

      it('invalidates the transaction', async () => {
        await runInvalidatesTest(enqueuePublicCall);
      });
    });

    // Prove a tx with an expiration a few slots above the latest mined block's timestamp (so it passes
    // the PXE's prove-time check that requires `expirationTimestamp > anchor block timestamp`, even if
    // the anchor block advances by a slot or two between fetching the header and proving), then warp
    // L1 time past the expiration. Submitting the proven tx must then be rejected by the node because
    // the next slot's timestamp (derived from L1 time) is greater than the tx expiration.
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
      // (via `epochCache.getEpochAndSlotInNextL1Slot()`), so warping L1 is what makes the proven tx
      // invalid against the current L1 slot. Under proposer pipelining the sequencer may have an
      // in-flight block for the slot we are about to warp past; a raw L1 warp leaves that block
      // stranded (its slot never checkpoints, so L1 sync prunes it asynchronously) and the next
      // test's PXE can capture the doomed block as its anchor before the prune lands, producing a
      // `Block hash ... not found when querying world state` error. `warpL2TimeAtLeastTo` mines an
      // L2 block at the post-warp slot, draining the in-flight block and ensuring subsequent txs
      // anchor to a fresh block. If L1 has already advanced past the expiration (e.g. due to a
      // prior test's warp), skip — the tx is already invalid against the current L1 slot.
      const currentL1Timestamp = BigInt(await cheatCodes.eth.lastBlockTimestamp());
      const targetTimestamp = provedExpiration + aztecSlotDuration;
      if (targetTimestamp > currentL1Timestamp) {
        await cheatCodes.warpL2TimeAtLeastTo(aztecNode, targetTimestamp);
      }

      await expect(provenTx.send()).rejects.toThrow(TX_ERROR_INVALID_EXPIRATION_TIMESTAMP);
    }
  });

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
