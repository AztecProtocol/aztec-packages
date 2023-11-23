import { LogFn, createDebugLogger } from '@aztec/foundation/log';

import { CompileError, compile } from '@noir-lang/noir_wasm';
import { isAbsolute } from 'node:path';

import { NoirCompilationResult, NoirProgramCompilationArtifacts } from '../../noir_artifact.js';
import { NoirDependencyManager } from './dependencies/dependency-manager.js';
import { GithubDependencyResolver as GithubCodeArchiveDependencyResolver } from './dependencies/github-dependency-resolver.js';
import { LocalDependencyResolver } from './dependencies/local-dependency-resolver.js';
import { FileManager } from './file-manager/file-manager.js';
import { initializeResolver } from './noir-source-resolver.shim.cjs';
import { NoirPackage } from './package.js';

/** Compilation options */
export type NoirWasmCompileOptions = {
  /** Logging function */
  log: LogFn;
  /** Log debugging information through this function */
  debugLog?: LogFn;
};

/**
 * Noir Package Compiler
 */
export class NoirWasmContractCompiler {
  #log: LogFn;
  #debugLog: LogFn;
  #package: NoirPackage;
  #fm: FileManager;
  #dependencyManager: NoirDependencyManager;

  private constructor(
    entrypoint: NoirPackage,
    dependencyManager: NoirDependencyManager,
    fileManager: FileManager,
    opts: NoirWasmCompileOptions,
  ) {
    this.#log = opts.log;
    this.#debugLog = opts.debugLog ?? createDebugLogger('aztec:noir-compiler:wasm');
    this.#package = entrypoint;
    this.#fm = fileManager;
    this.#dependencyManager = dependencyManager;
  }

  /**
   * Creates a new compiler instance.
   * @param fileManager - The file manager to use
   * @param projectPath - The path to the project
   * @param opts - Compilation options
   */
  public static new(fileManager: FileManager, projectPath: string, opts: NoirWasmCompileOptions) {
    if (!isAbsolute(projectPath)) {
      throw new Error('projectPath must be an absolute path');
    }

    const noirPackage = NoirPackage.open(projectPath, fileManager);

    const dependencyManager = new NoirDependencyManager(
      [
        new LocalDependencyResolver(fileManager),
        new GithubCodeArchiveDependencyResolver(fileManager),
        // TODO support actual Git repositories
      ],
      noirPackage,
    );

    return new NoirWasmContractCompiler(noirPackage, dependencyManager, fileManager, opts);
  }

  /**
   * Gets the version of Aztec.nr that was used compiling this contract.
   */
  public getResolvedAztecNrVersion() {
    // TODO eliminate this hardcoded library name!
    // see docs/docs/dev_docs/contracts/setup.md
    return this.#dependencyManager.getVersionOf('aztec');
  }

  /**
   * Compile EntryPoint
   */
  public async compile(): Promise<NoirCompilationResult[]> {
    if (this.#package.getType() === 'contract') {
      this.#debugLog(`Compiling Contract at ${this.#package.getEntryPointPath()}`);
      return await this.compileContract();
    } else if (this.#package.getType() === 'bin') {
      this.#debugLog(`Compiling Program at ${this.#package.getEntryPointPath()}`);
      return await this.compileProgram();
    } else {
      this.#log(
        `Compile skipped - only supports compiling "contract" and "bin" package types (${this.#package.getType()})`,
      );
      return [];
    }
  }

  /**
   * Compiles the Program.
   */
  public async compileProgram(): Promise<NoirProgramCompilationArtifacts[]> {
    await this.#dependencyManager.resolveDependencies();
    this.#debugLog(`Dependencies: ${this.#dependencyManager.getPackageNames().join(', ')}`);

    initializeResolver(this.#resolveFile);

    try {
      const isContract: boolean = false;
      const result = compile(this.#package.getEntryPointPath(), isContract, {
        /* eslint-disable camelcase */
        root_dependencies: this.#dependencyManager.getEntrypointDependencies(),
        library_dependencies: this.#dependencyManager.getLibraryDependencies(),
        /* eslint-enable camelcase */
      });

      if (!('program' in result)) {
        throw new Error('No program found in compilation result');
      }

      return [{ name: this.#package.getNoirPackageConfig().package.name, ...result }];
    } catch (err) {
      if (err instanceof Error && err.name === 'CompileError') {
        this.#processCompileError(err as CompileError);
      }

      throw err;
    }
  }

  /**
   * Compiles the Contract.
   */
  public async compileContract(): Promise<NoirCompilationResult[]> {
    if (!(this.#package.getType() === 'contract' || this.#package.getType() === 'bin')) {
      this.#log(
        `Compile skipped - only supports compiling "contract" and "bin" package types (${this.#package.getType()})`,
      );
      return [];
    }
    this.#debugLog(`Compiling contract at ${this.#package.getEntryPointPath()}`);
    await this.#dependencyManager.resolveDependencies();
    this.#debugLog(`Dependencies: ${this.#dependencyManager.getPackageNames().join(', ')}`);

    initializeResolver(this.#resolveFile);

    try {
      const isContract: boolean = true;
      const result = compile(this.#package.getEntryPointPath(), isContract, {
        /* eslint-disable camelcase */
        root_dependencies: this.#dependencyManager.getEntrypointDependencies(),
        library_dependencies: this.#dependencyManager.getLibraryDependencies(),
        /* eslint-enable camelcase */
      });

      if (!('contract' in result)) {
        throw new Error('No contract found in compilation result');
      }

      return [result];
    } catch (err) {
      if (err instanceof Error && err.name === 'CompileError') {
        this.#processCompileError(err as CompileError);
        throw new Error('Compilation failed');
      }

      throw err;
    }
  }

  #resolveFile = (path: string) => {
    try {
      const libFile = this.#dependencyManager.findFile(path);
      return this.#fm.readFileSync(libFile ?? path, 'utf-8');
    } catch (err) {
      return '';
    }
  };

  #processCompileError(err: CompileError): void {
    for (const diag of err.diagnostics) {
      this.#log(`  ${diag.message}`);
      const contents = this.#resolveFile(diag.file);
      const lines = contents.split('\n');
      const lineOffsets = lines.reduce<number[]>((accum, _, idx) => {
        if (idx === 0) {
          accum.push(0);
        } else {
          accum.push(accum[idx - 1] + lines[idx - 1].length + 1);
        }
        return accum;
      }, []);

      for (const secondary of diag.secondaries) {
        const errorLine = lineOffsets.findIndex(offset => offset > secondary.start);
        this.#log(`    ${diag.file}:${errorLine}: ${contents.slice(secondary.start, secondary.end)}`);
      }
    }
  }
}
