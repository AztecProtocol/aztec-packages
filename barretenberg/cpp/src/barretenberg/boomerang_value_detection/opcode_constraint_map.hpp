#pragma once
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include <variant>
#include <map>

using namespace acir_format;
namespace cdg {
/**
 * @brief Enum representing ACIR opcode/constraint types
 */
enum class AcirConstraintType {
    LOGIC,
    RANGE,
    AES128,
    SHA256_COMPRESSION,
    ECDSA_K1,
    ECDSA_R1,
    BLAKE2S,
    BLAKE3,
    KECCAK_PERMUTATION,
    POSEIDON2,
    MULTI_SCALAR_MUL,
    EC_ADD,
    HONK_RECURSION,
    AVM_RECURSION,
    HN_RECURSION,
    CHONK_RECURSION,
    QUAD,
    BLOCK,
};

/**
 * @brief Variant type that can hold a pointer to any constraint type in AcirFormat
 */
using ConstraintPtr = std::variant<const LogicConstraint*,
                                   const RangeConstraint*,
                                   const AES128Constraint*,
                                   const Sha256Compression*,
                                   const EcdsaConstraint*,
                                   const Blake2sConstraint*,
                                   const Blake3Constraint*,
                                   const Keccakf1600*,
                                   const Poseidon2Constraint*,
                                   const MultiScalarMul*,
                                   const EcAdd*,
                                   const RecursionConstraint*,
                                   const BlockConstraint*,
                                   const bb::mul_quad_<bb::fr>*>;

/**
 * @brief Holds constraint type, pointer, and processing status for easy access
 */
struct ConstraintInfo {
    AcirConstraintType type;
    ConstraintPtr ptr;
    bool processed_correctly = false; // Tracks whether this constraint was validated successfully
};

using OpcodeConstraintMap = std::map<size_t, ConstraintInfo>;
/**
 * @brief Build a reverse mapping from opcode index to constraint info
 * @param constraint_system The ACIR constraint system to build the map from
 * @return Map where key is original ACIR opcode index, value contains type and pointer to constraint
 */
OpcodeConstraintMap build_opcode_type_map(const acir_format::AcirFormat& constraint_system);

} //namespace cdg
