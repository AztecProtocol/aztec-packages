import type { ContractArtifact } from '@aztec/stdlib/abi';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';

import type { Wallet } from '../wallet/wallet.js';
import { ContractBase } from './contract_base.js';

/** Unsafe constructor for ContractBase that bypasses the check that the instance is registered in the wallet. */
export class UnsafeContract extends ContractBase {
  constructor(
    /** The deployed contract instance definition. */
    instance: ContractInstanceWithAddress,
    /** The Application Binary Interface for the contract. */
    artifact: ContractArtifact,
    /** The wallet used for interacting with this contract. */
    wallet: Wallet,
  ) {
    super(instance, artifact, wallet);
  }
}
