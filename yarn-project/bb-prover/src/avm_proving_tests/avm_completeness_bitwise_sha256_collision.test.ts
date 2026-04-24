import { createLogger } from '@aztec/foundation/log';
import { defaultGlobals, deployBitwiseSha256ErrorRowCollisionContracts } from '@aztec/simulator/public/fixtures';
import { AvmCircuitInputs } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { NativeWorldStateService } from '@aztec/world-state';

import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'path';

import { BB_RESULT, generateAvmProof } from '../bb/execute.js';
import { AvmProvingTester } from './avm_proving_tester.js';

const BB_PATH = path.resolve('../../barretenberg/cpp/build/bin/bb-avm');

describe('AVM completeness — bitwise/sha256 error row collision', () => {
  let tester: AvmProvingTester;
  let worldStateService: NativeWorldStateService;
  const logger = createLogger('avm-completeness-bitwise-sha256');

  beforeEach(async () => {
    worldStateService = await NativeWorldStateService.tmp();
    tester = await AvmProvingTester.new(worldStateService, /*checkCircuitOnly=*/ true, /*globals=*/ defaultGlobals());
  });

  afterEach(async () => {
    await worldStateService.close();
  });

  it('confirms completeness bug: honest transaction cannot be proven (BITW_NO_EXTERNAL_START_ON_ERROR violated)', async () => {
    const { innerContract, outerContract } = await deployBitwiseSha256ErrorRowCollisionContracts(tester);
    const sender = AztecAddress.fromNumber(42);

    // 1. Simulation — inner call reverts (tag mismatch), outer runs SHA256, outer RETURNs OK.
    //    The tx is valid from the node's perspective.
    const simRes = await tester.simulateTx(
      sender,
      /*setupCalls=*/ [],
      /*appCalls=*/ [{ address: outerContract.address, args: [innerContract.address.toField()] }],
    );
    expect(simRes.revertCode.isOK()).toBe(true);
    logger.info('Simulation succeeded — transaction is valid from the node perspective');

    // 2. Proving — call generateAvmProof directly to bypass AvmProvingTester.prove()'s
    //    internal expect(SUCCESS). We want to ASSERT that proving FAILS.
    const bbWorkingDirectory = await fs.mkdtemp(path.join(tmpdir(), 'bb-'));
    const avmCircuitInputs = new AvmCircuitInputs(simRes.hints!, simRes.publicInputs!);
    const proofRes = await generateAvmProof(
      BB_PATH,
      bbWorkingDirectory,
      avmCircuitInputs,
      logger,
      /*checkCircuitOnly=*/ true,
    );

    if (proofRes.status === BB_RESULT.FAILURE) {
      logger.info(`Proving FAILED — completeness bug confirmed: honest prover cannot prove valid tx`);
      logger.info(`Failure reason: ${proofRes.reason}`);
    }
    expect(proofRes.status).toBe(BB_RESULT.FAILURE);
  }, 180_000);
});
