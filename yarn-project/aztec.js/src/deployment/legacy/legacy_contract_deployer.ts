import { PXE, PublicKey } from '@aztec/circuit-types';
import { AztecAddress } from '@aztec/circuits.js';
import { ContractArtifact } from '@aztec/foundation/abi';
import { Point } from '@aztec/foundation/fields';

import { Wallet } from '../../account/wallet.js';
import { Contract } from '../../contract/index.js';
import { LegacyDeployMethod } from './legacy_deploy_method.js';

/**
 * A class for deploying contract using the legacy deployment workflow. Used for account deployment. To be removed soon.
 * @remarks Keeping this around even though we have Aztec.nr contract types because it can be useful for non-TS users.
 */
export class LegacyContractDeployer {
  constructor(private artifact: ContractArtifact, private pxe: PXE, private publicKey?: PublicKey) {}

  /**
   * Deploy a contract using the provided ABI and constructor arguments.
   * This function creates a new DeployMethod instance that can be used to send deployment transactions
   * and query deployment status. The method accepts any number of constructor arguments, which will
   * be passed to the contract's constructor during deployment.
   *
   * @param args - The constructor arguments for the contract being deployed.
   * @returns A DeployMethod instance configured with the ABI, PXE, and constructor arguments.
   */
  public deploy(...args: any[]) {
    const postDeployCtor = (address: AztecAddress, wallet: Wallet) => Contract.at(address, this.artifact, wallet);
    return new LegacyDeployMethod(this.publicKey ?? Point.ZERO, this.pxe, this.artifact, postDeployCtor, args);
  }
}
