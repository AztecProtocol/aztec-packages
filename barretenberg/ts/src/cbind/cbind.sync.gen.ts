/* eslint-disable */
// GENERATED FILE DO NOT EDIT, RUN yarn generate
import { Buffer } from 'buffer';
import * as apiTypes from './apiTypes.gen.js';
export type { CircuitBenchmark, CircuitBenchmarkResponse, CircuitCheck, CircuitCheckResponse, CircuitComputeVk, CircuitComputeVkResponse, CircuitInfo, CircuitInfoResponse, CircuitInput, CircuitInputNoVK, CircuitProve, CircuitProveAndVerify, CircuitProveAndVerifyResponse, CircuitProveResponse, CircuitVerify, CircuitVerifyResponse, CircuitWriteSolidityVerifier, CircuitWriteSolidityVerifierResponse, ClientIvcAccumulate, ClientIvcAccumulateResponse, ClientIvcCheckPrecomputedVk, ClientIvcCheckPrecomputedVkResponse, ClientIvcComputeIvcVk, ClientIvcComputeIvcVkResponse, ClientIvcComputeStandaloneVk, ClientIvcComputeStandaloneVkResponse, ClientIvcLoad, ClientIvcLoadResponse, ClientIvcProve, ClientIvcProveResponse, ClientIvcStart, ClientIvcStartResponse, ECCVMProof, Fr, GoblinProof, Proof, ProofAsFields, ProofAsFieldsResponse, ProofSystemSettings, VkAsFields, VkAsFieldsResponse } from './apiTypes.gen.js';

import { BarretenbergWasmMain } from "../barretenberg_wasm/barretenberg_wasm_main/index.js";

export class SyncApi {
  constructor(private wasm: BarretenbergWasmMain) {}

  circuitProve(command: apiTypes.CircuitProve): apiTypes.CircuitProveResponse {
    const msgpackCommand = apiTypes.fromCircuitProve(command);
    const [variantName, result] = this.wasm.msgpackCall('bbapi', ["CircuitProve", msgpackCommand]);
    if (variantName !== 'CircuitProveResponse') {
      throw new Error(`Expected variant name 'CircuitProveResponse' but got '${variantName}'`);
    }
    return apiTypes.toCircuitProveResponse(result);
  }

  circuitComputeVk(command: apiTypes.CircuitComputeVk): apiTypes.CircuitComputeVkResponse {
    const msgpackCommand = apiTypes.fromCircuitComputeVk(command);
    const [variantName, result] = this.wasm.msgpackCall('bbapi', ["CircuitComputeVk", msgpackCommand]);
    if (variantName !== 'CircuitComputeVkResponse') {
      throw new Error(`Expected variant name 'CircuitComputeVkResponse' but got '${variantName}'`);
    }
    return apiTypes.toCircuitComputeVkResponse(result);
  }

  circuitInfo(command: apiTypes.CircuitInfo): apiTypes.CircuitInfoResponse {
    const msgpackCommand = apiTypes.fromCircuitInfo(command);
    const [variantName, result] = this.wasm.msgpackCall('bbapi', ["CircuitInfo", msgpackCommand]);
    if (variantName !== 'CircuitInfoResponse') {
      throw new Error(`Expected variant name 'CircuitInfoResponse' but got '${variantName}'`);
    }
    return apiTypes.toCircuitInfoResponse(result);
  }

  circuitCheck(command: apiTypes.CircuitCheck): apiTypes.CircuitCheckResponse {
    const msgpackCommand = apiTypes.fromCircuitCheck(command);
    const [variantName, result] = this.wasm.msgpackCall('bbapi', ["CircuitCheck", msgpackCommand]);
    if (variantName !== 'CircuitCheckResponse') {
      throw new Error(`Expected variant name 'CircuitCheckResponse' but got '${variantName}'`);
    }
    return apiTypes.toCircuitCheckResponse(result);
  }

