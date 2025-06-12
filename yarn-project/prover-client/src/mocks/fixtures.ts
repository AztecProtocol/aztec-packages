import { MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX, NULLIFIER_TREE_HEIGHT } from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { randomBytes } from '@aztec/foundation/crypto';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import type { Logger } from '@aztec/foundation/log';
import { fileURLToPath } from '@aztec/foundation/url';
import { type CircuitSimulator, NativeACVMSimulator, WASMSimulatorWithBlobs } from '@aztec/simulator/server';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { GasFees } from '@aztec/stdlib/gas';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import type { ProcessedTx } from '@aztec/stdlib/tx';
import { GlobalVariables } from '@aztec/stdlib/tx';

import { promises as fs } from 'fs';
import path from 'path';

const {
  BB_RELEASE_DIR = 'cpp/build/bin',
  TEMP_DIR = '/tmp',
  BB_BINARY_PATH = '',
  BB_WORKING_DIRECTORY = '',
  BB_SKIP_CLEANUP = '',
  NOIR_RELEASE_DIR = 'noir-repo/target/release',
  ACVM_BINARY_PATH = '',
  ACVM_WORKING_DIRECTORY = '',
} = process.env;

// Determines if we have access to the bb binary and a tmp folder for temp files
export const getEnvironmentConfig = async (logger: Logger) => {
  try {
    const expectedBBPath = BB_BINARY_PATH
      ? BB_BINARY_PATH
      : `${path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../barretenberg/', BB_RELEASE_DIR)}/bb`;
    await fs.access(expectedBBPath, fs.constants.R_OK);
    const tempWorkingDirectory = `${TEMP_DIR}/${randomBytes(4).toString('hex')}`;
    const bbWorkingDirectory = BB_WORKING_DIRECTORY ? BB_WORKING_DIRECTORY : `${tempWorkingDirectory}/bb`;
    await fs.mkdir(bbWorkingDirectory, { recursive: true });
    logger.info(`Found native BB binary at ${expectedBBPath} with working directory ${bbWorkingDirectory}`);

    const expectedAcvmPath = ACVM_BINARY_PATH
      ? ACVM_BINARY_PATH
      : `${path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../noir/', NOIR_RELEASE_DIR)}/acvm`;
    await fs.access(expectedAcvmPath, fs.constants.R_OK);
    const acvmWorkingDirectory = ACVM_WORKING_DIRECTORY ? ACVM_WORKING_DIRECTORY : `${tempWorkingDirectory}/acvm`;
    await fs.mkdir(acvmWorkingDirectory, { recursive: true });
    logger.info(`Found native ACVM binary at ${expectedAcvmPath} with working directory ${acvmWorkingDirectory}`);

    const bbSkipCleanup = ['1', 'true'].includes(BB_SKIP_CLEANUP);
    bbSkipCleanup && logger.verbose(`Not going to clean up BB working directory ${bbWorkingDirectory} after run`);

    return {
      acvmWorkingDirectory,
      bbWorkingDirectory,
      expectedAcvmPath,
      expectedBBPath,
      directoryToCleanup: ACVM_WORKING_DIRECTORY && BB_WORKING_DIRECTORY ? undefined : tempWorkingDirectory,
      bbSkipCleanup,
    };
  } catch (err) {
    logger.info(`Native BB not available: ${err}`);
    return undefined;
  }
};

export async function getSimulator(
  config: { acvmWorkingDirectory: string | undefined; acvmBinaryPath: string | undefined },
  logger?: Logger,
): Promise<CircuitSimulator> {
  if (config.acvmBinaryPath && config.acvmWorkingDirectory) {
    try {
      await fs.access(config.acvmBinaryPath, fs.constants.R_OK);
      await fs.mkdir(config.acvmWorkingDirectory, { recursive: true });
      logger?.info(
        `Using native ACVM at ${config.acvmBinaryPath} and working directory ${config.acvmWorkingDirectory}`,
      );
      return new NativeACVMSimulator(config.acvmWorkingDirectory, config.acvmBinaryPath);
    } catch {
      logger?.warn(`Failed to access ACVM at ${config.acvmBinaryPath}, falling back to WASM`);
    }
  }
  logger?.info('Using WASM ACVM simulation');
  return new WASMSimulatorWithBlobs();
}

// Updates the expectedDb trees based on the new note hashes, contracts, and nullifiers from these txs
export const updateExpectedTreesFromTxs = async (db: MerkleTreeWriteOperations, txs: ProcessedTx[]) => {
  await db.appendLeaves(
    MerkleTreeId.NOTE_HASH_TREE,
    txs.flatMap(tx => padArrayEnd(tx.txEffect.noteHashes, Fr.zero(), MAX_NOTE_HASHES_PER_TX)),
  );
  await db.batchInsert(
    MerkleTreeId.NULLIFIER_TREE,
    txs.flatMap(tx => padArrayEnd(tx.txEffect.nullifiers, Fr.zero(), MAX_NULLIFIERS_PER_TX).map(x => x.toBuffer())),
    NULLIFIER_TREE_HEIGHT,
  );
  for (const tx of txs) {
    await db.sequentialInsert(
      MerkleTreeId.PUBLIC_DATA_TREE,
      tx.txEffect.publicDataWrites.map(write => write.toBuffer()),
    );
  }
};

export const makeGlobals = (blockNumber: number) => {
  return new GlobalVariables(
    Fr.ZERO,
    Fr.ZERO,
    new Fr(blockNumber) /** block number */,
    new Fr(blockNumber) /** slot number */,
    BigInt(blockNumber) /** block number as pseudo-timestamp for testing */,
    EthAddress.ZERO,
    AztecAddress.ZERO,
    GasFees.empty(),
  );
};
