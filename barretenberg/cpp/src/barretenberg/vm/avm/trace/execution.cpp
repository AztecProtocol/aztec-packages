#include "barretenberg/vm/avm/trace/execution.hpp"
#include "barretenberg/bb/log.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm/avm/generated/circuit_builder.hpp"
#include "barretenberg/vm/avm/generated/composer.hpp"
#include "barretenberg/vm/avm/generated/flavor.hpp"
#include "barretenberg/vm/avm/generated/verifier.hpp"
#include "barretenberg/vm/avm/trace/common.hpp"
#include "barretenberg/vm/avm/trace/deserialization.hpp"
#include "barretenberg/vm/avm/trace/helper.hpp"
#include "barretenberg/vm/avm/trace/instructions.hpp"
#include "barretenberg/vm/avm/trace/kernel_trace.hpp"
#include "barretenberg/vm/avm/trace/opcode.hpp"
#include "barretenberg/vm/avm/trace/public_inputs.hpp"
#include "barretenberg/vm/avm/trace/trace.hpp"
#include "barretenberg/vm/aztec_constants.hpp"
#include "barretenberg/vm/constants.hpp"
#include "barretenberg/vm/stats.hpp"

#include <algorithm>
#include <cassert>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <filesystem>
#include <string>
#include <tuple>
#include <unordered_map>
#include <variant>
#include <vector>

using namespace bb;

// Set in BB's main.cpp.
std::filesystem::path avm_dump_trace_path;

