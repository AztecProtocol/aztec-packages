import { PackedArguments, TxExecutionRequest } from '@aztec/circuit-types';
import { type AztecAddress, type PublicKey, TxContext } from '@aztec/circuits.js';

import { type AuthWitnessProvider } from '../account/interface.js';
import { type Wallet } from '../account/wallet.js';
import { type ContractArtifact, type FunctionArtifact } from '../api/abi.js';
import { EntrypointPayload } from '../entrypoint/payload.js';
import { type Contract } from './contract.js';
import { type ContractBase } from './contract_base.js';
import { DeployMethod, type DeployOptions } from './deploy_method.js';

/**
 * Contract interaction for deployment. Handles class registration, public instance deployment,
 * and initialization of the contract. Extends the BaseContractInteraction class.
 */
export class DeployAccountMethod<TContract extends ContractBase = Contract> extends DeployMethod<TContract> {
  constructor(
    private authWitnessProvider: AuthWitnessProvider,
    publicKey: PublicKey,
    wallet: Wallet,
    artifact: ContractArtifact,
    postDeployCtor: (address: AztecAddress, wallet: Wallet) => Promise<TContract>,
    args: any[] = [],
    constructorNameOrArtifact?: string | FunctionArtifact,
  ) {
    super(publicKey, wallet, artifact, postDeployCtor, args, constructorNameOrArtifact);
  }

  /**
   * Creates a TxExecutionRequest for deploying the contract.
   * @param options - Prepares the contract for deployment by calling the request method and creating a TxExecutionRequest.
   * @returns The TxExecutionRequest for deploying the contract.
   */
  public async create(options: DeployOptions = {}): Promise<TxExecutionRequest> {
    if (this.txRequest) {
      return this.txRequest;
    }

    const calls = await this.request(options);
    if (calls.length === 0) {
      throw new Error(`No function calls needed to deploy contract`);
    }
    const feePayload = await EntrypointPayload.fromFeeOptions(options.fee);
    const feeAuthWit = await this.authWitnessProvider.createAuthWit(feePayload.hash());
    await this.pxe.addCapsule(feePayload.toFields());

    const execution = calls[0];
    const packedArguments = PackedArguments.fromArgs(execution.args);

    const { chainId, protocolVersion } = await this.wallet.getNodeInfo();
    const txContext = TxContext.empty(chainId, protocolVersion);
    this.txRequest = new TxExecutionRequest(
      execution.to,
      execution.functionData,
      packedArguments.hash,
      txContext,
      [packedArguments, ...feePayload.packedArguments],
      [feeAuthWit],
    );

    await this.pxe.registerContract({ artifact: this.artifact, instance: this.getInstance() });

    return this.txRequest;
  }
}
