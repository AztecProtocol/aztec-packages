#include "translator_relations_recorder.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/relations/translator_vm/translator_decomposition_relation_impl.hpp"
#include "barretenberg/relations/translator_vm/translator_extra_relations_impl.hpp"
#include "barretenberg/relations/translator_vm/translator_non_native_field_relation_impl.hpp"
#include "barretenberg/smt_verification/relations/relation_operation_recorder.hpp"
#include "barretenberg/smt_verification/solver/solver.hpp"
#include "barretenberg/smt_verification/terms/term.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"
#include <memory>
#include <string>
#include <unordered_set>
#include <vector>

namespace smt_translator_relations {

using namespace smt_relation_recorder;
using namespace smt_terms;

// Type alias for Translator recording
using FF = TranslatorRecordingFF;
template <size_t N> using Acc = TranslatorRecordingAccumulator<N>;

namespace {

static constexpr std::array<const char*, 4> ACCUMULATED_RESULT_PARAM_NAMES = { "accumulated_result_param_0",
                                                                               "accumulated_result_param_1",
                                                                               "accumulated_result_param_2",
                                                                               "accumulated_result_param_3" };

// Build labels equal to the exact AllEntities member names, in the same order as get_all()
static std::vector<std::string> build_all_entity_member_names()
{
    using Flavor = bb::TranslatorFlavor;
    using AllEntities = typename Flavor::AllEntities<FF>;

    AllEntities symbolic_all_entities;
    std::vector<std::string> names;

    for (auto [name, _] : zip_view(symbolic_all_entities.get_labels(), symbolic_all_entities.get_all())) {
        names.push_back(name);
    }

    return names;
}

} // anonymous namespace

// ============================================================================
// Record functions - these have relation-specific logic
// ============================================================================

OperationTrace record_translator_decomposition_relation()
{
    auto trace = std::make_shared<OperationTrace>();
    FF::default_trace = trace;

    struct RecordingAllEntities : public bb::TranslatorFlavor::AllEntities<FF> {};

    RecordingAllEntities in;
    auto refs = in.get_all();
    auto names = build_all_entity_member_names();

    for (size_t i = 0; i < refs.size(); ++i) {
        if (names[i] == "lagrange_even_in_minicircuit" || names[i] == "op") {
            refs[i] = FF(trace, static_cast<uint64_t>(1));
        } else {
            refs[i] = FF(trace, names[i]);
        }
    }

    bb::RelationParameters<FF> params;
    FF scaling(trace, static_cast<uint64_t>(1));

    auto accs =
        smt_relation_recorder::detail::make_accumulator_tuple<bb::TranslatorDecompositionRelationImpl<FF>, FF>();
    std::apply([&](auto&... a) { ((a.val = FF(trace, static_cast<uint64_t>(0))), ...); }, accs);

    bb::TranslatorDecompositionRelationImpl<FF>::accumulate(accs, in, params, scaling);

    size_t acc_idx = 0;
    std::apply([&](auto&... a) { ((trace->set_accumulator_result(acc_idx++, a.val.operation_id.value())), ...); },
               accs);

    FF::default_trace.reset();
    return *trace;
}

OperationTrace record_translator_opcode_constraint_relation()
{
    auto trace = std::make_shared<OperationTrace>();
    FF::default_trace = trace;

    using Flavor = bb::TranslatorFlavor;
    using AllEntities = typename Flavor::AllEntities<FF>;

    AllEntities entities;
    auto names = build_all_entity_member_names();

    size_t i = 0;
    for (auto& entity : entities.get_all()) {
        entity = FF(trace, names[i++]);
    }

    auto acc =
        smt_relation_recorder::detail::make_accumulator_tuple<bb::TranslatorOpcodeConstraintRelationImpl<FF>, FF>();
    std::apply([&](auto&... a) { ((a.val = FF(trace, static_cast<uint64_t>(0))), ...); }, acc);

    FF scaling_factor(trace, static_cast<uint64_t>(1));
    bb::RelationParameters<FF> params;
    bb::TranslatorOpcodeConstraintRelationImpl<FF>::accumulate(acc, entities, params, scaling_factor);

    size_t acc_idx = 0;
    std::apply([&](auto&... a) { ((trace->set_accumulator_result(acc_idx++, a.val.operation_id.value())), ...); }, acc);

    FF::default_trace.reset();
    return *trace;
}

OperationTrace record_translator_accumulator_transfer_relation()
{
    auto trace = std::make_shared<OperationTrace>();
    FF::default_trace = trace;

    using Flavor = bb::TranslatorFlavor;
    using AllEntities = typename Flavor::AllEntities<FF>;

    AllEntities entities;
    auto names = build_all_entity_member_names();

    size_t i = 0;
    for (auto& entity : entities.get_all()) {
        entity = FF(trace, names[i++]);
    }

    auto acc =
        smt_relation_recorder::detail::make_accumulator_tuple<bb::TranslatorAccumulatorTransferRelationImpl<FF>, FF>();
    std::apply([&](auto&... a) { ((a.val = FF(trace, static_cast<uint64_t>(0))), ...); }, acc);

    bb::RelationParameters<FF> params;
    for (size_t j = 0; j < ACCUMULATED_RESULT_PARAM_NAMES.size(); ++j) {
        params.accumulated_result[j] = FF(trace, ACCUMULATED_RESULT_PARAM_NAMES[j]);
    }
    FF scaling_factor(trace, static_cast<uint64_t>(1));

    bb::TranslatorAccumulatorTransferRelationImpl<FF>::accumulate(acc, entities, params, scaling_factor);

    size_t acc_idx = 0;
    std::apply([&](auto&... a) { ((trace->set_accumulator_result(acc_idx++, a.val.operation_id.value())), ...); }, acc);

    FF::default_trace.reset();
    return *trace;
}

OperationTrace record_translator_non_native_field_relation()
{
    auto trace = std::make_shared<OperationTrace>();
    FF::default_trace = trace;

    using Flavor = bb::TranslatorFlavor;
    using AllEntities = typename Flavor::AllEntities<FF>;

    AllEntities entities;
    auto names = build_all_entity_member_names();

    size_t i = 0;
    for (auto& entity : entities.get_all()) {
        if (names[i] == "lagrange_even_in_minicircuit" || names[i] == "op") {
            entity = FF(trace, static_cast<uint64_t>(1));
        } else {
            entity = FF(trace, names[i]);
        }
        i++;
    }

    auto acc =
        smt_relation_recorder::detail::make_accumulator_tuple<bb::TranslatorNonNativeFieldRelationImpl<FF>, FF>();
    std::apply([&](auto&... a) { ((a.val = FF(trace, static_cast<uint64_t>(0))), ...); }, acc);

    bb::RelationParameters<FF> params;
    for (size_t j = 0; j < params.evaluation_input_x.size(); ++j) {
        params.evaluation_input_x[j] = FF(trace, "evaluation_input_x_" + std::to_string(j));
    }
    for (size_t j = 0; j < params.batching_challenge_v.size(); ++j) {
        for (size_t k = 0; k < params.batching_challenge_v[j].size(); ++k) {
            params.batching_challenge_v[j][k] =
                FF(trace, "batching_challenge_v_" + std::to_string(j) + "_" + std::to_string(k));
        }
    }

    FF scaling_factor(trace, static_cast<uint64_t>(1));
    bb::TranslatorNonNativeFieldRelationImpl<FF>::accumulate(acc, entities, params, scaling_factor);

    size_t acc_idx = 0;
    std::apply([&](auto&... a) { ((trace->set_accumulator_result(acc_idx++, a.val.operation_id.value())), ...); }, acc);

    FF::default_trace.reset();
    return *trace;
}

// ============================================================================
// Replay functions - use the generic helper
// ============================================================================

void replay_translator_decomposition_relation(const OperationTrace& trace,
                                              smt_solver::Solver* solver,
                                              const std::string& prefix,
                                              bool use_ffi,
                                              std::vector<STerm>& out_formulas,
                                              std::vector<STerm>& out_vars,
                                              std::vector<std::string>& out_names)
{
    replay_relation_generic(
        trace, solver, build_all_entity_member_names(), prefix, use_ffi, out_formulas, out_vars, out_names);
}

void replay_translator_opcode_constraint_relation(const OperationTrace& trace,
                                                  smt_solver::Solver* solver,
                                                  const std::string& prefix,
                                                  std::vector<STerm>& out_formulas,
                                                  std::vector<STerm>& out_vars,
                                                  std::vector<std::string>& out_names)
{
    replay_relation_generic(
        trace, solver, build_all_entity_member_names(), prefix, false, out_formulas, out_vars, out_names);
}

void replay_translator_accumulator_transfer_relation(const OperationTrace& trace,
                                                     smt_solver::Solver* solver,
                                                     const std::string& prefix,
                                                     bool use_ffi,
                                                     std::vector<STerm>& out_formulas,
                                                     std::vector<STerm>& out_vars,
                                                     std::vector<std::string>& out_names)
{
    std::vector<std::string> extra_params(ACCUMULATED_RESULT_PARAM_NAMES.begin(), ACCUMULATED_RESULT_PARAM_NAMES.end());
    replay_relation_generic(trace,
                            solver,
                            build_all_entity_member_names(),
                            prefix,
                            use_ffi,
                            out_formulas,
                            out_vars,
                            out_names,
                            extra_params);
}

void replay_translator_non_native_field_relation(const OperationTrace& trace,
                                                 smt_solver::Solver* solver,
                                                 const std::string& prefix,
                                                 bool use_ffi,
                                                 std::vector<STerm>& out_formulas,
                                                 std::vector<STerm>& out_vars,
                                                 std::vector<std::string>& out_names)
{
    std::vector<std::string> extra_params;
    for (size_t i = 0; i < 5; ++i) {
        extra_params.push_back("evaluation_input_x_" + std::to_string(i));
    }
    for (size_t i = 0; i < 4; ++i) {
        for (size_t j = 0; j < 5; ++j) {
            extra_params.push_back("batching_challenge_v_" + std::to_string(i) + "_" + std::to_string(j));
        }
    }
    replay_relation_generic(trace,
                            solver,
                            build_all_entity_member_names(),
                            prefix,
                            use_ffi,
                            out_formulas,
                            out_vars,
                            out_names,
                            extra_params);
}

// ============================================================================
// Convenience functions
// ============================================================================

void instantiate_translator_decomposition_relation_recorded(smt_solver::Solver* solver,
                                                            const std::string& prefix,
                                                            bool use_ffi,
                                                            std::vector<STerm>& out_formulas,
                                                            std::vector<STerm>& out_vars,
                                                            std::vector<std::string>& out_names)
{
    auto trace = record_translator_decomposition_relation();
    replay_translator_decomposition_relation(trace, solver, prefix, use_ffi, out_formulas, out_vars, out_names);
}

void instantiate_translator_opcode_constraint_relation_recorded(smt_solver::Solver* solver,
                                                                const std::string& prefix,
                                                                std::vector<STerm>& out_formulas,
                                                                std::vector<STerm>& out_vars,
                                                                std::vector<std::string>& out_names)
{
    auto trace = record_translator_opcode_constraint_relation();
    replay_translator_opcode_constraint_relation(trace, solver, prefix, out_formulas, out_vars, out_names);
}

} // namespace smt_translator_relations
