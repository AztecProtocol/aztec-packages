import { Abi } from '@noir-lang/noirc_abi';
/**
 * Keep track off all of the Noir primitive types that were used.
 * Most of these will not have a 1-1 definition in TypeScript,
 * so we will need to generate type aliases for them.
 *
 * We want to generate type aliases
 * for specific types that are used in the ABI.
 *
 * For example:
 * - If `Field` is used we want to alias that
 * with `number`.
 * - If `u32` is used we want to alias that with `number` too.
 */
export type PrimitiveTypesUsed = {
    /**
     * The name of the type alias that we will generate.
     */
    aliasName: string;
    /**
     * The TypeScript type that we will alias to.
     */
    tsType: string;
};
/**
 * Generates a TypeScript interface for the ABI.
 * @param abiObj - The ABI to generate the interface for.
 * @returns The TypeScript code to define the interface.
 */
export declare function generateTsInterface(abiObj: Abi, primitiveTypeMap: Map<string, PrimitiveTypesUsed>): [string, {
    inputs: [string, string][];
    returnValue: string | null;
}];
