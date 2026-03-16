#ifndef __wasm__
/**
 * @file batch_verifier_stress.test.cpp
 * @brief End-to-end stress test with real transaction proofs: wall-clock time on 4 cores.
 *
 * Loads pre-generated ChonkProofs from disk (11 real Aztec transaction flows).
 * Generate them with: barretenberg/cpp/scripts/generate_batch_verifier_test_proofs.sh
 *
 * Env: CHONK_TEST_PROOFS_DIR (default: /tmp/chonk-proofs)
 */

#include "batch_verifier_test_utils.hpp"
#include "batch_verifier_types.hpp"
#include "ipa_batch_processor.hpp"

#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/chonk/chonk_proof.hpp"
#include "barretenberg/chonk/chonk_verifier.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/eccvm/eccvm_flavor.hpp"

#include <algorithm>
#include <chrono>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <random>
#include <sstream>
#include <vector>

using namespace bb;
namespace fs = std::filesystem;

// A loaded proof with its name and VK
struct LoadedProof {
    std::string name;
    ChonkProof proof;
    std::shared_ptr<MegaZKFlavor::VKAndHash> vk_and_hash;
};

static std::vector<uint8_t> read_file_bytes(const fs::path& path)
{
    std::ifstream f(path, std::ios::binary);
    return { std::istreambuf_iterator<char>(f), std::istreambuf_iterator<char>() };
}

static fs::path get_proofs_dir()
{
    const char* env = std::getenv("CHONK_TEST_PROOFS_DIR");
    return env ? fs::path(env) : fs::path("/tmp/chonk-proofs");
}

class RealProofStressTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    using ResultCollector = test_utils::ResultCollector;

    static std::vector<LoadedProof> load_proofs()
    {
        auto dir = get_proofs_dir();
        std::vector<LoadedProof> proofs;

        if (!fs::exists(dir)) {
            return proofs;
        }

        using VK = Chonk::MegaVerificationKey;

        for (const auto& entry : fs::directory_iterator(dir)) {
            if (!entry.is_directory()) {
                continue;
            }
            auto proof_path = entry.path() / "proof";
            auto vk_path = entry.path() / "vk";
            if (!fs::exists(proof_path) || !fs::exists(vk_path)) {
                continue;
            }

            auto proof_buf = read_file_bytes(proof_path);
            auto proof_fields = many_from_buffer<fr>(proof_buf);
            auto chonk_proof = ChonkProof::from_field_elements(proof_fields);

            auto vk_buf = read_file_bytes(vk_path);
            auto vk = std::make_shared<VK>(from_buffer<VK>(vk_buf));
            auto vk_and_hash = std::make_shared<MegaZKFlavor::VKAndHash>(vk);

            proofs.push_back(LoadedProof{
                .name = entry.path().filename().string(),
                .proof = std::move(chonk_proof),
                .vk_and_hash = std::move(vk_and_hash),
            });
        }

        std::sort(proofs.begin(), proofs.end(), [](const auto& a, const auto& b) { return a.name < b.name; });
        return proofs;
    }

    static ChonkProof corrupt_ipa(const ChonkProof& proof) { return test_utils::corrupt_ipa(proof); }
    static ChonkProof corrupt_sumcheck(const ChonkProof& proof) { return test_utils::corrupt_sumcheck(proof); }

    struct BenchRow {
        std::string label;
        size_t num_proofs;
        uint32_t batch_size;
        double wall_clock_ms;
        size_t verified_ok;
        size_t verified_fail;
        size_t bisected;
    };

    static void print_table(const std::vector<BenchRow>& rows)
    {
        if (rows.empty()) {
            return;
        }
        double baseline_ms = rows[0].wall_clock_ms;

        info("");
        info("  All runs: 4 cores");
        info("  ┌────────────────────────┬─────┬───────┬──────────────────┬───────────┬─────────┐");
        info("  │ Scenario               │  N  │ Batch │ OK / Fail / Bsct │  Wall (s) │ Speedup │");
        info("  ├────────────────────────┼─────┼───────┼──────────────────┼───────────┼─────────┤");

        for (const auto& r : rows) {
            double wall_s = r.wall_clock_ms / 1000.0;
            double speedup = baseline_ms / r.wall_clock_ms;

            std::ostringstream oss;
            oss << "  │ " << std::left << std::setw(22) << r.label << " │ " << std::right << std::setw(3)
                << r.num_proofs << " │ " << std::setw(5) << r.batch_size << " │ " << std::setw(3) << r.verified_ok
                << " / " << std::setw(3) << r.verified_fail << " / " << std::setw(3) << r.bisected << "  │ "
                << std::setw(8) << std::fixed << std::setprecision(2) << wall_s << "s │ " << std::setw(6)
                << std::setprecision(1) << speedup << "x │";
            info(oss.str());
        }

        info("  └────────────────────────┴─────┴───────┴──────────────────┴───────────┴─────────┘");
        info("");
    }
};

