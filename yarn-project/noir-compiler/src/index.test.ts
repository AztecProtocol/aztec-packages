import { ContractArtifact } from '@aztec/foundation/abi';
import { LogFn, createDebugLogger } from '@aztec/foundation/log';
import { fileURLToPath } from '@aztec/foundation/url';

import path from 'path';

import { compileUsingNoirWasm, generateNoirContractInterface, generateTypescriptContractInterface } from './index.js';

describe('noir-compiler', () => {
  let projectPath: string;
  let log: LogFn;
  beforeAll(() => {
    const currentDirName = path.dirname(fileURLToPath(import.meta.url));
    projectPath = path.join(currentDirName, 'fixtures/test_contract');
    log = createDebugLogger('noir-compiler:test');
  });

  describe('using noir_wasm', () => {
    let compiled: ContractArtifact[];
    beforeAll(async () => {
      compiled = await compileUsingNoirWasm(projectPath, { log });
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
});
