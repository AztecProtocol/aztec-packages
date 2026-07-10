#include "barretenberg/msm_service/msm_ipc_server.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/msm_service/generated/msm_ipc_server.hpp"
#include "barretenberg/msm_service/msm_handlers.hpp"
#include "barretenberg/srs/global_crs.hpp"

namespace bb::scalar_multiplication::gpu {
__attribute__((weak)) bool try_pippenger_bn254_canonical(curve::BN254::Element& out,
                                                         size_t start_index,
                                                         const uint64_t* scalars_canonical,
                                                         size_t num_scalars,
                                                         std::span<const curve::BN254::AffineElement> points) noexcept;
} // namespace bb::scalar_multiplication::gpu

namespace bb::msm_service {

// Like the generated serve(), but with explicit SHM ring sizing: the ring rejects any
// message larger than half its capacity minus the 4-byte length prefix (see
// ipc_runtime/shm_common.hpp), and MSM request chunks run to 2^22 scalars = 128 MiB, so
// the request ring must be comfortably above 256 MiB.
static void serve_with_options(const std::string& input_path,
                               MsmService& ctx,
                               size_t request_ring_size,
                               size_t response_ring_size,
                               size_t max_clients)
{
    ipc::ServerOptions opts;
    opts.max_shm_clients = max_clients;
    opts.shm_request_ring_size = request_ring_size;
    opts.shm_response_ring_size = response_ring_size;
    auto server = ipc::make_server(input_path, opts);
    if (!server) {
        throw std::runtime_error("ipc::make_server: unrecognised path suffix (expected .sock or .shm): " + input_path);
    }
    ipc::install_default_signal_handlers(*server);
    if (!server->listen()) {
        throw std::runtime_error("ipc::IpcServer::listen() failed for " + input_path);
    }
    auto handler = make_msm_handler(ctx);
    server->run_reactor([&handler](int /*client_id*/, std::span<const uint8_t> raw, ipc::IpcServer::Respond respond) {
        handler(raw, std::move(respond));
    });
}

int execute_msm_server(const std::string& input_path,
                       const std::string& crs_path,
                       size_t num_points,
                       size_t request_ring_size,
                       size_t response_ring_size,
                       bool no_gpu,
                       size_t max_clients,
                       size_t num_workers)
{
    MsmService ctx;
    // GPU mode iff the ecc_gpu backend is linked (weak symbol resolved) and not
    // explicitly disabled. GPU-mode failures hard-fail requests; there is no silent
    // CPU fallback inside the daemon.
    ctx.gpu = !no_gpu && (&scalar_multiplication::gpu::try_pippenger_bn254_canonical != nullptr);

    const std::filesystem::path crs = crs_path.empty() ? srs::bb_crs_path() : std::filesystem::path(crs_path);
    info("bb-msm: loading ", num_points, " BN254 SRS points from ", crs.string());
    srs::init_bn254_net_crs_factory(crs);
    auto monomial_points = srs::get_bn254_crs_factory()->get_crs(num_points)->get_monomial_points();
    ctx.points.assign(monomial_points.begin(), monomial_points.end());
    ctx.start_workers(num_workers);
    info("bb-msm: resident points=",
         ctx.points.size(),
         " gpu=",
         ctx.gpu,
         " workers=",
         num_workers,
         " serving on ",
         input_path);

    serve_with_options(input_path, ctx, request_ring_size, response_ring_size, max_clients);
    return 0;
}

} // namespace bb::msm_service
