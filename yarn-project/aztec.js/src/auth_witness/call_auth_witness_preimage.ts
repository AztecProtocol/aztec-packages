import type { Fr } from '@aztec/foundation/fields';
import { FieldReader } from '@aztec/foundation/serialize';
import { AuthwitSelector, FunctionSelector, decodeFromAbi } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

export class CallAuthwitWithPreimage {
  constructor(
    public selector: AuthwitSelector,
    public innerHash: Fr,
    public msgSender: AztecAddress,
    public functionSelector: FunctionSelector,
    public argsHash: Fr,
    public args: Fr[],
  ) {}

  static async fromFields(fields: Fr[]): Promise<CallAuthwitWithPreimage> {
    const expectedSelector = await AuthwitSelector.fromSignature('CallAuthwit((Field),(Field),Field)');
    const reader = FieldReader.asReader(fields);
    const selector = AuthwitSelector.fromField(reader.readField());
    if (!selector.equals(expectedSelector)) {
      throw new Error(
        `Invalid authwit selector for CallAuthwit: expected ${expectedSelector.toString()}, got ${selector.toString()}`,
      );
    }
    return new CallAuthwitWithPreimage(
      selector,
      reader.readField(),
      AztecAddress.fromField(reader.readField()),
      FunctionSelector.fromField(reader.readField()),
      reader.readField(),
      reader.readFieldArray(reader.remainingFields()),
    );
  }
}
