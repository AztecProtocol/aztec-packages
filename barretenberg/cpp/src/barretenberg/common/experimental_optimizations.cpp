#include "experimental_optimizations.hpp"

#include "throw_or_abort.hpp"

#include <cstdlib>
#include <mutex>
#include <string>
#include <string_view>

namespace bb {
namespace detail {

bool experimental_optimizations_enabled = false;
}

void initialize_experimental_optimizations()
{
    static std::once_flag initialized;
    std::call_once(initialized, [] {
        const char* value = std::getenv("BB_EXPERIMENTAL_OPTIMIZATIONS");
        if (value != nullptr && std::string_view(value) != "0" && std::string_view(value) != "1") {
            throw_or_abort("BB_EXPERIMENTAL_OPTIMIZATIONS must be 0 or 1");
        }
        detail::experimental_optimizations_enabled = value != nullptr && std::string_view(value) == "1";
    });
}

} // namespace bb
