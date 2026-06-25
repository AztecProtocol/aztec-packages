#include "barretenberg/common/thread.hpp"
#include "barretenberg/eccvm/eccvm_short_monomial_flavor.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/polynomials/gate_separator.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/relations/ecc_vm/ecc_bools_short_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_lookup_short_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_msm_short_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_point_table_short_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_set_short_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_transcript_msm_transition_short_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_transcript_short_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_wnaf_short_relation_impl.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/relations/translator_vm/translator_decomposition_short_relation_impl.hpp"
#include "barretenberg/relations/translator_vm/translator_delta_range_constraint_short_relation_impl.hpp"
#include "barretenberg/relations/translator_vm/translator_extra_short_relations_impl.hpp"
#include "barretenberg/relations/translator_vm/translator_non_native_field_short_relation_impl.hpp"
#include "barretenberg/relations/translator_vm/translator_permutation_short_relation_impl.hpp"
#include "barretenberg/relations/translator_vm/translator_shiftable_first_coeff_zero_short_relation_impl.hpp"
#include "barretenberg/relations/utils.hpp"
#include "barretenberg/sumcheck/sumcheck_round.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"

#include <benchmark/benchmark.h>

#include <algorithm>
#include <atomic>
#include <numeric>
#include <string_view>

namespace {

using namespace bb;

struct ActiveBlock {
    size_t start = 0;
    size_t size = 0;
};

std::vector<ActiveBlock> make_active_blocks(const size_t round_size, const bool fragmented)
{
    if (!fragmented) {
        return { ActiveBlock{ .start = 0, .size = round_size } };
    }

    // Translator-like round-0 shape seen in Chonk: roughly 65% of edge-pairs are active,
    // split across a small number of ranges from concatenated mini-circuit wires plus tails.
    constexpr size_t NUM_BLOCKS = 18;
    constexpr size_t ACTIVE_PERCENT = 65;
    const size_t total_pairs = round_size / 2;
    const size_t active_pairs = std::max<size_t>(NUM_BLOCKS, total_pairs * ACTIVE_PERCENT / 100);
    const size_t inactive_pairs = total_pairs - active_pairs;
    const size_t base_block_pairs = active_pairs / NUM_BLOCKS;
    const size_t extra_block_pairs = active_pairs % NUM_BLOCKS;
    const size_t base_gap_pairs = inactive_pairs / NUM_BLOCKS;
    const size_t extra_gap_pairs = inactive_pairs % NUM_BLOCKS;

    std::vector<ActiveBlock> blocks;
    blocks.reserve(NUM_BLOCKS);
    size_t pair_cursor = 0;
    for (size_t block_idx = 0; block_idx < NUM_BLOCKS; ++block_idx) {
        const size_t gap = base_gap_pairs + (block_idx < extra_gap_pairs ? 1 : 0);
        pair_cursor += gap;
        const size_t block_pairs = base_block_pairs + (block_idx < extra_block_pairs ? 1 : 0);
        blocks.push_back(ActiveBlock{ .start = pair_cursor * 2, .size = block_pairs * 2 });
        pair_cursor += block_pairs;
    }
    return blocks;
}

template <typename FF> std::vector<FF> make_challenges(const size_t log_n)
{
    std::vector<FF> result;
    result.reserve(log_n);
    for (size_t idx = 0; idx < log_n; ++idx) {
        result.emplace_back(static_cast<uint64_t>(idx + 7));
    }
    return result;
}

template <typename Flavor> class SyntheticPolynomials {
  public:
    using FF = typename Flavor::FF;
    using Polynomial = bb::Polynomial<FF>;
    using ProverPolynomials = typename Flavor::ProverPolynomials;

    explicit SyntheticPolynomials(const size_t size)
    {
        storage.reserve(Flavor::NUM_ALL_ENTITIES);
        for (size_t poly_idx = 0; poly_idx < Flavor::NUM_ALL_ENTITIES; ++poly_idx) {
            storage.emplace_back(size);
            const FF value = FF(static_cast<uint64_t>(poly_idx + 3));
            for (auto& coeff : storage.back().coeffs()) {
                coeff = value;
            }
        }
        for (auto [prover_poly, stored_poly] : zip_view(polynomials.get_all(), storage)) {
            prover_poly = stored_poly.share();
        }
        if constexpr (requires(ProverPolynomials& p) { p.row_skip_active_prefix_end = size_t{}; }) {
            polynomials.row_skip_active_prefix_end = size;
        }
    }

    ProverPolynomials polynomials;

  private:
    std::vector<Polynomial> storage;
};

template <typename Flavor, typename Edges> void fill_extended_edges(Edges& edges)
{
    using FF = typename Flavor::FF;
    size_t entity_idx = 0;
    for (auto& edge : edges.get_all()) {
        const FF value = FF(static_cast<uint64_t>(entity_idx + 11));
        for (auto& evaluation : edge.evaluations) {
            evaluation = value;
        }
        ++entity_idx;
    }
}

template <typename Flavor> auto make_relation_parameters()
{
    using FF = typename Flavor::FF;
    bb::RelationParameters<FF> params{};
    params.eta = FF(17);
    params.eta_two = FF(19);
    params.eta_three = FF(23);
    params.beta = FF(29);
    params.gamma = FF(31);
    params.public_input_delta = FF(37);
    params.eccvm_set_permutation_delta = FF(43);
    return params;
}

template <typename Flavor> auto make_subrelation_separators()
{
    using FF = typename Flavor::FF;
    typename SumcheckProverRound<Flavor>::SubrelationSeparators alphas{};
    for (size_t idx = 0; idx < alphas.size(); ++idx) {
        alphas[idx] = FF(static_cast<uint64_t>(idx + 101));
    }
    return alphas;
}

template <typename Flavor>
void accumulate_one_edge(SumcheckProverRound<Flavor>& round,
                         typename SumcheckProverRound<Flavor>::SumcheckTupleOfTuplesOfUnivariates& accum,
                         const auto& extended_edges,
                         const bb::RelationParameters<typename Flavor::FF>& relation_parameters,
                         const typename Flavor::FF& scaling_factor)
{
    round.accumulate_relation_univariates_public(accum, extended_edges, relation_parameters, scaling_factor);
}

template <typename Flavor> void bench_accumulate_relations_only(benchmark::State& state)
{
    using FF = typename Flavor::FF;
    using Round = SumcheckProverRound<Flavor>;
    typename Round::SumcheckTupleOfTuplesOfUnivariates accum{};
    typename Round::ExtendedEdges edges;
    fill_extended_edges<Flavor>(edges);
    auto params = make_relation_parameters<Flavor>();
    Round round(/*initial_round_size=*/2);
    const FF scaling_factor = FF(5);

    for (auto _ : state) {
        accumulate_one_edge<Flavor>(round, accum, edges, params, scaling_factor);
        benchmark::DoNotOptimize(accum);
    }

    state.counters["relations"] = static_cast<double>(Flavor::NUM_RELATIONS);
    state.counters["subrelations"] = static_cast<double>(Flavor::NUM_SUBRELATIONS);
}

enum class Scheduler {
    STATIC_BLOCKS,
    CHUNK_STEALING,
};

template <typename Flavor>
void bench_sumcheck_loop_shape(benchmark::State& state, const Scheduler scheduler, const bool fragmented)
{
    using FF = typename Flavor::FF;
    using Round = SumcheckProverRound<Flavor>;
    using Tuple = typename Round::SumcheckTupleOfTuplesOfUnivariates;

    const size_t log_n = static_cast<size_t>(state.range(0));
    const size_t round_size = size_t{ 1 } << log_n;
    constexpr size_t ROWS_PER_CHUNK = 64;

    SyntheticPolynomials<Flavor> synthetic_polynomials(round_size);
    auto& polynomials = synthetic_polynomials.polynomials;
    auto params = make_relation_parameters<Flavor>();
    const auto blocks = make_active_blocks(round_size, fragmented);

    for (auto _ : state) {
        Round round(round_size);
        std::vector<Tuple> thread_accumulators(get_num_cpus());

        if (scheduler == Scheduler::STATIC_BLOCKS) {
            parallel_for([&](ThreadChunk chunk) {
                typename Round::ExtendedEdges extended_edges;
                for (const auto& block : blocks) {
                    const size_t iterations = block.size / 2;
                    for (size_t i : chunk.range(iterations)) {
                        const size_t edge_idx = block.start + i * 2;
                        round.extend_edges(extended_edges, polynomials, edge_idx);
                        accumulate_one_edge<Flavor>(
                            round, thread_accumulators[chunk.thread_index], extended_edges, params, FF(7));
                    }
                }
            });
        } else {
            std::vector<ActiveBlock> chunks;
            for (const auto& block : blocks) {
                for (size_t start = block.start; start < block.start + block.size; start += ROWS_PER_CHUNK) {
                    chunks.push_back(ActiveBlock{
                        .start = start,
                        .size = std::min(ROWS_PER_CHUNK, block.start + block.size - start),
                    });
                }
            }

            std::atomic<size_t> next_chunk{ 0 };
            const size_t num_slots = std::min(get_num_cpus(), std::max<size_t>(chunks.size(), 1));
            thread_accumulators.resize(num_slots);
            parallel_for(num_slots, [&](size_t slot_idx) {
                typename Round::ExtendedEdges extended_edges;
                while (true) {
                    const size_t chunk_idx = next_chunk.fetch_add(1, std::memory_order_relaxed);
                    if (chunk_idx >= chunks.size()) {
                        break;
                    }
                    const auto& chunk = chunks[chunk_idx];
                    for (size_t edge_idx = chunk.start; edge_idx < chunk.start + chunk.size; edge_idx += 2) {
                        round.extend_edges(extended_edges, polynomials, edge_idx);
                        accumulate_one_edge<Flavor>(
                            round, thread_accumulators[slot_idx], extended_edges, params, FF(7));
                    }
                }
            });
        }

        Tuple total{};
        for (const auto& accum : thread_accumulators) {
            RelationUtils<Flavor>::add_nested_tuples(total, accum);
        }
        benchmark::DoNotOptimize(total);
    }

    size_t active_edges = 0;
    for (const auto& block : blocks) {
        active_edges += block.size;
    }
    state.counters["active_edge_pairs"] = static_cast<double>(active_edges / 2);
    state.counters["active_pct"] = 100.0 * static_cast<double>(active_edges) / static_cast<double>(round_size);
    state.counters["blocks"] = static_cast<double>(blocks.size());
    state.counters["relations"] = static_cast<double>(Flavor::NUM_RELATIONS);
    state.counters["subrelations"] = static_cast<double>(Flavor::NUM_SUBRELATIONS);
    state.counters["threads"] = static_cast<double>(get_num_cpus());
}

struct NanoSpec {
    size_t relations = 0;
    size_t subrelations = 0;
    size_t heavy_period = 0;
};

template <Scheduler scheduler> void bench_nano_scheduler(benchmark::State& state)
{
    using FF = bb::fr;
    const size_t log_n = static_cast<size_t>(state.range(0));
    const size_t rows = size_t{ 1 } << log_n;
    const bool imbalanced = static_cast<bool>(state.range(1));
    const auto blocks = make_active_blocks(rows, /*fragmented=*/true);
    const NanoSpec spec{ .relations = 12, .subrelations = 36, .heavy_period = imbalanced ? 8UL : 1UL };
    constexpr size_t ROWS_PER_CHUNK = 64;

    auto do_row = [&](std::array<FF, 64>& accum, const size_t row) {
        const bool heavy = ((row / 2) % spec.heavy_period) == 0;
        const size_t active_relations = heavy ? spec.relations : 2;
        FF x = FF(static_cast<uint64_t>((row & 255) + 3));
        for (size_t relation_idx = 0; relation_idx < active_relations; ++relation_idx) {
            for (size_t subrelation_idx = 0; subrelation_idx < spec.subrelations / spec.relations; ++subrelation_idx) {
                x = x * FF(static_cast<uint64_t>(relation_idx + 5)) + FF(static_cast<uint64_t>(subrelation_idx + 7));
                accum[relation_idx * 4 + subrelation_idx] += x;
            }
        }
    };

    for (auto _ : state) {
        std::vector<std::array<FF, 64>> accumulators(get_num_cpus());
        for (auto& accum : accumulators) {
            std::fill(accum.begin(), accum.end(), FF::zero());
        }

        if constexpr (scheduler == Scheduler::STATIC_BLOCKS) {
            parallel_for([&](ThreadChunk chunk) {
                for (const auto& block : blocks) {
                    const size_t iterations = block.size / 2;
                    for (size_t i : chunk.range(iterations)) {
                        do_row(accumulators[chunk.thread_index], block.start + i * 2);
                    }
                }
            });
        } else {
            std::vector<ActiveBlock> chunks;
            for (const auto& block : blocks) {
                for (size_t start = block.start; start < block.start + block.size; start += ROWS_PER_CHUNK) {
                    chunks.push_back(ActiveBlock{
                        .start = start,
                        .size = std::min(ROWS_PER_CHUNK, block.start + block.size - start),
                    });
                }
            }

            std::atomic<size_t> next_chunk{ 0 };
            const size_t num_slots = std::min(get_num_cpus(), std::max<size_t>(chunks.size(), 1));
            accumulators.resize(num_slots);
            parallel_for(num_slots, [&](size_t slot_idx) {
                while (true) {
                    const size_t chunk_idx = next_chunk.fetch_add(1, std::memory_order_relaxed);
                    if (chunk_idx >= chunks.size()) {
                        break;
                    }
                    const auto& chunk = chunks[chunk_idx];
                    for (size_t edge_idx = chunk.start; edge_idx < chunk.start + chunk.size; edge_idx += 2) {
                        do_row(accumulators[slot_idx], edge_idx);
                    }
                }
            });
        }
        benchmark::DoNotOptimize(accumulators);
    }

    state.counters["relations"] = static_cast<double>(spec.relations);
    state.counters["subrelations"] = static_cast<double>(spec.subrelations);
    state.counters["threads"] = static_cast<double>(get_num_cpus());
    state.counters["imbalanced"] = imbalanced ? 1.0 : 0.0;
}

template <typename Flavor> void bench_compute_univariate_round0(benchmark::State& state)
{
    using FF = typename Flavor::FF;
    using Round = SumcheckProverRound<Flavor>;
    const size_t log_n = static_cast<size_t>(state.range(0));
    const size_t round_size = size_t{ 1 } << log_n;

    SyntheticPolynomials<Flavor> synthetic_polynomials(round_size);
    auto params = make_relation_parameters<Flavor>();
    auto alphas = make_subrelation_separators<Flavor>();
    GateSeparatorPolynomial<FF> gate_separators(make_challenges<FF>(log_n), log_n);

    for (auto _ : state) {
        Round round(round_size);
        auto result = round.compute_univariate(synthetic_polynomials.polynomials, params, gate_separators, alphas);
        benchmark::DoNotOptimize(result);
    }

    state.counters["relations"] = static_cast<double>(Flavor::NUM_RELATIONS);
    state.counters["subrelations"] = static_cast<double>(Flavor::NUM_SUBRELATIONS);
    state.counters["threads"] = static_cast<double>(get_num_cpus());
}

template <typename Flavor> void register_flavor_benches(const std::string& name, const bool fragmented)
{
    benchmark::RegisterBenchmark((name + "/accumulate_relations_only").c_str(),
                                 &bench_accumulate_relations_only<Flavor>)
        ->UseRealTime();
    benchmark::RegisterBenchmark((name + "/loop_static_blocks").c_str(),
                                 &bench_sumcheck_loop_shape<Flavor>,
                                 Scheduler::STATIC_BLOCKS,
                                 fragmented)
        ->Arg(17)
        ->UseRealTime()
        ->Unit(benchmark::kMillisecond);
    benchmark::RegisterBenchmark((name + "/loop_chunk_stealing").c_str(),
                                 &bench_sumcheck_loop_shape<Flavor>,
                                 Scheduler::CHUNK_STEALING,
                                 fragmented)
        ->Arg(17)
        ->UseRealTime()
        ->Unit(benchmark::kMillisecond);
    benchmark::RegisterBenchmark((name + "/compute_univariate_round0").c_str(),
                                 &bench_compute_univariate_round0<Flavor>)
        ->Arg(17)
        ->UseRealTime()
        ->Unit(benchmark::kMillisecond);
}

} // namespace

int main(int argc, char** argv)
{
    register_flavor_benches<bb::MegaZKFlavor>("MegaZK", /*fragmented=*/false);
    register_flavor_benches<bb::TranslatorShortMonomialFlavor>("TranslatorShort", /*fragmented=*/true);
    register_flavor_benches<bb::ECCVMShortMonomialFlavor>("ECCVMShort", /*fragmented=*/false);
    benchmark::RegisterBenchmark("Nano/static_blocks", &bench_nano_scheduler<Scheduler::STATIC_BLOCKS>)
        ->Args({ 17, 0 })
        ->Args({ 17, 1 })
        ->UseRealTime()
        ->Unit(benchmark::kMillisecond);
    benchmark::RegisterBenchmark("Nano/chunk_stealing", &bench_nano_scheduler<Scheduler::CHUNK_STEALING>)
        ->Args({ 17, 0 })
        ->Args({ 17, 1 })
        ->UseRealTime()
        ->Unit(benchmark::kMillisecond);

    benchmark::Initialize(&argc, argv);
    benchmark::RunSpecifiedBenchmarks();
    benchmark::Shutdown();
    return 0;
}
