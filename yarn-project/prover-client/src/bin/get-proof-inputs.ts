/* eslint-disable no-console */
import { AVM_INPUTS_FILENAME } from '@aztec/bb-prover';
import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';
import { createLogger } from '@aztec/foundation/log';
import { type ProofUri, ProvingJobInputs } from '@aztec/stdlib/interfaces/server';
import { ProvingRequestType } from '@aztec/stdlib/proofs';

import { mkdirSync, writeFileSync } from 'fs';

import { createProofStoreForUri } from '../proving_broker/index.js';

const logger = createLogger('prover-client:get-proof-inputs');

function printUsage() {
  console.error('Usage: get-proof-inputs <proof-uri> [out-dir=.]');
}

async function main() {
  if (process.argv[2] === '--help') {
    printUsage();
    return;
  }

  const uri = process.argv[2];
  const outDir = process.argv[3] || '.';
  if (!uri) {
    printUsage();
    throw new Error('Missing proof URI');
  }

  mkdirSync(outDir, { recursive: true });

  const proofStore = createProofStoreForUri(uri);
  logger.info(`Processing uri ${uri}`);
  const input = await proofStore.getProofInput(uri as ProofUri);
  logger.info(`Found inputs for ${ProvingRequestType[input.type]}`);
  writeProofInputs(input, outDir);

  console.log(jsonParseWithSchema(jsonStringify(input), ProvingJobInputs).inputs);
}

// This mimics the behavior of bb-prover/src/bb/execute.ts
function writeProofInputs(input: ProvingJobInputs, outDir: string) {
  switch (input.type) {
    case ProvingRequestType.PUBLIC_VM: {
      writeFileSync(`${outDir}/${AVM_INPUTS_FILENAME}`, input.inputs.serializeWithMessagePack());
      logger.info(`Wrote AVM inputs to ${AVM_INPUTS_FILENAME}`);
      break;
    }
    default: {
      throw new Error(`Unimplemented proving request type: ${ProvingRequestType[input.type]}`);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
