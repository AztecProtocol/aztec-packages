import { BarretenbergWasmMain, BarretenbergWasmMainWorker } from '../barretenberg_wasm/barretenberg_wasm_main/index.js';
import * as sync from './cbind.sync.gen.js';
import * as async from './cbind.async.gen.js';

// Re-export types from the generated files
export * from './cbind.sync.gen.js';

/**
 * Async API wrapper for cbind functions using BarretenbergWasmMainWorker.
 * All methods return promises.
 */
export class CbindApi {
  constructor(protected wasm: BarretenbergWasmMainWorker) {}

  async circuitProve(command: sync.CircuitProve): Promise<sync.CircuitProveResponse> {
    return async.circuitProve(this.wasm, command);
  }

  async circuitComputeVk(command: sync.CircuitComputeVk): Promise<sync.CircuitComputeVkResponse> {
    return async.circuitComputeVk(this.wasm, command);
  }

  async circuitInfo(command: sync.CircuitInfo): Promise<sync.CircuitInfoResponse> {
    return async.circuitInfo(this.wasm, command);
  }

  async circuitCheck(command: sync.CircuitCheck): Promise<sync.CircuitCheckResponse> {
    return async.circuitCheck(this.wasm, command);
  }

  async circuitVerify(command: sync.CircuitVerify): Promise<sync.CircuitVerifyResponse> {
    return async.circuitVerify(this.wasm, command);
  }

  async clientIvcComputeStandaloneVk(command: sync.ClientIvcComputeStandaloneVk): Promise<sync.ClientIvcComputeStandaloneVkResponse> {
    return async.clientIvcComputeStandaloneVk(this.wasm, command);
  }

  async clientIvcComputeIvcVk(command: sync.ClientIvcComputeIvcVk): Promise<sync.ClientIvcComputeIvcVkResponse> {
    return async.clientIvcComputeIvcVk(this.wasm, command);
  }

  async clientIvcStart(command: sync.ClientIvcStart): Promise<sync.ClientIvcStartResponse> {
    return async.clientIvcStart(this.wasm, command);
  }

  async clientIvcLoad(command: sync.ClientIvcLoad): Promise<sync.ClientIvcLoadResponse> {
    return async.clientIvcLoad(this.wasm, command);
  }

  async clientIvcAccumulate(command: sync.ClientIvcAccumulate): Promise<sync.ClientIvcAccumulateResponse> {
    return async.clientIvcAccumulate(this.wasm, command);
  }

  async clientIvcProve(command: sync.ClientIvcProve): Promise<sync.ClientIvcProveResponse> {
    return async.clientIvcProve(this.wasm, command);
  }

  async proofAsFields(command: sync.ProofAsFields): Promise<sync.ProofAsFieldsResponse> {
    return async.proofAsFields(this.wasm, command);
  }

  async vkAsFields(command: sync.VkAsFields): Promise<sync.VkAsFieldsResponse> {
    return async.vkAsFields(this.wasm, command);
  }

  async circuitWriteSolidityVerifier(command: sync.CircuitWriteSolidityVerifier): Promise<sync.CircuitWriteSolidityVerifierResponse> {
    return async.circuitWriteSolidityVerifier(this.wasm, command);
  }

  async circuitProveAndVerify(command: sync.CircuitProveAndVerify): Promise<sync.CircuitProveAndVerifyResponse> {
    return async.circuitProveAndVerify(this.wasm, command);
  }

  async circuitBenchmark(command: sync.CircuitBenchmark): Promise<sync.CircuitBenchmarkResponse> {
    return async.circuitBenchmark(this.wasm, command);
  }

  async clientIvcCheckPrecomputedVk(command: sync.ClientIvcCheckPrecomputedVk): Promise<sync.ClientIvcCheckPrecomputedVkResponse> {
    return async.clientIvcCheckPrecomputedVk(this.wasm, command);
  }
}

/**
 * Sync API wrapper for cbind functions using BarretenbergWasmMain.
 * All methods are synchronous.
 */
export class CbindApiSync {
  constructor(protected wasm: BarretenbergWasmMain) {}

  circuitProve(command: sync.CircuitProve): sync.CircuitProveResponse {
    return sync.circuitProve(this.wasm, command);
  }

  circuitComputeVk(command: sync.CircuitComputeVk): sync.CircuitComputeVkResponse {
    return sync.circuitComputeVk(this.wasm, command);
  }

  circuitInfo(command: sync.CircuitInfo): sync.CircuitInfoResponse {
    return sync.circuitInfo(this.wasm, command);
  }

  circuitCheck(command: sync.CircuitCheck): sync.CircuitCheckResponse {
    return sync.circuitCheck(this.wasm, command);
  }

  circuitVerify(command: sync.CircuitVerify): sync.CircuitVerifyResponse {
    return sync.circuitVerify(this.wasm, command);
  }

  clientIvcComputeStandaloneVk(command: sync.ClientIvcComputeStandaloneVk): sync.ClientIvcComputeStandaloneVkResponse {
    return sync.clientIvcComputeStandaloneVk(this.wasm, command);
  }

  clientIvcComputeIvcVk(command: sync.ClientIvcComputeIvcVk): sync.ClientIvcComputeIvcVkResponse {
    return sync.clientIvcComputeIvcVk(this.wasm, command);
  }

  clientIvcStart(command: sync.ClientIvcStart): sync.ClientIvcStartResponse {
    return sync.clientIvcStart(this.wasm, command);
  }

  clientIvcLoad(command: sync.ClientIvcLoad): sync.ClientIvcLoadResponse {
    return sync.clientIvcLoad(this.wasm, command);
  }

  clientIvcAccumulate(command: sync.ClientIvcAccumulate): sync.ClientIvcAccumulateResponse {
    return sync.clientIvcAccumulate(this.wasm, command);
  }

  clientIvcProve(command: sync.ClientIvcProve): sync.ClientIvcProveResponse {
    return sync.clientIvcProve(this.wasm, command);
  }

  proofAsFields(command: sync.ProofAsFields): sync.ProofAsFieldsResponse {
    return sync.proofAsFields(this.wasm, command);
  }

  vkAsFields(command: sync.VkAsFields): sync.VkAsFieldsResponse {
    return sync.vkAsFields(this.wasm, command);
  }

  circuitWriteSolidityVerifier(command: sync.CircuitWriteSolidityVerifier): sync.CircuitWriteSolidityVerifierResponse {
    return sync.circuitWriteSolidityVerifier(this.wasm, command);
  }

  circuitProveAndVerify(command: sync.CircuitProveAndVerify): sync.CircuitProveAndVerifyResponse {
    return sync.circuitProveAndVerify(this.wasm, command);
  }

  circuitBenchmark(command: sync.CircuitBenchmark): sync.CircuitBenchmarkResponse {
    return sync.circuitBenchmark(this.wasm, command);
  }

  clientIvcCheckPrecomputedVk(command: sync.ClientIvcCheckPrecomputedVk): sync.ClientIvcCheckPrecomputedVkResponse {
    return sync.clientIvcCheckPrecomputedVk(this.wasm, command);
  }
}