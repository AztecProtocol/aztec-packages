#include "barretenberg/smt_verification/relations/relation_operation_recorder.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/smt_verification/relations/translator_vm/translator_relations_recorder.hpp"
#include "barretenberg/smt_verification/solver/solver.hpp"
#include "barretenberg/smt_verification/terms/term.hpp"
#include <sstream>

namespace smt_relation_recorder {

std::vector<smt_terms::STerm> OperationReplayer::replay(
    const OperationTrace& trace,
    smt_solver::Solver* solver,
    std::unordered_map<std::string, smt_terms::STerm>& initial_variables,
    bool is_ffi)
{
    using namespace smt_terms;

    std::unordered_map<size_t, STerm> results;

    // Process each operation in order
    for (const auto& op : trace.operations) {
        STerm result;

        switch (op.kind) {
            // A wire or a challenge
        case OpKind::VAR: {
            const auto& var_name = std::get<std::string>(op.value);
            result = initial_variables.at(var_name);
            break;
        }

        case OpKind::CONST_FR: {
            const auto& val = std::get<uint256_t>(op.value);
            std::stringstream buf;
            buf << val;
            std::string hex = buf.str();
            if (hex.rfind("0x", 0) == 0) {
                hex = hex.substr(2);
            }
            result = is_ffi ? FFIConst(hex, solver, 16) : FFConst(hex, solver, 16);
            break;
        }

        case OpKind::ADD: {
            const auto& lhs = results.at(op.lhs_id);
            const auto& rhs = results.at(op.rhs_id);
            result = lhs + rhs;
            break;
        }

        case OpKind::SUB: {
            const auto& lhs = results.at(op.lhs_id);
            const auto& rhs = results.at(op.rhs_id);
            result = lhs - rhs;
            break;
        }

        case OpKind::MUL: {
            const auto& lhs = results.at(op.lhs_id);
            const auto& rhs = results.at(op.rhs_id);
            result = lhs * rhs;
            break;
        }

        case OpKind::NEG: {
            const auto& operand = results.at(op.lhs_id);
            result = -operand;
            break;
        }

        // This shouldn't really happen, since inversion for non-constants is not supported in the relations
        case OpKind::INV: {
            const auto& operand = results.at(op.lhs_id);
            // Inversion is represented as 1 / x
            STerm one;
            if (is_ffi) {
                one = STerm(bb::fr(1), solver, TermType::FFITerm);
            } else {
                one = STerm(bb::fr(1), solver, TermType::FFTerm);
            }
            result = one / operand;
            break;
        }

        default:
            throw std::runtime_error("Unknown operation kind in replay");
        }

        results[op.result_id] = result;
    }

    std::vector<smt_terms::STerm> accumulator_results;
    for (const auto& id : trace.accumulator_results) {
        accumulator_results.push_back(results.at(id));
    }
    return accumulator_results;
}

void replay_relation_generic(const OperationTrace& trace,
                             smt_solver::Solver* solver,
                             const std::vector<std::string>& original_names,
                             const std::string& prefix,
                             bool use_ffi,
                             std::vector<smt_terms::STerm>& out_formulas,
                             std::vector<smt_terms::STerm>& out_vars,
                             std::vector<std::string>& out_names,
                             const std::vector<std::string>& extra_param_names)
{
    using namespace smt_terms;

    // Build name mapping with prefix
    std::unordered_map<std::string, std::string> name_map;
    for (const auto& name : original_names) {
        name_map[name] = prefix.empty() ? name : prefix + "_" + name;
    }
    for (const auto& name : extra_param_names) {
        name_map[name] = prefix.empty() ? name : prefix + "_" + name;
    }

    // Generate initial variables
    std::unordered_map<std::string, STerm> initial_variables;
    out_vars.clear();
    out_names.clear();

    for (const auto& name : original_names) {
        auto mapped_name = name_map.at(name);
        initial_variables[name] = use_ffi ? FFIVar(mapped_name, solver) : FFVar(mapped_name, solver);
        out_vars.push_back(initial_variables[name]);
        out_names.push_back(mapped_name);
    }

    for (const auto& name : extra_param_names) {
        auto mapped_name = name_map.at(name);
        initial_variables[name] = use_ffi ? FFIVar(mapped_name, solver) : FFVar(mapped_name, solver);
        out_vars.push_back(initial_variables[name]);
        out_names.push_back(mapped_name);
    }

    // Replay operations
    out_formulas = OperationReplayer::replay(trace, solver, initial_variables, use_ffi);
}

} // namespace smt_relation_recorder
