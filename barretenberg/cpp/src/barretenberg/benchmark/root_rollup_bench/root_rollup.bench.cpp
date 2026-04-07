/**
 * @brief Benchmark for root rollup circuit proving and verification.
 *
 * Constructs the root rollup circuit (2 recursive Honk verifications + IPA verification)
 * and benchmarks the full proving pipeline. This is the same circuit as the
 * GateCountRootRollup test in honk_recursion_constraint.test.cpp, but exercises the prover.
 *
 * Uses UltraKeccakZKFlavor which matches production: bb prove --scheme ultra_honk --oracle_hash keccak
 * (RootRollupArtifact maps to 'ultra_keccak_honk' in yarn-project/bb-prover/src/bb/execute.ts)
 *
 * Usage:
 *   HARDWARE_CONCURRENCY=32 ./bin/root_rollup_bench
 */
#include <benchmark/benchmark.h>
#include <sys/resource.h>

#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/dsl/acir_format/honk_recursion_constraint.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/dsl/acir_format/serde/index.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/dsl/acir_format/witness_constant.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"
#include "barretenberg/flavor/ultra_keccak_zk_flavor.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

using namespace acir_format;
using namespace bb;

namespace {

using RecursiveFlavor = UltraRecursiveFlavor_<UltraCircuitBuilder>;
using InnerFlavor = RecursiveFlavor::NativeFlavor;
using InnerBuilder = InnerFlavor::CircuitBuilder;
using InnerIO = bb::stdlib::recursion::honk::RollupIO;
using InnerProverInstance = ProverInstance_<InnerFlavor>;
using InnerVerificationKey = InnerFlavor::VerificationKey;
using InnerProver = UltraProver_<InnerFlavor>;

static constexpr size_t NUM_PUBLIC_INPUTS = 2;
static constexpr uint32_t INNER_PROOF_TYPE = ROLLUP_HONK;

// Helpers to convert RecursionConstraint -> Acir::Opcode (extracted from test_class.hpp to avoid gtest dependency)
Acir::FunctionInput witness_to_function_input(uint32_t witness_index)
{
    return Acir::FunctionInput{ .value =
                                    Acir::FunctionInput::Witness{ .value = Acir::Witness{ .value = witness_index } } };
}

Acir::FunctionInput witness_or_constant_to_function_input(const WitnessOrConstant<bb::fr>& input)
{
    if (input.is_constant) {
        return Acir::FunctionInput{ .value = Acir::FunctionInput::Constant{ .value = input.value.to_buffer() } };
    }
    return Acir::FunctionInput{ .value =
                                    Acir::FunctionInput::Witness{ .value = Acir::Witness{ .value = input.index } } };
}

Acir::Opcode recursion_constraint_to_acir_opcode(const RecursionConstraint& constraint)
{
    std::vector<Acir::FunctionInput> verification_key;
    for (const auto& key_idx : constraint.key) {
        verification_key.push_back(witness_to_function_input(key_idx));
    }
    std::vector<Acir::FunctionInput> proof;
    for (const auto& proof_idx : constraint.proof) {
        proof.push_back(witness_to_function_input(proof_idx));
    }
    std::vector<Acir::FunctionInput> public_inputs;
    for (const auto& pub_input_idx : constraint.public_inputs) {
        public_inputs.push_back(witness_to_function_input(pub_input_idx));
    }
    return Acir::Opcode{ .value = Acir::Opcode::BlackBoxFuncCall{
                              .value = Acir::BlackBoxFuncCall{
                                  .value = Acir::BlackBoxFuncCall::RecursiveAggregation{
                                      .verification_key = std::move(verification_key),
                                      .proof = std::move(proof),
                                      .public_inputs = std::move(public_inputs),
                                      .key_hash = witness_to_function_input(constraint.key_hash),
                                      .proof_type = constraint.proof_type,
                                      .predicate = witness_or_constant_to_function_input(constraint.predicate),
                                  } } } };
}

AcirFormat constraints_to_acir_format(const std::vector<RecursionConstraint>& constraints)
{
    std::vector<Acir::Opcode> opcodes;
    for (const auto& c : constraints) {
        opcodes.push_back(recursion_constraint_to_acir_opcode(c));
    }
    Acir::Circuit circuit{
        .function_name = "root_rollup_bench",
        .opcodes = opcodes,
        .private_parameters = {},
        .public_parameters = Acir::PublicInputs{ .value = {} },
        .return_values = Acir::PublicInputs{ .value = {} },
        .assert_messages = {},
    };
    return circuit_serde_to_acir_format(circuit);
}

InnerBuilder create_inner_circuit()
{
    InnerBuilder builder;
    MockCircuits::add_arithmetic_gates(builder);
    MockCircuits::add_lookup_gates(builder);
    for (size_t idx = 0; idx < NUM_PUBLIC_INPUTS; idx++) {
        builder.add_public_variable(InnerBuilder::FF::random_element());
    }
    InnerIO::add_default(builder);
    return builder;
}

std::pair<RecursionConstraint, WitnessVector> circuit_to_recursion_constraint(InnerBuilder& builder)
{
    for (size_t idx = builder.num_public_inputs(); idx < NUM_PUBLIC_INPUTS; idx++) {
        builder.add_public_variable(InnerBuilder::FF::random_element());
    }
    auto prover_instance = std::make_shared<InnerProverInstance>(builder);
    auto verification_key = std::make_shared<InnerVerificationKey>(prover_instance->get_precomputed());
    InnerProver prover(prover_instance, verification_key);
    auto proof = prover.construct_proof();

    WitnessVector witness_values;
    RecursionConstraint constraint = recursion_data_to_recursion_constraint(witness_values,
                                                                            proof,
                                                                            verification_key->to_field_elements(),
                                                                            verification_key->hash(),
                                                                            bb::fr::one(),
                                                                            builder.num_public_inputs() -
                                                                                InnerIO::PUBLIC_INPUTS_SIZE,
                                                                            INNER_PROOF_TYPE);
    return { constraint, witness_values };
}

void generate_root_rollup_constraints(std::vector<RecursionConstraint>& honk_recursion_constraints,
                                      WitnessVector& witness_values)
{
    std::vector<RecursionConstraint> constraints;
    std::vector<WitnessVector> witness_vectors;

    for (size_t idx = 0; idx < 2; idx++) {
        auto builder = create_inner_circuit();
        auto [constraint, witnesses] = circuit_to_recursion_constraint(builder);
        constraints.emplace_back(std::move(constraint));
        witness_vectors.emplace_back(std::move(witnesses));
    }

    for (auto [constraint, witnesses] : zip_view(constraints, witness_vectors)) {
        uint32_t offset = static_cast<uint32_t>(witness_values.size());
        auto shift = [&offset](std::vector<uint32_t>& indices) {
            for (auto& index : indices) {
                index += offset;
            }
        };
        shift(constraint.key);
        shift(constraint.proof);
        shift(constraint.public_inputs);
        constraint.key_hash += offset;
        constraint.predicate.index += offset;
        constraint.proof_type = static_cast<uint32_t>(ROOT_ROLLUP_HONK);
        witness_values.insert(witness_values.end(), witnesses.begin(), witnesses.end());
    }

    honk_recursion_constraints = std::move(constraints);
}

size_t get_peak_rss_mib()
{
    struct rusage usage {};
    getrusage(RUSAGE_SELF, &usage);
    return static_cast<size_t>(usage.ru_maxrss) / 1024; // Linux: ru_maxrss is in KB
}

} // namespace

