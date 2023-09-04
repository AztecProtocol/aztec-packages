import { Schnorr } from '@aztec/circuits.js/barretenberg';
import { ContractAbi } from '@aztec/foundation/abi';
import { CompleteAddress, NodeInfo, PrivateKey } from '@aztec/types';

import Eip1271AccountContractAbi from '../../abis/schnorr_eip_1271_account_contract.json' assert { type: 'json' };
import { Eip1271AccountEntrypoint } from '../entrypoint/eip_1271_account_entrypoint.js';
import { AccountContract } from './index.js';

/**
 * Account contract that authenticates transactions using Schnorr signatures verified against
 * the note encryption key, relying on a single private key for both encryption and authentication.
 * Extended to pull verification data from the oracle instead of passed as arguments.
 */
export class Eip1271AccountContract implements AccountContract {
  constructor(private encryptionPrivateKey: PrivateKey) {}

  public getDeploymentArgs() {
    return Promise.resolve([]);
  }

  public async getEntrypoint({ address, partialAddress }: CompleteAddress, { chainId, version }: NodeInfo) {
    return new Eip1271AccountEntrypoint(
      address,
      partialAddress,
      this.encryptionPrivateKey,
      await Schnorr.new(),
      chainId,
      version,
    );
  }

  public getContractAbi(): ContractAbi {
    return Eip1271AccountContractAbi as unknown as ContractAbi;
  }
}
