import { type PublicKeys } from '@aztec/circuits.js';
import {
  type ContractArtifact,
  type FunctionArtifact,
  FunctionSelector,
  encodeArguments,
  getFunctionArtifact,
} from '@aztec/foundation/abi';

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
  #feePaymentArtifact: Promise<FunctionArtifact | undefined>;

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
        ? getFunctionArtifact(artifact, feePaymentNameOrArtifact)
        : Promise.resolve(feePaymentNameOrArtifact);
  }

  protected override async getInitializeFunctionCalls(
    options: DeployOptions,
  ): Promise<Pick<ExecutionRequestInit, 'calls' | 'authWitnesses' | 'packedArguments'>> {
    const exec = await super.getInitializeFunctionCalls(options);

    if (options.fee && this.#feePaymentArtifact) {
      const { address } = this.getInstance();
      const emptyAppPayload = EntrypointPayload.fromAppExecution([]);
      const fee = await this.getDefaultFeeOptions(options.fee);
      const feePayload = await EntrypointPayload.fromFeeOptions(address, fee);

      exec.calls.push({
        name: feePaymentArtifact.name,
        to: address,
        args: encodeArguments(feePaymentArtifact, [emptyAppPayload, feePayload, false]),
        selector: await FunctionSelector.fromNameAndParameters(feePaymentArtifact.name, feePaymentArtifact.parameters),
        type: feePaymentArtifact.functionType,
        isStatic: feePaymentArtifact.isStatic,
        returnTypes: feePaymentArtifact.returnTypes,
      });

      exec.authWitnesses ??= [];
      exec.packedArguments ??= [];

      exec.authWitnesses.push(
        await this.#authWitnessProvider.createAuthWit(await computeCombinedPayloadHash(emptyAppPayload, feePayload)),
      );

      exec.packedArguments.push(...emptyAppPayload.packedArguments);
      exec.packedArguments.push(...feePayload.packedArguments);
    }

    return exec;
  }
}
