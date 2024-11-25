#pragma once
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/flavor_macros.hpp"
#include "barretenberg/polynomials/barycentric.hpp"
#include "barretenberg/polynomials/evaluation_domain.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/transcript/transcript.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_recursive_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_rollup_flavor.hpp"

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

    /**
     * @brief The verification key is responsible for storing the commitments to the precomputed (non-witnessk)
     * polynomials used by the verifier.
     *
     * @note Note the discrepancy with what sort of data is stored here vs in the proving key. We may want to resolve
     * that, and split out separate PrecomputedPolynomials/Commitments data for clarity but also for portability of our
     * circuits.
     */
    class VerificationKey
        : public VerificationKey_<UltraFlavor::PrecomputedEntities<Commitment>, VerifierCommitmentKey> {
      public:
        bool contains_ipa_claim;                                // needs to be a circuit constant
        IPAClaimPubInputIndices ipa_claim_public_input_indices; // needs to be a circuit constant

        VerificationKey(const size_t circuit_size, const size_t num_public_inputs)
        {
            // TODO(https://github.com/AztecProtocol/barretenberg/issues/983): Think about if these should be witnesses
            this->circuit_size = circuit_size;
            this->log_circuit_size = numeric::get_msb(circuit_size);
            this->num_public_inputs = num_public_inputs;
        };
        /**
         * @brief Construct a new Verification Key with stdlib types from a provided native verification key
         *
         * @param builder
         * @param native_key Native verification key from which to extract the precomputed commitments
         */
        VerificationKey(CircuitBuilder* builder, const std::shared_ptr<NativeVerificationKey>& native_key)
            : contains_ipa_claim(native_key->contains_ipa_claim)
            , ipa_claim_public_input_indices(native_key->ipa_claim_public_input_indices)
        {
            this->pcs_verification_key = native_key->pcs_verification_key;
            this->circuit_size = native_key->circuit_size;
            this->log_circuit_size = numeric::get_msb(this->circuit_size);
            this->num_public_inputs = native_key->num_public_inputs;
            this->pub_inputs_offset = native_key->pub_inputs_offset;
            this->contains_pairing_point_accumulator = native_key->contains_pairing_point_accumulator;
            this->pairing_point_accumulator_public_input_indices =
                native_key->pairing_point_accumulator_public_input_indices;

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

            this->circuit_size = uint64_t(deserialize_from_frs<FF>(builder, elements, num_frs_read).get_value());
            this->num_public_inputs = uint64_t(deserialize_from_frs<FF>(builder, elements, num_frs_read).get_value());
            this->pub_inputs_offset = uint64_t(deserialize_from_frs<FF>(builder, elements, num_frs_read).get_value());
            this->contains_pairing_point_accumulator =
                bool(deserialize_from_frs<FF>(builder, elements, num_frs_read).get_value());
            for (uint32_t& idx : this->pairing_point_accumulator_public_input_indices) {
                idx = uint32_t(deserialize_from_frs<FF>(builder, elements, num_frs_read).get_value());
            }
            contains_ipa_claim = bool(deserialize_from_frs<FF>(builder, elements, num_frs_read).get_value());
            for (uint32_t& idx : this->ipa_claim_public_input_indices) {
                idx = uint32_t(deserialize_from_frs<FF>(builder, elements, num_frs_read).get_value());
            }

            for (Commitment& commitment : this->get_all()) {
                commitment = deserialize_from_frs<Commitment>(builder, elements, num_frs_read);
            }
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
            std::vector<FF> vkey_fields;
            vkey_fields.reserve(witness_indices.size());
            for (const auto& idx : witness_indices) {
                vkey_fields.emplace_back(FF::from_witness_index(&builder, idx));
            }
            return VerificationKey(builder, vkey_fields);
        }
    };

    // Reuse the VerifierCommitments from Ultra
    using VerifierCommitments = UltraFlavor::VerifierCommitments_<Commitment, VerificationKey>;
};

} // namespace bb