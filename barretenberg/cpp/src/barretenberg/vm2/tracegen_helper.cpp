#include "barretenberg/vm2/tracegen_helper.hpp"

#include <array>
#include <functional>
#include <span>
#include <string>
#include <vector>

#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/common/std_array.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/vm2/common/map.hpp"
#include "barretenberg/vm2/constraining/flavor.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/tooling/stats.hpp"
#include "barretenberg/vm2/tracegen/address_derivation_trace.hpp"
#include "barretenberg/vm2/tracegen/alu_trace.hpp"
#include "barretenberg/vm2/tracegen/bitwise_trace.hpp"
#include "barretenberg/vm2/tracegen/bytecode_trace.hpp"
#include "barretenberg/vm2/tracegen/calldata_trace.hpp"
#include "barretenberg/vm2/tracegen/class_id_derivation_trace.hpp"
#include "barretenberg/vm2/tracegen/data_copy_trace.hpp"
#include "barretenberg/vm2/tracegen/ecc_trace.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/field_gt_trace.hpp"
#include "barretenberg/vm2/tracegen/internal_call_stack_trace.hpp"
#include "barretenberg/vm2/tracegen/keccakf1600_trace.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_builder.hpp"
#include "barretenberg/vm2/tracegen/memory_trace.hpp"
#include "barretenberg/vm2/tracegen/merkle_check_trace.hpp"
#include "barretenberg/vm2/tracegen/note_hash_tree_check_trace.hpp"
#include "barretenberg/vm2/tracegen/nullifier_tree_check_trace.hpp"
#include "barretenberg/vm2/tracegen/poseidon2_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/public_data_tree_check_trace.hpp"
#include "barretenberg/vm2/tracegen/public_inputs_trace.hpp"
#include "barretenberg/vm2/tracegen/range_check_trace.hpp"
#include "barretenberg/vm2/tracegen/sha256_trace.hpp"
#include "barretenberg/vm2/tracegen/to_radix_trace.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"
#include "barretenberg/vm2/tracegen/tx_trace.hpp"
#include "barretenberg/vm2/tracegen/update_check_trace.hpp"

