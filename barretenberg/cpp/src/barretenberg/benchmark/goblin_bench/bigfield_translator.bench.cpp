#include <benchmark/benchmark.h>

#include "barretenberg/bigfield_translator/bigfield_translator.hpp"
#include "barretenberg/bigfield_translator/bigfield_translator_prover.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"

using namespace benchmark;
using namespace bb;

namespace {

using Fr = curve::BN254::ScalarField;
using Fq = curve::BN254::BaseField;

std::shared_ptr<ECCOpQueue> create_op_queue(size_t num_ops)
{
    auto op_queue = std::make_shared<ECCOpQueue>();

    MegaCircuitBuilder builder;
    builder.op_queue = op_queue;

    for (size_t i = 0; i < num_ops; i++) {
        auto point = curve::BN254::Group::affine_one * Fr::random_element();
        auto scalar = Fr::random_element();
        builder.queue_ecc_mul_accum(point, scalar);
    }

    // Pad to OP_QUEUE_SIZE (power of 2) as the translator expects
    op_queue->merge(MergeSettings::APPEND, ECCOpQueue::OP_QUEUE_SIZE - op_queue->get_current_subtable_size());

    return op_queue;
}

/**
 * @brief Benchmark BigfieldTranslator proving with LightZKFlavor (the default, ZK-enabled flavor)
 */
void bigfield_translator_prove_lightzk(State& state) noexcept
{
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());

    size_t num_ops = static_cast<size_t>(state.range(0));
    auto op_queue = create_op_queue(num_ops);

    Fq x_native = Fq::random_element();
    Fq v_native = Fq::random_element();

    for (auto _ : state) {
        BigfieldTranslatorProver prover(op_queue, x_native, v_native);
        auto proof = prover.construct_proof();
        DoNotOptimize(proof);
    }
}

/**
 * @brief Benchmark BigfieldTranslator proving with MegaFlavor (non-ZK, more efficient allocation)
 */
void bigfield_translator_prove_mega(State& state) noexcept
{
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());

    using Flavor = MegaFlavor;
    using Builder = typename Flavor::CircuitBuilder;
    using fq_ct = stdlib::bigfield<Builder, bb::Bn254FqParams>;
    using ProverInstance = ProverInstance_<Flavor>;
    using VerificationKey = typename Flavor::VerificationKey;
    using Prover = UltraProver_<Flavor>;

    size_t num_ops = static_cast<size_t>(state.range(0));
    auto op_queue = create_op_queue(num_ops);

    Fq x_native = Fq::random_element();
    Fq v_native = Fq::random_element();

    for (auto _ : state) {
        // Build circuit
        Builder builder;
        BigfieldTranslator::populate_ecc_op_block(builder, op_queue);

        fq_ct x = fq_ct::create_from_u512_as_witness(&builder, uint512_t(x_native));
        fq_ct v = fq_ct::create_from_u512_as_witness(&builder, uint512_t(v_native));
        // Use predecomposed limbs for optimized circuit size (2^18)
        fq_ct result = BigfieldTranslator::compute_accumulator(builder, x, v, /*use_predecomposed_limbs=*/true);
        DoNotOptimize(result);

        // Add default public inputs required by the proving system
        stdlib::recursion::honk::DefaultIO<Builder>::add_default(builder);

        // Create prover instance and prove
        auto prover_instance = std::make_shared<ProverInstance>(builder);
        auto verification_key = std::make_shared<VerificationKey>(prover_instance->get_precomputed());
        auto transcript = std::make_shared<typename Flavor::Transcript>();

        Prover prover(prover_instance, verification_key, transcript);
        auto proof = prover.construct_proof();
        DoNotOptimize(proof);
    }
}

BENCHMARK(bigfield_translator_prove_lightzk)->Unit(kMillisecond)->Arg(100)->Arg(500)->Arg(1000)->Arg(2000)->Arg(4096);
BENCHMARK(bigfield_translator_prove_mega)->Unit(kMillisecond)->Arg(100)->Arg(500)->Arg(1000)->Arg(2000)->Arg(4096);

} // namespace

BENCHMARK_MAIN();
