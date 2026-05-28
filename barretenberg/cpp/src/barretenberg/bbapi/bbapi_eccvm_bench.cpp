#include "barretenberg/bbapi/bbapi_eccvm_bench.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/eccvm/eccvm_circuit_builder.hpp"
#include "barretenberg/eccvm/eccvm_prover.hpp"

#include <chrono>

namespace bb::bbapi {
namespace {

using Flavor = ECCVMFlavor;
using Builder = ECCVMCircuitBuilder;
using Transcript = ECCVMFlavor::Transcript;
using Clock = std::chrono::steady_clock;

Builder generate_trace(size_t target_num_gates)
{
    std::shared_ptr<ECCOpQueue> op_queue = std::make_shared<ECCOpQueue>();
    using G1 = typename Flavor::CycleGroup;
    using Fr = typename G1::Fr;

    auto generators = get_precomputed_generators<G1, "test generators", 2>();

    typename G1::element a = generators[0];
    typename G1::element b = generators[1];
    Fr x = Fr::random_element();
    Fr y = Fr::random_element();

    // Keep this trace shape aligned with benchmark/goblin_bench/eccvm.bench.cpp.
    size_t num_iterations = target_num_gates / 163;
    for (size_t i = 0; i < num_iterations; ++i) {
        op_queue->add_accumulate(a);
        op_queue->mul_accumulate(a, x);
        op_queue->mul_accumulate(b, x);
        op_queue->mul_accumulate(b, y);
        op_queue->add_accumulate(a);
        op_queue->mul_accumulate(b, x);
        op_queue->eq_and_reset();
        op_queue->merge();
    }

    using Fq = curve::BN254::BaseField;
    op_queue->append_hiding_op(Fq::random_element(), Fq::random_element());

    return Builder{ op_queue };
}

double elapsed_ms(Clock::time_point start, Clock::time_point end)
{
    return std::chrono::duration<double, std::milli>(end - start).count();
}

template <typename Prover> uint32_t construct_proof(size_t target_num_gates)
{
    Builder builder = generate_trace(target_num_gates);
    std::shared_ptr<Transcript> prover_transcript = std::make_shared<Transcript>();
    Prover prover(builder, prover_transcript);
    auto [proof, opening_claim] = prover.construct_proof();
    auto ipa_transcript = std::make_shared<Transcript>();
    IPA<Flavor::Curve>::compute_opening_proof(prover.key->commitment_key, opening_claim, ipa_transcript);
    return static_cast<uint32_t>(proof.size());
}

template <typename Prover> void execute_sumcheck(size_t target_num_gates)
{
    Builder builder = generate_trace(target_num_gates);
    std::shared_ptr<Transcript> prover_transcript = std::make_shared<Transcript>();
    Prover prover(builder, prover_transcript);
    prover.execute_preamble_round();
    prover.execute_wire_commitments_round();
    prover.execute_log_derivative_commitments_round();
    prover.execute_grand_product_computation_round();
    prover.execute_relation_check_rounds();
}

template <typename Fn>
void measure(std::vector<EccvmBenchMeasurement>& measurements,
             const std::string& name,
             uint32_t log_size,
             uint32_t run_index,
             Fn&& fn)
{
    auto start = Clock::now();
    uint32_t proof_bytes = fn();
    auto end = Clock::now();
    measurements.push_back({
        .name = name,
        .log_size = log_size,
        .run_index = run_index,
        .ms = elapsed_ms(start, end),
        .proof_bytes = proof_bytes,
    });
}

} // namespace

EccvmBench::Response EccvmBench::execute(BBApiRequest& request) &&
{
    if (runs == 0) {
        BBAPI_ERROR(request, "EccvmBench: runs must be positive");
    }
    if (log_sizes.empty()) {
        BBAPI_ERROR(request, "EccvmBench: log_sizes must not be empty");
    }

    std::vector<EccvmBenchMeasurement> measurements;
    measurements.reserve(log_sizes.size() * runs * 4);

    for (uint32_t log_size : log_sizes) {
        if (log_size > CONST_ECCVM_LOG_N) {
            BBAPI_ERROR(request,
                        "EccvmBench: log_size " + std::to_string(log_size) + " exceeds CONST_ECCVM_LOG_N " +
                            std::to_string(CONST_ECCVM_LOG_N));
        }

        const size_t target_num_gates = static_cast<size_t>(1) << log_size;
        for (uint32_t run_index = 0; run_index < runs; ++run_index) {
            if (include_prove) {
                measure(measurements, "eccvm_full_prove", log_size, run_index, [&]() {
                    return construct_proof<ECCVMProver>(target_num_gates);
                });
                measure(measurements, "eccvm_short_monomial_prove", log_size, run_index, [&]() {
                    return construct_proof<ECCVMShortMonomialProver>(target_num_gates);
                });
            }
            if (include_sumcheck) {
                measure(measurements, "eccvm_full_sumcheck", log_size, run_index, [&]() {
                    execute_sumcheck<ECCVMProver>(target_num_gates);
                    return 0U;
                });
                measure(measurements, "eccvm_short_monomial_sumcheck", log_size, run_index, [&]() {
                    execute_sumcheck<ECCVMShortMonomialProver>(target_num_gates);
                    return 0U;
                });
            }
        }
    }

    return { .measurements = std::move(measurements) };
}

} // namespace bb::bbapi
