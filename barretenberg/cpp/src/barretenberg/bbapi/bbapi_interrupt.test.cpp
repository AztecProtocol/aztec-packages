#include "barretenberg/bbapi/bbapi_chonk.hpp"
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/bbapi/chonk_pinned_flows.hpp"
#include "barretenberg/chonk/private_execution_steps.hpp"
#include "barretenberg/common/interrupt.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/srs/global_crs.hpp"

#include <gtest/gtest.h>

#include <algorithm>
#include <chrono>
#include <filesystem>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

using namespace bb;
using namespace bb::bbapi;

namespace {

// The smallest stack Chonk accepts: an app, the init and tail kernels, the hiding kernel.
const std::vector<CircuitKind> MINIMAL_KINDS{
    CircuitKind::App, CircuitKind::Kernel, CircuitKind::Kernel, CircuitKind::HidingKernel
};

// The flag and the observer are process-wide; every test leaves both cleared.
class ChonkInterrupt : public ::testing::Test {
  protected:
    void SetUp() override { InterruptFlag::clear(); }
    void TearDown() override
    {
        detail::set_interrupt_observer(nullptr);
        InterruptFlag::clear();
    }
};

} // namespace

TEST_F(ChonkInterrupt, QueuedCommandsFailAtEntryWithTheInterruption)
{
    BBApiRequest request;
    ChonkStart{ .kinds = MINIMAL_KINDS }.execute(request);
    InterruptFlag::request();

    // The entry check runs before the bytecode is parsed, so any bytes do.
    ChonkLoad load{ .circuit = { .name = "app", .bytecode = { 1, 2, 3 } }, .kind = CircuitKind::App };
    EXPECT_THROW(std::move(load).execute(request), InterruptedException);
    EXPECT_EQ(request.ivc_in_progress, nullptr);

    // The session is already gone; a command queued behind the interrupted one still reports the interruption.
    EXPECT_THROW(ChonkAccumulate{ .witness = {} }.execute(request), InterruptedException);
    EXPECT_THROW(ChonkProve{}.execute(request), InterruptedException);
}

TEST_F(ChonkInterrupt, ChonkStopReportsTheFlagAndReleasesTheSession)
{
    BBApiRequest request;
    ChonkStart{ .kinds = MINIMAL_KINDS }.execute(request);
    InterruptFlag::request();

    EXPECT_TRUE(ChonkStop{}.execute(request).interrupted);
    EXPECT_EQ(request.ivc_in_progress, nullptr);
    EXPECT_FALSE(ChonkStop{}.execute(request).interrupted);
}

TEST_F(ChonkInterrupt, AnyFailureReleasesTheSession)
{
    BBApiRequest request;
    ChonkStart{ .kinds = MINIMAL_KINDS }.execute(request);

    EXPECT_ANY_THROW(ChonkAccumulate{ .witness = {} }.execute(request)); // no circuit loaded
    EXPECT_EQ(request.ivc_in_progress, nullptr);
    try {
        ChonkProve{}.execute(request);
        FAIL() << "a released session must not prove";
    } catch (const std::runtime_error& error) {
        EXPECT_NE(std::string(error.what()).find("Chonk not started"), std::string::npos) << error.what();
    }
}

namespace {

const char* const PINNED_FLOW = "ecdsar1+transfer_0_recursions+private_fpc";

// Observer state for the pinned-flow tests. The observer is a plain function pointer, so it reads globals.
std::vector<std::string> sites_in_order;
std::vector<std::pair<std::string, std::chrono::steady_clock::time_point>> site_times;
std::string injection_site;
bool injection_fired = false;

void record_first_passes(const char* site)
{
    if (std::find(sites_in_order.begin(), sites_in_order.end(), site) == sites_in_order.end()) {
        sites_in_order.emplace_back(site);
    }
}

void record_times(const char* site)
{
    site_times.emplace_back(site, std::chrono::steady_clock::now());
}

void inject_at_first_pass(const char* site)
{
    if (!injection_fired && injection_site == site) {
        injection_fired = true;
        InterruptFlag::request();
    }
}

class ChonkInterruptPinned : public ChonkInterrupt {
  protected:
    static void SetUpTestSuite() { srs::init_file_crs_factory(srs::bb_crs_path()); }

