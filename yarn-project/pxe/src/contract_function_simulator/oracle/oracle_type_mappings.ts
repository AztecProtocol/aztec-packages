import {
  BLOCK_HEADER_LENGTH,
  CONTRACT_INSTANCE_LENGTH,
  L1_TO_L2_MSG_TREE_HEIGHT,
  MAX_CONTRACT_CLASS_LOGS_PER_TX,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PRIVATE_LOGS_PER_TX,
  MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
} from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';
import { FieldReader } from '@aztec/foundation/serialize';
import { MembershipWitness } from '@aztec/foundation/trees';
import { type ACVMField, fromUintArray } from '@aztec/simulator/client';
import { FunctionSelector, NoteSelector } from '@aztec/stdlib/abi';
import { PublicDataWrite } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash } from '@aztec/stdlib/block';
import type { ContractInstancePreimage, PartialAddress } from '@aztec/stdlib/contract';
import { KeyValidationRequest } from '@aztec/stdlib/kernel';
import type { PublicKeys } from '@aztec/stdlib/keys';
import {
  type AppTaggingSecretKind,
  ContractClassLog,
  ContractClassLogFields,
  FlatPublicLogs,
  MessageContext,
  PendingTaggedLog,
  PrivateLog,
  Tag,
  appTaggingSecretKindFromDeliveryMode,
} from '@aztec/stdlib/logs';
import { NullifierMembershipWitness, PublicDataWitness } from '@aztec/stdlib/trees';
import { BlockHeader, TxEffect, TxHash } from '@aztec/stdlib/tx';

import { BoundedVec } from '../noir-structs/bounded_vec.js';
import { EphemeralArray } from '../noir-structs/ephemeral_array.js';
import { EventValidationRequest } from '../noir-structs/event_validation_request.js';
import { LogRetrievalRequest } from '../noir-structs/log_retrieval_request.js';
import { LogRetrievalResponse } from '../noir-structs/log_retrieval_response.js';
import type { NoteData } from '../noir-structs/note_data.js';
import { NoteValidationRequest } from '../noir-structs/note_validation_request.js';
import { Option } from '../noir-structs/option.js';
import { ProvidedSecret } from '../noir-structs/provided_secret.js';
import { UtilityContext } from '../noir-structs/utility_context.js';
import { MessageLoadOracleInputs } from './message_load_oracle_inputs.js';
import { packAsHintedNote } from './note_packing_utils.js';

// ─── Core Types ──────────────────────────────────────────────────────────────

/** One ACVM input slot: an array of hex-encoded field strings. */
export type InputSlot = ACVMField[];

/** One ACVM output slot: a scalar hex string or an array of hex strings. */
export type OutputSlot = ACVMField | ACVMField[];

/**
 * Wire layout of a single slot:
 * - `'scalar'` — a bare field (one `Fr`); on the ACVM/Noir wire a `Field`.
 * - `{ len }`  — an array of exactly `len` fields (`Fr[]`); a `[Field; len]`.
 * - `'variable'` — a slot whose field count is not statically known and cannot be sized on demand (a string, a
 *   length-prefixed struct). It contributes to the slot count but can never be zero-filled.
 * - `{ lenFrom: fn }` — like `'variable'`, but its field count can be resolved from a runtime size descriptor. The
 *   descriptor's shape is type-specific (e.g. `{ length }`, `{ maxLength }`), so `size` is typed `any`: a single union
 *   can't type each mapping's distinct `lenFrom` under parameter contravariance.
 */
export type SlotShape = 'scalar' | { len: number } | 'variable' | { lenFrom: (size: any) => number };

/**
 * Describes how to serialize and/or deserialize a single typed value to/from ACVM wire format.
 * Either side is optional — output-only types omit `deserialization`, input-only types omit `serialization`.
 */
