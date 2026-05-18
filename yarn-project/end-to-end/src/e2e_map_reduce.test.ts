import type { FieldLike } from '@aztec/aztec.js/abi';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import type { Logger } from '@aztec/aztec.js/log';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { Barretenberg, UltraHonkBackend, deflattenFields } from '@aztec/bb.js';
import { MapReduceContract } from '@aztec/noir-contracts.js/MapReduce';
import { Noir } from '@aztec/noir-noir_js';

import { jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

import { setup } from './fixtures/utils.js';

const CIRCUIT_DIR = path.resolve(
  path.join(path.dirname(new URL(import.meta.url).pathname), '../../../noir-projects/noir-circuits/target'),
);

const NUM_SUBMISSIONS = 5;

interface ProofData {
  vkAsFields: string[];
  vkHash: string;
  proofAsFields: string[];
  publicInputs: string[];
}

async function generateProof(
  bb: InstanceType<typeof Barretenberg>,
  circuitPath: string,
  inputs: Record<string, unknown>,
): Promise<ProofData> {
  const circuitJson = JSON.parse(fs.readFileSync(circuitPath, 'utf-8'));
  const noir = new Noir(circuitJson);
  const { witness } = await noir.execute(inputs);

  const backend = new UltraHonkBackend(circuitJson.bytecode, bb);
  const proofData = await backend.generateProof(witness, { verifierTarget: 'noir-recursive' });

  const artifacts = await backend.generateRecursiveProofArtifacts(proofData.proof, proofData.publicInputs.length);

  let proofAsFields = artifacts.proofAsFields;
  if (proofAsFields.length === 0) {
    proofAsFields = deflattenFields(proofData.proof).map(f => f.toString());
  }

  return {
    vkAsFields: artifacts.vkAsFields,
    vkHash: artifacts.vkHash,
    proofAsFields,
    publicInputs: proofData.publicInputs.map(p => p.toString()),
  };
}

jest.setTimeout(600_000);

describe('e2e_map_reduce', () => {
  let wallet: Wallet;
  let logger: Logger;
  let teardown: () => Promise<void>;
  let contract: MapReduceContract;
  let admin: AztecAddress;
  let coordinator: AztecAddress;
  let submitter: AztecAddress;
  let bb: InstanceType<typeof Barretenberg>;
  let submitVkHash: string;
  let publishVkHash: string;

  beforeAll(async () => {
    ({
      teardown,
      wallet,
      logger,
      accounts: [admin, coordinator, submitter],
    } = await setup(3));

    bb = await Barretenberg.new({ threads: 1 });

    logger.info('Generating submit circuit VK hash...');
    const submitProof = await generateProof(bb, path.join(CIRCUIT_DIR, 'submit_circuit.json'), {
      values: [100, 200, 300, 0, 0, 0, 0, 0, 0, 0].map(v => v.toString()),
    });
    submitVkHash = submitProof.vkHash;
    logger.info(`Submit VK hash: ${submitVkHash}`);

    const publishProof = await generateProof(bb, path.join(CIRCUIT_DIR, 'publish_circuit.json'), {
      submissions: [100, 200, 300, 400, 500].map(v => v.toString()),
    });
    publishVkHash = publishProof.vkHash;
    logger.info(`Publish VK hash: ${publishVkHash}`);

    const dummySubmitters = await Promise.all(Array.from({ length: NUM_SUBMISSIONS - 1 }, () => AztecAddress.random()));
    const submitters = [submitter, ...dummySubmitters];

    logger.info('Deploying MapReduce contract...');
    ({ contract } = await MapReduceContract.deploy(
      wallet,
      admin,
      coordinator,
      submitters,
      submitVkHash as unknown as FieldLike,
      publishVkHash as unknown as FieldLike,
    ).send({ from: admin }));
    logger.info(`MapReduce contract deployed at ${contract.address}`);
  });

  afterAll(async () => {
    await bb?.destroy();
    await teardown();
  });

  it('submitters submit proofs and coordinator publishes aggregate', async () => {
    const submitValues = [[100, 200, 300], [400, 500], [150], [250, 350], [1000]];

    for (let s = 0; s < NUM_SUBMISSIONS; s++) {
      const padded = Array(10).fill(0);
      for (let i = 0; i < submitValues[s].length; i++) {
        padded[i] = submitValues[s][i];
      }

      logger.info(`Generating submit proof ${s + 1}...`);
      const proof = await generateProof(bb, path.join(CIRCUIT_DIR, 'submit_circuit.json'), {
        values: padded.map(v => v.toString()),
      });
      logger.info(`Submit ${s + 1} public inputs: ${proof.publicInputs}`);

      await contract.methods
        .submit(
          proof.vkAsFields as unknown as FieldLike[],
          proof.proofAsFields as unknown as FieldLike[],
          proof.publicInputs as unknown as FieldLike[],
        )
        .send({ from: submitter });
      logger.info(`Submit ${s + 1} successful`);
    }

    logger.info('Reading submissions...');
    const simResult = await contract.methods.get_submissions(coordinator).simulate({
      from: coordinator,
    });
    const rawResult = simResult.result as { storage: { value: bigint }[]; len: bigint };
    const submissions = rawResult.storage.slice(0, Number(rawResult.len));
    logger.info(`Found ${submissions.length} submissions`);
    expect(submissions.length).toBe(NUM_SUBMISSIONS);

    const submissionValues = submissions.map(s => s.value.toString());

    logger.info('Generating publish proof...');
    const publishProof = await generateProof(bb, path.join(CIRCUIT_DIR, 'publish_circuit.json'), {
      submissions: submissionValues,
    });
    logger.info(`Publish public inputs: ${publishProof.publicInputs}`);

    const publishResult = publishProof.publicInputs[publishProof.publicInputs.length - 1];
    // Sums: 600 + 900 + 150 + 600 + 1000 = 3250, average = 3250 / 5 = 650
    expect(BigInt(publishResult)).toBe(650n);
    logger.info(`Publish computed result (average): ${publishResult}`);

    logger.info('Publishing...');
    await contract.methods
      .publish(
        publishProof.vkAsFields as unknown as FieldLike[],
        publishProof.proofAsFields as unknown as FieldLike[],
        publishResult as unknown as FieldLike,
      )
      .send({ from: coordinator });
    logger.info('Publish successful!');
  });
});
