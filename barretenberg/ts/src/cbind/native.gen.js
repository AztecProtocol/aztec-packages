/* eslint-disable */
// GENERATED FILE DO NOT EDIT, RUN yarn generate
import { Buffer } from "buffer";
import { spawn } from "child_process";
import { Encoder, decode } from "msgpackr";
// Helper function for mapping tuples
function mapTuple(tuple, fn) {
    return tuple.map(fn);
}
function toCircuitInput(o) {
    if (o.name === undefined) {
        throw new Error("Expected name in CircuitInput deserialization");
    }
    if (o.bytecode === undefined) {
        throw new Error("Expected bytecode in CircuitInput deserialization");
    }
    if (o.verification_key === undefined) {
        throw new Error("Expected verification_key in CircuitInput deserialization");
    }
    ;
    return {
        name: o.name,
        bytecode: o.bytecode,
        verificationKey: o.verification_key,
    };
}
function fromCircuitInput(o) {
    if (o.name === undefined) {
        throw new Error("Expected name in CircuitInput serialization");
    }
    if (o.bytecode === undefined) {
        throw new Error("Expected bytecode in CircuitInput serialization");
    }
    if (o.verificationKey === undefined) {
        throw new Error("Expected verificationKey in CircuitInput serialization");
    }
    ;
    return {
        name: o.name,
        bytecode: o.bytecode,
        verification_key: o.verificationKey,
    };
}
function toProofSystemSettings(o) {
    if (o.ipa_accumulation === undefined) {
        throw new Error("Expected ipa_accumulation in ProofSystemSettings deserialization");
    }
    if (o.oracle_hash_type === undefined) {
        throw new Error("Expected oracle_hash_type in ProofSystemSettings deserialization");
    }
    if (o.disable_zk === undefined) {
        throw new Error("Expected disable_zk in ProofSystemSettings deserialization");
    }
    if (o.honk_recursion === undefined) {
        throw new Error("Expected honk_recursion in ProofSystemSettings deserialization");
    }
    if (o.recursive === undefined) {
        throw new Error("Expected recursive in ProofSystemSettings deserialization");
    }
    ;
    return {
        ipaAccumulation: o.ipa_accumulation,
        oracleHashType: o.oracle_hash_type,
        disableZk: o.disable_zk,
        honkRecursion: o.honk_recursion,
        recursive: o.recursive,
    };
}
function fromProofSystemSettings(o) {
    if (o.ipaAccumulation === undefined) {
        throw new Error("Expected ipaAccumulation in ProofSystemSettings serialization");
    }
    if (o.oracleHashType === undefined) {
        throw new Error("Expected oracleHashType in ProofSystemSettings serialization");
    }
    if (o.disableZk === undefined) {
        throw new Error("Expected disableZk in ProofSystemSettings serialization");
    }
    if (o.honkRecursion === undefined) {
        throw new Error("Expected honkRecursion in ProofSystemSettings serialization");
    }
    if (o.recursive === undefined) {
        throw new Error("Expected recursive in ProofSystemSettings serialization");
    }
    ;
    return {
        ipa_accumulation: o.ipaAccumulation,
        oracle_hash_type: o.oracleHashType,
        disable_zk: o.disableZk,
        honk_recursion: o.honkRecursion,
        recursive: o.recursive,
    };
}
function toCircuitProve(o) {
    if (o.circuit === undefined) {
        throw new Error("Expected circuit in CircuitProve deserialization");
    }
    if (o.witness === undefined) {
        throw new Error("Expected witness in CircuitProve deserialization");
    }
    if (o.settings === undefined) {
        throw new Error("Expected settings in CircuitProve deserialization");
    }
    ;
    return {
        circuit: toCircuitInput(o.circuit),
        witness: o.witness,
        settings: toProofSystemSettings(o.settings),
    };
}
function fromCircuitProve(o) {
    if (o.circuit === undefined) {
        throw new Error("Expected circuit in CircuitProve serialization");
    }
    if (o.witness === undefined) {
        throw new Error("Expected witness in CircuitProve serialization");
    }
    if (o.settings === undefined) {
        throw new Error("Expected settings in CircuitProve serialization");
    }
    ;
    return {
        circuit: fromCircuitInput(o.circuit),
        witness: o.witness,
        settings: fromProofSystemSettings(o.settings),
    };
}
function toCircuitInputNoVK(o) {
    if (o.name === undefined) {
        throw new Error("Expected name in CircuitInputNoVK deserialization");
    }
    if (o.bytecode === undefined) {
        throw new Error("Expected bytecode in CircuitInputNoVK deserialization");
    }
    ;
    return {
        name: o.name,
        bytecode: o.bytecode,
    };
}
function fromCircuitInputNoVK(o) {
    if (o.name === undefined) {
        throw new Error("Expected name in CircuitInputNoVK serialization");
    }
    if (o.bytecode === undefined) {
        throw new Error("Expected bytecode in CircuitInputNoVK serialization");
    }
    ;
    return {
        name: o.name,
        bytecode: o.bytecode,
    };
}
function toCircuitComputeVk(o) {
    if (o.circuit === undefined) {
        throw new Error("Expected circuit in CircuitComputeVk deserialization");
    }
    if (o.settings === undefined) {
        throw new Error("Expected settings in CircuitComputeVk deserialization");
    }
    ;
    return {
        circuit: toCircuitInputNoVK(o.circuit),
        settings: toProofSystemSettings(o.settings),
    };
}
function fromCircuitComputeVk(o) {
    if (o.circuit === undefined) {
        throw new Error("Expected circuit in CircuitComputeVk serialization");
    }
    if (o.settings === undefined) {
        throw new Error("Expected settings in CircuitComputeVk serialization");
    }
    ;
    return {
        circuit: fromCircuitInputNoVK(o.circuit),
        settings: fromProofSystemSettings(o.settings),
    };
}
function toCircuitInfo(o) {
    if (o.circuit === undefined) {
        throw new Error("Expected circuit in CircuitInfo deserialization");
    }
    if (o.include_gates_per_opcode === undefined) {
        throw new Error("Expected include_gates_per_opcode in CircuitInfo deserialization");
    }
    if (o.settings === undefined) {
        throw new Error("Expected settings in CircuitInfo deserialization");
    }
    ;
    return {
        circuit: toCircuitInput(o.circuit),
        includeGatesPerOpcode: o.include_gates_per_opcode,
        settings: toProofSystemSettings(o.settings),
    };
}
function fromCircuitInfo(o) {
    if (o.circuit === undefined) {
        throw new Error("Expected circuit in CircuitInfo serialization");
    }
    if (o.includeGatesPerOpcode === undefined) {
        throw new Error("Expected includeGatesPerOpcode in CircuitInfo serialization");
    }
    if (o.settings === undefined) {
        throw new Error("Expected settings in CircuitInfo serialization");
    }
    ;
    return {
        circuit: fromCircuitInput(o.circuit),
        include_gates_per_opcode: o.includeGatesPerOpcode,
        settings: fromProofSystemSettings(o.settings),
    };
}
function toCircuitCheck(o) {
    if (o.circuit === undefined) {
        throw new Error("Expected circuit in CircuitCheck deserialization");
    }
    if (o.witness === undefined) {
        throw new Error("Expected witness in CircuitCheck deserialization");
    }
    if (o.settings === undefined) {
        throw new Error("Expected settings in CircuitCheck deserialization");
    }
    ;
    return {
        circuit: toCircuitInput(o.circuit),
        witness: o.witness,
        settings: toProofSystemSettings(o.settings),
    };
}
function fromCircuitCheck(o) {
    if (o.circuit === undefined) {
        throw new Error("Expected circuit in CircuitCheck serialization");
    }
    if (o.witness === undefined) {
        throw new Error("Expected witness in CircuitCheck serialization");
    }
    if (o.settings === undefined) {
        throw new Error("Expected settings in CircuitCheck serialization");
    }
    ;
    return {
        circuit: fromCircuitInput(o.circuit),
        witness: o.witness,
        settings: fromProofSystemSettings(o.settings),
    };
}
function toCircuitVerify(o) {
    if (o.verification_key === undefined) {
        throw new Error("Expected verification_key in CircuitVerify deserialization");
    }
    if (o.public_inputs === undefined) {
        throw new Error("Expected public_inputs in CircuitVerify deserialization");
    }
    if (o.proof === undefined) {
        throw new Error("Expected proof in CircuitVerify deserialization");
    }
    if (o.settings === undefined) {
        throw new Error("Expected settings in CircuitVerify deserialization");
    }
    ;
    return {
        verificationKey: o.verification_key,
        publicInputs: o.public_inputs.map((v) => v),
        proof: o.proof.map((v) => v),
        settings: toProofSystemSettings(o.settings),
    };
}
function fromCircuitVerify(o) {
    if (o.verificationKey === undefined) {
        throw new Error("Expected verificationKey in CircuitVerify serialization");
    }
    if (o.publicInputs === undefined) {
        throw new Error("Expected publicInputs in CircuitVerify serialization");
    }
    if (o.proof === undefined) {
        throw new Error("Expected proof in CircuitVerify serialization");
    }
    if (o.settings === undefined) {
        throw new Error("Expected settings in CircuitVerify serialization");
    }
    ;
    return {
        verification_key: o.verificationKey,
        public_inputs: o.publicInputs.map((v) => v),
        proof: o.proof.map((v) => v),
        settings: fromProofSystemSettings(o.settings),
    };
}
function toClientIvcComputeStandaloneVk(o) {
    if (o.circuit === undefined) {
        throw new Error("Expected circuit in ClientIvcComputeStandaloneVk deserialization");
    }
    ;
    return {
        circuit: toCircuitInputNoVK(o.circuit),
    };
}
function fromClientIvcComputeStandaloneVk(o) {
    if (o.circuit === undefined) {
        throw new Error("Expected circuit in ClientIvcComputeStandaloneVk serialization");
    }
    ;
    return {
        circuit: fromCircuitInputNoVK(o.circuit),
    };
}
function toClientIvcComputeIvcVk(o) {
    if (o.circuit === undefined) {
        throw new Error("Expected circuit in ClientIvcComputeIvcVk deserialization");
    }
    ;
    return {
        circuit: toCircuitInputNoVK(o.circuit),
    };
}
function fromClientIvcComputeIvcVk(o) {
    if (o.circuit === undefined) {
        throw new Error("Expected circuit in ClientIvcComputeIvcVk serialization");
    }
    ;
    return {
        circuit: fromCircuitInputNoVK(o.circuit),
    };
}
function toClientIvcStart(o) {
    if (o.num_circuits === undefined) {
        throw new Error("Expected num_circuits in ClientIvcStart deserialization");
    }
    ;
    return {
        numCircuits: o.num_circuits,
    };
}
function fromClientIvcStart(o) {
    if (o.numCircuits === undefined) {
        throw new Error("Expected numCircuits in ClientIvcStart serialization");
    }
    ;
    return {
        num_circuits: o.numCircuits,
    };
}
function toClientIvcLoad(o) {
    if (o.circuit === undefined) {
        throw new Error("Expected circuit in ClientIvcLoad deserialization");
    }
    ;
    return {
        circuit: toCircuitInput(o.circuit),
    };
}
function fromClientIvcLoad(o) {
    if (o.circuit === undefined) {
        throw new Error("Expected circuit in ClientIvcLoad serialization");
    }
    ;
    return {
        circuit: fromCircuitInput(o.circuit),
    };
}
function toClientIvcAccumulate(o) {
    if (o.witness === undefined) {
        throw new Error("Expected witness in ClientIvcAccumulate deserialization");
    }
    ;
    return {
        witness: o.witness,
    };
}
function fromClientIvcAccumulate(o) {
    if (o.witness === undefined) {
        throw new Error("Expected witness in ClientIvcAccumulate serialization");
    }
    ;
    return {
        witness: o.witness,
    };
}
function toClientIvcProve(o) {
    return {};
}
function fromClientIvcProve(o) {
    return {};
}
function toProofAsFields(o) {
    if (o.proof === undefined) {
        throw new Error("Expected proof in ProofAsFields deserialization");
    }
    ;
    return {
        proof: o.proof.map((v) => v),
    };
}
function fromProofAsFields(o) {
    if (o.proof === undefined) {
        throw new Error("Expected proof in ProofAsFields serialization");
    }
    ;
    return {
        proof: o.proof.map((v) => v),
    };
}
function toVkAsFields(o) {
    if (o.verification_key === undefined) {
        throw new Error("Expected verification_key in VkAsFields deserialization");
    }
    if (o.is_mega_honk === undefined) {
        throw new Error("Expected is_mega_honk in VkAsFields deserialization");
    }
    ;
    return {
        verificationKey: o.verification_key,
        isMegaHonk: o.is_mega_honk,
    };
}
function fromVkAsFields(o) {
    if (o.verificationKey === undefined) {
        throw new Error("Expected verificationKey in VkAsFields serialization");
    }
    if (o.isMegaHonk === undefined) {
        throw new Error("Expected isMegaHonk in VkAsFields serialization");
    }
    ;
    return {
        verification_key: o.verificationKey,
        is_mega_honk: o.isMegaHonk,
    };
}
function toCircuitWriteSolidityVerifier(o) {
    if (o.verification_key === undefined) {
        throw new Error("Expected verification_key in CircuitWriteSolidityVerifier deserialization");
    }
    if (o.settings === undefined) {
        throw new Error("Expected settings in CircuitWriteSolidityVerifier deserialization");
    }
    ;
    return {
        verificationKey: o.verification_key,
        settings: toProofSystemSettings(o.settings),
    };
}
function fromCircuitWriteSolidityVerifier(o) {
    if (o.verificationKey === undefined) {
        throw new Error("Expected verificationKey in CircuitWriteSolidityVerifier serialization");
    }
    if (o.settings === undefined) {
        throw new Error("Expected settings in CircuitWriteSolidityVerifier serialization");
    }
    ;
    return {
        verification_key: o.verificationKey,
        settings: fromProofSystemSettings(o.settings),
    };
}
function toCircuitProveAndVerify(o) {
    if (o.circuit === undefined) {
        throw new Error("Expected circuit in CircuitProveAndVerify deserialization");
    }
    if (o.witness === undefined) {
        throw new Error("Expected witness in CircuitProveAndVerify deserialization");
    }
    if (o.settings === undefined) {
        throw new Error("Expected settings in CircuitProveAndVerify deserialization");
    }
    ;
    return {
        circuit: toCircuitInput(o.circuit),
        witness: o.witness,
        settings: toProofSystemSettings(o.settings),
    };
}
function fromCircuitProveAndVerify(o) {
    if (o.circuit === undefined) {
        throw new Error("Expected circuit in CircuitProveAndVerify serialization");
    }
    if (o.witness === undefined) {
        throw new Error("Expected witness in CircuitProveAndVerify serialization");
    }
    if (o.settings === undefined) {
        throw new Error("Expected settings in CircuitProveAndVerify serialization");
    }
    ;
    return {
        circuit: fromCircuitInput(o.circuit),
        witness: o.witness,
        settings: fromProofSystemSettings(o.settings),
    };
}
function toCircuitBenchmark(o) {
    if (o.circuit === undefined) {
        throw new Error("Expected circuit in CircuitBenchmark deserialization");
    }
    if (o.witness === undefined) {
        throw new Error("Expected witness in CircuitBenchmark deserialization");
    }
    if (o.settings === undefined) {
        throw new Error("Expected settings in CircuitBenchmark deserialization");
    }
    if (o.num_iterations === undefined) {
        throw new Error("Expected num_iterations in CircuitBenchmark deserialization");
    }
    if (o.benchmark_witness_generation === undefined) {
        throw new Error("Expected benchmark_witness_generation in CircuitBenchmark deserialization");
    }
    if (o.benchmark_proving === undefined) {
        throw new Error("Expected benchmark_proving in CircuitBenchmark deserialization");
    }
    ;
    return {
        circuit: toCircuitInput(o.circuit),
        witness: o.witness,
        settings: toProofSystemSettings(o.settings),
        numIterations: o.num_iterations,
        benchmarkWitnessGeneration: o.benchmark_witness_generation,
        benchmarkProving: o.benchmark_proving,
    };
}
function fromCircuitBenchmark(o) {
    if (o.circuit === undefined) {
        throw new Error("Expected circuit in CircuitBenchmark serialization");
    }
    if (o.witness === undefined) {
        throw new Error("Expected witness in CircuitBenchmark serialization");
    }
    if (o.settings === undefined) {
        throw new Error("Expected settings in CircuitBenchmark serialization");
    }
    if (o.numIterations === undefined) {
        throw new Error("Expected numIterations in CircuitBenchmark serialization");
    }
    if (o.benchmarkWitnessGeneration === undefined) {
        throw new Error("Expected benchmarkWitnessGeneration in CircuitBenchmark serialization");
    }
    if (o.benchmarkProving === undefined) {
        throw new Error("Expected benchmarkProving in CircuitBenchmark serialization");
    }
    ;
    return {
        circuit: fromCircuitInput(o.circuit),
        witness: o.witness,
        settings: fromProofSystemSettings(o.settings),
        num_iterations: o.numIterations,
        benchmark_witness_generation: o.benchmarkWitnessGeneration,
        benchmark_proving: o.benchmarkProving,
    };
}
function toClientIvcCheckPrecomputedVk(o) {
    if (o.circuit === undefined) {
        throw new Error("Expected circuit in ClientIvcCheckPrecomputedVk deserialization");
    }
    if (o.function_name === undefined) {
        throw new Error("Expected function_name in ClientIvcCheckPrecomputedVk deserialization");
    }
    ;
    return {
        circuit: toCircuitInput(o.circuit),
        functionName: o.function_name,
    };
}
function fromClientIvcCheckPrecomputedVk(o) {
    if (o.circuit === undefined) {
        throw new Error("Expected circuit in ClientIvcCheckPrecomputedVk serialization");
    }
    if (o.functionName === undefined) {
        throw new Error("Expected functionName in ClientIvcCheckPrecomputedVk serialization");
    }
    ;
    return {
        circuit: fromCircuitInput(o.circuit),
        function_name: o.functionName,
    };
}
function toCircuitProveResponse(o) {
    if (o.public_inputs === undefined) {
        throw new Error("Expected public_inputs in CircuitProveResponse deserialization");
    }
    if (o.proof === undefined) {
        throw new Error("Expected proof in CircuitProveResponse deserialization");
    }
    ;
    return {
        publicInputs: o.public_inputs.map((v) => v),
        proof: o.proof.map((v) => v),
    };
}
function fromCircuitProveResponse(o) {
    if (o.publicInputs === undefined) {
        throw new Error("Expected publicInputs in CircuitProveResponse serialization");
    }
    if (o.proof === undefined) {
        throw new Error("Expected proof in CircuitProveResponse serialization");
    }
    ;
    return {
        public_inputs: o.publicInputs.map((v) => v),
        proof: o.proof.map((v) => v),
    };
}
function toCircuitComputeVkResponse(o) {
    if (o.bytes === undefined) {
        throw new Error("Expected bytes in CircuitComputeVkResponse deserialization");
    }
    ;
    return {
        bytes: o.bytes,
    };
}
function fromCircuitComputeVkResponse(o) {
    if (o.bytes === undefined) {
        throw new Error("Expected bytes in CircuitComputeVkResponse serialization");
    }
    ;
    return {
        bytes: o.bytes,
    };
}
function toCircuitInfoResponse(o) {
    if (o.total_gates === undefined) {
        throw new Error("Expected total_gates in CircuitInfoResponse deserialization");
    }
    if (o.subgroup_size === undefined) {
        throw new Error("Expected subgroup_size in CircuitInfoResponse deserialization");
    }
    if (o.gates_per_opcode === undefined) {
        throw new Error("Expected gates_per_opcode in CircuitInfoResponse deserialization");
    }
    ;
    return {
        totalGates: o.total_gates,
        subgroupSize: o.subgroup_size,
        gatesPerOpcode: o.gates_per_opcode,
    };
}
function fromCircuitInfoResponse(o) {
    if (o.totalGates === undefined) {
        throw new Error("Expected totalGates in CircuitInfoResponse serialization");
    }
    if (o.subgroupSize === undefined) {
        throw new Error("Expected subgroupSize in CircuitInfoResponse serialization");
    }
    if (o.gatesPerOpcode === undefined) {
        throw new Error("Expected gatesPerOpcode in CircuitInfoResponse serialization");
    }
    ;
    return {
        total_gates: o.totalGates,
        subgroup_size: o.subgroupSize,
        gates_per_opcode: o.gatesPerOpcode,
    };
}
function toCircuitCheckResponse(o) {
    if (o.satisfied === undefined) {
        throw new Error("Expected satisfied in CircuitCheckResponse deserialization");
    }
    ;
    return {
        satisfied: o.satisfied,
    };
}
function fromCircuitCheckResponse(o) {
    if (o.satisfied === undefined) {
        throw new Error("Expected satisfied in CircuitCheckResponse serialization");
    }
    ;
    return {
        satisfied: o.satisfied,
    };
}
function toCircuitVerifyResponse(o) {
    if (o.verified === undefined) {
        throw new Error("Expected verified in CircuitVerifyResponse deserialization");
    }
    ;
    return {
        verified: o.verified,
    };
}
function fromCircuitVerifyResponse(o) {
    if (o.verified === undefined) {
        throw new Error("Expected verified in CircuitVerifyResponse serialization");
    }
    ;
    return {
        verified: o.verified,
    };
}
function toClientIvcComputeStandaloneVkResponse(o) {
    if (o.bytes === undefined) {
        throw new Error("Expected bytes in ClientIvcComputeStandaloneVkResponse deserialization");
    }
    if (o.fields === undefined) {
        throw new Error("Expected fields in ClientIvcComputeStandaloneVkResponse deserialization");
    }
    ;
    return {
        bytes: o.bytes,
        fields: o.fields.map((v) => v),
    };
}
function fromClientIvcComputeStandaloneVkResponse(o) {
    if (o.bytes === undefined) {
        throw new Error("Expected bytes in ClientIvcComputeStandaloneVkResponse serialization");
    }
    if (o.fields === undefined) {
        throw new Error("Expected fields in ClientIvcComputeStandaloneVkResponse serialization");
    }
    ;
    return {
        bytes: o.bytes,
        fields: o.fields.map((v) => v),
    };
}
function toClientIvcComputeIvcVkResponse(o) {
    if (o.bytes === undefined) {
        throw new Error("Expected bytes in ClientIvcComputeIvcVkResponse deserialization");
    }
    ;
    return {
        bytes: o.bytes,
    };
}
function fromClientIvcComputeIvcVkResponse(o) {
    if (o.bytes === undefined) {
        throw new Error("Expected bytes in ClientIvcComputeIvcVkResponse serialization");
    }
    ;
    return {
        bytes: o.bytes,
    };
}
function toClientIvcStartResponse(o) {
    return {};
}
function fromClientIvcStartResponse(o) {
    return {};
}
function toClientIvcLoadResponse(o) {
    return {};
}
function fromClientIvcLoadResponse(o) {
    return {};
}
function toClientIvcAccumulateResponse(o) {
    return {};
}
function fromClientIvcAccumulateResponse(o) {
    return {};
}
function toECCVMProof(o) {
    if (o.pre_ipa_proof === undefined) {
        throw new Error("Expected pre_ipa_proof in ECCVMProof deserialization");
    }
    if (o.ipa_proof === undefined) {
        throw new Error("Expected ipa_proof in ECCVMProof deserialization");
    }
    ;
    return {
        preIpaProof: o.pre_ipa_proof.map((v) => v),
        ipaProof: o.ipa_proof.map((v) => v),
    };
}
function fromECCVMProof(o) {
    if (o.preIpaProof === undefined) {
        throw new Error("Expected preIpaProof in ECCVMProof serialization");
    }
    if (o.ipaProof === undefined) {
        throw new Error("Expected ipaProof in ECCVMProof serialization");
    }
    ;
    return {
        pre_ipa_proof: o.preIpaProof.map((v) => v),
        ipa_proof: o.ipaProof.map((v) => v),
    };
}
function toGoblinProof(o) {
    if (o.merge_proof === undefined) {
        throw new Error("Expected merge_proof in GoblinProof deserialization");
    }
    if (o.eccvm_proof === undefined) {
        throw new Error("Expected eccvm_proof in GoblinProof deserialization");
    }
    if (o.translator_proof === undefined) {
        throw new Error("Expected translator_proof in GoblinProof deserialization");
    }
    ;
    return {
        mergeProof: o.merge_proof.map((v) => v),
        eccvmProof: toECCVMProof(o.eccvm_proof),
        translatorProof: o.translator_proof.map((v) => v),
    };
}
function fromGoblinProof(o) {
    if (o.mergeProof === undefined) {
        throw new Error("Expected mergeProof in GoblinProof serialization");
    }
    if (o.eccvmProof === undefined) {
        throw new Error("Expected eccvmProof in GoblinProof serialization");
    }
    if (o.translatorProof === undefined) {
        throw new Error("Expected translatorProof in GoblinProof serialization");
    }
    ;
    return {
        merge_proof: o.mergeProof.map((v) => v),
        eccvm_proof: fromECCVMProof(o.eccvmProof),
        translator_proof: o.translatorProof.map((v) => v),
    };
}
function toProof(o) {
    if (o.mega_proof === undefined) {
        throw new Error("Expected mega_proof in Proof deserialization");
    }
    if (o.goblin_proof === undefined) {
        throw new Error("Expected goblin_proof in Proof deserialization");
    }
    ;
    return {
        megaProof: o.mega_proof.map((v) => v),
        goblinProof: toGoblinProof(o.goblin_proof),
    };
}
function fromProof(o) {
    if (o.megaProof === undefined) {
        throw new Error("Expected megaProof in Proof serialization");
    }
    if (o.goblinProof === undefined) {
        throw new Error("Expected goblinProof in Proof serialization");
    }
    ;
    return {
        mega_proof: o.megaProof.map((v) => v),
        goblin_proof: fromGoblinProof(o.goblinProof),
    };
}
function toClientIvcProveResponse(o) {
    if (o.proof === undefined) {
        throw new Error("Expected proof in ClientIvcProveResponse deserialization");
    }
    ;
    return {
        proof: toProof(o.proof),
    };
}
function fromClientIvcProveResponse(o) {
    if (o.proof === undefined) {
        throw new Error("Expected proof in ClientIvcProveResponse serialization");
    }
    ;
    return {
        proof: fromProof(o.proof),
    };
}
function toProofAsFieldsResponse(o) {
    if (o.fields === undefined) {
        throw new Error("Expected fields in ProofAsFieldsResponse deserialization");
    }
    ;
    return {
        fields: o.fields.map((v) => v),
    };
}
function fromProofAsFieldsResponse(o) {
    if (o.fields === undefined) {
        throw new Error("Expected fields in ProofAsFieldsResponse serialization");
    }
    ;
    return {
        fields: o.fields.map((v) => v),
    };
}
function toVkAsFieldsResponse(o) {
    if (o.fields === undefined) {
        throw new Error("Expected fields in VkAsFieldsResponse deserialization");
    }
    ;
    return {
        fields: o.fields.map((v) => v),
    };
}
function fromVkAsFieldsResponse(o) {
    if (o.fields === undefined) {
        throw new Error("Expected fields in VkAsFieldsResponse serialization");
    }
    ;
    return {
        fields: o.fields.map((v) => v),
    };
}
function toCircuitWriteSolidityVerifierResponse(o) {
    if (o.solidity_code === undefined) {
        throw new Error("Expected solidity_code in CircuitWriteSolidityVerifierResponse deserialization");
    }
    ;
    return {
        solidityCode: o.solidity_code,
    };
}
function fromCircuitWriteSolidityVerifierResponse(o) {
    if (o.solidityCode === undefined) {
        throw new Error("Expected solidityCode in CircuitWriteSolidityVerifierResponse serialization");
    }
    ;
    return {
        solidity_code: o.solidityCode,
    };
}
function toCircuitProveAndVerifyResponse(o) {
    if (o.verified === undefined) {
        throw new Error("Expected verified in CircuitProveAndVerifyResponse deserialization");
    }
    if (o.proof === undefined) {
        throw new Error("Expected proof in CircuitProveAndVerifyResponse deserialization");
    }
    if (o.public_inputs === undefined) {
        throw new Error("Expected public_inputs in CircuitProveAndVerifyResponse deserialization");
    }
    ;
    return {
        verified: o.verified,
        proof: o.proof.map((v) => v),
        publicInputs: o.public_inputs.map((v) => v),
    };
}
function fromCircuitProveAndVerifyResponse(o) {
    if (o.verified === undefined) {
        throw new Error("Expected verified in CircuitProveAndVerifyResponse serialization");
    }
    if (o.proof === undefined) {
        throw new Error("Expected proof in CircuitProveAndVerifyResponse serialization");
    }
    if (o.publicInputs === undefined) {
        throw new Error("Expected publicInputs in CircuitProveAndVerifyResponse serialization");
    }
    ;
    return {
        verified: o.verified,
        proof: o.proof.map((v) => v),
        public_inputs: o.publicInputs.map((v) => v),
    };
}
function toCircuitBenchmarkResponse(o) {
    if (o.witness_generation_time_ms === undefined) {
        throw new Error("Expected witness_generation_time_ms in CircuitBenchmarkResponse deserialization");
    }
    if (o.proving_time_ms === undefined) {
        throw new Error("Expected proving_time_ms in CircuitBenchmarkResponse deserialization");
    }
    if (o.verification_time_ms === undefined) {
        throw new Error("Expected verification_time_ms in CircuitBenchmarkResponse deserialization");
    }
    if (o.peak_memory_bytes === undefined) {
        throw new Error("Expected peak_memory_bytes in CircuitBenchmarkResponse deserialization");
    }
    ;
    return {
        witnessGenerationTimeMs: o.witness_generation_time_ms,
        provingTimeMs: o.proving_time_ms,
        verificationTimeMs: o.verification_time_ms,
        peakMemoryBytes: o.peak_memory_bytes,
    };
}
function fromCircuitBenchmarkResponse(o) {
    if (o.witnessGenerationTimeMs === undefined) {
        throw new Error("Expected witnessGenerationTimeMs in CircuitBenchmarkResponse serialization");
    }
    if (o.provingTimeMs === undefined) {
        throw new Error("Expected provingTimeMs in CircuitBenchmarkResponse serialization");
    }
    if (o.verificationTimeMs === undefined) {
        throw new Error("Expected verificationTimeMs in CircuitBenchmarkResponse serialization");
    }
    if (o.peakMemoryBytes === undefined) {
        throw new Error("Expected peakMemoryBytes in CircuitBenchmarkResponse serialization");
    }
    ;
    return {
        witness_generation_time_ms: o.witnessGenerationTimeMs,
        proving_time_ms: o.provingTimeMs,
        verification_time_ms: o.verificationTimeMs,
        peak_memory_bytes: o.peakMemoryBytes,
    };
}
function toClientIvcCheckPrecomputedVkResponse(o) {
    if (o.valid === undefined) {
        throw new Error("Expected valid in ClientIvcCheckPrecomputedVkResponse deserialization");
    }
    ;
    return {
        valid: o.valid,
    };
}
function fromClientIvcCheckPrecomputedVkResponse(o) {
    if (o.valid === undefined) {
        throw new Error("Expected valid in ClientIvcCheckPrecomputedVkResponse serialization");
    }
    ;
    return {
        valid: o.valid,
    };
}
/**
 * Native API wrapper for bb binary using msgpack over stdin/stdout.
 * All methods return promises and handle length-encoded msgpack buffers.
 */
