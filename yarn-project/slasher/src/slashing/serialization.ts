import { EthAddress } from '@aztec/foundation/eth-address';
import { BufferReader, bigintToUInt64BE, bigintToUInt128BE, serializeToBuffer } from '@aztec/foundation/serialize';
import type { Offense, OffenseType } from '@aztec/stdlib/slashing';

export function serializeOffense(offense: Offense): Buffer {
  return serializeToBuffer(
    offense.validator,
    bigintToUInt128BE(offense.amount),
    offense.offenseType,
    bigintToUInt64BE(offense.epochOrSlot),
  );
}

export function deserializeOffense(buffer: Buffer): Offense {
  const reader = BufferReader.asReader(buffer);
  const validator = reader.readObject(EthAddress);
  const amount = reader.readUInt128();
  const offense = reader.readNumber() as OffenseType;
  const epochOrSlot = reader.readUInt64();

  return { validator, amount, offenseType: offense, epochOrSlot };
}
