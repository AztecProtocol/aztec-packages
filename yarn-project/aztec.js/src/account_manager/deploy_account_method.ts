import type { AuthWitnessProvider } from '@aztec/entrypoints/interfaces';
import {
  EncodedAppEntrypointPayload,
  EncodedFeeEntrypointPayload,
  ExecutionPayload,
  computeCombinedPayloadHash,
} from '@aztec/entrypoints/payload';
import { mergeExecutionPayloads } from '@aztec/entrypoints/utils';
import { type ContractArtifact, type FunctionArtifact, getFunctionArtifactByName } from '@aztec/stdlib/abi';
import type { PublicKeys } from '@aztec/stdlib/keys';

import { Contract } from '../contract/contract.js';
import { ContractFunctionInteraction } from '../contract/contract_function_interaction.js';
import { DeployMethod, type DeployOptions } from '../contract/deploy_method.js';
import type { Wallet } from '../wallet/wallet.js';

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

  protected override async getInitializeExecutionPayload(options: DeployOptions): Promise<ExecutionPayload> {
    let exec = await super.getInitializeExecutionPayload(options);

    if (options.fee && this.#feePaymentArtifact) {
      const { address } = await this.getInstance();
      const emptyAppPayload = await EncodedAppEntrypointPayload.fromAppExecution([]);
      const fee = await this.getDefaultFeeOptions(options.fee);
      const feePayload = await EncodedFeeEntrypointPayload.fromFeeOptions(address, fee);
      const args = [emptyAppPayload, feePayload, false];

      const call = new ContractFunctionInteraction(
        this.wallet,
        address,
        this.#feePaymentArtifact,
        args,
        [
          await this.#authWitnessProvider.createAuthWit(await computeCombinedPayloadHash(emptyAppPayload, feePayload)),
          ...feePayload.authWitnesses,
        ],
        [],
        [...emptyAppPayload.hashedArguments, ...feePayload.hashedArguments],
      );

      exec = mergeExecutionPayloads([exec, await call.request()]);
    }

    return exec;
  }
}
