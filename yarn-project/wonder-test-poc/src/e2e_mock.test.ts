import { createAccount } from '@aztec/accounts/testing';
import { PXE, Wallet, createPXEClient, waitForPXE } from '@aztec/aztec.js';

import { MeaningOfLifeContract } from './artifacts/MeaningOfLife.js';

let pxe: PXE;
let testContract: MeaningOfLifeContract;

let deployer: Wallet;

const setupSandbox = async () => {
  const { PXE_URL = 'http://localhost:8080' } = process.env;
  const pxe = createPXEClient(PXE_URL);
  await waitForPXE(pxe);
  return pxe;
};

// Setup: Set the sandbox
beforeAll(async () => {
  pxe = await setupSandbox();
}, 120_000);

describe('E2E Mock MeaningOfLife', () => {
  beforeEach(async () => {
    deployer = await createAccount(pxe);
    testContract = await MeaningOfLifeContract.deploy(deployer).send().deployed();
  }, 120_000);

  it('Deploys', async () => {
    expect(testContract).toBeDefined();
  });

  it('views unconstrained fn', async () => {
    let result = await testContract.methods.get_meaning_of_life().view();
    expect(result).toEqual(42n);
  });

  it('does private calls', async () => {
    let receipt = await testContract.methods.set_value(1337n).send().wait({ debug: true });

    const { noteHashes } = receipt.debugInfo!;
    expect(noteHashes.length).toEqual(1);
  });

  it('does public calls', async () => {
    await testContract.methods.public_function_to_call(1337n).send().wait();

    let result = await testContract.methods.get_public_value().view();

    expect(result).toEqual(1337n);
  });

  it('reads from public storage slot', async () => {
    await testContract.methods.public_function_to_call(1337n).send().wait();

    let storageSlot = await testContract.methods.get_public_storage_slot().view();

    let result = await pxe.getPublicStorageAt(testContract.address, storageSlot);

    expect(result.toBigInt()).toEqual(1337n);
  });

  it('reads from public storage slot immutable', async () => {
    let storageSlot = await testContract.methods.get_public_immutable_storage_slot().view();

    let result = await pxe.getPublicStorageAt(testContract.address, storageSlot);

    expect(result.toBigInt()).toEqual(404n);
  });
});
