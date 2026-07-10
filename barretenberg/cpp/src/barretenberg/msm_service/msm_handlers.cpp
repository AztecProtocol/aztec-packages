#include "barretenberg/msm_service/msm_handlers.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"

#include <cstring>

namespace bb::msm_service {

namespace {

using Curve = curve::BN254;
using Fr = Curve::ScalarField;
using AffineElement = Curve::AffineElement;

// Validates one request span against the resident table and runs it through the
// standard MSM facade (which applies its own GPU/CPU dispatch). Returns false and
// sets `error` on validation failure.
bool run_span(MsmService& ctx,
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
    // Wire scalars are Montgomery-form fr limbs; reinterpret without copy.
    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-reinterpret-cast)
    std::span<const Fr> scalar_span(reinterpret_cast<const Fr*>(scalars.data()), num_scalars);
    PolynomialSpan<const Fr> poly_span{ start_index, scalar_span };
    out = AffineElement(scalar_multiplication::pippenger_unsafe<Curve>(
        poly_span, std::span<const AffineElement>(ctx.points.data(), ctx.points.size())));
    return true;
}

std::vector<uint8_t> to_bytes(const AffineElement& p)
{
    std::vector<uint8_t> bytes(sizeof(AffineElement));
    std::memcpy(bytes.data(), &p, sizeof(AffineElement));
    return bytes;
}

} // namespace

void handle_get_info(MsmService& ctx, wire::MsmGetInfo&&, Responder<wire::MsmGetInfoResponse> respond)
{
    respond.ok({ .gpu = ctx.gpu, .residentPoints = ctx.points.size() });
}

void handle_bn254(MsmService& ctx, wire::MsmBn254&& cmd, Responder<wire::MsmBn254Response> respond)
{
    std::lock_guard lock(ctx.mutex);
    AffineElement result;
    std::string error;
    if (!run_span(ctx, cmd.startIndex, cmd.scalars, cmd.fingerprint, result, error)) {
        respond.error(error);
        return;
    }
    respond.ok({ .result = to_bytes(result) });
}

void handle_bn254_batch(MsmService& ctx, wire::MsmBn254Batch&& cmd, Responder<wire::MsmBn254BatchResponse> respond)
{
    std::lock_guard lock(ctx.mutex);
    std::vector<uint8_t> results;
    results.reserve(cmd.spans.size() * sizeof(AffineElement));
    for (const auto& span : cmd.spans) {
        AffineElement result;
        std::string error;
        if (!run_span(ctx, span.startIndex, span.scalars, span.fingerprint, result, error)) {
            respond.error(error);
            return;
        }
        auto bytes = to_bytes(result);
        results.insert(results.end(), bytes.begin(), bytes.end());
    }
    respond.ok({ .results = std::move(results) });
}

} // namespace bb::msm_service
