#include <benchmark/benchmark.h>

#include "barretenberg/api/file_io.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/srs/global_crs.hpp"

using namespace benchmark;
using namespace bb;

namespace {

/**
 * @brief Benchmark BN254 G1 point decompression (used by SRS compressed download)
 */
void bn254_point_decompression(benchmark::State& state)
{
    constexpr size_t NUM_POINTS = 1 << 17; // 131072 — typical circuit size

    // Read compressed points from disk (32 bytes each, big-endian uint256_t)
    auto compressed_buf = read_file(bb::srs::bb_crs_path() / "bn254_g1_compressed.dat", NUM_POINTS * sizeof(uint256_t));
    std::vector<uint256_t> compressed(NUM_POINTS);
    for (size_t i = 0; i < NUM_POINTS; ++i) {
        compressed[i] = from_buffer<uint256_t>(compressed_buf, i * sizeof(uint256_t));
    }

    for (auto _ : state) {
        std::vector<g1::affine_element> points(NUM_POINTS);
        parallel_for([&](ThreadChunk chunk) {
            for (auto i : chunk.range(NUM_POINTS)) {
                points[i] = g1::affine_element::from_compressed(compressed[i]);
            }
        });
        benchmark::DoNotOptimize(points);
    }
}
BENCHMARK(bn254_point_decompression)->Unit(benchmark::kMillisecond);

} // namespace

BENCHMARK_MAIN();
