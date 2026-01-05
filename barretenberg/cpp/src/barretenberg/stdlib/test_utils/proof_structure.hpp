// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_zk_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_flavor.hpp"
#include "barretenberg/flavor/ultra_zk_flavor.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

/**
 * @brief Test utility for deserializing/serializing proof data into typed structures.
 * @details This allows tests to inspect and modify specific proof elements.
 * Each flavor has its own specialization due to different proof structures.
 *
 * @tparam Flavor The proving system flavor
 */
template <typename Flavor> struct ProofStructure;

// ============================================================================
// Common base with type definitions and helper methods
// ============================================================================
template <typename Flavor> struct ProofStructureHelper {
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using Transcript = typename Flavor::Transcript;
    using Codec = typename Transcript::Codec;
    using ProofData = typename Transcript::Proof;
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = Flavor::BATCHED_RELATION_PARTIAL_LENGTH;
    static constexpr size_t NUM_ALL_ENTITIES = Flavor::NUM_ALL_ENTITIES;

  protected:
    template <typename T> static T deserialize_from_buffer(const ProofData& proof_data, size_t& offset)
    {
        constexpr size_t element_size = Codec::template calc_num_fields<T>();
        BB_ASSERT_LTE(offset + element_size, proof_data.size());
        auto element_span = std::span{ proof_data }.subspan(offset, element_size);
        offset += element_size;
        return Codec::template deserialize_from_fields<T>(element_span);
    }

    template <typename T> static void serialize_to_buffer(const T& element, ProofData& proof_data)
    {
        auto element_fields = Codec::serialize_to_fields(element);
        proof_data.insert(proof_data.end(), element_fields.begin(), element_fields.end());
    }
};

