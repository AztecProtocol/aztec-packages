#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/chonk/chonk_verifier.hpp"
#include "barretenberg/chonk/mock_circuit_producer.hpp"
#include "barretenberg/common/interrupt.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/srs/global_crs.hpp"

#include <gtest/gtest.h>

#include <algorithm>
#include <cstdlib>
#include <set>
#include <string>
#include <utility>
#include <vector>

using namespace bb;

namespace {

using CircuitProducer = PrivateFunctionExecutionMockCircuitProducer;
constexpr size_t NUM_APP_CIRCUITS = 2;
// Small apps keep each interrupted run short; every accumulation and proving stage still runs.
constexpr size_t SMALL_LOG_2_NUM_GATES = 5;
// Interior passes injected besides each site's first pass: they land inside long stages (repeated commitments,
// sumcheck rounds), where a site's first pass does not.
constexpr size_t NUM_SPACED_INJECTIONS = 3;

// Observer state; the observer is a plain function pointer, so it reads globals.
std::vector<std::string> passes;
size_t injection_index = 0;
size_t passes_seen = 0;

void record_pass(const char* site)
{
    passes.emplace_back(site);
}

void inject_at_index(const char* /*site*/)
{
    if (passes_seen++ == injection_index) {
        InterruptFlag::request();
    }
}

class ChonkInterrupt : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { srs::init_file_crs_factory(srs::bb_crs_path()); }

    void TearDown() override
    {
        detail::set_interrupt_observer(nullptr);
        InterruptFlag::clear();
    }

    // Accumulates the mock stack and proves it on this thread, armed as a bbapi Chonk command is.
    static std::pair<ChonkProof, std::shared_ptr<MegaZKFlavor::VKAndHash>> prove_mock_stack()
    {
        InterruptScope scope;
        CircuitProducer producer(NUM_APP_CIRCUITS);
        Chonk ivc{ producer.circuit_kinds() };
        for (size_t i = 0; i < producer.total_num_circuits; ++i) {
            producer.construct_and_accumulate_next_circuit(ivc, { .log2_num_gates = SMALL_LOG_2_NUM_GATES });
        }
        return { ivc.prove(), ivc.get_hiding_kernel_vk_and_hash() };
    }

    // The first pass of every distinct site plus evenly spaced passes. BB_INTERRUPT_SWEEP_LIMIT=N keeps N of them,
    // spread over the run, for the sanitizer build.
    static std::vector<size_t> injection_indices()
    {
        std::vector<size_t> indices;
        std::set<std::string> seen;
        for (size_t i = 0; i < passes.size(); ++i) {
            if (seen.insert(passes[i]).second) {
                indices.push_back(i);
            }
        }
        for (size_t k = 1; k <= NUM_SPACED_INJECTIONS; ++k) {
            indices.push_back(k * (passes.size() - 1) / NUM_SPACED_INJECTIONS);
        }
        std::sort(indices.begin(), indices.end());
        indices.erase(std::unique(indices.begin(), indices.end()), indices.end());
        const char* limit_env = std::getenv("BB_INTERRUPT_SWEEP_LIMIT");
        const size_t limit = limit_env != nullptr ? std::strtoul(limit_env, nullptr, 10) : 0;
        if (limit == 0 || limit >= indices.size()) {
            return indices;
        }
        std::vector<size_t> spread;
        for (size_t k = 0; k < limit; ++k) {
            spread.push_back(indices[k * indices.size() / limit]);
        }
        return spread;
    }
};

} // namespace

// Folding, decider, batch merge, the prove phases, and Honk commitments and sumcheck rounds, on mock circuits. The
// ACIR path is swept through bbapi on a pinned flow (bbapi_interrupt.test.cpp).
TEST_F(ChonkInterrupt, SweepThenProve)
{
    passes.clear();
    detail::set_interrupt_observer(record_pass);
    prove_mock_stack();
    detail::set_interrupt_observer(nullptr);
    ASSERT_FALSE(passes.empty());

    const auto indices = injection_indices();
    info("injecting at ", indices.size(), " of ", passes.size(), " armed passes");
    for (const size_t index : indices) {
        SCOPED_TRACE("pass " + std::to_string(index) + " of " + std::to_string(passes.size()) + " at " + passes[index]);
        injection_index = index;
        passes_seen = 0;
        detail::set_interrupt_observer(inject_at_index);
        EXPECT_THROW(prove_mock_stack(), InterruptedException);
        detail::set_interrupt_observer(nullptr);
        EXPECT_TRUE(InterruptFlag::clear());

        auto [proof, vk_and_hash] = prove_mock_stack();
        ChonkNativeVerifier verifier(vk_and_hash);
        EXPECT_TRUE(verifier.verify(proof));
    }
}
