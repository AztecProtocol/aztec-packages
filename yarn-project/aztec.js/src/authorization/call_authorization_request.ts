import type { Fr } from '@aztec/foundation/curves/bn254';
import { FieldReader } from '@aztec/foundation/serialize';
import { AuthorizationSelector, FunctionSelector } from '@aztec/stdlib/abi';
import { computeInnerAuthWitHash } from '@aztec/stdlib/auth-witness';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { computeVarArgsHash } from '@aztec/stdlib/hash';

/**
 * An authwit request for a function call. Includes the preimage of the data
 * to be signed, as opposed of just the inner hash.
 */
export class CallAuthorizationRequest {
  private constructor(
    /**
     * The selector of the authwit type, used to identify it
     * when emitted from `emit_offchain_effect`oracle.
     * Computed as poseidon2("CallAuthwit((Field),(u32),Field)".to_bytes())
     */
    public selector: AuthorizationSelector,
    /**
     * The inner hash of the authwit, computed as
     * poseidon2([msg_sender, selector, args_hash])
     */
    public innerHash: Fr,
    /**
     * The address on whose behalf the auth witness should be created.
     * This is the account that must sign the authorization.
     */
    public onBehalfOf: AztecAddress,
    /**
     * The address performing the call
     */
    public msgSender: AztecAddress,
    /**
     * The selector of the function that is to be authorized
     * */
    public functionSelector: FunctionSelector,
    /**
     * The hash of the arguments to the function call,
     */
    public argsHash: Fr,
    /**
     * The arguments to the function call.
     */
    public args: Fr[],
  ) {}

  /** Validates that innerHash and argsHash are consistent with the provided preimage fields. */
  private async validate(): Promise<void> {
    const expectedArgsHash = await computeVarArgsHash(this.args);
    if (!expectedArgsHash.equals(this.argsHash)) {
      throw new Error(
        `CallAuthorizationRequest argsHash mismatch: expected ${expectedArgsHash.toString()}, got ${this.argsHash.toString()}`,
      );
    }
    const expectedInnerHash = await computeInnerAuthWitHash([
      this.msgSender.toField(),
      this.functionSelector.toField(),
      this.argsHash,
    ]);
    if (!expectedInnerHash.equals(this.innerHash)) {
      throw new Error(
        `CallAuthorizationRequest innerHash mismatch: expected ${expectedInnerHash.toString()}, got ${this.innerHash.toString()}`,
      );
    }
  }

  static getSelector(): Promise<AuthorizationSelector> {
    return AuthorizationSelector.fromSignature('CallAuthorization((Field),(u32),Field)');
  }

  static async fromFields(fields: Fr[]): Promise<CallAuthorizationRequest> {
    const expectedSelector = await CallAuthorizationRequest.getSelector();
    const reader = FieldReader.asReader(fields);
    const selector = AuthorizationSelector.fromField(reader.readField());
    if (!selector.equals(expectedSelector)) {
      throw new Error(
        `Invalid authorization selector for CallAuthwit: expected ${expectedSelector.toString()}, got ${selector.toString()}`,
      );
    }
    const request = new CallAuthorizationRequest(
      selector,
      reader.readField(), // inner_hash
      AztecAddress.fromFieldUnsafe(reader.readField()), // on_behalf_of
      AztecAddress.fromFieldUnsafe(reader.readField()), // msg_sender
      FunctionSelector.fromField(reader.readField()), // fn_selector
      reader.readField(), // args_hash
      reader.readFieldArray(reader.remainingFields()), // args
    );
    await request.validate();
    return request;
  }
}
