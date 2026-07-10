#pragma once
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/msm_service/generated/msm_dispatch.hpp"

#include <cstddef>
#include <mutex>
#include <span>
#include <vector>

namespace bb::msm_service {

// Service context: owns the resident SRS prefix. All MSMs are executed against
// this single points span, so the (GPU) resident-context cache holds exactly one
// entry — one device upload per daemon lifetime.
struct MsmService {
    std::vector<curve::BN254::AffineElement> points;
    bool gpu = false;
    // The underlying MSM backends are internally parallel but not reentrant-safe
    // across requests; serialize request execution for now (coalescing later).
    std::mutex mutex;
};

void handle_get_info(MsmService& ctx, wire::MsmGetInfo&& cmd, Responder<wire::MsmGetInfoResponse> respond);
void handle_bn254(MsmService& ctx, wire::MsmBn254&& cmd, Responder<wire::MsmBn254Response> respond);
void handle_bn254_batch(MsmService& ctx, wire::MsmBn254Batch&& cmd, Responder<wire::MsmBn254BatchResponse> respond);

} // namespace bb::msm_service
