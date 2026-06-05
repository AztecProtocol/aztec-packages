import {
  BLOCK_HEADER_LENGTH,
  KEY_VALIDATION_REQUEST_LENGTH,
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
import type { ContractInstance, PartialAddress } from '@aztec/stdlib/contract';
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
 * Describes how to serialize and/or deserialize a single typed value to/from ACVM wire format.
 * Either side is optional — output-only types omit `deserialization`, input-only types omit `serialization`.
 */
export interface TypeMapping<T = any> {
  serialization?: {
    /** Convert a typed value to ACVM output slot(s). */
    fn: (value: T) => (Fr | Fr[])[];
  };
  deserialization?: {
    /** Read a typed value from one FieldReader per consumed slot. */
    fn: (readers: FieldReader[]) => T;
    /**
     * Number of InputSlots this type reads from. `deserialization.fn` receives one FieldReader per slot in `readers`.
     *
     * Examples:
     * - `FIELD`, `U32`, `AZTEC_ADDRESS` — single slot         → `slots: 1`
     * - `OPTION(T)` — discriminant + inner slots              → `slots: T.slots + 1`
     * - `CONTRACT_CLASS_LOG_INPUT` — [addr], [fields], [len]  → `slots: 3`
     */
    slots: number;
  };
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
  deserialization: { fn: ([reader]) => reader.readField(), slots: 1 },
};

export const BOOL: TypeMapping<boolean> = {
  serialization: { fn: v => [new Fr(v ? 1n : 0n)] },
  deserialization: { fn: ([reader]) => !reader.readField().isZero(), slots: 1 },
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
    slots: 1,
  },
};

export const BLOCK_NUMBER: TypeMapping<BlockNumber> = {
  serialization: { fn: v => [new Fr(v)] },
  deserialization: { fn: ([reader]) => BlockNumber(reader.readField().toNumber()), slots: 1 },
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
    slots: 1,
  },
};

// Noir passes `MessageDelivery` onchain variants here.
export const DELIVERY_MODE: TypeMapping<AppTaggingSecretKind> = {
  deserialization: {
    fn: readers => appTaggingSecretKindFromDeliveryMode(BYTE.deserialization!.fn(readers)),
    slots: BYTE.deserialization!.slots,
  },
};

export const BIGINT: TypeMapping<bigint> = {
  serialization: { fn: v => [new Fr(v)] },
  deserialization: { fn: ([reader]) => reader.readField().toBigInt(), slots: 1 },
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
    slots: 1,
  },
};

export const AZTEC_ADDRESS: TypeMapping<AztecAddress> = {
  serialization: { fn: v => [v.toField()] },
  deserialization: { fn: ([reader]) => AztecAddress.fromField(reader.readField()), slots: 1 },
};

export const BLOCK_HASH: TypeMapping<BlockHash> = {
  serialization: { fn: v => [new Fr(v.toBuffer())] },
  deserialization: { fn: ([reader]) => new BlockHash(reader.readField()), slots: 1 },
};

export const FUNCTION_SELECTOR: TypeMapping<FunctionSelector> = {
  serialization: { fn: v => [v.toField()] },
  deserialization: { fn: ([reader]) => FunctionSelector.fromField(reader.readField()), slots: 1 },
};

export const NOTE_SELECTOR: TypeMapping<NoteSelector> = {
  serialization: { fn: v => [v.toField()] },
  deserialization: { fn: ([reader]) => NoteSelector.fromField(reader.readField()), slots: 1 },
};

export const TX_HASH: TypeMapping<TxHash> = {
  serialization: { fn: v => [v.hash] },
  deserialization: { fn: ([reader]) => TxHash.fromField(reader.readField()), slots: 1 },
};

export const TAG: TypeMapping<Tag> = {
  serialization: { fn: v => [v.value] },
  deserialization: { fn: ([reader]) => new Tag(reader.readField()), slots: 1 },
};

export const POINT: TypeMapping<Point> = {
  serialization: { fn: p => [p.toFields()] },
  deserialization: {
    fn: ([reader]) => Point.fromFields([reader.readField(), reader.readField()]),
    slots: 1,
  },
};

// ─── Struct Type Mappings ────────────────────────────────────────────────────

export const BLOCK_HEADER: TypeMapping<BlockHeader> = {
  serialization: { fn: v => v.toFields() },
  deserialization: { fn: ([reader]) => BlockHeader.fromFields(reader.readFieldArray(BLOCK_HEADER_LENGTH)), slots: 1 },
};

export const KEY_VALIDATION_REQUEST: TypeMapping<KeyValidationRequest> = {
  serialization: { fn: v => v.toFields() },
  deserialization: {
    fn: ([reader]) => KeyValidationRequest.fromFields(reader.readFieldArray(KEY_VALIDATION_REQUEST_LENGTH)),
    slots: 1,
  },
};