  circuitVerify(command: apiTypes.CircuitVerify): apiTypes.CircuitVerifyResponse {
    const msgpackCommand = apiTypes.fromCircuitVerify(command);
    const [variantName, result] = this.wasm.msgpackCall('bbapi', ["CircuitVerify", msgpackCommand]);
    if (variantName !== 'CircuitVerifyResponse') {
      throw new Error(`Expected variant name 'CircuitVerifyResponse' but got '${variantName}'`);
    }
    return apiTypes.toCircuitVerifyResponse(result);
  }

  clientIvcComputeStandaloneVk(command: apiTypes.ClientIvcComputeStandaloneVk): apiTypes.ClientIvcComputeStandaloneVkResponse {
    const msgpackCommand = apiTypes.fromClientIvcComputeStandaloneVk(command);
    const [variantName, result] = this.wasm.msgpackCall('bbapi', ["ClientIvcComputeStandaloneVk", msgpackCommand]);
    if (variantName !== 'ClientIvcComputeStandaloneVkResponse') {
      throw new Error(`Expected variant name 'ClientIvcComputeStandaloneVkResponse' but got '${variantName}'`);
    }
    return apiTypes.toClientIvcComputeStandaloneVkResponse(result);
  }

  clientIvcComputeIvcVk(command: apiTypes.ClientIvcComputeIvcVk): apiTypes.ClientIvcComputeIvcVkResponse {
    const msgpackCommand = apiTypes.fromClientIvcComputeIvcVk(command);
    const [variantName, result] = this.wasm.msgpackCall('bbapi', ["ClientIvcComputeIvcVk", msgpackCommand]);
    if (variantName !== 'ClientIvcComputeIvcVkResponse') {
      throw new Error(`Expected variant name 'ClientIvcComputeIvcVkResponse' but got '${variantName}'`);
    }
    return apiTypes.toClientIvcComputeIvcVkResponse(result);
  }

  clientIvcStart(command: apiTypes.ClientIvcStart): apiTypes.ClientIvcStartResponse {
    const msgpackCommand = apiTypes.fromClientIvcStart(command);
    const [variantName, result] = this.wasm.msgpackCall('bbapi', ["ClientIvcStart", msgpackCommand]);
    if (variantName !== 'ClientIvcStartResponse') {
      throw new Error(`Expected variant name 'ClientIvcStartResponse' but got '${variantName}'`);
    }
    return apiTypes.toClientIvcStartResponse(result);
  }

  clientIvcLoad(command: apiTypes.ClientIvcLoad): apiTypes.ClientIvcLoadResponse {
    const msgpackCommand = apiTypes.fromClientIvcLoad(command);
    const [variantName, result] = this.wasm.msgpackCall('bbapi', ["ClientIvcLoad", msgpackCommand]);
    if (variantName !== 'ClientIvcLoadResponse') {
      throw new Error(`Expected variant name 'ClientIvcLoadResponse' but got '${variantName}'`);
    }
    return apiTypes.toClientIvcLoadResponse(result);
  }

  clientIvcAccumulate(command: apiTypes.ClientIvcAccumulate): apiTypes.ClientIvcAccumulateResponse {
    const msgpackCommand = apiTypes.fromClientIvcAccumulate(command);
    const [variantName, result] = this.wasm.msgpackCall('bbapi', ["ClientIvcAccumulate", msgpackCommand]);
    if (variantName !== 'ClientIvcAccumulateResponse') {
      throw new Error(`Expected variant name 'ClientIvcAccumulateResponse' but got '${variantName}'`);
    }
    return apiTypes.toClientIvcAccumulateResponse(result);
  }

  clientIvcProve(command: apiTypes.ClientIvcProve): apiTypes.ClientIvcProveResponse {
    const msgpackCommand = apiTypes.fromClientIvcProve(command);
    const [variantName, result] = this.wasm.msgpackCall('bbapi', ["ClientIvcProve", msgpackCommand]);
    if (variantName !== 'ClientIvcProveResponse') {
      throw new Error(`Expected variant name 'ClientIvcProveResponse' but got '${variantName}'`);
    }
    return apiTypes.toClientIvcProveResponse(result);
  }

