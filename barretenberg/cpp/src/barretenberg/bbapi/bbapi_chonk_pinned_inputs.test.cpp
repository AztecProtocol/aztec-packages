#include "barretenberg/bbapi/bbapi_chonk.hpp"
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/chonk/chonk_proof.hpp"
#include "barretenberg/chonk/private_execution_steps.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/srs/global_crs.hpp"

#include <gtest/gtest.h>

#include <algorithm>
#include <cstdint>
#include <cstdlib>
#include <filesystem>
#include <string>
#include <utility>
#include <vector>

namespace {

class ChonkPinnedIvcInputsTest : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    static std::filesystem::path find_repo_root()
    {
        if (const char* env = std::getenv("AZTEC_REPO_ROOT"); env != nullptr && *env != '\0') {
            return std::filesystem::path{ env };
        }
        return std::filesystem::weakly_canonical(std::filesystem::current_path() / "../../..");
    }

    static std::filesystem::path pinned_inputs_root()
    {
        if (const char* env = std::getenv("CHONK_PINNED_IVC_INPUTS_DIR"); env != nullptr && *env != '\0') {
            return std::filesystem::path{ env };
        }
        return find_repo_root() / "barretenberg/cpp/chonk-pinned-flows";
    }

    static std::vector<std::filesystem::path> find_flow_dirs(const std::filesystem::path& inputs_root)
    {
        std::vector<std::filesystem::path> flows;
        if (!std::filesystem::is_directory(inputs_root)) {
            return flows;
        }
        for (const auto& entry : std::filesystem::directory_iterator(inputs_root)) {
            if (entry.is_directory() && std::filesystem::exists(entry.path() / "ivc-inputs.msgpack")) {
                flows.push_back(entry.path());
            }
        }
        std::sort(flows.begin(), flows.end());
        return flows;
    }

    static void apply_flow_selection(std::vector<std::filesystem::path>& flows)
    {
        if (const char* filter = std::getenv("CHONK_PINNED_IVC_FLOW"); filter != nullptr && *filter != '\0') {
            flows.erase(std::remove_if(flows.begin(),
                                       flows.end(),
                                       [filter](const auto& flow) {
                                           return flow.filename().string().find(filter) == std::string::npos;
                                       }),
                        flows.end());
        }

        const char* limit_env = std::getenv("CHONK_PINNED_IVC_FLOW_LIMIT");
        if (limit_env == nullptr || *limit_env == '\0') {
            return;
        }
        char* end = nullptr;
        const long limit = std::strtol(limit_env, &end, 10);
        if (end != limit_env && *end == '\0' && limit > 0 && static_cast<size_t>(limit) < flows.size()) {
            flows.resize(static_cast<size_t>(limit));
        }
    }

    static void run_flow(const std::filesystem::path& flow_dir)
    {
        const std::filesystem::path inputs_path = flow_dir / "ivc-inputs.msgpack";
        info("ChonkPinnedIvcInputs: loading ", inputs_path.string());

        auto raw_steps = bb::PrivateExecutionStepRaw::load_and_decompress(inputs_path);
        ASSERT_FALSE(raw_steps.empty()) << "no execution steps in " << inputs_path;

        const auto hiding_bytecode = raw_steps.back().bytecode;
        const auto hiding_vk = raw_steps.back().vk;

        bb::bbapi::BBApiRequest request;
        request.vk_policy = bb::bbapi::VkPolicy::DEFAULT;

        bb::bbapi::ChonkStart{ .num_circuits = static_cast<uint32_t>(raw_steps.size()) }.execute(request);

        for (auto& step : raw_steps) {
            const bb::CircuitKind kind = step.kind;
            bb::bbapi::ChonkLoad{ .circuit = { .name = std::move(step.function_name),
                                               .bytecode = std::move(step.bytecode),
                                               .verification_key = std::move(step.vk) },
                                  .kind = kind }
                .execute(request);
            bb::bbapi::ChonkAccumulate{ .witness = std::move(step.witness) }.execute(request);
        }

        auto prove_response = bb::bbapi::ChonkProve{}.execute(request);
<<<<<<< HEAD
        auto vk_response = bb::bbapi::ChonkComputeVk{ .circuit = { .bytecode = hiding_bytecode },
                                                      .kind = bb::CircuitKind::HidingKernel }
                               .execute();
=======
>>>>>>> origin/public-next

        auto verify_response =
            bb::bbapi::ChonkVerify{ .proof = std::move(prove_response.proof), .vk = hiding_vk }.execute();
        EXPECT_TRUE(verify_response.valid) << "ChonkVerify rejected " << flow_dir.filename();
    }
};

TEST_F(ChonkPinnedIvcInputsTest, AllPinnedFlows)
{
    const auto inputs_root = pinned_inputs_root();
    auto flows = find_flow_dirs(inputs_root);
    ASSERT_FALSE(flows.empty()) << "no pinned Chonk flows under " << inputs_root
                                << ". Run `barretenberg/cpp/scripts/chonk_inputs.sh download` first.";

    apply_flow_selection(flows);
    const char* flow_filter = std::getenv("CHONK_PINNED_IVC_FLOW");
    ASSERT_FALSE(flows.empty() && flow_filter != nullptr && *flow_filter != '\0')
        << "CHONK_PINNED_IVC_FLOW='" << flow_filter << "' matched no pinned flows under " << inputs_root;
    ASSERT_FALSE(flows.empty()) << "no pinned Chonk flows found under " << inputs_root;

    for (const auto& flow : flows) {
        SCOPED_TRACE("flow: " + flow.filename().string());
        run_flow(flow);
    }
}

} // namespace
