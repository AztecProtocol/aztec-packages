#pragma once
#include <cstddef>
#include <string>

namespace bb::msm_service {

/**
 * Loads the BN254 SRS prefix (downloading if absent), then serves MSM requests on the
 * given .sock/.shm path until shutdown. Ring sizes apply to the SHM transport only; a
 * message must fit in half a ring, so the request ring default (512 MiB) accommodates
 * the client's maximum 128 MiB chunk with headroom.
 */
int execute_msm_server(const std::string& input_path,
                       const std::string& crs_path,
                       size_t num_points,
                       size_t request_ring_size = size_t{ 512 } << 20,
                       size_t response_ring_size = size_t{ 1 } << 20,
                       bool no_gpu = false);

} // namespace bb::msm_service
