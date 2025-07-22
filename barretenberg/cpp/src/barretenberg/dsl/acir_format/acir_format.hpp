// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "aes128_constraint.hpp"

#ifndef DISABLE_AZTEC_VM
#include "avm2_recursion_constraint.hpp"
#endif

#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/common/slab_allocator.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "bigint_constraint.hpp"
#include "blake2s_constraint.hpp"
#include "blake3_constraint.hpp"
#include "block_constraint.hpp"
#include "ec_operations.hpp"
#include "ecdsa_secp256k1.hpp"
#include "ecdsa_secp256r1.hpp"
#include "honk_recursion_constraint.hpp"
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
    std::vector<size_t> ivc_recursion_constraints;
    std::vector<size_t> bigint_from_le_bytes_constraints;
    std::vector<size_t> bigint_to_le_bytes_constraints;
    std::vector<size_t> bigint_operations;
    std::vector<size_t> assert_equalities;
    std::vector<size_t> poly_triple_constraints;
    std::vector<size_t> quad_constraints;
    // Multiple opcode indices per block:
    std::vector<std::vector<size_t>> block_constraints;

    friend bool operator==(AcirFormatOriginalOpcodeIndices const& lhs,
                           AcirFormatOriginalOpcodeIndices const& rhs) = default;
};

struct AcirFormat {
    // The number of witnesses in the circuit
    uint32_t varnum;
    // Specifies whether a prover that produces SNARK recursion friendly proofs should be used.
    // The proof produced when this flag is true should be friendly for recursive verification inside
    // of another SNARK. For example, a recursive friendly proof may use Blake3Pedersen for
    // hashing in its transcript, while we still want a prove that uses Keccak for its transcript in order
    // to be able to verify SNARKs on Ethereum.

    uint32_t num_acir_opcodes;

    using PolyTripleConstraint = bb::poly_triple_<bb::curve::BN254::ScalarField>;
    std::vector<uint32_t> public_inputs;

    std::vector<LogicConstraint> logic_constraints;
    std::vector<RangeConstraint> range_constraints;
    std::vector<AES128Constraint> aes128_constraints;
    std::vector<Sha256Compression> sha256_compression;
    std::vector<EcdsaSecp256k1Constraint> ecdsa_k1_constraints;
    std::vector<EcdsaSecp256r1Constraint> ecdsa_r1_constraints;
    std::vector<Blake2sConstraint> blake2s_constraints;
    std::vector<Blake3Constraint> blake3_constraints;
    std::vector<Keccakf1600> keccak_permutations;
    std::vector<Poseidon2Constraint> poseidon2_constraints;
    std::vector<MultiScalarMul> multi_scalar_mul_constraints;
    std::vector<EcAdd> ec_add_constraints;
    std::vector<RecursionConstraint> honk_recursion_constraints;
    std::vector<RecursionConstraint> avm_recursion_constraints;
    std::vector<RecursionConstraint> ivc_recursion_constraints;
    std::vector<BigIntFromLeBytes> bigint_from_le_bytes_constraints;
    std::vector<BigIntToLeBytes> bigint_to_le_bytes_constraints;
    std::vector<BigIntOperation> bigint_operations;
    std::vector<bb::poly_triple_<bb::curve::BN254::ScalarField>> assert_equalities;

    // A standard plonk arithmetic constraint, as defined in the poly_triple struct, consists of selector values
    // for q_M,q_L,q_R,q_O,q_C and indices of three variables taking the role of left, right and output wire
    // This could be a large vector so use slab allocator, we don't expect the blackbox implementations to be so large.
    bb::SlabVector<PolyTripleConstraint> poly_triple_constraints;
    // A standard ultra plonk arithmetic constraint, of width 4: q_Ma*b+q_A*a+q_B*b+q_C*c+q_d*d+q_const = 0
    bb::SlabVector<bb::mul_quad_<bb::curve::BN254::ScalarField>> quad_constraints;
    // A vector of vector of mul_quad gates (i.e arithmetic constraints of width 4)
    // Each vector of gates represente a 'big' expression (a polynomial of degree 1 or 2 which does not fit inside one
    // mul_gate) that has been splitted into multiple mul_gates, using w4_omega (the 4th wire of the next gate), to
    // reduce the number of intermediate variables.
    bb::SlabVector<std::vector<bb::mul_quad_<bb::curve::BN254::ScalarField>>> big_quad_constraints;
    std::vector<BlockConstraint> block_constraints;

