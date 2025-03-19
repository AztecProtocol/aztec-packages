import {
  EncodedAppEntrypointCalls,
  EncodedCallsForEntrypoint,
  computeCombinedPayloadHash,
} from '@aztec/entrypoints/encoding';
import type { AuthWitnessProvider } from '@aztec/entrypoints/interfaces';
import { ExecutionPayload, mergeExecutionPayloads } from '@aztec/entrypoints/payload';
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
      const emptyAppCalls = await EncodedAppEntrypointCalls.fromAppExecution([]);
      const fee = await this.getDefaultFeeOptions(options.fee);
      // Get the execution payload for the fee, it includes the calls and potentially authWitnesses
      const { calls: feeCalls, authWitnesses: feeAuthwitnesses } = await fee.paymentMethod.getExecutionPayload(
        fee.gasSettings,
      );
      // Encode the calls for the fee
      const feePayer = await fee.paymentMethod.getFeePayer(fee.gasSettings);
      const isFeePayer = feePayer.equals(address);
      const feeEncodedCalls = await EncodedCallsForEntrypoint.fromFeeCalls(feeCalls, isFeePayer);
      const args = [emptyAppCalls, feeEncodedCalls, false];

      const combinedPayloadAuthWitness = await this.#authWitnessProvider.createAuthWit(
        await computeCombinedPayloadHash(emptyAppCalls, feeEncodedCalls),
      );

      const call = new ContractFunctionInteraction(
        this.wallet,
        address,
        this.#feePaymentArtifact,
        args,
        [combinedPayloadAuthWitness, ...feeAuthwitnesses],
        [],
        [...emptyAppCalls.hashedArguments, ...feeEncodedCalls.hashedArguments],
      );

      exec = mergeExecutionPayloads([exec, await call.request()]);
    }

    return exec;
  }
}
