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

void initialize_experimental_optimizations()
{
    static std::once_flag initialized;
    std::call_once(initialized, [] {
        const bool bb_enabled = read_flag("BB_EXPERIMENTAL_OPTIMIZATIONS");
        const bool rollup_enabled = read_flag("ROLLUP_EXPERIMENTAL_OPTIMIZATIONS");
        const bool avm_enabled = read_flag("AVM_EXPERIMENTAL_OPTIMIZATIONS");
        detail::experimental_optimizations_enabled = bb_enabled;
        detail::rollup_experimental_optimizations_enabled = rollup_enabled;
        detail::avm_experimental_optimizations_enabled = avm_enabled;
    });
}

} // namespace bb