export interface TypeMapping<T = any> {
  serialization?: {
    /** Convert a typed value to ACVM output slot(s). */
    fn: (value: T) => (Fr | Fr[])[];
  };
  deserialization?: {
    /** Read a typed value from its slots — one {@link FieldReader} per slot, as laid out by {@link shape}. */
    fn: (readers: FieldReader[]) => T;
  };
  /**
   * The type's wire layout, one entry per slot.
   *
   * Examples:
   * - `FIELD` → `['scalar']` // single slot
   * - `OPTION(T)` → `['scalar', ...T.shape]` // [discriminant], [...inner.shape]
   * - `CONTRACT_CLASS_LOG_INPUT` → `['scalar', 'variable', 'scalar']` // [addr], [fields], [len]
   */
  shape: SlotShape[];
}

export type MaybePromise<T> = T | Promise<T>;

/**
 * Asserts that every reader was fully consumed by a deserialization, throwing on leftover fields.
 */
export function assertReadersConsumed(readers: FieldReader[]): void {
  readers.forEach((reader, slot) => {
    if (!reader.isFinished()) {
      throw new Error(
        `Malformed oracle input: ${reader.remainingFields()} unexpected trailing field(s) in slot ${slot}`,
      );
    }
  });
}

// ─── Scalar Type Mappings ────────────────────────────────────────────────────

export const FIELD: TypeMapping<Fr> = {
  serialization: { fn: v => [v] },
  deserialization: { fn: ([reader]) => reader.readField() },
  shape: ['scalar'],
};

export const BOOL: TypeMapping<boolean> = {
  serialization: { fn: v => [new Fr(v ? 1n : 0n)] },
  deserialization: { fn: ([reader]) => !reader.readField().isZero() },
  shape: ['scalar'],
};

export const U32: TypeMapping<number> = {
  serialization: { fn: v => [new Fr(v)] },
  deserialization: {
    fn: ([reader]) => {
      const value = reader.readField().toBigInt();
      if (value > 0xffffffffn) {
        throw new Error(`U32 overflow: value ${value} exceeds u32 max (${0xffffffffn})`);
      }
      return Number(value);
    },
  },
  shape: ['scalar'],
};

export const BLOCK_NUMBER: TypeMapping<BlockNumber> = {
  serialization: { fn: v => [new Fr(v)] },
  deserialization: { fn: ([reader]) => BlockNumber(reader.readField().toNumber()) },
  shape: ['scalar'],
};

/** A u8 byte: serializes to a single Fr; deserializes from a single Fr to a number in [0, 255]. */
export const BYTE: TypeMapping<number> = {
  serialization: { fn: byte => [new Fr(byte)] },
  deserialization: {
    fn: ([reader]) => {
      const value = reader.readField().toBigInt();
      if (value > 0xffn) {
        throw new Error(`BYTE overflow: value ${value} exceeds u8 max (255)`);
      }
      return Number(value);
    },
  },
  shape: ['scalar'],
};

// Noir passes `MessageDelivery` onchain variants here.
export const DELIVERY_MODE: TypeMapping<AppTaggingSecretKind> = {
  deserialization: {
    fn: readers => appTaggingSecretKindFromDeliveryMode(BYTE.deserialization!.fn(readers)),
  },
  shape: BYTE.shape,
};

export const BIGINT: TypeMapping<bigint> = {
  serialization: { fn: v => [new Fr(v)] },
  deserialization: { fn: ([reader]) => reader.readField().toBigInt() },
  shape: ['scalar'],
};

/** Reads every field in the slot as a UTF-8 character code. */
export const STR: TypeMapping<string> = {
  serialization: { fn: str => [Array.from(Buffer.from(str, 'utf-8')).map(b => new Fr(b))] },
  deserialization: {
    fn: ([reader]) => {
      const chars: string[] = [];
      while (!reader.isFinished()) {
        chars.push(String.fromCharCode(reader.readField().toNumber()));
      }
      return chars.join('');
    },
  },
  shape: ['variable'],
};

export const AZTEC_ADDRESS: TypeMapping<AztecAddress> = {
  serialization: { fn: v => [v.toField()] },
  deserialization: { fn: ([reader]) => AztecAddress.fromFieldUnsafe(reader.readField()) },
  shape: ['scalar'],
};

export const BLOCK_HASH: TypeMapping<BlockHash> = {
  serialization: { fn: v => [new Fr(v.toBuffer())] },
  deserialization: { fn: ([reader]) => new BlockHash(reader.readField()) },
  shape: ['scalar'],
};

