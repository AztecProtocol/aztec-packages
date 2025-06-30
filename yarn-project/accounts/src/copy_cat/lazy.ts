import { DefaultAccountInterface } from '@aztec/accounts/defaults';
import {
  AccountWallet,
  AuthWitness,
  Fr,
  type PXE,
  getContractInstanceFromDeployParams,
  loadContractArtifact,
} from '@aztec/aztec.js';

import { CopyCatAccountWalletBase } from './base.js';

/**
 * A CopyCatAccountWallet that loads the contract artifact lazily.
 */
export class CopyCatAccountWallet extends CopyCatAccountWalletBase {
  static async create(pxe: PXE, originalAccount: AccountWallet): Promise<CopyCatAccountWallet> {
    const simulatedAuthWitnessProvider = {
      /**
       *
       * @param messageHash
       */
      createAuthWit(messageHash: Fr): Promise<AuthWitness> {
        return Promise.resolve(new AuthWitness(messageHash, []));
      },
    };
    const nodeInfo = await pxe.getNodeInfo();
    const originalAddress = originalAccount.getCompleteAddress();
    const { contractInstance } = await pxe.getContractMetadata(originalAddress.address);
    if (!contractInstance) {
      throw new Error(`No contract instance found for address: ${originalAddress.address}`);
    }
    const accountInterface = new DefaultAccountInterface(simulatedAuthWitnessProvider, originalAddress, nodeInfo);
    const { default: simulatedAccountContractJson } = await import('../../artifacts/SimulatedAccount.json');
    const simulatedAccountContractArtifact = loadContractArtifact(simulatedAccountContractJson);
    const instance = await getContractInstanceFromDeployParams(simulatedAccountContractArtifact, {});
    return new CopyCatAccountWallet(pxe, accountInterface, originalAddress, simulatedAccountContractArtifact, instance);
  }
}
