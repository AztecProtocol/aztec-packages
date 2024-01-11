export function compile_(entry_point: string, contracts: boolean | undefined, dependency_graph: DependencyGraph | undefined, file_source_map: PathToFileSourceMap): CompileResult;
export function init_log_level(filter: string): void;
export function build_info(): any;
export function compile(entry_point: string, contracts: boolean | undefined, dependency_graph: DependencyGraph | undefined, file_source_map: PathToFileSourceMap): CompileResult;
export function __wbindgen_object_drop_ref(arg0: any): void;
export function __wbg_constructor_a29cdb41a75eb0e8(arg0: any): number;
export function __wbg_constructor_a3b5b211c5053ce8(): number;
export function __wbindgen_is_undefined(arg0: any): boolean;
export function __wbg_new_abda76e883ba8a5f(): number;
export function __wbg_stack_658279fe44541cf6(arg0: any, arg1: any): void;
export function __wbg_error_f851667af71bcfc6(arg0: any, arg1: any): void;
export function __wbindgen_string_new(arg0: any, arg1: any): number;
export function __wbg_debug_e3f6a1578e6d45ca(arg0: any): void;
export function __wbg_debug_efabe4eb183aa5d4(arg0: any, arg1: any, arg2: any, arg3: any): void;
export function __wbg_error_a7e23606158b68b9(arg0: any): void;
export function __wbg_error_50f42b952a595a23(arg0: any, arg1: any, arg2: any, arg3: any): void;
export function __wbg_info_05db236d79f1b785(arg0: any): void;
export function __wbg_info_24d8f53d98f12b95(arg0: any, arg1: any, arg2: any, arg3: any): void;
export function __wbg_warn_9bdd743e9f5fe1e0(arg0: any): void;
export function __wbg_warn_8342bfbc6028193a(arg0: any, arg1: any, arg2: any, arg3: any): void;
export function __wbindgen_string_get(arg0: any, arg1: any): void;
export function __wbg_set_07da13cc24b69217(...args: any[]): any;
export function __wbg_parse_76a8a18ca3f8730b(...args: any[]): any;
export function __wbg_stringify_d06ad2addc54d51e(...args: any[]): any;
export function __wbindgen_debug_string(arg0: any, arg1: any): void;
export function __wbindgen_throw(arg0: any, arg1: any): never;
/**
*/
export class PathToFileSourceMap {
    static __wrap(ptr: any): any;
    __destroy_into_raw(): number | undefined;
    __wbg_ptr: number | undefined;
    free(): void;
    /**
    * @param {string} path
    * @param {string} source_code
    * @returns {boolean}
    */
    add_source_code(path: string, source_code: string): boolean;
}
/**
* This is a wrapper class that is wasm-bindgen compatible
* We do not use js_name and rename it like CrateId because
* then the impl block is not picked up in javascript.
*/
export class CompilerContext {
    static __wrap(ptr: any): any;
    /**
    * @param {PathToFileSourceMap} source_map
    */
    constructor(source_map: PathToFileSourceMap);
    __destroy_into_raw(): number | undefined;
    __wbg_ptr: number | undefined;
    free(): void;
    /**
    * @param {string} path_to_crate
    * @returns {CrateId}
    */
    process_root_crate(path_to_crate: string): CrateId;
    /**
    * @param {string} path_to_crate
    * @returns {CrateId}
    */
    process_dependency_crate(path_to_crate: string): CrateId;
    /**
    * @param {string} crate_name
    * @param {CrateId} from
    * @param {CrateId} to
    */
    add_dependency_edge(crate_name: string, from: CrateId, to: CrateId): void;
    /**
    * @param {number} program_width
    * @returns {CompileResult}
    */
    compile_program(program_width: number): CompileResult;
    /**
    * @param {number} program_width
    * @returns {CompileResult}
    */
    compile_contract(program_width: number): CompileResult;
}
/**
*/
export class CrateId {
    static __wrap(ptr: any): any;
    __destroy_into_raw(): number | undefined;
    __wbg_ptr: number | undefined;
    free(): void;
}
declare let wasm: any;
export { wasm as __wasm };
