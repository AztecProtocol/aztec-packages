// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/common/std_array.hpp"
#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/flavor_macros.hpp"
#include "barretenberg/flavor/relation_definitions.hpp"
#include "barretenberg/relations/ecc_vm/ecc_lookup_relation.hpp"
#include "barretenberg/relations/ecc_vm/ecc_msm_relation.hpp"
#include "barretenberg/relations/ecc_vm/ecc_point_table_relation.hpp"
#include "barretenberg/relations/ecc_vm/ecc_set_relation.hpp"
#include "barretenberg/relations/ecc_vm/ecc_transcript_relation.hpp"
#include "barretenberg/relations/ecc_vm/ecc_wnaf_relation.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/stdlib/eccvm_verifier/verifier_commitment_key.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"
#include "barretenberg/stdlib/transcript/transcript.hpp"

// NOLINTBEGIN(cppcoreguidelines-avoid-const-or-ref-data-members) ?

namespace bb {

class ECCVMRecursiveFlavor {
  public:
    using CircuitBuilder = UltraCircuitBuilder; // determines the arithmetisation of recursive verifier
    using Curve = stdlib::grumpkin<CircuitBuilder>;
    using Commitment = Curve::AffineElement;
    using GroupElement = Curve::Element;
    using FF = Curve::ScalarField;
    using BF = Curve::BaseField;
    using NativeFlavor = ECCVMFlavor;
    using NativeVerificationKey = NativeFlavor::VerificationKey;
    using PCS = IPA<Curve>;

    // indicates when evaluating sumcheck, edges must be extended to be MAX_TOTAL_RELATION_LENGTH
    static constexpr bool USE_SHORT_MONOMIALS = ECCVMFlavor::USE_SHORT_MONOMIALS;

    // Indicates that this flavor runs with non-ZK Sumcheck.
    static constexpr bool HasZK = true;
    // ECCVM proof size and its recursive verifier circuit are genuinely fixed, hence no padding is needed.
    static constexpr bool USE_PADDING = ECCVMFlavor::USE_PADDING;

    static constexpr size_t NUM_WIRES = ECCVMFlavor::NUM_WIRES;
    // The number of multivariate polynomials on which a sumcheck prover sumcheck operates (including shifts). We often
    // need containers of this size to hold related data, so we choose a name more agnostic than `NUM_POLYNOMIALS`.
    // Note: this number does not include the individual sorted list polynomials.
    static constexpr size_t NUM_ALL_ENTITIES = ECCVMFlavor::NUM_ALL_ENTITIES;
    // The number of polynomials precomputed to describe a circuit and to aid a prover in constructing a satisfying
    // assignment of witnesses. We again choose a neutral name.
    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = ECCVMFlavor::NUM_PRECOMPUTED_ENTITIES;
    // The total number of witness entities not including shifts.
    static constexpr size_t NUM_WITNESS_ENTITIES = ECCVMFlavor::NUM_WITNESS_ENTITIES;

    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS = ECCVMFlavor::REPEATED_COMMITMENTS;
    // define the tuple of Relations that comprise the Sumcheck relation
    // Reuse the Relations from ECCVM
    using Relations = ECCVMFlavor::Relations_<FF>;

    static constexpr size_t NUM_SUBRELATIONS = ECCVMFlavor::NUM_SUBRELATIONS;
    using SubrelationSeparators = std::array<FF, NUM_SUBRELATIONS - 1>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = ECCVMFlavor::MAX_PARTIAL_RELATION_LENGTH;

    // BATCHED_RELATION_PARTIAL_LENGTH = algebraic degree of sumcheck relation *after* multiplying by the `pow_zeta`
    // random polynomial e.g. For \sum(x) [A(x) * B(x) + C(x)] * PowZeta(X), relation length = 2 and random relation
    // length = 3
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = ECCVMFlavor::BATCHED_RELATION_PARTIAL_LENGTH;
    static constexpr size_t NUM_RELATIONS = std::tuple_size<Relations>::value;

