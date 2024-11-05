import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { createAccount } from '@aztec/accounts/testing';
import {
  type AztecAddress,
  type AztecNode,
  type CheatCodes,
  ContractDeployer,
  ContractFunctionInteraction,
  type DebugLogger,
  Fq,
  Fr,
  L1NotePayload,
  type PXE,
  TxStatus,
  type Wallet,
  deriveKeys,
  retryUntil,
  sleep,
} from '@aztec/aztec.js';
import { AZTEC_EPOCH_PROOF_CLAIM_WINDOW_IN_L2_SLOTS } from '@aztec/circuits.js';
import { times } from '@aztec/foundation/collection';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto';
import { StatefulTestContract, StatefulTestContractArtifact } from '@aztec/noir-contracts.js';
import { TestContract } from '@aztec/noir-contracts.js/Test';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { createPXEService, getPXEServiceConfig } from '@aztec/pxe';

import 'jest-extended';

import { DUPLICATE_NULLIFIER_ERROR } from './fixtures/fixtures.js';
import { setup } from './fixtures/utils.js';

describe('e2e_block_building', () => {
  let pxe: PXE;
  let logger: DebugLogger;
  let owner: Wallet;
  let minter: Wallet;
  let aztecNode: AztecNode;
  let teardown: () => Promise<void>;

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
      const outgoingViewer = ownerAddress;
      // Need to have value > 0, so adding + 1
      // We need to do so, because noir currently will fail if the multiscalarmul is in an `if`
      // that we DO NOT enter. This should be fixed by https://github.com/noir-lang/noir/issues/5045.
      const methods = times(TX_COUNT, i => deployer.deploy(ownerAddress, outgoingViewer, i + 1));
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
      const outgoingViewer = thisWallet.getAddress();

      // call test contract
      const action = testContract.methods.emit_encrypted_logs_nested(10, thisWallet.getAddress(), outgoingViewer);
      const tx = await action.prove();
      const rct = await tx.send().wait();

      // compare logs
      expect(rct.status).toEqual('success');
      const noteValues = tx.noteEncryptedLogs.unrollLogs().map(l => {
        const notePayload = L1NotePayload.decryptAsIncoming(l.data, thisWallet.getEncryptionSecret());
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
      const outgoingViewer = thisWallet.getAddress();

      // call test contract
      const action = testContract.methods.emit_array_as_encrypted_log(
        [5, 4, 3, 2, 1],
        thisWallet.getAddress(),
        outgoingViewer,
        true,
      );
      const tx = await action.prove();
      const rct = await tx.send().wait();

      // compare logs
      expect(rct.status).toEqual('success');
      const encryptedLogs = tx.encryptedLogs.unrollLogs();
      expect(encryptedLogs[0].maskedContractAddress).toEqual(
        poseidon2HashWithSeparator([testContract.address, new Fr(5)], 0),
      );
      expect(encryptedLogs[1].maskedContractAddress).toEqual(
        poseidon2HashWithSeparator([testContract.address, new Fr(5)], 0),
      );
      // Setting randomness = 0 in app means 'do not mask the address'
      expect(encryptedLogs[2].maskedContractAddress).toEqual(testContract.address.toField());

      // TODO(1139 | 6408): We currently encrypted generic event logs the same way as notes, so the below
      // will likely not be useful when complete.
      // const decryptedLogs = encryptedLogs.map(l => TaggedNote.decryptAsIncoming(l.data, keys.masterIncomingViewingSecretKey));
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

      logger.info('Updating min txs per block to 4');
      await aztecNode.setConfig({ minTxsPerBlock: 4 });

      logger.info('Spamming the network with public txs');
      const txs = [];
      for (let i = 0; i < 30; i++) {
        const tx = token.methods.mint_public(owner.getAddress(), 10n);
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

      // Send a tx to the contract that updates the public data tree, this should take the first slot
      logger.info('Sending initial tx');
      const tx1 = await contract.methods.increment_public_value(ownerAddress, 20).send().wait();
      expect(tx1.blockNumber).toEqual(initialBlockNumber + 1);
      expect(await contract.methods.get_public_value(ownerAddress).simulate()).toEqual(20n);

      // Now move to a new epoch and past the proof claim window to cause a reorg
      logger.info('Advancing past the proof claim window');
      await cheatCodes.rollup.advanceToNextEpoch();
      await cheatCodes.rollup.advanceSlots(AZTEC_EPOCH_PROOF_CLAIM_WINDOW_IN_L2_SLOTS + 1); // off-by-one?

      // Wait a bit before spawning a new pxe
      await sleep(2000);

      // tx1 is valid because it was build against a proven block number
      // the sequencer will bring it back on chain
      await retryUntil(
        async () => (await aztecNode.getTxReceipt(tx1.txHash)).status === TxStatus.SUCCESS,
        'wait for re-inclusion',
        60,
        1,
      );

      const newTx1Receipt = await aztecNode.getTxReceipt(tx1.txHash);
      expect(newTx1Receipt.blockNumber).toEqual(tx1.blockNumber);
      expect(newTx1Receipt.blockHash).not.toEqual(tx1.blockHash);

      // Send another tx which should be mined a block that is built on the reorg'd chain
      // We need to send it from a new pxe since pxe doesn't detect reorgs (yet)
      logger.info(`Creating new PXE service`);
      const pxeServiceConfig = { ...getPXEServiceConfig() };
      const newPxe = await createPXEService(aztecNode, pxeServiceConfig);
      const newWallet = await createAccount(newPxe);

      // TODO: Contract.at should automatically register the instance in the pxe
      logger.info(`Registering contract at ${contract.address} in new pxe`);
      await newPxe.registerContract({ instance: contract.instance, artifact: StatefulTestContractArtifact });
      const contractFromNewPxe = await StatefulTestContract.at(contract.address, newWallet);

      logger.info('Sending new tx on reorgd chain');
      const tx2 = await contractFromNewPxe.methods.increment_public_value(ownerAddress, 10).send().wait();
      expect(await contractFromNewPxe.methods.get_public_value(ownerAddress).simulate()).toEqual(30n);
      expect(tx2.blockNumber).toEqual(initialBlockNumber + 3);
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
