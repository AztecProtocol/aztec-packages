#include "debug_log.hpp"
#include <cstdlib>
#include <stdexcept>
#include <string>
#ifdef BBERG_DEBUG_LOG
namespace barretenberg {
void _debug_log_impl(const std::string& log_str)
{
    const char* abort_cond = std::getenv("DEBUG_LOG_ABORT");
    if (abort_cond != nullptr && log_str.find(abort_cond) != std::string::npos) {
        throw std::runtime_error("Abort condition met: " + log_str);
    }
    if (abort_cond == nullptr) {
        std::cout << log_str << std::endl;
    }
}
} // namespace barretenberg
#endif
