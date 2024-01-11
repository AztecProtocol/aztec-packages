/**
* This is a method that exposes the same API as `compile`
* But uses the Context based APi internally
* @param {string} entry_point
* @param {boolean | undefined} contracts
* @param {DependencyGraph | undefined} dependency_graph
* @param {PathToFileSourceMap} file_source_map
* @returns {CompileResult}
*/
export function compile_(entry_point: string, contracts: boolean | undefined, dependency_graph: DependencyGraph | undefined, file_source_map: PathToFileSourceMap): CompileResult;
/**
* @param {string} filter
*/
export function init_log_level(filter: string): void;
/**
* @returns {any}
*/
export function build_info(): any;
/**
* @param {string} entry_point
* @param {boolean | undefined} contracts
* @param {DependencyGraph | undefined} dependency_graph
* @param {PathToFileSourceMap} file_source_map
* @returns {CompileResult}
*/
export function compile(entry_point: string, contracts: boolean | undefined, dependency_graph: DependencyGraph | undefined, file_source_map: PathToFileSourceMap): CompileResult;
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
export default __wbg_init;
export function initSync(module: any): any;
declare function __wbg_init(input: any): Promise<any>;
