#!/usr/bin/env node
/**
 * This script takes a failed proof from the FailedProofStore and re-executes it locally
 */
import { BBNativeRollupProver } from '@aztec/bb-prover';
import { createLogger } from '@aztec/foundation/log';
import { GoogleCloudStorageProofStore } from '@aztec/prover-client/broker';
import { ProvingRequestType } from '@aztec/stdlib/proofs';

import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';

const logger = createLogger('script:rerun_proof');
const urlStr = process.argv[2];
if (!urlStr) {
  logger.error('First argument must be the path to the public inputs in the remote bucket');
  process.exit(1);
}

const url = new URL(urlStr);

if (url.protocol !== 'gs:') {
  logger.error('Path must be valid remote GCS path starting with gs://');
  process.exit(1);
}

const store = new GoogleCloudStorageProofStore(url.hostname, '');
logger.info(`Downloading remote public inputs: ${url.href}`);
const { inputs, type } = await store.getProofInput(url);
logger.info(`Got inputs for a job of type ${ProvingRequestType[type]}`);

const tmp = await mkdtemp('rerun_proof-');
logger.info(`Using tmp folder: ${tmp}`);

const prover = await BBNativeRollupProver.new({
  bbBinaryPath: process.env.BB_BINARY_PATH ?? join(import.meta.pathname, '../../barretenberg/cpp/build/bin/bb'),
  bbWorkingDirectory: join(tmp, 'bb'),
  acvmBinaryPath:
    process.env.ACVM_BINARY_PATH ?? join(import.meta.pathname, '../../noir/noir-repo/target/release/acvm'),
  acvmWorkingDirectory: join(tmp, 'acvm'),
  bbSkipCleanup: true,
});

logger.info(`Running proof type: ${ProvingRequestType[type]}`);

let res;
switch (type) {
  case ProvingRequestType.PUBLIC_VM:
    res = await prover.getAvmProof(inputs);
    break;

  case ProvingRequestType.PRIVATE_BASE_ROLLUP:
    res = await prover.getPrivateBaseRollupProof(inputs);
    break;

  case ProvingRequestType.PUBLIC_BASE_ROLLUP:
    res = await prover.getPublicBaseRollupProof(inputs);
    break;

  case ProvingRequestType.MERGE_ROLLUP:
    res = await prover.getMergeRollupProof(inputs);
    break;

  case ProvingRequestType.EMPTY_BLOCK_ROOT_ROLLUP:
    res = await prover.getEmptyBlockRootRollupProof(inputs);
    break;

  case ProvingRequestType.PADDING_BLOCK_ROOT_ROLLUP:
    res = await prover.getPaddingBlockRootRollupProof(inputs);
    break;

  case ProvingRequestType.BLOCK_ROOT_ROLLUP:
    res = await prover.getBlockRootRollupProof(inputs);
    break;

  case ProvingRequestType.SINGLE_TX_BLOCK_ROOT_ROLLUP:
    res = await prover.getSingleTxBlockRootRollupProof(inputs);
    break;

  case ProvingRequestType.BLOCK_MERGE_ROLLUP:
    res = await prover.getBlockMergeRollupProof(inputs);
    break;

  case ProvingRequestType.ROOT_ROLLUP:
    res = await prover.getRootRollupProof(inputs);
    break;

  case ProvingRequestType.BASE_PARITY:
    res = await prover.getBaseParityProof(inputs);
    break;

  case ProvingRequestType.ROOT_PARITY:
    res = await prover.getRootParityProof(inputs);
    break;

  case ProvingRequestType.TUBE_PROOF:
    res = await prover.getTubeProof(inputs);
    break;

  default:
    logger.error(`Invalid proof request type: ${type}`);
    process.exit(1);
}
