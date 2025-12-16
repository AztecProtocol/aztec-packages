#pragma once

#include <cstdint>

#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/stdlib/transcript/transcript.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/vm2/constraining/flavor.hpp"
#include "barretenberg/vm2/constraining/recursion/recursive_flavor_settings.hpp"

namespace bb::avm2 {

class AvmRecursiveFlavor {
  public:
    using CircuitBuilder = AvmRecursiveFlavorSettings::CircuitBuilder;
    using Curve = AvmRecursiveFlavorSettings::Curve;
    using PCS = AvmRecursiveFlavorSettings::PCS;
    using GroupElement = AvmRecursiveFlavorSettings::GroupElement;
    using Commitment = AvmRecursiveFlavorSettings::Commitment;
    using FF = AvmRecursiveFlavorSettings::FF;
    using BF = AvmRecursiveFlavorSettings::BF;

    using NativeFlavor = avm2::AvmFlavor;
    using NativeVerificationKey = NativeFlavor::VerificationKey;
    using Transcript = BaseTranscript<stdlib::recursion::honk::StdlibTranscriptParams<CircuitBuilder>>;

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

    static constexpr size_t NUM_SUBRELATIONS = NativeFlavor::NUM_SUBRELATIONS;
    using SubrelationSeparators = std::array<FF, NUM_SUBRELATIONS - 1>;

    // This flavor would not be used with ZK Sumcheck
    static constexpr bool HasZK = false;

    // To achieve fixed proof size and that the recursive verifier circuit is constant, we are using padding in Sumcheck
    // and Shplemini
    static constexpr bool USE_PADDING = true;

    /**
     * @brief A field element for each entity of the flavor. These entities represent the prover polynomials
     * evaluated at one point.
     */
    class AllValues : public NativeFlavor::AllEntities<FF> {
      public:
        using Base = NativeFlavor::AllEntities<FF>;
        using Base::Base;
    };

    class VerificationKey
        : public StdlibVerificationKey_<CircuitBuilder, NativeFlavor::PrecomputedEntities<Commitment>> {
      public:
        size_t log_fixed_circuit_size = MAX_AVM_TRACE_LOG_SIZE;
        VerificationKey(CircuitBuilder* builder, const std::shared_ptr<NativeVerificationKey>& native_key)
        {
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
        VerificationKey(std::span<const FF> elements)
        {
            size_t num_frs_read = 0;
            size_t num_frs_Comm = stdlib::field_conversion::calc_num_bn254_frs<CircuitBuilder, Commitment>();

            for (Commitment& comm : this->get_all()) {
                comm = stdlib::field_conversion::convert_from_bn254_frs<CircuitBuilder, Commitment>(
                    elements.subspan(num_frs_read, num_frs_Comm));
                num_frs_read += num_frs_Comm;
            }
        }

        std::vector<FF> to_field_elements() const override { throw_or_abort("Not intended to be used."); }
        FF hash_through_transcript([[maybe_unused]] const std::string& domain_separator,
                                   [[maybe_unused]] Transcript& transcript) const override
        {
            throw_or_abort("Not intended to be used because vk is hardcoded in circuit.");
        }

        /**
         * @brief Fixes witnesses of VK to be constants.
         *
         */
        void fix_witness()
        {
            for (Commitment& commitment : this->get_all()) {
                commitment.fix_witness();
            }
        }
    };

    using WitnessCommitments = NativeFlavor::WitnessEntities<Commitment>;
    using VerifierCommitments = NativeFlavor::VerifierCommitments_<Commitment, VerificationKey>;
};

} // namespace bb::avm2