export class NativeApi {
    constructor(bbPath = "bb") {
        this.bbPath = bbPath;
        this.process = null;
        this.closed = false;
        this.pendingRequests = [];
        this.responseBuffer = Buffer.alloc(0);
    }
    /**
     * Initialize the bb process with msgpack run command
     */
    async init() {
        if (this.process) {
            throw new Error("NativeApi already initialized");
        }
        this.process = spawn(this.bbPath, ["msgpack", "run"], {
            stdio: ["pipe", "pipe", "pipe"],
        });
        // Handle process exit
        this.process.on("exit", (code, signal) => {
            this.closed = true;
            const error = new Error(`bb process exited with code ${code} and signal ${signal}`);
            // Reject all pending requests
            for (const { reject } of this.pendingRequests) {
                reject(error);
            }
            this.pendingRequests = [];
        });
        // Handle stderr
        this.process.stderr?.on("data", (data) => {
            console.error("bb stderr:", data.toString());
        });
        // Handle stdout responses
        this.process.stdout?.on("data", (data) => {
            this.responseBuffer = Buffer.concat([this.responseBuffer, data]);
            this.processResponses();
        });
        // Handle errors
        this.process.on("error", (error) => {
            this.closed = true;
            for (const { reject } of this.pendingRequests) {
                reject(error);
            }
            this.pendingRequests = [];
        });
    }
    /**
     * Process length-encoded responses from the buffer
     */
    processResponses() {
        while (this.responseBuffer.length >= 4) {
            // Read 4-byte length prefix (little-endian)
            const length = this.responseBuffer.readUInt32LE(0);
            if (this.responseBuffer.length < 4 + length) {
                // Not enough data yet
                break;
            }
            // Extract the msgpack response
            const responseData = this.responseBuffer.subarray(4, 4 + length);
            this.responseBuffer = this.responseBuffer.subarray(4 + length);
            // Decode the response
            try {
                const response = decode(responseData);
                // Resolve the oldest pending request (FIFO queue)
                const pending = this.pendingRequests.shift();
                if (pending) {
                    pending.resolve(response);
                }
            }
            catch (error) {
                console.error("Error decoding response:", error);
            }
        }
    }
    /**
     * Send a command to the bb process
     */
    async sendCommand(command) {
        if (this.closed || !this.process?.stdin) {
            throw new Error("NativeApi is not initialized or has been closed");
        }
        // Create placeholders that will error if called before being replaced
        let resolveFunc = () => { throw new Error("Response not yet received"); };
        let rejectFunc = () => { throw new Error("Response not yet received"); };
        // Create the promise and immediately push to queue
        const promise = new Promise((resolve, reject) => {
            resolveFunc = resolve;
            rejectFunc = reject;
        });
        // Push to queue with the actual resolve/reject functions
        this.pendingRequests.push({ resolve: resolveFunc, reject: rejectFunc });
        // Encode the command
        const encoder = new Encoder({ useRecords: false });
        const buffer = encoder.encode(command);
        // Write length-encoded buffer
        const lengthBuffer = Buffer.allocUnsafe(4);
        lengthBuffer.writeUInt32LE(buffer.length, 0);
        this.process.stdin.write(lengthBuffer);
        this.process.stdin.write(buffer);
        return promise;
    }
    /**
     * Close the bb process
     */
    async close() {
        if (this.process && !this.closed) {
            this.closed = true;
            this.process.kill();
            this.process = null;
        }
    }
    async circuitProve(command) {
        const msgpackCommand = fromCircuitProve(command);
        const [variantName, result] = await this.sendCommand(["CircuitProve", msgpackCommand]);
        if (variantName !== 'CircuitProveResponse') {
            throw new Error(`Expected variant name 'CircuitProveResponse' but got '${variantName}'`);
        }
        return toCircuitProveResponse(result);
    }
    async circuitComputeVk(command) {
        const msgpackCommand = fromCircuitComputeVk(command);
        const [variantName, result] = await this.sendCommand(["CircuitComputeVk", msgpackCommand]);
        if (variantName !== 'CircuitComputeVkResponse') {
            throw new Error(`Expected variant name 'CircuitComputeVkResponse' but got '${variantName}'`);
        }
        return toCircuitComputeVkResponse(result);
    }
    async circuitInfo(command) {
        const msgpackCommand = fromCircuitInfo(command);
        const [variantName, result] = await this.sendCommand(["CircuitInfo", msgpackCommand]);
        if (variantName !== 'CircuitInfoResponse') {
            throw new Error(`Expected variant name 'CircuitInfoResponse' but got '${variantName}'`);
        }
        return toCircuitInfoResponse(result);
    }
    async circuitCheck(command) {
        const msgpackCommand = fromCircuitCheck(command);
        const [variantName, result] = await this.sendCommand(["CircuitCheck", msgpackCommand]);
        if (variantName !== 'CircuitCheckResponse') {
            throw new Error(`Expected variant name 'CircuitCheckResponse' but got '${variantName}'`);
        }
        return toCircuitCheckResponse(result);
    }
    async circuitVerify(command) {
        const msgpackCommand = fromCircuitVerify(command);
        const [variantName, result] = await this.sendCommand(["CircuitVerify", msgpackCommand]);
        if (variantName !== 'CircuitVerifyResponse') {
            throw new Error(`Expected variant name 'CircuitVerifyResponse' but got '${variantName}'`);
        }
        return toCircuitVerifyResponse(result);
    }
    async clientIvcComputeStandaloneVk(command) {
        const msgpackCommand = fromClientIvcComputeStandaloneVk(command);
        const [variantName, result] = await this.sendCommand(["ClientIvcComputeStandaloneVk", msgpackCommand]);
        if (variantName !== 'ClientIvcComputeStandaloneVkResponse') {
            throw new Error(`Expected variant name 'ClientIvcComputeStandaloneVkResponse' but got '${variantName}'`);
        }
        return toClientIvcComputeStandaloneVkResponse(result);
    }
    async clientIvcComputeIvcVk(command) {
        const msgpackCommand = fromClientIvcComputeIvcVk(command);
        const [variantName, result] = await this.sendCommand(["ClientIvcComputeIvcVk", msgpackCommand]);
        if (variantName !== 'ClientIvcComputeIvcVkResponse') {
            throw new Error(`Expected variant name 'ClientIvcComputeIvcVkResponse' but got '${variantName}'`);
        }
        return toClientIvcComputeIvcVkResponse(result);
    }
    async clientIvcStart(command) {
        const msgpackCommand = fromClientIvcStart(command);
        const [variantName, result] = await this.sendCommand(["ClientIvcStart", msgpackCommand]);
        if (variantName !== 'ClientIvcStartResponse') {
            throw new Error(`Expected variant name 'ClientIvcStartResponse' but got '${variantName}'`);
        }
        return toClientIvcStartResponse(result);
    }
    async clientIvcLoad(command) {
        const msgpackCommand = fromClientIvcLoad(command);
        const [variantName, result] = await this.sendCommand(["ClientIvcLoad", msgpackCommand]);
        if (variantName !== 'ClientIvcLoadResponse') {
            throw new Error(`Expected variant name 'ClientIvcLoadResponse' but got '${variantName}'`);
        }
        return toClientIvcLoadResponse(result);
    }
    async clientIvcAccumulate(command) {
        const msgpackCommand = fromClientIvcAccumulate(command);
        const [variantName, result] = await this.sendCommand(["ClientIvcAccumulate", msgpackCommand]);
        if (variantName !== 'ClientIvcAccumulateResponse') {
            throw new Error(`Expected variant name 'ClientIvcAccumulateResponse' but got '${variantName}'`);
        }
        return toClientIvcAccumulateResponse(result);
    }
    async clientIvcProve(command) {
        const msgpackCommand = fromClientIvcProve(command);
        const [variantName, result] = await this.sendCommand(["ClientIvcProve", msgpackCommand]);
        if (variantName !== 'ClientIvcProveResponse') {
            throw new Error(`Expected variant name 'ClientIvcProveResponse' but got '${variantName}'`);
        }
        return toClientIvcProveResponse(result);
    }
    async proofAsFields(command) {
        const msgpackCommand = fromProofAsFields(command);
        const [variantName, result] = await this.sendCommand(["ProofAsFields", msgpackCommand]);
        if (variantName !== 'ProofAsFieldsResponse') {
            throw new Error(`Expected variant name 'ProofAsFieldsResponse' but got '${variantName}'`);
        }
        return toProofAsFieldsResponse(result);
    }
    async vkAsFields(command) {
        const msgpackCommand = fromVkAsFields(command);
        const [variantName, result] = await this.sendCommand(["VkAsFields", msgpackCommand]);
        if (variantName !== 'VkAsFieldsResponse') {
            throw new Error(`Expected variant name 'VkAsFieldsResponse' but got '${variantName}'`);
        }
        return toVkAsFieldsResponse(result);
    }
    async circuitWriteSolidityVerifier(command) {
        const msgpackCommand = fromCircuitWriteSolidityVerifier(command);
        const [variantName, result] = await this.sendCommand(["CircuitWriteSolidityVerifier", msgpackCommand]);
        if (variantName !== 'CircuitWriteSolidityVerifierResponse') {
            throw new Error(`Expected variant name 'CircuitWriteSolidityVerifierResponse' but got '${variantName}'`);
        }
        return toCircuitWriteSolidityVerifierResponse(result);
    }
    async circuitProveAndVerify(command) {
        const msgpackCommand = fromCircuitProveAndVerify(command);
        const [variantName, result] = await this.sendCommand(["CircuitProveAndVerify", msgpackCommand]);
        if (variantName !== 'CircuitProveAndVerifyResponse') {
            throw new Error(`Expected variant name 'CircuitProveAndVerifyResponse' but got '${variantName}'`);
        }
        return toCircuitProveAndVerifyResponse(result);
    }
    async circuitBenchmark(command) {
        const msgpackCommand = fromCircuitBenchmark(command);
        const [variantName, result] = await this.sendCommand(["CircuitBenchmark", msgpackCommand]);
        if (variantName !== 'CircuitBenchmarkResponse') {
            throw new Error(`Expected variant name 'CircuitBenchmarkResponse' but got '${variantName}'`);
        }
        return toCircuitBenchmarkResponse(result);
    }
    async clientIvcCheckPrecomputedVk(command) {
        const msgpackCommand = fromClientIvcCheckPrecomputedVk(command);
        const [variantName, result] = await this.sendCommand(["ClientIvcCheckPrecomputedVk", msgpackCommand]);
        if (variantName !== 'ClientIvcCheckPrecomputedVkResponse') {
            throw new Error(`Expected variant name 'ClientIvcCheckPrecomputedVkResponse' but got '${variantName}'`);
        }
        return toClientIvcCheckPrecomputedVkResponse(result);
    }
}
