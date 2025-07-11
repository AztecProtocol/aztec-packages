// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/flavor_macros.hpp"
#include "barretenberg/flavor/ultra_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_flavor.hpp"
#include "barretenberg/polynomials/barycentric.hpp"
#include "barretenberg/polynomials/evaluation_domain.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/transcript/transcript.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

namespace bb {

/**
 * @brief The recursive counterpart to the "native" UltraRollupFlavor.
 * @details This flavor can be used to instantiate a recursive Mega Honk verifier for a proof created using the
 * MegaZKFlavor. It is similar in structure to its native counterpart with two main differences: 1) the
 * curve types are stdlib types (e.g. field_t instead of field) and 2) it does not specify any Prover related types
 * (e.g. Polynomial, ExtendedEdges, etc.) since we do not emulate prover computation in circuits, i.e. it only makes
 * sense to instantiate a Verifier with this flavor.
 *
 * @note Unlike conventional flavors, "recursive" flavors are templated by a builder (much like native vs stdlib types).
 * This is because the flavor itself determines the details of the underlying verifier algorithm (i.e. the set of
 * relations), while the Builder determines the arithmetization of that algorithm into a circuit.
 *
 * @tparam BuilderType Determines the arithmetization of the verifier circuit defined based on this flavor.
 */
template <typename BuilderType> class UltraRollupRecursiveFlavor_ : public UltraRecursiveFlavor_<BuilderType> {
  public:
    using CircuitBuilder = BuilderType; // Determines arithmetization of circuit instantiated with this flavor
    using NativeFlavor = UltraRollupFlavor;
    using Curve = UltraRecursiveFlavor_<BuilderType>::Curve;
    using PCS = KZG<Curve>;
    using GroupElement = typename Curve::Element;
    using Commitment = typename Curve::Element;
    using FF = typename Curve::ScalarField;
    using VerifierCommitmentKey = bb::VerifierCommitmentKey<NativeFlavor::Curve>;
    using NativeVerificationKey = NativeFlavor::VerificationKey;
    using Transcript = UltraRecursiveFlavor_<BuilderType>::Transcript;

    /**
     * @brief The verification key is responsible for storing the commitments to the precomputed (non-witnessk)
     * polynomials used by the verifier.
     *
     * @note Note the discrepancy with what sort of data is stored here vs in the proving key. We may want to resolve
     * that, and split out separate PrecomputedPolynomials/Commitments data for clarity but also for portability of our
     * circuits.
     */
    class VerificationKey
        : public StdlibVerificationKey_<BuilderType, UltraRollupFlavor::PrecomputedEntities<Commitment>> {
      public:
        using NativeVerificationKey = NativeFlavor::VerificationKey;

        /**
         * @brief Construct a new Verification Key with stdlib types from a provided native verification key
         *
         * @param builder
         * @param native_key Native verification key from which to extract the precomputed commitments
         */
        VerificationKey(CircuitBuilder* builder, const std::shared_ptr<NativeVerificationKey>& native_key)
        {
            this->circuit_size = FF::from_witness(builder, native_key->circuit_size);
            // TODO(https://github.com/AztecProtocol/barretenberg/issues/1283): Use stdlib get_msb.
            this->log_circuit_size = FF::from_witness(builder, numeric::get_msb(native_key->circuit_size));
            this->num_public_inputs = FF::from_witness(builder, native_key->num_public_inputs);
            this->pub_inputs_offset = FF::from_witness(builder, native_key->pub_inputs_offset);

            // Generate stdlib commitments (biggroup) from the native counterparts
            for (auto [commitment, native_commitment] : zip_view(this->get_all(), native_key->get_all())) {
                commitment = Commitment::from_witness(builder, native_commitment);
            }
        };

        /**
         * @brief Deserialize a verification key from a vector of field elements
         *
         * @param builder
         * @param elements
         */
        VerificationKey(CircuitBuilder& builder, std::span<FF> elements)
        {
            using namespace bb::stdlib::field_conversion;

            size_t num_frs_read = 0;

            this->circuit_size = deserialize_from_frs<FF>(builder, elements, num_frs_read);
            // TODO(https://github.com/AztecProtocol/barretenberg/issues/1364): Improve VKs. log_circuit_size must be a
            // witness to make the Recursive Verifier circuit constant. Seems that other members also need to be turned
            // into witnesses.
            this->log_circuit_size =
                FF::from_witness(&builder, numeric::get_msb(static_cast<uint32_t>(this->circuit_size.get_value())));
            this->num_public_inputs = deserialize_from_frs<FF>(builder, elements, num_frs_read);
            this->pub_inputs_offset = deserialize_from_frs<FF>(builder, elements, num_frs_read);

            for (Commitment& commitment : this->get_all()) {
                commitment = deserialize_from_frs<Commitment>(builder, elements, num_frs_read);
            }
        }

        /**
         * @brief Adds the verification key hash to the transcript and returns the hash.
         * @details Needed to make sure the Origin Tag system works. See the base class function for
         * more details.
         *
         * @param domain_separator
         * @param transcript
         * @returns The hash of the verification key
         */
        FF add_hash_to_transcript(const std::string& domain_separator, Transcript& transcript) const override
        {
            transcript.add_to_independent_hash_buffer(domain_separator + "vk_circuit_size", this->circuit_size);
            transcript.add_to_independent_hash_buffer(domain_separator + "vk_num_public_inputs",
                                                      this->num_public_inputs);
            transcript.add_to_independent_hash_buffer(domain_separator + "vk_pub_inputs_offset",
                                                      this->pub_inputs_offset);

            for (const Commitment& commitment : this->get_all()) {
                transcript.add_to_independent_hash_buffer(domain_separator + "vk_commitment", commitment);
            }

            return transcript.hash_independent_buffer(domain_separator + "vk_hash");
        }

        /**
         * @brief Construct a VerificationKey from a set of corresponding witness indices
         *
         * @param builder
         * @param witness_indices
         * @return VerificationKey
         */
        static VerificationKey from_witness_indices(CircuitBuilder& builder,
                                                    const std::span<const uint32_t> witness_indices)
        {
            std::vector<FF> vk_fields;
            vk_fields.reserve(witness_indices.size());
            for (const auto& idx : witness_indices) {
                vk_fields.emplace_back(FF::from_witness_index(&builder, idx));
            }
            return VerificationKey(builder, vk_fields);
        }
    };

    // Reuse the VerifierCommitments from Ultra
    using VerifierCommitments = UltraFlavor::VerifierCommitments_<Commitment, VerificationKey>;
    using VKAndHash = VKAndHash_<FF, VerificationKey>;
};

} // namespace bb
