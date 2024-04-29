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

import { Field, InputValue, InputMap, Visibility, Sign, AbiType, AbiParameter, Abi, WitnessMap } from "@noir-lang/types";
export { Field, InputValue, InputMap, Visibility, Sign, AbiType, AbiParameter, Abi, WitnessMap } from "@noir-lang/types";



export type ABIError = Error;


