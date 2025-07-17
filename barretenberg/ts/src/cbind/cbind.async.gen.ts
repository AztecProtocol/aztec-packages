/* eslint-disable */
// GENERATED FILE DO NOT EDIT, RUN yarn generate
import { Buffer } from 'buffer';
import * as apiTypes from './apiTypes.gen.js';
export type { CircuitBenchmark, CircuitBenchmarkResponse, CircuitCheck, CircuitCheckResponse, CircuitComputeVk, CircuitComputeVkResponse, CircuitInfo, CircuitInfoResponse, CircuitInput, CircuitInputNoVK, CircuitProve, CircuitProveAndVerify, CircuitProveAndVerifyResponse, CircuitProveResponse, CircuitVerify, CircuitVerifyResponse, CircuitWriteSolidityVerifier, CircuitWriteSolidityVerifierResponse, ClientIvcAccumulate, ClientIvcAccumulateResponse, ClientIvcCheckPrecomputedVk, ClientIvcCheckPrecomputedVkResponse, ClientIvcComputeIvcVk, ClientIvcComputeIvcVkResponse, ClientIvcComputeStandaloneVk, ClientIvcComputeStandaloneVkResponse, ClientIvcLoad, ClientIvcLoadResponse, ClientIvcProve, ClientIvcProveResponse, ClientIvcStart, ClientIvcStartResponse, ECCVMProof, Fr, GoblinProof, Proof, ProofAsFields, ProofAsFieldsResponse, ProofSystemSettings, VkAsFields, VkAsFieldsResponse } from './apiTypes.gen.js';

import { BarretenbergWasmMainWorker } from "../barretenberg_wasm/barretenberg_wasm_main/index.js";

export class AsyncApi {
  constructor(private wasm: BarretenbergWasmMainWorker) {}

  async circuitProve(command: apiTypes.CircuitProve): Promise<apiTypes.CircuitProveResponse> {
    const msgpackCommand = apiTypes.fromCircuitProve(command);
    const [variantName, result] = await this.wasm.msgpackCall('bbapi', ["CircuitProve", msgpackCommand]);
    if (variantName !== 'CircuitProveResponse') {
      throw new Error(`Expected variant name 'CircuitProveResponse' but got '${variantName}'`);
    }
    return apiTypes.toCircuitProveResponse(result);
  }

  async circuitComputeVk(command: apiTypes.CircuitComputeVk): Promise<apiTypes.CircuitComputeVkResponse> {
    const msgpackCommand = apiTypes.fromCircuitComputeVk(command);
    const [variantName, result] = await this.wasm.msgpackCall('bbapi', ["CircuitComputeVk", msgpackCommand]);
    if (variantName !== 'CircuitComputeVkResponse') {
      throw new Error(`Expected variant name 'CircuitComputeVkResponse' but got '${variantName}'`);
    }
    return apiTypes.toCircuitComputeVkResponse(result);
  }

  async circuitInfo(command: apiTypes.CircuitInfo): Promise<apiTypes.CircuitInfoResponse> {
    const msgpackCommand = apiTypes.fromCircuitInfo(command);
    const [variantName, result] = await this.wasm.msgpackCall('bbapi', ["CircuitInfo", msgpackCommand]);
    if (variantName !== 'CircuitInfoResponse') {
      throw new Error(`Expected variant name 'CircuitInfoResponse' but got '${variantName}'`);
    }
    return apiTypes.toCircuitInfoResponse(result);
  }

  async circuitCheck(command: apiTypes.CircuitCheck): Promise<apiTypes.CircuitCheckResponse> {
    const msgpackCommand = apiTypes.fromCircuitCheck(command);
    const [variantName, result] = await this.wasm.msgpackCall('bbapi', ["CircuitCheck", msgpackCommand]);
    if (variantName !== 'CircuitCheckResponse') {
      throw new Error(`Expected variant name 'CircuitCheckResponse' but got '${variantName}'`);
    }
    return apiTypes.toCircuitCheckResponse(result);
  }

