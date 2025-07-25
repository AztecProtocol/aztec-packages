// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/honk/execution_trace/mega_execution_trace.hpp"
#include "barretenberg/ultra_honk/decider_proving_key.hpp"

namespace bb::proving_key_inspector {

// Helper for extracting a native Flavor from either a native or recursive flavor.
template <typename Flavor, bool = IsRecursiveFlavor<Flavor>> struct NativeFlavorHelper {
    using type = Flavor;
};
template <typename Flavor> struct NativeFlavorHelper<Flavor, true> {
    using type = typename Flavor::NativeFlavor;
};

/**
 * @brief Compute the hash of the verification key that results from constructing a proving key from the given circuit.
 * @details This is useful for identifying the point of divergence for two circuits that are expected to be identical,
 * for example, the circuit constructed from a given acir program with or without a genuine witness.
 *
 * @tparam Flavor Determines the type of PK and VK to be constructed.
 * @tparam Builder The builder for the circuit in question.
 */
template <typename Flavor, typename Builder>
uint256_t compute_vk_hash(const Builder& circuit_in,
                          const TraceSettings& trace_settings = TraceSettings{ AZTEC_TRACE_STRUCTURE })
    requires(IsMegaFlavor<Flavor> && IsMegaBuilder<Builder>)
{
    using NativeFlavor = typename NativeFlavorHelper<Flavor>::type;
    using DeciderProvingKey = typename bb::DeciderProvingKey_<NativeFlavor>;
    using VerificationKey = NativeFlavor::VerificationKey;

    Builder circuit = circuit_in; // Copy the circuit to avoid modifying the original

    DeciderProvingKey proving_key{ circuit, trace_settings };
    VerificationKey verification_key{ proving_key.get_precomputed() };

    return verification_key.hash();
}

// A catch-all for Flavor/Builder combinations where the VK hash is not implemented.
template <typename Flavor, typename Builder>
uint256_t compute_vk_hash(const Builder&, const TraceSettings& = TraceSettings{ AZTEC_TRACE_STRUCTURE })
    requires(!IsMegaFlavor<Flavor> || !IsMegaBuilder<Builder>)
{
    info("compute_vk_hash: Not implemented for this Flavor/Builder, returning 0.");
    return 0;
}

// Determine whether a polynomial has at least one non-zero coefficient
bool is_non_zero(auto& polynomial)
{
    for (auto& coeff : polynomial) {
        if (!coeff.is_zero()) {
            return true;
        }
    }
    return false;
}

/**
 * @brief Utility for indicating which polynomials in a decider proving key are identically zero
 *
 * @param decider_proving_key
 */
void inspect_proving_key(auto& decider_proving_key)
{
    auto& prover_polys = decider_proving_key->prover_polynomials;
    std::vector<std::string> zero_polys;
    for (auto [label, poly] : zip_view(prover_polys.get_labels(), prover_polys.get_all())) {
        if (!is_non_zero(poly)) {
            zero_polys.emplace_back(label);
        }
    }
    if (zero_polys.empty()) {
        info("\nProving Key Inspector: All prover polynomials are non-zero.");
    } else {
        info("\nProving Key Inspector: The following prover polynomials are identically zero: ");
        for (const std::string& label : zero_polys) {
            info("\t", label);
        }
    }
    info();
}

} // namespace bb::proving_key_inspector
