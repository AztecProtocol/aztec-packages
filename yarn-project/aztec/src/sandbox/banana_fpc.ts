import { type InitialAccountData, getInitialTestAccountsData } from '@aztec/accounts/testing';
import type { Wallet } from '@aztec/aztec.js';
import { Fr } from '@aztec/foundation/fields';
import type { LogFn } from '@aztec/foundation/log';
import { FPCContract } from '@aztec/noir-contracts.js/FPC';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { type ContractInstanceWithAddress, getContractInstanceFromInstantiationParams } from '@aztec/stdlib/contract';

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

export async function setupBananaFPC(initialAccounts: InitialAccountData[], wallet: Wallet, log: LogFn) {
  const bananaCoinAddress = await getBananaCoinAddress(initialAccounts);
  const admin = getBananaAdmin(initialAccounts);
  const [bananaCoin, fpc] = await Promise.all([
    TokenContract.deploy(wallet, admin, bananaCoinArgs.name, bananaCoinArgs.symbol, bananaCoinArgs.decimal)
      .send({ from: admin, contractAddressSalt: BANANA_COIN_SALT, universalDeploy: true })
      .deployed(),
    FPCContract.deploy(wallet, bananaCoinAddress, admin)
      .send({ from: admin, contractAddressSalt: BANANA_FPC_SALT, universalDeploy: true })
      .deployed(),
  ]);

  log(`BananaCoin: ${bananaCoin.address}`);
  log(`FPC: ${fpc.address}`);
}

export async function registerDeployedBananaCoinInWalletAndGetAddress(wallet: Wallet) {
  const initialAccounts = await getInitialTestAccountsData();
  const bananaCoin = await getBananaCoinInstance(initialAccounts);
  // The following is no-op if the contract is already registered
  await wallet.registerContract(bananaCoin, TokenContract.artifact);
  return bananaCoin.address;
}

export async function registerDeployedBananaFPCInWalletAndGetAddress(wallet: Wallet) {
  const initialAccounts = await getInitialTestAccountsData();
  const fpc = await getBananaFPCInstance(initialAccounts);
  // The following is no-op if the contract is already registered
  await wallet.registerContract(fpc, FPCContract.artifact);
  return fpc.address;
}
