/* eslint-disable */
// GENERATED FILE DO NOT EDIT, RUN yarn generate
import { Buffer } from "buffer";
import { BarretenbergWasmMain } from "../barretenberg_wasm/barretenberg_wasm_main/index.js";

// Helper type for fixed-size arrays
type Tuple<T, N extends number> = T[] & { length: N };

// Helper function for mapping tuples
function mapTuple<T, U, N extends number>(tuple: Tuple<T, N>, fn: (t: T) => U): Tuple<U, N> {
  return tuple.map(fn) as Tuple<U, N>;
}


// Field element type
export type Fr = Buffer;

export interface CircuitInput {
  name: string;
  bytecode: Buffer;
  verificationKey: Buffer;
}

interface MsgpackCircuitInput {
  name: string;
  bytecode: Buffer;
  verification_key: Buffer;
}

export function toCircuitInput(o: MsgpackCircuitInput): CircuitInput {
  if (o.name === undefined) { throw new Error("Expected name in CircuitInput deserialization"); }
  if (o.bytecode === undefined) { throw new Error("Expected bytecode in CircuitInput deserialization"); }
  if (o.verification_key === undefined) { throw new Error("Expected verification_key in CircuitInput deserialization"); };
  return {
    name: o.name,
    bytecode: o.bytecode,
    verificationKey: o.verification_key,
  };
}

export function fromCircuitInput(o: CircuitInput): MsgpackCircuitInput {
  if (o.name === undefined) { throw new Error("Expected name in CircuitInput serialization"); }
  if (o.bytecode === undefined) { throw new Error("Expected bytecode in CircuitInput serialization"); }
  if (o.verificationKey === undefined) { throw new Error("Expected verificationKey in CircuitInput serialization"); };
  return {
  name: o.name,
  bytecode: o.bytecode,
  verification_key: o.verificationKey,};
}
export interface ProofSystemSettings {
  ipaAccumulation: boolean;
  oracleHashType: string;
  disableZk: boolean;
  honkRecursion: number;
  recursive: boolean;
}

interface MsgpackProofSystemSettings {
  ipa_accumulation: boolean;
  oracle_hash_type: string;
  disable_zk: boolean;
  honk_recursion: number;
  recursive: boolean;
}

export function toProofSystemSettings(o: MsgpackProofSystemSettings): ProofSystemSettings {
  if (o.ipa_accumulation === undefined) { throw new Error("Expected ipa_accumulation in ProofSystemSettings deserialization"); }
  if (o.oracle_hash_type === undefined) { throw new Error("Expected oracle_hash_type in ProofSystemSettings deserialization"); }
  if (o.disable_zk === undefined) { throw new Error("Expected disable_zk in ProofSystemSettings deserialization"); }
  if (o.honk_recursion === undefined) { throw new Error("Expected honk_recursion in ProofSystemSettings deserialization"); }
  if (o.recursive === undefined) { throw new Error("Expected recursive in ProofSystemSettings deserialization"); };
  return {
    ipaAccumulation: o.ipa_accumulation,
    oracleHashType: o.oracle_hash_type,
    disableZk: o.disable_zk,
    honkRecursion: o.honk_recursion,
    recursive: o.recursive,
  };
}

export function fromProofSystemSettings(o: ProofSystemSettings): MsgpackProofSystemSettings {
  if (o.ipaAccumulation === undefined) { throw new Error("Expected ipaAccumulation in ProofSystemSettings serialization"); }
  if (o.oracleHashType === undefined) { throw new Error("Expected oracleHashType in ProofSystemSettings serialization"); }
  if (o.disableZk === undefined) { throw new Error("Expected disableZk in ProofSystemSettings serialization"); }
  if (o.honkRecursion === undefined) { throw new Error("Expected honkRecursion in ProofSystemSettings serialization"); }
  if (o.recursive === undefined) { throw new Error("Expected recursive in ProofSystemSettings serialization"); };
  return {
  ipa_accumulation: o.ipaAccumulation,
  oracle_hash_type: o.oracleHashType,
  disable_zk: o.disableZk,
  honk_recursion: o.honkRecursion,
  recursive: o.recursive,};
}
export interface CircuitProve {
  circuit: CircuitInput;
  witness: Buffer;
  settings: ProofSystemSettings;
}

interface MsgpackCircuitProve {
  circuit: MsgpackCircuitInput;
  witness: Buffer;
  settings: MsgpackProofSystemSettings;
}

export function toCircuitProve(o: MsgpackCircuitProve): CircuitProve {
  if (o.circuit === undefined) { throw new Error("Expected circuit in CircuitProve deserialization"); }
  if (o.witness === undefined) { throw new Error("Expected witness in CircuitProve deserialization"); }
  if (o.settings === undefined) { throw new Error("Expected settings in CircuitProve deserialization"); };
  return {
    circuit: toCircuitInput(o.circuit),
    witness: o.witness,
    settings: toProofSystemSettings(o.settings),
  };
}

export function fromCircuitProve(o: CircuitProve): MsgpackCircuitProve {
  if (o.circuit === undefined) { throw new Error("Expected circuit in CircuitProve serialization"); }
  if (o.witness === undefined) { throw new Error("Expected witness in CircuitProve serialization"); }
  if (o.settings === undefined) { throw new Error("Expected settings in CircuitProve serialization"); };
  return {
  circuit: fromCircuitInput(o.circuit),
  witness: o.witness,
  settings: fromProofSystemSettings(o.settings),};
}
export interface CircuitInputNoVK {
  name: string;
  bytecode: Buffer;
}

interface MsgpackCircuitInputNoVK {
  name: string;
  bytecode: Buffer;
}

export function toCircuitInputNoVK(o: MsgpackCircuitInputNoVK): CircuitInputNoVK {
  if (o.name === undefined) { throw new Error("Expected name in CircuitInputNoVK deserialization"); }
  if (o.bytecode === undefined) { throw new Error("Expected bytecode in CircuitInputNoVK deserialization"); };
  return {
    name: o.name,
    bytecode: o.bytecode,
  };
}

export function fromCircuitInputNoVK(o: CircuitInputNoVK): MsgpackCircuitInputNoVK {
  if (o.name === undefined) { throw new Error("Expected name in CircuitInputNoVK serialization"); }
  if (o.bytecode === undefined) { throw new Error("Expected bytecode in CircuitInputNoVK serialization"); };
  return {
  name: o.name,
  bytecode: o.bytecode,};
}
export interface CircuitComputeVk {
  circuit: CircuitInputNoVK;
  settings: ProofSystemSettings;
}

interface MsgpackCircuitComputeVk {
  circuit: MsgpackCircuitInputNoVK;
  settings: MsgpackProofSystemSettings;
}

export function toCircuitComputeVk(o: MsgpackCircuitComputeVk): CircuitComputeVk {
  if (o.circuit === undefined) { throw new Error("Expected circuit in CircuitComputeVk deserialization"); }
  if (o.settings === undefined) { throw new Error("Expected settings in CircuitComputeVk deserialization"); };
  return {
    circuit: toCircuitInputNoVK(o.circuit),
    settings: toProofSystemSettings(o.settings),
  };
}

