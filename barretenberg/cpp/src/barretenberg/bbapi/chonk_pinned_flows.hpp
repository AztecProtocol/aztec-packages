#pragma once
/**
 * @file chonk_pinned_flows.hpp
 * @brief Test-only location of the pinned Chonk flows (`barretenberg/cpp/scripts/chonk_inputs.sh download`).
 */
#include <cstdlib>
#include <filesystem>

namespace bb::bbapi::testing {

/**
 * @brief Directory holding one `<flow>/ivc-inputs.msgpack` per pinned flow.
 * @details CHONK_PINNED_IVC_INPUTS_DIR overrides it; otherwise it is resolved from AZTEC_REPO_ROOT, else from a working
 * directory of `barretenberg/cpp/build*`, where the test binaries run.
 */
inline std::filesystem::path pinned_flows_root()
{
    if (const char* inputs_dir = std::getenv("CHONK_PINNED_IVC_INPUTS_DIR");
        inputs_dir != nullptr && *inputs_dir != '\0') {
        return std::filesystem::path{ inputs_dir };
    }
    std::filesystem::path repo_root;
    if (const char* root = std::getenv("AZTEC_REPO_ROOT"); root != nullptr && *root != '\0') {
        repo_root = root;
    } else {
        repo_root = std::filesystem::weakly_canonical(std::filesystem::current_path() / "../../..");
    }
    return repo_root / "barretenberg/cpp/chonk-pinned-flows";
}

} // namespace bb::bbapi::testing
