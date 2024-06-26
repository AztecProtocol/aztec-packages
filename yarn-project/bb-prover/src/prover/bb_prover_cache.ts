import { TxExecutionRequest } from "@aztec/circuit-types";
import { Fr, PrivateKernelTailCircuitPublicInputs, RecursiveProof, VerificationKeyAsFields, VerificationKeyData } from "@aztec/circuits.js";
import { CacheableExecutionResult } from "@aztec/simulator";

import * as crypto from "crypto";
import * as fs from "fs/promises";
import * as os from "os";
import path from "path";

import { ClassConverter, type ClassConverterInput } from "../../../foundation/src/json-rpc/class_converter.js";
import { convertFromJsonBuffer, convertToJsonBuffer } from "../../../foundation/src/json-rpc/convert.js";

const SHOULD_USE_PROVER_CACHE = true; //!!process.env.PROVER_CACHE || !!process.env.PROVER_CACHE_DIR;
const PROVER_CACHE_DIR = process.env.PROVER_CACHE_DIR || path.join(os.homedir(), '.aztec', 'proof-cache');

export const PROVER_CLASS_CONVERTER_INPUT = {
  fromString: {
    Fr,
  },
  fromJSON: {},
  fromBuffer: {
    // For simulate
    TxExecutionRequest,
    CacheableExecutionResult,
    // For bb app createProof
    RecursiveProof,
    PrivateKernelTailCircuitPublicInputs,
    VerificationKeyAsFields,
    // For bb rollup createProof
    VerificationKeyData,
  },
};

/**
 * Create a result that serializes into proof-cache.
 * Easy to wrap around any result, possibly needing to add classes to PROVER_CLASS_CONVERTER_INPUT as errors are hit.
 * HOWEVER, note that wrapping interactions that cause side effects, e.g. creating files, will not have those side effects appear on cache load!
 */
export async function withProverCache<Result>(
  label: string,
  proofInputs: any[],
  proverFunc: () => Promise<Result>,
  ccInput: ClassConverterInput = PROVER_CLASS_CONVERTER_INPUT
): Promise<Result> {
  if (!SHOULD_USE_PROVER_CACHE) {
    return await proverFunc();
  }
  const cc = new ClassConverter(ccInput);
  const hasher = crypto.createHash('sha256');
  for (const proofInput of proofInputs) {
    hasher.update(proofInput instanceof Uint8Array ? proofInput : convertToJsonBuffer(cc, proofInput));
  }
  const hash = hasher.digest('hex');
  const cacheResultPath = path.join(PROVER_CACHE_DIR, hash + '.' + label + '.buffer');
  try {
    await fs.access(cacheResultPath);
  } catch {
    try {
      console.log('*** MISS CACHE FOR ', label, '\n', cacheResultPath, new Error().stack);
      await fs.mkdir(PROVER_CACHE_DIR, { recursive: true });
      const result = await proverFunc();
      await fs.writeFile(cacheResultPath, convertToJsonBuffer(cc, result));
      return result;
    } catch (err) {
      console.error(err);
      throw err;
    }
  }
  console.log('RETURNING CACHED ', label);
  return convertFromJsonBuffer(cc, await fs.readFile(cacheResultPath));
}
