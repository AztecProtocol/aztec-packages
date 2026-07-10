#include "barretenberg/msm_service/msm_handlers.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"

#include <atomic>
#include <cstring>
#include <memory>

namespace bb::scalar_multiplication::gpu {
// Provided by ecc_gpu when the daemon is built with -DGPU=ON (linked whole-archive);
// null otherwise. Weak so CPU-only builds of bb-msm still link.
__attribute__((weak)) bool try_pippenger_bn254_canonical_slot(
    curve::BN254::Element& out,
    size_t slot,
    size_t start_index,
    const uint64_t* scalars_canonical,
    size_t num_scalars,
    std::span<const curve::BN254::AffineElement> points) noexcept;
} // namespace bb::scalar_multiplication::gpu

namespace bb::msm_service {

namespace {

using Curve = curve::BN254;
using Fr = Curve::ScalarField;
using AffineElement = Curve::AffineElement;

bool gpu_linked()
{
    return &scalar_multiplication::gpu::try_pippenger_bn254_canonical_slot != nullptr;
}

// Validates one request span against the resident table and executes it on the given
// slot. Wire scalars are canonical standard form (4x uint64 LE limbs, in [0, r)). On a
// GPU daemon the buffer is consumed in place; GPU errors are a hard failure (no silent
// CPU fallback — a degraded GPU box must be visible). The CPU path exists for GPU-less
// test builds only and converts to Montgomery form first.
bool run_span(MsmService& ctx,
              size_t slot,
              uint64_t start_index,
              std::span<const uint8_t> scalars,
              std::span<const uint8_t> fingerprint,
              AffineElement& out,
              std::string& error)
{
    if (scalars.size() % sizeof(Fr) != 0) {
        error = "scalars byte length not a multiple of 32";
        return false;
    }
    const size_t num_scalars = scalars.size() / sizeof(Fr);
    if (start_index + num_scalars > ctx.points.size()) {
        error = "request exceeds resident SRS prefix (" + std::to_string(start_index + num_scalars) + " > " +
                std::to_string(ctx.points.size()) + ")";
        return false;
    }
    if (fingerprint.size() != sizeof(AffineElement) ||
        std::memcmp(fingerprint.data(), &ctx.points[start_index], sizeof(AffineElement)) != 0) {
        error = "points fingerprint mismatch: caller table is not the resident SRS";
        return false;
    }

    std::span<const AffineElement> points(ctx.points.data(), ctx.points.size());
    if (ctx.gpu) {
        if (!gpu_linked()) {
            error = "daemon started in GPU mode but no GPU backend is linked";
            return false;
        }
        Curve::Element result;
        // NOLINTNEXTLINE(cppcoreguidelines-pro-type-reinterpret-cast)
        if (!scalar_multiplication::gpu::try_pippenger_bn254_canonical_slot(
                result, slot, start_index, reinterpret_cast<const uint64_t*>(scalars.data()), num_scalars, points)) {
            error = "GPU MSM failed (start=" + std::to_string(start_index) + " n=" + std::to_string(num_scalars) +
                    ") — refusing CPU fallback";
            return false;
        }
        out = AffineElement(result);
        return true;
    }

    // CPU (test) mode: canonical wire form -> Montgomery for the CPU pippenger.
    std::vector<Fr> mont(num_scalars);
    std::memcpy(mont.data(), scalars.data(), scalars.size());
    for (auto& s : mont) {
        s.self_to_montgomery_form();
    }
    PolynomialSpan<const Fr> poly_span{ start_index, std::span<const Fr>(mont.data(), mont.size()) };
    out = AffineElement(scalar_multiplication::pippenger_unsafe<Curve>(poly_span, points));
    return true;
}

std::vector<uint8_t> to_bytes(const AffineElement& p)
{
    std::vector<uint8_t> bytes(sizeof(AffineElement));
    std::memcpy(bytes.data(), &p, sizeof(AffineElement));
    return bytes;
}

} // namespace

void MsmService::start_workers(size_t num_workers)
{
    for (size_t slot = 0; slot < num_workers; ++slot) {
        workers.emplace_back([this, slot] {
            for (;;) {
                std::function<void(size_t)> task;
                {
                    std::unique_lock lock(queue_mutex);
                    queue_cv.wait(lock, [this] { return stopping || !tasks.empty(); });
                    if (stopping && tasks.empty()) {
                        return;
                    }
                    task = std::move(tasks.front());
                    tasks.pop_front();
                }
                task(slot);
            }
        });
    }
}

void MsmService::enqueue(std::function<void(size_t)> task)
{
    {
        std::lock_guard lock(queue_mutex);
        tasks.push_back(std::move(task));
    }
    queue_cv.notify_one();
}

MsmService::~MsmService()
{
    {
        std::lock_guard lock(queue_mutex);
        stopping = true;
    }
    queue_cv.notify_all();
    for (auto& worker : workers) {
        worker.join();
    }
}

void handle_get_info(MsmService& ctx, wire::MsmGetInfo&&, Responder<wire::MsmGetInfoResponse> respond)
{
    respond.ok({ .gpu = ctx.gpu, .residentPoints = ctx.points.size() });
}

void handle_bn254(MsmService& ctx, wire::MsmBn254&& cmd, Responder<wire::MsmBn254Response> respond)
{
    // Defer to a worker so the reactor thread keeps accepting requests; workers on
    // distinct slots submit to the GPU concurrently.
    auto shared_cmd = std::make_shared<wire::MsmBn254>(std::move(cmd));
    ctx.enqueue([&ctx, shared_cmd, respond](size_t slot) {
        AffineElement result;
        std::string error;
        if (!run_span(ctx, slot, shared_cmd->startIndex, shared_cmd->scalars, shared_cmd->fingerprint, result, error)) {
            respond.error(error);
            return;
        }
        respond.ok({ .result = to_bytes(result) });
    });
}

void handle_bn254_batch(MsmService& ctx, wire::MsmBn254Batch&& cmd, Responder<wire::MsmBn254BatchResponse> respond)
{
    // Fan the batch out across the worker pool span-by-span: shared state aggregates
    // results in order; the worker that completes the final span responds. Any span
    // failure responds with the first error (exactly-once via the atomic flag).
    struct BatchState {
        wire::MsmBn254Batch cmd;
        std::vector<uint8_t> results;
        std::vector<size_t> scalar_offsets;
        std::atomic<size_t> remaining{ 0 };
        std::atomic<bool> failed{ false };
        std::string error;
        std::mutex error_mutex;
        Responder<wire::MsmBn254BatchResponse> respond;
        BatchState(wire::MsmBn254Batch&& c, Responder<wire::MsmBn254BatchResponse> r)
            : cmd(std::move(c))
            , respond(std::move(r))
        {}
    };
    auto state = std::make_shared<BatchState>(std::move(cmd), std::move(respond));

    // Validate the layout up front: per-span scalar byte counts must tile the blob.
    const size_t num_spans = state->cmd.spans.size();
    state->scalar_offsets.reserve(num_spans);
    size_t offset = 0;
    for (const auto& span : state->cmd.spans) {
        state->scalar_offsets.push_back(offset);
        offset += span.numScalars * sizeof(Fr);
    }
    if (offset != state->cmd.scalars.size()) {
        state->respond.error("batch scalars blob length (" + std::to_string(state->cmd.scalars.size()) +
                             ") does not match sum of span sizes (" + std::to_string(offset) + ")");
        return;
    }
    if (num_spans == 0) {
        state->respond.ok({ .results = {} });
        return;
    }
    state->results.resize(num_spans * sizeof(AffineElement));
    state->remaining.store(num_spans);

    for (size_t i = 0; i < num_spans; ++i) {
        ctx.enqueue([&ctx, state, i](size_t slot) {
            const auto& span = state->cmd.spans[i];
            if (!state->failed.load()) {
                AffineElement result;
                std::string error;
                std::span<const uint8_t> scalars(state->cmd.scalars.data() + state->scalar_offsets[i],
                                                 span.numScalars * sizeof(Fr));
                if (run_span(ctx,
                             slot,
                             span.startIndex,
                             scalars,
                             { span.fingerprint.data(), span.fingerprint.size() },
                             result,
                             error)) {
                    std::memcpy(state->results.data() + i * sizeof(AffineElement), &result, sizeof(AffineElement));
                } else {
                    std::lock_guard lock(state->error_mutex);
                    if (!state->failed.exchange(true)) {
                        state->error = std::move(error);
                    }
                }
            }
            if (state->remaining.fetch_sub(1) == 1) {
                if (state->failed.load()) {
                    state->respond.error(state->error);
                } else {
                    state->respond.ok({ .results = std::move(state->results) });
                }
            }
        });
    }
}

} // namespace bb::msm_service
