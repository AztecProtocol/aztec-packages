#pragma once
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/msm_service/generated/msm_dispatch.hpp"

#include <condition_variable>
#include <cstddef>
#include <deque>
#include <functional>
#include <mutex>
#include <thread>
#include <vector>

namespace bb::msm_service {

/**
 * Service context: owns the resident SRS prefix and a worker pool. Handlers validate on
 * the reactor thread and defer execution to a worker (the generated Responder supports
 * replying later from another thread), so requests from different clients overlap on
 * the device. Each worker is pinned to one GPU context slot: slots have independent
 * resident contexts, so submission is contention-free at the cost of one resident
 * points copy per worker.
 */
struct MsmService {
    std::vector<curve::BN254::AffineElement> points;
    bool gpu = false;

    void start_workers(size_t num_workers);
    void enqueue(std::function<void(size_t slot)> task);
    ~MsmService();

  private:
    std::mutex queue_mutex;
    std::condition_variable queue_cv;
    std::deque<std::function<void(size_t)>> tasks;
    std::vector<std::thread> workers;
    bool stopping = false;
};

void handle_get_info(MsmService& ctx, wire::MsmGetInfo&& cmd, Responder<wire::MsmGetInfoResponse> respond);
void handle_bn254(MsmService& ctx, wire::MsmBn254&& cmd, Responder<wire::MsmBn254Response> respond);
void handle_bn254_batch(MsmService& ctx, wire::MsmBn254Batch&& cmd, Responder<wire::MsmBn254BatchResponse> respond);

} // namespace bb::msm_service
