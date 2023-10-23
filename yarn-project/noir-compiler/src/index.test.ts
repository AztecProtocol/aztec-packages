import { ContractArtifact } from '@aztec/foundation/abi';
import { LogFn, createDebugLogger } from '@aztec/foundation/log';
import { fileURLToPath } from '@aztec/foundation/url';

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

  const tests: Array<[string, (path: string, opts: { log: LogFn }) => Promise<ContractArtifact[]>]> = [
    ['noir_wasm', compileUsingNoirWasm],
  ];

  if (isNargoAvailable()) {
    tests.push(['nargo', compileUsingNargo]);
  }

  describe.each(tests)('using %s binary', (_, compileFn) => {
    let compiled: ContractArtifact[];
    beforeAll(async () => {
      compiled = await compileFn(projectPath, { log });
    });

    it('compiles the test contract', () => {
      expect(compiled).toMatchSnapshot();
    });

    it('generates typescript interface', () => {
      const result = generateTypescriptContractInterface(compiled[0], `../target/test.json`);
      expect(result).toMatchSnapshot();
    });

    it('generates Aztec.nr external interface', () => {
      const result = generateNoirContractInterface(compiled[0]);
      expect(result).toMatchSnapshot();
    });
  });

  const conditionalIt = isNargoAvailable() ? it : it.skip;
  conditionalIt('both nargo and noir_wasm should compile identically', async () => {
    const [noirWasmArtifact, nargoArtifact] = await Promise.all([
      compileUsingNoirWasm(projectPath, { log }),
      compileUsingNargo(projectPath, { log }),
    ]);

    const withoutDebug = ({ debug: _debug, ...rest }: ContractArtifact): Omit<ContractArtifact, 'debug'> => rest;

    expect(nargoArtifact.map(withoutDebug)).toEqual(noirWasmArtifact.map(withoutDebug));
  });
});
