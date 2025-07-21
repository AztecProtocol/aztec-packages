import { type InitialAccountData, deployFundedSchnorrAccount } from '@aztec/accounts/testing';
import type { AztecNodeService } from '@aztec/aztec-node';
import {
  type AccountWallet,
  type AztecAddress,
  type AztecNode,
  ContractDeployer,
  ContractFunctionInteraction,
  Fr,
  type Logger,
  type PXE,
  TxStatus,
  type Wallet,
  retryUntil,
  sleep,
} from '@aztec/aztec.js';
import { AnvilTestWatcher, CheatCodes } from '@aztec/aztec/testing';
import { asyncMap } from '@aztec/foundation/async-map';
import { times, unique } from '@aztec/foundation/collection';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { StatefulTestContract, StatefulTestContractArtifact } from '@aztec/noir-test-contracts.js/StatefulTest';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import type { BlockBuilder, SequencerClient } from '@aztec/sequencer-client';
import type { TestSequencerClient } from '@aztec/sequencer-client/test';
import { type PublicTxResult, PublicTxSimulator } from '@aztec/simulator/server';
import { getProofSubmissionDeadlineEpoch } from '@aztec/stdlib/epoch-helpers';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import { TX_ERROR_EXISTING_NULLIFIER, type Tx } from '@aztec/stdlib/tx';

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
  let aztecNodeAdmin: AztecNodeAdmin;
  let sequencer: TestSequencerClient;
  let watcher: AnvilTestWatcher | undefined;
  let teardown: () => Promise<void>;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('multi-txs block', () => {
    const artifact = StatefulTestContractArtifact;

    beforeAll(async () => {
      let sequencerClient: SequencerClient | undefined;
      let maybeAztecNodeAdmin: AztecNodeAdmin | undefined;
      ({
        teardown,
        pxe,
        logger,
        aztecNode,
        aztecNodeAdmin: maybeAztecNodeAdmin,
        wallets: [owner, minter],
        sequencer: sequencerClient,
      } = await setup(2, {
        archiverPollingIntervalMS: 200,
        transactionPollingIntervalMS: 200,
        worldStateBlockCheckIntervalMS: 200,
        blockCheckIntervalMS: 200,
      }));
      sequencer = sequencerClient! as TestSequencerClient;
      aztecNodeAdmin = maybeAztecNodeAdmin!;
    });

    beforeEach(async () => {
      await aztecNodeAdmin.setConfig({ minTxsPerBlock: 1 });
    });

    afterEach(async () => {
      await aztecNodeAdmin.setConfig({ minTxsPerBlock: 1 });
      // Clean up any mocks
      jest.restoreAllMocks();
    });

    afterAll(() => teardown());

    it('processes txs until hitting timetable', async () => {
      // We send enough txs so they are spread across multiple blocks, but not
      // so many so that we don't end up hitting a reorg or timing out the tx wait().
      const TX_COUNT = 16;

      const ownerAddress = owner.getCompleteAddress().address;
      const contract = await StatefulTestContract.deploy(owner, ownerAddress, 1).send().deployed();
      logger.info(`Deployed stateful test contract at ${contract.address}`);

      // We have to set minTxsPerBlock to 1 or we could end with dangling txs.
      // We also set enforceTimetable so the deadline makes sense, otherwise we may be starting the
      // block too late into the slot, and start processing when the deadline has already passed.
      logger.info(`Updating aztec node config`);
      await aztecNodeAdmin.setConfig({ minTxsPerBlock: 0, maxTxsPerBlock: TX_COUNT, enforceTimeTable: true });

      // We tweak the sequencer so it uses a fake simulator that adds a delay to every public tx.
      const TEST_PUBLIC_TX_SIMULATION_DELAY_MS = 300;
      interceptTxProcessorSimulate(
        aztecNode as AztecNodeService,
        async (tx: Tx, originalSimulate: (tx: Tx) => Promise<PublicTxResult>) => {
          await sleep(TEST_PUBLIC_TX_SIMULATION_DELAY_MS);
          return originalSimulate(tx);
        },
      );

      // We also cheat the sequencer's timetable so it allocates little time to processing.
      // This will leave the sequencer with just a few seconds to build the block, so it shouldn't
      // be able to squeeze in more than a few txs in each. This is sensitive to the time it takes
      // to pick up and validate the txs, so we may need to bump it to work on CI.
      jest
        .spyOn(sequencer.sequencer.timetable, 'getBlockProposalExecTimeEnd')
        .mockImplementation((secondsIntoSlot: number) => secondsIntoSlot + 1);

      // Flood the mempool with TX_COUNT simultaneous txs
      const methods = times(TX_COUNT, i => contract.methods.increment_public_value(ownerAddress, i));
      const provenTxs = await asyncMap(methods, method => method.prove());
      logger.info(`Sending ${TX_COUNT} txs to the node`);
      const txs = await Promise.all(provenTxs.map(tx => tx.send()));
      logger.info(`All ${TX_COUNT} txs have been sent`, { txs: await Promise.all(txs.map(tx => tx.getTxHash())) });

      // Await txs to be mined and assert they are mined across multiple different blocks.
      const receipts = await Promise.all(txs.map(tx => tx.wait()));
      const blockNumbers = receipts.map(r => r.blockNumber!).sort((a, b) => a - b);
      logger.info(`Txs mined on blocks: ${unique(blockNumbers)}`);
      expect(blockNumbers.at(-1)! - blockNumbers[0]).toBeGreaterThan(1);
    });

    it('assembles a block with multiple txs', async () => {
      // Assemble N contract deployment txs
      // We need to create them sequentially since we cannot have parallel calls to a circuit
      const TX_COUNT = 8;
      await aztecNodeAdmin.setConfig({ minTxsPerBlock: TX_COUNT });
      const deployer = new ContractDeployer(artifact, owner);

      const ownerAddress = owner.getCompleteAddress().address;
      // Need to have value > 0, so adding + 1
      // We need to do so, because noir currently will fail if the multiscalarmul is in an `if`
      // that we DO NOT enter. This should be fixed by https://github.com/noir-lang/noir/issues/5045.
      const methods = times(TX_COUNT, i => deployer.deploy(ownerAddress, i + 1));
      const provenTxs = [];
      for (let i = 0; i < TX_COUNT; i++) {
        provenTxs.push(
          await methods[i].prove({
            contractAddressSalt: new Fr(BigInt(i + 1)),
            skipClassPublication: true,
            skipInstancePublication: true,
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
      const isContractDeployed = async (address: AztecAddress) =>
        !!(await pxe.getContractMetadata(address)).contractInstance;
      const areDeployed = await Promise.all(receipts.map(r => isContractDeployed(r.contract.address)));
      expect(areDeployed).toEqual(times(TX_COUNT, () => true));
    });

    it('assembles a block with multiple txs with public fns', async () => {
      // First deploy the contract
      const ownerAddress = owner.getCompleteAddress().address;
      const contract = await StatefulTestContract.deploy(owner, ownerAddress, 1).send().deployed();

      // Assemble N contract deployment txs
      // We need to create them sequentially since we cannot have parallel calls to a circuit
      const TX_COUNT = 4;
      await aztecNodeAdmin.setConfig({ minTxsPerBlock: TX_COUNT });

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

    // Tests that public function simulation time is not affected by the size of the nullifier tree.
    // Skipped since we only use it to manually test number of invocations to world-state.
    it.skip('builds blocks with multiple public fns after multiple nullifier insertions', async () => {
      // First deploy the contracts
      const ownerAddress = owner.getCompleteAddress().address;
      const contract = await StatefulTestContract.deploy(owner, ownerAddress, 1).send().deployed();
      const another = await TestContract.deploy(owner).send().deployed();

      await aztecNodeAdmin.setConfig({ minTxsPerBlock: 16, maxTxsPerBlock: 16 });

      // Flood nullifiers to grow the size of the nullifier tree.
      // Can probably do this more efficiently by batching multiple emit_nullifier calls
      // per tx using batch calls.
      const NULLIFIER_COUNT = 128;
      const sentNullifierTxs = [];
      for (let i = 0; i < NULLIFIER_COUNT; i++) {
        sentNullifierTxs.push(another.methods.emit_nullifier(Fr.random()).send());
      }
      await Promise.all(sentNullifierTxs.map(tx => tx.wait({ timeout: 600 })));
      logger.info(`Nullifier txs sent`);

      await aztecNodeAdmin.setConfig({ minTxsPerBlock: 4, maxTxsPerBlock: 4 });

      // Now send public functions
      const TX_COUNT = 128;
      const sentTxs = [];
      for (let i = 0; i < TX_COUNT; i++) {
        sentTxs.push(contract.methods.increment_public_value(ownerAddress, i).send());
      }

      await Promise.all(sentTxs.map(tx => tx.wait({ timeout: 600 })));
      logger.info(`Txs sent`);
    });

    it.skip('can call public function from different tx in same block as deployed', async () => {
      // Ensure both txs will land on the same block
      await aztecNodeAdmin.setConfig({ minTxsPerBlock: 2 });

      // Deploy a contract in the first transaction
      // In the same block, call a public method on the contract
      const deployer = TokenContract.deploy(owner, owner.getCompleteAddress(), 'TokenName', 'TokenSymbol', 18);
      await deployer.create();

      // We can't use `TokenContract.at` to call a function because it checks the contract is deployed
      // but we are in the same block as the deployment transaction
      const deployerInstance = await deployer.getInstance();
      const callInteraction = new ContractFunctionInteraction(
        owner,
        deployerInstance.address,
        TokenContract.artifact.functions.find(x => x.name === 'set_minter')!,
        [minter.getCompleteAddress(), true],
      );

      const deployerTx = await deployer.prove({});
      const callInteractionTx = await callInteraction.prove();

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
        await expect(contract.methods.emit_nullifier(nullifier).send().wait()).rejects.toThrow(
          TX_ERROR_EXISTING_NULLIFIER,
        );
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
        await expect(contract.methods.emit_nullifier(nullifier).send().wait()).rejects.toThrow(
          TX_ERROR_EXISTING_NULLIFIER,
        );
      });
    });
  });

  describe('logs in nested calls are ordered as expected', () => {
    // This test was originally written for e2e_nested, but it was refactored
    // to not use TestContract.
    let testContract: TestContract;
    let ownerWallet: AccountWallet;
    let owner: InitialAccountData;

    beforeAll(async () => {
      ({
        teardown,
        pxe,
        logger,
        wallet: ownerWallet,
        initialFundedAccounts: [owner],
      } = await setup(1));
      logger.info(`Deploying test contract`);
      testContract = await TestContract.deploy(ownerWallet).send().deployed();
    }, 60_000);

    afterAll(() => teardown());

    it('calls a method with nested encrypted logs', async () => {
      const address = owner.address;

      const values = {
        value0: 5n,
        value1: 4n,
        value2: 3n,
        value3: 2n,
        value4: 1n,
      };
      const nestedValues = {
        value0: 0n,
        value1: 0n,
        value2: 0n,
        value3: 0n,
        value4: 0n,
      };

      // call test contract
      const valuesAsArray = Object.values(values);

      const action = testContract.methods.emit_array_as_encrypted_log(valuesAsArray, address, true);
      const tx = await action.prove();
      const rct = await tx.send().wait();

      // compare logs
      expect(rct.status).toEqual('success');
      const privateLogs = tx.data.getNonEmptyPrivateLogs();
      expect(privateLogs.length).toBe(3);

      // The first two logs are encrypted.
      const events = await pxe.getPrivateEvents(
        testContract.address,
        TestContract.events.ExampleEvent,
        rct.blockNumber!,
        1,
        [address],
      );
      expect(events[0]).toEqual(values);
      expect(events[1]).toEqual(nestedValues);

      // The last log is not encrypted.
      // The first field is the first value and is siloed with contract address by the kernel circuit.
      const expectedFirstField = await poseidon2Hash([testContract.address, valuesAsArray[0]]);
      expect(privateLogs[2].fields.slice(0, 5).map((f: Fr) => f.toBigInt())).toEqual([
        expectedFirstField.toBigInt(),
        ...valuesAsArray.slice(1),
      ]);
    }, 60_000);
  });

  describe('regressions', () => {
    afterEach(async () => {
      if (teardown) {
        await teardown();
      }
    });

    // Regression for https://github.com/AztecProtocol/aztec-packages/issues/7918
    it('publishes two empty blocks', async () => {
      ({ teardown, pxe, logger, aztecNode } = await setup(0, {
        minTxsPerBlock: 0,
        skipProtocolContracts: true,
      }));

      await retryUntil(async () => (await aztecNode.getBlockNumber()) >= 3, 'wait-block', 10, 1);
    });

    // Regression for https://github.com/AztecProtocol/aztec-packages/issues/7537
    it('sends a tx on the first block', async () => {
      const context = await setup(0, {
        minTxsPerBlock: 0,
        skipProtocolContracts: true,
        numberOfInitialFundedAccounts: 1,
      });
      ({ teardown, pxe, logger, aztecNode } = context);
      await sleep(1000);

      await deployFundedSchnorrAccount(pxe, context.initialFundedAccounts[0]);
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
        ethereumSlotDuration: 6,
      }));

      logger.info('Deploying token contract');
      const token = await TokenContract.deploy(owner, owner.getCompleteAddress(), 'TokenName', 'TokenSymbol', 18)
        .send()
        .deployed();

      logger.info('Updating txs per block to 4');
      await aztecNodeAdmin.setConfig({ minTxsPerBlock: 4, maxTxsPerBlock: 4 });

      logger.info('Spamming the network with public txs');
      const txs = [];
      for (let i = 0; i < 24; i++) {
        const tx = token.methods.mint_to_public(owner.getAddress(), 10n);
        txs.push(tx.send());
      }

      logger.info('Waiting for txs to be mined');
      await Promise.all(txs.map(tx => tx.wait({ timeout: 600 })));
    });
  });

  // Due to #13723, this test is disabled.
  // TODO: bring back once fixed: #13770
  describe.skip('reorgs', () => {
    let contract: StatefulTestContract;
    let cheatCodes: CheatCodes;
    let ownerAddress: AztecAddress;
    let initialBlockNumber: number;
    let teardown: () => Promise<void>;

    beforeEach(async () => {
      ({ teardown, aztecNode, pxe, logger, wallet: owner, cheatCodes, watcher } = await setup(1));

      ownerAddress = owner.getCompleteAddress().address;
      contract = await StatefulTestContract.deploy(owner, ownerAddress, 1).send().deployed();
      initialBlockNumber = await pxe.getBlockNumber();
      logger.info(`Stateful test contract deployed at ${contract.address}`);

      await cheatCodes.rollup.advanceToNextEpoch();

      const bn = await aztecNode.getBlockNumber();
      while ((await aztecNode.getProvenBlockNumber()) < bn) {
        await sleep(1000);
      }

      watcher!.setIsMarkingAsProven(false);
    });

    afterEach(() => teardown());

    it('detects an upcoming reorg and builds a block for the correct slot', async () => {
      // Advance to a fresh epoch and mark the current one as proven
      await cheatCodes.rollup.advanceToNextEpoch();
      await cheatCodes.rollup.markAsProven();

      // Send a tx to the contract that creates a note. This tx will be reorgd but re-included,
      // since it is being built against a proven block number.
      logger.info('Sending initial tx');
      const tx1 = await contract.methods.create_note(ownerAddress, 20).send().wait();
      expect(tx1.blockNumber).toEqual(initialBlockNumber + 1);
      expect(await contract.methods.summed_values(ownerAddress).simulate()).toEqual(21n);

      // And send a second one, which won't be re-included.
      logger.info('Sending second tx');
      const tx2 = await contract.methods.create_note(ownerAddress, 30).send().wait();
      expect(tx2.blockNumber).toEqual(initialBlockNumber + 2);
      expect(await contract.methods.summed_values(ownerAddress).simulate()).toEqual(51n);

      logger.info('Advancing past the proof submission window');
      await cheatCodes.rollup.advanceToEpoch(
        getProofSubmissionDeadlineEpoch(0n, {
          proofSubmissionEpochs: 1,
        }),
      );

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
      const tx3 = await contract.methods.create_note(ownerAddress, 10).send().wait();
      expect(await contract.methods.summed_values(ownerAddress).simulate()).toEqual(31n);
      expect(tx3.blockNumber).toBeGreaterThanOrEqual(newTx1Receipt.blockNumber! + 1);
    });
  });

  const interceptTxProcessorSimulate = (
    node: AztecNodeService,
    stub: (tx: Tx, originalSimulate: (tx: Tx) => Promise<PublicTxResult>) => Promise<PublicTxResult>,
  ) => {
    const blockBuilder: BlockBuilder = (node as any).sequencer.sequencer.blockBuilder;
    const originalCreateDeps = blockBuilder.makeBlockBuilderDeps.bind(blockBuilder);
    jest
      .spyOn(blockBuilder, 'makeBlockBuilderDeps')
      .mockImplementation(async (...args: Parameters<BlockBuilder['makeBlockBuilderDeps']>) => {
        logger.warn('Creating mocked public tx simulator');
        const deps = await originalCreateDeps(...args);
        const simulator: PublicTxSimulator = (deps.processor as any).publicTxSimulator;
        const originalSimulate = simulator.simulate.bind(simulator);
        jest.spyOn(simulator, 'simulate').mockImplementation((tx: Tx) => stub(tx, originalSimulate));
        return deps;
      });
  };
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
