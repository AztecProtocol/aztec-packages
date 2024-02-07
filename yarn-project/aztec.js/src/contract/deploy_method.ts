import { FunctionCall, PublicKey, Tx, TxExecutionRequest } from '@aztec/circuit-types';
import {
  AztecAddress,
  computePartialAddress,
  getContractClassFromArtifact,
  getContractInstanceFromDeployParams,
} from '@aztec/circuits.js';
import { ContractArtifact, FunctionArtifact } from '@aztec/foundation/abi';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { ContractInstanceWithAddress } from '@aztec/types/contracts';

import { Wallet } from '../account/index.js';
import { deployInstance } from '../deployment/deploy_instance.js';
import { registerContractClass } from '../deployment/register_class.js';
import { BaseContractInteraction, SendMethodOptions } from './base_contract_interaction.js';
import { type Contract } from './contract.js';
import { ContractBase } from './contract_base.js';
import { ContractFunctionInteraction } from './contract_function_interaction.js';
import { DeploySentTx } from './deploy_sent_tx.js';

/**
 * Options for deploying a contract on the Aztec network.
 * Allows specifying a portal contract, contract address salt, and additional send method options.
 */
export type DeployOptions = {
  /** The Ethereum address of the Portal contract. */
  portalContract?: EthAddress;
  /** An optional salt value used to deterministically calculate the contract address. */
  contractAddressSalt?: Fr;
  /** Set to true to *not* include the sender in the address computation. */
  universalDeploy?: boolean;
} & SendMethodOptions;

// TODO(@spalladino): Add unit tests for this class!

/**
 * Contract interaction for deployment. Handles class registration, public instance deployment,
 * and initialization of the contract. Extends the BaseContractInteraction class.
 */
export class DeployMethod<TContract extends ContractBase = Contract> extends BaseContractInteraction {
  /** The contract instance to be deployed. */
  public instance?: ContractInstanceWithAddress = undefined;

  /** Constructor function to call. */
  private constructorArtifact: FunctionArtifact;

  constructor(
    private publicKey: PublicKey,
    protected wallet: Wallet,
    private artifact: ContractArtifact,
    private postDeployCtor: (address: AztecAddress, wallet: Wallet) => Promise<TContract>,
    private args: any[] = [],
  ) {
    super(wallet);
    const constructorArtifact = artifact.functions.find(f => f.name === 'constructor');
    if (!constructorArtifact) {
      throw new Error('Cannot find constructor in the artifact.');
    }
    this.constructorArtifact = constructorArtifact;
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
  public async create(options: DeployOptions = {}): Promise<TxExecutionRequest> {
    if (!this.txRequest) {
      this.txRequest = await this.wallet.createTxExecutionRequest(await this.request(options));
      // TODO: Should we add the contracts to the DB here, or once the tx has been sent or mined?
      await this.pxe.addContracts([{ artifact: this.artifact, instance: this.instance! }]);
    }
    return this.txRequest;
  }

  /**
   * Returns an array of function calls that represent this operation. Useful as a building
   * block for constructing batch requests.
   * @param options - Deployment options.
   * @returns An array of function calls.
   */
  public async request(options: DeployOptions = {}): Promise<FunctionCall[]> {
    const calls: FunctionCall[] = [];

    // Set contract instance object so it's available for populating the DeploySendTx object
    const portalContract = options.portalContract ?? EthAddress.ZERO;
    const contractAddressSalt = options.contractAddressSalt ?? Fr.random();
    const deployParams = [this.artifact, this.args, contractAddressSalt, this.publicKey, portalContract] as const;
    const instance = getContractInstanceFromDeployParams(...deployParams);
    this.instance = instance;

    // Register the contract class if it hasn't been published already.
    // TODO(@spalladino): We're unnecessarily calculating the contract class multiple times here.
    const contractClass = getContractClassFromArtifact(this.artifact);
    // TODO(@spalladino): This is a tricky one. We're skipping class registration if it's not yet
    // in the pxe. But it could be in the pxe because it was registered *privately* previously.
    // What we should actually be checking if it's been broadcasted by a node, so we need to tell
    // the pxe "gimme the data about this class that's publicly available only", which is closely
    // related to the private data access mechanisms we have yet to design.
    if (!(await this.pxe.getContractClass(contractClass.id))) {
      calls.push(registerContractClass(this.wallet, this.artifact).request());
    }

    // Deploy the contract via the instance deployer.
    calls.push(deployInstance(this.wallet, instance, { universalDeploy: options.universalDeploy }).request());

    // Call the constructor.
    calls.push(
      new ContractFunctionInteraction(this.wallet, instance.address, this.constructorArtifact, this.args).request(),
    );

    return calls;
  }

  /**
   * Send the contract deployment transaction using the provided options.
   * This function extends the 'send' method from the ContractFunctionInteraction class,
   * allowing us to send a transaction specifically for contract deployment.
   *
   * @param options - An object containing various deployment options such as portalContract, contractAddressSalt, and from.
   * @returns A SentTx object that returns the receipt and the deployed contract instance.
   */
  public send(options: DeployOptions = {}): DeploySentTx<TContract> {
    const txHashPromise = super.send(options).getTxHash();
    // Note the bang on this.instance is brittle: it depends on super.send setting the contract instance
    // before any `await` operation, otherwise it'll be undefined by the time we get here. Tests should
    // catch it easily though, but if you start seeing instance.address being undefined in DeploySentTx,
    // this is probably the culprit.
    return new DeploySentTx(this.pxe, txHashPromise, this.postDeployCtor, this.instance!);
  }

  /**
   * Simulate the request.
   * @param options - Deployment options.
   * @returns The simulated tx.
   */
  public simulate(options: DeployOptions): Promise<Tx> {
    return super.simulate(options);
  }

  /** Return this deployment address. */
  public get address() {
    return this.instance?.address;
  }

  /** Returns the partial address for this deployment. */
  public get partialAddress() {
    return this.instance && computePartialAddress(this.instance);
  }
}