export const FUNCTION_SELECTOR: TypeMapping<FunctionSelector> = {
  serialization: { fn: v => [v.toField()] },
  deserialization: { fn: ([reader]) => FunctionSelector.fromField(reader.readField()) },
  shape: ['scalar'],
};

export const NOTE_SELECTOR: TypeMapping<NoteSelector> = {
  serialization: { fn: v => [v.toField()] },
  deserialization: { fn: ([reader]) => NoteSelector.fromField(reader.readField()) },
  shape: ['scalar'],
};

export const TX_HASH: TypeMapping<TxHash> = {
  serialization: { fn: v => [v.hash] },
  deserialization: { fn: ([reader]) => TxHash.fromField(reader.readField()) },
  shape: ['scalar'],
};

export const TAG: TypeMapping<Tag> = {
  serialization: { fn: v => [v.value] },
  deserialization: { fn: ([reader]) => new Tag(reader.readField()) },
  shape: ['scalar'],
};

export const POINT: TypeMapping<Point> = {
  serialization: { fn: p => [p.toFields()] },
  deserialization: { fn: ([reader]) => Point.fromFields([reader.readField(), reader.readField()]) },
  shape: [{ len: 2 }],
};

// ─── Struct Type Mappings ────────────────────────────────────────────────────

export const BLOCK_HEADER: TypeMapping<BlockHeader> = {
  serialization: { fn: v => v.toFields() },
  shape: Array<SlotShape>(BLOCK_HEADER_LENGTH).fill('scalar'),
};

export const KEY_VALIDATION_REQUEST: TypeMapping<KeyValidationRequest> = {
  serialization: { fn: v => v.toFields() },
  shape: ['scalar', 'scalar'],
};

export const CONTRACT_INSTANCE: TypeMapping<ContractInstancePreimage> = {
  serialization: {
    fn: v => [
      v.salt,
      v.deployer.toField(),
      // Note that the nr side of this struct does not contain the current class, only original
      v.originalContractClassId,
      v.initializationHash,
      v.immutablesHash,
      ...v.publicKeys.toFields(),
    ],
  },
  shape: Array<SlotShape>(CONTRACT_INSTANCE_LENGTH).fill('scalar'),
};

export const NULLIFIER_MEMBERSHIP_WITNESS: TypeMapping<NullifierMembershipWitness> = {
  serialization: {
    fn: (w: NullifierMembershipWitness) =>
      w
        .toNoirRepresentation()
        .map(slot => (Array.isArray(slot) ? slot.map(s => Fr.fromString(s)) : Fr.fromString(slot as string))),
  },
  shape: ['scalar', 'scalar', 'scalar', 'scalar', { len: 42 }],
};

export const PUBLIC_DATA_WITNESS: TypeMapping<PublicDataWitness> = {
  serialization: {
    fn: (w: PublicDataWitness) =>
      w
        .toNoirRepresentation()
        .map(slot => (Array.isArray(slot) ? slot.map(s => Fr.fromString(s)) : Fr.fromString(slot as string))),
  },
  shape: ['scalar', 'scalar', 'scalar', 'scalar', 'scalar', { len: 40 }],
};

export const MESSAGE_LOAD_ORACLE_INPUTS: TypeMapping<MessageLoadOracleInputs<typeof L1_TO_L2_MSG_TREE_HEIGHT>> = {
  serialization: {
    fn: (m: MessageLoadOracleInputs<typeof L1_TO_L2_MSG_TREE_HEIGHT>) =>
      m
        .toNoirRepresentation()
        .map(slot => (Array.isArray(slot) ? slot.map(s => Fr.fromString(s)) : Fr.fromString(slot as string))),
  },
  shape: ['scalar', { len: L1_TO_L2_MSG_TREE_HEIGHT }], // leaf index + sibling path
};

export const UTILITY_CONTEXT: TypeMapping<UtilityContext> = {
  serialization: {
    fn: (ctx: UtilityContext) => [
      ...ctx.blockHeader.toFields(),
      ctx.contractAddress.toField(),
      ctx.msgSender.toField(),
    ],
  },
  shape: Array<SlotShape>(BLOCK_HEADER_LENGTH + 2).fill('scalar'), // block header + contract address + msg sender
};

