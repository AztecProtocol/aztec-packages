import { PROVING_STATUS, makeEmptyProcessedTx } from '@aztec/circuit-types';
import {
  AztecAddress,
  BaseParityInputs,
  EthAddress,
  Fr,
  GlobalVariables,
  Header,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  NUM_BASE_PARITY_PER_ROOT_PARITY,
  RootParityInput,
  RootParityInputs,
  RootRollupPublicInputs,
} from '@aztec/circuits.js';
import { makeRootRollupPublicInputs } from '@aztec/circuits.js/testing';
import { padArrayEnd } from '@aztec/foundation/collection';
import { randomBytes } from '@aztec/foundation/crypto';
import { createDebugLogger } from '@aztec/foundation/log';
import { Tuple } from '@aztec/foundation/serialize';
import { fileURLToPath } from '@aztec/foundation/url';
import { openTmpStore } from '@aztec/kv-store/utils';
import { MerkleTreeOperations, MerkleTrees } from '@aztec/world-state';

import * as fs from 'fs/promises';
import { type MemDown, default as memdown } from 'memdown';
import path from 'path';

import { makeBloatedProcessedTx } from '../mocks/fixtures.js';
import {
  buildBaseRollupInput,
  createMergeRollupInputs,
  executeRootRollupCircuit,
} from '../orchestrator/block-building-helpers.js';
import { ProvingOrchestrator } from '../orchestrator/orchestrator.js';
import { BBNativeRollupProver, BBProverConfig } from './bb_prover.js';

export const createMemDown = () => (memdown as any)() as MemDown<any, any>;

const logger = createDebugLogger('aztec:bb-prover-test');

const {
  BB_RELEASE_DIR = 'cpp/build/bin',
  TEMP_DIR = '/tmp',
  BB_BINARY_PATH = '',
  BB_WORKING_DIRECTORY = '',
  NOIR_RELEASE_DIR = 'noir-repo/target/release',
  ACVM_BINARY_PATH = '',
  ACVM_WORKING_DIRECTORY = '',
} = process.env;

// Determines if we have access to the bb binary and a tmp folder for temp files
const getConfig = async () => {
  try {
    const expectedBBPath = BB_BINARY_PATH
      ? BB_BINARY_PATH
      : `${path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../barretenberg/', BB_RELEASE_DIR)}/bb`;
    await fs.access(expectedBBPath, fs.constants.R_OK);
    const tempWorkingDirectory = `${TEMP_DIR}/${randomBytes(4).toString('hex')}`;
    const bbWorkingDirectory = BB_WORKING_DIRECTORY ? BB_WORKING_DIRECTORY : `${tempWorkingDirectory}/bb`;
    await fs.mkdir(bbWorkingDirectory, { recursive: true });
    logger(`Using native BB binary at ${expectedBBPath} with working directory ${bbWorkingDirectory}`);

    const expectedAcvmPath = ACVM_BINARY_PATH
      ? ACVM_BINARY_PATH
      : `${path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../noir/', NOIR_RELEASE_DIR)}/acvm`;
    await fs.access(expectedAcvmPath, fs.constants.R_OK);
    const acvmWorkingDirectory = ACVM_WORKING_DIRECTORY ? ACVM_WORKING_DIRECTORY : `${tempWorkingDirectory}/acvm`;
    await fs.mkdir(acvmWorkingDirectory, { recursive: true });
    logger(`Using native ACVM binary at ${expectedAcvmPath} with working directory ${acvmWorkingDirectory}`);
    return {
      acvmWorkingDirectory,
      bbWorkingDirectory,
      expectedAcvmPath,
      expectedBBPath,
      directoryToCleanup: ACVM_WORKING_DIRECTORY && BB_WORKING_DIRECTORY ? undefined : tempWorkingDirectory,
    };
  } catch (err) {
    logger(`Native BB not available, error: ${err}`);
    return undefined;
  }
};

