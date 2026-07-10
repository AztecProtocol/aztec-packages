// Strong definition of the MSM facade's IPC offload hook (declared weak in
// ecc/scalar_multiplication/scalar_multiplication.cpp). Linked into bb binaries via the
// msm_ipc_client library; activates when BB_MSM_SOCKET names a live bb-msm endpoint.
#include "barretenberg/common/log.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/msm_service/generated/msm_ipc_client.hpp"
#include "barretenberg/polynomials/polynomial.hpp"

#include <cstdlib>
#include <cstring>
#include <memory>
#include <mutex>
#include <string_view>

namespace bb::scalar_multiplication::msm_ipc {

namespace {

using Curve = curve::BN254;
using Fr = Curve::ScalarField;
using AffineElement = Curve::AffineElement;

// One connection per process, serialized. The daemon serializes execution anyway;
// a connection pool only helps once the daemon coalesces (future work).
struct Connection {
    std::unique_ptr<msm_service::MsmIpcClient> client;
    std::mutex mutex;
    bool failed = false;
};

Connection& connection()
{
    static Connection conn;
    return conn;
}

// A request the daemon REJECTED (error response, e.g. a non-SRS points table hitting
// the fingerprint guard) falls back to the local path for that MSM only — the
// connection is healthy. Transport failures disable offload for the process.
bool handle_client_error(Connection& conn, const std::exception& e)
{
    if (std::string_view(e.what()).starts_with("Server error: ")) {
        info("bb-msm client: request rejected, using local path: ", e.what());
        return false;
    }
    info("bb-msm client: disabling IPC MSM offload: ", e.what());
    conn.failed = true;
    conn.client.reset();
    return false;
}

} // namespace

bool try_pippenger_bn254(Curve::Element& out,
                         PolynomialSpan<const Fr> scalars,
                         std::span<const AffineElement> points) noexcept
{
    const char* socket_path = std::getenv("BB_MSM_SOCKET");
    if (socket_path == nullptr || scalars.span.empty()) {
        return false;
    }
    auto& conn = connection();
    std::lock_guard lock(conn.mutex);
    if (conn.failed) {
        return false;
    }
    try {
        if (!conn.client) {
            conn.client = std::make_unique<msm_service::MsmIpcClient>(socket_path);
        }
        const size_t start = scalars.start_index;
        if (start + scalars.span.size() > points.size()) {
            return false;
        }
        // The IPC transport caps frames at 256 MiB; split oversized MSMs into
        // sub-range requests and sum the partial results (MSM is linear).
        //
        // Wire scalars are canonical standard form: the Montgomery reduction the GPU
        // needs anyway is done here, written directly into the transport buffer (the
        // SHM ring) via the generated streamed variant — one pass, no intermediate
        // copies on either side.
        static constexpr size_t MAX_CHUNK = size_t{ 1 } << 22;
        Curve::Element sum = Curve::Element::infinity();
        for (size_t offset = 0; offset < scalars.span.size(); offset += MAX_CHUNK) {
            const size_t chunk = std::min(MAX_CHUNK, scalars.span.size() - offset);
            std::vector<uint8_t> fingerprint(sizeof(AffineElement));
            std::memcpy(fingerprint.data(), &points[start + offset], sizeof(AffineElement));

            auto response =
                conn.client->bn254_streamed(start + offset, std::move(fingerprint), chunk * sizeof(Fr), [&](void* buf) {
                    auto* dst = static_cast<uint8_t*>(buf);
                    for (size_t i = 0; i < chunk; ++i) {
                        const Fr canonical = scalars.span[offset + i].from_montgomery_form_reduced();
                        std::memcpy(dst + i * sizeof(Fr), &canonical, sizeof(Fr));
                    }
                });
            if (response.result.size() != sizeof(AffineElement)) {
                return false;
            }
            AffineElement result;
            std::memcpy(&result, response.result.data(), sizeof(AffineElement));
            sum += Curve::Element(result);
        }
        out = sum;
        return true;
    } catch (const std::exception& e) {
        return handle_client_error(conn, e);
    }
}

bool try_pippenger_bn254_batch(std::span<Curve::Element> out,
                               std::span<const PolynomialSpan<const Fr>> scalars_list,
                               std::span<const AffineElement> points) noexcept
{
    const char* socket_path = std::getenv("BB_MSM_SOCKET");
    if (socket_path == nullptr || scalars_list.empty() || out.size() != scalars_list.size()) {
        return false;
    }
    auto& conn = connection();
    std::lock_guard lock(conn.mutex);
    if (conn.failed) {
        return false;
    }
    try {
        if (!conn.client) {
            conn.client = std::make_unique<msm_service::MsmIpcClient>(socket_path);
        }
        for (auto& o : out) {
            o = Curve::Element::infinity();
        }

        // Flatten every requested MSM into chunked wire spans (frame cap), then group
        // wire spans into as few requests as possible. Each wire span's result is
        // accumulated into its owning MSM's output.
        static constexpr size_t MAX_CHUNK_SCALARS = size_t{ 1 } << 22;
        static constexpr size_t MAX_REQUEST_SCALAR_BYTES = size_t{ 192 } << 20;
        struct WireSpan {
            size_t msm_index;
            size_t start;
            size_t scalar_offset;
            size_t num_scalars;
        };
        std::vector<WireSpan> wire_spans;
        for (size_t m = 0; m < scalars_list.size(); ++m) {
            const auto& scalars = scalars_list[m];
            if (scalars.start_index + scalars.span.size() > points.size()) {
                return false;
            }
            for (size_t offset = 0; offset < scalars.span.size(); offset += MAX_CHUNK_SCALARS) {
                const size_t chunk = std::min(MAX_CHUNK_SCALARS, scalars.span.size() - offset);
                wire_spans.push_back({ m, scalars.start_index + offset, offset, chunk });
            }
        }

        size_t next = 0;
        while (next < wire_spans.size()) {
            // Take a frame-cap-sized group of wire spans.
            const size_t group_begin = next;
            size_t group_bytes = 0;
            while (next < wire_spans.size() &&
                   (group_bytes + wire_spans[next].num_scalars * sizeof(Fr) <= MAX_REQUEST_SCALAR_BYTES ||
                    next == group_begin)) {
                group_bytes += wire_spans[next].num_scalars * sizeof(Fr);
                ++next;
            }

            std::vector<msm_service::wire::SpanMeta> metas;
            metas.reserve(next - group_begin);
            for (size_t w = group_begin; w < next; ++w) {
                msm_service::wire::SpanMeta meta;
                meta.startIndex = wire_spans[w].start;
                meta.numScalars = wire_spans[w].num_scalars;
                meta.fingerprint.resize(sizeof(AffineElement));
                std::memcpy(meta.fingerprint.data(), &points[wire_spans[w].start], sizeof(AffineElement));
                metas.push_back(std::move(meta));
            }

            auto response = conn.client->bn254_batch_streamed(std::move(metas), group_bytes, [&](void* buf) {
                auto* dst = static_cast<uint8_t*>(buf);
                for (size_t w = group_begin; w < next; ++w) {
                    const auto& scalars = scalars_list[wire_spans[w].msm_index];
                    for (size_t i = 0; i < wire_spans[w].num_scalars; ++i) {
                        const Fr canonical =
                            scalars.span[wire_spans[w].scalar_offset + i].from_montgomery_form_reduced();
                        std::memcpy(dst, &canonical, sizeof(Fr));
                        dst += sizeof(Fr);
                    }
                }
            });
            if (response.results.size() != (next - group_begin) * sizeof(AffineElement)) {
                return false;
            }
            for (size_t w = group_begin; w < next; ++w) {
                AffineElement result;
                std::memcpy(&result,
                            response.results.data() + (w - group_begin) * sizeof(AffineElement),
                            sizeof(AffineElement));
                out[wire_spans[w].msm_index] += Curve::Element(result);
            }
        }
        return true;
    } catch (const std::exception& e) {
        return handle_client_error(conn, e);
    }
}

} // namespace bb::scalar_multiplication::msm_ipc