// ============================================================================
// Ultra proof structure base with common fields and helper methods
// ============================================================================
template <typename Flavor> struct UltraProofStructureBase : ProofStructureHelper<Flavor> {
    using Base = ProofStructureHelper<Flavor>;
    using Base::BATCHED_RELATION_PARTIAL_LENGTH;
    using Base::NUM_ALL_ENTITIES;
    using typename Base::Commitment;
    using typename Base::FF;
    using typename Base::ProofData;

    // Common fields shared between ZK and non-ZK
    std::vector<FF> public_inputs;
    Commitment w_l_comm;
    Commitment w_r_comm;
    Commitment w_o_comm;
    Commitment lookup_read_counts_comm;
    Commitment lookup_read_tags_comm;
    Commitment w_4_comm;
    Commitment z_perm_comm;
    Commitment lookup_inverses_comm;
    std::vector<bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>> sumcheck_univariates;
    std::array<FF, NUM_ALL_ENTITIES> sumcheck_evaluations;
    std::vector<Commitment> gemini_fold_comms;
    std::vector<FF> gemini_fold_evals;
    Commitment shplonk_q_comm;
    Commitment kzg_w_comm;

  protected:
    void clear_vectors()
    {
        public_inputs.clear();
        sumcheck_univariates.clear();
        gemini_fold_comms.clear();
        gemini_fold_evals.clear();
    }

    // Helper: deserialize Ultra witness commitments
    void deserialize_ultra_witness_comms(const ProofData& proof_data, size_t& offset)
    {
        w_l_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        w_r_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        w_o_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        lookup_read_counts_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        lookup_read_tags_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        w_4_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        lookup_inverses_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        z_perm_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
    }

    // Helper: serialize Ultra witness commitments
    void serialize_ultra_witness_comms(ProofData& proof_data) const
    {
        Base::serialize_to_buffer(w_l_comm, proof_data);
        Base::serialize_to_buffer(w_r_comm, proof_data);
        Base::serialize_to_buffer(w_o_comm, proof_data);
        Base::serialize_to_buffer(lookup_read_counts_comm, proof_data);
        Base::serialize_to_buffer(lookup_read_tags_comm, proof_data);
        Base::serialize_to_buffer(w_4_comm, proof_data);
        Base::serialize_to_buffer(lookup_inverses_comm, proof_data);
        Base::serialize_to_buffer(z_perm_comm, proof_data);
    }

    // Helper: deserialize sumcheck data
    void deserialize_sumcheck(const ProofData& proof_data, size_t& offset, size_t log_n)
    {
        for (size_t i = 0; i < log_n; ++i) {
            sumcheck_univariates.push_back(
                this->template deserialize_from_buffer<bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>>(proof_data,
                                                                                                            offset));
        }
        sumcheck_evaluations =
            this->template deserialize_from_buffer<std::array<FF, NUM_ALL_ENTITIES>>(proof_data, offset);
    }

    // Helper: serialize sumcheck data
    void serialize_sumcheck(ProofData& proof_data, size_t log_n) const
    {
        for (size_t i = 0; i < log_n; ++i) {
            Base::serialize_to_buffer(sumcheck_univariates[i], proof_data);
        }
        Base::serialize_to_buffer(sumcheck_evaluations, proof_data);
    }

    // Helper: deserialize Gemini/Shplonk/KZG data
    void deserialize_pcs(const ProofData& proof_data, size_t& offset, size_t log_n)
    {
        for (size_t i = 0; i < log_n - 1; ++i) {
            gemini_fold_comms.push_back(this->template deserialize_from_buffer<Commitment>(proof_data, offset));
        }
        for (size_t i = 0; i < log_n; ++i) {
            gemini_fold_evals.push_back(this->template deserialize_from_buffer<FF>(proof_data, offset));
        }
        shplonk_q_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        kzg_w_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
    }

    // Helper: serialize Gemini/Shplonk/KZG data
    void serialize_pcs(ProofData& proof_data, size_t log_n) const
    {
        for (size_t i = 0; i < log_n - 1; ++i) {
            Base::serialize_to_buffer(gemini_fold_comms[i], proof_data);
        }
        for (size_t i = 0; i < log_n; ++i) {
            Base::serialize_to_buffer(gemini_fold_evals[i], proof_data);
        }
        Base::serialize_to_buffer(shplonk_q_comm, proof_data);
        Base::serialize_to_buffer(kzg_w_comm, proof_data);
    }

  public:
    void deserialize(ProofData& proof_data, size_t num_public_inputs, size_t log_n)
    {
        size_t offset = 0;
        clear_vectors();

        for (size_t i = 0; i < num_public_inputs; ++i) {
            public_inputs.push_back(this->template deserialize_from_buffer<FF>(proof_data, offset));
        }
        deserialize_ultra_witness_comms(proof_data, offset);
        deserialize_sumcheck(proof_data, offset, log_n);
        deserialize_pcs(proof_data, offset, log_n);
    }

    void serialize(ProofData& proof_data, size_t log_n) const
    {
        size_t old_size = proof_data.size();
        proof_data.clear();

        for (const auto& pi : public_inputs) {
            Base::serialize_to_buffer(pi, proof_data);
        }
        serialize_ultra_witness_comms(proof_data);
        serialize_sumcheck(proof_data, log_n);
        serialize_pcs(proof_data, log_n);

        BB_ASSERT_EQ(proof_data.size(), old_size);
    }
};