export const CONTRACT_INSTANCE: TypeMapping<ContractInstance> = {
  serialization: {
    fn: v => [
      v.salt,
      v.deployer.toField(),
      v.currentContractClassId,
      v.initializationHash,
      v.immutablesHash,
      ...v.publicKeys.toFields(),
    ],
  },
};

export const NULLIFIER_MEMBERSHIP_WITNESS: TypeMapping<NullifierMembershipWitness> = {
  serialization: {
    fn: (w: NullifierMembershipWitness) =>
      w
        .toNoirRepresentation()
        .map(slot => (Array.isArray(slot) ? slot.map(s => Fr.fromString(s)) : Fr.fromString(slot as string))),
  },
};

export const PUBLIC_DATA_WITNESS: TypeMapping<PublicDataWitness> = {
  serialization: {
    fn: (w: PublicDataWitness) =>
      w
        .toNoirRepresentation()
        .map(slot => (Array.isArray(slot) ? slot.map(s => Fr.fromString(s)) : Fr.fromString(slot as string))),
  },
};

export const MESSAGE_LOAD_ORACLE_INPUTS: TypeMapping<MessageLoadOracleInputs<typeof L1_TO_L2_MSG_TREE_HEIGHT>> = {
  serialization: {
    fn: (m: MessageLoadOracleInputs<typeof L1_TO_L2_MSG_TREE_HEIGHT>) =>
      m
        .toNoirRepresentation()
        .map(slot => (Array.isArray(slot) ? slot.map(s => Fr.fromString(s)) : Fr.fromString(slot as string))),
  },
};

export const UTILITY_CONTEXT: TypeMapping<UtilityContext> = {
  serialization: {
    fn: (ctx: UtilityContext) => [...ctx.blockHeader.toFields(), ctx.contractAddress.toField()],
  },
};

export const CALL_PRIVATE_RESULT: TypeMapping<{ endSideEffectCounter: Fr; returnsHash: Fr }> = {
  serialization: { fn: v => [[v.endSideEffectCounter, v.returnsHash]] },
};

export const PUBLIC_KEYS_AND_PARTIAL_ADDRESS: TypeMapping<{
  publicKeys: PublicKeys;
  partialAddress: PartialAddress;
}> = {
  serialization: {
    fn: v => [[...v.publicKeys.toFields(), v.partialAddress]],
  },
};

export const CONTRACT_CLASS_LOG_INPUT: TypeMapping<ContractClassLog> = {
  deserialization: {
    fn: ([addrReader, fieldsReader, lengthReader]) => {
      const addr = AztecAddress.fromField(addrReader.readField());
      const fields = new ContractClassLogFields([...fieldsReader.readFieldArray(fieldsReader.remainingFields())]);
      const length = lengthReader.readField().toNumber();
      return new ContractClassLog(addr, fields, length);
    },
    // ContractClassLog input occupies 3 ACVM slots: [contractAddress], [message fields...], [length].
    slots: 3,
  },
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
};

export const PENDING_TAGGED_LOG: TypeMapping<PendingTaggedLog> = {
  serialization: { fn: log => [log.toFields()] },
};

export const NOTE_VALIDATION_REQUEST: TypeMapping<NoteValidationRequest> = {
  deserialization: {
    fn: ([reader]) => NoteValidationRequest.fromFields(reader),
    slots: 1,
  },
};

export const EVENT_VALIDATION_REQUEST: TypeMapping<EventValidationRequest> = {
  deserialization: {
    fn: ([reader]) => EventValidationRequest.fromFields(reader),
    slots: 1,
  },
};

export const LOG_RETRIEVAL_REQUEST: TypeMapping<LogRetrievalRequest> = {
  serialization: { fn: req => [req.toFields()] },
  deserialization: {
    fn: ([reader]) => LogRetrievalRequest.fromFields(reader),
    slots: 1,
  },
};

export const LOG_RETRIEVAL_RESPONSE: TypeMapping<LogRetrievalResponse> = {
  serialization: { fn: resp => [resp.toFields()] },
};

export const MESSAGE_CONTEXT: TypeMapping<MessageContext> = {
  serialization: { fn: mc => [mc.toFields()] },
};

export const PROVIDED_SECRET: TypeMapping<ProvidedSecret> = {
  deserialization: {
    fn: ([reader]) => ProvidedSecret.fromFields(reader),
    slots: 1,
  },
};

// ─── Combinator Type Mappings ────────────────────────────────────────────────

/** `_height` is unused at runtime but lets TypeScript infer the exact `N` for `MembershipWitness<N>`. */
export function MEMBERSHIP_WITNESS<N extends number>(_height: N): TypeMapping<MembershipWitness<N>> {
  return {
    serialization: {
      fn: (witness: MembershipWitness<N>) => [new Fr(witness.leafIndex), [...witness.siblingPath]],
    },
  };
}

