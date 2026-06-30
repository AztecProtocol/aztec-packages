import { AztecClientBackend, Barretenberg } from '@aztec/bb.js';
import { CHONK_PROOF_LENGTH, CHONK_VK_LENGTH_IN_FIELDS } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { mapAvmCircuitPublicInputsToNoir } from '@aztec/noir-protocol-circuits-types/server';
import { AvmTestContractArtifact } from '@aztec/noir-test-contracts.js/AvmTest';
import { PublicTxSimulationTester, bulkTest } from '@aztec/simulator/public/fixtures';
import { AvmCircuitInputs, PublicSimulatorConfig } from '@aztec/stdlib/avm';
import { RecursiveProof } from '@aztec/stdlib/proofs';
import { VerificationKeyAsFields } from '@aztec/stdlib/vks';
import { NativeWorldStateService } from '@aztec/world-state/native';

import { jest } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';

import MockHidingJson from '../artifacts/mock_hiding.json' with { type: 'json' };
import { getWorkingDirectory } from './bb_working_directory.js';
import { proofBytesToRecursiveProof, proveAvm, proveRollupHonk } from './prove_native.js';
import type { KernelPublicInputs } from './types/index.js';
import {
  MockRollupTxBasePublicCircuit,
  generateTestingIVCStack,
  mapAvmProofToNoir,
  mapRecursiveProofToNoir,
  mapVerificationKeyToNoir,
  witnessGenMockPublicBaseCircuit,
} from './witgen.js';

// Auto-generated types from noir are not in camel case.
/* eslint-disable camelcase */

jest.setTimeout(120_000);

const logger = createLogger('ivc-integration:test:avm-integration');

const simConfig: PublicSimulatorConfig = PublicSimulatorConfig.from({
  skipFeeEnforcement: false,
  collectCallMetadata: true, // For results.
  collectDebugLogs: false,
  collectHints: true, // Required for proving!
  collectPublicInputs: true, // Required for proving!
  collectStatistics: false,
});

async function proveMockPublicBaseRollup(
  avmCircuitInputs: AvmCircuitInputs,
  bbWorkingDirectory: string,
  bbBinaryPath: string,
  chonkPublicInputs: KernelPublicInputs,
  chonkProof: RecursiveProof<typeof CHONK_PROOF_LENGTH>,
) {
  const { proof, publicInputs } = await proveAvm(avmCircuitInputs, bbWorkingDirectory, logger);

  // Use the pre-generated standalone vk to verify the proof recursively.
  const chonkVk = await VerificationKeyAsFields.fromKey(
    MockHidingJson.verificationKey.fields.map((str: string) => Fr.fromHexString(str)),
  );
  const baseWitnessResult = await witnessGenMockPublicBaseCircuit({
    chonk_proof_data: {
      public_inputs: chonkPublicInputs,
      proof: mapRecursiveProofToNoir(chonkProof),
      vk_data: mapVerificationKeyToNoir(chonkVk, CHONK_VK_LENGTH_IN_FIELDS),
    },
    proof: mapAvmProofToNoir(proof),
    public_inputs: mapAvmCircuitPublicInputsToNoir(publicInputs),
  });

  await proveRollupHonk(
    'MockRollupTxBasePublicCircuit',
    bbBinaryPath,
    bbWorkingDirectory,
    MockRollupTxBasePublicCircuit,
    baseWitnessResult.witness,
    logger,
  );
}

describe('AVM Integration', () => {
  let bbWorkingDirectory: string;
  let bbBinaryPath: string;

  let backend: AztecClientBackend;
  let chonkProof: RecursiveProof<typeof CHONK_PROOF_LENGTH>;
  let chonkPublicInputs: KernelPublicInputs;
  let worldStateService: NativeWorldStateService;
  let simTester: PublicTxSimulationTester;

  beforeAll(async () => {
    const barretenberg = await Barretenberg.initSingleton({
      threads: 16,
      // logger: (m: string) => logger.info(m),
    });

    bbBinaryPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../barretenberg/cpp/build/bin',
      'bb-avm',
    );

    const [bytecodes, witnessStack, tailPublicInputs, vks] = await generateTestingIVCStack(1, 0);
    chonkPublicInputs = tailPublicInputs;
    backend = new AztecClientBackend(bytecodes, barretenberg);
    const { proofFields: proofAsFields, vk: vkBytes } = await backend.prove(witnessStack, vks);
    chonkProof = await proofBytesToRecursiveProof(proofAsFields, vkBytes);
  });

  beforeEach(async () => {
    //Create a temp working dir
    bbWorkingDirectory = await getWorkingDirectory('bb-avm-integration-');

    worldStateService = await NativeWorldStateService.tmp();
    simTester = await PublicTxSimulationTester.create(
      worldStateService,
      /*globals=*/ undefined, // default
      /*metrics=*/ undefined,
      simConfig,
    );
  });

  afterEach(async () => {
    await simTester.close();
    await worldStateService.close();
  });

  it('Should generate and verify an ultra honk proof from an AVM verification of the bulk test', async () => {
    const avmSimulationResult = await bulkTest(simTester, logger, AvmTestContractArtifact);
    expect(avmSimulationResult.revertCode.isOK()).toBe(true);
    const avmCircuitInputs = new AvmCircuitInputs(avmSimulationResult.hints!, avmSimulationResult.publicInputs!);

    await proveMockPublicBaseRollup(avmCircuitInputs, bbWorkingDirectory, bbBinaryPath, chonkPublicInputs, chonkProof);
  }, 240_000);
});
