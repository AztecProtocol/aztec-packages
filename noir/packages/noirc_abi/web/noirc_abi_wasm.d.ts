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



export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly abiEncode: (a: number, b: number, c: number, d: number) => void;
  readonly abiDecode: (a: number, b: number, c: number) => void;
  readonly __wbindgen_malloc: (a: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number) => number;
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
  readonly __wbindgen_free: (a: number, b: number) => void;
  readonly wasm_bindgen__convert__closures__invoke2_mut__hb71d0e9d93bb5497: (a: number, b: number, c: number, d: number) => void;
  readonly __wbindgen_exn_store: (a: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {SyncInitInput} module
*
* @returns {InitOutput}
*/
export function initSync(module: SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {InitInput | Promise<InitInput>} module_or_path
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: InitInput | Promise<InitInput>): Promise<InitOutput>;