export function fromCircuitComputeVk(o: CircuitComputeVk): MsgpackCircuitComputeVk {
  if (o.circuit === undefined) { throw new Error("Expected circuit in CircuitComputeVk serialization"); }
  if (o.settings === undefined) { throw new Error("Expected settings in CircuitComputeVk serialization"); };
  return {
  circuit: fromCircuitInputNoVK(o.circuit),
  settings: fromProofSystemSettings(o.settings),};
}
export interface CircuitInfo {
  circuit: CircuitInput;
  includeGatesPerOpcode: boolean;
  settings: ProofSystemSettings;
}

interface MsgpackCircuitInfo {
  circuit: MsgpackCircuitInput;
  include_gates_per_opcode: boolean;
  settings: MsgpackProofSystemSettings;
}

export function toCircuitInfo(o: MsgpackCircuitInfo): CircuitInfo {
  if (o.circuit === undefined) { throw new Error("Expected circuit in CircuitInfo deserialization"); }
  if (o.include_gates_per_opcode === undefined) { throw new Error("Expected include_gates_per_opcode in CircuitInfo deserialization"); }
  if (o.settings === undefined) { throw new Error("Expected settings in CircuitInfo deserialization"); };
  return {
    circuit: toCircuitInput(o.circuit),
    includeGatesPerOpcode: o.include_gates_per_opcode,
    settings: toProofSystemSettings(o.settings),
  };
}

export function fromCircuitInfo(o: CircuitInfo): MsgpackCircuitInfo {
  if (o.circuit === undefined) { throw new Error("Expected circuit in CircuitInfo serialization"); }
  if (o.includeGatesPerOpcode === undefined) { throw new Error("Expected includeGatesPerOpcode in CircuitInfo serialization"); }
  if (o.settings === undefined) { throw new Error("Expected settings in CircuitInfo serialization"); };
  return {
  circuit: fromCircuitInput(o.circuit),
  include_gates_per_opcode: o.includeGatesPerOpcode,
  settings: fromProofSystemSettings(o.settings),};
}
export interface CircuitCheck {
  circuit: CircuitInput;
  witness: Buffer;
  settings: ProofSystemSettings;
}

interface MsgpackCircuitCheck {
  circuit: MsgpackCircuitInput;
  witness: Buffer;
  settings: MsgpackProofSystemSettings;
}

export function toCircuitCheck(o: MsgpackCircuitCheck): CircuitCheck {
  if (o.circuit === undefined) { throw new Error("Expected circuit in CircuitCheck deserialization"); }
  if (o.witness === undefined) { throw new Error("Expected witness in CircuitCheck deserialization"); }
  if (o.settings === undefined) { throw new Error("Expected settings in CircuitCheck deserialization"); };
  return {
    circuit: toCircuitInput(o.circuit),
    witness: o.witness,
    settings: toProofSystemSettings(o.settings),
  };
}

export function fromCircuitCheck(o: CircuitCheck): MsgpackCircuitCheck {
  if (o.circuit === undefined) { throw new Error("Expected circuit in CircuitCheck serialization"); }
  if (o.witness === undefined) { throw new Error("Expected witness in CircuitCheck serialization"); }
  if (o.settings === undefined) { throw new Error("Expected settings in CircuitCheck serialization"); };
  return {
  circuit: fromCircuitInput(o.circuit),
  witness: o.witness,
  settings: fromProofSystemSettings(o.settings),};
}
export interface CircuitVerify {
  verificationKey: Buffer;
  publicInputs: Fr[];
  proof: Fr[];
  settings: ProofSystemSettings;
}

interface MsgpackCircuitVerify {
  verification_key: Buffer;
  public_inputs: Buffer[];
  proof: Buffer[];
  settings: MsgpackProofSystemSettings;
}

export function toCircuitVerify(o: MsgpackCircuitVerify): CircuitVerify {
  if (o.verification_key === undefined) { throw new Error("Expected verification_key in CircuitVerify deserialization"); }
  if (o.public_inputs === undefined) { throw new Error("Expected public_inputs in CircuitVerify deserialization"); }
  if (o.proof === undefined) { throw new Error("Expected proof in CircuitVerify deserialization"); }
  if (o.settings === undefined) { throw new Error("Expected settings in CircuitVerify deserialization"); };
  return {
    verificationKey: o.verification_key,
    publicInputs: o.public_inputs.map((v: Buffer) => v),
    proof: o.proof.map((v: Buffer) => v),
    settings: toProofSystemSettings(o.settings),
  };
}

export function fromCircuitVerify(o: CircuitVerify): MsgpackCircuitVerify {
  if (o.verificationKey === undefined) { throw new Error("Expected verificationKey in CircuitVerify serialization"); }
  if (o.publicInputs === undefined) { throw new Error("Expected publicInputs in CircuitVerify serialization"); }
  if (o.proof === undefined) { throw new Error("Expected proof in CircuitVerify serialization"); }
  if (o.settings === undefined) { throw new Error("Expected settings in CircuitVerify serialization"); };
  return {
  verification_key: o.verificationKey,
  public_inputs: o.publicInputs.map((v: Fr) => v),
  proof: o.proof.map((v: Fr) => v),
  settings: fromProofSystemSettings(o.settings),};
}
export interface ClientIvcComputeStandaloneVk {
  circuit: CircuitInputNoVK;
}

interface MsgpackClientIvcComputeStandaloneVk {
  circuit: MsgpackCircuitInputNoVK;
}

export function toClientIvcComputeStandaloneVk(o: MsgpackClientIvcComputeStandaloneVk): ClientIvcComputeStandaloneVk {
  if (o.circuit === undefined) { throw new Error("Expected circuit in ClientIvcComputeStandaloneVk deserialization"); };
  return {
    circuit: toCircuitInputNoVK(o.circuit),
  };
}

export function fromClientIvcComputeStandaloneVk(o: ClientIvcComputeStandaloneVk): MsgpackClientIvcComputeStandaloneVk {
  if (o.circuit === undefined) { throw new Error("Expected circuit in ClientIvcComputeStandaloneVk serialization"); };
  return {
  circuit: fromCircuitInputNoVK(o.circuit),};
}
export interface ClientIvcComputeIvcVk {
  circuit: CircuitInputNoVK;
}

interface MsgpackClientIvcComputeIvcVk {
  circuit: MsgpackCircuitInputNoVK;
}

export function toClientIvcComputeIvcVk(o: MsgpackClientIvcComputeIvcVk): ClientIvcComputeIvcVk {
  if (o.circuit === undefined) { throw new Error("Expected circuit in ClientIvcComputeIvcVk deserialization"); };
  return {
    circuit: toCircuitInputNoVK(o.circuit),
  };
}

export function fromClientIvcComputeIvcVk(o: ClientIvcComputeIvcVk): MsgpackClientIvcComputeIvcVk {
  if (o.circuit === undefined) { throw new Error("Expected circuit in ClientIvcComputeIvcVk serialization"); };
  return {
  circuit: fromCircuitInputNoVK(o.circuit),};
}
export interface ClientIvcStart {
  numCircuits: number;
}

interface MsgpackClientIvcStart {
  num_circuits: number;
}

