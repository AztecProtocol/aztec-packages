import { FileManager } from './noir/file-manager/file-manager';
import { createNodejsFileManager } from './noir/file-manager/nodejs-file-manager';
import { LogFn } from './utils';
import { CompilationResult } from './types/noir_artifact';
declare function compile(fileManager: FileManager, projectPath?: string, logFn?: LogFn, debugLogFn?: LogFn): Promise<CompilationResult>;
declare const createFileManager: typeof createNodejsFileManager;
export { compile, createFileManager, CompilationResult };
