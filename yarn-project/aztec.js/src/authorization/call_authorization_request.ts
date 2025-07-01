import type { Fr } from '@aztec/foundation/fields';
import { FieldReader } from '@aztec/foundation/serialize';
import { AuthorizationSelector, FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

/**
 * An authwit request for a function call. Includes the preimage of the data
 * to be signed, as opposed of just the inner hash.
 */
export class CallAuthorizationRequest {
  constructor(
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

  static getSelector(): Promise<AuthorizationSelector> {
    return AuthorizationSelector.fromSignature('CallAuthwit((Field),(u32),Field)');
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
    return new CallAuthorizationRequest(
      selector,
      reader.readField(),
      AztecAddress.fromField(reader.readField()),
      FunctionSelector.fromField(reader.readField()),
      reader.readField(),
      reader.readFieldArray(reader.remainingFields()),
    );
  }
}
