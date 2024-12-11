#pragma once
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/stdlib/transcript/transcript.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/vm/avm/generated/flavor.hpp"
#include <cstdint>

namespace bb {

template <typename BuilderType> class AvmRecursiveFlavor_ {
  public:
    using CircuitBuilder = BuilderType;
    using Curve = stdlib::bn254<CircuitBuilder>;
    using PCS = KZG<Curve>;
    using GroupElement = typename Curve::Element;
    using Commitment = typename Curve::AffineElement;
    using FF = typename Curve::ScalarField;
    using BF = typename Curve::BaseField;

    using NativeFlavor = bb::avm::AvmFlavor;
    using NativeVerificationKey = NativeFlavor::VerificationKey;

    // Native one is used!
    using VerifierCommitmentKey = NativeFlavor::VerifierCommitmentKey;

    using Relations = bb::avm::AvmFlavor::Relations_<FF>;

    static constexpr size_t NUM_WIRES = NativeFlavor::NUM_WIRES;
    static constexpr size_t NUM_ALL_ENTITIES = NativeFlavor::NUM_ALL_ENTITIES;
    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = NativeFlavor::NUM_PRECOMPUTED_ENTITIES;
    static constexpr size_t NUM_WITNESS_ENTITIES = NativeFlavor::NUM_WITNESS_ENTITIES;

    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = NativeFlavor::BATCHED_RELATION_PARTIAL_LENGTH;
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;

    using RelationSeparator = FF;

    // This flavor would not be used with ZK Sumcheck
    static constexpr bool HasZK = false;

    // define the containers for storing the contributions from each relation in Sumcheck
    using TupleOfArraysOfValues = decltype(create_tuple_of_arrays_of_values<Relations>());

    /**
     * @brief A field element for each entity of the flavor. These entities represent the prover polynomials
     * evaluated at one point.
     */
    class AllValues : public bb::avm::AvmFlavor::AllEntities<FF> {
      public:
        using Base = bb::avm::AvmFlavor::AllEntities<FF>;
        using Base::Base;
    };

    class VerificationKey
        : public VerificationKey_<bb::avm::AvmFlavor::PrecomputedEntities<Commitment>, VerifierCommitmentKey> {
      public:
        VerificationKey(CircuitBuilder* builder, const std::shared_ptr<NativeVerificationKey>& native_key)
        {
            this->pcs_verification_key = native_key->pcs_verification_key;
            this->circuit_size = native_key->circuit_size;
            this->log_circuit_size = numeric::get_msb(this->circuit_size);
            this->num_public_inputs = native_key->num_public_inputs;

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
        VerificationKey(CircuitBuilder& builder, std::span<FF> elements)
        {
            size_t num_frs_read = 0;
            size_t num_frs_FF = bb::stdlib::field_conversion::calc_num_bn254_frs<CircuitBuilder, FF>();
            size_t num_frs_Comm = bb::stdlib::field_conversion::calc_num_bn254_frs<CircuitBuilder, Commitment>();

            this->circuit_size = uint64_t(stdlib::field_conversion::convert_from_bn254_frs<CircuitBuilder, FF>(
                                              builder, elements.subspan(num_frs_read, num_frs_FF))
                                              .get_value());
            num_frs_read += num_frs_FF;
            this->num_public_inputs = uint64_t(stdlib::field_conversion::convert_from_bn254_frs<CircuitBuilder, FF>(
                                                   builder, elements.subspan(num_frs_read, num_frs_FF))
                                                   .get_value());
            num_frs_read += num_frs_FF;

            for (Commitment& comm : this->get_all()) {
                comm = bb::stdlib::field_conversion::convert_from_bn254_frs<CircuitBuilder, Commitment>(
                    builder, elements.subspan(num_frs_read, num_frs_Comm));
                num_frs_read += num_frs_Comm;
            }
        }
    };

    using WitnessCommitments = bb::avm::AvmFlavor::WitnessEntities<Commitment>;
    using CommitmentLabels = bb::avm::AvmFlavor::CommitmentLabels;
    using VerifierCommitments = bb::avm::AvmFlavor::VerifierCommitments_<Commitment, VerificationKey>;
    using Transcript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<CircuitBuilder>>;
};

} // namespace bb