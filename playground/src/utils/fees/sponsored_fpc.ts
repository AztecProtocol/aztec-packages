import {
    type ContractInstanceWithAddress,
    Fr,
    type PXE,
    type Wallet,
    getContractInstanceFromDeployParams,
    SignerlessWallet,
} from '@aztec/aztec.js';
import type { LogFn } from '@aztec/foundation/log';
import { SponsoredFPCContract } from '@aztec/noir-contracts.js/SponsoredFPC';
import { DefaultMultiCallEntrypoint } from '@aztec/entrypoints/multicall';

const SPONSORED_FPC_SALT = new Fr(0);

/**
 * Gets the instance of the SponsoredFPC contract
 */
async function getSponsoredFPCInstance(): Promise<ContractInstanceWithAddress> {
  return await getContractInstanceFromDeployParams(SponsoredFPCContract.artifact, {
    salt: SPONSORED_FPC_SALT,
  });
}

/**
 * Gets the address of the SponsoredFPC contract
 */
export async function getSponsoredFPCAddress() {
  return (await getSponsoredFPCInstance()).address;
}

/**
 * Deploys the SponsoredFPC contract to the network
 * @param pxe PXE instance
 * @param log Logger function
 * @returns The deployed contract instance
 */
export async function setupSponsoredFPC(pxe: PXE, log: LogFn) {
  try {
    // Get node info to create the deployer
    const { l1ChainId: chainId, protocolVersion } = await pxe.getNodeInfo();
    const deployer = new SignerlessWallet(pxe, new DefaultMultiCallEntrypoint(chainId, protocolVersion));

    // Deploy the contract
    log('Deploying SponsoredFPC contract...');
    const deployed = await SponsoredFPCContract.deploy(deployer)
      .send({
        contractAddressSalt: SPONSORED_FPC_SALT,
        universalDeploy: true
      })
      .deployed();

    log(`SponsoredFPC deployed at: ${deployed.address}`);
    return deployed;
  } catch (error) {
    log(`Error deploying SponsoredFPC: ${error.message}`);
    throw error;
  }
}

/**
 * Checks if the SponsoredFPC contract is already deployed
 * @param pxe PXE instance
 * @returns The contract address if deployed, null otherwise
 */
export async function getDeployedSponsoredFPCAddress(pxe: PXE) {
  try {
    // Get the expected address
    const fpc = await getSponsoredFPCAddress();

    // Check if it exists in the list of contracts
    const contracts = await pxe.getContracts();

    if (contracts.find(c => c.equals(fpc))) {
      return fpc;
    }

    return null;
  } catch (error) {
    console.error('Error checking for SponsoredFPC:', error);
    return null;
  }
}