export const CALL_PRIVATE_RESULT: TypeMapping<{ endSideEffectCounter: Fr; returnsHash: Fr }> = {
  serialization: { fn: v => [[v.endSideEffectCounter, v.returnsHash]] },
  shape: [{ len: 2 }],
};

export const PUBLIC_KEYS_AND_PARTIAL_ADDRESS: TypeMapping<{
  publicKeys: PublicKeys;
  partialAddress: PartialAddress;
}> = {
  serialization: {
    fn: v => [[...v.publicKeys.toFields(), v.partialAddress]],
  },
  shape: [{ len: 8 }], // a single slot of 7 public-key fields + partial address
};

export const CONTRACT_CLASS_LOG_INPUT: TypeMapping<ContractClassLog> = {
  deserialization: {
    fn: ([addrReader, fieldsReader, lengthReader]) => {
      const addr = AztecAddress.fromFieldUnsafe(addrReader.readField());
      const fields = new ContractClassLogFields(fieldsReader.readFieldArray(fieldsReader.remainingFields()));
      const length = lengthReader.readField().toNumber();
      return new ContractClassLog(addr, fields, length);
    },
  },
  // ContractClassLog input occupies 3 slots: [contractAddress], [message fields...], [length].
  shape: ['scalar', 'variable', 'scalar'],
};

export const TX_EFFECT: TypeMapping<TxEffect> = {
  serialization: {
    fn: (effect: TxEffect) => {
      const flatPublicLogs = FlatPublicLogs.fromLogs(effect.publicLogs);
      return [
        effect.revertCode.toField(),
        effect.txHash.hash,
        effect.transactionFee,
        padArrayEnd(effect.noteHashes, Fr.ZERO, MAX_NOTE_HASHES_PER_TX),
        padArrayEnd(effect.nullifiers, Fr.ZERO, MAX_NULLIFIERS_PER_TX),
        padArrayEnd(effect.l2ToL1Msgs, Fr.ZERO, MAX_L2_TO_L1_MSGS_PER_TX),
        padArrayEnd(
          effect.publicDataWrites,
          PublicDataWrite.empty(),
          MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
        ).flatMap(w => w.toFields()),
        padArrayEnd(effect.privateLogs, PrivateLog.empty(), MAX_PRIVATE_LOGS_PER_TX).flatMap(l => l.toFields()),
        new Fr(flatPublicLogs.length),
        flatPublicLogs.payload,
        padArrayEnd(effect.contractClassLogs, ContractClassLog.empty(), MAX_CONTRACT_CLASS_LOGS_PER_TX).flatMap(l => [
          ...l.fields.toFields(),
          new Fr(l.emittedLength),
          l.contractAddress.toField(),
        ]),
      ] as (Fr | Fr[])[];
    },
  },
  // Mirrors the output above: revertCode, txHash, fee, then padded note hashes / nullifiers / l2-to-l1 msgs /
  // public-data writes / private logs, the public-logs length, the public-logs payload, and the contract-class logs.
  shape: [
    'scalar',
    'scalar',
    'scalar',
    { len: 64 },
    { len: 64 },
    { len: 8 },
    { len: 128 },
    { len: 1088 },
    'scalar',
    { len: 4096 },
    { len: 3025 },
  ],
};

export const NOTE: TypeMapping<NoteData> = {
  serialization: {
    fn: noteData =>
      packAsHintedNote({
        contractAddress: noteData.contractAddress,
        owner: noteData.owner,
        randomness: noteData.randomness,
        storageSlot: noteData.storageSlot,
        noteNonce: noteData.noteNonce,
        isPending: noteData.isPending,
        note: noteData.note,
      }),
  },
  // A packed note is the note's (variable-count) field items followed by 6 metadata scalars, emitted as one field
  // output per element. Its length depends on the note, so it is described as a single variable-width run.
  shape: ['variable'],
};

