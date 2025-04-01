import { AztecAddress, type PXE, getContractInstanceFromDeployParams, AccountWalletWithSecretKey, Fr, PublicKeys } from '@aztec/aztec.js';
import { ExecutionPayload } from '@aztec/entrypoints/payload';
import { FunctionSelector, FunctionType } from '@aztec/aztec.js';

// The salt used for the canonical sponsored FPC contract is 0
const SPONSORED_FPC_SALT = BigInt(0);

// Known address of the SponsoredFPC in the sandbox environment
// This contract is pre-deployed in the sandbox and should be used rather than deploying a new one
const SANDBOX_SPONSORED_FPC_ADDRESS = '0x2af5fa8753c2645b07eb18edcaffd9246d01565b81fe721c92b58223ae388477';

// The correct class ID for the sandbox SponsoredFPC contract
// This is the class ID of the actual deployed contract
const SANDBOX_SPONSORED_FPC_CLASS_ID = '0x2c7385a72a9f45c4928457e127c0b4bfd6b91afd826232d119fba5ea53a274a8';

/**
 * Helper function to get the canonical SponsoredFPC contract address
 * This address is determined by using a salt of 0
 */
export async function getSponsoredFPCAddress(): Promise<AztecAddress> {
  try {
    // For sandbox environments, we know the contract address directly
    if (SANDBOX_SPONSORED_FPC_ADDRESS) {
      return AztecAddress.fromString(SANDBOX_SPONSORED_FPC_ADDRESS);
    }

    // For other environments, compute the address from deployment parameters
    const { SponsoredFPCContract } = await import('@aztec/noir-contracts.js/SponsoredFPC');
    const sponsoredFPCInstance = await getContractInstanceFromDeployParams(SponsoredFPCContract.artifact, {
      salt: new Fr(SPONSORED_FPC_SALT),
    });
    return sponsoredFPCInstance.address;
  } catch (error) {
    console.error('Error getting SponsoredFPC address:', error);
    throw new Error(`Failed to get SponsoredFPC address: ${error.message}`);
  }
}

/**
 * Register the SponsoredFPC contract with the PXE
 * This is essential for allowing the contract to be used for fee payment
 *
 * @param pxe The PXE instance
 * @param wallet A wallet to use for registration
 * @param node The Aztec node instance
 * @returns The address of the registered SponsoredFPC contract
 */
export async function registerSponsoredFPC(
  pxe: PXE,
  wallet: AccountWalletWithSecretKey,
  node: any
): Promise<AztecAddress> {
  try {
    console.log('=== INITIALIZING SPONSORED FEE PAYMENT CONTRACT ===');

    // Get the SponsoredFPC contract address
    const sponsoredFPCAddress = await getSponsoredFPCAddress();
    console.log('Sandbox SponsoredFPC contract address:', sponsoredFPCAddress.toString());

    // Check if contract is already registered in PXE
    console.log('Checking if contract is already registered with PXE...');
    const contracts = await pxe.getContracts();
    if (contracts.find(c => c.equals(sponsoredFPCAddress))) {
      console.log('SponsoredFPC contract already registered with PXE');
      return sponsoredFPCAddress;
    }

    // Get the contract artifact
    console.log('Loading SponsoredFPC contract artifact...');
    const { SponsoredFPCContract } = await import('@aztec/noir-contracts.js/SponsoredFPC');

    // Register the contract class with PXE first
    console.log('Registering SponsoredFPC contract class with PXE...');
    await wallet.registerContractClass(SponsoredFPCContract.artifact);
    console.log('Contract class registered successfully');

    // Try to get the contract instance from the node
    console.log('Getting sandbox contract instance from node...');
    let contractInstance;

    try {
      contractInstance = await node.getContract(sponsoredFPCAddress);
      if (contractInstance) {
        console.log('Contract instance found in sandbox at:', sponsoredFPCAddress.toString());
      }
    } catch (nodeError) {
      console.log('Error getting contract from node:', nodeError.message);
    }

    // If the instance wasn't found on the node, create it manually
    if (!contractInstance) {
      console.log('Contract not found on node. Creating instance manually with known values...');

      // Create the contract instance manually with the correct class ID
      contractInstance = {
        version: 1,
        salt: new Fr(SPONSORED_FPC_SALT),
        initializationHash: Fr.ZERO, // Usually zero for simple contracts
        address: sponsoredFPCAddress,
        deployer: AztecAddress.ZERO,
        currentContractClassId: Fr.fromString(SANDBOX_SPONSORED_FPC_CLASS_ID),
        originalContractClassId: Fr.fromString(SANDBOX_SPONSORED_FPC_CLASS_ID),
        publicKeys: PublicKeys.default(),
      };

      console.log('Created contract instance with address:', contractInstance.address.toString());
      console.log('Using class ID:', contractInstance.currentContractClassId.toString());
    }

    console.log('Contract instance obtained');
    console.log('Contract class ID:', contractInstance.currentContractClassId.toString());

    // Register the contract with PXE
    console.log('Registering SponsoredFPC contract with PXE...');
    await wallet.registerContract({
      instance: contractInstance,
      artifact: SponsoredFPCContract.artifact
    });
    console.log('SponsoredFPC contract registered with PXE successfully');

    console.log('=== SANDBOX SPONSORED FEE PAYMENT CONTRACT INITIALIZED SUCCESSFULLY ===');
    return sponsoredFPCAddress;
  } catch (error) {
    console.error('=== SPONSORED FPC REGISTRATION FAILED ===');
    console.error('Error type:', error.constructor?.name || 'UnknownError');
    console.error('Error message:', error.message);

    if (error.cause) {
      console.error('Error cause:', error.cause);
    }

    throw error;
  }
}

