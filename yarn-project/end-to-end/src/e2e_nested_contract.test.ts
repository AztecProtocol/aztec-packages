import { AztecNodeService } from '@aztec/aztec-node';
import { AztecAddress, AztecRPCServer, Contract, ContractDeployer, Fr, TxStatus } from '@aztec/aztec.js';
import { ContractAbi } from '@aztec/foundation/abi';
import { DebugLogger } from '@aztec/foundation/log';
import { ChildAbi, ParentAbi } from '@aztec/noir-contracts/examples';

import { toBigInt } from '@aztec/foundation/serialize';
import { setup } from './setup.js';

describe('e2e_nested_contract', () => {
  let aztecNode: AztecNodeService;
  let aztecRpcServer: AztecRPCServer;
  let accounts: AztecAddress[];
  let logger: DebugLogger;

  let parentContract: Contract;
  let childContract: Contract;

  beforeEach(async () => {
    ({ aztecNode, aztecRpcServer, accounts, logger } = await setup());

    parentContract = await deployContract(ParentAbi);
    childContract = await deployContract(ChildAbi);
  }, 30_000);

  afterEach(async () => {
    await aztecNode.stop();
    await aztecRpcServer.stop();
  });

  const deployContract = async (abi: ContractAbi) => {
    logger(`Deploying L2 contract ${abi.name}...`);
    const deployer = new ContractDeployer(abi, aztecRpcServer);
    const tx = deployer.deploy().send();

    await tx.isMined(0, 0.1);

    const receipt = await tx.getReceipt();
    const contract = new Contract(receipt.contractAddress!, abi, aztecRpcServer);
    logger(`L2 contract ${abi.name} deployed at ${contract.address}`);
    return contract;
  };

  const addressToField = (address: AztecAddress): bigint => Fr.fromBuffer(address.toBuffer()).value;

  const getChildStoredValue = (child: { address: AztecAddress }) =>
    aztecNode.getStorageAt(child.address, 1n).then(x => toBigInt(x!));

  /**
   * Milestone 3.
   */
  it('performs nested calls', async () => {
    const tx = parentContract.methods
      .entryPoint(childContract.address, Fr.fromBuffer(childContract.methods.value.selector))
      .send({ from: accounts[0] });

    await tx.isMined(0, 0.1);
    const receipt = await tx.getReceipt();

    expect(receipt.status).toBe(TxStatus.MINED);
  }, 100_000);

  it('performs public nested calls', async () => {
    const tx = parentContract.methods
      .pubEntryPoint(childContract.address, Fr.fromBuffer(childContract.methods.pubValue.selector), 42n)
      .send({ from: accounts[0] });

    await tx.isMined(0, 0.1);
    const receipt = await tx.getReceipt();

    expect(receipt.status).toBe(TxStatus.MINED);
  }, 100_000);

  it('enqueues a public call', async () => {
    const tx = parentContract.methods
      .enqueueCallToChild(childContract.address, Fr.fromBuffer(childContract.methods.pubStoreValue.selector), 42n)
      .send({ from: accounts[0] });

    await tx.isMined(0, 0.1);
    const receipt = await tx.getReceipt();
    expect(receipt.status).toBe(TxStatus.MINED);

    expect(await getChildStoredValue(childContract)).toEqual(42n);
  }, 100_000);

  // Fails with "solver opcode resolution error: cannot solve opcode: expression has too many unknowns %EXPR [ 0 ]%"
  // See https://github.com/noir-lang/noir/issues/1347
  it.skip('enqueues multiple public calls', async () => {
    const tx = parentContract.methods
      .enqueueCallToChildTwice(
        addressToField(childContract.address),
        Fr.fromBuffer(childContract.methods.pubStoreValue.selector).value,
        42n,
      )
      .send({ from: accounts[0] });

    await tx.isMined(0, 0.1);
    const receipt = await tx.getReceipt();
    expect(receipt.status).toBe(TxStatus.MINED);

    expect(await getChildStoredValue(childContract)).toEqual(85n);
  }, 100_000);

  it('enqueues a public call with nested public calls', async () => {
    const tx = parentContract.methods
      .enqueueCallToPubEntryPoint(
        childContract.address,
        Fr.fromBuffer(childContract.methods.pubStoreValue.selector),
        42n,
      )
      .send({ from: accounts[0] });

    await tx.isMined(0, 0.1);
    const receipt = await tx.getReceipt();
    expect(receipt.status).toBe(TxStatus.MINED);

    expect(await getChildStoredValue(childContract)).toEqual(42n);
  }, 100_000);

  // Fails with "solver opcode resolution error: cannot solve opcode: expression has too many unknowns %EXPR [ 0 ]%"
  // See https://github.com/noir-lang/noir/issues/1347
  it.skip('enqueues multiple public calls with nested public calls', async () => {
    const tx = parentContract.methods
      .enqueueCallsToPubEntryPoint(
        childContract.address,
        Fr.fromBuffer(childContract.methods.pubStoreValue.selector),
        42n,
      )
      .send({ from: accounts[0] });

    await tx.isMined(0, 0.1);
    const receipt = await tx.getReceipt();
    expect(receipt.status).toBe(TxStatus.MINED);

    expect(await getChildStoredValue(childContract)).toEqual(84n);
  }, 100_000);

  // Regression for https://github.com/AztecProtocol/aztec-packages/issues/640
  // Fails with "solver opcode resolution error: cannot solve opcode: expression has too many unknowns %EXPR [ 0 ]%"
  // See https://github.com/noir-lang/noir/issues/1347
  it.skip('reads fresh value after write within the same tx', async () => {
    const tx = parentContract.methods
      .pubEntryPointTwice(
        addressToField(childContract.address),
        Fr.fromBuffer(childContract.methods.pubStoreValue.selector).value,
        42n,
      )
      .send({ from: accounts[0] });

    await tx.isMined(0, 0.1);
    const receipt = await tx.getReceipt();

    expect(receipt.status).toBe(TxStatus.MINED);
    expect(await getChildStoredValue(childContract)).toEqual(85n);
  }, 100_000);
});
