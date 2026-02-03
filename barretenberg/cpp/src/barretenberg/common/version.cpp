#include "version.hpp"

namespace bb {
// This is updated in-place by bootstrap.sh during the release process. This prevents
// the version string from needing to be present at build-time, simplifying e.g. caching.
// The sentinel prefix allows inject_version to reliably find the version location even
// after a version has already been injected, enabling re-injection for cached binaries.
// Format: "BARRETENBERG_VERSION_SENTINEL" followed by version space "00000000.00000000.00000000"
// The inject_version script writes the version starting at the offset after the sentinel.
const char* const BB_VERSION_PLACEHOLDER = "BARRETENBERG_VERSION_SENTINEL00000000.00000000.00000000";
} // namespace bb