export function toClientIvcStart(o: MsgpackClientIvcStart): ClientIvcStart {
  if (o.num_circuits === undefined) { throw new Error("Expected num_circuits in ClientIvcStart deserialization"); };
  return {
    numCircuits: o.num_circuits,
  };
}

export function fromClientIvcStart(o: ClientIvcStart): MsgpackClientIvcStart {
  if (o.numCircuits === undefined) { throw new Error("Expected numCircuits in ClientIvcStart serialization"); };
  return {
  num_circuits: o.numCircuits,};
}
export interface ClientIvcLoad {
  circuit: CircuitInput;
}

interface MsgpackClientIvcLoad {
  circuit: MsgpackCircuitInput;
}

export function toClientIvcLoad(o: MsgpackClientIvcLoad): ClientIvcLoad {
  if (o.circuit === undefined) { throw new Error("Expected circuit in ClientIvcLoad deserialization"); };
  return {
    circuit: toCircuitInput(o.circuit),
  };
}

export function fromClientIvcLoad(o: ClientIvcLoad): MsgpackClientIvcLoad {
  if (o.circuit === undefined) { throw new Error("Expected circuit in ClientIvcLoad serialization"); };
  return {
  circuit: fromCircuitInput(o.circuit),};
}
export interface ClientIvcAccumulate {
  witness: Buffer;
}

interface MsgpackClientIvcAccumulate {
  witness: Buffer;
}

export function toClientIvcAccumulate(o: MsgpackClientIvcAccumulate): ClientIvcAccumulate {
  if (o.witness === undefined) { throw new Error("Expected witness in ClientIvcAccumulate deserialization"); };
  return {
    witness: o.witness,
  };
}

export function fromClientIvcAccumulate(o: ClientIvcAccumulate): MsgpackClientIvcAccumulate {
  if (o.witness === undefined) { throw new Error("Expected witness in ClientIvcAccumulate serialization"); };
  return {
  witness: o.witness,};
}
export interface ClientIvcProve {
}

interface MsgpackClientIvcProve {}

export function toClientIvcProve(o: MsgpackClientIvcProve): ClientIvcProve {
  return {};
}

export function fromClientIvcProve(o: ClientIvcProve): MsgpackClientIvcProve {
  return {};
}
export interface ProofAsFields {
  proof: Fr[];
}

interface MsgpackProofAsFields {
  proof: Buffer[];
}

export function toProofAsFields(o: MsgpackProofAsFields): ProofAsFields {
  if (o.proof === undefined) { throw new Error("Expected proof in ProofAsFields deserialization"); };
  return {
    proof: o.proof.map((v: Buffer) => v),
  };
}

export function fromProofAsFields(o: ProofAsFields): MsgpackProofAsFields {
  if (o.proof === undefined) { throw new Error("Expected proof in ProofAsFields serialization"); };
  return {
  proof: o.proof.map((v: Fr) => v),};
}
export interface VkAsFields {
  verificationKey: Buffer;
  isMegaHonk: boolean;
}

interface MsgpackVkAsFields {
  verification_key: Buffer;
  is_mega_honk: boolean;
}

export function toVkAsFields(o: MsgpackVkAsFields): VkAsFields {
  if (o.verification_key === undefined) { throw new Error("Expected verification_key in VkAsFields deserialization"); }
  if (o.is_mega_honk === undefined) { throw new Error("Expected is_mega_honk in VkAsFields deserialization"); };
  return {
    verificationKey: o.verification_key,
    isMegaHonk: o.is_mega_honk,
  };
}

export function fromVkAsFields(o: VkAsFields): MsgpackVkAsFields {
  if (o.verificationKey === undefined) { throw new Error("Expected verificationKey in VkAsFields serialization"); }
  if (o.isMegaHonk === undefined) { throw new Error("Expected isMegaHonk in VkAsFields serialization"); };
  return {
  verification_key: o.verificationKey,
  is_mega_honk: o.isMegaHonk,};
}
export interface CircuitWriteSolidityVerifier {
  verificationKey: Buffer;
  settings: ProofSystemSettings;
}

interface MsgpackCircuitWriteSolidityVerifier {
  verification_key: Buffer;
  settings: MsgpackProofSystemSettings;
}

export function toCircuitWriteSolidityVerifier(o: MsgpackCircuitWriteSolidityVerifier): CircuitWriteSolidityVerifier {
  if (o.verification_key === undefined) { throw new Error("Expected verification_key in CircuitWriteSolidityVerifier deserialization"); }
  if (o.settings === undefined) { throw new Error("Expected settings in CircuitWriteSolidityVerifier deserialization"); };
  return {
    verificationKey: o.verification_key,
    settings: toProofSystemSettings(o.settings),
  };
}

export function fromCircuitWriteSolidityVerifier(o: CircuitWriteSolidityVerifier): MsgpackCircuitWriteSolidityVerifier {
  if (o.verificationKey === undefined) { throw new Error("Expected verificationKey in CircuitWriteSolidityVerifier serialization"); }
  if (o.settings === undefined) { throw new Error("Expected settings in CircuitWriteSolidityVerifier serialization"); };
  return {
  verification_key: o.verificationKey,
  settings: fromProofSystemSettings(o.settings),};
}
export interface CircuitProveAndVerify {
  circuit: CircuitInput;
  witness: Buffer;
  settings: ProofSystemSettings;
}

interface MsgpackCircuitProveAndVerify {
  circuit: MsgpackCircuitInput;
  witness: Buffer;
  settings: MsgpackProofSystemSettings;
}

export function toCircuitProveAndVerify(o: MsgpackCircuitProveAndVerify): CircuitProveAndVerify {
  if (o.circuit === undefined) { throw new Error("Expected circuit in CircuitProveAndVerify deserialization"); }
  if (o.witness === undefined) { throw new Error("Expected witness in CircuitProveAndVerify deserialization"); }
  if (o.settings === undefined) { throw new Error("Expected settings in CircuitProveAndVerify deserialization"); };
  return {
    circuit: toCircuitInput(o.circuit),
    witness: o.witness,
    settings: toProofSystemSettings(o.settings),
  };
}

export function fromCircuitProveAndVerify(o: CircuitProveAndVerify): MsgpackCircuitProveAndVerify {
  if (o.circuit === undefined) { throw new Error("Expected circuit in CircuitProveAndVerify serialization"); }
  if (o.witness === undefined) { throw new Error("Expected witness in CircuitProveAndVerify serialization"); }
  if (o.settings === undefined) { throw new Error("Expected settings in CircuitProveAndVerify serialization"); };
  return {
  circuit: fromCircuitInput(o.circuit),
  witness: o.witness,
  settings: fromProofSystemSettings(o.settings),};
}
export interface CircuitBenchmark {
  circuit: CircuitInput;
  witness: Buffer;
  settings: ProofSystemSettings;
  numIterations: number;
  benchmarkWitnessGeneration: boolean;
  benchmarkProving: boolean;
}

interface MsgpackCircuitBenchmark {
  circuit: MsgpackCircuitInput;
  witness: Buffer;
  settings: MsgpackProofSystemSettings;
  num_iterations: number;
  benchmark_witness_generation: boolean;
  benchmark_proving: boolean;
}

