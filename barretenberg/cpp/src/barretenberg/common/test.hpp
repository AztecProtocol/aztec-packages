#pragma once
#include <gtest/gtest.h>

#include <cstdlib>
#include <filesystem>

#ifdef DISABLE_HEAVY_TESTS
#define HEAVY_TEST(x, y) TEST(x, DISABLED_##y)
#define HEAVY_TEST_F(x, y) TEST_F(x, DISABLED_##y)
#define HEAVY_TYPED_TEST(x, y) TYPED_TEST(x, DISABLED_##y)
#else
#define HEAVY_TEST(x, y) TEST(x, y)
#define HEAVY_TEST_F(x, y) TEST_F(x, y)
#define HEAVY_TYPED_TEST(x, y) TYPED_TEST(x, y)
#endif

namespace bb {
/**
 * @brief The aztec-packages checkout a test reads its data files from: $AZTEC_REPO_ROOT, else three levels above the
 * working directory, which scripts/run_test.sh sets to the build directory (barretenberg/cpp/build*).
 * @details A wasm test runs under scripts/wasmtime.sh, which preopens only the working directory, so it is started
 * from the checkout with AZTEC_REPO_ROOT=. rather than relying on the default.
 */
inline std::filesystem::path test_repo_root()
{
    if (const char* env = std::getenv("AZTEC_REPO_ROOT"); env != nullptr && *env != '\0') {
        return std::filesystem::path{ env };
    }
    return std::filesystem::weakly_canonical(std::filesystem::current_path() / "../../..");
}
} // namespace bb
