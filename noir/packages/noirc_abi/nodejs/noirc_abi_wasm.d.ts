/* tslint:disable */
/* eslint-disable */
/**
* @param {Abi} abi
* @param {InputMap} inputs
* @param {InputValue | undefined} return_value
* @returns {WitnessMap}
*/
export function abiEncode(abi: Abi, inputs: InputMap, return_value?: InputValue): WitnessMap;
/**
* @param {Abi} abi
* @param {WitnessMap} witness_map
* @returns {any}
*/
export function abiDecode(abi: Abi, witness_map: WitnessMap): any;

// Map from witness index to hex string value of witness.
export type WitnessMap = Map<number, string>;



export type Field = string | number | boolean;
export type InputValue = Field | Field[] | InputMap;
export type InputMap = { [key: string]: InputValue };



export type Visibility = "public" | "private";
export type Sign = "unsigned" | "signed";
export type AbiType = 
    { kind: "field" } |
    { kind: "boolean" } |
    { kind: "string", length: number } |
    { kind: "integer", sign: Sign, width: number } |
    { kind: "array", length: number, type: AbiType } |
    { kind: "tuple", fields: AbiType[] } |
    { kind: "struct", path: string, fields: { name: string, type: AbiType }[] };

export type AbiParameter = {
    name: string,
    type: AbiType,
    visibility: Visibility,
};
    
export type Abi = {
    parameters: AbiParameter[],
    param_witnesses: Record<string, {start: number, end: number}[]>,
    return_type: AbiType | null,
    return_witnesses: number[],
}



export type ABIError = Error;


