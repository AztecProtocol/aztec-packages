import { FileManager } from './file-manager/file-manager';
import { LogFn } from '../utils';
import { CompilationResult } from '../types/noir_artifact';
/** Compilation options */
export type NoirWasmCompileOptions = {
    /** Logging function */
    log: LogFn;
    /** Log debugging information through this function */
    debugLog: LogFn;
};
/**
 * Noir Package Compiler
 */
export declare class NoirWasmCompiler {
    #private;
    private constructor();
    /**
     * Creates a new compiler instance.
     * @param fileManager - The file manager to use
     * @param projectPath - The path to the project
     * @param opts - Compilation options
     */
    static new(fileManager: FileManager, projectPath: string, wasmCompiler: any, sourceMap: any, opts: NoirWasmCompileOptions): Promise<NoirWasmCompiler>;
    /**
     * Compile EntryPoint
     */
    /**
     * Compile EntryPoint
     */
    compile(): Promise<CompilationResult>;
}
