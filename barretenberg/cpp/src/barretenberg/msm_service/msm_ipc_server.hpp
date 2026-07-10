#pragma once
#include <cstddef>
#include <string>

namespace bb::msm_service {

/**
 * Loads the BN254 SRS prefix (downloading if absent), then serves MSM requests on the
 * given .sock/.shm path until shutdown.
 */
int execute_msm_server(const std::string& input_path, const std::string& crs_path, size_t num_points);

} // namespace bb::msm_service
