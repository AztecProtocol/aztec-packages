import { type InitialAccountData, getInitialTestAccounts } from '@aztec/accounts/testing';
import type { Wallet } from '@aztec/aztec.js';
import { Fr } from '@aztec/foundation/fields';
import type { LogFn } from '@aztec/foundation/log';
import { FPCContract } from '@aztec/noir-contracts.js/FPC';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { type ContractInstanceWithAddress, getContractInstanceFromInstantiationParams } from '@aztec/stdlib/contract';
import type { PXE } from '@aztec/stdlib/interfaces/client';

const BANANA_COIN_SALT = new Fr(0);
const bananaCoinArgs = {
  name: 'BC',
  symbol: 'BC',
  decimal: 18n,
};

const BANANA_FPC_SALT = new Fr(0);

function getBananaAdmin(initialAccounts: InitialAccountData[]): AztecAddress {
  return initialAccounts[0]?.address ?? AztecAddress.ZERO;
}

async function getBananaCoinInstance(initialAccounts: InitialAccountData[]): Promise<ContractInstanceWithAddress> {
  const admin = getBananaAdmin(initialAccounts);
  return await getContractInstanceFromInstantiationParams(TokenContract.artifact, {
    constructorArgs: [admin, bananaCoinArgs.name, bananaCoinArgs.symbol, bananaCoinArgs.decimal],
    salt: BANANA_COIN_SALT,
  });
}

export async function getBananaCoinAddress(initialAccounts: InitialAccountData[]) {
  return (await getBananaCoinInstance(initialAccounts)).address;
}

async function getBananaFPCInstance(initialAccounts: InitialAccountData[]): Promise<ContractInstanceWithAddress> {
  const bananaCoin = await getBananaCoinAddress(initialAccounts);
  const admin = getBananaAdmin(initialAccounts);
  return await getContractInstanceFromInstantiationParams(FPCContract.artifact, {
    constructorArgs: [bananaCoin, admin],
    salt: BANANA_FPC_SALT,
  });
}

export async function getBananaFPCAddress(initialAccounts: InitialAccountData[]) {
  return (await getBananaFPCInstance(initialAccounts)).address;
}

export async function setupBananaFPC(initialAccounts: InitialAccountData[], deployer: Wallet, log: LogFn) {
  const bananaCoinAddress = await getBananaCoinAddress(initialAccounts);
  const admin = getBananaAdmin(initialAccounts);
  const [bananaCoin, fpc] = await Promise.all([
    TokenContract.deploy(deployer, admin, bananaCoinArgs.name, bananaCoinArgs.symbol, bananaCoinArgs.decimal)
      .send({ contractAddressSalt: BANANA_COIN_SALT, universalDeploy: true })
      .deployed(),
    FPCContract.deploy(deployer, bananaCoinAddress, admin)
      .send({ contractAddressSalt: BANANA_FPC_SALT, universalDeploy: true })
      .deployed(),
  ]);

  log(`BananaCoin: ${bananaCoin.address}`);
  log(`FPC: ${fpc.address}`);
}

export async function getDeployedBananaCoinAddress(pxe: PXE) {
  const initialAccounts = await getInitialTestAccounts();
  const bananaCoin = await getBananaCoinAddress(initialAccounts);
  const contracts = await pxe.getContracts();
  if (!contracts.find(c => c.equals(bananaCoin))) {
    throw new Error('BananaCoin not deployed.');
  }
  return bananaCoin;
}

export async function getDeployedBananaFPCAddress(pxe: PXE) {
  const initialAccounts = await getInitialTestAccounts();
  const fpc = await getBananaFPCInstance(initialAccounts);
  const contracts = await pxe.getContracts();
  if (!contracts.find(c => c.equals(fpc.address))) {
    throw new Error('BananaFPC not deployed.');
  }
  return fpc.address;
}