export function toCircuitBenchmark(o: MsgpackCircuitBenchmark): CircuitBenchmark {
  if (o.circuit === undefined) { throw new Error("Expected circuit in CircuitBenchmark deserialization"); }
  if (o.witness === undefined) { throw new Error("Expected witness in CircuitBenchmark deserialization"); }
  if (o.settings === undefined) { throw new Error("Expected settings in CircuitBenchmark deserialization"); }
  if (o.num_iterations === undefined) { throw new Error("Expected num_iterations in CircuitBenchmark deserialization"); }
  if (o.benchmark_witness_generation === undefined) { throw new Error("Expected benchmark_witness_generation in CircuitBenchmark deserialization"); }
  if (o.benchmark_proving === undefined) { throw new Error("Expected benchmark_proving in CircuitBenchmark deserialization"); };
  return {
    circuit: toCircuitInput(o.circuit),
    witness: o.witness,
    settings: toProofSystemSettings(o.settings),
    numIterations: o.num_iterations,
    benchmarkWitnessGeneration: o.benchmark_witness_generation,
    benchmarkProving: o.benchmark_proving,
  };
}

export function fromCircuitBenchmark(o: CircuitBenchmark): MsgpackCircuitBenchmark {
  if (o.circuit === undefined) { throw new Error("Expected circuit in CircuitBenchmark serialization"); }
  if (o.witness === undefined) { throw new Error("Expected witness in CircuitBenchmark serialization"); }
  if (o.settings === undefined) { throw new Error("Expected settings in CircuitBenchmark serialization"); }
  if (o.numIterations === undefined) { throw new Error("Expected numIterations in CircuitBenchmark serialization"); }
  if (o.benchmarkWitnessGeneration === undefined) { throw new Error("Expected benchmarkWitnessGeneration in CircuitBenchmark serialization"); }
  if (o.benchmarkProving === undefined) { throw new Error("Expected benchmarkProving in CircuitBenchmark serialization"); };
  return {
  circuit: fromCircuitInput(o.circuit),
  witness: o.witness,
  settings: fromProofSystemSettings(o.settings),
  num_iterations: o.numIterations,
  benchmark_witness_generation: o.benchmarkWitnessGeneration,
  benchmark_proving: o.benchmarkProving,};
}
export interface ClientIvcCheckPrecomputedVk {
  circuit: CircuitInput;
  functionName: string;
}

interface MsgpackClientIvcCheckPrecomputedVk {
  circuit: MsgpackCircuitInput;
  function_name: string;
}

export function toClientIvcCheckPrecomputedVk(o: MsgpackClientIvcCheckPrecomputedVk): ClientIvcCheckPrecomputedVk {
  if (o.circuit === undefined) { throw new Error("Expected circuit in ClientIvcCheckPrecomputedVk deserialization"); }
  if (o.function_name === undefined) { throw new Error("Expected function_name in ClientIvcCheckPrecomputedVk deserialization"); };
  return {
    circuit: toCircuitInput(o.circuit),
    functionName: o.function_name,
  };
}

export function fromClientIvcCheckPrecomputedVk(o: ClientIvcCheckPrecomputedVk): MsgpackClientIvcCheckPrecomputedVk {
  if (o.circuit === undefined) { throw new Error("Expected circuit in ClientIvcCheckPrecomputedVk serialization"); }
  if (o.functionName === undefined) { throw new Error("Expected functionName in ClientIvcCheckPrecomputedVk serialization"); };
  return {
  circuit: fromCircuitInput(o.circuit),
  function_name: o.functionName,};
}
export interface CircuitProveResponse {
  publicInputs: Fr[];
  proof: Fr[];
}

interface MsgpackCircuitProveResponse {
  public_inputs: Buffer[];
  proof: Buffer[];
}

export function toCircuitProveResponse(o: MsgpackCircuitProveResponse): CircuitProveResponse {
  if (o.public_inputs === undefined) { throw new Error("Expected public_inputs in CircuitProveResponse deserialization"); }
  if (o.proof === undefined) { throw new Error("Expected proof in CircuitProveResponse deserialization"); };
  return {
    publicInputs: o.public_inputs.map((v: Buffer) => v),
    proof: o.proof.map((v: Buffer) => v),
  };
}

export function fromCircuitProveResponse(o: CircuitProveResponse): MsgpackCircuitProveResponse {
  if (o.publicInputs === undefined) { throw new Error("Expected publicInputs in CircuitProveResponse serialization"); }
  if (o.proof === undefined) { throw new Error("Expected proof in CircuitProveResponse serialization"); };
  return {
  public_inputs: o.publicInputs.map((v: Fr) => v),
  proof: o.proof.map((v: Fr) => v),};
}
export interface CircuitComputeVkResponse {
  bytes: Buffer;
}

interface MsgpackCircuitComputeVkResponse {
  bytes: Buffer;
}

export function toCircuitComputeVkResponse(o: MsgpackCircuitComputeVkResponse): CircuitComputeVkResponse {
  if (o.bytes === undefined) { throw new Error("Expected bytes in CircuitComputeVkResponse deserialization"); };
  return {
    bytes: o.bytes,
  };
}

export function fromCircuitComputeVkResponse(o: CircuitComputeVkResponse): MsgpackCircuitComputeVkResponse {
  if (o.bytes === undefined) { throw new Error("Expected bytes in CircuitComputeVkResponse serialization"); };
  return {
  bytes: o.bytes,};
}
export interface CircuitInfoResponse {
  totalGates: number;
  subgroupSize: number;
  gatesPerOpcode: Record<string, number>;
}

interface MsgpackCircuitInfoResponse {
  total_gates: number;
  subgroup_size: number;
  gates_per_opcode: Record<string, number>;
}

export function toCircuitInfoResponse(o: MsgpackCircuitInfoResponse): CircuitInfoResponse {
  if (o.total_gates === undefined) { throw new Error("Expected total_gates in CircuitInfoResponse deserialization"); }
  if (o.subgroup_size === undefined) { throw new Error("Expected subgroup_size in CircuitInfoResponse deserialization"); }
  if (o.gates_per_opcode === undefined) { throw new Error("Expected gates_per_opcode in CircuitInfoResponse deserialization"); };
  return {
    totalGates: o.total_gates,
    subgroupSize: o.subgroup_size,
    gatesPerOpcode: o.gates_per_opcode,
  };
}

export function fromCircuitInfoResponse(o: CircuitInfoResponse): MsgpackCircuitInfoResponse {
  if (o.totalGates === undefined) { throw new Error("Expected totalGates in CircuitInfoResponse serialization"); }
  if (o.subgroupSize === undefined) { throw new Error("Expected subgroupSize in CircuitInfoResponse serialization"); }
  if (o.gatesPerOpcode === undefined) { throw new Error("Expected gatesPerOpcode in CircuitInfoResponse serialization"); };
  return {
  total_gates: o.totalGates,
  subgroup_size: o.subgroupSize,
  gates_per_opcode: o.gatesPerOpcode,};
}
export interface CircuitCheckResponse {
  satisfied: boolean;
}

interface MsgpackCircuitCheckResponse {
  satisfied: boolean;
}

