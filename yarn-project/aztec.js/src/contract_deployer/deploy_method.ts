import { AztecRPCClient, ContractAbi } from '@aztec/aztec-rpc';
import { EthAddress, Fr } from '@aztec/circuits.js';
import { AztecAddress } from '@aztec/foundation';
import { ContractFunction, SendMethod, SendMethodOptions } from '../contract/index.js';

export interface DeployOptions extends SendMethodOptions {
  portalContract?: EthAddress;
  contractAddressSalt?: Fr;
}

/**
 * Creates a TxRequest from a contract ABI, for contract deployment.
 * Extends the SendMethod class.
 */
export class DeployMethod extends SendMethod {
  constructor(arc: AztecRPCClient, private abi: ContractAbi, args: any[] = [], defaultOptions: DeployOptions = {}) {
    const constructorAbi = abi.functions.find(f => f.name === 'constructor');
    if (!constructorAbi) {
      throw new Error('Cannot find constructor in the ABI.');
    }

    super(arc, AztecAddress.ZERO, new ContractFunction(constructorAbi), args, defaultOptions);
  }

  public async request(options: DeployOptions = {}) {
    const { portalContract, contractAddressSalt, from } = { ...this.defaultOptions, ...options };
    this.txRequest = await this.arc.createDeploymentTxRequest(
      this.abi,
      this.entry.encodeParameters(this.args).map(p => Fr.fromBuffer(p)),
      portalContract || new EthAddress(Buffer.alloc(EthAddress.SIZE_IN_BYTES)),
      contractAddressSalt || Fr.random(),
      from || AztecAddress.ZERO,
    );
    return this.txRequest;
  }

  public sign(options: DeployOptions = {}) {
    return super.sign(options);
  }

  public create(options: DeployOptions = {}) {
    return super.create(options);
  }

  public send(options: DeployOptions = {}) {
    return super.send(options);
  }
}
