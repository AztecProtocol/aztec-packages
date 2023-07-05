import { AztecRPC } from '@aztec/aztec-rpc';
import { ContractDeploymentData, TxContext } from '@aztec/circuits.js';
import { ContractAbi } from '@aztec/foundation/abi';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { PublicKey } from '@aztec/key-store';
import { ExecutionRequest, PartialContractAddress, TxExecutionRequest } from '@aztec/types';
import { BaseWallet, Wallet } from '../aztec_rpc_client/wallet.js';
import { Contract, ContractFunctionInteraction, SendMethodOptions } from '../contract/index.js';

/**
 * Options for deploying a contract on the Aztec network.
 * Allows specifying a portal contract, contract address salt, and additional send method options.
 */
export interface DeployOptions extends SendMethodOptions {
  /**
   * The Ethereum address of the Portal contract.
   */
  portalContract?: EthAddress;
  /**
   * An optional salt value used to deterministically calculate the contract address.
   */
  contractAddressSalt?: Fr;
}

class DeployerWallet extends BaseWallet {
  getAddress(): AztecAddress {
    return AztecAddress.ZERO;
  }
  createAuthenticatedTxRequest(executions: ExecutionRequest[], txContext: TxContext): Promise<TxExecutionRequest> {
    if (executions.length !== 1) {
      throw new Error(`Deployer wallet can only run one execution at a time (requested ${executions.length})`);
    }
    const [execution] = executions;
    return Promise.resolve(new TxExecutionRequest(execution.to, execution.functionData, execution.args, txContext));
  }
}

/**
 * Creates a TxRequest from a contract ABI, for contract deployment.
 * Extends the ContractFunctionInteraction class.
 */
export class DeployMethod extends ContractFunctionInteraction {
  /**
   * The partially computed contract address. Known after creation of the deployment transaction.
   */
  public partialContractAddress?: PartialContractAddress = undefined;

  /**
   * The complete contract address.
   */
  public completeContractAddress?: AztecAddress = undefined;

  constructor(private publicKey: PublicKey, arc: AztecRPC, private abi: ContractAbi, args: any[] = []) {
    const constructorAbi = abi.functions.find(f => f.name === 'constructor');
    if (!constructorAbi) {
      throw new Error('Cannot find constructor in the ABI.');
    }

    super(new DeployerWallet(arc), AztecAddress.ZERO, constructorAbi, args);
  }

  /**
   * Create a contract deployment transaction, given the deployment options.
   * This function internally calls `request()` and `sign()` methods to prepare
   * the transaction for deployment. The resulting signed transaction can be
   * later sent using the `send()` method.
   *
   * @param options - An object containing optional deployment settings, including portalContract, contractAddressSalt, and from.
   * @returns A Promise resolving to an object containing the signed transaction data and other relevant information.
   */
  public async create(options: DeployOptions = {}) {
    const { portalContract, contractAddressSalt } = Object.assign(
      { portalContract: EthAddress.ZERO, contractAddressSalt: Fr.ZERO },
      options,
    );

    const { address, constructorHash, functionTreeRoot, partialAddress } = await this.wallet.getDeploymentInfo(
      this.abi,
      this.args,
      portalContract,
      contractAddressSalt,
      this.publicKey,
    );

    const contractDeploymentData = new ContractDeploymentData(
      this.publicKey,
      constructorHash,
      functionTreeRoot,
      contractAddressSalt,
      portalContract,
    );

    const { chainId, version } = await this.wallet.getNodeInfo();

    const txContext = new TxContext(false, false, true, contractDeploymentData, new Fr(chainId), new Fr(version));
    const executionRequest = this.getExecutionRequest(address, AztecAddress.ZERO);
    const txRequest = await this.wallet.createAuthenticatedTxRequest([executionRequest], txContext);

    this.txRequest = txRequest;
    this.partialContractAddress = partialAddress;
    this.completeContractAddress = address;

    // TODO: Should we add the contracts to the DB here, or once the tx has been sent or mined?
    await this.wallet.addContracts([{ abi: this.abi, address, portalContract }]);

    return this.txRequest;
  }

  /**
   * Send the contract deployment transaction using the provided options.
   * This function extends the 'send' method from the ContractFunctionInteraction class,
   * allowing us to send a transaction specifically for contract deployment.
   *
   * @param options - An object containing various deployment options such as portalContract, contractAddressSalt, and from.
   * @returns A Promise that resolves to the transaction receipt upon successful deployment.
   */
  public send(options: DeployOptions = {}) {
    return super.send(options);
  }

  public getContract(withWallet: Wallet) {
    if (!this.completeContractAddress) {
      throw new Error(`Cannot get a contract instance for a contract not yet deployed`);
    }
    return new Contract(this.completeContractAddress, this.abi, withWallet);
  }
}