namespace bb::avm_trace {

std::string to_name(TxExecutionPhase phase)
{
    switch (phase) {
    case TxExecutionPhase::SETUP:
        return "SETUP";
    case TxExecutionPhase::APP_LOGIC:
        return "APP_LOGIC";
    case TxExecutionPhase::TEARDOWN:
        return "TEARDOWN";
    default:
        throw std::runtime_error("Invalid tx phase");
        break;
    }
}

/**************************************************************************************************
 *                              HELPERS IN ANONYMOUS NAMESPACE
 **************************************************************************************************/
namespace {

template <size_t N>
std::vector<PublicCallRequest> non_empty_call_requests(std::array<PublicCallRequest, N> call_requests_array)
{
    std::vector<PublicCallRequest> call_requests_vec;
    for (const auto& call_request : call_requests_array) {
        if (!call_request.is_empty()) {
            call_requests_vec.push_back(call_request);
        }
    }
    return call_requests_vec;
}

// The SRS needs to be able to accommodate the circuit subgroup size.
// Note: The *2 is due to how init_bn254_crs works, look there.
static_assert(Execution::SRS_SIZE >= bb::avm::AvmCircuitBuilder::CIRCUIT_SUBGROUP_SIZE * 2);

template <typename K, typename V>
std::vector<std::pair<K, V>> sorted_entries(const std::unordered_map<K, V>& map, bool invert = false)
{
    std::vector<std::pair<K, V>> entries;
    entries.reserve(map.size());
    for (const auto& [key, value] : map) {
        entries.emplace_back(key, value);
    }
    std::sort(entries.begin(), entries.end(), [invert](const auto& a, const auto& b) {
        bool r = a.first < b.first;
        if (invert) {
            r = !r;
        }
        return r;
    });
    return entries;
}

// Returns degree distribution information for main relations (e.g., not lookups/perms).
std::unordered_map</*relation*/ std::string, /*degrees*/ std::string> get_relations_degrees()
{
    std::unordered_map<std::string, std::string> relations_degrees;

    bb::constexpr_for<0, std::tuple_size_v<bb::avm::AvmFlavor::MainRelations>, 1>([&]<size_t i>() {
        std::unordered_map<int, int> degree_distribution;
        using Relation = std::tuple_element_t<i, bb::avm::AvmFlavor::Relations>;
        for (const auto& len : Relation::SUBRELATION_PARTIAL_LENGTHS) {
            degree_distribution[static_cast<int>(len - 1)]++;
        }
        std::string degrees_string;
        auto entries = sorted_entries(degree_distribution, /*invert=*/true);
        for (size_t n = 0; n < entries.size(); n++) {
            const auto& [degree, count] = entries[n];
            if (n > 0) {
                degrees_string += ", ";
            }
            degrees_string += std::to_string(degree) + "°: " + std::to_string(count);
        }
        relations_degrees.insert({ Relation::NAME, std::move(degrees_string) });
    });

    return relations_degrees;
}

void show_trace_info(const auto& trace)
{
    vinfo("Built trace size: ", trace.size(), " (next power: 2^", std::bit_width(trace.size()), ")");
    vinfo("Number of columns: ", trace.front().SIZE);
    vinfo("Relation degrees: ", []() {
        std::string result;
        for (const auto& [key, value] : sorted_entries(get_relations_degrees())) {
            result += "\n\t" + key + ": [" + value + "]";
        }
        return result;
    }());

    // The following computations are expensive, so we only do them in verbose mode.
    if (!verbose_logging) {
        return;
    }

    const size_t total_elements = trace.front().SIZE * trace.size();
    const size_t nonzero_elements = [&]() {
        size_t count = 0;
        for (auto const& row : trace) {
            for (const auto& ff : row.as_vector()) {
                if (!ff.is_zero()) {
                    count++;
                }
            }
        }
        return count;
    }();
    vinfo("Number of non-zero elements: ",
          nonzero_elements,
          "/",
          total_elements,
          " (",
          100 * nonzero_elements / total_elements,
          "%)");
    const size_t non_zero_columns = [&]() {
        std::vector<bool> column_is_nonzero(trace.front().SIZE, false);
        for (auto const& row : trace) {
            const auto row_vec = row.as_vector();
            for (size_t col = 0; col < row.SIZE; col++) {
                if (!row_vec[col].is_zero()) {
                    column_is_nonzero[col] = true;
                }
            }
        }
        return static_cast<size_t>(std::count(column_is_nonzero.begin(), column_is_nonzero.end(), true));
    }();
    vinfo("Number of non-zero columns: ",
          non_zero_columns,
          "/",
          trace.front().SIZE,
          " (",
          100 * non_zero_columns / trace.front().SIZE,
          "%)");
}

} // namespace

/**************************************************************************************************
 *                              Execution
 **************************************************************************************************/

// Needed for dependency injection in tests.
Execution::TraceBuilderConstructor Execution::trace_builder_constructor =
    [](AvmPublicInputs public_inputs, ExecutionHints execution_hints, uint32_t side_effect_counter) {
        return AvmTraceBuilder(public_inputs, std::move(execution_hints), side_effect_counter);
    };

/**
 * @brief Temporary routine to generate default public inputs (gas values) until we get
 *        proper integration of public inputs.
 */
std::vector<FF> Execution::getDefaultPublicInputs()
{
    std::vector<FF> public_inputs_vec(PUBLIC_CIRCUIT_PUBLIC_INPUTS_LENGTH);
    public_inputs_vec.at(DA_START_GAS_LEFT_PCPI_OFFSET) = 1000000000;
    public_inputs_vec.at(L2_START_GAS_LEFT_PCPI_OFFSET) = 1000000000;
    return public_inputs_vec;
}

/**
 * @brief Run the bytecode, generate the corresponding execution trace and prove the correctness
 *        of the execution of the supplied bytecode.
 *
 * @throws runtime_error exception when the bytecode is invalid.
 * @return The verifier key and zk proof of the execution.
 */
std::tuple<bb::avm::AvmFlavor::VerificationKey, HonkProof> Execution::prove(AvmPublicInputs const& public_inputs,
                                                                            ExecutionHints const& execution_hints)
{
    std::vector<FF> returndata;
    std::vector<FF> calldata;
    for (const auto& enqueued_call_hints : execution_hints.enqueued_call_hints) {
        calldata.insert(calldata.end(), enqueued_call_hints.calldata.begin(), enqueued_call_hints.calldata.end());
    }
    std::vector<Row> trace = AVM_TRACK_TIME_V(
        "prove/gen_trace", gen_trace(public_inputs, returndata, execution_hints, /*apply_e2e_assertions=*/true));
    if (!avm_dump_trace_path.empty()) {
        info("Dumping trace as CSV to: " + avm_dump_trace_path.string());
        dump_trace_as_csv(trace, avm_dump_trace_path);
    }
    auto circuit_builder = bb::avm::AvmCircuitBuilder();
    circuit_builder.set_trace(std::move(trace));
    vinfo("Circuit subgroup size: 2^",
          // this calculates the integer log2
          std::bit_width(circuit_builder.get_circuit_subgroup_size()) - 1);

    if (circuit_builder.get_circuit_subgroup_size() > SRS_SIZE) {
        throw_or_abort("Circuit subgroup size (" + std::to_string(circuit_builder.get_circuit_subgroup_size()) +
                       ") exceeds SRS_SIZE (" + std::to_string(SRS_SIZE) + ")");
    }

    // We only run check_circuit if forced to.
    if (std::getenv("AVM_FORCE_CHECK_CIRCUIT") != nullptr) {
        AVM_TRACK_TIME("prove/check_circuit", circuit_builder.check_circuit());
    }

    auto composer = AVM_TRACK_TIME_V("prove/create_composer", bb::avm::AvmComposer());
    auto prover = AVM_TRACK_TIME_V("prove/create_prover", composer.create_prover(circuit_builder));
    auto verifier = AVM_TRACK_TIME_V("prove/create_verifier", composer.create_verifier(circuit_builder));
    // Reclaim memory. Ideally this would be done as soon as the polynomials are created, but the above flow requires
    // the trace both in creation of the prover and the verifier.
    circuit_builder.clear_trace();

    vinfo("------- PROVING EXECUTION -------");
    // Proof structure: public_inputs | calldata_size | calldata | returndata_size | returndata | raw proof
    std::vector<FF> empty_public_inputs_vec(PUBLIC_CIRCUIT_PUBLIC_INPUTS_LENGTH);
    // Temp: We zero out the public inputs when proving
    HonkProof proof(empty_public_inputs_vec);
    proof.emplace_back(calldata.size());
    proof.insert(proof.end(), calldata.begin(), calldata.end());
    proof.emplace_back(returndata.size());
    proof.insert(proof.end(), returndata.begin(), returndata.end());
    auto raw_proof = prover.construct_proof();
    proof.insert(proof.end(), raw_proof.begin(), raw_proof.end());
    return std::make_tuple(*verifier.key, proof);
}

bool Execution::verify(bb::avm::AvmFlavor::VerificationKey vk, HonkProof const& proof)
{
    bb::avm::AvmVerifier verifier(std::make_shared<bb::avm::AvmFlavor::VerificationKey>(vk));

    // Proof structure: public_inputs | calldata_size | calldata | returndata_size | returndata | raw proof
    std::vector<FF> public_inputs_vec;
    std::vector<FF> calldata;
    std::vector<FF> returndata;
    std::vector<FF> raw_proof;

    // This can be made nicer using BB's serialize::read, probably.
    const auto public_inputs_offset = proof.begin();
    const auto calldata_size_offset = public_inputs_offset + PUBLIC_CIRCUIT_PUBLIC_INPUTS_LENGTH;
    const auto calldata_offset = calldata_size_offset + 1;
    const auto returndata_size_offset = calldata_offset + static_cast<int64_t>(uint64_t(*calldata_size_offset));
    const auto returndata_offset = returndata_size_offset + 1;
    const auto raw_proof_offset = returndata_offset + static_cast<int64_t>(uint64_t(*returndata_size_offset));

    std::copy(public_inputs_offset, calldata_size_offset, std::back_inserter(public_inputs_vec));
    std::copy(calldata_offset, returndata_size_offset, std::back_inserter(calldata));
    std::copy(returndata_offset, raw_proof_offset, std::back_inserter(returndata));
    std::copy(raw_proof_offset, proof.end(), std::back_inserter(raw_proof));

    // VmPublicInputs public_inputs = avm_trace::convert_public_inputs(public_inputs_vec);
    // Temp: We zero out the "Kernel public inputs" when verifying
    std::vector<std::vector<FF>> public_inputs_columns = { {}, {}, {}, {}, calldata, returndata };
    // copy_public_inputs_columns(public_inputs, calldata, returndata);
    return verifier.verify_proof(raw_proof, public_inputs_columns);
}

/**
 * @brief Generate the execution trace pertaining to the supplied instructions returns the return data.
 *
 * @param public_inputs - to constrain execution inputs & results against
 * @param returndata - to add to for each enqueued call
 * @param execution_hints - to inform execution
 * @param apply_e2e_assertions - should we apply assertions on public inputs (like end gas) and bytecode membership?
 * @return The trace as a vector of Row.
 */
std::vector<Row> Execution::gen_trace(AvmPublicInputs const& public_inputs,
                                      std::vector<FF>& returndata,
                                      ExecutionHints const& execution_hints,
                                      bool apply_e2e_assertions)

{
    vinfo("------- GENERATING TRACE -------");
    // TODO(https://github.com/AztecProtocol/aztec-packages/issues/6718): construction of the public input columns
    // should be done in the kernel - this is stubbed and underconstrained
    uint32_t start_side_effect_counter = 0;
    // Temporary until we get proper nested call handling
    std::vector<FF> calldata;
    for (const auto& enqueued_call_hints : execution_hints.enqueued_call_hints) {
        calldata.insert(calldata.end(), enqueued_call_hints.calldata.begin(), enqueued_call_hints.calldata.end());
    }
    AvmTraceBuilder trace_builder =
        Execution::trace_builder_constructor(public_inputs, execution_hints, start_side_effect_counter);
    trace_builder.set_all_calldata(calldata);

    const auto setup_call_requests = non_empty_call_requests(public_inputs.public_setup_call_requests);
    const auto app_logic_call_requests = non_empty_call_requests(public_inputs.public_app_logic_call_requests);
    std::vector<PublicCallRequest> teardown_call_requests;
    if (!public_inputs.public_teardown_call_request.is_empty()) {
        // teardown is always one call request
        teardown_call_requests.push_back(public_inputs.public_teardown_call_request);
    }

    // Loop over all the public call requests
    auto const phases = { TxExecutionPhase::SETUP, TxExecutionPhase::APP_LOGIC, TxExecutionPhase::TEARDOWN };
    for (auto phase : phases) {
        const auto public_call_requests = phase == TxExecutionPhase::SETUP       ? setup_call_requests
                                          : phase == TxExecutionPhase::APP_LOGIC ? app_logic_call_requests
                                                                                 : teardown_call_requests;

        // When we get this, it means we have done our non-revertible setup phase
        if (phase == TxExecutionPhase::SETUP) {
            vinfo("Inserting non-revertible side effects from private before SETUP phase. Checkpointing trees.");
            // Temporary spot for private non-revertible insertion
            std::vector<FF> siloed_nullifiers;
            siloed_nullifiers.insert(
                siloed_nullifiers.end(),
                public_inputs.previous_non_revertible_accumulated_data.nullifiers.begin(),
                public_inputs.previous_non_revertible_accumulated_data.nullifiers.begin() +
                    public_inputs.previous_non_revertible_accumulated_data_array_lengths.nullifiers);
            trace_builder.insert_private_state(siloed_nullifiers, {});
            trace_builder.checkpoint_non_revertible_state();
        } else if (phase == TxExecutionPhase::APP_LOGIC) {
            vinfo("Inserting revertible side effects from private before APP_LOGIC phase");
            // Temporary spot for private revertible insertion
            std::vector<FF> siloed_nullifiers;
            siloed_nullifiers.insert(siloed_nullifiers.end(),
                                     public_inputs.previous_revertible_accumulated_data.nullifiers.begin(),
                                     public_inputs.previous_revertible_accumulated_data.nullifiers.begin() +
                                         public_inputs.previous_revertible_accumulated_data_array_lengths.nullifiers);
            trace_builder.insert_private_state(siloed_nullifiers, {});
        }

        vinfo("Beginning execution of phase ", to_name(phase), " (", public_call_requests.size(), " enqueued calls).");
        AvmError phase_error = AvmError::NO_ERROR;
        for (size_t i = 0; i < public_call_requests.size(); i++) {
            auto public_call_request = public_call_requests.at(i);
            trace_builder.set_public_call_request(public_call_request);
            // At the start of each enqueued call, we read the enqueued call hints
            auto enqueued_call_hint = execution_hints.enqueued_call_hints.at(i);
            ASSERT(public_call_request.contract_address == enqueued_call_hint.contract_address);
            // Execute!
            phase_error =
                Execution::execute_enqueued_call(trace_builder, enqueued_call_hint, returndata, apply_e2e_assertions);

            if (!is_ok(phase_error)) {
                info("Phase ", to_name(phase), " reverted.");
                // otherwise, reverting in a revertible phase rolls back state
                vinfo("Rolling back tree roots to non-revertible checkpoint");
                trace_builder.rollback_to_non_revertible_checkpoint();
                break;
            }
        }

        if (!is_ok(phase_error) && phase == TxExecutionPhase::SETUP) {
            // Stop processing phases. Halt TX.
            info("A revert during SETUP phase halts the entire TX");
            break;
        }
    }
    auto trace = trace_builder.finalize(apply_e2e_assertions);

    returndata = trace_builder.get_all_returndata();

    show_trace_info(trace);
    return trace;
}

/**
 * @brief Execute one enqueued call, adding its results to the trace.
 *
 * @param trace_builder - the trace builder to add rows to
 * @param public_call_request - the enqueued call to execute
 * @param returndata - to add to for each enqueued call
 * @returns the error/result of the enqueued call
 *
 */
AvmError Execution::execute_enqueued_call(AvmTraceBuilder& trace_builder,
                                          AvmEnqueuedCallHint& enqueued_call_hint,
                                          std::vector<FF>& returndata,
                                          bool check_bytecode_membership)
{
    AvmError error = AvmError::NO_ERROR;

    // These hints help us to set up first call ctx
    uint32_t clk = trace_builder.get_clk();
    auto context_id = static_cast<uint8_t>(clk);
    trace_builder.current_ext_call_ctx = AvmTraceBuilder::ExtCallCtx{
        .context_id = context_id,
        .parent_id = 0,
        .contract_address = enqueued_call_hint.contract_address,
        .calldata = enqueued_call_hint.calldata,
        .nested_returndata = {},
        .last_pc = 0,
        .success_offset = 0,
        .l2_gas = 0,
        .da_gas = 0,
        .internal_return_ptr_stack = {},
    };
    // Find the bytecode based on contract address of the public call request
    std::vector<uint8_t> bytecode =
        trace_builder.get_bytecode(trace_builder.current_ext_call_ctx.contract_address, check_bytecode_membership);

    // Copied version of pc maintained in trace builder. The value of pc is evolving based
    // on opcode logic and therefore is not maintained here. However, the next opcode in the execution
    // is determined by this value which require read access to the code below.
    uint32_t pc = 0;
    std::stack<uint32_t> debug_counter_stack;
    uint32_t counter = 0;
    trace_builder.set_call_ptr(context_id);
    while (is_ok(error) && (pc = trace_builder.get_pc()) < bytecode.size()) {
        auto [inst, parse_error] = Deserialization::parse(bytecode, pc);
        error = parse_error;

        if (!is_ok(error)) {
            break;
        }

        debug("[PC:" + std::to_string(pc) + "] [IC:" + std::to_string(counter++) + "] " + inst.to_string() +
              " (gasLeft l2=" + std::to_string(trace_builder.get_l2_gas_left()) + ")");

        switch (inst.op_code) {
            // Compute
            // Compute - Arithmetic
        case OpCode::ADD_8:
            error = trace_builder.op_add(std::get<uint8_t>(inst.operands.at(0)),
                                         std::get<uint8_t>(inst.operands.at(1)),
                                         std::get<uint8_t>(inst.operands.at(2)),
                                         std::get<uint8_t>(inst.operands.at(3)),
                                         OpCode::ADD_8);
            break;
        case OpCode::ADD_16:
            error = trace_builder.op_add(std::get<uint8_t>(inst.operands.at(0)),
                                         std::get<uint16_t>(inst.operands.at(1)),
                                         std::get<uint16_t>(inst.operands.at(2)),
                                         std::get<uint16_t>(inst.operands.at(3)),
                                         OpCode::ADD_16);
            break;
        case OpCode::SUB_8:
            error = trace_builder.op_sub(std::get<uint8_t>(inst.operands.at(0)),
                                         std::get<uint8_t>(inst.operands.at(1)),
                                         std::get<uint8_t>(inst.operands.at(2)),
                                         std::get<uint8_t>(inst.operands.at(3)),
                                         OpCode::SUB_8);
            break;
        case OpCode::SUB_16:
            error = trace_builder.op_sub(std::get<uint8_t>(inst.operands.at(0)),
                                         std::get<uint16_t>(inst.operands.at(1)),
                                         std::get<uint16_t>(inst.operands.at(2)),
                                         std::get<uint16_t>(inst.operands.at(3)),
                                         OpCode::SUB_16);
            break;
        case OpCode::MUL_8:
            error = trace_builder.op_mul(std::get<uint8_t>(inst.operands.at(0)),
                                         std::get<uint8_t>(inst.operands.at(1)),
                                         std::get<uint8_t>(inst.operands.at(2)),
                                         std::get<uint8_t>(inst.operands.at(3)),
                                         OpCode::MUL_8);
            break;
        case OpCode::MUL_16:
            error = trace_builder.op_mul(std::get<uint8_t>(inst.operands.at(0)),
                                         std::get<uint16_t>(inst.operands.at(1)),
                                         std::get<uint16_t>(inst.operands.at(2)),
                                         std::get<uint16_t>(inst.operands.at(3)),
                                         OpCode::MUL_16);
            break;
        case OpCode::DIV_8:
            error = trace_builder.op_div(std::get<uint8_t>(inst.operands.at(0)),
                                         std::get<uint8_t>(inst.operands.at(1)),
                                         std::get<uint8_t>(inst.operands.at(2)),
                                         std::get<uint8_t>(inst.operands.at(3)),
                                         OpCode::DIV_8);
            break;
        case OpCode::DIV_16:
            error = trace_builder.op_div(std::get<uint8_t>(inst.operands.at(0)),
                                         std::get<uint16_t>(inst.operands.at(1)),
                                         std::get<uint16_t>(inst.operands.at(2)),
                                         std::get<uint16_t>(inst.operands.at(3)),
                                         OpCode::DIV_16);
            break;
        case OpCode::FDIV_8:
            error = trace_builder.op_fdiv(std::get<uint8_t>(inst.operands.at(0)),
                                          std::get<uint8_t>(inst.operands.at(1)),
                                          std::get<uint8_t>(inst.operands.at(2)),
                                          std::get<uint8_t>(inst.operands.at(3)),
                                          OpCode::FDIV_8);
            break;
        case OpCode::FDIV_16:
            error = trace_builder.op_fdiv(std::get<uint8_t>(inst.operands.at(0)),
                                          std::get<uint16_t>(inst.operands.at(1)),
                                          std::get<uint16_t>(inst.operands.at(2)),
                                          std::get<uint16_t>(inst.operands.at(3)),
                                          OpCode::FDIV_16);
            break;
        case OpCode::EQ_8:
            error = trace_builder.op_eq(std::get<uint8_t>(inst.operands.at(0)),
                                        std::get<uint8_t>(inst.operands.at(1)),
                                        std::get<uint8_t>(inst.operands.at(2)),
                                        std::get<uint8_t>(inst.operands.at(3)),
                                        OpCode::EQ_8);
            break;
        case OpCode::EQ_16:
            error = trace_builder.op_eq(std::get<uint8_t>(inst.operands.at(0)),
                                        std::get<uint16_t>(inst.operands.at(1)),
                                        std::get<uint16_t>(inst.operands.at(2)),
                                        std::get<uint16_t>(inst.operands.at(3)),
                                        OpCode::EQ_16);
            break;
        case OpCode::LT_8:
            error = trace_builder.op_lt(std::get<uint8_t>(inst.operands.at(0)),
                                        std::get<uint8_t>(inst.operands.at(1)),
                                        std::get<uint8_t>(inst.operands.at(2)),
                                        std::get<uint8_t>(inst.operands.at(3)),
                                        OpCode::LT_8);
            break;
        case OpCode::LT_16:
            error = trace_builder.op_lt(std::get<uint8_t>(inst.operands.at(0)),
                                        std::get<uint16_t>(inst.operands.at(1)),
                                        std::get<uint16_t>(inst.operands.at(2)),
                                        std::get<uint16_t>(inst.operands.at(3)),
                                        OpCode::LT_16);
            break;
        case OpCode::LTE_8:
            error = trace_builder.op_lte(std::get<uint8_t>(inst.operands.at(0)),
                                         std::get<uint8_t>(inst.operands.at(1)),
                                         std::get<uint8_t>(inst.operands.at(2)),
                                         std::get<uint8_t>(inst.operands.at(3)),
                                         OpCode::LTE_8);
            break;
        case OpCode::LTE_16:
            error = trace_builder.op_lte(std::get<uint8_t>(inst.operands.at(0)),
                                         std::get<uint16_t>(inst.operands.at(1)),
                                         std::get<uint16_t>(inst.operands.at(2)),
                                         std::get<uint16_t>(inst.operands.at(3)),
                                         OpCode::LTE_16);
            break;
        case OpCode::AND_8:
            error = trace_builder.op_and(std::get<uint8_t>(inst.operands.at(0)),
                                         std::get<uint8_t>(inst.operands.at(1)),
                                         std::get<uint8_t>(inst.operands.at(2)),
                                         std::get<uint8_t>(inst.operands.at(3)),
                                         OpCode::AND_8);
            break;
        case OpCode::AND_16:
            error = trace_builder.op_and(std::get<uint8_t>(inst.operands.at(0)),
                                         std::get<uint16_t>(inst.operands.at(1)),
                                         std::get<uint16_t>(inst.operands.at(2)),
                                         std::get<uint16_t>(inst.operands.at(3)),
                                         OpCode::AND_16);
            break;
        case OpCode::OR_8:
            error = trace_builder.op_or(std::get<uint8_t>(inst.operands.at(0)),
                                        std::get<uint8_t>(inst.operands.at(1)),
                                        std::get<uint8_t>(inst.operands.at(2)),
                                        std::get<uint8_t>(inst.operands.at(3)),
                                        OpCode::OR_8);
            break;
        case OpCode::OR_16:
            error = trace_builder.op_or(std::get<uint8_t>(inst.operands.at(0)),
                                        std::get<uint16_t>(inst.operands.at(1)),
                                        std::get<uint16_t>(inst.operands.at(2)),
                                        std::get<uint16_t>(inst.operands.at(3)),
                                        OpCode::OR_16);
            break;
        case OpCode::XOR_8:
            error = trace_builder.op_xor(std::get<uint8_t>(inst.operands.at(0)),
                                         std::get<uint8_t>(inst.operands.at(1)),
                                         std::get<uint8_t>(inst.operands.at(2)),
                                         std::get<uint8_t>(inst.operands.at(3)),
                                         OpCode::XOR_8);
            break;
        case OpCode::XOR_16:
            error = trace_builder.op_xor(std::get<uint8_t>(inst.operands.at(0)),
                                         std::get<uint16_t>(inst.operands.at(1)),
                                         std::get<uint16_t>(inst.operands.at(2)),
                                         std::get<uint16_t>(inst.operands.at(3)),
                                         OpCode::XOR_16);
            break;
        case OpCode::NOT_8:
            error = trace_builder.op_not(std::get<uint8_t>(inst.operands.at(0)),
                                         std::get<uint8_t>(inst.operands.at(1)),
                                         std::get<uint8_t>(inst.operands.at(2)),
                                         OpCode::NOT_8);
            break;
        case OpCode::NOT_16:
            error = trace_builder.op_not(std::get<uint8_t>(inst.operands.at(0)),
                                         std::get<uint16_t>(inst.operands.at(1)),
                                         std::get<uint16_t>(inst.operands.at(2)),
                                         OpCode::NOT_16);
            break;
        case OpCode::SHL_8:
            error = trace_builder.op_shl(std::get<uint8_t>(inst.operands.at(0)),
                                         std::get<uint8_t>(inst.operands.at(1)),
                                         std::get<uint8_t>(inst.operands.at(2)),
                                         std::get<uint8_t>(inst.operands.at(3)),
                                         OpCode::SHL_8);
            break;
        case OpCode::SHL_16:
            error = trace_builder.op_shl(std::get<uint8_t>(inst.operands.at(0)),
                                         std::get<uint16_t>(inst.operands.at(1)),
                                         std::get<uint16_t>(inst.operands.at(2)),
                                         std::get<uint16_t>(inst.operands.at(3)),
                                         OpCode::SHL_16);
            break;
        case OpCode::SHR_8:
            error = trace_builder.op_shr(std::get<uint8_t>(inst.operands.at(0)),
                                         std::get<uint8_t>(inst.operands.at(1)),
                                         std::get<uint8_t>(inst.operands.at(2)),
                                         std::get<uint8_t>(inst.operands.at(3)),
                                         OpCode::SHR_8);
            break;
        case OpCode::SHR_16:
            error = trace_builder.op_shr(std::get<uint8_t>(inst.operands.at(0)),
                                         std::get<uint16_t>(inst.operands.at(1)),
                                         std::get<uint16_t>(inst.operands.at(2)),
                                         std::get<uint16_t>(inst.operands.at(3)),
                                         OpCode::SHR_16);
            break;

            // Compute - Type Conversions
        case OpCode::CAST_8:
            error = trace_builder.op_cast(std::get<uint8_t>(inst.operands.at(0)),
                                          std::get<uint8_t>(inst.operands.at(1)),
                                          std::get<uint8_t>(inst.operands.at(2)),
                                          std::get<AvmMemoryTag>(inst.operands.at(3)),
                                          OpCode::CAST_8);
            break;
        case OpCode::CAST_16:
            error = trace_builder.op_cast(std::get<uint8_t>(inst.operands.at(0)),
                                          std::get<uint16_t>(inst.operands.at(1)),
                                          std::get<uint16_t>(inst.operands.at(2)),
                                          std::get<AvmMemoryTag>(inst.operands.at(3)),
                                          OpCode::CAST_16);
            break;

            // Execution Environment
            // TODO(https://github.com/AztecProtocol/aztec-packages/issues/6284): support indirect for below
        case OpCode::GETENVVAR_16:
            error = trace_builder.op_get_env_var(std::get<uint8_t>(inst.operands.at(0)),
                                                 std::get<uint16_t>(inst.operands.at(1)),
                                                 std::get<uint8_t>(inst.operands.at(2)));
            break;

            // Execution Environment - Calldata
        case OpCode::CALLDATACOPY:
            error = trace_builder.op_calldata_copy(std::get<uint8_t>(inst.operands.at(0)),
                                                   std::get<uint16_t>(inst.operands.at(1)),
                                                   std::get<uint16_t>(inst.operands.at(2)),
                                                   std::get<uint16_t>(inst.operands.at(3)));
            break;

        case OpCode::RETURNDATASIZE:
            error = trace_builder.op_returndata_size(std::get<uint8_t>(inst.operands.at(0)),
                                                     std::get<uint16_t>(inst.operands.at(1)));
            break;

        case OpCode::RETURNDATACOPY:
            error = trace_builder.op_returndata_copy(std::get<uint8_t>(inst.operands.at(0)),
                                                     std::get<uint16_t>(inst.operands.at(1)),
                                                     std::get<uint16_t>(inst.operands.at(2)),
                                                     std::get<uint16_t>(inst.operands.at(3)));
            break;

            // Machine State - Internal Control Flow
        case OpCode::JUMP_32:
            error = trace_builder.op_jump(std::get<uint32_t>(inst.operands.at(0)));
            break;
        case OpCode::JUMPI_32:
            error = trace_builder.op_jumpi(std::get<uint8_t>(inst.operands.at(0)),
                                           std::get<uint16_t>(inst.operands.at(1)),
                                           std::get<uint32_t>(inst.operands.at(2)));
            break;
        case OpCode::INTERNALCALL:
            error = trace_builder.op_internal_call(std::get<uint32_t>(inst.operands.at(0)));
            break;
        case OpCode::INTERNALRETURN:
            error = trace_builder.op_internal_return();
            break;

            // Machine State - Memory
        case OpCode::SET_8: {
            error = trace_builder.op_set(std::get<uint8_t>(inst.operands.at(0)),
                                         std::get<uint8_t>(inst.operands.at(3)),
                                         std::get<uint8_t>(inst.operands.at(1)),
                                         std::get<AvmMemoryTag>(inst.operands.at(2)),
                                         OpCode::SET_8);
            break;
        }
        case OpCode::SET_16: {
            error = trace_builder.op_set(std::get<uint8_t>(inst.operands.at(0)),
                                         std::get<uint16_t>(inst.operands.at(3)),
                                         std::get<uint16_t>(inst.operands.at(1)),
                                         std::get<AvmMemoryTag>(inst.operands.at(2)),
                                         OpCode::SET_16);
            break;
        }
        case OpCode::SET_32: {
            error = trace_builder.op_set(std::get<uint8_t>(inst.operands.at(0)),
                                         std::get<uint32_t>(inst.operands.at(3)),
                                         std::get<uint16_t>(inst.operands.at(1)),
                                         std::get<AvmMemoryTag>(inst.operands.at(2)),
                                         OpCode::SET_32);
            break;
        }
        case OpCode::SET_64: {
            error = trace_builder.op_set(std::get<uint8_t>(inst.operands.at(0)),
                                         std::get<uint64_t>(inst.operands.at(3)),
                                         std::get<uint16_t>(inst.operands.at(1)),
                                         std::get<AvmMemoryTag>(inst.operands.at(2)),
                                         OpCode::SET_64);
            break;
        }
        case OpCode::SET_128: {
            error = trace_builder.op_set(std::get<uint8_t>(inst.operands.at(0)),
                                         uint256_t::from_uint128(std::get<uint128_t>(inst.operands.at(3))),
                                         std::get<uint16_t>(inst.operands.at(1)),
                                         std::get<AvmMemoryTag>(inst.operands.at(2)),
                                         OpCode::SET_128);
            break;
        }
        case OpCode::SET_FF: {
            error = trace_builder.op_set(std::get<uint8_t>(inst.operands.at(0)),
                                         std::get<FF>(inst.operands.at(3)),
                                         std::get<uint16_t>(inst.operands.at(1)),
                                         std::get<AvmMemoryTag>(inst.operands.at(2)),
                                         OpCode::SET_FF);
            break;
        }
        case OpCode::MOV_8:
            error = trace_builder.op_mov(std::get<uint8_t>(inst.operands.at(0)),
                                         std::get<uint8_t>(inst.operands.at(1)),
                                         std::get<uint8_t>(inst.operands.at(2)),
                                         OpCode::MOV_8);
            break;
        case OpCode::MOV_16:
            error = trace_builder.op_mov(std::get<uint8_t>(inst.operands.at(0)),
                                         std::get<uint16_t>(inst.operands.at(1)),
                                         std::get<uint16_t>(inst.operands.at(2)),
                                         OpCode::MOV_16);
            break;

            // World State
        case OpCode::SLOAD:
            error = trace_builder.op_sload(std::get<uint8_t>(inst.operands.at(0)),
                                           std::get<uint16_t>(inst.operands.at(1)),
                                           std::get<uint16_t>(inst.operands.at(2)));
            break;
        case OpCode::SSTORE:
            error = trace_builder.op_sstore(std::get<uint8_t>(inst.operands.at(0)),
                                            std::get<uint16_t>(inst.operands.at(1)),
                                            std::get<uint16_t>(inst.operands.at(2)));
            break;
        case OpCode::NOTEHASHEXISTS:
            error = trace_builder.op_note_hash_exists(std::get<uint8_t>(inst.operands.at(0)),
                                                      std::get<uint16_t>(inst.operands.at(1)),
                                                      std::get<uint16_t>(inst.operands.at(2)),
                                                      std::get<uint16_t>(inst.operands.at(3)));
            break;
        case OpCode::EMITNOTEHASH:
            error = trace_builder.op_emit_note_hash(std::get<uint8_t>(inst.operands.at(0)),
                                                    std::get<uint16_t>(inst.operands.at(1)));
            break;
        case OpCode::NULLIFIEREXISTS:
            error = trace_builder.op_nullifier_exists(std::get<uint8_t>(inst.operands.at(0)),
                                                      std::get<uint16_t>(inst.operands.at(1)),
                                                      std::get<uint16_t>(inst.operands.at(2)),
                                                      std::get<uint16_t>(inst.operands.at(3)));
            break;
        case OpCode::EMITNULLIFIER:
            error = trace_builder.op_emit_nullifier(std::get<uint8_t>(inst.operands.at(0)),
                                                    std::get<uint16_t>(inst.operands.at(1)));
            break;

        case OpCode::L1TOL2MSGEXISTS:
            error = trace_builder.op_l1_to_l2_msg_exists(std::get<uint8_t>(inst.operands.at(0)),
                                                         std::get<uint16_t>(inst.operands.at(1)),
                                                         std::get<uint16_t>(inst.operands.at(2)),
                                                         std::get<uint16_t>(inst.operands.at(3)));
            break;
        case OpCode::GETCONTRACTINSTANCE:
            error = trace_builder.op_get_contract_instance(std::get<uint8_t>(inst.operands.at(0)),
                                                           std::get<uint16_t>(inst.operands.at(1)),
                                                           std::get<uint16_t>(inst.operands.at(2)),
                                                           std::get<uint16_t>(inst.operands.at(3)),
                                                           std::get<uint8_t>(inst.operands.at(4)));
            break;

            // Accrued Substate
        case OpCode::EMITUNENCRYPTEDLOG:
            error = trace_builder.op_emit_unencrypted_log(std::get<uint8_t>(inst.operands.at(0)),
                                                          std::get<uint16_t>(inst.operands.at(1)),
                                                          std::get<uint16_t>(inst.operands.at(2)));
            break;
        case OpCode::SENDL2TOL1MSG:
            error = trace_builder.op_emit_l2_to_l1_msg(std::get<uint8_t>(inst.operands.at(0)),
                                                       std::get<uint16_t>(inst.operands.at(1)),
                                                       std::get<uint16_t>(inst.operands.at(2)));
            break;

            // Control Flow - Contract Calls
        case OpCode::CALL: {
            error = trace_builder.op_call(std::get<uint16_t>(inst.operands.at(0)),
                                          std::get<uint16_t>(inst.operands.at(1)),
                                          std::get<uint16_t>(inst.operands.at(2)),
                                          std::get<uint16_t>(inst.operands.at(3)),
                                          std::get<uint16_t>(inst.operands.at(4)),
                                          std::get<uint16_t>(inst.operands.at(5)));
            // We hack it in here the logic to change contract address that we are processing
            bytecode = trace_builder.get_bytecode(trace_builder.current_ext_call_ctx.contract_address,
                                                  check_bytecode_membership);
            debug_counter_stack.push(counter);
            counter = 0;
            break;
        }
        case OpCode::STATICCALL: {
            error = trace_builder.op_static_call(std::get<uint16_t>(inst.operands.at(0)),
                                                 std::get<uint16_t>(inst.operands.at(1)),
                                                 std::get<uint16_t>(inst.operands.at(2)),
                                                 std::get<uint16_t>(inst.operands.at(3)),
                                                 std::get<uint16_t>(inst.operands.at(4)),
                                                 std::get<uint16_t>(inst.operands.at(5)));
            // We hack it in here the logic to change contract address that we are processing
            bytecode = trace_builder.get_bytecode(trace_builder.current_ext_call_ctx.contract_address,
                                                  check_bytecode_membership);
            debug_counter_stack.push(counter);
            counter = 0;
            break;
        }
        case OpCode::RETURN: {
            auto ret = trace_builder.op_return(std::get<uint8_t>(inst.operands.at(0)),
                                               std::get<uint16_t>(inst.operands.at(1)),
                                               std::get<uint16_t>(inst.operands.at(2)));
            // We hack it in here the logic to change contract address that we are processing
            if (ret.is_top_level) {
                error = ret.error;
                returndata.insert(returndata.end(), ret.return_data.begin(), ret.return_data.end());

            } else {
                bytecode = trace_builder.get_bytecode(trace_builder.current_ext_call_ctx.contract_address,
                                                      check_bytecode_membership);
                counter = debug_counter_stack.top();
                debug_counter_stack.pop();
            }
            break;
        }
        case OpCode::REVERT_8: {
            info("HIT REVERT_8  ", "[PC=" + std::to_string(pc) + "] " + inst.to_string());
            auto ret = trace_builder.op_revert(std::get<uint8_t>(inst.operands.at(0)),
                                               std::get<uint8_t>(inst.operands.at(1)),
                                               std::get<uint8_t>(inst.operands.at(2)));
            if (ret.is_top_level) {
                error = ret.error;
                returndata.insert(returndata.end(), ret.return_data.begin(), ret.return_data.end());
            } else {
                // change to the current ext call ctx
                bytecode = trace_builder.get_bytecode(trace_builder.current_ext_call_ctx.contract_address,
                                                      check_bytecode_membership);
                counter = debug_counter_stack.top();
                debug_counter_stack.pop();
            }

            break;
        }
        case OpCode::REVERT_16: {
            info("HIT REVERT_16 ", "[PC=" + std::to_string(pc) + "] " + inst.to_string());
            auto ret = trace_builder.op_revert(std::get<uint8_t>(inst.operands.at(0)),
                                               std::get<uint16_t>(inst.operands.at(1)),
                                               std::get<uint16_t>(inst.operands.at(2)));
            if (ret.is_top_level) {
                error = ret.error;
                returndata.insert(returndata.end(), ret.return_data.begin(), ret.return_data.end());
            } else {
                // change to the current ext call ctx
                bytecode = trace_builder.get_bytecode(trace_builder.current_ext_call_ctx.contract_address,
                                                      check_bytecode_membership);
                counter = debug_counter_stack.top();
                debug_counter_stack.pop();
            }

            break;
        }

            // Misc
        case OpCode::DEBUGLOG:
            error = trace_builder.op_debug_log(std::get<uint8_t>(inst.operands.at(0)),
                                               std::get<uint16_t>(inst.operands.at(1)),
                                               std::get<uint16_t>(inst.operands.at(2)),
                                               std::get<uint16_t>(inst.operands.at(3)),
                                               std::get<uint16_t>(inst.operands.at(4)));
            break;

            // Gadgets
        case OpCode::POSEIDON2PERM:
            error = trace_builder.op_poseidon2_permutation(std::get<uint8_t>(inst.operands.at(0)),
                                                           std::get<uint16_t>(inst.operands.at(1)),
                                                           std::get<uint16_t>(inst.operands.at(2)));

            break;

        case OpCode::SHA256COMPRESSION:
            error = trace_builder.op_sha256_compression(std::get<uint8_t>(inst.operands.at(0)),
                                                        std::get<uint16_t>(inst.operands.at(1)),
                                                        std::get<uint16_t>(inst.operands.at(2)),
                                                        std::get<uint16_t>(inst.operands.at(3)));
            break;

        case OpCode::KECCAKF1600:
            error = trace_builder.op_keccakf1600(std::get<uint8_t>(inst.operands.at(0)),
                                                 std::get<uint16_t>(inst.operands.at(1)),
                                                 std::get<uint16_t>(inst.operands.at(2)));

            break;

        case OpCode::ECADD:
            error = trace_builder.op_ec_add(std::get<uint16_t>(inst.operands.at(0)),
                                            std::get<uint16_t>(inst.operands.at(1)),
                                            std::get<uint16_t>(inst.operands.at(2)),
                                            std::get<uint16_t>(inst.operands.at(3)),
                                            std::get<uint16_t>(inst.operands.at(4)),
                                            std::get<uint16_t>(inst.operands.at(5)),
                                            std::get<uint16_t>(inst.operands.at(6)),
                                            std::get<uint16_t>(inst.operands.at(7)));
            break;
        case OpCode::MSM:
            error = trace_builder.op_variable_msm(std::get<uint8_t>(inst.operands.at(0)),
                                                  std::get<uint16_t>(inst.operands.at(1)),
                                                  std::get<uint16_t>(inst.operands.at(2)),
                                                  std::get<uint16_t>(inst.operands.at(3)),
                                                  std::get<uint16_t>(inst.operands.at(4)));
            break;

            // Conversions
        case OpCode::TORADIXBE:
            error = trace_builder.op_to_radix_be(std::get<uint8_t>(inst.operands.at(0)),
                                                 std::get<uint16_t>(inst.operands.at(1)),
                                                 std::get<uint16_t>(inst.operands.at(2)),
                                                 std::get<uint16_t>(inst.operands.at(3)),
                                                 std::get<uint16_t>(inst.operands.at(4)),
                                                 std::get<uint8_t>(inst.operands.at(5)));
            break;

        default:
            throw_or_abort("Don't know how to execute opcode " + to_hex(inst.op_code) + " at pc " + std::to_string(pc) +
                           ".");
            break;
        }
    }
    if (!is_ok(error)) {
        auto const error_ic = counter - 1; // Need adjustement as counter increment occurs in loop body
        std::string reason_prefix = exceptionally_halted(error) ? "exceptional halt" : "REVERT opcode";
        info("AVM enqueued call halted due to ",
             reason_prefix,
             ". Error: ",
             to_name(error),
             " at PC: ",
             pc,
             " IC: ",
             error_ic);
    }
    return error;
}

} // namespace bb::avm_trace
