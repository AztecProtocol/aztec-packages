import { AztecRPCClient, EthAddress } from '@aztec/aztec-rpc';
import { ContractAbi } from '../noir.js';
import { ConstructorMethod, ConstructorOptions } from './constructor_method.js';

/**
 * A class for deploying contract.
 */
export class ContractDeployer {
  constructor(private abi: ContractAbi, private arc: AztecRPCClient, private defaultOptions: ConstructorOptions = {}) {}

  public deploy(portalContract = EthAddress.ZERO, ...args: any[]) {
    return new ConstructorMethod(this.arc, this.abi, portalContract, args, this.defaultOptions);
  }
}
