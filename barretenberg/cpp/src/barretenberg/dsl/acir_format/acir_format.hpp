#pragma once
#include "aes128_constraint.hpp"
#include "barretenberg/common/slab_allocator.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "bigint_constraint.hpp"
#include "blake2s_constraint.hpp"
#include "blake3_constraint.hpp"
#include "block_constraint.hpp"
#include "ec_operations.hpp"
#include "ecdsa_secp256k1.hpp"
#include "ecdsa_secp256r1.hpp"
#include "keccak_constraint.hpp"
#include "logic_constraint.hpp"
#include "multi_scalar_mul.hpp"
#include "pedersen.hpp"
#include "poseidon2_constraint.hpp"
#include "range_constraint.hpp"
#include "recursion_constraint.hpp"
#include "schnorr_verify.hpp"
#include "sha256_constraint.hpp"
#include <utility>

namespace acir_format {

struct AcirFormat {
    // The number of witnesses in the circuit
    uint32_t varnum;
    // Specifies whether a prover that produces SNARK recursion friendly proofs should be used.
    // The proof produced when this flag is true should be friendly for recursive verification inside
    // of another SNARK. For example, a recursive friendly proof may use Blake3Pedersen for
    // hashing in its transcript, while we still want a prove that uses Keccak for its transcript in order
    // to be able to verify SNARKs on Ethereum.
    bool recursive;

    std::vector<uint32_t> public_inputs;

    std::vector<LogicConstraint> logic_constraints;
    std::vector<RangeConstraint> range_constraints;
    std::vector<AES128Constraint> aes128_constraints;
    std::vector<Sha256Constraint> sha256_constraints;
    std::vector<Sha256Compression> sha256_compression;
    std::vector<SchnorrConstraint> schnorr_constraints;
    std::vector<EcdsaSecp256k1Constraint> ecdsa_k1_constraints;
    std::vector<EcdsaSecp256r1Constraint> ecdsa_r1_constraints;
    std::vector<Blake2sConstraint> blake2s_constraints;
    std::vector<Blake3Constraint> blake3_constraints;
    std::vector<KeccakConstraint> keccak_constraints;
    std::vector<Keccakf1600> keccak_permutations;
    std::vector<PedersenConstraint> pedersen_constraints;
    std::vector<PedersenHashConstraint> pedersen_hash_constraints;
    std::vector<Poseidon2Constraint> poseidon2_constraints;
    std::vector<MultiScalarMul> multi_scalar_mul_constraints;
    std::vector<EcAdd> ec_add_constraints;
    std::vector<RecursionConstraint> recursion_constraints;
    std::vector<BigIntFromLeBytes> bigint_from_le_bytes_constraints;
    std::vector<BigIntToLeBytes> bigint_to_le_bytes_constraints;
    std::vector<BigIntOperation> bigint_operations;

    // A standard plonk arithmetic constraint, as defined in the poly_triple struct, consists of selector values
    // for q_M,q_L,q_R,q_O,q_C and indices of three variables taking the role of left, right and output wire
    // This could be a large vector so use slab allocator, we don't expect the blackbox implementations to be so large.
    std::vector<poly_triple_<curve::BN254::ScalarField>,
                ContainerSlabAllocator<poly_triple_<curve::BN254::ScalarField>>>
        poly_triple_constraints;
    std::vector<mul_quad_<curve::BN254::ScalarField>, ContainerSlabAllocator<mul_quad_<curve::BN254::ScalarField>>>
        quad_constraints;
    std::vector<BlockConstraint> block_constraints;

    // For serialization, update with any new fields
    MSGPACK_FIELDS(varnum,
                   public_inputs,
                   logic_constraints,
                   range_constraints,
                   aes128_constraints,
                   sha256_constraints,
                   sha256_compression,
                   schnorr_constraints,
                   ecdsa_k1_constraints,
                   ecdsa_r1_constraints,
                   blake2s_constraints,
                   blake3_constraints,
                   keccak_constraints,
                   keccak_permutations,
                   pedersen_constraints,
                   pedersen_hash_constraints,
                   poseidon2_constraints,
                   multi_scalar_mul_constraints,
                   ec_add_constraints,
                   recursion_constraints,
                   poly_triple_constraints,
                   block_constraints,
                   bigint_from_le_bytes_constraints,
                   bigint_to_le_bytes_constraints,
                   bigint_operations);

    friend bool operator==(AcirFormat const& lhs, AcirFormat const& rhs) = default;
};

using WitnessVector = std::vector<fr, ContainerSlabAllocator<fr>>;
using WitnessVectorStack = std::vector<std::pair<uint32_t, WitnessVector>>;

template <typename Builder = UltraCircuitBuilder>
Builder create_circuit(const AcirFormat& constraint_system, size_t size_hint = 0, WitnessVector const& witness = {});

template <typename Builder>
void build_constraints(Builder& builder, AcirFormat const& constraint_system, bool has_valid_witness_assignments);

} // namespace acir_format
