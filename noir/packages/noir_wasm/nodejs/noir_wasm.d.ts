/* tslint:disable */
/* eslint-disable */
/**
* @param {Uint8Array} bytes
* @returns {any}
*/
export function acir_read_bytes(bytes: Uint8Array): any;
/**
* @param {any} acir
* @returns {Uint8Array}
*/
export function acir_write_bytes(acir: any): Uint8Array;
/**
* @param {string} level
*/
export function init_log_level(level: string): void;
/**
* @returns {any}
*/
export function build_info(): any;
/**
* @param {string} entry_point
* @param {boolean | undefined} contracts
* @param {DependencyGraph | undefined} dependency_graph
* @returns {CompileResult}
*/
export function compile(entry_point: string, contracts?: boolean, dependency_graph?: DependencyGraph): CompileResult;

export type Diagnostic = {
    message: string;
    file: string;
    secondaries: ReadonlyArray<{
        message: string;
        start: number;
        end: number;
    }>;
}

export interface CompileError extends Error {
    message: string;
    diagnostics: ReadonlyArray<Diagnostic>;
}



export type DependencyGraph = {
    root_dependencies: readonly string[];
    library_dependencies: Readonly<Record<string, readonly string[]>>;
}

export type CompiledContract = {
    noir_version: string;
    name: string;
    backend: string;
    functions: Array<any>;
    events: Array<any>;
};

export type CompiledProgram = {
    noir_version: string;
    backend: string;
    abi: any;
    bytecode: string;
}

export type DebugArtifact = {
    debug_symbols: Array<any>;
    file_map: Record<number, any>;
    warnings: Array<any>;
};

export type CompileResult = (
    | {
        contract: CompiledContract;
        debug: DebugArtifact;
    }
    | {
        program: CompiledProgram;
        debug: DebugArtifact;
    }
);


