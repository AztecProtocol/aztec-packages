import {
  type ContractInstanceWithAddress,
  Fr,
  type PXE,
  getContractInstanceFromDeployParams,
  SponsoredFeePaymentMethod,
} from '@aztec/aztec.js';
import { SponsoredFPCContract } from '@aztec/noir-contracts.js/SponsoredFPC';

export { SponsoredFeePaymentMethod };

const SPONSORED_FPC_SALT = new Fr(0);

export async function getSponsoredFPCInstance(): Promise<ContractInstanceWithAddress> {
  return await getContractInstanceFromDeployParams(SponsoredFPCContract.artifact, {
    salt: SPONSORED_FPC_SALT,
  });
}

export async function getSponsoredFPCAddress() {
  return (await getSponsoredFPCInstance()).address;
}

export async function getDeployedSponsoredFPCAddress(pxe: PXE) {
  const fpc = await getSponsoredFPCAddress();
  const contracts = await pxe.getContracts();
  if (!contracts.find(c => c.equals(fpc))) {
    throw new Error('SponsoredFPC not deployed.');
  }
  return fpc;
}

/**
 * Registers the EXISTING SponsoredFPC contract with the PXE to enable fee payment functionality.
 * This function DOES NOT deploy a new contract - it assumes the contract is already deployed and funded.
 *
 * @param pxe The PXE instance to register with
 * @param wallet The wallet to use for registering the contract class
 * @param node The node URL or instance (not used for registration)
 * @returns Promise that resolves to the address of the registered SponsoredFPC
 */
export async function registerSponsoredFPC(pxe: any, wallet: any, node: any) {
  console.log('Checking if SponsoredFPC is available in PXE...');
  try {
    console.log('Registering SponsoredFPC contract class...');
    try {
      await wallet.registerContractClass(SponsoredFPCContract.artifact);
      console.log('SponsoredFPC contract class registered successfully');
    } catch (classRegisterError) {
      console.warn('Error registering SponsoredFPC contract class:', classRegisterError.message);
      console.warn('Continuing with contract registration anyway');
    }

    const fpcAddress = await getSponsoredFPCAddress();
    console.log(`Looking for SponsoredFPC at address ${fpcAddress.toString()}`);

    const contracts = await pxe.getContracts();
    const isRegistered = contracts.some(c => c.equals(fpcAddress));

    if (isRegistered) {
      console.log(`SponsoredFPC already registered with PXE at ${fpcAddress.toString()}`);
      return fpcAddress;
    }

    console.log(`SponsoredFPC not registered in PXE, registering now...`);

    const sponsoredFPC = await getSponsoredFPCInstance();

    try {
      console.log('Registering SponsoredFPC contract with PXE...');
      await pxe.registerContract({
        instance: sponsoredFPC,
        artifact: SponsoredFPCContract.artifact
      });
      console.log(`SponsoredFPC registered with PXE at ${fpcAddress.toString()}`);

      const updatedContracts = await pxe.getContracts();
      const nowRegistered = updatedContracts.some(c => c.equals(fpcAddress));

      if (!nowRegistered) {
        console.warn('SponsoredFPC registration reported success but contract not found in PXE contracts list');
      }

      return fpcAddress;
    } catch (registerError) {
      console.error('Error registering SponsoredFPC with PXE:', registerError);
      throw registerError;
    }
  } catch (error) {
    console.error('Error checking SponsoredFPC status:', error);
    throw error;
  }
}

/**
 * Prepares a SponsoredFeePaymentMethod for use with contract deployments and transactions.
 * This handles all the necessary setup steps in one function.
 *
 * @param pxe The PXE instance to register with
 * @param wallet The wallet to use for registering the contract class
 * @param node The node URL or instance
 * @returns A configured SponsoredFeePaymentMethod ready to use
 */
export async function prepareForFeePayment(pxe: any, wallet: any, node: any): Promise<SponsoredFeePaymentMethod> {
  try {
    console.log('Preparing SponsoredFeePaymentMethod...');

    // First register the contract and class
    const fpcAddress = await registerSponsoredFPC(pxe, wallet, node);
    console.log(`SponsoredFPC registered at address: ${fpcAddress.toString()}`);

    // Create the payment method
    const sponsoredPaymentMethod = new SponsoredFeePaymentMethod(fpcAddress);
    console.log('SponsoredFeePaymentMethod created successfully');

    return sponsoredPaymentMethod;
  } catch (error) {
    console.error('Error preparing SponsoredFeePaymentMethod:', error);
    console.error('Error details:', error.message);
    // Re-throw so caller can handle it
    throw error;
  }
}