export const PENDING_TAGGED_LOG: TypeMapping<PendingTaggedLog> = {
  serialization: { fn: log => [log.toFields()] },
  shape: [{ len: 84 }],
};

export const NOTE_VALIDATION_REQUEST: TypeMapping<NoteValidationRequest> = {
  deserialization: {
    fn: ([reader]) => NoteValidationRequest.fromFields(reader),
  },
  shape: ['variable'],
};

export const EVENT_VALIDATION_REQUEST: TypeMapping<EventValidationRequest> = {
  deserialization: {
    fn: ([reader]) => EventValidationRequest.fromFields(reader),
  },
  shape: ['variable'],
};

export const LOG_RETRIEVAL_REQUEST: TypeMapping<LogRetrievalRequest> = {
  serialization: { fn: req => [req.toFields()] },
  deserialization: {
    fn: ([reader]) => LogRetrievalRequest.fromFields(reader),
  },
  // address, tag, source, then (isSome, value) for each of fromBlock and toBlock.
  shape: [{ len: 7 }],
};

export const LOG_RETRIEVAL_RESPONSE: TypeMapping<LogRetrievalResponse> = {
  serialization: { fn: resp => [resp.toFields()] },
  shape: [{ len: 83 }],
};

export const MESSAGE_CONTEXT: TypeMapping<MessageContext> = {
  serialization: { fn: mc => [mc.toFields()] },
  shape: [{ len: 67 }],
};

export const PROVIDED_SECRET: TypeMapping<ProvidedSecret> = {
  deserialization: {
    fn: ([reader]) => ProvidedSecret.fromFields(reader),
  },
  shape: [{ len: 2 }],
};

// ─── Combinator Type Mappings ────────────────────────────────────────────────

export function MEMBERSHIP_WITNESS<N extends number>(height: N): TypeMapping<MembershipWitness<N>> {
  return {
    serialization: {
      fn: (witness: MembershipWitness<N>) => [new Fr(witness.leafIndex), [...witness.siblingPath]],
    },
    shape: ['scalar', { len: height }],
  };
}

export function ARRAY<T>(inner: TypeMapping<T>): TypeMapping<T[]> & { kind: 'array'; inner: TypeMapping<T> } {
  return {
    kind: 'array',
    inner,
    serialization: inner.serialization
      ? { fn: values => [values.flatMap(v => inner.serialization!.fn(v).flat())] }
      : undefined,
    deserialization: inner.deserialization
      ? {
          fn: ([reader]) => {
            // All elements are flattened into one slot; read them out one (fixed-width) element at a time, giving each
            // its own per-slot readers reconstructed from the element's shape.
            const elementWidth = fieldWidth(inner.shape);
            const result: T[] = [];
            while (!reader.isFinished()) {
              const fields = reader.readFieldArray(elementWidth);
              const elementReader = splitByShape(fields, inner.shape);
              const value = inner.deserialization!.fn(elementReader);
              assertReadersConsumed(elementReader);
              result.push(value);
            }
            return result;
          },
        }
      : undefined,
    // One slot of variable length (all elements flattened into it).
    shape: [{ lenFrom: (size: { length: number }) => size.length * fieldWidth(inner.shape) }],
  };
}

/**
 * Maps Noir's `BoundedVec<T, MaxLen>` ↔ TS `BoundedVec<T>` over 2 slots:
 *   slot 0 — flat storage, padded/parsed as `maxLength * elementSize` fields
 *   slot 1 — length scalar (count of actual items)
 *
 * Both directions are derived from `element`: bidirectional iff `element` has both serialization and deserialization.
 *
 * @example Serializing `BoundedVec.from({ data: [0x41, 0x42], maxLength: 4 })` with `BOUNDED_VEC(BYTE)`:
 * ```
 * slot 0: [Fr(0x41), Fr(0x42), Fr(0), Fr(0)]     // data padded to maxLength
 * slot 1: Fr(2)                                  // actual length
 * ```
 */
