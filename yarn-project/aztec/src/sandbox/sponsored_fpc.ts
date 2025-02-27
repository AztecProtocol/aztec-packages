import { type InitialAccountData, getInitialTestAccounts } from '@aztec/accounts/testing';
import {
  AztecAddress,
  type ContractInstanceWithAddress,
  Fr,
  type PXE,
  type Wallet,
  getContractInstanceFromDeployParams,
} from '@aztec/aztec.js';
import type { LogFn } from '@aztec/foundation/log';
import { SponsoredFPCContract } from '@aztec/noir-contracts.js/SponsoredFPC';

import { getBananaCoinAddress } from './banana_fpc.js';

const SPONSORED_FPC_SALT = new Fr(0);

async function getSponsoredUserAndAsset(initialAccounts: InitialAccountData[]) {
  const sponsoredUser = initialAccounts[0]?.address ?? AztecAddress.ZERO;
  const sponsoredAsset = await getBananaCoinAddress(initialAccounts);
  return { sponsoredUser, sponsoredAsset };
}

async function getSponsoredFPCInstance(initialAccounts: InitialAccountData[]): Promise<ContractInstanceWithAddress> {
  const { sponsoredUser, sponsoredAsset } = await getSponsoredUserAndAsset(initialAccounts);
  return await getContractInstanceFromDeployParams(SponsoredFPCContract.artifact, {
    constructorArgs: [sponsoredUser, sponsoredAsset],
    salt: SPONSORED_FPC_SALT,
  });
}

export async function getSponsoredFPCAddress(initialAccounts: InitialAccountData[]) {
  return (await getSponsoredFPCInstance(initialAccounts)).address;
}

export async function setupSponsoredFPC(initialAccounts: InitialAccountData[], deployer: Wallet, log: LogFn) {
  const { sponsoredUser, sponsoredAsset } = await getSponsoredUserAndAsset(initialAccounts);
  const deployed = await SponsoredFPCContract.deploy(deployer, sponsoredUser, sponsoredAsset)
    .send({ contractAddressSalt: SPONSORED_FPC_SALT, universalDeploy: true })
    .deployed();

  log(`SponsoredFPC: ${deployed.address}`);
}

export async function getDeployedSponsoredFPCAddress(pxe: PXE) {
  const initialAccounts = await getInitialTestAccounts();
  const fpc = await getSponsoredFPCAddress(initialAccounts);
  const contracts = await pxe.getContracts();
  if (!contracts.find(c => c.equals(fpc))) {
    throw new Error('SponsoredFPC not deployed.');
  }
  return fpc;
}
