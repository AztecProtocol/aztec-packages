import { AztecAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import type { AztecNode } from '@aztec/aztec.js/node';
import { waitForTx } from '@aztec/aztec.js/node';
import type { CheatCodes } from '@aztec/aztec/testing';
import { PRIVATE_LOG_CIPHERTEXT_LEN } from '@aztec/constants';
import { retryUntil } from '@aztec/foundation/retry';
import { OffchainPaymentContract } from '@aztec/noir-test-contracts.js/OffchainPayment';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import { OFFCHAIN_MESSAGE_IDENTIFIER, TxStatus } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';

import { getLogger, setup } from './fixtures/utils.js';
import type { TestWallet } from './test-wallet/test_wallet.js';
import { proveInteraction } from './test-wallet/utils.js';

const TIMEOUT = 120_000;

describe('e2e_offchain_payment_qr', () => {
  let contract: OffchainPaymentContract;
  let aztecNode: AztecNode;
  let aztecNodeAdmin: AztecNodeAdmin;
  let cheatCodes: CheatCodes;
  let wallet: TestWallet;
  let accounts: AztecAddress[];
  let teardown: () => Promise<void>;
  const logger = getLogger();

  jest.setTimeout(TIMEOUT);

  beforeAll(async () => {
    ({ teardown, wallet, accounts, aztecNode, aztecNodeAdmin, cheatCodes } = await setup(2));
  });

  afterAll(() => teardown());

  beforeEach(async () => {
    ({ contract } = await OffchainPaymentContract.deploy(wallet).send({ from: accounts[0] }));
  });

  const forceEmptyBlock = async () => {
    const blockBefore = await aztecNode.getBlockNumber();
    logger.info(`Forcing empty block. Current L2 block: ${blockBefore}`);
    await aztecNodeAdmin.setConfig({ minTxsPerBlock: 0 });
    await retryUntil(
      async () => {
        const current = await aztecNode.getBlockNumber();
        logger.info(`Waiting for new L2 block. Current: ${current}`);
        return current > blockBefore;
      },
      'new L2 block',
      30,
      1,
    );
    await aztecNodeAdmin.setConfig({ minTxsPerBlock: 1 });
  };

  it('processes an offchain-delivered private payment via QR-style handoff', async () => {
    const [alice, bob] = accounts;

    const mintAmount = 100n;
    const paymentAmount = 40n;

    // Mint to Alice using onchain delivery so she can spend the note.
    await contract.methods.mint(mintAmount, alice).send({ from: alice });

    // Alice prepares the private transfer which emits offchain effects.
    const provenTx = await proveInteraction(wallet, contract.methods.transfer_offchain(paymentAmount, bob), {
      from: alice,
    });
    const { txHash } = await provenTx.send();

    const offchainEffects = provenTx.offchainEffects;
    expect(offchainEffects.length).toBeGreaterThan(0);

    // QR payload is the offchain effect for Bob.
    const effectForBob = offchainEffects.find(
      effect => effect.data[0].equals(OFFCHAIN_MESSAGE_IDENTIFIER) && effect.data[1].equals(bob.toField()),
    );
    expect(effectForBob).toBeTruthy();

    const ciphertext = effectForBob!.data.slice(2, 2 + PRIVATE_LOG_CIPHERTEXT_LEN);

    await contract.methods.offchain_enqueue(ciphertext, bob, txHash.hash).simulate({ from: bob });

    // Force an empty block so the PXE re-syncs and discovers the offchain-delivered note.
    await forceEmptyBlock();

    const { result: bobBalance } = await contract.methods.get_balance(bob).simulate({ from: bob });
    expect(bobBalance).toBe(paymentAmount);
  });

  it('reprocesses an offchain-delivered payment after an L1 reorg', async () => {
    const [alice, bob] = accounts;

    const mintAmount = 100n;
    const paymentAmount = 40n;

    await contract.methods.mint(mintAmount, alice).send({ from: alice });

    const provenTx = await proveInteraction(wallet, contract.methods.transfer_offchain(paymentAmount, bob), {
      from: alice,
    });
    const receipt = await provenTx.send();
    expect(receipt.blockNumber).toBeDefined();
    const txBlockNumber = receipt.blockNumber!;
    const txHash = provenTx.getTxHash();
    logger.info(`Tx included in L2 block ${txBlockNumber}`);

    const offchainEffects = provenTx.offchainEffects;
    const effectForBob = offchainEffects.find(
      effect => effect.data[0].equals(OFFCHAIN_MESSAGE_IDENTIFIER) && effect.data[1].equals(bob.toField()),
    );
    expect(effectForBob).toBeTruthy();

    const ciphertext = effectForBob!.data.slice(2, 2 + PRIVATE_LOG_CIPHERTEXT_LEN);
    await contract.methods.offchain_enqueue(ciphertext, bob, txHash.hash).simulate({ from: bob });
    const { result: inboxLenAfterEnqueue } = await contract.methods.get_inbox_len().simulate({ from: bob });
    logger.info(`Inbox len after enqueue: ${inboxLenAfterEnqueue}`);
    expect(Number(inboxLenAfterEnqueue)).toBe(1);

    await forceEmptyBlock();
    const { result: bobBalance } = await contract.methods.get_balance(bob).simulate({ from: bob });
    expect(bobBalance).toBe(paymentAmount);
    const { result: inboxLenAfterSync } = await contract.methods.get_inbox_len().simulate({ from: bob });
    logger.info(`Inbox len after sync: ${inboxLenAfterSync}`);

    const checkpointed = await retryUntil(
      async () => {
        const blocks = await aztecNode.getCheckpointedBlocks(txBlockNumber, 1);
        logger.info(`Checkpointed blocks from ${txBlockNumber}: ${blocks.length}`);
        return blocks[0];
      },
      'checkpointed block',
      30,
      1,
    );
    logger.info(`Checkpointed L1 block: ${checkpointed.l1.blockNumber}`);
    const l1BlockNumber = Number(checkpointed.l1.blockNumber - 1n);

    await aztecNodeAdmin.pauseSync();
    logger.info(`Paused sync. Reorging L1 to block ${l1BlockNumber}`);
    await cheatCodes.eth.reorgTo(l1BlockNumber);
    logger.info(`Rolling back L2 to block ${Number(txBlockNumber) - 1}`);
    await aztecNodeAdmin.rollbackTo(Number(txBlockNumber) - 1);
    expect(await aztecNode.getBlockNumber()).toBe(Number(txBlockNumber) - 1);
    await aztecNodeAdmin.resumeSync();

    const txEffectAfterRollback = await aztecNode.getTxEffect(txHash);
    logger.info(`Tx effect after rollback present: ${!!txEffectAfterRollback}`);
    expect(txEffectAfterRollback).toBeFalsy();

    const { result: bobAfterRollback } = await contract.methods.get_balance(bob).simulate({ from: bob });
    expect(bobAfterRollback).toBe(0n);

    const { result: inboxLenAfterRollback } = await contract.methods.get_inbox_len().simulate({ from: bob });
    logger.info(`Inbox len after rollback: ${inboxLenAfterRollback}`);
    expect(Number(inboxLenAfterRollback)).toBe(1);

    try {
      await provenTx.send({ wait: NO_WAIT });
    } catch {
      // Ignore errors if the tx is already known to the node.
    }
    logger.info(`Waiting for tx ${txHash.toString()} to be mined after reorg`);
    await waitForTx(aztecNode, txHash, { waitForStatus: TxStatus.PROPOSED });

    // Notice what we want to test here is that the offchain effects don't need to be re-enqueued
    // for the system to re-process it.
    await retryUntil(
      async () => {
        const { result } = await contract.methods.get_balance(bob).simulate({ from: bob });
        return result === paymentAmount ? true : undefined;
      },
      'bob balance after reorg',
      30,
      1,
    );
  });
});
