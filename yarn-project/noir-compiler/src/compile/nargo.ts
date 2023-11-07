import { LogFn, createDebugLogger } from '@aztec/foundation/log';

import { execSync } from 'child_process';
import { readFileSync, readdirSync, statSync, unlinkSync } from 'fs';
import { emptyDirSync } from 'fs-extra';
import path from 'path';

import { NoirCommit, NoirTag } from '../index.js';
import { NoirCompiledContract, NoirContractCompilationArtifacts, NoirDebugMetadata } from '../noir_artifact.js';

/** Compilation options */
export type CompileOpts = {
  /** Silence output from nargo compile. */
  quiet?: boolean;
  /** Path to the nargo binary. */
  nargoBin?: string;
  /** Logging function */
  log?: LogFn;
};

/**
 * A class that compiles Aztec.nr contracts using nargo via the shell.
 */
export class NargoContractCompiler {
  private log: LogFn;
  constructor(private projectPath: string, private opts: CompileOpts = {}) {
    this.log = opts.log ?? createDebugLogger('aztec:noir-compiler');
  }

  /**
   * Compiles the contracts in projectPath and returns the Aztec.nr artifact.
   * @returns Aztec.nr artifact of the compiled contracts.
   */
  public compile(): Promise<NoirContractCompilationArtifacts[]> {
    const stdio = this.opts.quiet ? 'ignore' : 'inherit';
    const nargoBin = this.opts.nargoBin ?? 'nargo';
    const version = execSync(`${nargoBin} --version`, { cwd: this.projectPath, stdio: 'pipe' }).toString();
    this.checkNargoBinVersion(version.replace('\n', ''));
    emptyDirSync(this.getTargetFolder());
    execSync(`${nargoBin} compile --no-backend`, { cwd: this.projectPath, stdio });
    return Promise.resolve(this.collectArtifacts());
  }

  private checkNargoBinVersion(version: string) {
    if (!version.includes(NoirCommit)) {
      this.log(
        `Warning: the nargo version installed locally does not match the expected one. This may cause issues when compiling or deploying contracts. Consider updating your nargo or aztec-cli installation. \n- Expected: ${NoirTag} (git version hash: ${NoirCommit})\n- Found: ${version}`,
      );
    } else if (!this.opts.quiet) {
      this.log(`Using ${version}`);
    }
  }

  private collectArtifacts(): NoirContractCompilationArtifacts[] {
    const contractArtifacts = new Map<string, NoirCompiledContract>();
    const debugArtifacts = new Map<string, NoirDebugMetadata>();

    for (const filename of readdirSync(this.getTargetFolder())) {
      const file = path.join(this.getTargetFolder(), filename);
      if (statSync(file).isFile() && file.endsWith('.json')) {
        if (filename.startsWith('debug_')) {
          debugArtifacts.set(
            filename.replace('debug_', ''),
            JSON.parse(readFileSync(file).toString()) as NoirDebugMetadata,
          );
        } else {
          contractArtifacts.set(filename, JSON.parse(readFileSync(file).toString()) as NoirCompiledContract);
        }
        // Delete the file as it is not needed anymore and it can cause issues with prettier
        unlinkSync(file);
      }
    }

    return [...contractArtifacts.entries()].map(([filename, contractArtifact]) => {
      const debugArtifact = debugArtifacts.get(filename);
      return {
        contract: contractArtifact,
        debug: debugArtifact,
      };
    });
  }

  private getTargetFolder() {
    return path.join(this.projectPath, 'target');
  }
}