    // Number of gates added to the circuit per original opcode.
    // Has length equal to num_acir_opcodes.
    std::vector<size_t> gates_per_opcode = {};

    // Set of constrained witnesses
    std::set<uint32_t> constrained_witness = {};
    std::map<uint32_t, uint32_t> minimal_range = {};

    // Indices of the original opcode that originated each constraint in AcirFormat.
    AcirFormatOriginalOpcodeIndices original_opcode_indices;

    // For serialization, update with any new fields
    MSGPACK_FIELDS(varnum,
                   public_inputs,
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
                   ivc_recursion_constraints,
                   poly_triple_constraints,
                   quad_constraints,
                   big_quad_constraints,
                   block_constraints,
                   bigint_from_le_bytes_constraints,
                   bigint_to_le_bytes_constraints,
                   bigint_operations,
                   assert_equalities);

    friend bool operator==(AcirFormat const& lhs, AcirFormat const& rhs) = default;
};

using WitnessVector = bb::SlabVector<bb::fr>;
using WitnessVectorStack = std::vector<std::pair<uint32_t, WitnessVector>>;

struct AcirProgram {
    AcirFormat constraints;
    WitnessVector witness = {};
};

/**
 * @brief Storage for constaint_systems/witnesses for a stack of acir programs
 * @details In general the number of items in the witness stack will be equal or greater than the number of constraint
 * systems because the program may consist of multiple calls to the same function.
 *
 */
struct AcirProgramStack {
    std::vector<AcirFormat> constraint_systems;
    WitnessVectorStack witness_stack;

    AcirProgramStack(std::vector<AcirFormat> constraint_systems_in, WitnessVectorStack witness_stack_in)
        : constraint_systems(std::move(constraint_systems_in))
        , witness_stack(std::move(witness_stack_in))
    {}

    size_t size() const { return witness_stack.size(); }
    bool empty() const { return witness_stack.empty(); }

    AcirProgram back()
    {
        auto witness_stack_item = witness_stack.back();
        auto witness = witness_stack_item.second;
        auto constraint_system = constraint_systems[witness_stack_item.first];

        return { constraint_system, witness };
    }

    void pop_back() { witness_stack.pop_back(); }
};

struct ProgramMetadata {

    // An IVC instance; needed to construct a circuit from IVC recursion constraints
    std::shared_ptr<ClientIVC> ivc = nullptr;

    bool recursive = false; // Specifies whether a prover that produces SNARK recursion friendly proofs should be used.
                            // The proof produced when this flag is true should be friendly for recursive verification
                            // inside of another SNARK. For example, a recursive friendly proof may use Blake3Pedersen
                            // for hashing in its transcript, while we still want a prove that uses Keccak for its
                            // transcript in order to be able to verify SNARKs on Ethereum.
    uint32_t honk_recursion = 0; // honk_recursion means we will honk to recursively verify this
                                 // circuit. This distinction is needed to not add the default
                                 // aggregation object when we're not using the honk RV.
                                 // 0 means we are not proving with honk
                                 // 1 means we are using the UltraHonk flavor
                                 // 2 means we are using the UltraRollupHonk flavor
    bool collect_gates_per_opcode = false;
    size_t size_hint = 0;
};

// TODO(https://github.com/AztecProtocol/barretenberg/issues/1161) Refactor this function
template <typename Builder = bb::UltraCircuitBuilder>
Builder create_circuit(AcirProgram& program, const ProgramMetadata& metadata = ProgramMetadata{});

template <typename Builder>
void build_constraints(Builder& builder, AcirProgram& program, const ProgramMetadata& metadata);

/**
 * @brief Utility class for tracking the gate count of acir constraints
 *
 */
template <typename Builder> class GateCounter {
  public:
    GateCounter(Builder* builder, bool collect_gates_per_opcode)
        : builder(builder)
        , collect_gates_per_opcode(collect_gates_per_opcode)
    {}

    size_t compute_diff()
    {
        if (!collect_gates_per_opcode) {
            return 0;
        }
        size_t new_gate_count = builder->get_estimated_num_finalized_gates();
        size_t diff = new_gate_count - prev_gate_count;
        prev_gate_count = new_gate_count;
        return diff;
    }

    void track_diff(std::vector<size_t>& gates_per_opcode, size_t opcode_index)
    {
        if (collect_gates_per_opcode) {
            gates_per_opcode[opcode_index] = compute_diff();
        }
    }

  private:
    Builder* builder;
    bool collect_gates_per_opcode;
    size_t prev_gate_count{};
};

} // namespace acir_format
