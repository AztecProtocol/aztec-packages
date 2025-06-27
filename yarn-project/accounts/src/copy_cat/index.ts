import { DefaultAccountInterface } from '@aztec/accounts/defaults';
import {
  AccountWallet,
  AuthWitness,
  Fr,
  type NoirCompiledContract,
  type PXE,
  getContractInstanceFromDeployParams,
  loadContractArtifact,
} from '@aztec/aztec.js';

import SimulatedAccountContractJson from '../../artifacts/SimulatedAccount.json' with { type: 'json' };
import { CopyCatAccountWalletBase } from './base.js';

export const SimulatedAccountContractArtifact = loadContractArtifact(
  SimulatedAccountContractJson as NoirCompiledContract,
);

/*
 * A CopyCatAccountWallet that loads the contract artifact lazily.
 */
export class CopyCatAccountWallet extends CopyCatAccountWalletBase {
  static async create(pxe: PXE, originalAccount: AccountWallet): Promise<CopyCatAccountWallet> {
    const simulatedAuthWitnessProvider = {
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
    const instance = await getContractInstanceFromDeployParams(SimulatedAccountContractArtifact, {});
    return new CopyCatAccountWallet(pxe, accountInterface, originalAddress, SimulatedAccountContractArtifact, instance);
  }
}
