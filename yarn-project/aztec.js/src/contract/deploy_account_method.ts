import { type FunctionCall, type PXE, PackedArguments, type Tx, TxExecutionRequest } from '@aztec/circuit-types';
import {
  AztecAddress,
  type EthAddress,
  type Fr,
  FunctionData,
  type PublicKey,
  TxContext,
  getContractInstanceFromDeployParams,
} from '@aztec/circuits.js';
import { type FunctionArtifact, encodeArguments, getInitializer } from '@aztec/foundation/abi';

import { type AuthWitnessProvider } from '../account/interface.js';
import { type ContractArtifact } from '../api/abi.js';
import { EntrypointPayload } from '../entrypoint/payload.js';
import { type ContractInstanceWithAddress } from '../index.js';
import { BaseContractInteraction, type SendMethodOptions } from './base_contract_interaction.js';
import { Contract } from './contract.js';
import { type ContractBase } from './contract_base.js';
import { DeploySentTx } from './deploy_sent_tx.js';

/**
 * Options to pass to account contract initialization.
 */
type DeployAccountOptions = {
  /** The Ethereum address of the Portal contract. */
  portalContract?: EthAddress;
  /** An optional salt value used to deterministically calculate the contract address. */
  contractAddressSalt?: Fr;
} & SendMethodOptions;

/**
 * Contract interaction for deployment. Handles class registration, public instance deployment,
 * and initialization of the contract. Extends the BaseContractInteraction class.
 */
export class DeployAccountMethod<TContract extends ContractBase = Contract> extends BaseContractInteraction {
  private initializerArtifact?: FunctionArtifact;
  private instance?: ContractInstanceWithAddress;

  constructor(
    pxe: PXE,
    private authWitnessProvider: AuthWitnessProvider,
    private publicKey: PublicKey,
    private artifact: ContractArtifact,
    private args: any[] = [],
    initializerNameOrArtifact?: string | FunctionArtifact,
  ) {
    super(pxe);
    this.initializerArtifact = getInitializer(artifact, initializerNameOrArtifact);
  }

  /**
   * Creates a TxExecutionRequest for deploying the contract.
   * @param options - Prepares the contract for deployment by calling the request method and creating a TxExecutionRequest.
   * @returns The TxExecutionRequest for deploying the contract.
   */
  public async create(options: DeployAccountOptions = {}): Promise<TxExecutionRequest> {
    if (this.txRequest) {
      return this.txRequest;
    }

    if (!this.initializerArtifact) {
      throw new Error('Account contract can not be initialized without an initializer');
    }

    const feePayload = await EntrypointPayload.fromFeeOptions(options.fee);
    const feeAuthWit = await this.authWitnessProvider.createAuthWit(feePayload.hash());
    await this.pxe.addCapsule(feePayload.toFields());

    const instance = this.getInstance(options);
    const initializerCall: FunctionCall = {
      args: encodeArguments(this.initializerArtifact, this.args),
      functionData: FunctionData.fromAbi(this.initializerArtifact),
      to: instance.address,
    };

    const packedArguments = PackedArguments.fromArgs(initializerCall.args);

    const { chainId, protocolVersion } = await this.pxe.getNodeInfo();
    const txContext = TxContext.empty(chainId, protocolVersion);
    this.txRequest = new TxExecutionRequest(
      initializerCall.to,
      initializerCall.functionData,
      packedArguments.hash,
      txContext,
      [packedArguments, ...feePayload.packedArguments],
      [feeAuthWit],
    );

    await this.pxe.registerContract({ artifact: this.artifact, instance });

    return this.txRequest;
  }

  private getInstance(options: DeployAccountOptions): ContractInstanceWithAddress {
    if (!this.instance) {
      this.instance = getContractInstanceFromDeployParams(this.artifact, {
        constructorArgs: this.args,
        salt: options.contractAddressSalt,
        portalAddress: options.portalContract,
        publicKey: this.publicKey,
        constructorArtifact: this.initializerArtifact,
        deployer: AztecAddress.ZERO,
      });
    }

    return this.instance;
  }

  /**
   * Send the contract deployment transaction using the provided options.
   * This function extends the 'send' method from the ContractFunctionInteraction class,
   * allowing us to send a transaction specifically for contract deployment.
   *
   * @param options - An object containing various deployment options such as portalContract, contractAddressSalt, and from.
   * @returns A SentTx object that returns the receipt and the deployed contract instance.
   */
  public send(options: DeployAccountOptions = {}): DeploySentTx<TContract> {
    const txHashPromise = super.send(options).getTxHash();
    return new DeploySentTx(
      this.pxe,
      txHashPromise,
      (address, wallet) => Contract.at(address, this.artifact, wallet) as Promise<TContract>,
      this.getInstance(options),
    );
  }

  /**
   * Prove the request.
   * @param options - Deployment options.
   * @returns The proven tx.
   */
  public prove(options: DeployAccountOptions): Promise<Tx> {
    return super.prove(options);
  }
}
