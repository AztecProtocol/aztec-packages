#include "barretenberg/msm_service/msm_ipc_server.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/msm_service/generated/msm_ipc_server.hpp"
#include "barretenberg/msm_service/msm_handlers.hpp"
#include "barretenberg/srs/global_crs.hpp"

namespace bb::msm_service {

// Like the generated serve(), but with explicit SHM ring sizing: the ring rejects any
// message larger than half its capacity minus the 4-byte length prefix (see
// ipc_runtime/shm_common.hpp), and MSM request chunks run to 2^22 scalars = 128 MiB, so
// the request ring must be comfortably above 256 MiB.
static void serve_with_options(const std::string& input_path,
                               MsmService& ctx,
                               size_t request_ring_size,
                               size_t response_ring_size)
{
    ipc::ServerOptions opts;
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
                       size_t response_ring_size)
{
    MsmService ctx;
    // The facade's GPU dispatch activates when ecc_gpu is linked into this binary AND
    // BB_MSM_GPU is set (the CLI defaults it on for GPU builds). Report the env state.
    ctx.gpu = std::getenv("BB_MSM_GPU") != nullptr;

    const std::filesystem::path crs = crs_path.empty() ? srs::bb_crs_path() : std::filesystem::path(crs_path);
    info("bb-msm: loading ", num_points, " BN254 SRS points from ", crs.string());
    srs::init_bn254_net_crs_factory(crs);
    auto monomial_points = srs::get_bn254_crs_factory()->get_crs(num_points)->get_monomial_points();
    ctx.points.assign(monomial_points.begin(), monomial_points.end());
    info("bb-msm: resident points=", ctx.points.size(), " gpu=", ctx.gpu, " serving on ", input_path);

    serve_with_options(input_path, ctx, request_ring_size, response_ring_size);
    return 0;
}

} // namespace bb::msm_service