/**
 * A fee payment method that uses a contract that blindly sponsors transactions.
 * This contract is expected to be prefunded in testing environments.
 */
export class SponsoredFeePaymentMethod {
  /**
   * Creates a new SponsoredFeePaymentMethod instance
   * @param paymentContract The address of the contract to use for fee payment
   */
  constructor(public readonly paymentContract: AztecAddress) {}

  /**
   * Create a new sponsored fee payment method using the canonical SponsoredFPC contract
   * @param pxe The PXE instance
   * @param wallet An optional wallet to use for registration if needed
   * @param node An optional node client for retrieving contract instances
   * @returns A SponsoredFeePaymentMethod instance
   */
  static async new(
    pxe: PXE,
    wallet?: AccountWalletWithSecretKey,
    node?: any
  ): Promise<SponsoredFeePaymentMethod> {
    try {
      console.log('Setting up sponsored fee payment method...');

      // Get the canonical sponsored FPC address
      let sponsoredFPCAddress = await getSponsoredFPCAddress();

      // Check if the contract is registered with PXE
      console.log('Checking if SponsoredFPC is registered with PXE...');
      const contracts = await pxe.getContracts();

      if (!contracts.find(c => c.equals(sponsoredFPCAddress))) {
        console.warn('SponsoredFPC not registered with PXE. Registration required.');

        if (wallet && node) {
          // Try to register the contract with the PXE
          try {
            sponsoredFPCAddress = await registerSponsoredFPC(pxe, wallet, node);
            console.log('Successfully registered SponsoredFPC with PXE');
          } catch (registerError) {
            console.error('Failed to register SponsoredFPC with PXE:', registerError.message);
            console.warn('Continuing with unregistered contract address, but transactions will likely fail');
          }
        } else {
          if (!wallet) {
            console.warn('No wallet provided for SponsoredFPC registration.');
          }
          if (!node) {
            console.warn('No node client provided for SponsoredFPC registration.');
          }
          console.warn('Cannot register SponsoredFPC without both wallet and node. Transactions may fail.');
        }
      } else {
        console.log('SponsoredFPC already registered with PXE at', sponsoredFPCAddress.toString());
      }

      return new SponsoredFeePaymentMethod(sponsoredFPCAddress);
    } catch (error) {
      console.error('Error creating SponsoredFeePaymentMethod:', error);
      throw new Error(`Failed to create SponsoredFeePaymentMethod: ${error.message}`);
    }
  }

  getAsset(): Promise<AztecAddress> {
    throw new Error('Asset is not required for sponsored fpc.');
  }

  getFeePayer() {
    return Promise.resolve(this.paymentContract);
  }

  async getExecutionPayload(): Promise<ExecutionPayload> {
    return new ExecutionPayload(
      [
        {
          name: 'sponsor_unconditionally',
          to: this.paymentContract,
          selector: await FunctionSelector.fromSignature('sponsor_unconditionally()'),
          type: FunctionType.PRIVATE,
          isStatic: false,
          args: [],
          returnTypes: [],
        },
      ],
      [],
      [],
    );
  }
}
