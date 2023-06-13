#pragma once
#include "barretenberg/common/slab_allocator.hpp"
#include "logic_constraint.hpp"
#include "range_constraint.hpp"
#include "sha256_constraint.hpp"
#include "blake2s_constraint.hpp"
#include "keccak_constraint.hpp"
#include "fixed_base_scalar_mul.hpp"
#include "schnorr_verify.hpp"
#include "ecdsa_secp256k1.hpp"
#include "recursion_constraint.hpp"
#include "block_constraint.hpp"
#include "pedersen.hpp"
#include "hash_to_field.hpp"
#include "barretenberg/dsl/types.hpp"
#include "barretenberg/stdlib/primitives/composers/composers_fwd.hpp"

namespace acir_format {

struct acir_format {
    // The number of witnesses in the circuit
    uint32_t varnum;

    std::vector<uint32_t> public_inputs;

    std::vector<FixedBaseScalarMul> fixed_base_scalar_mul_constraints;
    std::vector<LogicConstraint> logic_constraints;
    std::vector<RangeConstraint> range_constraints;
    std::vector<SchnorrConstraint> schnorr_constraints;
    std::vector<EcdsaSecp256k1Constraint> ecdsa_constraints;
    std::vector<Sha256Constraint> sha256_constraints;
    std::vector<Blake2sConstraint> blake2s_constraints;
    std::vector<KeccakConstraint> keccak_constraints;
    std::vector<KeccakVarConstraint> keccak_var_constraints;
    std::vector<HashToFieldConstraint> hash_to_field_constraints;
    std::vector<PedersenConstraint> pedersen_constraints;
    std::vector<BlockConstraint> block_constraints;
    std::vector<RecursionConstraint> recursion_constraints;
    // A standard plonk arithmetic constraint, as defined in the poly_triple struct, consists of selector values
    // for q_M,q_L,q_R,q_O,q_C and indices of three variables taking the role of left, right and output wire
    // This could be a large vector so use slab allocator, we don't expect the blackbox implementations to be so large.
    std::vector<poly_triple, ContainerSlabAllocator<poly_triple>> constraints;

    friend bool operator==(acir_format const& lhs, acir_format const& rhs) = default;
};

using WitnessVector = std::vector<fr, ContainerSlabAllocator<fr>>;

void read_witness(Composer& composer, std::vector<barretenberg::fr> const& witness);

void create_circuit(Composer& composer, const acir_format& constraint_system);

Composer create_circuit(const acir_format& constraint_system,
                        std::shared_ptr<barretenberg::srs::factories::CrsFactory> const& crs_factory,
                        size_t size_hint = 0);

Composer create_circuit_with_witness(const acir_format& constraint_system,
                                     WitnessVector const& witness,
                                     std::shared_ptr<barretenberg::srs::factories::CrsFactory> const& crs_factory,
                                     size_t size_hint = 0);

Composer create_circuit_with_witness(const acir_format& constraint_system, WitnessVector const& witness);

void create_circuit_with_witness(Composer& composer,
                                 const acir_format& constraint_system,
                                 WitnessVector const& witness);

// Serialisation
template <typename B> inline void read(B& buf, acir_format& data)
{
    using serialize::read;
    read(buf, data.varnum);
    read(buf, data.public_inputs);
    read(buf, data.logic_constraints);
    read(buf, data.range_constraints);
    read(buf, data.sha256_constraints);
    read(buf, data.schnorr_constraints);
    read(buf, data.ecdsa_constraints);
    read(buf, data.blake2s_constraints);
    read(buf, data.keccak_constraints);
    read(buf, data.keccak_var_constraints);
    read(buf, data.pedersen_constraints);
    read(buf, data.hash_to_field_constraints);
    read(buf, data.fixed_base_scalar_mul_constraints);
    read(buf, data.recursion_constraints);
    read(buf, data.constraints);
    read(buf, data.block_constraints);
}

template <typename B> inline void write(B& buf, acir_format const& data)
{
    using serialize::write;
    write(buf, data.varnum);
    write(buf, data.public_inputs);
    write(buf, data.logic_constraints);
    write(buf, data.range_constraints);
    write(buf, data.sha256_constraints);
    write(buf, data.schnorr_constraints);
    write(buf, data.ecdsa_constraints);
    write(buf, data.blake2s_constraints);
    write(buf, data.keccak_constraints);
    write(buf, data.keccak_var_constraints);
    write(buf, data.pedersen_constraints);
    write(buf, data.hash_to_field_constraints);
    write(buf, data.fixed_base_scalar_mul_constraints);
    write(buf, data.recursion_constraints);
    write(buf, data.constraints);
    write(buf, data.block_constraints);
}

} // namespace acir_format
