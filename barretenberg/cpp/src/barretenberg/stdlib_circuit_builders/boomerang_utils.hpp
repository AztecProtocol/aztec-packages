#pragma once

#include <cstdint>
#include <initializer_list>
#include <unordered_set>
#include <vector>

namespace bb {

/**
 * @brief Utility class for boomerang value detection in circuits
 *
 * @details The boomerang mechanism enables detection of variables used in only one gate,
 * which may indicate bugs. This class manages witness tracking for various constraint types
 * and exclusion lists for intentional single-use witnesses.
 */
class BoomerangUtils {
  public:
    BoomerangUtils() = default;

    // ========================================================================================
    // Used Witnesses - intentional single-use witnesses (e.g., x*(x^-1)=1 for non-zero checks)
    // ========================================================================================

    const std::vector<uint32_t>& get_used_witnesses() const { return used_witnesses; }

    /**
     * @brief Add a witness index to the boomerang exclusion list
     * @param var_idx Witness index to add to the boomerang exclusion list
     */
    void update_used_witnesses(uint32_t var_idx) { used_witnesses.emplace_back(var_idx); }

    /**
     * @brief Add a list of witness indices to the boomerang exclusion list
     * @param used_indices List of witness indices to add to the boomerang exclusion list
     */
    void update_used_witnesses(const std::vector<uint32_t>& used_indices)
    {
        used_witnesses.reserve(used_witnesses.size() + used_indices.size());
        for (const auto& it : used_indices) {
            used_witnesses.emplace_back(it);
        }
    }

    // ========================================================================================
    // Finalize Witnesses - witnesses created during finalization (isolated subcircuits)
    // ========================================================================================

    const std::unordered_set<uint32_t>& get_finalize_witnesses() const { return finalize_witnesses; }

    /**
     * @brief Add a witness index to the finalize exclusion list
     * @param var_idx Witness index to add to the finalize exclusion list
     */
    void update_finalize_witnesses(uint32_t var_idx) { finalize_witnesses.insert(var_idx); }

    /**
     * @brief Add a list of witness indices to the finalize exclusion list
     * @param finalize_indices List of witness indices to add to the finalize exclusion list
     */
    void update_finalize_witnesses(const std::vector<uint32_t>& finalize_indices)
    {
        for (const auto& it : finalize_indices) {
            finalize_witnesses.insert(it);
        }
    }

    // ========================================================================================
    // Constraint Witnesses - per-constraint witness tracking
    // ========================================================================================

    void update_constraint_witnesses(uint32_t var_idx) { constraint_witnesses.emplace(var_idx); }
    void update_constraint_witnesses(std::unordered_set<uint32_t>& witnesses)
    {
        constraint_witnesses.insert(witnesses.begin(), witnesses.end());
        witnesses.clear();
    }
    std::unordered_set<uint32_t> get_constraint_witnesses() const { return constraint_witnesses; }

    /**
     * @brief Save current constraint witnesses to logic storage and clear for next constraint
     */
    void save_and_clear_logic_witnesses()
    {
        logic_witnesses.emplace_back(std::move(constraint_witnesses));
        constraint_witnesses.clear();
    }

    /**
     * @brief Get all logic witnesses organized per constraint
     * @return Vector of witness sets, one per logic constraint
     */
    const std::vector<std::unordered_set<uint32_t>>& get_all_logic_witnesses() const { return logic_witnesses; }

    /**
     * @brief Save current constraint witnesses to AES128 storage and clear for next constraint
     */
    void save_and_clear_aes128_witnesses()
    {
        aes128_witnesses.emplace_back(std::move(constraint_witnesses));
        constraint_witnesses.clear();
    }

    /**
     * @brief Get all AES128 witnesses organized per constraint
     * @return Vector of witness sets, one per AES128 constraint
     */
    const std::vector<std::unordered_set<uint32_t>>& get_all_aes128_witnesses() const { return aes128_witnesses; }

  private:
    // Witnesses that can be in one gate, but that's intentional
    std::vector<uint32_t> used_witnesses;

    // Shared accumulator for constraint witnesses - cleared after each constraint is processed
    std::unordered_set<uint32_t> constraint_witnesses;

    // Per-constraint storage for different constraint types
    std::vector<std::unordered_set<uint32_t>> logic_witnesses;
    std::vector<std::unordered_set<uint32_t>> aes128_witnesses;

    // Witnesses that appear in finalize method
    std::unordered_set<uint32_t> finalize_witnesses;
};

} // namespace bb
