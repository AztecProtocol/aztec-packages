import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { AvmTestContractArtifact } from '@aztec/noir-test-contracts.js/AvmTest';
import { TestExecutorMetrics, defaultGlobals } from '@aztec/simulator/public/fixtures';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';

import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

import { AvmProvingTester } from './avm_proving_tester.js';

describe('AVM bulk test', () => {
  const sender = AztecAddress.fromNumber(42);
  let avmTestContractInstance: ContractInstanceWithAddress;
  const metrics = new TestExecutorMetrics();
  let tester: AvmProvingTester;
  const logger = createLogger('avm-bulk-test');

  beforeAll(async () => {
    tester = await AvmProvingTester.new(/*checkCircuitOnly=*/ false, /*globals=*/ defaultGlobals(), metrics);
    avmTestContractInstance = await tester.registerAndDeployContract(
      /*constructorArgs=*/ [],
      /*deployer=*/ AztecAddress.fromNumber(420),
      AvmTestContractArtifact,
    );
    tester.setMetricsPrefix('bb-prover');
  });

  afterAll(() => {
    if (process.env.BENCH_OUTPUT) {
      mkdirSync(path.dirname(process.env.BENCH_OUTPUT), { recursive: true });
      writeFileSync(process.env.BENCH_OUTPUT, metrics.toGithubActionBenchmarkJSON());
    } else if (process.env.BENCH_OUTPUT_MD) {
      writeFileSync(process.env.BENCH_OUTPUT_MD, metrics.toPrettyString());
    } else {
      logger.info(`\n`); // sometimes jest tests obscure the last line(s)
      logger.info(metrics.toPrettyString());
    }
  });

  it('Prove and verify', async () => {
    // Get a deployed contract instance to pass to the contract
    // for it to use as "expected" values when testing contract instance retrieval.
    const expectContractInstance = avmTestContractInstance;
    const argsField = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x));
    const argsU8 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x));
    const args = [
      argsField,
      argsU8,
      /*getInstanceForAddress=*/ expectContractInstance.address.toField(),
      /*expectedDeployer=*/ expectContractInstance.deployer.toField(),
      /*expectedClassId=*/ expectContractInstance.currentContractClassId.toField(),
      /*expectedInitializationHash=*/ expectContractInstance.initializationHash.toField(),
    ];

    await tester.simProveVerify(
      sender,
      /*setupCalls=*/ [],
      /*appCalls=*/ [{ address: avmTestContractInstance.address, fnName: 'bulk_testing', args }],
      /*teardownCall=*/ undefined,
      /*expectRevert=*/ false,
      /*feePayer*/ undefined,
      /*privateInsertions=*/ {
        nonRevertible: {
          nullifiers: [new Fr(420000)],
          noteHashes: [new Fr(420001)],
        },
        revertible: {
          nullifiers: [new Fr(420002)],
          noteHashes: [new Fr(420003)],
        },
      },
      'bulk_test',
    );
  }, 180_000);
});
