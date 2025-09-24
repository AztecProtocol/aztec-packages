import { type ContractInstanceWithAddress, Fr, getContractInstanceFromInstantiationParams } from '@aztec/aztec.js';
import { SPONSORED_FPC_SALT } from '@aztec/constants';
import { SponsoredFPCContract } from '@aztec/noir-contracts.js/SponsoredFPC';
import type { TestWallet } from '@aztec/test-wallet';

async function getSponsoredFPCInstance(): Promise<ContractInstanceWithAddress> {
  return await getContractInstanceFromInstantiationParams(SponsoredFPCContract.artifact, {
    salt: new Fr(SPONSORED_FPC_SALT),
  });
}

export async function getSponsoredFPCAddress() {
  return (await getSponsoredFPCInstance()).address;
}

export async function getDeployedSponsoredFPCAddress(wallet: TestWallet) {
  const fpc = await getSponsoredFPCAddress();
  const contracts = await wallet.getContracts();
  if (!contracts.find(c => c.equals(fpc))) {
    throw new Error('SponsoredFPC not deployed.');
  }
  return fpc;
}
