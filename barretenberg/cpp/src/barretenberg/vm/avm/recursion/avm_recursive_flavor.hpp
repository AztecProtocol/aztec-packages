// Notes:
// We want the recursive verifier for this proof to be an ultra honk type proof
// that will be aggregated in the rolup circuits
//
// We also want noir to be able to absorb these proofs

#pragma once
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/flavor_macros.hpp"
// TODO(md): uni or multivariate polynomials required?
// #include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/stdlib/honk_recursion/transcript/transcript.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

// Include relation files
#include "barretenberg/relations/generated/avm/alu.hpp"
#include "barretenberg/relations/generated/avm/binary.hpp"
#include "barretenberg/relations/generated/avm/conversion.hpp"
#include "barretenberg/relations/generated/avm/gas.hpp"
#include "barretenberg/relations/generated/avm/incl_main_tag_err.hpp"
#include "barretenberg/relations/generated/avm/incl_mem_tag_err.hpp"
#include "barretenberg/relations/generated/avm/keccakf1600.hpp"
#include "barretenberg/relations/generated/avm/kernel.hpp"
#include "barretenberg/relations/generated/avm/kernel_output_lookup.hpp"
#include "barretenberg/relations/generated/avm/lookup_byte_lengths.hpp"
#include "barretenberg/relations/generated/avm/lookup_byte_operations.hpp"
#include "barretenberg/relations/generated/avm/lookup_div_u16_0.hpp"
#include "barretenberg/relations/generated/avm/lookup_div_u16_1.hpp"
#include "barretenberg/relations/generated/avm/lookup_div_u16_2.hpp"
#include "barretenberg/relations/generated/avm/lookup_div_u16_3.hpp"
#include "barretenberg/relations/generated/avm/lookup_div_u16_4.hpp"
#include "barretenberg/relations/generated/avm/lookup_div_u16_5.hpp"
#include "barretenberg/relations/generated/avm/lookup_div_u16_6.hpp"
#include "barretenberg/relations/generated/avm/lookup_div_u16_7.hpp"
#include "barretenberg/relations/generated/avm/lookup_into_kernel.hpp"
#include "barretenberg/relations/generated/avm/lookup_mem_rng_chk_hi.hpp"
#include "barretenberg/relations/generated/avm/lookup_mem_rng_chk_lo.hpp"
#include "barretenberg/relations/generated/avm/lookup_mem_rng_chk_mid.hpp"
#include "barretenberg/relations/generated/avm/lookup_opcode_gas.hpp"
#include "barretenberg/relations/generated/avm/lookup_pow_2_0.hpp"
#include "barretenberg/relations/generated/avm/lookup_pow_2_1.hpp"
#include "barretenberg/relations/generated/avm/lookup_u16_0.hpp"
#include "barretenberg/relations/generated/avm/lookup_u16_1.hpp"
#include "barretenberg/relations/generated/avm/lookup_u16_10.hpp"
#include "barretenberg/relations/generated/avm/lookup_u16_11.hpp"
#include "barretenberg/relations/generated/avm/lookup_u16_12.hpp"
#include "barretenberg/relations/generated/avm/lookup_u16_13.hpp"
#include "barretenberg/relations/generated/avm/lookup_u16_14.hpp"
#include "barretenberg/relations/generated/avm/lookup_u16_2.hpp"
#include "barretenberg/relations/generated/avm/lookup_u16_3.hpp"
#include "barretenberg/relations/generated/avm/lookup_u16_4.hpp"
#include "barretenberg/relations/generated/avm/lookup_u16_5.hpp"
#include "barretenberg/relations/generated/avm/lookup_u16_6.hpp"
#include "barretenberg/relations/generated/avm/lookup_u16_7.hpp"
#include "barretenberg/relations/generated/avm/lookup_u16_8.hpp"
#include "barretenberg/relations/generated/avm/lookup_u16_9.hpp"
#include "barretenberg/relations/generated/avm/lookup_u8_0.hpp"
#include "barretenberg/relations/generated/avm/lookup_u8_1.hpp"
#include "barretenberg/relations/generated/avm/main.hpp"
#include "barretenberg/relations/generated/avm/mem.hpp"
#include "barretenberg/relations/generated/avm/pedersen.hpp"
#include "barretenberg/relations/generated/avm/perm_main_alu.hpp"
#include "barretenberg/relations/generated/avm/perm_main_bin.hpp"
#include "barretenberg/relations/generated/avm/perm_main_conv.hpp"
#include "barretenberg/relations/generated/avm/perm_main_mem_a.hpp"
#include "barretenberg/relations/generated/avm/perm_main_mem_b.hpp"
#include "barretenberg/relations/generated/avm/perm_main_mem_c.hpp"
#include "barretenberg/relations/generated/avm/perm_main_mem_d.hpp"
#include "barretenberg/relations/generated/avm/perm_main_mem_ind_addr_a.hpp"
#include "barretenberg/relations/generated/avm/perm_main_mem_ind_addr_b.hpp"
#include "barretenberg/relations/generated/avm/perm_main_mem_ind_addr_c.hpp"
#include "barretenberg/relations/generated/avm/perm_main_mem_ind_addr_d.hpp"
#include "barretenberg/relations/generated/avm/perm_main_pedersen.hpp"
#include "barretenberg/relations/generated/avm/perm_main_pos2_perm.hpp"
#include "barretenberg/relations/generated/avm/poseidon2.hpp"
#include "barretenberg/relations/generated/avm/powers.hpp"
#include "barretenberg/relations/generated/avm/range_check_da_gas_hi.hpp"
#include "barretenberg/relations/generated/avm/range_check_da_gas_lo.hpp"
#include "barretenberg/relations/generated/avm/range_check_l2_gas_hi.hpp"
#include "barretenberg/relations/generated/avm/range_check_l2_gas_lo.hpp"
#include "barretenberg/relations/generated/avm/sha256.hpp"

