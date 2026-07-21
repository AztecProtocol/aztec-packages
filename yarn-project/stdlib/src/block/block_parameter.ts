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
 * Selector for a block in RPC calls.
 *
 * Accepts a block number, a {@link BlockHash}, a chain-tip name (e.g. `'proven'`, `'checkpointed'`),
 * `'latest'` (alias for `'proposed'`), or any of the {@link NormalizedBlockParameter} object variants
 * (`{ number }`, `{ hash }`, `{ archive }`, `{ tag }`).
 */
export type BlockParameter = NormalizedBlockParameter | BlockNumber | BlockHash | BlockTag;

export const BlockParameterSchema: z.ZodType<BlockParameter, unknown> = z.union([
  NormalizedBlockParameterSchema,
  BlockHash.schema,
  BlockTagSchema,
  BlockNumberSchema,
]);

export function inspectBlockParameter(param: BlockParameter) {
  if (typeof param === 'number') {
    return param.toString();
  } else if (typeof param === 'string') {
    return param;
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