export function toCircuitCheckResponse(o: MsgpackCircuitCheckResponse): CircuitCheckResponse {
  if (o.satisfied === undefined) { throw new Error("Expected satisfied in CircuitCheckResponse deserialization"); };
  return {
    satisfied: o.satisfied,
  };
}

export function fromCircuitCheckResponse(o: CircuitCheckResponse): MsgpackCircuitCheckResponse {
  if (o.satisfied === undefined) { throw new Error("Expected satisfied in CircuitCheckResponse serialization"); };
  return {
  satisfied: o.satisfied,};
}
export interface CircuitVerifyResponse {
  verified: boolean;
}

interface MsgpackCircuitVerifyResponse {
  verified: boolean;
}

export function toCircuitVerifyResponse(o: MsgpackCircuitVerifyResponse): CircuitVerifyResponse {
  if (o.verified === undefined) { throw new Error("Expected verified in CircuitVerifyResponse deserialization"); };
  return {
    verified: o.verified,
  };
}

export function fromCircuitVerifyResponse(o: CircuitVerifyResponse): MsgpackCircuitVerifyResponse {
  if (o.verified === undefined) { throw new Error("Expected verified in CircuitVerifyResponse serialization"); };
  return {
  verified: o.verified,};
}
export interface ClientIvcComputeStandaloneVkResponse {
  bytes: Buffer;
  fields: Fr[];
}

interface MsgpackClientIvcComputeStandaloneVkResponse {
  bytes: Buffer;
  fields: Buffer[];
}

export function toClientIvcComputeStandaloneVkResponse(o: MsgpackClientIvcComputeStandaloneVkResponse): ClientIvcComputeStandaloneVkResponse {
  if (o.bytes === undefined) { throw new Error("Expected bytes in ClientIvcComputeStandaloneVkResponse deserialization"); }
  if (o.fields === undefined) { throw new Error("Expected fields in ClientIvcComputeStandaloneVkResponse deserialization"); };
  return {
    bytes: o.bytes,
    fields: o.fields.map((v: Buffer) => v),
  };
}

export function fromClientIvcComputeStandaloneVkResponse(o: ClientIvcComputeStandaloneVkResponse): MsgpackClientIvcComputeStandaloneVkResponse {
  if (o.bytes === undefined) { throw new Error("Expected bytes in ClientIvcComputeStandaloneVkResponse serialization"); }
  if (o.fields === undefined) { throw new Error("Expected fields in ClientIvcComputeStandaloneVkResponse serialization"); };
  return {
  bytes: o.bytes,
  fields: o.fields.map((v: Fr) => v),};
}
export interface ClientIvcComputeIvcVkResponse {
  bytes: Buffer;
}

interface MsgpackClientIvcComputeIvcVkResponse {
  bytes: Buffer;
}

export function toClientIvcComputeIvcVkResponse(o: MsgpackClientIvcComputeIvcVkResponse): ClientIvcComputeIvcVkResponse {
  if (o.bytes === undefined) { throw new Error("Expected bytes in ClientIvcComputeIvcVkResponse deserialization"); };
  return {
    bytes: o.bytes,
  };
}

export function fromClientIvcComputeIvcVkResponse(o: ClientIvcComputeIvcVkResponse): MsgpackClientIvcComputeIvcVkResponse {
  if (o.bytes === undefined) { throw new Error("Expected bytes in ClientIvcComputeIvcVkResponse serialization"); };
  return {
  bytes: o.bytes,};
}
export interface ClientIvcStartResponse {
}

interface MsgpackClientIvcStartResponse {}

export function toClientIvcStartResponse(o: MsgpackClientIvcStartResponse): ClientIvcStartResponse {
  return {};
}

export function fromClientIvcStartResponse(o: ClientIvcStartResponse): MsgpackClientIvcStartResponse {
  return {};
}
export interface ClientIvcLoadResponse {
}

interface MsgpackClientIvcLoadResponse {}

export function toClientIvcLoadResponse(o: MsgpackClientIvcLoadResponse): ClientIvcLoadResponse {
  return {};
}

export function fromClientIvcLoadResponse(o: ClientIvcLoadResponse): MsgpackClientIvcLoadResponse {
  return {};
}
export interface ClientIvcAccumulateResponse {
}

interface MsgpackClientIvcAccumulateResponse {}

export function toClientIvcAccumulateResponse(o: MsgpackClientIvcAccumulateResponse): ClientIvcAccumulateResponse {
  return {};
}

export function fromClientIvcAccumulateResponse(o: ClientIvcAccumulateResponse): MsgpackClientIvcAccumulateResponse {
  return {};
}
export interface ECCVMProof {
  preIpaProof: Fr[];
  ipaProof: Fr[];
}

interface MsgpackECCVMProof {
  pre_ipa_proof: Buffer[];
  ipa_proof: Buffer[];
}

export function toECCVMProof(o: MsgpackECCVMProof): ECCVMProof {
  if (o.pre_ipa_proof === undefined) { throw new Error("Expected pre_ipa_proof in ECCVMProof deserialization"); }
  if (o.ipa_proof === undefined) { throw new Error("Expected ipa_proof in ECCVMProof deserialization"); };
  return {
    preIpaProof: o.pre_ipa_proof.map((v: Buffer) => v),
    ipaProof: o.ipa_proof.map((v: Buffer) => v),
  };
}

export function fromECCVMProof(o: ECCVMProof): MsgpackECCVMProof {
  if (o.preIpaProof === undefined) { throw new Error("Expected preIpaProof in ECCVMProof serialization"); }
  if (o.ipaProof === undefined) { throw new Error("Expected ipaProof in ECCVMProof serialization"); };
  return {
  pre_ipa_proof: o.preIpaProof.map((v: Fr) => v),
  ipa_proof: o.ipaProof.map((v: Fr) => v),};
}
export interface GoblinProof {
  mergeProof: Fr[];
  eccvmProof: ECCVMProof;
  translatorProof: Fr[];
}

interface MsgpackGoblinProof {
  merge_proof: Buffer[];
  eccvm_proof: MsgpackECCVMProof;
  translator_proof: Buffer[];
}

export function toGoblinProof(o: MsgpackGoblinProof): GoblinProof {
  if (o.merge_proof === undefined) { throw new Error("Expected merge_proof in GoblinProof deserialization"); }
  if (o.eccvm_proof === undefined) { throw new Error("Expected eccvm_proof in GoblinProof deserialization"); }
  if (o.translator_proof === undefined) { throw new Error("Expected translator_proof in GoblinProof deserialization"); };
  return {
    mergeProof: o.merge_proof.map((v: Buffer) => v),
    eccvmProof: toECCVMProof(o.eccvm_proof),
    translatorProof: o.translator_proof.map((v: Buffer) => v),
  };
}

export function fromGoblinProof(o: GoblinProof): MsgpackGoblinProof {
  if (o.mergeProof === undefined) { throw new Error("Expected mergeProof in GoblinProof serialization"); }
  if (o.eccvmProof === undefined) { throw new Error("Expected eccvmProof in GoblinProof serialization"); }
  if (o.translatorProof === undefined) { throw new Error("Expected translatorProof in GoblinProof serialization"); };
  return {
  merge_proof: o.mergeProof.map((v: Fr) => v),
  eccvm_proof: fromECCVMProof(o.eccvmProof),
  translator_proof: o.translatorProof.map((v: Fr) => v),};
}
export interface Proof {
  megaProof: Fr[];
  goblinProof: GoblinProof;
}

