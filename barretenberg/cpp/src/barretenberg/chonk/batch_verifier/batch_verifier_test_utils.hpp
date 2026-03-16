#pragma once
/**
 * @file batch_verifier_test_utils.hpp
 * @brief Shared test utilities for batch verifier tests: proof corruption helpers and result collection.
 */

#include "barretenberg/chonk/chonk_proof.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "batch_verifier_types.hpp"

#include <chrono>
#include <condition_variable>
#include <functional>
#include <mutex>
#include <vector>

#include <gtest/gtest.h>

namespace bb::test_utils {

/** @brief Return a copy of the proof with a corrupted IPA proof element (targets Phase 2: batch IPA). */
inline ChonkProof corrupt_ipa(const ChonkProof& proof)
{
    ChonkProof corrupted = proof;
    EXPECT_FALSE(corrupted.goblin_proof.ipa_proof.empty());
    corrupted.goblin_proof.ipa_proof[0] = corrupted.goblin_proof.ipa_proof[0] + bb::fr(1);
    return corrupted;
}

/** @brief Return a copy of the proof with a corrupted mega proof element (targets Phase 1: sumcheck/goblin). */
inline ChonkProof corrupt_sumcheck(const ChonkProof& proof)
{
    ChonkProof corrupted = proof;
    EXPECT_FALSE(corrupted.mega_proof.empty());
    corrupted.mega_proof[0] = corrupted.mega_proof[0] + bb::fr(1);
    return corrupted;
}

/**
 * @brief Thread-safe collector for VerifyResult callbacks, with blocking wait.
 */
struct ResultCollector {
    std::mutex mutex;
    std::condition_variable cv;
    std::vector<VerifyResult> results;

    /** @brief Return a callback that appends results and notifies waiters. */
    std::function<void(VerifyResult)> callback()
    {
        return [this](VerifyResult result) {
            {
                std::lock_guard lock(mutex);
                results.push_back(std::move(result));
            }
            cv.notify_all();
        };
    }

    /** @brief Block until at least @p count results have been collected, or timeout. */
    void wait_for(size_t count, std::chrono::seconds timeout = std::chrono::seconds(120))
    {
        auto deadline = std::chrono::steady_clock::now() + timeout;
        std::unique_lock lock(mutex);
        ASSERT_TRUE(cv.wait_until(lock, deadline, [&] { return results.size() >= count; }))
            << "Timed out waiting for " << count << " results, got " << results.size();
    }

    /** @brief Find a result by request_id. Asserts if not found. */
    VerifyResult find(uint64_t request_id)
    {
        std::lock_guard lock(mutex);
        for (const auto& r : results) {
            if (r.request_id == request_id) {
                return r;
            }
        }
        EXPECT_TRUE(false) << "Result not found for request_id " << request_id;
        return {};
    }
};

} // namespace bb::test_utils
