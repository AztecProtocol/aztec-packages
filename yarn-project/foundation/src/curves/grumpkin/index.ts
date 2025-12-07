import { Fq } from '../bn254/field.js';

export * from './point.js';

/**
 * GrumpkinScalar is an Fq.
 * @remarks Called GrumpkinScalar because it is used to represent elements in Grumpkin's scalar field as defined in
 *          the Aztec Protocol Specs.
 */
export type GrumpkinScalar = Fq;
export const GrumpkinScalar = Fq;
