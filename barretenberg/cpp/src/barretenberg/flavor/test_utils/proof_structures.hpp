// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/flavor/flavor_concepts.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_zk_flavor.hpp"
#include "barretenberg/flavor/ultra_zk_flavor.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"

namespace bb {

/**
 * @brief Test utility for deserializing/serializing proof data into typed structures.
 * @details This allows tests to inspect and modify specific proof elements.
 * Each flavor has its own specialization due to different proof structures.
 *
 * @tparam Flavor The proving system flavor
 */
template <typename Flavor> struct StructuredProof;

// ============================================================================
// Common base with type definitions and helper methods
// ============================================================================
template <typename Flavor> struct StructuredProofHelper {
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
template <typename Flavor> struct UltraStructuredProofBase : StructuredProofHelper<Flavor> {
    using Base = StructuredProofHelper<Flavor>;
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
template <typename Flavor> struct UltraZKStructuredProofBase : UltraStructuredProofBase<Flavor> {
    using Base = UltraStructuredProofBase<Flavor>;
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
template <typename Flavor> struct MegaStructuredProofBase : StructuredProofHelper<Flavor> {
    using Base = StructuredProofHelper<Flavor>;
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
    // Per-bus commitments. MegaZK keeps only the kernel_calldata bus; MegaFlavor carries all five.
    std::array<Commitment, Flavor::NUM_BUS_COLUMNS> bus_comms;
    std::array<Commitment, Flavor::NUM_BUS_COLUMNS> bus_read_counts_comms;
    std::array<Commitment, Flavor::NUM_BUS_COLUMNS> bus_inverses_comms;
    Commitment lookup_read_counts_comm;
    Commitment lookup_read_tags_comm;
    Commitment w_4_comm;
    Commitment lookup_inverses_comm;
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
        for (size_t i = 0; i < Flavor::NUM_BUS_COLUMNS; ++i) {
            bus_comms[i] = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
            bus_read_counts_comms[i] = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        }
        if constexpr (Flavor::HasLogDerivLookup) {
            lookup_read_counts_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
            lookup_read_tags_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        }
        w_4_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        if constexpr (Flavor::HasLogDerivLookup) {
            lookup_inverses_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        }
        for (size_t i = 0; i < Flavor::NUM_BUS_COLUMNS; ++i) {
            bus_inverses_comms[i] = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        }
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
        for (size_t i = 0; i < Flavor::NUM_BUS_COLUMNS; ++i) {
            Base::serialize_to_buffer(bus_comms[i], proof_data);
            Base::serialize_to_buffer(bus_read_counts_comms[i], proof_data);
        }
        if constexpr (Flavor::HasLogDerivLookup) {
            Base::serialize_to_buffer(lookup_read_counts_comm, proof_data);
            Base::serialize_to_buffer(lookup_read_tags_comm, proof_data);
        }
        Base::serialize_to_buffer(w_4_comm, proof_data);
        if constexpr (Flavor::HasLogDerivLookup) {
            Base::serialize_to_buffer(lookup_inverses_comm, proof_data);
        }
        for (size_t i = 0; i < Flavor::NUM_BUS_COLUMNS; ++i) {
            Base::serialize_to_buffer(bus_inverses_comms[i], proof_data);
        }
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
template <typename Flavor> struct MegaZKStructuredProofBase : MegaStructuredProofBase<Flavor> {
    using Base = MegaStructuredProofBase<Flavor>;
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
        if constexpr (flavor_has_gemini_masking<Flavor>()) {
            hiding_polynomial_commitment = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        }
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
        if constexpr (flavor_has_gemini_masking<Flavor>()) {
            Base::serialize_to_buffer(hiding_polynomial_commitment, proof_data);
        }
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
// Translator proof structure (always ZK, with interleaved claims)
// ============================================================================
template <typename Flavor> struct TranslatorStructuredProofBase : StructuredProofHelper<Flavor> {
    using Base = StructuredProofHelper<Flavor>;
    using Base::BATCHED_RELATION_PARTIAL_LENGTH;
    using Base::NUM_ALL_ENTITIES;
    using typename Base::Commitment;
    using typename Base::FF;
    using typename Base::ProofData;

    // Number of wire commitments sent in proof (concatenated + ordered range constraints)
    static constexpr size_t NUM_BATCH_WITNESS_COMMS = Flavor::NUM_COMMITMENTS_IN_PROOF;
    // Minicircuit evaluations are sent mid-sumcheck after LOG_MINI_CIRCUIT_SIZE rounds
    static constexpr size_t LOG_MINI_CIRCUIT_SIZE = Flavor::LOG_MINI_CIRCUIT_SIZE;
    static constexpr size_t NUM_MINICIRCUIT_EVALUATIONS = Flavor::NUM_MINICIRCUIT_EVALUATIONS;
    static constexpr size_t NUM_FULL_CIRCUIT_EVALUATIONS = Flavor::NUM_FULL_CIRCUIT_EVALUATIONS;

    // Witness commitments
    Commitment gemini_masking_poly_comm;
    std::vector<Commitment> witness_comms; // non-opqueue wires + ordered range constraints
    Commitment z_perm_comm;

    // Libra (ZK - Translator is always ZK)
    Commitment libra_concatenation_commitment;
    FF libra_sum;

    // Sumcheck: univariates are split around interleaved minicircuit evaluations
    std::vector<bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>> sumcheck_univariates;
    // Minicircuit wire evaluations (sent mid-sumcheck after LOG_MINI_CIRCUIT_SIZE rounds)
    std::array<FF, NUM_MINICIRCUIT_EVALUATIONS> minicircuit_evaluations;
    // Full-circuit evaluations (sent after all sumcheck rounds)
    std::array<FF, NUM_FULL_CIRCUIT_EVALUATIONS> full_circuit_evaluations;
    FF libra_claimed_evaluation;

    // Post-sumcheck Libra commitments
    Commitment libra_grand_sum_commitment;
    Commitment libra_quotient_commitment;

    // Gemini/Shplemini
    std::vector<Commitment> gemini_fold_comms;
    std::vector<FF> gemini_fold_evals;

    // Libra evaluations
    FF libra_concatenation_eval;
    FF libra_shifted_grand_sum_eval;
    FF libra_grand_sum_eval;
    FF libra_quotient_eval;

    // Final PCS
    Commitment shplonk_q_comm;
    Commitment kzg_w_comm;

    void deserialize(ProofData& proof_data, size_t /*num_public_inputs*/, size_t log_n)
    {
        size_t offset = 0;
        witness_comms.clear();
        sumcheck_univariates.clear();
        gemini_fold_comms.clear();
        gemini_fold_evals.clear();

        // Witness commitments
        gemini_masking_poly_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        for (size_t i = 0; i < NUM_BATCH_WITNESS_COMMS; ++i) {
            witness_comms.push_back(this->template deserialize_from_buffer<Commitment>(proof_data, offset));
        }
        z_perm_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);

        // Libra pre-sumcheck
        libra_concatenation_commitment = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        libra_sum = this->template deserialize_from_buffer<FF>(proof_data, offset);

        // Sumcheck univariates (first LOG_MINI_CIRCUIT_SIZE rounds)
        for (size_t i = 0; i < LOG_MINI_CIRCUIT_SIZE; ++i) {
            sumcheck_univariates.push_back(
                this->template deserialize_from_buffer<bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>>(proof_data,
                                                                                                            offset));
        }
        // Minicircuit evaluations (interleaved mid-sumcheck)
        minicircuit_evaluations =
            this->template deserialize_from_buffer<std::array<FF, NUM_MINICIRCUIT_EVALUATIONS>>(proof_data, offset);
        // Sumcheck univariates (remaining rounds)
        for (size_t i = LOG_MINI_CIRCUIT_SIZE; i < log_n; ++i) {
            sumcheck_univariates.push_back(
                this->template deserialize_from_buffer<bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>>(proof_data,
                                                                                                            offset));
        }
        // Full-circuit evaluations (excludes computable precomputed + concatenated + minicircuit)
        full_circuit_evaluations =
            this->template deserialize_from_buffer<std::array<FF, NUM_FULL_CIRCUIT_EVALUATIONS>>(proof_data, offset);
        libra_claimed_evaluation = this->template deserialize_from_buffer<FF>(proof_data, offset);

        // Libra post-sumcheck commitments
        libra_grand_sum_commitment = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        libra_quotient_commitment = this->template deserialize_from_buffer<Commitment>(proof_data, offset);

        // Gemini fold commitments and evaluations
        for (size_t i = 0; i < log_n - 1; ++i) {
            gemini_fold_comms.push_back(this->template deserialize_from_buffer<Commitment>(proof_data, offset));
        }
        for (size_t i = 0; i < log_n; ++i) {
            gemini_fold_evals.push_back(this->template deserialize_from_buffer<FF>(proof_data, offset));
        }

        // Libra evaluations
        libra_concatenation_eval = this->template deserialize_from_buffer<FF>(proof_data, offset);
        libra_shifted_grand_sum_eval = this->template deserialize_from_buffer<FF>(proof_data, offset);
        libra_grand_sum_eval = this->template deserialize_from_buffer<FF>(proof_data, offset);
        libra_quotient_eval = this->template deserialize_from_buffer<FF>(proof_data, offset);

        // Final PCS
        shplonk_q_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        kzg_w_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
    }

    void serialize(ProofData& proof_data, size_t log_n) const
    {
        size_t old_size = proof_data.size();
        proof_data.clear();

        // Witness commitments
        Base::serialize_to_buffer(gemini_masking_poly_comm, proof_data);
        for (const auto& comm : witness_comms) {
            Base::serialize_to_buffer(comm, proof_data);
        }
        Base::serialize_to_buffer(z_perm_comm, proof_data);

        // Libra pre-sumcheck
        Base::serialize_to_buffer(libra_concatenation_commitment, proof_data);
        Base::serialize_to_buffer(libra_sum, proof_data);

        // Sumcheck univariates (first LOG_MINI_CIRCUIT_SIZE rounds)
        for (size_t i = 0; i < LOG_MINI_CIRCUIT_SIZE; ++i) {
            Base::serialize_to_buffer(sumcheck_univariates[i], proof_data);
        }
        // Minicircuit evaluations (interleaved mid-sumcheck)
        Base::serialize_to_buffer(minicircuit_evaluations, proof_data);
        // Sumcheck univariates (remaining rounds)
        for (size_t i = LOG_MINI_CIRCUIT_SIZE; i < log_n; ++i) {
            Base::serialize_to_buffer(sumcheck_univariates[i], proof_data);
        }
        // Full-circuit evaluations
        Base::serialize_to_buffer(full_circuit_evaluations, proof_data);
        Base::serialize_to_buffer(libra_claimed_evaluation, proof_data);

        // Libra post-sumcheck commitments
        Base::serialize_to_buffer(libra_grand_sum_commitment, proof_data);
        Base::serialize_to_buffer(libra_quotient_commitment, proof_data);

        // Gemini fold commitments and evaluations
        for (size_t i = 0; i < log_n - 1; ++i) {
            Base::serialize_to_buffer(gemini_fold_comms[i], proof_data);
        }
        for (size_t i = 0; i < log_n; ++i) {
            Base::serialize_to_buffer(gemini_fold_evals[i], proof_data);
        }

        // Libra evaluations
        Base::serialize_to_buffer(libra_concatenation_eval, proof_data);
        Base::serialize_to_buffer(libra_shifted_grand_sum_eval, proof_data);
        Base::serialize_to_buffer(libra_grand_sum_eval, proof_data);
        Base::serialize_to_buffer(libra_quotient_eval, proof_data);

        // Final PCS
        Base::serialize_to_buffer(shplonk_q_comm, proof_data);
        Base::serialize_to_buffer(kzg_w_comm, proof_data);

        BB_ASSERT_EQ(proof_data.size(), old_size);
    }
};

// ============================================================================
// ECCVM proof structure (always ZK, committed sumcheck, translation sub-protocol)
// ============================================================================
template <typename Flavor> struct ECCVMStructuredProofBase : StructuredProofHelper<Flavor> {
    using Base = StructuredProofHelper<Flavor>;
    using Base::NUM_ALL_ENTITIES;
    using typename Base::Commitment;
    using typename Base::FF;
    using typename Base::ProofData;

    // Witness commitments (masking_poly + NUM_WIRES wires + lookup_inverses + z_perm)
    Commitment gemini_masking_poly_comm;
    std::vector<Commitment> wire_comms;
    Commitment lookup_inverses_comm;
    Commitment z_perm_comm;

    // Libra pre-sumcheck
    Commitment libra_concatenation_commitment;
    FF libra_sum;

    // Committed sumcheck rounds (each round: commitment + eval_0 + eval_1, interleaved in proof)
    std::vector<Commitment> sumcheck_round_comms;
    std::vector<FF> sumcheck_round_eval_0s;
    std::vector<FF> sumcheck_round_eval_1s;

    // Sumcheck evaluations
    std::array<FF, NUM_ALL_ENTITIES> sumcheck_evaluations;

    // Libra post-sumcheck
    FF libra_claimed_evaluation;
    Commitment libra_grand_sum_commitment;
    Commitment libra_quotient_commitment;

    // Gemini/Shplemini
    std::vector<Commitment> gemini_fold_comms;
    std::vector<FF> gemini_fold_evals;

    // Libra SmallSubgroupIPA evaluations
    FF libra_concatenation_eval;
    FF libra_shifted_grand_sum_eval;
    FF libra_grand_sum_eval;
    FF libra_quotient_eval;

    // First Shplonk Q (from Shplemini)
    Commitment shplonk_q_comm;

    // Translation data
    Commitment translation_masking_comm;
    FF translation_op_eval;
    FF translation_Px_eval;
    FF translation_Py_eval;
    FF translation_z1_eval;
    FF translation_z2_eval;
    FF translation_masking_eval;
    Commitment translation_grand_sum_commitment;
    Commitment translation_quotient_commitment;
    FF translation_concatenation_eval;
    FF translation_shifted_grand_sum_eval;
    FF translation_grand_sum_eval;
    FF translation_quotient_eval;

    // TripleIPA pow-tensor masking claim
    Commitment pow_mask_commitment;
    FF pow_mask_evaluation;

    // Final Shplonk Q
    Commitment final_shplonk_q_comm;

    void deserialize(ProofData& proof_data, size_t /*num_public_inputs*/, size_t log_n)
    {
        size_t offset = 0;
        wire_comms.clear();
        sumcheck_round_comms.clear();
        sumcheck_round_eval_0s.clear();
        sumcheck_round_eval_1s.clear();
        gemini_fold_comms.clear();
        gemini_fold_evals.clear();

        // Witness commitments
        gemini_masking_poly_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        for (size_t i = 0; i < Flavor::NUM_WIRES; ++i) {
            wire_comms.push_back(this->template deserialize_from_buffer<Commitment>(proof_data, offset));
        }
        lookup_inverses_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        z_perm_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);

        // Libra pre-sumcheck
        libra_concatenation_commitment = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        libra_sum = this->template deserialize_from_buffer<FF>(proof_data, offset);

        // Committed sumcheck rounds (interleaved: comm, eval_0, eval_1 per round)
        for (size_t i = 0; i < log_n; ++i) {
            sumcheck_round_comms.push_back(this->template deserialize_from_buffer<Commitment>(proof_data, offset));
            sumcheck_round_eval_0s.push_back(this->template deserialize_from_buffer<FF>(proof_data, offset));
            sumcheck_round_eval_1s.push_back(this->template deserialize_from_buffer<FF>(proof_data, offset));
        }

        // Sumcheck evaluations
        sumcheck_evaluations =
            this->template deserialize_from_buffer<std::array<FF, NUM_ALL_ENTITIES>>(proof_data, offset);

        // Libra post-sumcheck
        libra_claimed_evaluation = this->template deserialize_from_buffer<FF>(proof_data, offset);
        libra_grand_sum_commitment = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        libra_quotient_commitment = this->template deserialize_from_buffer<Commitment>(proof_data, offset);

        // Libra SmallSubgroupIPA evaluations
        libra_concatenation_eval = this->template deserialize_from_buffer<FF>(proof_data, offset);
        libra_shifted_grand_sum_eval = this->template deserialize_from_buffer<FF>(proof_data, offset);
        libra_grand_sum_eval = this->template deserialize_from_buffer<FF>(proof_data, offset);
        libra_quotient_eval = this->template deserialize_from_buffer<FF>(proof_data, offset);

        // Translation data
        translation_masking_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        translation_op_eval = this->template deserialize_from_buffer<FF>(proof_data, offset);
        translation_Px_eval = this->template deserialize_from_buffer<FF>(proof_data, offset);
        translation_Py_eval = this->template deserialize_from_buffer<FF>(proof_data, offset);
        translation_z1_eval = this->template deserialize_from_buffer<FF>(proof_data, offset);
        translation_z2_eval = this->template deserialize_from_buffer<FF>(proof_data, offset);
        translation_masking_eval = this->template deserialize_from_buffer<FF>(proof_data, offset);
        translation_grand_sum_commitment = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        translation_quotient_commitment = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        translation_concatenation_eval = this->template deserialize_from_buffer<FF>(proof_data, offset);
        translation_shifted_grand_sum_eval = this->template deserialize_from_buffer<FF>(proof_data, offset);
        translation_grand_sum_eval = this->template deserialize_from_buffer<FF>(proof_data, offset);
        translation_quotient_eval = this->template deserialize_from_buffer<FF>(proof_data, offset);

        // TripleIPA pow-tensor masking claim
        pow_mask_commitment = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
        pow_mask_evaluation = this->template deserialize_from_buffer<FF>(proof_data, offset);

        // Final Shplonk Q
        final_shplonk_q_comm = this->template deserialize_from_buffer<Commitment>(proof_data, offset);
    }

    void serialize(ProofData& proof_data, size_t log_n) const
    {
        size_t old_size = proof_data.size();
        proof_data.clear();

        // Witness commitments
        Base::serialize_to_buffer(gemini_masking_poly_comm, proof_data);
        for (const auto& comm : wire_comms) {
            Base::serialize_to_buffer(comm, proof_data);
        }
        Base::serialize_to_buffer(lookup_inverses_comm, proof_data);
        Base::serialize_to_buffer(z_perm_comm, proof_data);

        // Libra pre-sumcheck
        Base::serialize_to_buffer(libra_concatenation_commitment, proof_data);
        Base::serialize_to_buffer(libra_sum, proof_data);

        // Committed sumcheck rounds
        for (size_t i = 0; i < log_n; ++i) {
            Base::serialize_to_buffer(sumcheck_round_comms[i], proof_data);
            Base::serialize_to_buffer(sumcheck_round_eval_0s[i], proof_data);
            Base::serialize_to_buffer(sumcheck_round_eval_1s[i], proof_data);
        }

        // Sumcheck evaluations
        Base::serialize_to_buffer(sumcheck_evaluations, proof_data);

        // Libra post-sumcheck
        Base::serialize_to_buffer(libra_claimed_evaluation, proof_data);
        Base::serialize_to_buffer(libra_grand_sum_commitment, proof_data);
        Base::serialize_to_buffer(libra_quotient_commitment, proof_data);

        // Libra SmallSubgroupIPA evaluations
        Base::serialize_to_buffer(libra_concatenation_eval, proof_data);
        Base::serialize_to_buffer(libra_shifted_grand_sum_eval, proof_data);
        Base::serialize_to_buffer(libra_grand_sum_eval, proof_data);
        Base::serialize_to_buffer(libra_quotient_eval, proof_data);

        // Translation data
        Base::serialize_to_buffer(translation_masking_comm, proof_data);
        Base::serialize_to_buffer(translation_op_eval, proof_data);
        Base::serialize_to_buffer(translation_Px_eval, proof_data);
        Base::serialize_to_buffer(translation_Py_eval, proof_data);
        Base::serialize_to_buffer(translation_z1_eval, proof_data);
        Base::serialize_to_buffer(translation_z2_eval, proof_data);
        Base::serialize_to_buffer(translation_masking_eval, proof_data);
        Base::serialize_to_buffer(translation_grand_sum_commitment, proof_data);
        Base::serialize_to_buffer(translation_quotient_commitment, proof_data);
        Base::serialize_to_buffer(translation_concatenation_eval, proof_data);
        Base::serialize_to_buffer(translation_shifted_grand_sum_eval, proof_data);
        Base::serialize_to_buffer(translation_grand_sum_eval, proof_data);
        Base::serialize_to_buffer(translation_quotient_eval, proof_data);

        // TripleIPA pow-tensor masking claim
        Base::serialize_to_buffer(pow_mask_commitment, proof_data);
        Base::serialize_to_buffer(pow_mask_evaluation, proof_data);

        // Final Shplonk Q
        Base::serialize_to_buffer(final_shplonk_q_comm, proof_data);

        BB_ASSERT_EQ(proof_data.size(), old_size);
    }
};

// ============================================================================
// Flavor Specializations
// ============================================================================

// Ultra flavors (non-ZK)
template <> struct StructuredProof<UltraFlavor> : UltraStructuredProofBase<UltraFlavor> {};
template <> struct StructuredProof<UltraKeccakFlavor> : UltraStructuredProofBase<UltraKeccakFlavor> {};

// Ultra ZK flavors
template <> struct StructuredProof<UltraZKFlavor> : UltraZKStructuredProofBase<UltraZKFlavor> {};
template <> struct StructuredProof<UltraKeccakZKFlavor> : UltraZKStructuredProofBase<UltraKeccakZKFlavor> {};

// Mega flavors
template <> struct StructuredProof<MegaFlavor> : MegaStructuredProofBase<MegaFlavor> {};
template <> struct StructuredProof<MegaZKFlavor> : MegaZKStructuredProofBase<MegaZKFlavor> {};

// Translator flavor
template <> struct StructuredProof<TranslatorFlavor> : TranslatorStructuredProofBase<TranslatorFlavor> {};

// ECCVM flavor
template <> struct StructuredProof<ECCVMFlavor> : ECCVMStructuredProofBase<ECCVMFlavor> {};

} // namespace bb
