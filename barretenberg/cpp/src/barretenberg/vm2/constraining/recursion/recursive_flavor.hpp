#pragma once

#include <cstdint>

#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/stdlib/transcript/transcript.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/vm2/constraining/flavor.hpp"

namespace bb::avm2 {

template <typename BuilderType> class AvmRecursiveFlavor_ {
  public:
    using CircuitBuilder = BuilderType;
    using Curve = stdlib::bn254<CircuitBuilder>;
    using PCS = KZG<Curve>;
    using GroupElement = typename Curve::Element;
    using Commitment = typename Curve::AffineElement;
    using FF = typename Curve::ScalarField;
    using BF = typename Curve::BaseField;

    using NativeFlavor = avm2::AvmFlavor;
    using NativeVerificationKey = NativeFlavor::VerificationKey;

    // Native one is used!
    using VerifierCommitmentKey = NativeFlavor::VerifierCommitmentKey;

    using Relations = NativeFlavor::Relations_<FF>;

    // indicates when evaluating sumcheck, edges must be extended to be MAX_TOTAL_RELATION_LENGTH
    static constexpr bool USE_SHORT_MONOMIALS = NativeFlavor::USE_SHORT_MONOMIALS;

    static constexpr size_t NUM_WIRES = NativeFlavor::NUM_WIRES;
    static constexpr size_t NUM_ALL_ENTITIES = NativeFlavor::NUM_ALL_ENTITIES;
    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = NativeFlavor::NUM_PRECOMPUTED_ENTITIES;
    static constexpr size_t NUM_WITNESS_ENTITIES = NativeFlavor::NUM_WITNESS_ENTITIES;

    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = NativeFlavor::BATCHED_RELATION_PARTIAL_LENGTH;
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;

    static constexpr size_t NUM_SUBRELATIONS = compute_number_of_subrelations<Relations>();

    using RelationSeparator = std::array<FF, NUM_SUBRELATIONS>;

    // This flavor would not be used with ZK Sumcheck
    static constexpr bool HasZK = false;

    // To achieve fixed proof size and that the recursive verifier circuit is constant, we are using padding in Sumcheck
    // and Shplemini
    static constexpr bool USE_PADDING = true;

    // define the containers for storing the contributions from each relation in Sumcheck
    using TupleOfArraysOfValues = decltype(create_tuple_of_arrays_of_values<Relations>());

    /**
     * @brief A field element for each entity of the flavor. These entities represent the prover polynomials
     * evaluated at one point.
     */
    class AllValues : public NativeFlavor::AllEntities<FF> {
      public:
        using Base = NativeFlavor::AllEntities<FF>;
        using Base::Base;
    };

    class VerificationKey : public StdlibVerificationKey_<BuilderType, NativeFlavor::PrecomputedEntities<Commitment>> {
      public:
        VerificationKey(CircuitBuilder* builder, const std::shared_ptr<NativeVerificationKey>& native_key)
        {
            this->circuit_size = FF::from_witness(builder, native_key->circuit_size);
            this->log_circuit_size = FF::from_witness(builder, numeric::get_msb(native_key->circuit_size));
            this->num_public_inputs = FF::from_witness(builder, native_key->num_public_inputs);

            for (auto [native_comm, comm] : zip_view(native_key->get_all(), this->get_all())) {
                comm = Commitment::from_witness(builder, native_comm);
            }
        }

        /**
         * @brief Deserialize a verification key from a vector of field elements
         *
         * @param builder
         * @param elements
         */
        VerificationKey(CircuitBuilder& builder, std::span<const FF> elements)
        {
            size_t num_frs_read = 0;
            size_t num_frs_FF = stdlib::field_conversion::calc_num_bn254_frs<CircuitBuilder, FF>();
            size_t num_frs_Comm = stdlib::field_conversion::calc_num_bn254_frs<CircuitBuilder, Commitment>();

            this->circuit_size = uint64_t(stdlib::field_conversion::convert_from_bn254_frs<CircuitBuilder, FF>(
                                              builder, elements.subspan(num_frs_read, num_frs_FF))
                                              .get_value());
            num_frs_read += num_frs_FF;
            this->num_public_inputs = uint64_t(stdlib::field_conversion::convert_from_bn254_frs<CircuitBuilder, FF>(
                                                   builder, elements.subspan(num_frs_read, num_frs_FF))
                                                   .get_value());
            num_frs_read += num_frs_FF;

            for (Commitment& comm : this->get_all()) {
                comm = stdlib::field_conversion::convert_from_bn254_frs<CircuitBuilder, Commitment>(
                    builder, elements.subspan(num_frs_read, num_frs_Comm));
                num_frs_read += num_frs_Comm;
            }
        }
    };

    using WitnessCommitments = NativeFlavor::WitnessEntities<Commitment>;
    using VerifierCommitments = NativeFlavor::VerifierCommitments_<Commitment, VerificationKey>;
    using Transcript = BaseTranscript<stdlib::recursion::honk::StdlibTranscriptParams<CircuitBuilder>>;
};

} // namespace bb::avm2
