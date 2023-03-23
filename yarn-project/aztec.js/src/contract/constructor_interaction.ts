import { hexToBuffer } from '../abi_coder/index.js';
import { AztecAddress, AztecRPCClient, EthAddress, Fr } from '../aztec_rpc/index.js';
import { ContractAbi } from '../noir_js/index.js';
import { ContractFunction } from './contract_function.js';
import { SendMethodOptions, SendMethodInteraction } from './send_method_interaction.js';

export interface ConstructorOptions extends SendMethodOptions {
  contractAddressSalt?: Fr;
}

/**
 * Extends the SendMethodInteraction to create TxRequest for constructors (deployments).
 */
export class ConstructorInteraction extends SendMethodInteraction {
  constructor(
    arc: AztecRPCClient,
    private abi: ContractAbi,
    private portalContract: EthAddress,
    args: any[],
    defaultOptions: ConstructorOptions = {},
  ) {
    const constructorAbi = abi.functions.find(f => f.name === 'constructor');
    if (!constructorAbi) {
      throw new Error('Cannot find constructor in the ABI.');
    }

    super(arc, EthAddress.ZERO, new ContractFunction(constructorAbi), args, defaultOptions);
  }

  public async request(options: ConstructorOptions = {}) {
    const { contractAddressSalt, from } = { ...this.defaultOptions, ...options };
    this.txRequest = await this.arc.createDeploymentTxRequest(
      hexToBuffer(this.abi.bytecode),
      this.entry.encodeParameters(this.args).map(p => new Fr(p)),
      this.portalContract,
      contractAddressSalt || Fr.random(),
      from || AztecAddress.ZERO,
    );
    return this.txRequest;
  }

  public sign(options: ConstructorOptions = {}) {
    return super.sign(options);
  }

  public create(options: ConstructorOptions = {}) {
    return super.create(options);
  }

  public send(options: ConstructorOptions = {}) {
    return super.send(options);
  }
}