export function BOUNDED_VEC<T>(
  inner: TypeMapping<T>,
): TypeMapping<BoundedVec<T>> & { kind: 'bounded-vec'; inner: TypeMapping<T> } {
  return {
    kind: 'bounded-vec',
    inner,
    serialization: inner.serialization
      ? {
          fn: bv => {
            if (bv.data.length > bv.maxLength) {
              throw new Error(`Got ${bv.data.length} items, but maxLength is ${bv.maxLength}`);
            }
            const flat = bv.data.flatMap(item => inner.serialization!.fn(item).flat());
            return [padArrayEnd(flat, Fr.ZERO, bv.maxLength * bv.elementSize), new Fr(bv.data.length)];
          },
        }
      : undefined,
    deserialization: inner.deserialization
      ? {
          fn: ([storageReader, lengthReader]) => {
            // slot 0 is the padded storage, slot 1 the actual length. Parse only the first `length` elements out of
            // storage; the trailing zero-padding is left untouched.
            const elementWidth = fieldWidth(inner.shape);
            const maxLength = storageReader.remainingFields() / elementWidth;
            const length = lengthReader.readField().toNumber();
            const elements: T[] = [];
            for (let i = 0; i < length; i++) {
              const fields = storageReader.readFieldArray(elementWidth);
              const elementReader = splitByShape(fields, inner.shape);
              const value = inner.deserialization!.fn(elementReader);
              assertReadersConsumed(elementReader);
              elements.push(value);
            }
            // Drain the trailing zero-padding (maxLength - length unused element slots) so the storage reader is
            // fully consumed.
            storageReader.skip(storageReader.remainingFields());
            return BoundedVec.from<T>({ data: elements, maxLength });
          },
        }
      : undefined,
    // slot 0: variable-length storage; slot 1: the length scalar.
    shape: [{ lenFrom: (size: { maxLength: number }) => size.maxLength * fieldWidth(inner.shape) }, 'scalar'],
  };
}

/**
 * Wraps an inner TypeMapping in Noir-style `Option<T>`, adding a leading discriminant slot.
 *
 * For the `None` case, the inner's slots must still be present on the wire as zero-padding (so `Some` and `None` have
 * identical size). That padding is derived entirely from `inner.shape`.
 *
 * @example Serializing `Option.some(AztecAddress.fromFieldUnsafe(Fr(42)))` with `OPTION(AZTEC_ADDRESS)`:
 * ```
 * slot 0: Fr(1)    // discriminant: Some
 * slot 1: Fr(42)   // inner value
 * ```
 *
 * @example Serializing `Option.none()` with `OPTION(AZTEC_ADDRESS)`:
 * ```
 * slot 0: Fr(0)    // discriminant: None
 * slot 1: Fr(0)    // zero-filled from AZTEC_ADDRESS.shape
 * ```
 */
export function OPTION<T>(inner: TypeMapping<T>): TypeMapping<Option<T>> & { kind: 'option'; inner: TypeMapping<T> } {
  return {
    kind: 'option',
    inner,
    serialization: inner.serialization
      ? {
          fn: opt =>
            opt.isSome()
              ? [Fr.ONE, ...inner.serialization!.fn(opt.value)]
              : [Fr.ZERO, ...zeroSlotsFromShape(inner.shape, opt.size)],
        }
      : undefined,
    deserialization: inner.deserialization
      ? {
          fn: ([discriminant, ...innerReaders]) => {
            if (discriminant.readField().isZero()) {
              // None still carries the inner's zero-padded slots; consume them without parsing, since an inner that
              // validates its fields would reject the zeros.
              innerReaders.forEach(reader => reader.skip(reader.remainingFields()));
              return Option.none<T>();
            }
            return Option.some(inner.deserialization!.fn(innerReaders));
          },
        }
      : undefined,
    // A leading discriminant slot followed by the inner's slots.
    shape: ['scalar', ...inner.shape],
  };
}

/** A packed uint buffer (e.g. `[u8; N]` in Noir): 1 slot of packed uint values ↔ `Buffer`. */
export function BUFFER(bitSize: number): TypeMapping<Buffer> {
  return {
    serialization: {
      fn: buf => [Array.from(buf).map(b => new Fr(b))],
    },
    deserialization: {
      fn: ([reader]) => {
        const fields = reader.readFieldArray(reader.remainingFields()).map(f => f.toString());
        return fromUintArray(fields, bitSize);
      },
    },
    shape: ['variable'],
  };
}

