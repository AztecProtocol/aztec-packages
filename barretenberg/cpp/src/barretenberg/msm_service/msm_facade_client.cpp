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
        // Connection or protocol failure (daemon absent/died, table mismatch):
        // disable for the rest of the process and fall back to the CPU path.
        info("bb-msm client: disabling IPC MSM offload: ", e.what());
        conn.failed = true;
        conn.client.reset();
        return false;
    }
}

} // namespace bb::scalar_multiplication::msm_ipc
