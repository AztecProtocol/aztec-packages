// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "aes128_constraint.hpp"
#include "avm2_recursion_constraint.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"

#include "arithmetic_constraints.hpp"
#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "blake2s_constraint.hpp"
#include "blake3_constraint.hpp"
#include "block_constraint.hpp"
#include "chonk_recursion_constraints.hpp"
#include "ec_operations.hpp"
#include "ecdsa_constraints.hpp"
#include "honk_recursion_constraint.hpp"
#include "hypernova_recursion_constraint.hpp"
#include "keccak_constraint.hpp"
#include "logic_constraint.hpp"
#include "multi_scalar_mul.hpp"
#include "poseidon2_constraint.hpp"
#include "range_constraint.hpp"
#include "recursion_constraint.hpp"
#include "sha256_constraint.hpp"
#include <cstdint>
#include <utility>
#include <vector>

namespace acir_format {

using WitnessVector = std::vector<bb::fr>;

/**
 * @brief Indices of the original opcode that originated each constraint in AcirFormat.
 * @details Contains one array of indices per opcode type. The length of each array is equal to the number of
 * constraints of that type. The relationship between the opcodes and constraints is assumed to be one to one, except
 * for block constraints.
 */
struct AcirFormatOriginalOpcodeIndices {
    std::vector<size_t> logic_constraints;
    std::vector<size_t> range_constraints;
    std::vector<size_t> aes128_constraints;
    std::vector<size_t> sha256_compression;
    std::vector<size_t> ecdsa_k1_constraints;
    std::vector<size_t> ecdsa_r1_constraints;
    std::vector<size_t> blake2s_constraints;
    std::vector<size_t> blake3_constraints;
    std::vector<size_t> keccak_permutations;
    std::vector<size_t> poseidon2_constraints;
    std::vector<size_t> multi_scalar_mul_constraints;
    std::vector<size_t> ec_add_constraints;
    std::vector<size_t> honk_recursion_constraints;
    std::vector<size_t> avm_recursion_constraints;
    std::vector<size_t> hn_recursion_constraints;
    std::vector<size_t> chonk_recursion_constraints;
    std::vector<size_t> quad_constraints;
    std::vector<size_t> big_quad_constraints;
    // Multiple opcode indices per block:
    std::vector<std::vector<size_t>> block_constraints;

    friend bool operator==(AcirFormatOriginalOpcodeIndices const& lhs,
                           AcirFormatOriginalOpcodeIndices const& rhs) = default;
};

/**
 * @brief Barretenberg's representation of ACIR constraints
 *
 * @details ACIR constraints are deserialized from bytes and stored in this format before being passed to the function
 * create_circuit, which constructs a circuit out of the constraints. An AcirFormat instance records all the constraints
 * that have to be added, plus some metadata:
 * 1. the maximum witness index (used in write_vk situations to fill the circuit with dummy variables)
 * 2. the number of original acir opcodes
 * 3. the indices of the public inputs
 * 4. the number of gates added to the circuit by each opcode (if calculated)
 * 5. the original indices of the opcodes (recording the order in which the opcodes were added to the struct)
 *
 */
struct AcirFormat {
    uint32_t max_witness_index = 0;
    uint32_t num_acir_opcodes;

    std::vector<uint32_t> public_inputs;

    std::vector<LogicConstraint> logic_constraints;
    std::vector<RangeConstraint> range_constraints;
    std::vector<AES128Constraint> aes128_constraints;
    std::vector<Sha256Compression> sha256_compression;
    std::vector<EcdsaConstraint> ecdsa_k1_constraints;
    std::vector<EcdsaConstraint> ecdsa_r1_constraints;
    std::vector<Blake2sConstraint> blake2s_constraints;
    std::vector<Blake3Constraint> blake3_constraints;
    std::vector<Keccakf1600> keccak_permutations;
    std::vector<Poseidon2Constraint> poseidon2_constraints;
    std::vector<MultiScalarMul> multi_scalar_mul_constraints;
    std::vector<EcAdd> ec_add_constraints;
    std::vector<RecursionConstraint> honk_recursion_constraints;
    std::vector<RecursionConstraint> avm_recursion_constraints;
    std::vector<RecursionConstraint> hn_recursion_constraints;
    std::vector<RecursionConstraint> chonk_recursion_constraints;
    std::vector<QuadConstraint> quad_constraints;
    std::vector<BigQuadConstraint> big_quad_constraints;
    std::vector<BlockConstraint> block_constraints;

    // Number of gates added to the circuit per original opcode.
    // Has length equal to num_acir_opcodes.
    std::vector<size_t> gates_per_opcode;

    // Indices of the original opcode that originated each constraint in AcirFormat.
    AcirFormatOriginalOpcodeIndices original_opcode_indices;

    // For serialization, update with any new fields
    MSGPACK_FIELDS(public_inputs,
                   logic_constraints,
                   range_constraints,
                   aes128_constraints,
                   sha256_compression,
                   ecdsa_k1_constraints,
                   ecdsa_r1_constraints,
                   blake2s_constraints,
                   blake3_constraints,
                   keccak_permutations,
                   poseidon2_constraints,
                   multi_scalar_mul_constraints,
                   ec_add_constraints,
                   honk_recursion_constraints,
                   avm_recursion_constraints,
                   hn_recursion_constraints,
                   chonk_recursion_constraints,
                   quad_constraints,
                   big_quad_constraints,
                   block_constraints);

    friend bool operator==(AcirFormat const& lhs, AcirFormat const& rhs) = default;
};

/**
 * @brief Struct containing both the constraints to be added to the circuit and the witness vector
 *
 */
struct AcirProgram {
    AcirFormat constraints;
    WitnessVector witness;
};

/**
 * @brief Metadata required to create a circuit
 *
 * @details The metadata is required for three reasons:
 * 1. When we add constraints to kernels, we need an IVC instance. The metadata contains a pointer to such
 *    instance.
 * 2. When we add constraints to rollup circuits, we need to know whether the circuit should propagate an IPA claim or
 *    recursively verify it. The boolean has_ipa_claim specifies what the circuit should do with an IPA claim.
 * 3. If we wish to collect the number of gates added by each opcode, we set collect_gates_per_opcode to true.
 */
struct ProgramMetadata {
    // An IVC instance; needed to construct a circuit from IVC recursion constraints
    std::shared_ptr<bb::IVCBase> ivc = nullptr;

    bool has_ipa_claim =
        false; // Boolean describing whether the circuit should propagate an IPA claim or not. If `True`, the circuit
               // should propagate an IPA claim. In our codebase, circuits that propagate IPA claims are the ones whose
               // proof is constructed/verified using Rollup flavors.
    bool collect_gates_per_opcode = false;
};

/**
 * @brief Create a circuit out of an ACIR program and metadata
 *
 * @details This function instantiates the builder, adds the required witnesses to it, and then calls build_constraints
 * to add the required constraints to the builder.
 *
 */
template <typename Builder>
Builder create_circuit(AcirProgram& program, const ProgramMetadata& metadata = ProgramMetadata{});

/**
 * @brief Add to the builder the constraints contained in an AcirFormat instance
 *
 */
template <typename Builder>
void build_constraints(Builder& builder, AcirFormat& constraints, const ProgramMetadata& metadata);

} // namespace acir_format
