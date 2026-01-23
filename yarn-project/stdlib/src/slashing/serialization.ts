import { times } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { BufferReader, bigintToUInt64BE, bigintToUInt128BE, serializeToBuffer } from '@aztec/foundation/serialize';

import type {
  Offense,
  OffenseType,
  SlashPayload,
  SlashPayloadRound,
  ValidatorSlash,
  ValidatorSlashOffense,
} from './types.js';

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

function serializeValidatorSlashOffense(offense: ValidatorSlashOffense): Buffer {
  return serializeToBuffer(bigintToUInt64BE(offense.epochOrSlot), offense.offenseType);
}

function deserializeValidatorSlashOffense(buffer: Buffer | BufferReader): ValidatorSlashOffense {
  const reader = BufferReader.asReader(buffer);
  return {
    epochOrSlot: reader.readUInt64(),
    offenseType: reader.readNumber() as OffenseType,
  };
}

function serializeValidatorSlash(slash: ValidatorSlash): Buffer {
  return serializeToBuffer(
    slash.validator,
    bigintToUInt128BE(slash.amount),
    slash.offenses.length,
    slash.offenses.map(serializeValidatorSlashOffense),
  );
}

function deserializeValidatorSlash(buffer: Buffer | BufferReader): ValidatorSlash {
  const reader = BufferReader.asReader(buffer);
  const validator = reader.readObject(EthAddress);
  const amount = reader.readUInt128();
  const offensesCount = reader.readNumber();
  const offenses = times(offensesCount, () => deserializeValidatorSlashOffense(reader));

  return { validator, amount, offenses };
}

export function serializeSlashPayload(payload: SlashPayload): Buffer {
  return serializeToBuffer(
    payload.address,
    payload.slashes.length,
    payload.slashes.map(serializeValidatorSlash),
    bigintToUInt64BE(payload.timestamp),
  );
}

export function deserializeSlashPayload(buffer: Buffer): SlashPayload {
  const reader = BufferReader.asReader(buffer);
  const address = reader.readObject(EthAddress);
  const slashesCount = reader.readNumber();
  const slashes = times(slashesCount, () => deserializeValidatorSlash(reader));
  const timestamp = reader.readUInt64();
  return { address, slashes, timestamp };
}

export function serializeSlashPayloadRound(payload: SlashPayloadRound): Buffer {
  return serializeToBuffer(
    payload.address,
    payload.slashes.length,
    payload.slashes.map(serializeValidatorSlash),
    bigintToUInt64BE(payload.timestamp),
    Number(payload.votes),
    bigintToUInt64BE(payload.round),
  );
}

export function deserializeSlashPayloadRound(buffer: Buffer): SlashPayloadRound {
  const reader = BufferReader.asReader(buffer);
  const address = reader.readObject(EthAddress);
  const slashesCount = reader.readNumber();
  const slashes = times(slashesCount, () => deserializeValidatorSlash(reader));
  const timestamp = reader.readUInt64();
  const votes = BigInt(reader.readNumber());
  const round = reader.readUInt64();

  return { address, slashes, timestamp, votes, round };
}
