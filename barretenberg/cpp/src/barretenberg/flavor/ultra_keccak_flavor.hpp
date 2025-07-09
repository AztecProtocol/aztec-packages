// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

// TODO: the only change should be making honk generic over the transcript
#pragma once
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/flavor_macros.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/honk/library/grand_product_delta.hpp"
#include "barretenberg/honk/library/grand_product_library.hpp"
#include "barretenberg/polynomials/barycentric.hpp"
#include "barretenberg/polynomials/evaluation_domain.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/relations/auxiliary_relation.hpp"
#include "barretenberg/relations/delta_range_constraint_relation.hpp"
#include "barretenberg/relations/elliptic_relation.hpp"
#include "barretenberg/relations/logderiv_lookup_relation.hpp"
#include "barretenberg/relations/permutation_relation.hpp"
#include "barretenberg/relations/poseidon2_external_relation.hpp"
#include "barretenberg/relations/poseidon2_internal_relation.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/relations/ultra_arithmetic_relation.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

class UltraKeccakFlavor : public bb::UltraFlavor {
  public:
    using Transcript = UltraKeccakFlavor::Transcript_<KeccakTranscriptParams>;

    /**
     * @brief The verification key is responsible for storing the commitments to the precomputed (non-witnessk)
     * polynomials used by the verifier.
     *
     * @note Note the discrepancy with what sort of data is stored here vs in the proving key. We may want to resolve
     * that, and split out separate PrecomputedPolynomials/Commitments data for clarity but also for portability of our
     * circuits.
     */
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1094): Add aggregation to the verifier contract so the
    // VerificationKey from UltraFlavor can be used
    class VerificationKey : public NativeVerificationKey_<PrecomputedEntities<Commitment>, Transcript> {
      public:
        static constexpr size_t VERIFICATION_KEY_LENGTH =
            /* 1. Metadata (circuit_size, num_public_inputs, pub_inputs_offset) */ (3 * num_frs_fr) +
            /* 2. NUM_PRECOMPUTED_ENTITIES commitments */ (NUM_PRECOMPUTED_ENTITIES * num_frs_comm);

        VerificationKey() = default;
        VerificationKey(const size_t circuit_size, const size_t num_public_inputs)
            : NativeVerificationKey_(circuit_size, num_public_inputs)
        {}

        VerificationKey(const PrecomputedData& precomputed)
        {
            this->circuit_size = precomputed.metadata.dyadic_size;
            this->log_circuit_size = numeric::get_msb(this->circuit_size);
            this->num_public_inputs = precomputed.metadata.num_public_inputs;
            this->pub_inputs_offset = precomputed.metadata.pub_inputs_offset;

            CommitmentKey commitment_key{ precomputed.metadata.dyadic_size };
            for (auto [polynomial, commitment] : zip_view(precomputed.polynomials, this->get_all())) {
                commitment = commitment_key.commit(polynomial);
            }
        }

        /**
         * @brief Serialize verification key to field elements
         *
         * @return std::vector<FF>
         */
        std::vector<FF> to_field_elements() const override
        {
            using namespace bb::field_conversion;

            auto serialize_to_field_buffer = [](const auto& input, std::vector<FF>& buffer) {
                std::vector<FF> input_fields = convert_to_bn254_frs(input);
                buffer.insert(buffer.end(), input_fields.begin(), input_fields.end());
            };

            std::vector<FF> elements;

            serialize_to_field_buffer(this->circuit_size, elements);
            serialize_to_field_buffer(this->num_public_inputs, elements);
            serialize_to_field_buffer(this->pub_inputs_offset, elements);

            for (const Commitment& commitment : this->get_all()) {
                serialize_to_field_buffer(commitment, elements);
            }

            BB_ASSERT_EQ(elements.size(),
                         VERIFICATION_KEY_LENGTH,
                         "Verification key length did not match expected length from formula.");

            return elements;
        }

        /**
         * @brief Adds the verification key witnesses directly to the transcript.
         * @details Needed to make sure the Origin Tag system works. See the base class function for
         * more details.
         *
         * @param domain_separator
         * @param transcript
         *
         * @returns The hash of the verification key
         */
        fr add_hash_to_transcript(const std::string& domain_separator, Transcript& transcript) const override
        {
            // TODO(https://github.com/AztecProtocol/barretenberg/issues/1427): We need to update this function to look
            // like UltraFlavor's add_hash_to_transcript. Alternatively, the VerificationKey class will go away when we
            // add pairing point aggregation to the solidity verifier.
            transcript.add_to_hash_buffer(domain_separator + "vk_circuit_size", this->circuit_size);
            transcript.add_to_hash_buffer(domain_separator + "vk_num_public_inputs", this->num_public_inputs);
            transcript.add_to_hash_buffer(domain_separator + "vk_pub_inputs_offset", this->pub_inputs_offset);
            return 0;
        }

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/964): Clean the boilerplate up.
        VerificationKey(const uint64_t circuit_size,
                        const uint64_t num_public_inputs,
                        const uint64_t pub_inputs_offset,
                        const Commitment& q_m,
                        const Commitment& q_c,
                        const Commitment& q_l,
                        const Commitment& q_r,
                        const Commitment& q_o,
                        const Commitment& q_4,
                        const Commitment& q_lookup,
                        const Commitment& q_arith,
                        const Commitment& q_delta_range,
                        const Commitment& q_elliptic,
                        const Commitment& q_aux,
                        const Commitment& q_poseidon2_external,
                        const Commitment& q_poseidon2_internal,
                        const Commitment& sigma_1,
                        const Commitment& sigma_2,
                        const Commitment& sigma_3,
                        const Commitment& sigma_4,
                        const Commitment& id_1,
                        const Commitment& id_2,
                        const Commitment& id_3,
                        const Commitment& id_4,
                        const Commitment& table_1,
                        const Commitment& table_2,
                        const Commitment& table_3,
                        const Commitment& table_4,
                        const Commitment& lagrange_first,
                        const Commitment& lagrange_last)
        {
            this->circuit_size = circuit_size;
            this->log_circuit_size = numeric::get_msb(this->circuit_size);
            this->num_public_inputs = num_public_inputs;
            this->pub_inputs_offset = pub_inputs_offset;
            this->q_m = q_m;
            this->q_c = q_c;
            this->q_l = q_l;
            this->q_r = q_r;
            this->q_o = q_o;
            this->q_4 = q_4;
            this->q_lookup = q_lookup;
            this->q_arith = q_arith;
            this->q_delta_range = q_delta_range;
            this->q_elliptic = q_elliptic;
            this->q_aux = q_aux;
            this->q_poseidon2_external = q_poseidon2_external;
            this->q_poseidon2_internal = q_poseidon2_internal;
            this->sigma_1 = sigma_1;
            this->sigma_2 = sigma_2;
            this->sigma_3 = sigma_3;
            this->sigma_4 = sigma_4;
            this->id_1 = id_1;
            this->id_2 = id_2;
            this->id_3 = id_3;
            this->id_4 = id_4;
            this->table_1 = table_1;
            this->table_2 = table_2;
            this->table_3 = table_3;
            this->table_4 = table_4;
            this->lagrange_first = lagrange_first;
            this->lagrange_last = lagrange_last;
        }

        // For serialising and deserialising data
        MSGPACK_FIELDS(circuit_size,
                       log_circuit_size,
                       num_public_inputs,
                       pub_inputs_offset,
                       q_m,
                       q_c,
                       q_l,
                       q_r,
                       q_o,
                       q_4,
                       q_lookup,
                       q_arith,
                       q_delta_range,
                       q_elliptic,
                       q_aux,
                       q_poseidon2_external,
                       q_poseidon2_internal,
                       sigma_1,
                       sigma_2,
                       sigma_3,
                       sigma_4,
                       id_1,
                       id_2,
                       id_3,
                       id_4,
                       table_1,
                       table_2,
                       table_3,
                       table_4,
                       lagrange_first,
                       lagrange_last);
    };

    // Specialize for Ultra (general case used in UltraRecursive).
    using VerifierCommitments = VerifierCommitments_<Commitment, VerificationKey>;
};

} // namespace bb