  async circuitVerify(command: apiTypes.CircuitVerify): Promise<apiTypes.CircuitVerifyResponse> {
    const msgpackCommand = apiTypes.fromCircuitVerify(command);
    const [variantName, result] = await this.wasm.msgpackCall('bbapi', ["CircuitVerify", msgpackCommand]);
    if (variantName !== 'CircuitVerifyResponse') {
      throw new Error(`Expected variant name 'CircuitVerifyResponse' but got '${variantName}'`);
    }
    return apiTypes.toCircuitVerifyResponse(result);
  }

  async clientIvcComputeStandaloneVk(command: apiTypes.ClientIvcComputeStandaloneVk): Promise<apiTypes.ClientIvcComputeStandaloneVkResponse> {
    const msgpackCommand = apiTypes.fromClientIvcComputeStandaloneVk(command);
    const [variantName, result] = await this.wasm.msgpackCall('bbapi', ["ClientIvcComputeStandaloneVk", msgpackCommand]);
    if (variantName !== 'ClientIvcComputeStandaloneVkResponse') {
      throw new Error(`Expected variant name 'ClientIvcComputeStandaloneVkResponse' but got '${variantName}'`);
    }
    return apiTypes.toClientIvcComputeStandaloneVkResponse(result);
  }

  async clientIvcComputeIvcVk(command: apiTypes.ClientIvcComputeIvcVk): Promise<apiTypes.ClientIvcComputeIvcVkResponse> {
    const msgpackCommand = apiTypes.fromClientIvcComputeIvcVk(command);
    const [variantName, result] = await this.wasm.msgpackCall('bbapi', ["ClientIvcComputeIvcVk", msgpackCommand]);
    if (variantName !== 'ClientIvcComputeIvcVkResponse') {
      throw new Error(`Expected variant name 'ClientIvcComputeIvcVkResponse' but got '${variantName}'`);
    }
    return apiTypes.toClientIvcComputeIvcVkResponse(result);
  }

  async clientIvcStart(command: apiTypes.ClientIvcStart): Promise<apiTypes.ClientIvcStartResponse> {
    const msgpackCommand = apiTypes.fromClientIvcStart(command);
    const [variantName, result] = await this.wasm.msgpackCall('bbapi', ["ClientIvcStart", msgpackCommand]);
    if (variantName !== 'ClientIvcStartResponse') {
      throw new Error(`Expected variant name 'ClientIvcStartResponse' but got '${variantName}'`);
    }
    return apiTypes.toClientIvcStartResponse(result);
  }

  async clientIvcLoad(command: apiTypes.ClientIvcLoad): Promise<apiTypes.ClientIvcLoadResponse> {
    const msgpackCommand = apiTypes.fromClientIvcLoad(command);
    const [variantName, result] = await this.wasm.msgpackCall('bbapi', ["ClientIvcLoad", msgpackCommand]);
    if (variantName !== 'ClientIvcLoadResponse') {
      throw new Error(`Expected variant name 'ClientIvcLoadResponse' but got '${variantName}'`);
    }
    return apiTypes.toClientIvcLoadResponse(result);
  }

  async clientIvcAccumulate(command: apiTypes.ClientIvcAccumulate): Promise<apiTypes.ClientIvcAccumulateResponse> {
    const msgpackCommand = apiTypes.fromClientIvcAccumulate(command);
    const [variantName, result] = await this.wasm.msgpackCall('bbapi', ["ClientIvcAccumulate", msgpackCommand]);
    if (variantName !== 'ClientIvcAccumulateResponse') {
      throw new Error(`Expected variant name 'ClientIvcAccumulateResponse' but got '${variantName}'`);
    }
    return apiTypes.toClientIvcAccumulateResponse(result);
  }

  async clientIvcProve(command: apiTypes.ClientIvcProve): Promise<apiTypes.ClientIvcProveResponse> {
    const msgpackCommand = apiTypes.fromClientIvcProve(command);
    const [variantName, result] = await this.wasm.msgpackCall('bbapi', ["ClientIvcProve", msgpackCommand]);
    if (variantName !== 'ClientIvcProveResponse') {
      throw new Error(`Expected variant name 'ClientIvcProveResponse' but got '${variantName}'`);
    }
    return apiTypes.toClientIvcProveResponse(result);
  }