export function ARRAY<T>(element: TypeMapping<T>): TypeMapping<T[]> {
  return {
    serialization: element.serialization
      ? { fn: values => [values.flatMap(v => element.serialization!.fn(v).flat())] }
      : undefined,
    deserialization: element.deserialization
      ? {
          fn: ([reader]) => {
            const result: T[] = [];
            while (!reader.isFinished()) {
              result.push(element.deserialization!.fn([reader]));
            }
            return result;
          },
          slots: 1,
        }
      : undefined,
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
export function BOUNDED_VEC<T>(element: TypeMapping<T>): TypeMapping<BoundedVec<T>> {
  return {
    serialization: element.serialization
      ? {
          fn: bv => {
            if (bv.data.length > bv.maxLength) {
              throw new Error(`Got ${bv.data.length} items, but maxLength is ${bv.maxLength}`);
            }
            const flat = bv.data.flatMap(item => element.serialization!.fn(item).flat());
            return [padArrayEnd(flat, Fr.ZERO, bv.maxLength * bv.elementSize), new Fr(bv.data.length)];
          },
        }
      : undefined,
    deserialization: element.deserialization
      ? {
          fn: ([storageReader, lengthReader]) => {
            const maxLength = storageReader.remainingFields();
            const length = lengthReader.readField().toNumber();
            const elements: T[] = [];
            for (let i = 0; i < length; i++) {
              elements.push(element.deserialization!.fn([storageReader]));
            }
            // Drain the trailing zero-padding (maxLength - length unused element slots) so the storage reader is
            // fully consumed.
            storageReader.skip(storageReader.remainingFields());
            return BoundedVec.from<T>({ data: elements, maxLength });
          },
          slots: 2,
        }
      : undefined,
  };
}

/**
 * Wraps an inner TypeMapping in Noir-style `Option<T>`. Adds a discriminant slot and uses the handler-provided
 * `Option.none(shape)` template to produce a correctly-sized zero-filled output for the None case.
 *
 * @example Serializing `Option.some(AztecAddress.fromField(Fr(42)))` with `OPTION(AZTEC_ADDRESS)`:
 * ```
 * slot 0: Fr(1)    // discriminant: Some
 * slot 1: Fr(42)   // inner value
 * ```
 *
 * @example Serializing `Option.empty(AztecAddress.ZERO)` with `OPTION(AZTEC_ADDRESS)`:
 * ```
 * slot 0: Fr(0)    // discriminant: None
 * slot 1: Fr(0)    // zero-filled using shape
 * ```
 */
export function OPTION<T>(inner: TypeMapping<T>): TypeMapping<Option<T>> {
  return {
    serialization: inner.serialization
      ? {
          fn: opt => {
            if (opt.isSome()) {
              return [Fr.ONE, ...inner.serialization!.fn(opt.value)];
            }
            if (opt.template === undefined) {
              throw new Error(
                'Cannot serialize Option.empty() without an emptyTemplate — provide one via Option.empty(emptyTemplate)',
              );
            }
            const zeroSlots = inner
              .serialization!.fn(opt.template)
              .map(s => (Array.isArray(s) ? Array(s.length).fill(Fr.ZERO) : Fr.ZERO));
            return [Fr.ZERO, ...zeroSlots];
          },
        }
      : undefined,
    deserialization: inner.deserialization
      ? {
          fn: ([discriminant, ...innerReaders]) => {
            if (discriminant.readField().isZero()) {
              // None still carries zero-filled inner slots on the wire; drain them so the inner readers are fully
              // consumed.
              innerReaders.forEach(reader => reader.skip(reader.remainingFields()));
              return Option.none<T>(undefined as unknown as T);
            }
            return Option.some(inner.deserialization!.fn(innerReaders));
          },
          slots: inner.deserialization.slots + 1,
        }
      : undefined,
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
      slots: 1,
    },
  };
}

export function EPHEMERAL_ARRAY<T>(element: TypeMapping<T>): TypeMapping<EphemeralArray<T>> {
  // An EphemeralArray param is a single slot; the per-param assert covers that slot but never sees the
  // per-row readers materialized in readAll(). Assert full consumption per row here.
  const rowElement: TypeMapping<T> | undefined = element.deserialization
    ? {
        deserialization: {
          fn: readers => {
            const value = element.deserialization!.fn(readers);
            assertReadersConsumed(readers);
            return value;
          },
          slots: element.deserialization.slots,
        },
      }
    : undefined;
  return {
    serialization: element.serialization
      ? { fn: ea => [ea.materializeSlot(v => element.serialization!.fn(v).flat() as Fr[])] }
      : undefined,
    deserialization: rowElement
      ? { fn: ([reader]) => EphemeralArray.fromSlot(reader.readField(), rowElement), slots: 1 }
      : undefined,
  };
}
