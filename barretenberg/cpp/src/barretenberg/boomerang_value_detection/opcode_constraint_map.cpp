#include "./opcode_constraint_map.hpp"

using namespace acir_format;
namespace cdg {

OpcodeConstraintMap build_opcode_type_map(const AcirFormat& constraint_system)
{
    OpcodeConstraintMap opcode_constraint_map;
    const auto& indices = constraint_system.original_opcode_indices;

    for (size_t i = 0; i < indices.logic_constraints.size(); i++) {
        size_t opcode_idx = indices.logic_constraints[i];
        opcode_constraint_map[opcode_idx] = { AcirConstraintType::LOGIC, &constraint_system.logic_constraints[i] };
    }

    for (size_t i = 0; i < indices.range_constraints.size(); i++) {
        size_t opcode_idx = indices.range_constraints[i];
        opcode_constraint_map[opcode_idx] = { AcirConstraintType::RANGE, &constraint_system.range_constraints[i] };
    }

    for (size_t i = 0; i < indices.aes128_constraints.size(); i++) {
        size_t opcode_idx = indices.aes128_constraints[i];
        opcode_constraint_map[opcode_idx] = { AcirConstraintType::AES128, &constraint_system.aes128_constraints[i] };
    }

    for (size_t i = 0; i < indices.sha256_compression.size(); i++) {
        size_t opcode_idx = indices.sha256_compression[i];
        opcode_constraint_map[opcode_idx] = { AcirConstraintType::SHA256_COMPRESSION,
                                              &constraint_system.sha256_compression[i] };
    }

    for (size_t i = 0; i < indices.ecdsa_k1_constraints.size(); i++) {
        size_t opcode_idx = indices.ecdsa_k1_constraints[i];
        opcode_constraint_map[opcode_idx] = { AcirConstraintType::ECDSA_K1,
                                              &constraint_system.ecdsa_k1_constraints[i] };
    }

    for (size_t i = 0; i < indices.ecdsa_r1_constraints.size(); i++) {
        size_t opcode_idx = indices.ecdsa_r1_constraints[i];
        opcode_constraint_map[opcode_idx] = { AcirConstraintType::ECDSA_R1,
                                              &constraint_system.ecdsa_r1_constraints[i] };
    }

    for (size_t i = 0; i < indices.blake2s_constraints.size(); i++) {
        size_t opcode_idx = indices.blake2s_constraints[i];
        opcode_constraint_map[opcode_idx] = { AcirConstraintType::BLAKE2S, &constraint_system.blake2s_constraints[i] };
    }

    for (size_t i = 0; i < indices.blake3_constraints.size(); i++) {
        size_t opcode_idx = indices.blake3_constraints[i];
        opcode_constraint_map[opcode_idx] = { AcirConstraintType::BLAKE3, &constraint_system.blake3_constraints[i] };
    }

    for (size_t i = 0; i < indices.keccak_permutations.size(); i++) {
        size_t opcode_idx = indices.keccak_permutations[i];
        opcode_constraint_map[opcode_idx] = { AcirConstraintType::KECCAK_PERMUTATION,
                                              &constraint_system.keccak_permutations[i] };
    }

    for (size_t i = 0; i < indices.poseidon2_constraints.size(); i++) {
        size_t opcode_idx = indices.poseidon2_constraints[i];
        opcode_constraint_map[opcode_idx] = { AcirConstraintType::POSEIDON2,
                                              &constraint_system.poseidon2_constraints[i] };
    }

    for (size_t i = 0; i < indices.multi_scalar_mul_constraints.size(); i++) {
        size_t opcode_idx = indices.multi_scalar_mul_constraints[i];
        opcode_constraint_map[opcode_idx] = { AcirConstraintType::MULTI_SCALAR_MUL,
                                              &constraint_system.multi_scalar_mul_constraints[i] };
    }

    for (size_t i = 0; i < indices.ec_add_constraints.size(); i++) {
        size_t opcode_idx = indices.ec_add_constraints[i];
        opcode_constraint_map[opcode_idx] = { AcirConstraintType::EC_ADD, &constraint_system.ec_add_constraints[i] };
    }

    for (size_t i = 0; i < indices.honk_recursion_constraints.size(); i++) {
        size_t opcode_idx = indices.honk_recursion_constraints[i];
        opcode_constraint_map[opcode_idx] = { AcirConstraintType::HONK_RECURSION,
                                              &constraint_system.honk_recursion_constraints[i] };
    }

    for (size_t i = 0; i < indices.avm_recursion_constraints.size(); i++) {
        size_t opcode_idx = indices.avm_recursion_constraints[i];
        opcode_constraint_map[opcode_idx] = { AcirConstraintType::AVM_RECURSION,
                                              &constraint_system.avm_recursion_constraints[i] };
    }

    for (size_t i = 0; i < indices.hn_recursion_constraints.size(); i++) {
        size_t opcode_idx = indices.hn_recursion_constraints[i];
        opcode_constraint_map[opcode_idx] = { AcirConstraintType::HN_RECURSION,
                                              &constraint_system.hn_recursion_constraints[i] };
    }

    for (size_t i = 0; i < indices.chonk_recursion_constraints.size(); i++) {
        size_t opcode_idx = indices.chonk_recursion_constraints[i];
        opcode_constraint_map[opcode_idx] = { AcirConstraintType::CHONK_RECURSION,
                                              &constraint_system.chonk_recursion_constraints[i] };
    }

    for (size_t i = 0; i < indices.quad_constraints.size(); i++) {
        size_t opcode_idx = indices.quad_constraints[i];
        opcode_constraint_map[opcode_idx] = { AcirConstraintType::QUAD, &constraint_system.quad_constraints[i] };
    }

    for (size_t i = 2; i < indices.block_constraints.size(); i++) {
        if (!indices.block_constraints[i].empty()) {
            size_t opcode_idx = indices.block_constraints[i][0];
            opcode_constraint_map[opcode_idx] = { AcirConstraintType::BLOCK, &constraint_system.block_constraints[i] };
        }
    }

    return opcode_constraint_map;
}

} //namespace cdg
