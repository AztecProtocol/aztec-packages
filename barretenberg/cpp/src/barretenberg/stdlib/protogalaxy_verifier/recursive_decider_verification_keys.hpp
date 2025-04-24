// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/stdlib/protogalaxy_verifier/recursive_decider_verification_key.hpp"

namespace bb::stdlib::recursion::honk {
template <IsRecursiveFlavor Flavor_, size_t NUM_> struct RecursiveDeciderVerificationKeys_ {
    using Flavor = Flavor_;
    using Builder = typename Flavor::CircuitBuilder;
    using VerificationKey = typename Flavor::VerificationKey;
    using DeciderVK = RecursiveDeciderVerificationKey_<Flavor>;
    using ArrayType = std::array<std::shared_ptr<DeciderVK>, NUM_>;

  public:
    static constexpr size_t NUM = NUM_;
    static constexpr size_t BATCHED_EXTENDED_LENGTH = (Flavor::MAX_TOTAL_RELATION_LENGTH - 1 + NUM - 1) * (NUM - 1) + 1;
    ArrayType _data;
    std::shared_ptr<DeciderVK> const& operator[](size_t idx) const { return _data[idx]; }
    typename ArrayType::iterator begin() { return _data.begin(); };
    typename ArrayType::iterator end() { return _data.end(); };
    Builder* builder;

    RecursiveDeciderVerificationKeys_(Builder* builder,
                                      const std::shared_ptr<DeciderVK>& accumulator,
                                      const std::vector<std::shared_ptr<VerificationKey>>& vks)
        : builder(builder)
    {
        ASSERT(vks.size() == NUM - 1);

        _data[0] = accumulator;

        size_t idx = 1;
        for (auto& vk : vks) {
            _data[idx] = std::make_shared<DeciderVK>(builder, vk);
            idx++;
        }
    }

    /**
     * @brief Get the max log circuit size from the set of decider verification keys
     *
     * @return size_t
     */
    size_t get_max_log_circuit_size() const
    {
        size_t max_log_circuit_size{ 0 };
        for (auto key : _data) {
            // TODO(https://github.com/AztecProtocol/barretenberg/issues/1283): Suspicious get_value.
            max_log_circuit_size = std::max(
                max_log_circuit_size,
                static_cast<size_t>(static_cast<uint32_t>(key->verification_key->log_circuit_size.get_value())));
        }
        return max_log_circuit_size;
    }

    /**
     * @brief Get the precomputed commitments grouped by commitment index
     * @example If the commitments are grouped as in
     *           VK 0    VK 1    VK 2    VK 3
     *           q_c_0   q_c_1   q_c_2   q_c_3
     *           q_l_0   q_l_1   q_l_2   q_l_3
     *             ⋮        ⋮        ⋮       ⋮
     *
     *  then this function outputs this matrix of group elements as a vector of rows,
     *  i.e. it outputs {{q_c_0, q_c_1, q_c_2, q_c_3}, {q_l_0, q_l_1, q_l_2, q_l_3},...}.
     *  The "commitment index" is the index of the row.
     */
    std::vector<std::vector<typename Flavor::Commitment>> get_precomputed_commitments() const
    {
        const size_t num_commitments_to_fold = _data[0]->verification_key->get_all().size();
        std::vector<std::vector<typename Flavor::Commitment>> result(num_commitments_to_fold,
                                                                     std::vector<typename Flavor::Commitment>(NUM));
        for (size_t idx = 0; auto& commitment_at_idx : result) {
            for (auto [elt, key] : zip_view(commitment_at_idx, _data)) {
                elt = key->verification_key->get_all()[idx];
            }
            idx++;
        }
        return result;
    }

    /**
     * @brief Get the witness commitments grouped by commitment index
     * @details See get_precomputed_commitments; this is essentially the same.
     */
    std::vector<std::vector<typename Flavor::Commitment>> get_witness_commitments() const
    {
        const size_t num_commitments_to_fold = _data[0]->witness_commitments.get_all().size();
        std::vector<std::vector<typename Flavor::Commitment>> result(num_commitments_to_fold,
                                                                     std::vector<typename Flavor::Commitment>(NUM));
        for (size_t idx = 0; auto& commitment_at_idx : result) {
            for (auto [elt, key] : zip_view(commitment_at_idx, _data)) {
                elt = key->witness_commitments.get_all()[idx];
            }
            idx++;
        }
        return result;
    }

    /**
     * @brief Get the alphas grouped by commitment index
     * @details See get_precomputed_commitments; this is essentially the same.
     */
    std::vector<std::vector<typename Flavor::FF>> get_alphas() const
    {
        const size_t num_alphas_to_fold = _data[0]->alphas.size();
        std::vector<std::vector<typename Flavor::FF>> result(num_alphas_to_fold, std::vector<typename Flavor::FF>(NUM));
        for (size_t idx = 0; auto& alpha_at_idx : result) {
            for (auto [elt, key] : zip_view(alpha_at_idx, _data)) {
                elt = key->alphas[idx];
            }
            idx++;
        }
        return result;
    }

    /**
     * @brief Get the relation parameters grouped by commitment index
     * @details See get_precomputed_commitments; this is essentially the same.
     */
    std::vector<std::vector<typename Flavor::FF>> get_relation_parameters() const
    {
        const size_t num_params_to_fold = _data[0]->relation_parameters.get_to_fold().size();
        std::vector<std::vector<typename Flavor::FF>> result(num_params_to_fold, std::vector<typename Flavor::FF>(NUM));
        for (size_t idx = 0; auto& params_at_idx : result) {
            for (auto [elt, key] : zip_view(params_at_idx, _data)) {
                elt = key->relation_parameters.get_to_fold()[idx];
            }
            idx++;
        }
        return result;
    }
};
} // namespace bb::stdlib::recursion::honk
