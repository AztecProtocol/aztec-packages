import { type ContractArtifact, type FunctionArtifact, getFunctionArtifactByName } from '@aztec/stdlib/abi';
import type { PublicKeys } from '@aztec/stdlib/keys';

import type { AuthWitnessProvider } from '../account/interface.js';
import type { Wallet } from '../account/wallet.js';
import { Contract } from '../contract/contract.js';
import { DeployMethod, type DeployOptions } from '../contract/deploy_method.js';
import { ContractFunctionInteraction } from '../contract/index.js';
import { EntrypointPayload, computeCombinedPayloadHash } from '../entrypoint/payload.js';

/**
 * Contract interaction for deploying an account contract. Handles fee preparation and contract initialization.
 */
export class DeployAccountMethod extends DeployMethod {
  #authWitnessProvider: AuthWitnessProvider;
  #feePaymentArtifact: FunctionArtifact | undefined;

  constructor(
    authWitnessProvider: AuthWitnessProvider,
    publicKeys: PublicKeys,
    wallet: Wallet,
    artifact: ContractArtifact,
    args: any[] = [],
    constructorNameOrArtifact?: string | FunctionArtifact,
    feePaymentNameOrArtifact?: string | FunctionArtifact,
  ) {
    super(
      publicKeys,
      wallet,
      artifact,
      (address, wallet) => Contract.at(address, artifact, wallet),
      args,
      constructorNameOrArtifact,
    );

    this.#authWitnessProvider = authWitnessProvider;
    this.#feePaymentArtifact =
      typeof feePaymentNameOrArtifact === 'string'
        ? getFunctionArtifactByName(artifact, feePaymentNameOrArtifact)
        : feePaymentNameOrArtifact;
  }

  protected override async getInitializeFunctionCalls(options: DeployOptions): Promise<ContractFunctionInteraction[]> {
    const calls = await super.getInitializeFunctionCalls(options);

    if (options.fee && this.#feePaymentArtifact) {
      const { address } = await this.getInstance();
      const emptyAppPayload = await EntrypointPayload.fromAppExecution([]);
      const fee = await this.getDefaultFeeOptions(options.fee);
      const feePayload = await EntrypointPayload.fromFeeOptions(address, fee);
      const args = [emptyAppPayload, feePayload, false];

      const call = new ContractFunctionInteraction(this.wallet, address, this.#feePaymentArtifact, args);

      call.addAuthWitness(
        await this.#authWitnessProvider.createAuthWit(await computeCombinedPayloadHash(emptyAppPayload, feePayload)),
      );

      call.addHashedArguments(emptyAppPayload.hashedArguments);
      call.addHashedArguments(feePayload.hashedArguments);

      calls.push(call);
    }

    return calls;
  }
}
