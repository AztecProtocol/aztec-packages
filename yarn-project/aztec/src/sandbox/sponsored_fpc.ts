import {
  type ContractInstanceWithAddress,
  Fr,
  type Wallet,
  getContractInstanceFromInstantiationParams,
} from '@aztec/aztec.js';
import { SPONSORED_FPC_SALT } from '@aztec/constants';
import { SponsoredFPCContract } from '@aztec/noir-contracts.js/SponsoredFPC';

async function getSponsoredFPCInstance(): Promise<ContractInstanceWithAddress> {
  return await getContractInstanceFromInstantiationParams(SponsoredFPCContract.artifact, {
    salt: new Fr(SPONSORED_FPC_SALT),
  });
}

export async function getSponsoredFPCAddress() {
  return (await getSponsoredFPCInstance()).address;
}

export async function registerDeployedSponsoredFPCInWalletAndGetAddress(wallet: Wallet) {
  const fpc = await getSponsoredFPCInstance();
  // The following is no-op if the contract is already registered
  await wallet.registerContract(fpc, SponsoredFPCContract.artifact);
  return fpc.address;
}
