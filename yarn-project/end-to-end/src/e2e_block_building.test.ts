import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import {
  type AztecAddress,
  type AztecNode,
  type CheatCodes,
  ContractDeployer,
  ContractFunctionInteraction,
  Fq,
  Fr,
  L1EventPayload,
  L1NotePayload,
  type Logger,
  type PXE,
  TxStatus,
  type Wallet,
  deriveKeys,
  retryUntil,
  sleep,
} from '@aztec/aztec.js';
import { getL1ContractsConfigEnvVars } from '@aztec/ethereum';
import { times } from '@aztec/foundation/collection';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { StatefulTestContract, StatefulTestContractArtifact } from '@aztec/noir-contracts.js/StatefulTest';
import { TestContract } from '@aztec/noir-contracts.js/Test';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

import { jest } from '@jest/globals';
import 'jest-extended';

import { DUPLICATE_NULLIFIER_ERROR } from './fixtures/fixtures.js';
import { setup } from './fixtures/utils.js';

describe('e2e_block_building', () => {
  jest.setTimeout(20 * 60 * 1000); // 20 minutes

  let pxe: PXE;
  let logger: Logger;
  let owner: Wallet;
  let minter: Wallet;
  let aztecNode: AztecNode;
  let teardown: () => Promise<void>;

  const { aztecEpochProofClaimWindowInL2Slots } = getL1ContractsConfigEnvVars();

  describe('multi-txs block', () => {
    const artifact = StatefulTestContractArtifact;

    beforeAll(async () => {
      ({
        teardown,
        pxe,
        logger,
        aztecNode,
        wallets: [owner, minter],
      } = await setup(2));
    });

    afterEach(() => aztecNode.setConfig({ minTxsPerBlock: 1 }));
    afterAll(() => teardown());

    it('assembles a block with multiple txs', async () => {
      // Assemble N contract deployment txs
      // We need to create them sequentially since we cannot have parallel calls to a circuit
      const TX_COUNT = 8;
      await aztecNode.setConfig({ minTxsPerBlock: TX_COUNT });
      const deployer = new ContractDeployer(artifact, owner);

      const ownerAddress = owner.getCompleteAddress().address;
      const sender = ownerAddress;
      // Need to have value > 0, so adding + 1
      // We need to do so, because noir currently will fail if the multiscalarmul is in an `if`
      // that we DO NOT enter. This should be fixed by https://github.com/noir-lang/noir/issues/5045.
      const methods = times(TX_COUNT, i => deployer.deploy(ownerAddress, sender, i + 1));
      const provenTxs = [];
      for (let i = 0; i < TX_COUNT; i++) {
        provenTxs.push(
          await methods[i].prove({
            contractAddressSalt: new Fr(BigInt(i + 1)),
            skipClassRegistration: true,
            skipPublicDeployment: true,
          }),
        );
      }

      // Send them simultaneously to be picked up by the sequencer
      const txs = await Promise.all(provenTxs.map(tx => tx.send()));
      logger.info(`Txs sent with hashes: `);
      for (const tx of txs) {
        logger.info(` ${await tx.getTxHash()}`);
      }

      // Await txs to be mined and assert they are all mined on the same block
      const receipts = await Promise.all(txs.map(tx => tx.wait()));
      expect(receipts.map(r => r.blockNumber)).toEqual(times(TX_COUNT, () => receipts[0].blockNumber));

      // Assert all contracts got deployed
      const isContractDeployed = async (address: AztecAddress) => !!(await pxe.getContractInstance(address));
      const areDeployed = await Promise.all(receipts.map(r => isContractDeployed(r.contract.address)));
      expect(areDeployed).toEqual(times(TX_COUNT, () => true));
    });

    it('assembles a block with multiple txs with public fns', async () => {
      // First deploy the contract
      const ownerAddress = owner.getCompleteAddress().address;
      const contract = await StatefulTestContract.deploy(owner, ownerAddress, ownerAddress, 1).send().deployed();

      // Assemble N contract deployment txs
      // We need to create them sequentially since we cannot have parallel calls to a circuit
      const TX_COUNT = 8;
      await aztecNode.setConfig({ minTxsPerBlock: TX_COUNT });

      const methods = times(TX_COUNT, i => contract.methods.increment_public_value(ownerAddress, i));
      const provenTxs = [];
      for (let i = 0; i < TX_COUNT; i++) {
        provenTxs.push(await methods[i].prove({}));
      }

      // Send them simultaneously to be picked up by the sequencer
      const txs = await Promise.all(provenTxs.map(tx => tx.send()));
      logger.info(`Txs sent with hashes: `);
      for (const tx of txs) {
        logger.info(` ${await tx.getTxHash()}`);
      }

      // Await txs to be mined and assert they are all mined on the same block
      const receipts = await Promise.all(txs.map(tx => tx.wait()));
      expect(receipts.map(r => r.blockNumber)).toEqual(times(TX_COUNT, () => receipts[0].blockNumber));
    });

    it.skip('can call public function from different tx in same block as deployed', async () => {
      // Ensure both txs will land on the same block
      await aztecNode.setConfig({ minTxsPerBlock: 2 });

      // Deploy a contract in the first transaction
      // In the same block, call a public method on the contract
      const deployer = TokenContract.deploy(owner, owner.getCompleteAddress(), 'TokenName', 'TokenSymbol', 18);
      await deployer.create();

      // We can't use `TokenContract.at` to call a function because it checks the contract is deployed
      // but we are in the same block as the deployment transaction
      const callInteraction = new ContractFunctionInteraction(
        owner,
        deployer.getInstance().address,
        TokenContract.artifact.functions.find(x => x.name === 'set_minter')!,
        [minter.getCompleteAddress(), true],
      );

      const deployerTx = await deployer.prove({});
      const callInteractionTx = await callInteraction.prove({
        // we have to skip simulation of public calls simulation is done on individual transactions
        // and the tx deploying the contract might go in the same block as this one
        skipPublicSimulation: true,
      });

      const [deployTxReceipt, callTxReceipt] = await Promise.all([
        deployerTx.send().wait(),
        callInteractionTx.send().wait(),
      ]);

      expect(deployTxReceipt.blockNumber).toEqual(callTxReceipt.blockNumber);
    });
  });

  describe('double-spends', () => {
    let contract: TestContract;
    let teardown: () => Promise<void>;

    beforeAll(async () => {
      ({ teardown, pxe, logger, wallet: owner } = await setup(1));
      contract = await TestContract.deploy(owner).send().deployed();
      logger.info(`Test contract deployed at ${contract.address}`);
    });

    afterAll(() => teardown());

    // Regressions for https://github.com/AztecProtocol/aztec-packages/issues/2502
    // Note that the order in which the TX are processed is not guaranteed.
    describe('in the same block, different tx', () => {
      it('private <-> private', async () => {
        const nullifier = Fr.random();
        const txs = await sendAndWait([
          contract.methods.emit_nullifier(nullifier),
          contract.methods.emit_nullifier(nullifier),
        ]);

        // One transaction should succeed, the other should fail, but in any order.
        expect(txs).toIncludeSameMembers([
          { status: 'fulfilled', value: expect.anything() },
          {
            status: 'rejected',
            reason: expect.objectContaining({ message: expect.stringMatching(DUPLICATE_NULLIFIER_ERROR) }),
          },
        ]);
      });

      it('public -> public', async () => {
        const nullifier = Fr.random();
        const txs = await sendAndWait([
          contract.methods.emit_nullifier_public(nullifier),
          contract.methods.emit_nullifier_public(nullifier),
        ]);

        // One transaction should succeed, the other should fail, but in any order.
        expect(txs).toIncludeSameMembers([
          { status: 'fulfilled', value: expect.anything() },
          {
            status: 'rejected',
            reason: expect.objectContaining({ message: expect.stringMatching(DUPLICATE_NULLIFIER_ERROR) }),
          },
        ]);
      });

      it('private -> public', async () => {
        const nullifier = Fr.random();
        const txs = await sendAndWait([
          contract.methods.emit_nullifier(nullifier),
          contract.methods.emit_nullifier_public(nullifier),
        ]);

        // One transaction should succeed, the other should fail, but in any order.
        expect(txs).toIncludeSameMembers([
          { status: 'fulfilled', value: expect.anything() },
          {
            status: 'rejected',
            reason: expect.objectContaining({ message: expect.stringMatching(DUPLICATE_NULLIFIER_ERROR) }),
          },
        ]);
      });

      it('public -> private', async () => {
        const nullifier = Fr.random();
        const txs = await sendAndWait([
          contract.methods.emit_nullifier_public(nullifier),
          contract.methods.emit_nullifier(nullifier),
        ]);

        // One transaction should succeed, the other should fail, but in any order.
        expect(txs).toIncludeSameMembers([
          { status: 'fulfilled', value: expect.anything() },
          {
            status: 'rejected',
            reason: expect.objectContaining({ message: expect.stringMatching(DUPLICATE_NULLIFIER_ERROR) }),
          },
        ]);
      });
    });

    describe('across blocks', () => {
      it('private -> private', async () => {
        const nullifier = Fr.random();
        await contract.methods.emit_nullifier(nullifier).send().wait();
        await expect(contract.methods.emit_nullifier(nullifier).send().wait()).rejects.toThrow('dropped');
      });

      it('public -> public', async () => {
        const nullifier = Fr.random();
        await contract.methods.emit_nullifier_public(nullifier).send().wait();
        await expect(contract.methods.emit_nullifier_public(nullifier).send().wait()).rejects.toThrow(
          DUPLICATE_NULLIFIER_ERROR,
        );
      });

      it('private -> public', async () => {
        const nullifier = Fr.random();
        await contract.methods.emit_nullifier(nullifier).send().wait();
        await expect(contract.methods.emit_nullifier_public(nullifier).send().wait()).rejects.toThrow(
          DUPLICATE_NULLIFIER_ERROR,
        );
      });

      it('public -> private', async () => {
        const nullifier = Fr.random();
        await contract.methods.emit_nullifier_public(nullifier).send().wait();
        await expect(contract.methods.emit_nullifier(nullifier).send().wait()).rejects.toThrow('dropped');
      });
    });
  });

  describe('logs in nested calls are ordered as expected', () => {
    // This test was originally written for e2e_nested, but it was refactored
    // to not use TestContract.
    let testContract: TestContract;

    beforeEach(async () => {
      ({ teardown, pxe, logger, wallet: owner } = await setup(1));
      logger.info(`Deploying test contract`);
      testContract = await TestContract.deploy(owner).send().deployed();
    }, 60_000);

    it('calls a method with nested note encrypted logs', async () => {
      // account setup
      const privateKey = new Fr(7n);
      const keys = deriveKeys(privateKey);
      const account = getSchnorrAccount(pxe, privateKey, keys.masterIncomingViewingSecretKey);
      await account.deploy().wait();
      const thisWallet = await account.getWallet();
      const sender = thisWallet.getAddress();

      // call test contract
      const action = testContract.methods.emit_encrypted_logs_nested(10, thisWallet.getAddress(), sender);
      const tx = await action.prove();
      const rct = await tx.send().wait();

      // compare logs
      expect(rct.status).toEqual('success');
      const noteValues = tx.data.getNonEmptyPrivateLogs().map(log => {
        const notePayload = L1NotePayload.decryptAsIncoming(log, thisWallet.getEncryptionSecret());
        // In this test we care only about the privately delivered values
        return notePayload?.privateNoteValues[0];
      });
      expect(noteValues[0]).toEqual(new Fr(10));
      expect(noteValues[1]).toEqual(new Fr(11));
      expect(noteValues[2]).toEqual(new Fr(12));
    }, 30_000);

    it('calls a method with nested encrypted logs', async () => {
      // account setup
      const privateKey = new Fr(7n);
      const keys = deriveKeys(privateKey);
      const account = getSchnorrAccount(pxe, privateKey, keys.masterIncomingViewingSecretKey);
      await account.deploy().wait();
      const thisWallet = await account.getWallet();
      const sender = thisWallet.getAddress();

      // call test contract
      const values = [new Fr(5), new Fr(4), new Fr(3), new Fr(2), new Fr(1)];
      const nestedValues = [new Fr(0), new Fr(0), new Fr(0), new Fr(0), new Fr(0)];
      const action = testContract.methods.emit_array_as_encrypted_log(values, thisWallet.getAddress(), sender, true);
      const tx = await action.prove();
      const rct = await tx.send().wait();

      // compare logs
      expect(rct.status).toEqual('success');
      const privateLogs = tx.data.getNonEmptyPrivateLogs();
      expect(privateLogs.length).toBe(3);

      // The first two logs are encrypted.
      const event0 = L1EventPayload.decryptAsIncoming(privateLogs[0], thisWallet.getEncryptionSecret())!;
      expect(event0.event.items).toEqual(values);

      const event1 = L1EventPayload.decryptAsIncoming(privateLogs[1], thisWallet.getEncryptionSecret())!;
      expect(event1.event.items).toEqual(nestedValues);

      // The last log is not encrypted.
      // The first field is the first value and is siloed with contract address by the kernel circuit.
      const expectedFirstField = poseidon2Hash([testContract.address, values[0]]);
      expect(privateLogs[2].fields.slice(0, 5)).toEqual([expectedFirstField, ...values.slice(1)]);
    }, 60_000);
  });

  describe('regressions', () => {
    afterEach(async () => {
      if (teardown) {
        await teardown();
      }
    });

    // Regression for https://github.com/AztecProtocol/aztec-packages/issues/7918
    it('publishes two blocks with only padding txs', async () => {
      ({ teardown, pxe, logger, aztecNode } = await setup(0, {
        minTxsPerBlock: 0,
        skipProtocolContracts: true,
      }));

      await retryUntil(async () => (await aztecNode.getBlockNumber()) >= 3, 'wait-block', 10, 1);
    });

    // Regression for https://github.com/AztecProtocol/aztec-packages/issues/7537
    it('sends a tx on the first block', async () => {
      ({ teardown, pxe, logger, aztecNode } = await setup(0, {
        minTxsPerBlock: 0,
        skipProtocolContracts: true,
      }));
      await sleep(1000);

      const account = getSchnorrAccount(pxe, Fr.random(), Fq.random(), Fr.random());
      await account.waitSetup();
    });

    it('can simulate public txs while building a block', async () => {
      ({
        teardown,
        pxe,
        logger,
        aztecNode,
        wallet: owner,
      } = await setup(1, {
        minTxsPerBlock: 1,
        skipProtocolContracts: true,
      }));

      logger.info('Deploying token contract');
      const token = await TokenContract.deploy(owner, owner.getCompleteAddress(), 'TokenName', 'TokenSymbol', 18)
        .send()
        .deployed();

      // We set the maximum number of txs per block to 12 to ensure that the sequencer will start building a block before it receives all the txs
      // and also to avoid it building
      logger.info('Updating min txs per block to 4, and max txs per block to 12');
      await aztecNode.setConfig({ minTxsPerBlock: 4, maxTxsPerBlock: 12 });

      logger.info('Spamming the network with public txs');
      const txs = [];
      for (let i = 0; i < 30; i++) {
        const tx = token.methods.mint_to_public(owner.getAddress(), 10n);
        txs.push(tx.send({ skipPublicSimulation: false }));
      }

      logger.info('Waiting for txs to be mined');
      await Promise.all(txs.map(tx => tx.wait({ proven: false, timeout: 600 })));
    });
  });

  describe('reorgs', () => {
    let contract: StatefulTestContract;
    let cheatCodes: CheatCodes;
    let ownerAddress: AztecAddress;
    let initialBlockNumber: number;
    let teardown: () => Promise<void>;

    beforeEach(async () => {
      ({
        teardown,
        aztecNode,
        pxe,
        logger,
        wallet: owner,
        cheatCodes,
      } = await setup(1, { assumeProvenThrough: undefined }));

      ownerAddress = owner.getCompleteAddress().address;
      contract = await StatefulTestContract.deploy(owner, ownerAddress, ownerAddress, 1).send().deployed();
      initialBlockNumber = await pxe.getBlockNumber();
      logger.info(`Stateful test contract deployed at ${contract.address}`);
    });

    afterEach(() => teardown());

    it('detects an upcoming reorg and builds a block for the correct slot', async () => {
      // Advance to a fresh epoch and mark the current one as proven
      await cheatCodes.rollup.advanceToNextEpoch();
      await cheatCodes.rollup.markAsProven();

      // Send a tx to the contract that creates a note. This tx will be reorgd but re-included,
      // since it is being built against a proven block number.
      logger.info('Sending initial tx');
      const tx1 = await contract.methods.create_note(ownerAddress, ownerAddress, 20).send().wait();
      expect(tx1.blockNumber).toEqual(initialBlockNumber + 1);
      expect(await contract.methods.summed_values(ownerAddress).simulate()).toEqual(21n);

      // And send a second one, which won't be re-included.
      logger.info('Sending second tx');
      const tx2 = await contract.methods.create_note(ownerAddress, ownerAddress, 30).send().wait();
      expect(tx2.blockNumber).toEqual(initialBlockNumber + 2);
      expect(await contract.methods.summed_values(ownerAddress).simulate()).toEqual(51n);

      // Now move to a new epoch and past the proof claim window to cause a reorg
      logger.info('Advancing past the proof claim window');
      await cheatCodes.rollup.advanceToNextEpoch();
      await cheatCodes.rollup.advanceSlots(aztecEpochProofClaimWindowInL2Slots + 1); // off-by-one?

      // Wait until the sequencer kicks out tx1
      logger.info(`Waiting for node to prune tx1`);
      await retryUntil(
        async () => (await aztecNode.getTxReceipt(tx1.txHash)).status === TxStatus.PENDING,
        'wait for pruning',
        15,
        1,
      );

      // And wait until it is brought back tx1
      logger.info(`Waiting for node to re-include tx1`);
      await retryUntil(
        async () => (await aztecNode.getTxReceipt(tx1.txHash)).status === TxStatus.SUCCESS,
        'wait for re-inclusion',
        15,
        1,
      );

      // Tx1 should have been mined in a block with the same number but different hash now
      const newTx1Receipt = await aztecNode.getTxReceipt(tx1.txHash);
      expect(newTx1Receipt.blockNumber).toEqual(tx1.blockNumber);
      expect(newTx1Receipt.blockHash).not.toEqual(tx1.blockHash);

      // PXE should have cleared out the 30-note from tx2, but reapplied the 20-note from tx1
      expect(await contract.methods.summed_values(ownerAddress).simulate()).toEqual(21n);

      // And we should be able to send a new tx on the new chain
      logger.info('Sending new tx on reorgd chain');
      const tx3 = await contract.methods.create_note(ownerAddress, ownerAddress, 10).send().wait();
      expect(await contract.methods.summed_values(ownerAddress).simulate()).toEqual(31n);
      expect(tx3.blockNumber).toBeGreaterThanOrEqual(newTx1Receipt.blockNumber! + 1);
    });
  });
});

async function sendAndWait(calls: ContractFunctionInteraction[]) {
  return await Promise.allSettled(
    calls
      // First we send them all.
      .map(call => call.send())
      // Only then we wait.
      .map(p => p.wait()),
  );
}