/**
 * @brief Wall-clock time to verify N real transaction proofs on 4 cores.
 *
 * Loads 11 real proofs from disk (different tx types: deploys, transfers, AMM, storage, bridge).
 * Replicates them to reach target count, then benchmarks:
 * 1. Baseline: sequential on 4 cores
 * 2. Batch pipeline at various batch sizes
 * 3. Corruption scenarios
 */
TEST_F(RealProofStressTests, TimeToVerifyRealProofs)
{
    BB_DISABLE_ASSERTS();

    auto loaded = load_proofs();
    if (loaded.empty()) {
        GTEST_SKIP() << "No proofs found. Run: barretenberg/cpp/scripts/generate_batch_verifier_test_proofs.sh";
    }

    info("Loaded ", loaded.size(), " real transaction proofs:");
    for (const auto& p : loaded) {
        info("  ",
             p.name,
             " (mega=",
             p.proof.mega_proof.size(),
             " goblin.ipa=",
             p.proof.goblin_proof.ipa_proof.size(),
             ")");
    }

    // Build VK list — all loaded proofs may have different VKs
    // Map each proof to its VK index
    std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> vks;
    std::vector<uint32_t> vk_indices; // per loaded proof
    for (const auto& p : loaded) {
        vks.push_back(p.vk_and_hash);
        vk_indices.push_back(static_cast<uint32_t>(vks.size() - 1));
    }

    // Target: 120 proofs by cycling through loaded proofs
    constexpr size_t TARGET_N = 120;
    struct ProofRef {
        size_t loaded_idx;
    };
    std::vector<ProofRef> proof_refs;
    proof_refs.reserve(TARGET_N);
    for (size_t i = 0; i < TARGET_N; i++) {
        proof_refs.push_back({ i % loaded.size() });
    }

    constexpr uint32_t NUM_CORES = 4;
    std::vector<BenchRow> rows;

    // Helper to build requests from proof_refs with optional corruption
    auto make_requests = [&](size_t num_good, size_t num_ipa_bad, size_t num_sc_bad) {
        std::vector<VerifyRequest> requests;
        uint64_t id = 1;

        for (size_t i = 0; i < num_good; i++) {
            auto& ref = proof_refs[i % proof_refs.size()];
            requests.push_back(VerifyRequest{
                .request_id = id++,
                .proof = loaded[ref.loaded_idx].proof,
                .vk_index = vk_indices[ref.loaded_idx],
            });
        }
        for (size_t i = 0; i < num_ipa_bad; i++) {
            auto& ref = proof_refs[(num_good + i) % proof_refs.size()];
            requests.push_back(VerifyRequest{
                .request_id = id++,
                .proof = corrupt_ipa(loaded[ref.loaded_idx].proof),
                .vk_index = vk_indices[ref.loaded_idx],
            });
        }
        for (size_t i = 0; i < num_sc_bad; i++) {
            auto& ref = proof_refs[(num_good + num_ipa_bad + i) % proof_refs.size()];
            requests.push_back(VerifyRequest{
                .request_id = id++,
                .proof = corrupt_sumcheck(loaded[ref.loaded_idx].proof),
                .vk_index = vk_indices[ref.loaded_idx],
            });
        }

        std::mt19937 rng(42);
        std::shuffle(requests.begin(), requests.end(), rng);
        return requests;
    };

    auto run_batch =
        [&](const std::string& label, size_t num_good, size_t num_ipa_bad, size_t num_sc_bad, uint32_t batch_size) {
            auto requests = make_requests(num_good, num_ipa_bad, num_sc_bad);
            const size_t total = requests.size();

            ResultCollector collector;
            IPABatchProcessor processor;
            processor.start(vks, NUM_CORES, batch_size, collector.callback());

            auto t0 = std::chrono::steady_clock::now();
            for (auto& req : requests) {
                processor.enqueue(std::move(req));
            }
            processor.stop();
            auto t1 = std::chrono::steady_clock::now();
            double wall_ms = std::chrono::duration<double, std::milli>(t1 - t0).count();

            size_t ok = 0, fail = 0, bisect = 0;
            for (const auto& r : collector.results) {
                if (r.verified())
                    ok++;
                else
                    fail++;
                if (r.batch_failure_count > 0)
                    bisect++;
            }
            EXPECT_EQ(collector.results.size(), total);

            info("  ", label, ": ", wall_ms / 1000.0, "s (", ok, " ok, ", fail, " fail)");
            rows.push_back(BenchRow{
                .label = label,
                .num_proofs = total,
                .batch_size = batch_size,
                .wall_clock_ms = wall_ms,
                .verified_ok = ok,
                .verified_fail = fail,
                .bisected = bisect,
            });
        };

    // ── Row 0: Baseline sequential (4 cores for IPA, no batching) ──
    {
        set_parallel_for_concurrency(NUM_CORES);
        auto ipa_vk = VerifierCommitmentKey<curve::Grumpkin>{ ECCVMFlavor::ECCVM_FIXED_SIZE };

        // Warmup
        {
            ChonkNativeVerifier v(loaded[0].vk_and_hash);
            auto r = v.reduce_to_ipa_claim(loaded[0].proof);
            auto t = std::make_shared<NativeTranscript>(r.ipa_proof);
            IPA<curve::Grumpkin>::reduce_verify(ipa_vk, r.ipa_claim, t);
        }

        auto t0 = std::chrono::steady_clock::now();
        for (size_t i = 0; i < TARGET_N; i++) {
            auto& ref = proof_refs[i];
            ChonkNativeVerifier verifier(loaded[ref.loaded_idx].vk_and_hash);
            auto result = verifier.reduce_to_ipa_claim(loaded[ref.loaded_idx].proof);
            ASSERT_TRUE(result.all_checks_passed) << "Proof " << i << " (" << loaded[ref.loaded_idx].name << ") failed";
            auto transcript = std::make_shared<NativeTranscript>(result.ipa_proof);
            bool ok = IPA<curve::Grumpkin>::reduce_verify(ipa_vk, result.ipa_claim, transcript);
            ASSERT_TRUE(ok) << "IPA failed for proof " << i;
        }
        auto t1 = std::chrono::steady_clock::now();
        double wall_ms = std::chrono::duration<double, std::milli>(t1 - t0).count();

        info("  Sequential: ", wall_ms / 1000.0, "s");
        rows.push_back(BenchRow{
            .label = "Sequential (4 cores)",
            .num_proofs = TARGET_N,
            .batch_size = 1,
            .wall_clock_ms = wall_ms,
            .verified_ok = TARGET_N,
            .verified_fail = 0,
            .bisected = 0,
        });
    }

    // ── Batch pipeline, all good, varying batch size ──
    for (uint32_t bs : { 8u, 16u, 30u, 60u, 120u }) {
        run_batch("Batch=" + std::to_string(bs) + " all good", TARGET_N, 0, 0, bs);
    }

    // ── Corruption scenarios at batch=30 ──
    {
        size_t n_bad = TARGET_N / 10; // 12 bad
        run_batch("10% IPA-bad", TARGET_N - n_bad, n_bad, 0, 30);
        run_batch("10% sumcheck-bad", TARGET_N - n_bad, 0, n_bad, 30);
        run_batch("10% mixed bad", TARGET_N - 2 * n_bad, n_bad, n_bad, 30);
        run_batch("50% IPA-bad", TARGET_N / 2, TARGET_N / 2, 0, 30);
    }

    print_table(rows);
}

#endif // __wasm__