interface MsgpackProof {
  mega_proof: Buffer[];
  goblin_proof: MsgpackGoblinProof;
}

export function toProof(o: MsgpackProof): Proof {
  if (o.mega_proof === undefined) { throw new Error("Expected mega_proof in Proof deserialization"); }
  if (o.goblin_proof === undefined) { throw new Error("Expected goblin_proof in Proof deserialization"); };
  return {
    megaProof: o.mega_proof.map((v: Buffer) => v),
    goblinProof: toGoblinProof(o.goblin_proof),
  };
}

export function fromProof(o: Proof): MsgpackProof {
  if (o.megaProof === undefined) { throw new Error("Expected megaProof in Proof serialization"); }
  if (o.goblinProof === undefined) { throw new Error("Expected goblinProof in Proof serialization"); };
  return {
  mega_proof: o.megaProof.map((v: Fr) => v),
  goblin_proof: fromGoblinProof(o.goblinProof),};
}
export interface ClientIvcProveResponse {
  proof: Proof;
}

interface MsgpackClientIvcProveResponse {
  proof: MsgpackProof;
}

export function toClientIvcProveResponse(o: MsgpackClientIvcProveResponse): ClientIvcProveResponse {
  if (o.proof === undefined) { throw new Error("Expected proof in ClientIvcProveResponse deserialization"); };
  return {
    proof: toProof(o.proof),
  };
}

export function fromClientIvcProveResponse(o: ClientIvcProveResponse): MsgpackClientIvcProveResponse {
  if (o.proof === undefined) { throw new Error("Expected proof in ClientIvcProveResponse serialization"); };
  return {
  proof: fromProof(o.proof),};
}
export interface ProofAsFieldsResponse {
  fields: Fr[];
}

interface MsgpackProofAsFieldsResponse {
  fields: Buffer[];
}

export function toProofAsFieldsResponse(o: MsgpackProofAsFieldsResponse): ProofAsFieldsResponse {
  if (o.fields === undefined) { throw new Error("Expected fields in ProofAsFieldsResponse deserialization"); };
  return {
    fields: o.fields.map((v: Buffer) => v),
  };
}

export function fromProofAsFieldsResponse(o: ProofAsFieldsResponse): MsgpackProofAsFieldsResponse {
  if (o.fields === undefined) { throw new Error("Expected fields in ProofAsFieldsResponse serialization"); };
  return {
  fields: o.fields.map((v: Fr) => v),};
}
export interface VkAsFieldsResponse {
  fields: Fr[];
}

interface MsgpackVkAsFieldsResponse {
  fields: Buffer[];
}

export function toVkAsFieldsResponse(o: MsgpackVkAsFieldsResponse): VkAsFieldsResponse {
  if (o.fields === undefined) { throw new Error("Expected fields in VkAsFieldsResponse deserialization"); };
  return {
    fields: o.fields.map((v: Buffer) => v),
  };
}

export function fromVkAsFieldsResponse(o: VkAsFieldsResponse): MsgpackVkAsFieldsResponse {
  if (o.fields === undefined) { throw new Error("Expected fields in VkAsFieldsResponse serialization"); };
  return {
  fields: o.fields.map((v: Fr) => v),};
}
export interface CircuitWriteSolidityVerifierResponse {
  solidityCode: string;
}

interface MsgpackCircuitWriteSolidityVerifierResponse {
  solidity_code: string;
}

export function toCircuitWriteSolidityVerifierResponse(o: MsgpackCircuitWriteSolidityVerifierResponse): CircuitWriteSolidityVerifierResponse {
  if (o.solidity_code === undefined) { throw new Error("Expected solidity_code in CircuitWriteSolidityVerifierResponse deserialization"); };
  return {
    solidityCode: o.solidity_code,
  };
}

export function fromCircuitWriteSolidityVerifierResponse(o: CircuitWriteSolidityVerifierResponse): MsgpackCircuitWriteSolidityVerifierResponse {
  if (o.solidityCode === undefined) { throw new Error("Expected solidityCode in CircuitWriteSolidityVerifierResponse serialization"); };
  return {
  solidity_code: o.solidityCode,};
}
export interface CircuitProveAndVerifyResponse {
  verified: boolean;
  proof: Fr[];
  publicInputs: Fr[];
}

interface MsgpackCircuitProveAndVerifyResponse {
  verified: boolean;
  proof: Buffer[];
  public_inputs: Buffer[];
}

export function toCircuitProveAndVerifyResponse(o: MsgpackCircuitProveAndVerifyResponse): CircuitProveAndVerifyResponse {
  if (o.verified === undefined) { throw new Error("Expected verified in CircuitProveAndVerifyResponse deserialization"); }
  if (o.proof === undefined) { throw new Error("Expected proof in CircuitProveAndVerifyResponse deserialization"); }
  if (o.public_inputs === undefined) { throw new Error("Expected public_inputs in CircuitProveAndVerifyResponse deserialization"); };
  return {
    verified: o.verified,
    proof: o.proof.map((v: Buffer) => v),
    publicInputs: o.public_inputs.map((v: Buffer) => v),
  };
}

export function fromCircuitProveAndVerifyResponse(o: CircuitProveAndVerifyResponse): MsgpackCircuitProveAndVerifyResponse {
  if (o.verified === undefined) { throw new Error("Expected verified in CircuitProveAndVerifyResponse serialization"); }
  if (o.proof === undefined) { throw new Error("Expected proof in CircuitProveAndVerifyResponse serialization"); }
  if (o.publicInputs === undefined) { throw new Error("Expected publicInputs in CircuitProveAndVerifyResponse serialization"); };
  return {
  verified: o.verified,
  proof: o.proof.map((v: Fr) => v),
  public_inputs: o.publicInputs.map((v: Fr) => v),};
}
export interface CircuitBenchmarkResponse {
  witnessGenerationTimeMs: number;
  provingTimeMs: number;
  verificationTimeMs: number;
  peakMemoryBytes: number;
}

interface MsgpackCircuitBenchmarkResponse {
  witness_generation_time_ms: number;
  proving_time_ms: number;
  verification_time_ms: number;
  peak_memory_bytes: number;
}

export function toCircuitBenchmarkResponse(o: MsgpackCircuitBenchmarkResponse): CircuitBenchmarkResponse {
  if (o.witness_generation_time_ms === undefined) { throw new Error("Expected witness_generation_time_ms in CircuitBenchmarkResponse deserialization"); }
  if (o.proving_time_ms === undefined) { throw new Error("Expected proving_time_ms in CircuitBenchmarkResponse deserialization"); }
  if (o.verification_time_ms === undefined) { throw new Error("Expected verification_time_ms in CircuitBenchmarkResponse deserialization"); }
  if (o.peak_memory_bytes === undefined) { throw new Error("Expected peak_memory_bytes in CircuitBenchmarkResponse deserialization"); };
  return {
    witnessGenerationTimeMs: o.witness_generation_time_ms,
    provingTimeMs: o.proving_time_ms,
    verificationTimeMs: o.verification_time_ms,
    peakMemoryBytes: o.peak_memory_bytes,
  };
}

