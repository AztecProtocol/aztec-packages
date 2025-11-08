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
 * @brief Test utility for injecting witness faults to create failing proofs
 *
 * @details This class allows tests to construct circuits with "malicious" variables that have
 * different witness values in passing vs failing proofs. This enables systematic testing of
 * constraint violations, particularly useful for validating that invalid witnesses correctly
 * fail verification.
 *
 * Example usage:
 * @code
 *   FaultInjector<UltraFlavor> injector;
 *
 *   // Build circuit with a malicious witness
 *   size_t rom_id = injector.builder.create_ROM_array(10);
 *   auto bad_witness = injector.add_malicious_variable(42, 666); // good=42, bad=666
 *   injector.builder.set_ROM_element(rom_id, 0, bad_witness);
 *
 *   // Create both instances
 *   auto [good, bad] = injector.create_instances();
 *
 *   // Good instance should verify
 *   prove_and_verify(good, true);
 *
 *   // Bad instance should fail
 *   prove_and_verify(bad, false);
 * @endcode
 *
 * @tparam Flavor The proving system flavor (UltraFlavor, MegaFlavor, etc.)
 */
template <typename Flavor> class FaultInjector {
  public:
    using Builder = typename Flavor::CircuitBuilder;
    using FF = typename Flavor::FF;
    using ProverInstance = ProverInstance_<Flavor>;

    /**
     * @brief The circuit builder - use this to construct your circuit
     * @details All circuit construction should be done via this builder. Variables marked as malicious
     * via add_malicious_variable will have different values in the good vs bad instances.
     */
    Builder builder;

  private:
    // Maps variable index to the "bad" value it should have in the faulty proof
    std::unordered_map<uint32_t, FF> fault_map;

  public:
    /**
     * @brief Add a variable with different values for good vs faulty proofs
     *
     * @details The variable will have `good_val` in the passing proof and `bad_val` in the failing proof.
     * This allows testing constraint violations by providing invalid witnesses.
     *
     * @note If this variable is later involved in copy constraints (assert_equal), the fault will
     * propagate to all variables in the equivalence class since they share the same real_variable_index.
     *
     * @param good_val The value for the passing proof
     * @param bad_val The value for the failing proof
     * @return The variable index (use this like any other circuit variable)
     */
    uint32_t add_malicious_variable(const FF& good_val, const FF& bad_val)
    {
        uint32_t idx = builder.add_variable(good_val);
        fault_map[idx] = bad_val;
        return idx;
    }

    /**
     * @brief Create both good and bad prover instances
     *
     * @details Creates two ProverInstances:
     * 1. Good instance: Built from the original builder with all "good" witness values
     * 2. Bad instance: Built from a copy of the builder with faults injected
     *
     * The builder is finalized during the first instance construction. The second instance
     * reuses the finalized circuit structure but with modified witness values.
     *
     * @return A pair of {good_instance, bad_instance}
     */
    std::pair<std::shared_ptr<ProverInstance>, std::shared_ptr<ProverInstance>> create_instances()
    {
        // Create good instance from original builder (this finalizes the circuit)
        auto good_instance = std::make_shared<ProverInstance>(builder);

        // Copy the builder for the bad instance
        Builder bad_builder = builder;

        // Inject faults into the copied builder's variables
        auto& vars = const_cast<std::vector<FF>&>(bad_builder.get_variables());
        for (const auto& [var_idx, bad_val] : fault_map) {
            // Resolve through real_variable_index to handle copy constraints correctly
            uint32_t real_idx = bad_builder.real_variable_index[var_idx];
            vars[real_idx] = bad_val;
        }

        // Create bad instance from the modified copy
        // Note: finalization is skipped since builder.circuit_finalized is already true
        auto bad_instance = std::make_shared<ProverInstance>(bad_builder);

        return { good_instance, bad_instance };
    }

    /**
     * @brief Create a builder with faults injected for CircuitChecker testing
     *
     * @details Creates a copy of the builder with faults injected. Use this with CircuitChecker::check()
     * to get precise information about which relation fails and at which row.
     *
     * @return A builder with malicious witness values
     */
    Builder create_faulty_builder()
    {
        // Copy the builder
        Builder bad_builder = builder;

        // Inject faults into the copied builder's variables
        auto& vars = const_cast<std::vector<FF>&>(bad_builder.get_variables());
        for (const auto& [var_idx, bad_val] : fault_map) {
            // Resolve through real_variable_index to handle copy constraints correctly
            uint32_t real_idx = bad_builder.real_variable_index[var_idx];
            vars[real_idx] = bad_val;
        }

        return bad_builder;
    }
};

} // namespace bb
