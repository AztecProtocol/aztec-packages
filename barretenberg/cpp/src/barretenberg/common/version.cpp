#include "version.hpp"

namespace bb {
// This is updated in-place by bootstrap.sh during the release process. This prevents
// the version string from needing to be present at build-time, simplifying e.g. caching.
const char* const BB_VERSION_PLACEHOLDER = "00000000.00000000.00000000";
} // namespace bb
