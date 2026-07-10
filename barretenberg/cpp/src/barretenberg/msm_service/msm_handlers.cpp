#include "barretenberg/msm_service/msm_handlers.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"

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
              const std::vector<uint8_t>& scalars,
              const std::vector<uint8_t>& fingerprint,
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
    auto shared_cmd = std::make_shared<wire::MsmBn254Batch>(std::move(cmd));
    ctx.enqueue([&ctx, shared_cmd, respond](size_t slot) {
        std::vector<uint8_t> results;
        results.reserve(shared_cmd->spans.size() * sizeof(AffineElement));
        for (const auto& span : shared_cmd->spans) {
            AffineElement result;
            std::string error;
            if (!run_span(ctx, slot, span.startIndex, span.scalars, span.fingerprint, result, error)) {
                respond.error(error);
                return;
            }
            auto bytes = to_bytes(result);
            results.insert(results.end(), bytes.begin(), bytes.end());
        }
        respond.ok({ .results = std::move(results) });
    });
}

} // namespace bb::msm_service