describe('prover/bb_prover', () => {
  let builderDb: MerkleTreeOperations;
  let prover: BBNativeRollupProver;
  let directoryToCleanup: string | undefined;

  let blockNumber: number;
  let rootRollupOutput: RootRollupPublicInputs;

  let globalVariables: GlobalVariables;

  const chainId = Fr.ZERO;
  const version = Fr.ZERO;
  const coinbase = EthAddress.ZERO;
  const feeRecipient = AztecAddress.ZERO;

  beforeEach(async () => {
    blockNumber = 3;
    globalVariables = new GlobalVariables(chainId, version, new Fr(blockNumber), Fr.ZERO, coinbase, feeRecipient);

    builderDb = await MerkleTrees.new(openTmpStore()).then(t => t.asLatest());
    rootRollupOutput = makeRootRollupPublicInputs(0);
    rootRollupOutput.header.globalVariables = globalVariables;

    const config = await getConfig();
    if (!config) {
      throw new Error(`BB binary must be present to test the BB Prover`);
    }
    directoryToCleanup = config.directoryToCleanup;
    const bbConfig: BBProverConfig = {
      acvmBinaryPath: config.expectedAcvmPath,
      acvmWorkingDirectory: config.acvmWorkingDirectory,
      bbBinaryPath: config.expectedBBPath,
      bbWorkingDirectory: config.bbWorkingDirectory,
    };
    prover = await BBNativeRollupProver.new(bbConfig);
    logger('AFTER PROVER START');
  }, 200_000);

  afterEach(async () => {
    if (directoryToCleanup) {
      await fs.rm(directoryToCleanup, { recursive: true, force: true });
    }
  }, 5000);

  it('proves the base rollup circuit', async () => {
    const txs = await Promise.all([
      makeBloatedProcessedTx(builderDb, 1),
      makeBloatedProcessedTx(builderDb, 2),
      makeBloatedProcessedTx(builderDb, 3),
      makeBloatedProcessedTx(builderDb, 4),
    ]);

    logger('Starting Test!!');

    logger('Building base rollup inputs');
    const baseRollupInputs = [];
    for (const tx of txs) {
      baseRollupInputs.push(await buildBaseRollupInput(tx, globalVariables, builderDb));
    }
    logger('Proving base rollups');
    const baseRollupOutputs = await Promise.all(baseRollupInputs.map(inputs => prover.getBaseRollupProof(inputs)));
    logger('Proving merge rollups');
    const mergeRollupInputs = [];
    for (let i = 0; i < 4; i += 2) {
      mergeRollupInputs.push(
        createMergeRollupInputs(
          [baseRollupOutputs[i][0]!, baseRollupOutputs[i][1]!],
          [baseRollupOutputs[i + 1][0]!, baseRollupOutputs[i + 1][1]!],
        ),
      );
    }
    const mergeRollupOutputs = await Promise.all(mergeRollupInputs.map(inputs => prover.getMergeRollupProof(inputs)));

    let baseParityInputs: BaseParityInputs[] = [];
    let l1ToL2MessagesPadded: Tuple<Fr, typeof NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP>;
    try {
      l1ToL2MessagesPadded = padArrayEnd([], Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
    } catch (err) {
      throw new Error('Too many L1 to L2 messages');
    }
    baseParityInputs = Array.from({ length: NUM_BASE_PARITY_PER_ROOT_PARITY }, (_, i) =>
      BaseParityInputs.fromSlice(l1ToL2MessagesPadded, i),
    );

    logger('Proving base parity circuits');
    const baseParityOutputs = await Promise.all(baseParityInputs.map(inputs => prover.getBaseParityProof(inputs)));

    const rootParityInputs = new RootParityInputs(
      baseParityOutputs.map(([publicInputs, proof]) => new RootParityInput(proof, publicInputs)) as Tuple<
        RootParityInput,
        typeof NUM_BASE_PARITY_PER_ROOT_PARITY
      >,
    );
    logger('Proving root parity circuit');
    const rootParityCircuitOutput = await prover.getRootParityProof(rootParityInputs);

    const rootParityInput = new RootParityInput(rootParityCircuitOutput[1], rootParityCircuitOutput[0]);

    logger('Proving root rollup circuit')!;
    await executeRootRollupCircuit(
      [mergeRollupOutputs[0][0]!, mergeRollupOutputs[0][1]!],
      [mergeRollupOutputs[1][0]!, mergeRollupOutputs[1][1]!],
      rootParityInput,
      l1ToL2MessagesPadded,
      prover,
      builderDb,
      logger,
    );
    logger('Completed!!');
  }, 600_000);

  it('proves all circuits', async () => {
    const txs = await Promise.all([
      makeBloatedProcessedTx(builderDb, 1),
      makeBloatedProcessedTx(builderDb, 2),
      makeBloatedProcessedTx(builderDb, 3),
      makeBloatedProcessedTx(builderDb, 4),
    ]);

    const orchestrator = await ProvingOrchestrator.new(builderDb, prover);

    const provingTicket = await orchestrator.startNewBlock(
      4,
      globalVariables,
      [],
      makeEmptyProcessedTx(Header.empty(), new Fr(1234), new Fr(1)),
    );

    for (const tx of txs) {
      await orchestrator.addNewTx(tx);
    }

    const provingResult = await provingTicket.provingPromise;

    expect(provingResult.status).toBe(PROVING_STATUS.SUCCESS);
  }, 600_000);
});