export function EPHEMERAL_ARRAY<T>(element: TypeMapping<T>): TypeMapping<EphemeralArray<T>> {
  // EphemeralArray.readAll hands each row's flat fields in as a single reader; reconstruct the element's per-slot
  // readers from its shape, deserialize, and assert the row was fully consumed so a row with trailing fields is
  // rejected.
  const rowElement: TypeMapping<T> | undefined = element.deserialization
    ? {
        deserialization: {
          fn: ([rowReader]) => {
            const fields = rowReader.readFieldArray(rowReader.remainingFields());
            const readers = splitByShape(fields, element.shape);
            const value = element.deserialization!.fn(readers);
            assertReadersConsumed(readers);
            return value;
          },
        },
        // `fn` reads the whole row from one reader, so this is one variable-width slot, not the element's multi-slot
        // shape.
        shape: ['variable'],
      }
    : undefined;
  return {
    serialization: element.serialization
      ? { fn: ea => [ea.materializeSlot(v => element.serialization!.fn(v).flat() as Fr[])] }
      : undefined,
    deserialization: rowElement
      ? { fn: ([reader]) => EphemeralArray.fromSlot(reader.readField(), rowElement) }
      : undefined,
    // A single slot carrying the array's service-slot id.
    shape: ['scalar'],
  };
}

/** Number of InputSlots a deserializable type spans, derived from its {@link TypeMapping.shape}. */
export function slotsOf(mapping: TypeMapping): number {
  return mapping.shape.length;
}

/** Number of fields a fully-static shape occupies. Throws on a variable-width shape, whose field count isn't known. */
function fieldWidth(shape: SlotShape[]): number {
  return shape.reduce((acc, slot) => {
    if (slot === 'scalar') {
      return acc + 1;
    }
    if (typeof slot === 'object' && 'len' in slot) {
      return acc + slot.len;
    }
    throw new Error('Cannot compute a fixed field width for a variable-width shape');
  }, 0);
}

/** Reconstructs a value's per-slot readers from a flat run of fields, using its shape (inverse of slot-flattening). */
function splitByShape(fields: Fr[], shape: SlotShape[]): FieldReader[] {
  const readers: FieldReader[] = [];
  let cursor = 0;
  shape.forEach((slot, i) => {
    if (slot === 'scalar' || (typeof slot === 'object' && 'len' in slot)) {
      const width = slot === 'scalar' ? 1 : slot.len;
      if (cursor + width > fields.length) {
        throw new Error(`Not enough fields to reconstruct shape: needed ${width}, had ${fields.length - cursor}`);
      }
      readers.push(new FieldReader(fields.slice(cursor, cursor + width)));
      cursor += width;
    } else {
      // A variable slot (sized or not) takes whatever remains, so it must be last.
      if (i !== shape.length - 1) {
        throw new Error('A variable-width slot must be last to be reconstructed from a flat field array');
      }
      readers.push(new FieldReader(fields.slice(cursor)));
      cursor = fields.length;
    }
  });
  if (cursor !== fields.length) {
    throw new Error(`Malformed flattened value: ${fields.length - cursor} unexpected trailing field(s)`);
  }
  return readers;
}

/** Builds the zero-filled slots for a `None`, matching a `Some`'s wire shape (variable slots sized from `size`). */
function zeroSlotsFromShape(shape: SlotShape[], size: unknown): (Fr | Fr[])[] {
  return shape.map(slot => {
    if (slot === 'scalar') {
      return Fr.ZERO;
    }
    if (slot === 'variable') {
      throw new Error('Cannot zero-fill an unsized variable-width slot');
    }
    if ('len' in slot) {
      return Array<Fr>(slot.len).fill(Fr.ZERO);
    }
    if (size === undefined) {
      throw new Error(
        'Serializing Option.none() over a variable-size inner needs a size, e.g. Option.none({ length: n })',
      );
    }
    return Array<Fr>(slot.lenFrom(size)).fill(Fr.ZERO);
  });
}
