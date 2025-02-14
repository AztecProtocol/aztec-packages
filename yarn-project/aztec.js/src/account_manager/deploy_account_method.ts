import {
  type ContractArtifact,
  type FunctionArtifact,
  FunctionSelector,
  encodeArguments,
  getFunctionArtifactByName,
} from '@aztec/stdlib/abi';
import { PublicKeys } from '@aztec/stdlib/keys';

import { type AuthWitnessProvider } from '../account/interface.js';
import { type Wallet } from '../account/wallet.js';
import { type ExecutionRequestInit } from '../api/entrypoint.js';
import { Contract } from '../contract/contract.js';
import { DeployMethod, type DeployOptions } from '../contract/deploy_method.js';
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

  protected override async getInitializeFunctionCalls(
    options: DeployOptions,
  ): Promise<Pick<ExecutionRequestInit, 'calls' | 'authWitnesses' | 'hashedArguments'>> {
    const exec = await super.getInitializeFunctionCalls(options);

    if (options.fee && this.#feePaymentArtifact) {
      const { address } = await this.getInstance();
      const emptyAppPayload = await EntrypointPayload.fromAppExecution([]);
      const fee = await this.getDefaultFeeOptions(options.fee);
      const feePayload = await EntrypointPayload.fromFeeOptions(address, fee);

      exec.calls.push({
        name: this.#feePaymentArtifact.name,
        to: address,
        args: encodeArguments(this.#feePaymentArtifact, [emptyAppPayload, feePayload, false]),
        selector: await FunctionSelector.fromNameAndParameters(
          this.#feePaymentArtifact.name,
          this.#feePaymentArtifact.parameters,
        ),
        type: this.#feePaymentArtifact.functionType,
        isStatic: this.#feePaymentArtifact.isStatic,
        returnTypes: this.#feePaymentArtifact.returnTypes,
      });

      exec.authWitnesses ??= [];
      exec.hashedArguments ??= [];

      exec.authWitnesses.push(
        await this.#authWitnessProvider.createAuthWit(await computeCombinedPayloadHash(emptyAppPayload, feePayload)),
      );

      exec.hashedArguments.push(...emptyAppPayload.hashedArguments);
      exec.hashedArguments.push(...feePayload.hashedArguments);
    }

    return exec;
  }
}
