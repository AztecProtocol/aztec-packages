// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/plonk_honk_shared/execution_trace/mega_execution_trace.hpp"
#include "barretenberg/ultra_honk/decider_proving_key.hpp"

namespace bb::proving_key_inspector {

template <typename Flavor, typename Builder>
typename Flavor::Commitment compute_vk_hash(const Builder&,
                                            const TraceSettings& = TraceSettings{ AZTEC_TRACE_STRUCTURE })
    requires(!IsMegaFlavor<Flavor> || !IsMegaBuilder<typename Flavor::CircuitBuilder>)
{
    info("compute_vk_hash: Unsupported Flavor/Builder, returning default Commitment.");
    return typename Flavor::Commitment{}; // or some safe default
}

template <typename Flavor, typename Builder>
typename Flavor::Commitment compute_vk_hash(
    const Builder& circuit_in, const TraceSettings& trace_settings = TraceSettings{ AZTEC_TRACE_STRUCTURE })
    requires(IsMegaFlavor<Flavor> && IsMegaBuilder<Builder>)
{
    using NativeFlavor = std::conditional_t<IsRecursiveFlavor<Flavor>, typename Flavor::NativeFlavor, Flavor>;
    using DeciderProvingKey = typename bb::DeciderProvingKey_<NativeFlavor>;
    using VerificationKey = NativeFlavor::VerificationKey;

    Builder circuit = circuit_in;

    // WORKTODO: I think this is where we get a complaing baout no pairing points be added. Do we just need to add a
    // default here?

    // TraceSettings trace_settings{ AZTEC_TRACE_STRUCTURE };
    // auto proving_key = std::make_shared<DeciderProvingKey>(circuit, trace_settings);
    auto proving_key = std::make_shared<DeciderProvingKey>(circuit, trace_settings);
    auto verification_key = std::make_shared<VerificationKey>(proving_key->proving_key);

    auto vk_hash = verification_key->hash();
    return vk_hash;
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

/**
 * @brief Print some useful info about polys related to the databus lookup relation
 *
 * @param decider_proving_key
 */
void print_databus_info(auto& decider_proving_key)
{
    info("\nProving Key Inspector: Printing databus gate info.");
    auto& key = decider_proving_key->proving_key;
    for (size_t idx = 0; idx < decider_proving_key->proving_key.circuit_size; ++idx) {
        if (key->q_busread[idx] == 1) {
            info("idx = ", idx);
            info("q_busread = ", key->q_busread[idx]);
            info("w_l = ", key->w_l[idx]);
            info("w_r = ", key->w_r[idx]);
        }
        if (key->calldata_read_counts[idx] > 0) {
            info("idx = ", idx);
            info("read_counts = ", key->calldata_read_counts[idx]);
            info("calldata = ", key->calldata[idx]);
            info("databus_id = ", key->databus_id[idx]);
        }
    }
    info();
}

} // namespace bb::proving_key_inspector