export function fromCircuitBenchmarkResponse(o: CircuitBenchmarkResponse): MsgpackCircuitBenchmarkResponse {
  if (o.witnessGenerationTimeMs === undefined) { throw new Error("Expected witnessGenerationTimeMs in CircuitBenchmarkResponse serialization"); }
  if (o.provingTimeMs === undefined) { throw new Error("Expected provingTimeMs in CircuitBenchmarkResponse serialization"); }
  if (o.verificationTimeMs === undefined) { throw new Error("Expected verificationTimeMs in CircuitBenchmarkResponse serialization"); }
  if (o.peakMemoryBytes === undefined) { throw new Error("Expected peakMemoryBytes in CircuitBenchmarkResponse serialization"); };
  return {
  witness_generation_time_ms: o.witnessGenerationTimeMs,
  proving_time_ms: o.provingTimeMs,
  verification_time_ms: o.verificationTimeMs,
  peak_memory_bytes: o.peakMemoryBytes,};
}
export interface ClientIvcCheckPrecomputedVkResponse {
  valid: boolean;
}

interface MsgpackClientIvcCheckPrecomputedVkResponse {
  valid: boolean;
}

export function toClientIvcCheckPrecomputedVkResponse(o: MsgpackClientIvcCheckPrecomputedVkResponse): ClientIvcCheckPrecomputedVkResponse {
  if (o.valid === undefined) { throw new Error("Expected valid in ClientIvcCheckPrecomputedVkResponse deserialization"); };
  return {
    valid: o.valid,
  };
}

export function fromClientIvcCheckPrecomputedVkResponse(o: ClientIvcCheckPrecomputedVkResponse): MsgpackClientIvcCheckPrecomputedVkResponse {
  if (o.valid === undefined) { throw new Error("Expected valid in ClientIvcCheckPrecomputedVkResponse serialization"); };
  return {
  valid: o.valid,};
}

export function circuitProve(wasm: BarretenbergWasmMain, command: CircuitProve): CircuitProveResponse {
  const msgpackCommand = fromCircuitProve(command);
  const [variantName, result] = wasm.callCbind('bbapi', [["CircuitProve", msgpackCommand]]);
  if (variantName !== 'CircuitProveResponse') {
    throw new Error(`Expected variant name 'CircuitProveResponse' but got '${variantName}'`);
  }
  return toCircuitProveResponse(result);
}

export function circuitComputeVk(wasm: BarretenbergWasmMain, command: CircuitComputeVk): CircuitComputeVkResponse {
  const msgpackCommand = fromCircuitComputeVk(command);
  const [variantName, result] = wasm.callCbind('bbapi', [["CircuitComputeVk", msgpackCommand]]);
  if (variantName !== 'CircuitComputeVkResponse') {
    throw new Error(`Expected variant name 'CircuitComputeVkResponse' but got '${variantName}'`);
  }
  return toCircuitComputeVkResponse(result);
}

export function circuitInfo(wasm: BarretenbergWasmMain, command: CircuitInfo): CircuitInfoResponse {
  const msgpackCommand = fromCircuitInfo(command);
  const [variantName, result] = wasm.callCbind('bbapi', [["CircuitInfo", msgpackCommand]]);
  if (variantName !== 'CircuitInfoResponse') {
    throw new Error(`Expected variant name 'CircuitInfoResponse' but got '${variantName}'`);
  }
  return toCircuitInfoResponse(result);
}

export function circuitCheck(wasm: BarretenbergWasmMain, command: CircuitCheck): CircuitCheckResponse {
  const msgpackCommand = fromCircuitCheck(command);
  const [variantName, result] = wasm.callCbind('bbapi', [["CircuitCheck", msgpackCommand]]);
  if (variantName !== 'CircuitCheckResponse') {
    throw new Error(`Expected variant name 'CircuitCheckResponse' but got '${variantName}'`);
  }
  return toCircuitCheckResponse(result);
}

export function circuitVerify(wasm: BarretenbergWasmMain, command: CircuitVerify): CircuitVerifyResponse {
  const msgpackCommand = fromCircuitVerify(command);
  const [variantName, result] = wasm.callCbind('bbapi', [["CircuitVerify", msgpackCommand]]);
  if (variantName !== 'CircuitVerifyResponse') {
    throw new Error(`Expected variant name 'CircuitVerifyResponse' but got '${variantName}'`);
  }
  return toCircuitVerifyResponse(result);
}

export function clientIvcComputeStandaloneVk(wasm: BarretenbergWasmMain, command: ClientIvcComputeStandaloneVk): ClientIvcComputeStandaloneVkResponse {
  const msgpackCommand = fromClientIvcComputeStandaloneVk(command);
  const [variantName, result] = wasm.callCbind('bbapi', [["ClientIvcComputeStandaloneVk", msgpackCommand]]);
  if (variantName !== 'ClientIvcComputeStandaloneVkResponse') {
    throw new Error(`Expected variant name 'ClientIvcComputeStandaloneVkResponse' but got '${variantName}'`);
  }
  return toClientIvcComputeStandaloneVkResponse(result);
}

export function clientIvcComputeIvcVk(wasm: BarretenbergWasmMain, command: ClientIvcComputeIvcVk): ClientIvcComputeIvcVkResponse {
  const msgpackCommand = fromClientIvcComputeIvcVk(command);
  const [variantName, result] = wasm.callCbind('bbapi', [["ClientIvcComputeIvcVk", msgpackCommand]]);
  if (variantName !== 'ClientIvcComputeIvcVkResponse') {
    throw new Error(`Expected variant name 'ClientIvcComputeIvcVkResponse' but got '${variantName}'`);
  }
  return toClientIvcComputeIvcVkResponse(result);
}

export function clientIvcStart(wasm: BarretenbergWasmMain, command: ClientIvcStart): ClientIvcStartResponse {
  const msgpackCommand = fromClientIvcStart(command);
  const [variantName, result] = wasm.callCbind('bbapi', [["ClientIvcStart", msgpackCommand]]);
  if (variantName !== 'ClientIvcStartResponse') {
    throw new Error(`Expected variant name 'ClientIvcStartResponse' but got '${variantName}'`);
  }
  return toClientIvcStartResponse(result);
}

export function clientIvcLoad(wasm: BarretenbergWasmMain, command: ClientIvcLoad): ClientIvcLoadResponse {
  const msgpackCommand = fromClientIvcLoad(command);
  const [variantName, result] = wasm.callCbind('bbapi', [["ClientIvcLoad", msgpackCommand]]);
  if (variantName !== 'ClientIvcLoadResponse') {
    throw new Error(`Expected variant name 'ClientIvcLoadResponse' but got '${variantName}'`);
  }
  return toClientIvcLoadResponse(result);
}