#include "barretenberg/vm/generated/avm_flavor.hpp"

#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/polynomials/barycentric.hpp"
#include "barretenberg/polynomials/evaluation_domain.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/polynomials/univariate.hpp"

namespace bb {

template <typename BuilderType> class AvmRecursiveFlavor_ {

  public:
    // much of the types end up being the same but derived from the circuit builer types
    using CircuitBuilder = BuilderType;
    using Curve = stdlib::bn254<CircuitBuilder>;
    using PCS = KZG<Curve>;
    using GroupElement = typename Curve::Element;
    using Commitment = typename Curve::AffineElement;
    using FF = typename Curve::ScalarField;
    using BF = typename Curve::BaseField;

    using NativeFlavor = AvmFlavor;
    using NativeVerificationKey = typename NativeFlavor::VerificationKey;

    using VerifierCommitmentKey = bb::VerifierCommitmentKey<NativeFlavor::Curve>;

    using Relations = AvmFlavor::Relations_<FF>;

    static constexpr size_t NUM_WIRES = NativeFlavor::NUM_WIRES;
    static constexpr size_t NUM_ALL_ENTITIES = NativeFlavor::NUM_ALL_ENTITIES;
    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = NativeFlavor::NUM_PRECOMPUTED_ENTITIES;
    static constexpr size_t NUM_WITNESS_ENTITIES = NativeFlavor::NUM_WITNESS_ENTITIES;

    // TODO(md): can be inherited?
    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();
    static constexpr size_t MAX_TOTAL_RELATION_LENGTH = compute_max_total_relation_length<Relations>();

    // TODO(md): need?
    // BATCHED_RELATION_PARTIAL_LENGTH = algebraic degree of sumcheck relation *after* multiplying by the `pow_zeta`
    // random polynomial e.g. For \sum(x) [A(x) * B(x) + C(x)] * PowZeta(X), relation length = 2 and random relation
    // length = 3
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 1;
    static constexpr size_t BATCHED_RELATION_TOTAL_LENGTH = MAX_TOTAL_RELATION_LENGTH + 1;
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;

    // static constexpr size_t NUM_SUBRELATIONS = compute_number_of_subrelations<Relations>();
    using RelationSeparator = FF;

    // TODO(md): inherited?
    // define the containers for storing the contributions from each relation in Sumcheck
    using TupleOfArraysOfValues = decltype(create_tuple_of_arrays_of_values<Relations>());

    /**
     * @brief A field element for each entity of the flavor.  These entities represent the prover polynomials
     * evaluated at one point.
     */
    class AllValues : public AvmFlavor::AllEntities<FF> {
      public:
        using Base = AvmFlavor::AllEntities<FF>;
        using Base::Base;
    };

    class VerificationKey : public VerificationKey_<AvmFlavor::PrecomputedEntities<Commitment>, VerifierCommitmentKey> {
      public:
        VerificationKey(const size_t circuit_size, const size_t num_public_inputs)
        {
            this->circuit_size = circuit_size;
            this->log_circuit_size = numeric::get_msb(circuit_size);
            this->num_public_inputs = num_public_inputs;
        }

        VerificationKey(CircuitBuilder* builder, const std::shared_ptr<NativeVerificationKey>& native_key)
        {
            this->pcs_verification_key = native_key->pcs_verification_key;
            this->circuit_size = native_key->circuit_size;
            this->log_circuit_size = numeric::get_msb(this->circuit_size);
            // this->num_public_inputs = native_key->num_public_inputs;
            // this->pub_inputs_offset = native_key->pub_inputs_offset;

            for (auto [native_comm, comm] : zip_view(native_key->get_all(), this->get_all())) {
                comm = Commitment::from_witness(builder, native_comm);
            }
        }
    };

    using WitnessCommitments = AvmFlavor::WitnessEntities<Commitment>;
    using CommitmentLabels = AvmFlavor::CommitmentLabels;
    // Note(md): template types differ here
    using VerifierCommitments = AvmFlavor::VerifierCommitments_<Commitment, VerificationKey>;
    using Transcript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<CircuitBuilder>>;
};

} // namespace bb