  async proofAsFields(command: apiTypes.ProofAsFields): Promise<apiTypes.ProofAsFieldsResponse> {
    const msgpackCommand = apiTypes.fromProofAsFields(command);
    const [variantName, result] = await this.wasm.msgpackCall('bbapi', ["ProofAsFields", msgpackCommand]);
    if (variantName !== 'ProofAsFieldsResponse') {
      throw new Error(`Expected variant name 'ProofAsFieldsResponse' but got '${variantName}'`);
    }
    return apiTypes.toProofAsFieldsResponse(result);
  }

  async vkAsFields(command: apiTypes.VkAsFields): Promise<apiTypes.VkAsFieldsResponse> {
    const msgpackCommand = apiTypes.fromVkAsFields(command);
    const [variantName, result] = await this.wasm.msgpackCall('bbapi', ["VkAsFields", msgpackCommand]);
    if (variantName !== 'VkAsFieldsResponse') {
      throw new Error(`Expected variant name 'VkAsFieldsResponse' but got '${variantName}'`);
    }
    return apiTypes.toVkAsFieldsResponse(result);
  }

  async circuitWriteSolidityVerifier(command: apiTypes.CircuitWriteSolidityVerifier): Promise<apiTypes.CircuitWriteSolidityVerifierResponse> {
    const msgpackCommand = apiTypes.fromCircuitWriteSolidityVerifier(command);
    const [variantName, result] = await this.wasm.msgpackCall('bbapi', ["CircuitWriteSolidityVerifier", msgpackCommand]);
    if (variantName !== 'CircuitWriteSolidityVerifierResponse') {
      throw new Error(`Expected variant name 'CircuitWriteSolidityVerifierResponse' but got '${variantName}'`);
    }
    return apiTypes.toCircuitWriteSolidityVerifierResponse(result);
  }

  async circuitProveAndVerify(command: apiTypes.CircuitProveAndVerify): Promise<apiTypes.CircuitProveAndVerifyResponse> {
    const msgpackCommand = apiTypes.fromCircuitProveAndVerify(command);
    const [variantName, result] = await this.wasm.msgpackCall('bbapi', ["CircuitProveAndVerify", msgpackCommand]);
    if (variantName !== 'CircuitProveAndVerifyResponse') {
      throw new Error(`Expected variant name 'CircuitProveAndVerifyResponse' but got '${variantName}'`);
    }
    return apiTypes.toCircuitProveAndVerifyResponse(result);
  }

  async circuitBenchmark(command: apiTypes.CircuitBenchmark): Promise<apiTypes.CircuitBenchmarkResponse> {
    const msgpackCommand = apiTypes.fromCircuitBenchmark(command);
    const [variantName, result] = await this.wasm.msgpackCall('bbapi', ["CircuitBenchmark", msgpackCommand]);
    if (variantName !== 'CircuitBenchmarkResponse') {
      throw new Error(`Expected variant name 'CircuitBenchmarkResponse' but got '${variantName}'`);
    }
    return apiTypes.toCircuitBenchmarkResponse(result);
  }

  async clientIvcCheckPrecomputedVk(command: apiTypes.ClientIvcCheckPrecomputedVk): Promise<apiTypes.ClientIvcCheckPrecomputedVkResponse> {
    const msgpackCommand = apiTypes.fromClientIvcCheckPrecomputedVk(command);
    const [variantName, result] = await this.wasm.msgpackCall('bbapi', ["ClientIvcCheckPrecomputedVk", msgpackCommand]);
    if (variantName !== 'ClientIvcCheckPrecomputedVkResponse') {
      throw new Error(`Expected variant name 'ClientIvcCheckPrecomputedVkResponse' but got '${variantName}'`);
    }
    return apiTypes.toClientIvcCheckPrecomputedVkResponse(result);
  }
}