export function clientIvcAccumulate(wasm: BarretenbergWasmMain, command: ClientIvcAccumulate): ClientIvcAccumulateResponse {
  const msgpackCommand = fromClientIvcAccumulate(command);
  const [variantName, result] = wasm.callCbind('bbapi', [["ClientIvcAccumulate", msgpackCommand]]);
  if (variantName !== 'ClientIvcAccumulateResponse') {
    throw new Error(`Expected variant name 'ClientIvcAccumulateResponse' but got '${variantName}'`);
  }
  return toClientIvcAccumulateResponse(result);
}

export function clientIvcProve(wasm: BarretenbergWasmMain, command: ClientIvcProve): ClientIvcProveResponse {
  const msgpackCommand = fromClientIvcProve(command);
  const [variantName, result] = wasm.callCbind('bbapi', [["ClientIvcProve", msgpackCommand]]);
  if (variantName !== 'ClientIvcProveResponse') {
    throw new Error(`Expected variant name 'ClientIvcProveResponse' but got '${variantName}'`);
  }
  return toClientIvcProveResponse(result);
}

export function proofAsFields(wasm: BarretenbergWasmMain, command: ProofAsFields): ProofAsFieldsResponse {
  const msgpackCommand = fromProofAsFields(command);
  const [variantName, result] = wasm.callCbind('bbapi', [["ProofAsFields", msgpackCommand]]);
  if (variantName !== 'ProofAsFieldsResponse') {
    throw new Error(`Expected variant name 'ProofAsFieldsResponse' but got '${variantName}'`);
  }
  return toProofAsFieldsResponse(result);
}

export function vkAsFields(wasm: BarretenbergWasmMain, command: VkAsFields): VkAsFieldsResponse {
  const msgpackCommand = fromVkAsFields(command);
  const [variantName, result] = wasm.callCbind('bbapi', [["VkAsFields", msgpackCommand]]);
  if (variantName !== 'VkAsFieldsResponse') {
    throw new Error(`Expected variant name 'VkAsFieldsResponse' but got '${variantName}'`);
  }
  return toVkAsFieldsResponse(result);
}

export function circuitWriteSolidityVerifier(wasm: BarretenbergWasmMain, command: CircuitWriteSolidityVerifier): CircuitWriteSolidityVerifierResponse {
  const msgpackCommand = fromCircuitWriteSolidityVerifier(command);
  const [variantName, result] = wasm.callCbind('bbapi', [["CircuitWriteSolidityVerifier", msgpackCommand]]);
  if (variantName !== 'CircuitWriteSolidityVerifierResponse') {
    throw new Error(`Expected variant name 'CircuitWriteSolidityVerifierResponse' but got '${variantName}'`);
  }
  return toCircuitWriteSolidityVerifierResponse(result);
}

export function circuitProveAndVerify(wasm: BarretenbergWasmMain, command: CircuitProveAndVerify): CircuitProveAndVerifyResponse {
  const msgpackCommand = fromCircuitProveAndVerify(command);
  const [variantName, result] = wasm.callCbind('bbapi', [["CircuitProveAndVerify", msgpackCommand]]);
  if (variantName !== 'CircuitProveAndVerifyResponse') {
    throw new Error(`Expected variant name 'CircuitProveAndVerifyResponse' but got '${variantName}'`);
  }
  return toCircuitProveAndVerifyResponse(result);
}

export function circuitBenchmark(wasm: BarretenbergWasmMain, command: CircuitBenchmark): CircuitBenchmarkResponse {
  const msgpackCommand = fromCircuitBenchmark(command);
  const [variantName, result] = wasm.callCbind('bbapi', [["CircuitBenchmark", msgpackCommand]]);
  if (variantName !== 'CircuitBenchmarkResponse') {
    throw new Error(`Expected variant name 'CircuitBenchmarkResponse' but got '${variantName}'`);
  }
  return toCircuitBenchmarkResponse(result);
}

export function clientIvcCheckPrecomputedVk(wasm: BarretenbergWasmMain, command: ClientIvcCheckPrecomputedVk): ClientIvcCheckPrecomputedVkResponse {
  const msgpackCommand = fromClientIvcCheckPrecomputedVk(command);
  const [variantName, result] = wasm.callCbind('bbapi', [["ClientIvcCheckPrecomputedVk", msgpackCommand]]);
  if (variantName !== 'ClientIvcCheckPrecomputedVkResponse') {
    throw new Error(`Expected variant name 'ClientIvcCheckPrecomputedVkResponse' but got '${variantName}'`);
  }
  return toClientIvcCheckPrecomputedVkResponse(result);
}

/**
 * Sync API wrapper for cbind functions using BarretenbergWasmMain.
 * All methods are synchronous.
 */
export class CbindApiSync {
  constructor(protected wasm: BarretenbergWasmMain) {}

  circuitProve(command: CircuitProve): CircuitProveResponse {
    return circuitProve(this.wasm, command);
  }

  circuitComputeVk(command: CircuitComputeVk): CircuitComputeVkResponse {
    return circuitComputeVk(this.wasm, command);
  }

  circuitInfo(command: CircuitInfo): CircuitInfoResponse {
    return circuitInfo(this.wasm, command);
  }

  circuitCheck(command: CircuitCheck): CircuitCheckResponse {
    return circuitCheck(this.wasm, command);
  }

  circuitVerify(command: CircuitVerify): CircuitVerifyResponse {
    return circuitVerify(this.wasm, command);
  }

  clientIvcComputeStandaloneVk(command: ClientIvcComputeStandaloneVk): ClientIvcComputeStandaloneVkResponse {
    return clientIvcComputeStandaloneVk(this.wasm, command);
  }

  clientIvcComputeIvcVk(command: ClientIvcComputeIvcVk): ClientIvcComputeIvcVkResponse {
    return clientIvcComputeIvcVk(this.wasm, command);
  }

  clientIvcStart(command: ClientIvcStart): ClientIvcStartResponse {
    return clientIvcStart(this.wasm, command);
  }

  clientIvcLoad(command: ClientIvcLoad): ClientIvcLoadResponse {
    return clientIvcLoad(this.wasm, command);
  }

  clientIvcAccumulate(command: ClientIvcAccumulate): ClientIvcAccumulateResponse {
    return clientIvcAccumulate(this.wasm, command);
  }

  clientIvcProve(command: ClientIvcProve): ClientIvcProveResponse {
    return clientIvcProve(this.wasm, command);
  }

  proofAsFields(command: ProofAsFields): ProofAsFieldsResponse {
    return proofAsFields(this.wasm, command);
  }

  vkAsFields(command: VkAsFields): VkAsFieldsResponse {
    return vkAsFields(this.wasm, command);
  }

  circuitWriteSolidityVerifier(command: CircuitWriteSolidityVerifier): CircuitWriteSolidityVerifierResponse {
    return circuitWriteSolidityVerifier(this.wasm, command);
  }

  circuitProveAndVerify(command: CircuitProveAndVerify): CircuitProveAndVerifyResponse {
    return circuitProveAndVerify(this.wasm, command);
  }

  circuitBenchmark(command: CircuitBenchmark): CircuitBenchmarkResponse {
    return circuitBenchmark(this.wasm, command);
  }

  clientIvcCheckPrecomputedVk(command: ClientIvcCheckPrecomputedVk): ClientIvcCheckPrecomputedVkResponse {
    return clientIvcCheckPrecomputedVk(this.wasm, command);
  }
}