  proofAsFields(command: apiTypes.ProofAsFields): apiTypes.ProofAsFieldsResponse {
    const msgpackCommand = apiTypes.fromProofAsFields(command);
    const [variantName, result] = this.wasm.msgpackCall('bbapi', ["ProofAsFields", msgpackCommand]);
    if (variantName !== 'ProofAsFieldsResponse') {
      throw new Error(`Expected variant name 'ProofAsFieldsResponse' but got '${variantName}'`);
    }
    return apiTypes.toProofAsFieldsResponse(result);
  }

  vkAsFields(command: apiTypes.VkAsFields): apiTypes.VkAsFieldsResponse {
    const msgpackCommand = apiTypes.fromVkAsFields(command);
    const [variantName, result] = this.wasm.msgpackCall('bbapi', ["VkAsFields", msgpackCommand]);
    if (variantName !== 'VkAsFieldsResponse') {
      throw new Error(`Expected variant name 'VkAsFieldsResponse' but got '${variantName}'`);
    }
    return apiTypes.toVkAsFieldsResponse(result);
  }

  circuitWriteSolidityVerifier(command: apiTypes.CircuitWriteSolidityVerifier): apiTypes.CircuitWriteSolidityVerifierResponse {
    const msgpackCommand = apiTypes.fromCircuitWriteSolidityVerifier(command);
    const [variantName, result] = this.wasm.msgpackCall('bbapi', ["CircuitWriteSolidityVerifier", msgpackCommand]);
    if (variantName !== 'CircuitWriteSolidityVerifierResponse') {
      throw new Error(`Expected variant name 'CircuitWriteSolidityVerifierResponse' but got '${variantName}'`);
    }
    return apiTypes.toCircuitWriteSolidityVerifierResponse(result);
  }

  circuitProveAndVerify(command: apiTypes.CircuitProveAndVerify): apiTypes.CircuitProveAndVerifyResponse {
    const msgpackCommand = apiTypes.fromCircuitProveAndVerify(command);
    const [variantName, result] = this.wasm.msgpackCall('bbapi', ["CircuitProveAndVerify", msgpackCommand]);
    if (variantName !== 'CircuitProveAndVerifyResponse') {
      throw new Error(`Expected variant name 'CircuitProveAndVerifyResponse' but got '${variantName}'`);
    }
    return apiTypes.toCircuitProveAndVerifyResponse(result);
  }

  circuitBenchmark(command: apiTypes.CircuitBenchmark): apiTypes.CircuitBenchmarkResponse {
    const msgpackCommand = apiTypes.fromCircuitBenchmark(command);
    const [variantName, result] = this.wasm.msgpackCall('bbapi', ["CircuitBenchmark", msgpackCommand]);
    if (variantName !== 'CircuitBenchmarkResponse') {
      throw new Error(`Expected variant name 'CircuitBenchmarkResponse' but got '${variantName}'`);
    }
    return apiTypes.toCircuitBenchmarkResponse(result);
  }

  clientIvcCheckPrecomputedVk(command: apiTypes.ClientIvcCheckPrecomputedVk): apiTypes.ClientIvcCheckPrecomputedVkResponse {
    const msgpackCommand = apiTypes.fromClientIvcCheckPrecomputedVk(command);
    const [variantName, result] = this.wasm.msgpackCall('bbapi', ["ClientIvcCheckPrecomputedVk", msgpackCommand]);
    if (variantName !== 'ClientIvcCheckPrecomputedVkResponse') {
      throw new Error(`Expected variant name 'ClientIvcCheckPrecomputedVkResponse' but got '${variantName}'`);
    }
    return apiTypes.toClientIvcCheckPrecomputedVkResponse(result);
  }
}
