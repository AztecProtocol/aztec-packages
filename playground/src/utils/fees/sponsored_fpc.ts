import {
  type ContractInstanceWithAddress,
  Fr,
  type PXE,
  getContractInstanceFromDeployParams,
  SponsoredFeePaymentMethod,
  type AccountWalletWithSecretKey,
  AztecAddress,
} from '@aztec/aztec.js';
import { SponsoredFPCContract } from '@aztec/noir-contracts.js/SponsoredFPC';

export { SponsoredFeePaymentMethod };

const SPONSORED_FPC_SALT = new Fr(0);

// Track registration state
let isRegistered = false;
let registrationPromise: Promise<AztecAddress> | null = null;

export async function getSponsoredFPCInstance(): Promise<ContractInstanceWithAddress> {
  return await getContractInstanceFromDeployParams(SponsoredFPCContract.artifact, {
    salt: SPONSORED_FPC_SALT,
  });
}

export async function getSponsoredFPCAddress(): Promise<AztecAddress> {
  return (await getSponsoredFPCInstance()).address;
}

export async function getDeployedSponsoredFPCAddress(pxe: PXE): Promise<AztecAddress> {
  const fpc = await getSponsoredFPCAddress();
  const contracts = await pxe.getContracts();
  if (!contracts.find(c => c.equals(fpc))) {
    throw new Error('SponsoredFPC not deployed.');
  }
  return fpc;
}

export async function registerSponsoredFPC(pxe: PXE, wallet: AccountWalletWithSecretKey): Promise<AztecAddress> {
  if (isRegistered) {
    return await getSponsoredFPCAddress();
  }

  if (registrationPromise) {
    return registrationPromise;
  }

  // Start new registration
  registrationPromise = (async () => {
    try {
      const fpcAddress = await getSponsoredFPCAddress();
      console.log(`Looking for SponsoredFPC at address ${fpcAddress.toString()}`);

      // Check if already registered
      const contracts = await pxe.getContracts();
      if (contracts.some(c => c.equals(fpcAddress))) {
        console.log(`SponsoredFPC already registered with PXE at ${fpcAddress.toString()}`);
        isRegistered = true;
        return fpcAddress;
      }

      // Register contract class
      console.log('Registering SponsoredFPC contract class...');
      await wallet.registerContractClass(SponsoredFPCContract.artifact);

      // Register contract instance
      console.log('Registering SponsoredFPC instance...');
      const sponsoredFPC = await getSponsoredFPCInstance();
      await pxe.registerContract({
        instance: sponsoredFPC,
        artifact: SponsoredFPCContract.artifact
      });

      // Verify registration
      const updatedContracts = await pxe.getContracts();
      if (!updatedContracts.some(c => c.equals(fpcAddress))) {
        throw new Error('SponsoredFPC registration failed - contract not found in PXE');
      }

      console.log(`SponsoredFPC registered with PXE at ${fpcAddress.toString()}`);
      isRegistered = true;
      return fpcAddress;
    } catch (error) {
      isRegistered = false;
      registrationPromise = null;
      throw error;
    }
  })();

  return registrationPromise;
}

export async function prepareForFeePayment(pxe: PXE, wallet: AccountWalletWithSecretKey): Promise<SponsoredFeePaymentMethod> {
  try {
    const fpcAddress = await registerSponsoredFPC(pxe, wallet);
    console.log(`SponsoredFPC registered at address: ${fpcAddress.toString()}`);
    return new SponsoredFeePaymentMethod(fpcAddress);
  } catch (error) {
    console.error('Error preparing SponsoredFeePaymentMethod:', error);
    throw error;
  }
}
