// Linked into every <module>_tests executable (cmake/module.cmake), never into a library: the library does not read
// BB_SLOW_LOW_MEMORY on its own, but `BB_SLOW_LOW_MEMORY=1 <module>_tests` should run the tests in low memory mode.
#include "barretenberg/common/low_memory.hpp"

namespace {
[[maybe_unused]] const bool applied = (bb::low_memory::configure_from_environment(), true);
} // namespace
