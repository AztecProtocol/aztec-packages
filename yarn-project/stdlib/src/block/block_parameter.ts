import { type BlockNumber, BlockNumberSchema } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { BlockHash } from './block_hash.js';

export const BlockTag = ['latest', 'proposed', 'checkpointed', 'proven', 'finalized'] as const;

/**
 * Tag identifying a block by its position in the chain rather than by an absolute identifier.
 * - `latest` / `proposed`: Latest L2 block proposed (not necessarily checkpointed/proven yet).
 * - `checkpointed`: Latest L2 block whose enclosing checkpoint has been published on L1.
 * - `proven`: Latest L2 block whose enclosing checkpoint has been proven on L1.
 * - `finalized`: Latest L2 block whose proving L1 transaction has reached L1 finality.
 */
export type BlockTag = (typeof BlockTag)[number];

export const BlockTagWithoutLatestSchema = z.union([
  z.literal('proposed'),
  z.literal('checkpointed'),
  z.literal('proven'),
  z.literal('finalized'),
]);

export const BlockTagSchema: z.ZodType<BlockTag> = z.union([z.literal('latest'), BlockTagWithoutLatestSchema]);

/**
 * Object-only form of {@link BlockParameter}. Used as the building block for {@link BlockQuery}.
 */
export type NormalizedBlockParameter =
  | { number: BlockNumber }
  | { hash: BlockHash }
  | { archive: Fr }
  | { tag: Exclude<BlockTag, 'latest'> };

export const NormalizedBlockParameterSchema: z.ZodType<NormalizedBlockParameter, unknown> = z.union([
  z.object({ number: BlockNumberSchema }).strict(),
  z.object({ hash: BlockHash.schema }).strict(),
  z.object({ archive: schemas.Fr }).strict(),
  z.object({ tag: BlockTagWithoutLatestSchema }).strict(),
]);

/**
 * Anchor naming a block by both its height and its hash.
 *
 * The hash pins the fork, exactly as a bare `{ hash }` does. The number additionally tells a server that has not
 * seen the block whether the anchor is the block right after its tip — a client that raced ahead by one block —
 * or a block it should already know, which means the anchor is stale or was reorged away. Only the RPC boundary
 * consumes the number; every lookup past it goes by hash.
 */
export type AnchoredBlockParameter = { number: BlockNumber; hash: BlockHash };

/**
 * Selector for a block in RPC calls.
 *
 * Accepts a block number, a {@link BlockHash}, a chain-tip name (e.g. `'proven'`, `'checkpointed'`),
 * `'latest'` (alias for `'proposed'`), any of the {@link NormalizedBlockParameter} object variants
 * (`{ number }`, `{ hash }`, `{ archive }`, `{ tag }`), or the {@link AnchoredBlockParameter} form
 * (`{ number, hash }`).
 */
export type BlockParameter = NormalizedBlockParameter | AnchoredBlockParameter | BlockNumber | BlockHash | BlockTag;

export const AnchoredBlockParameterSchema: z.ZodType<AnchoredBlockParameter, unknown> = z
  .object({ number: BlockNumberSchema, hash: BlockHash.schema })
  .strict();

/** The selector keys an object form of {@link BlockParameter} may carry. */
const BLOCK_PARAMETER_SELECTORS = ['number', 'hash', 'archive', 'tag'] as const;

/**
 * Catch-all object form, tried only after every exact variant has been rejected: unknown keys are stripped rather
 * than refused, so a client sending a key this version does not know about is still served. Selector keys are not
 * treated so leniently — an object naming two blocks in two different ways is a client bug and says nothing about
 * which one to answer, so it is rejected rather than silently resolved by whichever key is read first. The one
 * combination that does name a single block, `number` + `hash`, is the anchored form. The result is transformed to
 * an exact variant so nothing downstream ever sees a mixed object.
 */
const looseBlockParameterSchema: z.ZodType<NormalizedBlockParameter | AnchoredBlockParameter, unknown> = z
  .object({
    number: BlockNumberSchema.optional(),
    hash: BlockHash.schema.optional(),
    archive: schemas.Fr.optional(),
    tag: BlockTagWithoutLatestSchema.optional(),
  })
  .transform((param, ctx) => {
    const selectors = BLOCK_PARAMETER_SELECTORS.filter(key => param[key] !== undefined);
    if (param.number !== undefined && param.hash !== undefined && selectors.length === 2) {
      return { number: param.number, hash: param.hash };
    }
    if (selectors.length === 1) {
      if (param.number !== undefined) {
        return { number: param.number };
      }
      if (param.hash !== undefined) {
        return { hash: param.hash };
      }
      if (param.archive !== undefined) {
        return { archive: param.archive };
      }
      if (param.tag !== undefined) {
        return { tag: param.tag };
      }
    }
    ctx.addIssue({
      code: 'custom',
      message:
        `A block parameter object must name exactly one block, via a single one of ` +
        `${BLOCK_PARAMETER_SELECTORS.join(', ')} or via number and hash together, but got [${selectors.join(', ')}]`,
    });
    return z.NEVER;
  });

export const BlockParameterSchema: z.ZodType<BlockParameter, unknown> = z.union([
  NormalizedBlockParameterSchema,
  BlockHash.schema,
  BlockTagSchema,
  BlockNumberSchema,
  AnchoredBlockParameterSchema,
  looseBlockParameterSchema,
]);

/** True when `param` is an {@link AnchoredBlockParameter}, naming a block by both its number and its hash. */
export function isAnchoredBlockParameter(param: BlockParameter): param is AnchoredBlockParameter {
  return typeof param === 'object' && param !== null && 'number' in param && 'hash' in param;
}

/**
 * The block hash `param` pins, or `undefined` when it names a block in a way a reorg can move (a number or a tag) or
 * by an archive root. Every hash-bearing form — a bare {@link BlockHash}, `{ hash }`, and the anchored
 * `{ number, hash }` — pins the same block, so callers that only care which fork the answer belongs to treat them
 * alike.
 */
export function blockParameterHash(param: BlockParameter): BlockHash | undefined {
  if (BlockHash.isBlockHash(param)) {
    return param;
  }
  if (typeof param === 'object' && param !== null && 'hash' in param) {
    return param.hash;
  }
  return undefined;
}

export function inspectBlockParameter(param: BlockParameter) {
  if (typeof param === 'number') {
    return param.toString();
  } else if (typeof param === 'string') {
    return param;
  } else if ('number' in param && 'hash' in param) {
    return `number=${param.number.toString()},hash=${param.hash.toString()}`;
  } else if ('number' in param) {
    return `number=${param.number.toString()}`;
  } else if ('hash' in param) {
    return `hash=${param.hash.toString()}`;
  } else if ('archive' in param) {
    return `archive=${param.archive.toString()}`;
  } else if ('tag' in param) {
    return `tag=${param.tag}`;
  } else {
    return jsonStringify(param);
  }
}
