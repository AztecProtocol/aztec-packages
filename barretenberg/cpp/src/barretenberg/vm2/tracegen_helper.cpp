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
#include "barretenberg/vm/stats.hpp"
#include "barretenberg/vm2/common/map.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/flavor.hpp"
#include "barretenberg/vm2/generated/relations/lookups_address_derivation.hpp"
#include "barretenberg/vm2/generated/relations/lookups_bc_decomposition.hpp"
#include "barretenberg/vm2/generated/relations/lookups_bc_retrieval.hpp"
#include "barretenberg/vm2/generated/relations/lookups_bitwise.hpp"
#include "barretenberg/vm2/generated/relations/lookups_class_id_derivation.hpp"
#include "barretenberg/vm2/generated/relations/lookups_instr_fetching.hpp"
#include "barretenberg/vm2/generated/relations/lookups_merkle_check.hpp"
#include "barretenberg/vm2/generated/relations/lookups_poseidon2_hash.hpp"
#include "barretenberg/vm2/generated/relations/lookups_range_check.hpp"
#include "barretenberg/vm2/generated/relations/lookups_scalar_mul.hpp"
#include "barretenberg/vm2/generated/relations/lookups_sha256.hpp"
#include "barretenberg/vm2/generated/relations/lookups_to_radix.hpp"
#include "barretenberg/vm2/tracegen/address_derivation_trace.hpp"
#include "barretenberg/vm2/tracegen/alu_trace.hpp"
#include "barretenberg/vm2/tracegen/bytecode_trace.hpp"
#include "barretenberg/vm2/tracegen/class_id_derivation_trace.hpp"
#include "barretenberg/vm2/tracegen/ecc_trace.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/field_gt_trace.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_into_bitwise.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_into_indexed_by_clk.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_into_p_decomposition.hpp"
#include "barretenberg/vm2/tracegen/lib/permutation_builder.hpp"
#include "barretenberg/vm2/tracegen/merkle_check_trace.hpp"
#include "barretenberg/vm2/tracegen/poseidon2_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/range_check_trace.hpp"
#include "barretenberg/vm2/tracegen/sha256_trace.hpp"
#include "barretenberg/vm2/tracegen/to_radix_trace.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

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
            AVM_TRACK_TIME("tracegen/precomputed/unary", precomputed_builder.process_unary(trace));
            AVM_TRACK_TIME("tracegen/precomputed/sha256_round_constants",
                           precomputed_builder.process_sha256_round_constants(trace));
            AVM_TRACK_TIME("tracegen/precomputed/integral_tag_length",
                           precomputed_builder.process_integral_tag_length(trace));
            AVM_TRACK_TIME("tracegen/precomputed/operand_dec_selectors",
                           precomputed_builder.process_wire_instruction_spec(trace));
            AVM_TRACK_TIME("tracegen/precomputed/to_radix_safe_limbs",
                           precomputed_builder.process_to_radix_safe_limbs(trace));
            AVM_TRACK_TIME("tracegen/precomputed/to_radix_p_decompositions",
                           precomputed_builder.process_to_radix_p_decompositions(trace));
        },
    };
}

void execute_jobs(std::span<std::function<void()>> jobs)
{
    parallel_for(jobs.size(), [&](size_t i) { jobs[i](); });
}

// We need this to be able to make a vector of unique_ptrs.
template <typename R, typename... Ts> std::vector<R> make_jobs(Ts&&... args)
{
    std::vector<R> jobs;
    jobs.reserve(sizeof...(Ts));
    (jobs.push_back(std::move(args)), ...);
    return jobs;
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

} // namespace