namespace bb::avm2 {

using namespace bb::avm2::simulation;
using namespace bb::avm2::tracegen;

namespace {

auto build_precomputed_columns_jobs(TraceContainer& trace)
{
    return std::vector<std::function<void()>>{
        [&]() {
            PrecomputedTraceBuilder precomputed_builder;
            AVM_TRACK_TIME("tracegen/precomputed/misc", precomputed_builder.process_misc(trace));
        },
        [&]() {
            PrecomputedTraceBuilder precomputed_builder;
            AVM_TRACK_TIME("tracegen/precomputed/bitwise", precomputed_builder.process_bitwise(trace));
        },
        [&]() {
            PrecomputedTraceBuilder precomputed_builder;
            AVM_TRACK_TIME("tracegen/precomputed/range_8", precomputed_builder.process_sel_range_8(trace));
            AVM_TRACK_TIME("tracegen/precomputed/range_16", precomputed_builder.process_sel_range_16(trace));
            AVM_TRACK_TIME("tracegen/precomputed/power_of_2", precomputed_builder.process_power_of_2(trace));
            AVM_TRACK_TIME("tracegen/precomputed/sha256_round_constants",
                           precomputed_builder.process_sha256_round_constants(trace));
            AVM_TRACK_TIME("tracegen/precomputed/keccak_round_constants",
                           precomputed_builder.process_keccak_round_constants(trace));
            AVM_TRACK_TIME("tracegen/precomputed/integral_tag_length",
                           precomputed_builder.process_integral_tag_length(trace));
            AVM_TRACK_TIME("tracegen/precomputed/operand_dec_selectors",
                           precomputed_builder.process_wire_instruction_spec(trace));
            AVM_TRACK_TIME("tracegen/precomputed/exec_instruction_spec",
                           precomputed_builder.process_exec_instruction_spec(trace));
            AVM_TRACK_TIME("tracegen/precomputed/to_radix_safe_limbs",
                           precomputed_builder.process_to_radix_safe_limbs(trace));
            AVM_TRACK_TIME("tracegen/precomputed/to_radix_p_decompositions",
                           precomputed_builder.process_to_radix_p_decompositions(trace));
            AVM_TRACK_TIME("tracegen/precomputed/memory_tag_ranges",
                           precomputed_builder.process_memory_tag_range(trace));
            AVM_TRACK_TIME("tracegen/precomputed/addressing_gas", precomputed_builder.process_addressing_gas(trace));
            AVM_TRACK_TIME("tracegen/precomputed/phase_table", precomputed_builder.process_phase_table(trace));
        },
    };
}

auto build_public_inputs_columns_jobs(TraceContainer& trace, const PublicInputs& public_inputs)
{
    return std::vector<std::function<void()>>{
        [&]() {
            PublicInputsTraceBuilder public_inputs_builder;
            public_inputs_builder.process_public_inputs(trace, public_inputs);
        },
        [&]() {
            PublicInputsTraceBuilder public_inputs_builder;
            public_inputs_builder.process_public_inputs_aux_precomputed(trace);
        },
    };
}

void execute_jobs(std::span<std::function<void()>> jobs)
{
    parallel_for(jobs.size(), [&](size_t i) { jobs[i](); });
}

template <typename T> inline void clear_events(T& c)
{
    c.clear();
    c.shrink_to_fit();
}

void print_trace_stats(const TraceContainer& trace)
{
    constexpr auto main_relation_names = [] {
        constexpr size_t size = std::tuple_size_v<AvmFlavor::MainRelations>;
        std::array<std::string_view, size> names{};
        constexpr_for<0, size, 1>(
            [&names]<size_t i> { names[i] = std::tuple_element_t<i, AvmFlavor::MainRelations>::NAME; });
        return names;
    }();

    unordered_flat_map<std::string, uint32_t> namespace_column_sizes;
    uint64_t total_rows = 0;
    for (size_t col = 0; col < trace.num_columns(); ++col) {
        const auto& column_rows = trace.get_column_rows(static_cast<Column>(col));
        const std::string& column_name = COLUMN_NAMES.at(col);
        const std::string namespace_name = [&]() {
            for (const auto& main_relation_name : main_relation_names) {
                if (column_name.starts_with(main_relation_name)) {
                    return std::string(main_relation_name);
                }
            }
            return column_name.substr(0, column_name.find_first_of('_'));
        }();
        namespace_column_sizes[namespace_name] = std::max(namespace_column_sizes[namespace_name], column_rows);
        total_rows += column_rows;
    }
    vinfo("Column sizes per namespace:");
    for (const auto& [namespace_name, column_size] : namespace_column_sizes) {
        vinfo("  ",
              namespace_name,
              ": ",
              column_size,
              " (~2^",
              numeric::get_msb(numeric::round_up_power_2(column_size)),
              ")");
    }
    info("Sum of all column rows: ", total_rows, " (~2^", numeric::get_msb(numeric::round_up_power_2(total_rows)), ")");
}

// Check that inverses have been set, if assertions are enabled.
// WARNING: This will not warn you if the interaction is not exercised.
void check_interactions([[maybe_unused]] const TraceContainer& trace)
{
#ifndef NDEBUG
    bb::constexpr_for<0, std::tuple_size_v<typename AvmFlavor::LookupRelations>, 1>([&]<size_t i>() {
        using Settings = typename std::tuple_element_t<i, typename AvmFlavor::LookupRelations>::Settings;
        if (trace.get_column_rows(Settings::SRC_SELECTOR) != 0 && trace.get_column_rows(Settings::INVERSES) == 0) {
            std::cerr << "Inverses not set for " << Settings::NAME << ". Did you forget to run a lookup builder?"
                      << std::endl;
            std::abort();
        }
    });
#endif
}

// A concatenate that works with movable objects.
template <typename T> std::vector<T> concatenate_jobs(std::vector<T>&& first, auto&&... rest)
{
    std::vector<T> result = std::move(first);
    result.reserve(first.size() + (rest.size() + ...));
    (std::move(rest.begin(), rest.end(), std::back_inserter(result)), ...);
    return result;
}

} // namespace

TraceContainer AvmTraceGenHelper::generate_trace(EventsContainer&& events, const PublicInputs& public_inputs)
{
    TraceContainer trace;

    fill_trace_columns(trace, std::move(events), public_inputs);
    fill_trace_interactions(trace);

    check_interactions(trace);
    print_trace_stats(trace);

    return trace;
}

void AvmTraceGenHelper::fill_trace_columns(TraceContainer& trace,
                                           EventsContainer&& events,
                                           const PublicInputs& public_inputs)
{
    // We process the events in parallel. Ideally the jobs should access disjoint column sets.
    {
        auto jobs = concatenate(
            // Precomputed column jobs.
            build_precomputed_columns_jobs(trace),
            // Public inputs column jobs.
            build_public_inputs_columns_jobs(trace, public_inputs),
            // Subtrace jobs.
            std::vector<std::function<void()>>{
                [&]() {
                    TxTraceBuilder tx_builder;
                    AVM_TRACK_TIME("tracegen/tx", tx_builder.process(events.tx, trace));
                    clear_events(events.tx);
                },
                [&]() {
                    ExecutionTraceBuilder exec_builder;
                    AVM_TRACK_TIME("tracegen/execution", exec_builder.process(events.execution, trace));
                    clear_events(events.execution);
                },
                [&]() {
                    AddressDerivationTraceBuilder address_derivation_builder;
                    AVM_TRACK_TIME("tracegen/address_derivation",
                                   address_derivation_builder.process(events.address_derivation, trace));
                    clear_events(events.address_derivation);
                },
                [&]() {
                    AluTraceBuilder alu_builder;
                    AVM_TRACK_TIME("tracegen/alu", alu_builder.process(events.alu, trace));
                    clear_events(events.alu);
                },
                [&]() {
                    BytecodeTraceBuilder bytecode_builder;
                    AVM_TRACK_TIME("tracegen/bytecode_decomposition",
                                   bytecode_builder.process_decomposition(events.bytecode_decomposition, trace));
                    clear_events(events.bytecode_decomposition);
                },
                [&]() {
                    BytecodeTraceBuilder bytecode_builder;
                    AVM_TRACK_TIME("tracegen/bytecode_hashing",
                                   bytecode_builder.process_hashing(events.bytecode_hashing, trace));
                    clear_events(events.bytecode_hashing);
                },
                [&]() {
                    ClassIdDerivationTraceBuilder class_id_builder;
                    AVM_TRACK_TIME("tracegen/class_id_derivation",
                                   class_id_builder.process(events.class_id_derivation, trace));
                    clear_events(events.class_id_derivation);
                },
                [&]() {
                    BytecodeTraceBuilder bytecode_builder;
                    AVM_TRACK_TIME("tracegen/bytecode_retrieval",
                                   bytecode_builder.process_retrieval(events.bytecode_retrieval, trace));
                    clear_events(events.bytecode_retrieval);
                },
                [&]() {
                    BytecodeTraceBuilder bytecode_builder;
                    AVM_TRACK_TIME("tracegen/instruction_fetching",
                                   bytecode_builder.process_instruction_fetching(events.instruction_fetching, trace));
                    clear_events(events.instruction_fetching);
                },
                [&]() {
                    Sha256TraceBuilder sha256_builder;
                    AVM_TRACK_TIME("tracegen/sha256_compression",
                                   sha256_builder.process(events.sha256_compression, trace));
                    clear_events(events.sha256_compression);
                },
                [&]() {
                    KeccakF1600TraceBuilder keccakf1600_builder;
                    AVM_TRACK_TIME("tracegen/keccak_f1600_permutation",
                                   keccakf1600_builder.process_permutation(events.keccakf1600, trace));
                    AVM_TRACK_TIME("tracegen/keccak_f1600_memory_slices",
                                   keccakf1600_builder.process_memory_slices(events.keccakf1600, trace));
                    clear_events(events.keccakf1600);
                },
                [&]() {
                    EccTraceBuilder ecc_builder;
                    AVM_TRACK_TIME("tracegen/ecc_add", ecc_builder.process_add(events.ecc_add, trace));
                    clear_events(events.ecc_add);
                },
                [&]() {
                    EccTraceBuilder ecc_builder;
                    AVM_TRACK_TIME("tracegen/scalar_mul", ecc_builder.process_scalar_mul(events.scalar_mul, trace));
                    clear_events(events.scalar_mul);
                },
                [&]() {
                    Poseidon2TraceBuilder poseidon2_builder;
                    AVM_TRACK_TIME("tracegen/poseidon2_hash",
                                   poseidon2_builder.process_hash(events.poseidon2_hash, trace));
                    clear_events(events.poseidon2_hash);
                },
                [&]() {
                    Poseidon2TraceBuilder poseidon2_builder;
                    AVM_TRACK_TIME("tracegen/poseidon2_permutation",
                                   poseidon2_builder.process_permutation(events.poseidon2_permutation, trace));
                    clear_events(events.poseidon2_permutation);
                },
                [&]() {
                    ToRadixTraceBuilder to_radix_builder;
                    AVM_TRACK_TIME("tracegen/to_radix", to_radix_builder.process(events.to_radix, trace));
                    clear_events(events.to_radix);
                },
                [&]() {
                    FieldGreaterThanTraceBuilder field_gt_builder;
                    AVM_TRACK_TIME("tracegen/field_gt", field_gt_builder.process(events.field_gt, trace));
                    clear_events(events.field_gt);
                },
                [&]() {
                    MerkleCheckTraceBuilder merkle_check_builder;
                    AVM_TRACK_TIME("tracegen/merkle_check", merkle_check_builder.process(events.merkle_check, trace));
                    clear_events(events.merkle_check);
                },
                [&]() {
                    RangeCheckTraceBuilder range_check_builder;
                    AVM_TRACK_TIME("tracegen/range_check", range_check_builder.process(events.range_check, trace));
                    clear_events(events.range_check);
                },
                [&]() {
                    PublicDataTreeCheckTraceBuilder public_data_tree_check_trace_builder;
                    AVM_TRACK_TIME(
                        "tracegen/public_data_tree_check",
                        public_data_tree_check_trace_builder.process(events.public_data_tree_check_events, trace));
                    clear_events(events.public_data_tree_check_events);
                },
                [&]() {
                    UpdateCheckTraceBuilder update_check_trace_builder;
                    AVM_TRACK_TIME("tracegen/update_check",
                                   update_check_trace_builder.process(events.update_check_events, trace));
                    clear_events(events.update_check_events);
                },
                [&]() {
                    NullifierTreeCheckTraceBuilder nullifier_tree_check_trace_builder;
                    AVM_TRACK_TIME(
                        "tracegen/nullifier_tree_check",
                        nullifier_tree_check_trace_builder.process(events.nullifier_tree_check_events, trace));
                    clear_events(events.nullifier_tree_check_events);
                },
                [&]() {
                    MemoryTraceBuilder memory_trace_builder;
                    AVM_TRACK_TIME("tracegen/memory", memory_trace_builder.process(events.memory, trace));
                    clear_events(events.memory);
                },
                [&]() {
                    DataCopyTraceBuilder data_copy_trace_builder;
                    AVM_TRACK_TIME("tracegen/data_copy",
                                   data_copy_trace_builder.process(events.data_copy_events, trace));
                    clear_events(events.data_copy_events);
                },
                [&]() {
                    BitwiseTraceBuilder bitwise_builder;
                    AVM_TRACK_TIME("tracegen/bitwise", bitwise_builder.process(events.bitwise, trace));
                    clear_events(events.bitwise);
                },
                [&]() {
                    CalldataTraceBuilder calldata_builder;
                    AVM_TRACK_TIME("tracegen/calldata_hashing",
                                   calldata_builder.process_hashing(events.calldata_events, trace));
                    AVM_TRACK_TIME("tracegen/calldata_retrieval",
                                   calldata_builder.process_retrieval(events.calldata_events, trace));
                    clear_events(events.calldata_events);
                },
                [&]() {
                    InternalCallStackBuilder internal_call_stack_builder;
                    AVM_TRACK_TIME("tracegen/internal_call_stack",
                                   internal_call_stack_builder.process(events.internal_call_stack_events, trace));
                    clear_events(events.internal_call_stack_events);
                },
                [&]() {
                    NoteHashTreeCheckTraceBuilder note_hash_tree_check_trace_builder;
                    AVM_TRACK_TIME(
                        "tracegen/note_hash_tree_check",
                        note_hash_tree_check_trace_builder.process(events.note_hash_tree_check_events, trace));
                    clear_events(events.note_hash_tree_check_events);
                } });

        AVM_TRACK_TIME("tracegen/traces", execute_jobs(jobs));
    }
}

void AvmTraceGenHelper::fill_trace_interactions(TraceContainer& trace)
{
    // Now we can compute lookups and permutations.
    {
        auto jobs_interactions = concatenate_jobs(TxTraceBuilder::interactions.get_all_jobs(),
                                                  ExecutionTraceBuilder::interactions.get_all_jobs(),
                                                  AluTraceBuilder::interactions.get_all_jobs(),
                                                  Poseidon2TraceBuilder::interactions.get_all_jobs(),
                                                  RangeCheckTraceBuilder::interactions.get_all_jobs(),
                                                  BitwiseTraceBuilder::interactions.get_all_jobs(),
                                                  Sha256TraceBuilder::interactions.get_all_jobs(),
                                                  KeccakF1600TraceBuilder::interactions.get_all_jobs(),
                                                  BytecodeTraceBuilder::interactions.get_all_jobs(),
                                                  ClassIdDerivationTraceBuilder::interactions.get_all_jobs(),
                                                  EccTraceBuilder::interactions.get_all_jobs(),
                                                  ToRadixTraceBuilder::interactions.get_all_jobs(),
                                                  AddressDerivationTraceBuilder::interactions.get_all_jobs(),
                                                  FieldGreaterThanTraceBuilder::interactions.get_all_jobs(),
                                                  MerkleCheckTraceBuilder::interactions.get_all_jobs(),
                                                  PublicDataTreeCheckTraceBuilder::interactions.get_all_jobs(),
                                                  UpdateCheckTraceBuilder::interactions.get_all_jobs(),
                                                  NullifierTreeCheckTraceBuilder::interactions.get_all_jobs(),
                                                  MemoryTraceBuilder::interactions.get_all_jobs(),
                                                  DataCopyTraceBuilder::interactions.get_all_jobs(),
                                                  CalldataTraceBuilder::interactions.get_all_jobs(),
                                                  NoteHashTreeCheckTraceBuilder::interactions.get_all_jobs());

        AVM_TRACK_TIME("tracegen/interactions",
                       parallel_for(jobs_interactions.size(), [&](size_t i) { jobs_interactions[i]->process(trace); }));
    }
}

TraceContainer AvmTraceGenHelper::generate_precomputed_columns()
{
    TraceContainer trace;
    auto jobs = build_precomputed_columns_jobs(trace);
    execute_jobs(jobs);
    return trace;
}

} // namespace bb::avm2
