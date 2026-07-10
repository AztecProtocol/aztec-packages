#include "barretenberg/msm_service/msm_ipc_server.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/msm_service/generated/msm_ipc_server.hpp"
#include "barretenberg/msm_service/msm_handlers.hpp"
#include "barretenberg/srs/global_crs.hpp"

namespace bb::msm_service {

int execute_msm_server(const std::string& input_path, const std::string& crs_path, size_t num_points)
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

    serve(input_path, ctx);
    return 0;
}

} // namespace bb::msm_service