TraceContainer AvmTraceGenHelper::generate_trace(EventsContainer&& events)
{
    TraceContainer trace;

    // We process the events in parallel. Ideally the jobs should access disjoint column sets.
    {
        auto jobs = concatenate(
            // Precomputed column jobs.
            build_precomputed_columns_jobs(trace),
            // Subtrace jobs.
            std::vector<std::function<void()>>{
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
                    Sha256TraceBuilder sha256_builder(trace);
                    AVM_TRACK_TIME("tracegen/sha256_compression", sha256_builder.process(events.sha256_compression));
                    clear_events(events.sha256_compression);
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
            });
        AVM_TRACK_TIME("tracegen/traces", execute_jobs(jobs));
    }

    // Now we can compute lookups and permutations.
    {
        auto jobs_interactions = make_jobs<std::unique_ptr<InteractionBuilderInterface>>(
            // Poseidon2
            std::make_unique<LookupIntoDynamicTableSequential<lookup_poseidon2_hash_poseidon2_perm_settings>>(),
            // Range Check
            std::make_unique<LookupIntoIndexedByClk<lookup_range_check_dyn_diff_is_u16_settings>>(),
            std::make_unique<LookupIntoIndexedByClk<lookup_range_check_dyn_rng_chk_pow_2_settings>>(),
            std::make_unique<LookupIntoIndexedByClk<lookup_range_check_r0_is_u16_settings>>(),
            std::make_unique<LookupIntoIndexedByClk<lookup_range_check_r1_is_u16_settings>>(),
            std::make_unique<LookupIntoIndexedByClk<lookup_range_check_r2_is_u16_settings>>(),
            std::make_unique<LookupIntoIndexedByClk<lookup_range_check_r3_is_u16_settings>>(),
            std::make_unique<LookupIntoIndexedByClk<lookup_range_check_r4_is_u16_settings>>(),
            std::make_unique<LookupIntoIndexedByClk<lookup_range_check_r5_is_u16_settings>>(),
            std::make_unique<LookupIntoIndexedByClk<lookup_range_check_r6_is_u16_settings>>(),
            std::make_unique<LookupIntoIndexedByClk<lookup_range_check_r7_is_u16_settings>>(),
            // Bitwise
            std::make_unique<LookupIntoBitwise<lookup_bitwise_byte_operations_settings>>(),
            std::make_unique<LookupIntoIndexedByClk<lookup_bitwise_integral_tag_length_settings>>(),
            // SHA-256
            std::make_unique<LookupIntoIndexedByClk<lookup_sha256_round_constant_settings>>(),
            // Bytecode Hashing
            std::make_unique<LookupIntoDynamicTableSequential<lookup_bc_hashing_get_packed_field_settings>>(),
            std::make_unique<LookupIntoDynamicTableSequential<lookup_bc_hashing_iv_is_len_settings>>(),
            std::make_unique<LookupIntoDynamicTableSequential<lookup_bc_hashing_poseidon2_hash_settings>>(),
            // Bytecode Retrieval
            std::make_unique<LookupIntoDynamicTableSequential<lookup_bc_retrieval_bytecode_hash_is_correct_settings>>(),
            std::make_unique<LookupIntoDynamicTableSequential<lookup_bc_retrieval_class_id_derivation_settings>>(),
            // Bytecode Decomposition
            std::make_unique<LookupIntoIndexedByClk<lookup_bc_decomposition_bytes_to_read_as_unary_settings>>(),
            std::make_unique<LookupIntoIndexedByClk<lookup_bc_decomposition_bytes_are_bytes_settings>>(),
            std::make_unique<LookupIntoIndexedByClk<lookup_bc_decomposition_abs_diff_is_u16_settings>>(),
            // Instruction Fetching
            // TODO: Define another flavor for LookupIntoDynamicTableGeneric which takes only a prefix of the tuple
            // as key. This would lower memory and potentially a short speed-up. Here, the two first elements
            // (pc, bytecode_id) would define a unique key which is much shorter than this tuple which is about
            // 40 elements long.
            std::make_unique<LookupIntoDynamicTableGeneric<lookup_instr_fetching_bytes_from_bc_dec_settings>>(),
            std::make_unique<LookupIntoDynamicTableGeneric<lookup_instr_fetching_bytecode_size_from_bc_dec_settings>>(),
            std::make_unique<LookupIntoIndexedByClk<lookup_instr_fetching_wire_instruction_info_settings>>(),
            std::make_unique<LookupIntoIndexedByClk<lookup_instr_fetching_instr_abs_diff_positive_settings>>(),
            std::make_unique<LookupIntoDynamicTableGeneric<lookup_instr_fetching_pc_abs_diff_positive_settings>>(),
            // Class Id Derivation
            std::make_unique<
                LookupIntoDynamicTableSequential<lookup_class_id_derivation_class_id_poseidon2_0_settings>>(),
            std::make_unique<
                LookupIntoDynamicTableSequential<lookup_class_id_derivation_class_id_poseidon2_1_settings>>(),
            // Scalar mul
            std::make_unique<LookupIntoDynamicTableGeneric<lookup_scalar_mul_double_settings>>(),
            std::make_unique<LookupIntoDynamicTableGeneric<lookup_scalar_mul_add_settings>>(),
            std::make_unique<LookupIntoDynamicTableGeneric<lookup_scalar_mul_to_radix_settings>>(),
            // To radix
            std::make_unique<LookupIntoIndexedByClk<lookup_to_radix_limb_range_settings>>(),
            std::make_unique<LookupIntoIndexedByClk<lookup_to_radix_limb_less_than_radix_range_settings>>(),
            std::make_unique<LookupIntoIndexedByClk<lookup_to_radix_fetch_safe_limbs_settings>>(),
            std::make_unique<LookupIntoPDecomposition<lookup_to_radix_fetch_p_limb_settings>>(),
            std::make_unique<LookupIntoIndexedByClk<lookup_to_radix_limb_p_diff_range_settings>>(),
            // Address derivation
            std::make_unique<LookupIntoDynamicTableSequential<
                lookup_address_derivation_salted_initialization_hash_poseidon2_0_settings>>(),
            std::make_unique<LookupIntoDynamicTableSequential<
                lookup_address_derivation_salted_initialization_hash_poseidon2_1_settings>>(),
            std::make_unique<
                LookupIntoDynamicTableSequential<lookup_address_derivation_partial_address_poseidon2_settings>>(),
            std::make_unique<
                LookupIntoDynamicTableSequential<lookup_address_derivation_public_keys_hash_poseidon2_0_settings>>(),
            std::make_unique<
                LookupIntoDynamicTableSequential<lookup_address_derivation_public_keys_hash_poseidon2_1_settings>>(),
            std::make_unique<
                LookupIntoDynamicTableSequential<lookup_address_derivation_public_keys_hash_poseidon2_2_settings>>(),
            std::make_unique<
                LookupIntoDynamicTableSequential<lookup_address_derivation_public_keys_hash_poseidon2_3_settings>>(),
            std::make_unique<
                LookupIntoDynamicTableSequential<lookup_address_derivation_public_keys_hash_poseidon2_4_settings>>(),
            std::make_unique<
                LookupIntoDynamicTableSequential<lookup_address_derivation_preaddress_poseidon2_settings>>(),
            std::make_unique<
                LookupIntoDynamicTableSequential<lookup_address_derivation_preaddress_scalar_mul_settings>>(),
            std::make_unique<LookupIntoDynamicTableSequential<lookup_address_derivation_address_ecadd_settings>>(),
            // Field GT
            std::make_unique<LookupIntoDynamicTableSequential<lookup_ff_gt_a_lo_range_settings>>(),
            std::make_unique<LookupIntoDynamicTableSequential<lookup_ff_gt_a_hi_range_settings>>(),
            // Merkle checks
            std::make_unique<LookupIntoDynamicTableSequential<lookup_merkle_check_merkle_poseidon2_settings>>());

        AVM_TRACK_TIME("tracegen/interactions",
                       parallel_for(jobs_interactions.size(), [&](size_t i) { jobs_interactions[i]->process(trace); }));
    }

    check_interactions(trace);
    print_trace_stats(trace);
    return trace;
}

TraceContainer AvmTraceGenHelper::generate_precomputed_columns()
{
    TraceContainer trace;
    auto jobs = build_precomputed_columns_jobs(trace);
    execute_jobs(jobs);
    return trace;
}

} // namespace bb::avm2
