// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/ultra_honk/prover_instance.hpp"
#include <memory>
#include <unordered_map>
#include <utility>

namespace bb {

/**
 * @brief Test utility for injecting malicious witness values to test failure modes
 *
 * @details This class allows tests to construct circuits with "malicious" variables that have
 * different witness values in passing vs failing proofs. This enables systematic testing of
 * constraint violations, particularly useful for validating that invalid witnesses correctly
 * fail verification.
 */
template <typename Flavor> class MaliciousWitnessInjector {
  public:
    using Builder = typename Flavor::CircuitBuilder;
    using FF = typename Flavor::FF;
    using ProverInstance = ProverInstance_<Flavor>;

    Builder builder;

  private:
    // Maps variable index to the "bad" value to be injected
    std::unordered_map<uint32_t, FF> malicious_variable_map;

  public:
    /**
     * @brief Add a "good" variable to the builder and specify a malicious value to inject later
     * @details Equivalent to using builder.add_variable(good_val). The malicious value is simply stored to be injected
     * later.
     *
     * @param good_val The honest value
     * @param bad_val The malicious value to be injected for failure testing
     * @return The variable index (same value returned by builder.add_variable)
     */
    uint32_t add_malicious_variable(const FF& good_val, const FF& bad_val)
    {
        uint32_t idx = builder.add_variable(good_val);
        malicious_variable_map[idx] = bad_val;
        return idx;
    }

    /**
     * @brief Create two prover instances, one based on the good witness values and one based on the malicious values
     *
     * @note The builder is finalized during the first instance construction. The second instance reuses the finalized
     * circuit structure but with modified witness values.
     *
     * @return A pair of {good_instance, bad_instance}
     */
    std::pair<std::shared_ptr<ProverInstance>, std::shared_ptr<ProverInstance>> create_instances()
    {
        // Create good instance from original builder (this finalizes the circuit)
        auto good_instance = std::make_shared<ProverInstance>(builder);

        // Create bad instance
        Builder bad_builder = create_builder_with_malicious_witnesses();
        auto bad_instance = std::make_shared<ProverInstance>(bad_builder);

        return { good_instance, bad_instance };
    }

    /**
     * @brief Create a copy of the builder with malicious values injected
     * @details Malicious values are injected based on real_variable_index which means that the entire copy cycle will
     * be updated implicitly.
     */
    Builder create_builder_with_malicious_witnesses()
    {
        // Copy the builder
        Builder bad_builder = builder;

        // Inject faults into the copied builder's variables
        auto& vars = const_cast<std::vector<FF>&>(bad_builder.get_variables());
        for (const auto& [var_idx, bad_val] : malicious_variable_map) {
            // Resolve through real_variable_index to handle copy constraints correctly
            uint32_t real_idx = bad_builder.real_variable_index[var_idx];
            vars[real_idx] = bad_val;
        }

        return bad_builder;
    }
};

} // namespace bb