static void root_rollup_prove(benchmark::State& state)
{
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());

    for (auto _ : state) {
        state.PauseTiming();

        info("Generating root rollup constraints (2 inner circuits)...");
        std::vector<RecursionConstraint> constraints;
        WitnessVector witness_values;
        generate_root_rollup_constraints(constraints, witness_values);

        info("Building outer circuit...");
        AcirFormat constraint_system = constraints_to_acir_format(constraints);
        AcirProgram program{ constraint_system, witness_values };
        ProgramMetadata metadata{ .has_ipa_claim = false };
        auto builder = create_circuit<UltraCircuitBuilder>(program, metadata);

        size_t num_gates = builder.get_num_finalized_gates_inefficient();
        info("Root rollup circuit: ", num_gates, " gates");

        info("Creating prover instance...");
        // Production root rollup uses UltraKeccakZKFlavor (keccak transcript, ZK blinding).
        // bb prove --scheme ultra_honk --oracle_hash keccak
        // See yarn-project/bb-prover/src/bb/execute.ts and dispatch_by_settings() in bbapi_shared.hpp.
        auto prover_instance = std::make_shared<ProverInstance_<UltraKeccakZKFlavor>>(builder);
        auto verification_key =
            std::make_shared<UltraKeccakZKFlavor::VerificationKey>(prover_instance->get_precomputed());

        size_t dyadic_size = prover_instance->dyadic_size();
        info("Dyadic size: ", dyadic_size, " (log2: ", numeric::get_msb(dyadic_size), ")");

        size_t rss_before = get_peak_rss_mib();
        info("Peak RSS before proving: ", rss_before, " MiB");

        UltraKeccakZKProver prover(prover_instance, verification_key);

        info("Starting proof construction...");
        state.ResumeTiming();

        auto proof = prover.construct_proof();

        state.PauseTiming();

        size_t rss_after = get_peak_rss_mib();
        info("Peak RSS after proving: ", rss_after, " MiB");

        info("Verifying proof...");
        auto vk_and_hash = std::make_shared<UltraKeccakZKFlavor::VKAndHash>(verification_key);
        UltraKeccakZKVerifier verifier(vk_and_hash);
        auto output = verifier.verify_proof(proof);
        info(output.result ? "Proof verified successfully" : "ERROR: Proof verification FAILED");

        state.ResumeTiming();
    }
}

BENCHMARK(root_rollup_prove)->Unit(benchmark::kMillisecond)->Iterations(1);

int main(int argc, char** argv)
{
    bb::detail::use_bb_bench = true;

    ::benchmark::Initialize(&argc, argv);
    if (::benchmark::ReportUnrecognizedArguments(argc, argv))
        return 1;
    ::benchmark::RunSpecifiedBenchmarks();
    ::benchmark::Shutdown();

    std::cout << "\n=== Detailed BB_BENCH Profiling Stats ===\n";
    bb::detail::GLOBAL_BENCH_STATS.print_aggregate_counts_hierarchical(std::cout);

    return 0;
}
