import { MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS } from '@aztec/constants';
import {
  StorageProofTestContract,
  StorageProofTestContractArtifact,
} from '@aztec/noir-test-contracts.js/StorageProofTest';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { NativeWorldStateService } from '@aztec/world-state';

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { AvmSimulationTester } from '../fixtures/avm_simulation_tester.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('AVM simulator apps tests: StorageProof', () => {
  const deployer = AztecAddress.fromNumber(42);
  const sender = AztecAddress.fromNumber(4200);
  let storageProver: ContractInstanceWithAddress;
  let worldStateService: NativeWorldStateService;
  let simTester: AvmSimulationTester;

  beforeEach(async () => {
    worldStateService = await NativeWorldStateService.tmp();
    simTester = await AvmSimulationTester.create(worldStateService);
    storageProver = await simTester.registerAndDeployContract(
      [],
      /*deployer=*/ deployer,
      StorageProofTestContractArtifact,
    );
  });

  afterEach(async () => {
    await worldStateService.close();
  });

  it('Should verify an account proof', async () => {
    const storageProofJson = JSON.parse(readFileSync(join(__dirname, '../fixtures/account_proof.json'), 'utf8'));

    const bytecode = StorageProofTestContract.artifactForPublic.functions.find(
      f => f.name === 'account_proof',
    )!.bytecode!;
    expect(bytecode.length).toBeLessThan(MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS * 31);

    const results = await simTester.simulateCall(
      sender,
      /*address=*/ storageProver.address,
      'account_proof',
      [storageProofJson.account, storageProofJson.root, storageProofJson.nodes, storageProofJson.node_length],
      true,
    );
    expect(results.reverted).toBe(false);
  });
});
