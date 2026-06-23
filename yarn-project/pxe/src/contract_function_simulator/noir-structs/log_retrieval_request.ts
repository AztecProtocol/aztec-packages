import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { FieldReader } from '@aztec/foundation/serialize';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Tag } from '@aztec/stdlib/logs';

/** Discriminant for which log source to query. */
export enum LogSource {
  PRIVATE = 0,
  PUBLIC = 1,
  PUBLIC_AND_PRIVATE = 2,
}

/**
 * Intermediate struct used to perform batch log retrieval by PXE. The `utilityBulkRetrieveLogs` oracle expects values of this
 * type to be stored in a `EphemeralArray`.
 */
export class LogRetrievalRequest {
  constructor(
    public contractAddress: AztecAddress,
    public tag: Tag,
    public source: LogSource = LogSource.PUBLIC_AND_PRIVATE,
    public fromBlock?: BlockNumber,
    public toBlock?: BlockNumber,
  ) {}

  toFields(): Fr[] {
    return [
      this.contractAddress.toField(),
      this.tag.value,
      new Fr(this.source),
      new Fr(this.fromBlock !== undefined ? 1 : 0),
      new Fr(this.fromBlock ?? 0),
      new Fr(this.toBlock !== undefined ? 1 : 0),
      new Fr(this.toBlock ?? 0),
    ];
  }

  static fromFields(fields: Fr[] | FieldReader): LogRetrievalRequest {
    const reader = FieldReader.asReader(fields);

    const contractAddress = AztecAddress.fromFieldUnsafe(reader.readField());
    const tag = new Tag(reader.readField());
    const sourceNum = reader.readField().toNumber();
    if (!(sourceNum in LogSource)) {
      const validNames = Object.keys(LogSource).filter(k => isNaN(Number(k)));
      throw new Error(`Invalid LogSource value ${sourceNum}, expected one of ${validNames.join(', ')}`);
    }
    const source = sourceNum as LogSource;

    const fromBlockIsSome = reader.readBoolean();
    const fromBlockValue = reader.readField();
    const fromBlock = fromBlockIsSome ? BlockNumber(fromBlockValue.toNumber()) : undefined;

    const toBlockIsSome = reader.readBoolean();
    const toBlockValue = reader.readField();
    const toBlock = toBlockIsSome ? BlockNumber(toBlockValue.toNumber()) : undefined;

    return new LogRetrievalRequest(contractAddress, tag, source, fromBlock, toBlock);
  }
}
