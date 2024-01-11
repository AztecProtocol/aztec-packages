import { ContractArtifact } from '@aztec/foundation/abi';
import { LogFn, createDebugLogger } from '@aztec/foundation/log';
import { NoirContractCompilationArtifact } from '@aztec/foundation/noir';
import { fileURLToPath } from '@aztec/foundation/url';
import { loadContractArtifact } from '@aztec/types/abi';

import { execSync } from 'child_process';
import path from 'path';

import {
  compileUsingNargo,
  compileUsingNoirWasm,
  generateNoirContractInterface,
  generateTypescriptContractInterface,
} from './index.js';

function isNargoAvailable() {
  try {
    execSync(`which nargo`);
    return true;
  } catch (error) {
    return false;
  }
}

describe('noir-compiler', () => {
  let projectPath: string;
  let log: LogFn;
  beforeAll(() => {
    const currentDirName = path.dirname(fileURLToPath(import.meta.url));
    projectPath = path.join(currentDirName, 'fixtures/test_contract');
    log = createDebugLogger('noir-compiler:test');
  });

  it('generates typescript interface', () => {
    const result = generateTypescriptContractInterface(compiledContract[0], `../target/test.json`);
    expect(result).toMatchSnapshot();
  });

  it('generates Aztec.nr external interface', () => {
    const result = generateNoirContractInterface(compiledContract[0]);
    expect(result).toMatchSnapshot();
  });
});