// ============================================================================
// Ultra ZK proof structure - extends Ultra with ZK-specific fields
// ============================================================================
template <typename Flavor> struct UltraZKProofStructureBase : UltraProofStructureBase<Flavor> {
    using Base = UltraProofStructureBase<Flavor>;
    using typename Base::Commitment;
    using typename Base::FF;
    using typename Base::ProofData;

    // ZK-specific fields
    Commitment hiding_polynomial_commitment;
    Commitment libra_concatenation_commitment;
    FF libra_sum;
    FF libra_claimed_evaluation;
    Commitment libra_grand_sum_commitment;
    Commitment libra_quotient_commitment;
    FF libra_concatenation_eval;
    FF libra_shifted_grand_sum_eval;
    FF libra_grand_sum_eval;
    FF libra_quotient_eval;

    void deserialize(ProofData& proof_data, size_t num_public_inputs, size_t log_n)
    {
        size_t offset = 0;
        this->clear_vectors();

        for (size_t i = 0; i < num_public_inputs; ++i) {
            this->public_inputs.push_back(this->template deserialize_from_buffer<FF>(proof_data, offset));
        }
        hiding_polynomial_commitment = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        this->deserialize_ultra_witness_comms(proof_data, offset);
        libra_concatenation_commitment = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        libra_sum = this->template deserialize_from_buffer<FF>(proof_data, offset);

        // Sumcheck univariates
        for (size_t i = 0; i < log_n; ++i) {
            this->sumcheck_univariates.push_back(
                this->template deserialize_from_buffer<bb::Univariate<FF, Base::BATCHED_RELATION_PARTIAL_LENGTH>>(
                    proof_data, offset));
        }
        libra_claimed_evaluation = this->template deserialize_from_buffer<FF>(proof_data, offset);
        this->sumcheck_evaluations =
            this->template deserialize_from_buffer<std::array<FF, Base::NUM_ALL_ENTITIES>>(proof_data, offset);
        libra_grand_sum_commitment = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        libra_quotient_commitment = this->template deserialize_from_buffer<Commitment>(proof_data, offset);

        // Gemini
        for (size_t i = 0; i < log_n - 1; ++i) {
            this->gemini_fold_comms.push_back(this->template deserialize_from_buffer<Commitment>(proof_data, offset));
        }
        for (size_t i = 0; i < log_n; ++i) {
            this->gemini_fold_evals.push_back(this->template deserialize_from_buffer<FF>(proof_data, offset));
        }
        libra_concatenation_eval = this->template deserialize_from_buffer<FF>(proof_data, offset);
        libra_shifted_grand_sum_eval = this->template deserialize_from_buffer<FF>(proof_data, offset);
        libra_grand_sum_eval = this->template deserialize_from_buffer<FF>(proof_data, offset);
        libra_quotient_eval = this->template deserialize_from_buffer<FF>(proof_data, offset);
        this->shplonk_q_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        this->kzg_w_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
    }

    void serialize(ProofData& proof_data, size_t log_n) const
    {
        size_t old_size = proof_data.size();
        proof_data.clear();

        for (const auto& pi : this->public_inputs) {
            Base::serialize_to_buffer(pi, proof_data);
        }
        Base::serialize_to_buffer(hiding_polynomial_commitment, proof_data);
        this->serialize_ultra_witness_comms(proof_data);
        Base::serialize_to_buffer(libra_concatenation_commitment, proof_data);
        Base::serialize_to_buffer(libra_sum, proof_data);

        // Sumcheck univariates
        for (size_t i = 0; i < log_n; ++i) {
            Base::serialize_to_buffer(this->sumcheck_univariates[i], proof_data);
        }
        Base::serialize_to_buffer(libra_claimed_evaluation, proof_data);
        Base::serialize_to_buffer(this->sumcheck_evaluations, proof_data);
        Base::serialize_to_buffer(libra_grand_sum_commitment, proof_data);
        Base::serialize_to_buffer(libra_quotient_commitment, proof_data);

        // Gemini
        for (size_t i = 0; i < log_n - 1; ++i) {
            Base::serialize_to_buffer(this->gemini_fold_comms[i], proof_data);
        }
        for (size_t i = 0; i < log_n; ++i) {
            Base::serialize_to_buffer(this->gemini_fold_evals[i], proof_data);
        }
        Base::serialize_to_buffer(libra_concatenation_eval, proof_data);
        Base::serialize_to_buffer(libra_shifted_grand_sum_eval, proof_data);
        Base::serialize_to_buffer(libra_grand_sum_eval, proof_data);
        Base::serialize_to_buffer(libra_quotient_eval, proof_data);
        Base::serialize_to_buffer(this->shplonk_q_comm, proof_data);
        Base::serialize_to_buffer(this->kzg_w_comm, proof_data);

        BB_ASSERT_EQ(proof_data.size(), old_size);
    }
};

