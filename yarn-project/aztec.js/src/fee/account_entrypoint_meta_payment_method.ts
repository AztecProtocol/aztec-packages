import {
  EncodedAppEntrypointCalls,
  EncodedCallsForEntrypoint,
  computeCombinedPayloadHash,
} from '@aztec/entrypoints/encoding';
import type { AuthWitnessProvider, FeePaymentMethod } from '@aztec/entrypoints/interfaces';
import { ExecutionPayload } from '@aztec/entrypoints/payload';
import {
  type ContractArtifact,
  type FunctionArtifact,
  FunctionCall,
  FunctionSelector,
  encodeArguments,
  getFunctionArtifactByName,
} from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { GasSettings } from '@aztec/stdlib/gas';

/**
 * Fee payment method that allows a contract to pay for its own deployment
 * It works by rerouting the provided fee payment method through the account's entrypoint,
 * which sets itself as fee payer.
 *
 * Usually, in order to pay fees it is necessary to obtain an ExecutionPayload that encodes the necessary information
 * that is sent to the user's account entrypoint, that has plumbing to handle a fee payload.
 * If there's no account contract yet (it's being deployed) a MultiCallContract is used, which doesn't have a concept of fees or
 * how to handle this payload.
 * HOWEVER, the account contract's entrypoint does, so this method reshapes that fee payload into a call to the account contract entrypoint
 * being deployed with the original fee payload.
 *
 * This class can be seen in action in AccountManager.ts#getSelfPaymentMethod
 */
export class AccountEntrypointMetaPaymentMethod implements FeePaymentMethod {
  constructor(
    private artifact: ContractArtifact,
    private authWitnessProvider: AuthWitnessProvider,
    private feePaymentNameOrArtifact: string | FunctionArtifact,
    private accountAddress: AztecAddress,
    private paymentMethod: FeePaymentMethod,
  ) {}

  getAsset(): Promise<AztecAddress> {
    return this.paymentMethod.getAsset();
  }

  async getExecutionPayload(gasSettings: GasSettings): Promise<ExecutionPayload> {
    const emptyAppCalls = await EncodedAppEntrypointCalls.fromAppExecution([]);
    // Get the execution payload for the fee, it includes the calls and potentially authWitnesses
    const { calls: feeCalls, authWitnesses: feeAuthwitnesses } =
      await this.paymentMethod.getExecutionPayload(gasSettings);
    // Encode the calls for the fee
    const feePayer = await this.paymentMethod.getFeePayer(gasSettings);
    const isFeePayer = feePayer.equals(this.accountAddress);
    const feeEncodedCalls = await EncodedCallsForEntrypoint.fromFeeCalls(feeCalls, isFeePayer);

    // Get the entrypoint args
    const args = [emptyAppCalls, feeEncodedCalls, false];
    const feePaymentArtifact =
      typeof this.feePaymentNameOrArtifact === 'string'
        ? getFunctionArtifactByName(this.artifact, this.feePaymentNameOrArtifact)
        : this.feePaymentNameOrArtifact;

    const entrypointCall = new FunctionCall(
      feePaymentArtifact.name,
      this.accountAddress,
      await FunctionSelector.fromNameAndParameters(feePaymentArtifact.name, feePaymentArtifact.parameters),
      feePaymentArtifact.functionType,
      feePaymentArtifact.isStatic,
      encodeArguments(feePaymentArtifact, args),
      feePaymentArtifact.returnTypes,
    );

    // Compute the authwitness required to verify the combined payload
    const combinedPayloadAuthWitness = await this.authWitnessProvider.createAuthWit(
      await computeCombinedPayloadHash(emptyAppCalls, feeEncodedCalls),
    );

    return new ExecutionPayload(
      [entrypointCall],
      [combinedPayloadAuthWitness, ...feeAuthwitnesses],
      [],
      [...emptyAppCalls.hashedArguments, ...feeEncodedCalls.hashedArguments],
    );
  }

  getFeePayer(gasSettings: GasSettings): Promise<AztecAddress> {
    return this.paymentMethod.getFeePayer(gasSettings);
  }
}
