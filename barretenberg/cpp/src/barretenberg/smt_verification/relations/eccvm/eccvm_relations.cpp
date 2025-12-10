#include "eccvm_relations.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/honk/proof_system/logderivative_library.hpp"
#include "barretenberg/relations/ecc_vm/ecc_bools_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_lookup_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_msm_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_point_table_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_set_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_transcript_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_wnaf_relation_impl.hpp"
#include "barretenberg/smt_verification/relations/relation_operation_recorder.hpp"

using namespace bb;
using namespace smt_relation_recorder;
using namespace smt_terms;

// Type alias for ECCVM recording
using FF = ECCVMRecordingFF;

// Explicitly instantiate the templates for ECCVMFF
namespace bb {
template class ECCVMBoolsRelationImpl<FF>;
template class ECCVMWnafRelationImpl<FF>;
template class ECCVMMSMRelationImpl<FF>;
template class ECCVMPointTableRelationImpl<FF>;
template class ECCVMTranscriptRelationImpl<FF>;
template class ECCVMSetRelationImpl<FF>;
template class ECCVMLookupRelationImpl<FF>;
} // namespace bb

namespace smt_eccvm_relations {

// Build list of all ECCVM entity names
static std::vector<std::string> build_all_entity_member_names()
{
    using Flavor = ECCVMFlavor;
    using AllEntities = typename Flavor::AllEntities<FF>;

    AllEntities symbolic_all_entities;
    std::vector<std::string> names;

    for (auto [name, _] : zip_view(symbolic_all_entities.get_labels(), symbolic_all_entities.get_all())) {
        names.push_back(name);
    }

    return names;
}

// ============================================================================
// Common helper for recording relations
// ============================================================================

template <typename Relation, typename ParamsSetup = std::nullptr_t>
static OperationTrace record_eccvm_relation_impl(ParamsSetup params_setup = nullptr)
{
    auto trace = std::make_shared<OperationTrace>();
    FF::default_trace = trace;

    using Flavor = ECCVMFlavor;
    using AllEntities = typename Flavor::AllEntities<FF>;

    AllEntities entities;
    std::vector<std::string> names;

    for (auto [name, entity] : zip_view(entities.get_labels(), entities.get_all())) {
        names.push_back(name);
    }

    // Create FF variable for each entity
    size_t i = 0;
    for (auto& entity : entities.get_all()) {
        entity = FF(trace, names[i++]);
    }

    // Create accumulator tuple automatically from relation metadata
    auto acc = smt_relation_recorder::detail::make_accumulator_tuple<Relation, FF>();

    // Initialize all accumulators to zero
    std::apply([&](auto&... a) { ((a.val = FF(trace, static_cast<uint64_t>(0))), ...); }, acc);

    // Set up relation parameters
    RelationParameters<FF> params;
    if constexpr (!std::is_same_v<ParamsSetup, std::nullptr_t>) {
        if (params_setup) {
            params_setup(trace, params);
        }
    }

    FF scaling_factor(trace, static_cast<uint64_t>(1));

    // Execute the relation
    Relation::accumulate(acc, entities, params, scaling_factor);

    // Record accumulator results
    size_t acc_idx = 0;
    std::apply([&](auto&... a) { ((trace->set_accumulator_result(acc_idx++, a.val.operation_id.value())), ...); }, acc);

    FF::default_trace.reset();
    return *trace;
}

// ============================================================================
// Record functions
// ============================================================================

OperationTrace record_eccvm_bools_relation()
{
    return record_eccvm_relation_impl<ECCVMBoolsRelation<FF>>();
}

OperationTrace record_eccvm_wnaf_relation()
{
    return record_eccvm_relation_impl<ECCVMWnafRelation<FF>>();
}

OperationTrace record_eccvm_msm_relation()
{
    return record_eccvm_relation_impl<ECCVMMSMRelation<FF>>();
}

OperationTrace record_eccvm_point_table_relation()
{
    return record_eccvm_relation_impl<ECCVMPointTableRelation<FF>>();
}

OperationTrace record_eccvm_transcript_relation()
{
    return record_eccvm_relation_impl<ECCVMTranscriptRelation<FF>>();
}

OperationTrace record_eccvm_set_relation()
{
    return record_eccvm_relation_impl<ECCVMSetRelation<FF>>(
        [](std::shared_ptr<OperationTrace> trace, RelationParameters<FF>& params) {
            params.gamma = FF(trace, "gamma");
            params.beta = FF(trace, "beta");
            params.beta_sqr = FF(trace, "beta_sqr");
            params.beta_cube = FF(trace, "beta_cube");
            params.eccvm_set_permutation_delta = FF(trace, "eccvm_set_permutation_delta");
        });
}

OperationTrace record_eccvm_lookup_relation()
{
    return record_eccvm_relation_impl<ECCVMLookupRelation<FF>>(
        [](std::shared_ptr<OperationTrace> trace, RelationParameters<FF>& params) {
            params.gamma = FF(trace, "gamma");
            params.beta = FF(trace, "beta");
            params.beta_sqr = FF(trace, "beta_sqr");
            params.beta_cube = FF(trace, "beta_cube");
        });
}

// ============================================================================
// Replay functions - all use the common replay_relation_generic helper
// ============================================================================

void replay_eccvm_bools_relation(const OperationTrace& trace,
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

void replay_eccvm_wnaf_relation(const OperationTrace& trace,
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

void replay_eccvm_msm_relation(const OperationTrace& trace,
                               Solver* solver,
                               const std::string& prefix,
                               bool use_ffi,
                               std::vector<STerm>& out_formulas,
                               std::vector<STerm>& out_vars,
                               std::vector<std::string>& out_names)
{
    replay_relation_generic(
        trace, solver, build_all_entity_member_names(), prefix, use_ffi, out_formulas, out_vars, out_names);
}

void replay_eccvm_point_table_relation(const OperationTrace& trace,
                                       Solver* solver,
                                       const std::string& prefix,
                                       bool use_ffi,
                                       std::vector<STerm>& out_formulas,
                                       std::vector<STerm>& out_vars,
                                       std::vector<std::string>& out_names)
{
    replay_relation_generic(
        trace, solver, build_all_entity_member_names(), prefix, use_ffi, out_formulas, out_vars, out_names);
}

void replay_eccvm_transcript_relation(const OperationTrace& trace,
                                      Solver* solver,
                                      const std::string& prefix,
                                      bool use_ffi,
                                      std::vector<STerm>& out_formulas,
                                      std::vector<STerm>& out_vars,
                                      std::vector<std::string>& out_names)
{
    replay_relation_generic(
        trace, solver, build_all_entity_member_names(), prefix, use_ffi, out_formulas, out_vars, out_names);
}

void replay_eccvm_set_relation(const OperationTrace& trace,
                               Solver* solver,
                               const std::string& prefix,
                               bool use_ffi,
                               std::vector<STerm>& out_formulas,
                               std::vector<STerm>& out_vars,
                               std::vector<std::string>& out_names)
{
    std::vector<std::string> extra_params = { "gamma", "beta", "beta_sqr", "beta_cube", "eccvm_set_permutation_delta" };
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

void replay_eccvm_lookup_relation(const OperationTrace& trace,
                                  Solver* solver,
                                  const std::string& prefix,
                                  bool use_ffi,
                                  std::vector<STerm>& out_formulas,
                                  std::vector<STerm>& out_vars,
                                  std::vector<std::string>& out_names)
{
    std::vector<std::string> extra_params = { "gamma", "beta", "beta_sqr", "beta_cube" };
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

} // namespace smt_eccvm_relations
