import { DefaultAccountInterface } from '@aztec/accounts/defaults';
import {
  AccountWallet,
  AuthWitness,
  Fr,
  type PXE,
  getContractInstanceFromInstantiationParams,
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
       * A copycat wallet always returns an empty authwitness, since it doesn't
       * perform any verification whatsoever
       * @param messageHash - The outer hash of the message for which the auth witness is created
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
    const instance = await getContractInstanceFromInstantiationParams(simulatedAccountContractArtifact, {});
    return new CopyCatAccountWallet(pxe, accountInterface, originalAddress, simulatedAccountContractArtifact, instance);
  }
}
