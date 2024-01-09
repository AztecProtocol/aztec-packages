import { getUnsafeSchnorrAccount, getUnsafeSchnorrWallet } from '@aztec/accounts/single_key';
import { AccountWallet } from '@aztec/aztec.js';
import { AztecAddress, Fq, Fr } from '@aztec/circuits.js';
import { DeployL1Contracts } from '@aztec/ethereum';
import { EasyPrivateTokenContract } from '@aztec/noir-contracts/EasyPrivateToken';

import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { EndToEndContext, setup } from './fixtures/utils.js';

describe('Aztec persistence', () => {
  let dataDirectory: string;

  let contract: EasyPrivateTokenContract;
  let contractAddress: AztecAddress;

  let ownerPrivateKey: Fq;
  let ownerWallet: AccountWallet;

  let deployL1ContractsValues: DeployL1Contracts;
  let context: EndToEndContext;

  beforeAll(async () => {
    dataDirectory = await mkdtemp(join(tmpdir(), 'aztec-node-'));

    const initialContext = await setup(0, { dataDirectory }, { dataDirectory });
    deployL1ContractsValues = initialContext.deployL1ContractsValues;

    ownerPrivateKey = Fq.random();
    ownerWallet = await getUnsafeSchnorrAccount(initialContext.pxe, ownerPrivateKey, Fr.ZERO).waitDeploy();

    const deployer = EasyPrivateTokenContract.deploy(ownerWallet, 1000n, ownerWallet.getAddress());
    await deployer.simulate({});

    contract = await deployer.send().deployed();
    contractAddress = contract.address;

    await initialContext.teardown();
  }, 100_000);

  beforeEach(async () => {
    context = await setup(0, { dataDirectory, deployL1ContractsValues }, { dataDirectory });

    ownerWallet = await getUnsafeSchnorrWallet(context.pxe, ownerWallet.getAddress(), ownerPrivateKey);
    contract = await EasyPrivateTokenContract.at(contractAddress, ownerWallet);
  });

  afterEach(async () => {
    await context.teardown();
  });

  it('should correctly restore balances', async () => {
    await expect(contract.methods.getBalance(ownerWallet.getAddress()).view()).resolves.toEqual(1000n);
  });

  it('should track new notes for the owner', async () => {
    await contract.methods.mint(1000n, ownerWallet.getAddress()).send().wait();
    await expect(contract.methods.getBalance(ownerWallet.getAddress()).view()).resolves.toEqual(2000n);
  });

  it('should transfer tokens from owner', async () => {
    const targetWallet = await getUnsafeSchnorrAccount(context.pxe, Fq.random(), Fr.ZERO).waitDeploy();

    await contract.methods.transfer(500n, ownerWallet.getAddress(), targetWallet.getAddress()).send().wait();

    const [ownerBalance, targetBalance] = await Promise.all([
      contract.methods.getBalance(ownerWallet.getAddress()).view(),
      contract.methods.getBalance(targetWallet.getAddress()).view(),
    ]);

    expect(ownerBalance).toEqual(1500n);
    expect(targetBalance).toEqual(500n);
  });
});
