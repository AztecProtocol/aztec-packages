import { BatchCall, type DebugLogger, Fr, type PXE, SignerlessWallet, type Wallet } from '@aztec/aztec.js';
import { siloNullifier } from '@aztec/circuits.js/hash';
import { StatefulTestContract } from '@aztec/noir-contracts.js';
import { TestContract } from '@aztec/noir-contracts.js/Test';

import { DeployTest, type StatefulContractCtorArgs } from './deploy_test.js';

describe('e2e_deploy_contract private initialization', () => {
  const t = new DeployTest('private initialization');

  let pxe: PXE;
  let logger: DebugLogger;
  let wallet: Wallet;

  beforeAll(async () => {
    ({ pxe, logger, wallet } = await t.setup());
  });

  afterAll(() => t.teardown());

  // Tests calling a private function in an uninitialized and undeployed contract. Note that
  // it still requires registering the contract artifact and instance locally in the pxe.
  test.each(['as entrypoint', 'from an account contract'] as const)(
    'executes a function in an undeployed contract %s',
    async kind => {
      const testWallet = kind === 'as entrypoint' ? new SignerlessWallet(pxe) : wallet;
      const contract = await t.registerContract(testWallet, TestContract);
      const receipt = await contract.methods.emit_nullifier(10).send().wait({ debug: true });
      const expected = siloNullifier(contract.address, new Fr(10));
      expect(receipt.debugInfo?.nullifiers[1]).toEqual(expected);
    },
  );

  // Tests privately initializing an undeployed contract. Also requires pxe registration in advance.
  test.each([
    'as entrypoint', 
    'from an account contract'
  ] as const)(
    'privately initializes an undeployed contract %s',
    async kind => {
      const owner = await t.registerRandomAccount();

      // TODO: This is a bit weird, but we need away to specify what scoped oracle db to use
      const testWallet = kind === 'as entrypoint' ? new SignerlessWallet(pxe, undefined, owner) : wallet;
      const outgoingViewer = owner;
      const initArgs: StatefulContractCtorArgs = [owner.address, outgoingViewer, 42];
      const contract = await t.registerContract(testWallet, StatefulTestContract, { initArgs });
      logger.info(`Calling the constructor for ${contract.address}`);

      const tx = await contract.methods
        .constructor(...initArgs)
        .send()
        .wait();

      if (kind === 'from an account contract') {
        const [newlyCreatedNote] = await pxe.getIncomingNotes({txHash: tx.txHash}, owner.address);
        await pxe.addNote(newlyCreatedNote, wallet.getAddress());
      }

      logger.info(`Checking if the constructor was run for ${contract.address}`);
      expect(await contract.methods.summed_values(owner).simulate()).toEqual(42n);
      logger.info(`Calling a private function that requires initialization on ${contract.address}`);
      const tx2 = await contract.methods.create_note(owner, outgoingViewer, 10).send().wait();

      if (kind === 'from an account contract') {
        const [newlyCreatedNote] = await pxe.getIncomingNotes({txHash: tx2.txHash}, owner.address)
        await pxe.addNote(newlyCreatedNote, wallet.getAddress());
      }

      expect(await contract.methods.summed_values(owner).simulate()).toEqual(52n);
    },
  );

  // Tests privately initializing multiple undeployed contracts on the same tx through an account contract.
  it('initializes multiple undeployed contracts in a single tx', async () => {
    const { address: owner } = await t.registerRandomAccount();
    const initArgs: StatefulContractCtorArgs[] = [42, 52].map(value => [owner, owner, value]);
    const contracts = await Promise.all(
      initArgs.map(initArgs => t.registerContract(wallet, StatefulTestContract, { initArgs })),
    );
    const calls = contracts.map((c, i) => c.methods.constructor(...initArgs[i]).request());
    const tx = await new BatchCall(wallet, calls).send().wait();
    const newlyCreatedNotes = await pxe.getIncomingNotes({txHash: tx.txHash}, owner)

    await Promise.all(newlyCreatedNotes.map(note => pxe.addNote(note, wallet.getAddress())));

    expect(await contracts[0].methods.summed_values(owner).simulate()).toEqual(42n);
    expect(await contracts[1].methods.summed_values(owner).simulate()).toEqual(52n);
  });

  // TODO(@spalladino): This won't work until we can read a nullifier in the same tx in which it was emitted.
  it.skip('initializes and calls a private function in a single tx', async () => {
    const owner = await t.registerRandomAccount();
    const initArgs: StatefulContractCtorArgs = [owner, owner, 42];
    const contract = await t.registerContract(wallet, StatefulTestContract, { initArgs });
    const outgoingViewer = owner;
    const batch = new BatchCall(wallet, [
      contract.methods.constructor(...initArgs).request(),
      contract.methods.create_note(owner, outgoingViewer, 10).request(),
    ]);
    logger.info(`Executing constructor and private function in batch at ${contract.address}`);
    await batch.send().wait();
    expect(await contract.methods.summed_values(owner).simulate()).toEqual(52n);
  });

  it('refuses to initialize a contract twice', async () => {
    const owner = await t.registerRandomAccount();
    const initArgs: StatefulContractCtorArgs = [owner, owner, 42];
    const contract = await t.registerContract(wallet, StatefulTestContract, { initArgs });
    await contract.methods
      .constructor(...initArgs)
      .send()
      .wait();
    await expect(
      contract.methods
        .constructor(...initArgs)
        .send()
        .wait(),
    ).rejects.toThrow(/dropped/);
  });

  it('refuses to call a private function that requires initialization', async () => {
    const owner = await t.registerRandomAccount();
    const initArgs: StatefulContractCtorArgs = [owner, owner, 42];
    const contract = await t.registerContract(wallet, StatefulTestContract, { initArgs });
    // TODO(@spalladino): It'd be nicer to be able to fail the assert with a more descriptive message.
    const outgoingViewer = owner;
    await expect(contract.methods.create_note(owner, outgoingViewer, 10).send().wait()).rejects.toThrow(
      /nullifier witness not found/i,
    );
  });

  it('refuses to initialize a contract with incorrect args', async () => {
    const owner = await t.registerRandomAccount();
    const outgoingViewer = owner;
    const contract = await t.registerContract(wallet, StatefulTestContract, { initArgs: [owner, outgoingViewer, 42] });
    await expect(contract.methods.constructor(owner, outgoingViewer, 43).prove()).rejects.toThrow(
      /Initialization hash does not match/,
    );
  });

  it('refuses to initialize an instance from a different deployer', async () => {
    const owner = await t.registerRandomAccount();
    const outgoingViewer = owner;
    const contract = await t.registerContract(wallet, StatefulTestContract, {
      initArgs: [owner, outgoingViewer, 42],
      deployer: owner.address,
    });
    await expect(contract.methods.constructor(owner, outgoingViewer, 42).prove()).rejects.toThrow(
      /Initializer address is not the contract deployer/i,
    );
  });
});
