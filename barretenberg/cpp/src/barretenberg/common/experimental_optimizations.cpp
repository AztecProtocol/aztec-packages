#include "experimental_optimizations.hpp"

#include "throw_or_abort.hpp"

#include <cstdlib>
#include <mutex>
#include <string>
#include <string_view>

namespace bb {
namespace detail {

bool experimental_optimizations_enabled = false;
bool rollup_experimental_optimizations_enabled = false;
bool avm_experimental_optimizations_enabled = false;
} // namespace detail

namespace {

bool read_flag(const char* name)
{
    const char* value = std::getenv(name);
    if (value != nullptr && std::string_view(value) != "0" && std::string_view(value) != "1") {
        throw_or_abort(std::string(name) + " must be 0 or 1");
    }
    return value != nullptr && std::string_view(value) == "1";
}

} // namespace

void initialize_experimental_optimizations(ExperimentalOptimizationsMode mode)
{
    static std::once_flag initialized;
    bool frozen_here = false;
    std::call_once(initialized, [mode, &frozen_here] {
        // Malformed values are rejected in both modes, so a typo is reported by every command.
        const bool bb_enabled = read_flag("BB_EXPERIMENTAL_OPTIMIZATIONS");
        const bool rollup_enabled = read_flag("ROLLUP_EXPERIMENTAL_OPTIMIZATIONS");
        const bool avm_enabled = read_flag("AVM_EXPERIMENTAL_OPTIMIZATIONS");
        if (mode == ExperimentalOptimizationsMode::FromEnvironment) {
            detail::experimental_optimizations_enabled = bb_enabled;
            detail::rollup_experimental_optimizations_enabled = rollup_enabled;
            detail::avm_experimental_optimizations_enabled = avm_enabled;
        }
        frozen_here = true;
    });
    if (mode == ExperimentalOptimizationsMode::ForceDisabled && !frozen_here &&
        (vk_affecting_experimental_optimizations_enabled() || detail::avm_experimental_optimizations_enabled)) {
        throw_or_abort("experimental optimizations were already initialized as enabled");
    }
}

void require_vk_derivation_allowed(const char* operation)
{
    if (vk_affecting_experimental_optimizations_enabled()) {
        throw_or_abort(std::string(operation) +
                       ": a verification key cannot be derived with BB_EXPERIMENTAL_OPTIMIZATIONS or "
                       "ROLLUP_EXPERIMENTAL_OPTIMIZATIONS enabled. Derive it in a process with both disabled and "
                       "supply it as a precomputed key.");
    }
}

} // namespace bb