// ============================================================================
// Mega proof structure base with common fields and helper methods
// ============================================================================
template <typename Flavor> struct MegaProofStructureBase : ProofStructureHelper<Flavor> {
    using Base = ProofStructureHelper<Flavor>;
    using Base::BATCHED_RELATION_PARTIAL_LENGTH;
    using Base::NUM_ALL_ENTITIES;
    using typename Base::Commitment;
    using typename Base::FF;
    using typename Base::ProofData;

    // Common fields shared between ZK and non-ZK
    std::vector<FF> public_inputs;
    Commitment w_l_comm;
    Commitment w_r_comm;
    Commitment w_o_comm;
    Commitment ecc_op_wire_1_comm;
    Commitment ecc_op_wire_2_comm;
    Commitment ecc_op_wire_3_comm;
    Commitment ecc_op_wire_4_comm;
    Commitment calldata_comm;
    Commitment calldata_read_counts_comm;
    Commitment calldata_read_tags_comm;
    Commitment secondary_calldata_comm;
    Commitment secondary_calldata_read_counts_comm;
    Commitment secondary_calldata_read_tags_comm;
    Commitment return_data_comm;
    Commitment return_data_read_counts_comm;
    Commitment return_data_read_tags_comm;
    Commitment lookup_read_counts_comm;
    Commitment lookup_read_tags_comm;
    Commitment w_4_comm;
    Commitment lookup_inverses_comm;
    Commitment calldata_inverses_comm;
    Commitment secondary_calldata_inverses_comm;
    Commitment return_data_inverses_comm;
    Commitment z_perm_comm;
    std::vector<bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>> sumcheck_univariates;
    std::array<FF, NUM_ALL_ENTITIES> sumcheck_evaluations;
    std::vector<Commitment> gemini_fold_comms;
    std::vector<FF> gemini_fold_evals;
    Commitment shplonk_q_comm;
    Commitment kzg_w_comm;

  protected:
    void clear_vectors()
    {
        public_inputs.clear();
        sumcheck_univariates.clear();
        gemini_fold_comms.clear();
        gemini_fold_evals.clear();
    }

    // Helper: deserialize Mega witness commitments
    void deserialize_mega_witness_comms(const ProofData& proof_data, size_t& offset)
    {
        w_l_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        w_r_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        w_o_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        ecc_op_wire_1_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        ecc_op_wire_2_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        ecc_op_wire_3_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        ecc_op_wire_4_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        calldata_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        calldata_read_counts_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        calldata_read_tags_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        secondary_calldata_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        secondary_calldata_read_counts_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        secondary_calldata_read_tags_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        return_data_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        return_data_read_counts_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        return_data_read_tags_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        lookup_read_counts_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        lookup_read_tags_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        w_4_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        lookup_inverses_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        calldata_inverses_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        secondary_calldata_inverses_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        return_data_inverses_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        z_perm_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
    }

    // Helper: serialize Mega witness commitments
    void serialize_mega_witness_comms(ProofData& proof_data) const
    {
        Base::serialize_to_buffer(w_l_comm, proof_data);
        Base::serialize_to_buffer(w_r_comm, proof_data);
        Base::serialize_to_buffer(w_o_comm, proof_data);
        Base::serialize_to_buffer(ecc_op_wire_1_comm, proof_data);
        Base::serialize_to_buffer(ecc_op_wire_2_comm, proof_data);
        Base::serialize_to_buffer(ecc_op_wire_3_comm, proof_data);
        Base::serialize_to_buffer(ecc_op_wire_4_comm, proof_data);
        Base::serialize_to_buffer(calldata_comm, proof_data);
        Base::serialize_to_buffer(calldata_read_counts_comm, proof_data);
        Base::serialize_to_buffer(calldata_read_tags_comm, proof_data);
        Base::serialize_to_buffer(secondary_calldata_comm, proof_data);
        Base::serialize_to_buffer(secondary_calldata_read_counts_comm, proof_data);
        Base::serialize_to_buffer(secondary_calldata_read_tags_comm, proof_data);
        Base::serialize_to_buffer(return_data_comm, proof_data);
        Base::serialize_to_buffer(return_data_read_counts_comm, proof_data);
        Base::serialize_to_buffer(return_data_read_tags_comm, proof_data);
        Base::serialize_to_buffer(lookup_read_counts_comm, proof_data);
        Base::serialize_to_buffer(lookup_read_tags_comm, proof_data);
        Base::serialize_to_buffer(w_4_comm, proof_data);
        Base::serialize_to_buffer(lookup_inverses_comm, proof_data);
        Base::serialize_to_buffer(calldata_inverses_comm, proof_data);
        Base::serialize_to_buffer(secondary_calldata_inverses_comm, proof_data);
        Base::serialize_to_buffer(return_data_inverses_comm, proof_data);
        Base::serialize_to_buffer(z_perm_comm, proof_data);
    }

    // Helper: deserialize sumcheck data
    void deserialize_sumcheck(const ProofData& proof_data, size_t& offset, size_t log_n)
    {
        for (size_t i = 0; i < log_n; ++i) {
            sumcheck_univariates.push_back(
                this->template deserialize_from_buffer<bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>>(proof_data,
                                                                                                            offset));
        }
        sumcheck_evaluations =
            this->template deserialize_from_buffer<std::array<FF, NUM_ALL_ENTITIES>>(proof_data, offset);
    }

    // Helper: serialize sumcheck data
    void serialize_sumcheck(ProofData& proof_data, size_t log_n) const
    {
        for (size_t i = 0; i < log_n; ++i) {
            Base::serialize_to_buffer(sumcheck_univariates[i], proof_data);
        }
        Base::serialize_to_buffer(sumcheck_evaluations, proof_data);
    }

    // Helper: deserialize Gemini/Shplonk/KZG data
    void deserialize_pcs(const ProofData& proof_data, size_t& offset, size_t log_n)
    {
        for (size_t i = 0; i < log_n - 1; ++i) {
            gemini_fold_comms.push_back(this->template deserialize_from_buffer<Commitment>(proof_data, offset));
        }
        for (size_t i = 0; i < log_n; ++i) {
            gemini_fold_evals.push_back(this->template deserialize_from_buffer<FF>(proof_data, offset));
        }
        shplonk_q_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        kzg_w_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
    }

    // Helper: serialize Gemini/Shplonk/KZG data
    void serialize_pcs(ProofData& proof_data, size_t log_n) const
    {
        for (size_t i = 0; i < log_n - 1; ++i) {
            Base::serialize_to_buffer(gemini_fold_comms[i], proof_data);
        }
        for (size_t i = 0; i < log_n; ++i) {
            Base::serialize_to_buffer(gemini_fold_evals[i], proof_data);
        }
        Base::serialize_to_buffer(shplonk_q_comm, proof_data);
        Base::serialize_to_buffer(kzg_w_comm, proof_data);
    }

  public:
    void deserialize(ProofData& proof_data, size_t num_public_inputs, size_t log_n)
    {
        size_t offset = 0;
        clear_vectors();

        for (size_t i = 0; i < num_public_inputs; ++i) {
            public_inputs.push_back(this->template deserialize_from_buffer<FF>(proof_data, offset));
        }
        deserialize_mega_witness_comms(proof_data, offset);
        deserialize_sumcheck(proof_data, offset, log_n);
        deserialize_pcs(proof_data, offset, log_n);
    }

    void serialize(ProofData& proof_data, size_t log_n) const
    {
        size_t old_size = proof_data.size();
        proof_data.clear();

        for (const auto& pi : public_inputs) {
            Base::serialize_to_buffer(pi, proof_data);
        }
        serialize_mega_witness_comms(proof_data);
        serialize_sumcheck(proof_data, log_n);
        serialize_pcs(proof_data, log_n);

        BB_ASSERT_EQ(proof_data.size(), old_size);
    }
};

