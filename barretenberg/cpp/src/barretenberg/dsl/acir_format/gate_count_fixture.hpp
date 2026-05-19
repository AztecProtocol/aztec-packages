#pragma once

#include "barretenberg/dsl/acir_format/test_class_predicate.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"

#include <cstddef>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <mutex>
#include <string>
#include <string_view>
#include <system_error>
#include <type_traits>
#include <unistd.h>

namespace acir_format::gate_count_fixture {

namespace detail {

struct ObserverContext {
    bool active = false;
    std::ofstream out;
    std::mutex mu;
};

inline ObserverContext& context()
{
    static ObserverContext ctx = [] {
        ObserverContext c;
        const char* dir = std::getenv("BB_GATE_COUNT_OBSERVED_DIR");
        if (dir == nullptr || *dir == '\0') {
            return c;
        }
        std::error_code ec;
        std::filesystem::create_directories(dir, ec);
        if (ec) {
            return c;
        }
        const std::string filename = "observed-" + std::to_string(::getpid()) + ".jsonl";
        c.out.open(std::filesystem::path{ dir } / filename, std::ios::out | std::ios::app);
        if (!c.out.is_open()) {
            return c;
        }
        c.active = true;
        return c;
    }();
    return ctx;
}

} // namespace detail

/**
 * @brief Record an observed gate count for a fixture key.
 *
 * When the `BB_GATE_COUNT_OBSERVED_DIR` environment variable is set, appends
 * `{"key":"<key>","value":<value>}` as a JSON line to a per-process file under
 * that directory. The refresh flow (see
 * barretenberg/cpp/scripts/ci_update_gate_counts.sh) harvests every JSON line
 * produced by the test binaries and folds the latest value for each key back
 * into barretenberg/cpp/scripts/gate-counts.json.
 *
 * When the env var is unset this is a no-op, so it is safe to call from any
 * test even outside the refresh flow.
 */
inline void record(std::string_view key, std::size_t value)
{
    auto& ctx = detail::context();
    if (!ctx.active) {
        return;
    }
    std::lock_guard<std::mutex> lock(ctx.mu);
    ctx.out << "{\"key\":\"" << key << "\",\"value\":" << value << "}\n";
    ctx.out.flush();
}

/**
 * @brief String key for a recursive flavor used inside HONK_RECURSION_CONSTANTS.
 *
 * Matches the keys under the `HONK_RECURSION_CONSTANTS` object in
 * barretenberg/cpp/scripts/gate-counts.json. The codegen in
 * gen_gate_count_constants.py and the merge step in
 * merge_observed_gate_counts.py share this naming convention.
 */
template <typename RecursiveFlavor> constexpr std::string_view honk_recursion_flavor_key()
{
    using UltraCircuitBuilder = bb::UltraCircuitBuilder;
    using MegaCircuitBuilder = bb::MegaCircuitBuilder;
    if constexpr (std::is_same_v<RecursiveFlavor, bb::UltraRecursiveFlavor_<UltraCircuitBuilder>>) {
        return "UltraRecursive_Ultra";
    } else if constexpr (std::is_same_v<RecursiveFlavor, bb::UltraZKRecursiveFlavor_<UltraCircuitBuilder>>) {
        return "UltraZKRecursive_Ultra";
    } else if constexpr (std::is_same_v<RecursiveFlavor, bb::UltraRecursiveFlavor_<MegaCircuitBuilder>>) {
        return "UltraRecursive_Mega";
    } else if constexpr (std::is_same_v<RecursiveFlavor, bb::UltraZKRecursiveFlavor_<MegaCircuitBuilder>>) {
        return "UltraZKRecursive_Mega";
    } else if constexpr (std::is_same_v<RecursiveFlavor, bb::MegaZKRecursiveFlavor_<UltraCircuitBuilder>>) {
        return "MegaZKRecursive_Ultra";
    } else {
        return "";
    }
}

constexpr std::string_view predicate_mode_key(PredicateTestCase mode)
{
    switch (mode) {
    case PredicateTestCase::ConstantTrue:
        return "ConstantTrue";
    case PredicateTestCase::WitnessTrue:
    case PredicateTestCase::WitnessFalse:
        return "Witness";
    }
    return "";
}

inline std::string honk_recursion_constants_key(std::string_view flavor,
                                                std::string_view mode,
                                                std::string_view component)
{
    std::string out;
    out.reserve(64);
    out.append("HONK_RECURSION_CONSTANTS::");
    out.append(flavor);
    out.append("::");
    out.append(mode);
    out.append("::");
    out.append(component);
    return out;
}

} // namespace acir_format::gate_count_fixture

/**
 * @brief Convenience macro that pairs a gate-count observation with the
 * existing constexpr expectation. Use at every site that compares a measured
 * gate count to a fixture-derived constant:
 *
 *   const size_t actual = builder.get_num_finalized_gates_inefficient();
 *   BB_OBSERVE_GATE_COUNT("ROOT_ROLLUP_GATE_COUNT", actual);
 *   EXPECT_EQ(actual, ROOT_ROLLUP_GATE_COUNT);
 *
 * In normal mode the macro is a no-op and the EXPECT_EQ enforces the pinned
 * value. In refresh mode (`BB_GATE_COUNT_OBSERVED_DIR` set) the macro records
 * the observed value; the test may still fail, but the refresh script
 * tolerates that and uses the recorded value to update the fixture.
 */
#define BB_OBSERVE_GATE_COUNT(key, value)                                                                              \
    ::acir_format::gate_count_fixture::record((key), static_cast<std::size_t>(value))
