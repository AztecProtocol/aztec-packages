import { AztecRPCClient, EthAddress } from '../aztec_rpc/index.js';
import { ConstructorInteraction, ConstructorOptions } from '../contract/index.js';
import { ContractAbi } from '../noir_js/index.js';

/**
 * A class for deploying contract.
 */
export class ContractDeployer {
  constructor(private abi: ContractAbi, private arc: AztecRPCClient, private defaultOptions: ConstructorOptions = {}) {}

  public deploy(portalContract = EthAddress.ZERO, ...args: any[]) {
    return new ConstructorInteraction(this.arc, this.abi, portalContract, args, this.defaultOptions);
  }
}