// ============================================================================
// Mega ZK proof structure - extends Mega with ZK-specific fields
// ============================================================================
template <typename Flavor> struct MegaZKProofStructureBase : MegaProofStructureBase<Flavor> {
    using Base = MegaProofStructureBase<Flavor>;
    using typename Base::Commitment;
    using typename Base::FF;
    using typename Base::ProofData;

    // ZK-specific fields
    Commitment hiding_polynomial_commitment;
    Commitment libra_concatenation_commitment;
    FF libra_sum;
    FF libra_claimed_evaluation;
    Commitment libra_grand_sum_commitment;
    Commitment libra_quotient_commitment;
    FF libra_concatenation_eval;
    FF libra_shifted_grand_sum_eval;
    FF libra_grand_sum_eval;
    FF libra_quotient_eval;

    void deserialize(ProofData& proof_data, size_t num_public_inputs, size_t log_n)
    {
        size_t offset = 0;
        this->clear_vectors();

        for (size_t i = 0; i < num_public_inputs; ++i) {
            this->public_inputs.push_back(this->template deserialize_from_buffer<FF>(proof_data, offset));
        }
        hiding_polynomial_commitment = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        this->deserialize_mega_witness_comms(proof_data, offset);
        libra_concatenation_commitment = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        libra_sum = this->template deserialize_from_buffer<FF>(proof_data, offset);

        // Sumcheck univariates
        for (size_t i = 0; i < log_n; ++i) {
            this->sumcheck_univariates.push_back(
                this->template deserialize_from_buffer<bb::Univariate<FF, Base::BATCHED_RELATION_PARTIAL_LENGTH>>(
                    proof_data, offset));
        }
        libra_claimed_evaluation = this->template deserialize_from_buffer<FF>(proof_data, offset);
        this->sumcheck_evaluations =
            this->template deserialize_from_buffer<std::array<FF, Base::NUM_ALL_ENTITIES>>(proof_data, offset);
        libra_grand_sum_commitment = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        libra_quotient_commitment = this->template deserialize_from_buffer<Commitment>(proof_data, offset);

        // Gemini
        for (size_t i = 0; i < log_n - 1; ++i) {
            this->gemini_fold_comms.push_back(this->template deserialize_from_buffer<Commitment>(proof_data, offset));
        }
        for (size_t i = 0; i < log_n; ++i) {
            this->gemini_fold_evals.push_back(this->template deserialize_from_buffer<FF>(proof_data, offset));
        }
        libra_concatenation_eval = this->template deserialize_from_buffer<FF>(proof_data, offset);
        libra_shifted_grand_sum_eval = this->template deserialize_from_buffer<FF>(proof_data, offset);
        libra_grand_sum_eval = this->template deserialize_from_buffer<FF>(proof_data, offset);
        libra_quotient_eval = this->template deserialize_from_buffer<FF>(proof_data, offset);
        this->shplonk_q_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        this->kzg_w_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
    }

    void serialize(ProofData& proof_data, size_t log_n) const
    {
        size_t old_size = proof_data.size();
        proof_data.clear();

        for (const auto& pi : this->public_inputs) {
            Base::serialize_to_buffer(pi, proof_data);
        }
        Base::serialize_to_buffer(hiding_polynomial_commitment, proof_data);
        this->serialize_mega_witness_comms(proof_data);
        Base::serialize_to_buffer(libra_concatenation_commitment, proof_data);
        Base::serialize_to_buffer(libra_sum, proof_data);

        // Sumcheck univariates
        for (size_t i = 0; i < log_n; ++i) {
            Base::serialize_to_buffer(this->sumcheck_univariates[i], proof_data);
        }
        Base::serialize_to_buffer(libra_claimed_evaluation, proof_data);
        Base::serialize_to_buffer(this->sumcheck_evaluations, proof_data);
        Base::serialize_to_buffer(libra_grand_sum_commitment, proof_data);
        Base::serialize_to_buffer(libra_quotient_commitment, proof_data);

        // Gemini
        for (size_t i = 0; i < log_n - 1; ++i) {
            Base::serialize_to_buffer(this->gemini_fold_comms[i], proof_data);
        }
        for (size_t i = 0; i < log_n; ++i) {
            Base::serialize_to_buffer(this->gemini_fold_evals[i], proof_data);
        }
        Base::serialize_to_buffer(libra_concatenation_eval, proof_data);
        Base::serialize_to_buffer(libra_shifted_grand_sum_eval, proof_data);
        Base::serialize_to_buffer(libra_grand_sum_eval, proof_data);
        Base::serialize_to_buffer(libra_quotient_eval, proof_data);
        Base::serialize_to_buffer(this->shplonk_q_comm, proof_data);
        Base::serialize_to_buffer(this->kzg_w_comm, proof_data);

        BB_ASSERT_EQ(proof_data.size(), old_size);
    }
};

// ============================================================================
// Flavor Specializations
// ============================================================================

// Ultra flavors (non-ZK)
// Note: UltraRollupFlavor's IPA proof is handled separately by prover_instance->ipa_proof,
// so ProofStructure only needs to handle the Ultra portion from the transcript.
template <> struct ProofStructure<UltraFlavor> : UltraProofStructureBase<UltraFlavor> {};
template <> struct ProofStructure<UltraKeccakFlavor> : UltraProofStructureBase<UltraKeccakFlavor> {};
template <> struct ProofStructure<UltraRollupFlavor> : UltraProofStructureBase<UltraRollupFlavor> {};

// Ultra ZK flavors
template <> struct ProofStructure<UltraZKFlavor> : UltraZKProofStructureBase<UltraZKFlavor> {};
template <> struct ProofStructure<UltraKeccakZKFlavor> : UltraZKProofStructureBase<UltraKeccakZKFlavor> {};

// Mega flavors
template <> struct ProofStructure<MegaFlavor> : MegaProofStructureBase<MegaFlavor> {};
template <> struct ProofStructure<MegaZKFlavor> : MegaZKProofStructureBase<MegaZKFlavor> {};

} // namespace bb