    void SetUp() override
    {
        ChonkInterrupt::SetUp();
        const auto inputs = bb::bbapi::testing::pinned_flows_root() / PINNED_FLOW / "ivc-inputs.msgpack";
        if (!std::filesystem::exists(inputs)) {
            GTEST_SKIP() << inputs << " missing; run barretenberg/cpp/scripts/chonk_inputs.sh download";
        }
        steps = PrivateExecutionStepRaw::load_and_decompress(inputs);
        ASSERT_FALSE(steps.empty());
    }

    // Runs the whole flow on `request`, as bb.js issues it, and returns the proof.
    ChonkProof prove_flow(BBApiRequest& request) const
    {
        auto flow = steps;
        std::vector<CircuitKind> kinds;
        kinds.reserve(flow.size());
        for (const auto& step : flow) {
            kinds.push_back(step.kind);
        }
        ChonkStart{ .kinds = std::move(kinds) }.execute(request);
        for (auto& step : flow) {
            ChonkLoad{ .circuit = { .name = std::move(step.function_name),
                                    .bytecode = std::move(step.bytecode),
                                    .verification_key = std::move(step.vk) },
                       .kind = step.kind }
                .execute(request);
            ChonkAccumulate{ .witness = std::move(step.witness) }.execute(request);
        }
        return ChonkProve{}.execute(request).proof;
    }

    bool verifies(ChonkProof proof) const
    {
        return ChonkVerify{ .proof = std::move(proof), .vk = steps.back().vk }.execute().valid;
    }

    std::vector<std::string> list_sites(BBApiRequest& request) const
    {
        sites_in_order.clear();
        detail::set_interrupt_observer(record_first_passes);
        prove_flow(request);
        detail::set_interrupt_observer(nullptr);
        return sites_in_order;
    }

    // Interrupts the flow at the first pass of `site`, fences, then proves the whole flow on the same request.
    void interrupt_at_then_prove(BBApiRequest& request, const std::string& site) const
    {
        injection_site = site;
        injection_fired = false;
        detail::set_interrupt_observer(inject_at_first_pass);
        EXPECT_THROW(prove_flow(request), InterruptedException);
        detail::set_interrupt_observer(nullptr);
        EXPECT_TRUE(injection_fired);
        EXPECT_TRUE(ChonkStop{}.execute(request).interrupted);
        EXPECT_EQ(request.ivc_in_progress, nullptr);
        EXPECT_TRUE(verifies(prove_flow(request)));
    }

    std::vector<PrivateExecutionStepRaw> steps;
};

} // namespace

// The bbapi path the mock-circuit sweep cannot reach: command entries, ACIR translation, step stages, prove phases.
TEST_F(ChonkInterruptPinned, Sweep)
{
    BBApiRequest request;
    const auto sites = list_sites(request);
    ASSERT_FALSE(sites.empty());
    info("sweeping ", sites.size(), " sites");
    const auto crs = srs::get_bn254_crs_factory()->get_crs(1);
    for (const auto& site : sites) {
        SCOPED_TRACE("site: " + site);
        interrupt_at_then_prove(request, site);
    }
    EXPECT_EQ(srs::get_bn254_crs_factory()->get_crs(1), crs) << "the CRS was reloaded";
}

// Measurement only: the longest stretch between consecutive armed interrupt sites on the request thread.
TEST_F(ChonkInterruptPinned, DISABLED_GapProfile)
{
    BBApiRequest request;
    site_times.clear();
    detail::set_interrupt_observer(record_times);
    prove_flow(request);
    detail::set_interrupt_observer(nullptr);
    ASSERT_GT(site_times.size(), 1U);

    std::vector<double> gaps_ms;
    size_t longest = 1;
    for (size_t i = 1; i < site_times.size(); ++i) {
        gaps_ms.push_back(
            std::chrono::duration<double, std::milli>(site_times[i].second - site_times[i - 1].second).count());
        if (gaps_ms.back() > gaps_ms[longest - 1]) {
            longest = i;
        }
    }
    auto sorted = gaps_ms;
    std::sort(sorted.begin(), sorted.end());
    info("armed site passes: ", site_times.size());
    info("max gap ms: ",
         gaps_ms[longest - 1],
         " between ",
         site_times[longest - 1].first,
         " and ",
         site_times[longest].first);
    info("p99 gap ms: ", sorted[sorted.size() * 99 / 100]);
}