    // Instantiate the BarycentricData needed to extend each Relation Univariate

    // define the containers for storing the contributions from each relation in Sumcheck
    using TupleOfArraysOfValues = decltype(create_tuple_of_arrays_of_values<Relations>());

    /**
     * @brief A field element for each entity of the flavor.  These entities represent the prover polynomials
     * evaluated at one point.
     */
    class AllValues : public ECCVMFlavor::AllEntities<FF> {
      public:
        using Base = ECCVMFlavor::AllEntities<FF>;
        using Base::Base;
    };

    using VerifierCommitmentKey = bb::VerifierCommitmentKey<Curve>;
    /**
     * @brief The verification key is responsible for storing the commitments to the precomputed (non-witness)
     * polynomials used by the verifier.
     *
     * @note Note the discrepancy with what sort of data is stored here vs in the proving key. We may want to
     * resolve that, and split out separate PrecomputedPolynomials/Commitments data for clarity but also for
     * portability of our circuits.
     */
    class VerificationKey
        : public StdlibVerificationKey_<CircuitBuilder, ECCVMFlavor::PrecomputedEntities<Commitment>> {
      public:
        VerifierCommitmentKey pcs_verification_key;

        /**
         * @brief Construct a new Verification Key with stdlib types from a provided native verification
         * key
         *
         * @param builder
         * @param native_key Native verification key from which to extract the precomputed commitments
         */
        VerificationKey(CircuitBuilder* builder, const std::shared_ptr<NativeVerificationKey>& native_key)
            : pcs_verification_key(builder, 1UL << CONST_ECCVM_LOG_N, native_key->pcs_verification_key)
        {

            // TODO(https://github.com/AztecProtocol/barretenberg/issues/1324): Remove `log_circuit_size` from MSGPACK
            // and the verification key.
            this->log_circuit_size = BF{ static_cast<uint64_t>(CONST_ECCVM_LOG_N) };
            this->log_circuit_size.convert_constant_to_fixed_witness(builder);
            this->num_public_inputs = BF::from_witness(builder, native_key->num_public_inputs);
            this->pub_inputs_offset = BF::from_witness(builder, native_key->pub_inputs_offset);

            for (auto [native_commitment, commitment] : zip_view(native_key->get_all(), this->get_all())) {
                commitment = Commitment::from_witness(builder, native_commitment);
            }
        }

        /**
         * @brief Serialize verification key to field elements.
         *
         * @return std::vector<BF>
         */
        std::vector<BF> to_field_elements() const override
        {
            using namespace bb::stdlib::field_conversion;
            auto serialize_to_field_buffer = []<typename T>(const T& input, std::vector<FF>& buffer) {
                std::vector<FF> input_fields = convert_to_bn254_frs<CircuitBuilder, T>(input);
                buffer.insert(buffer.end(), input_fields.begin(), input_fields.end());
            };

            std::vector<FF> elements;
            for (const Commitment& commitment : this->get_all()) {
                serialize_to_field_buffer(commitment, elements);
            }

            return elements;
        }

        /**
         * @brief Unused function because vk is hardcoded in recursive verifier, so no transcript hashing is needed.
         *
         * @param domain_separator
         * @param transcript
         */
        FF add_hash_to_transcript([[maybe_unused]] const std::string& domain_separator,
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

    /**
     * @brief A container for the witness commitments.
     */
    using WitnessCommitments = ECCVMFlavor::WitnessEntities<Commitment>;

    using CommitmentLabels = ECCVMFlavor::CommitmentLabels;
    // Reuse the VerifierCommitments from ECCVM
    using VerifierCommitments = ECCVMFlavor::VerifierCommitments_<Commitment, VerificationKey>;
    // Reuse the transcript from ECCVM
    using Transcript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<CircuitBuilder>>;

    using VKAndHash = VKAndHash_<VerificationKey, FF>;

}; // NOLINTEND(cppcoreguidelines-avoid-const-or-ref-data-members)

} // namespace bb
