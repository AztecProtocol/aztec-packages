import { DefaultAccountInterface } from '@aztec/accounts/defaults';
import {
  AccountWallet,
  AuthWitness,
  Fr,
  type NoirCompiledContract,
  type PXE,
  getContractInstanceFromInstantiationParams,
  loadContractArtifact,
} from '@aztec/aztec.js';

import SimulatedAccountContractJson from '../../artifacts/SimulatedAccount.json' with { type: 'json' };
import { CopyCatAccountWalletBase } from './base.js';

export const SimulatedAccountContractArtifact = loadContractArtifact(
  SimulatedAccountContractJson as NoirCompiledContract,
);

/**
 * A CopyCatAccountWallet that loads the contract artifact eagerly.
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
    const instance = await getContractInstanceFromInstantiationParams(SimulatedAccountContractArtifact, {});
    return new CopyCatAccountWallet(pxe, accountInterface, originalAddress, SimulatedAccountContractArtifact, instance);
  }
}
