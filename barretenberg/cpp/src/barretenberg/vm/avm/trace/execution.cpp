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
#include "barretenberg/vm/avm/trace/trace.hpp"
#include "barretenberg/vm/aztec_constants.hpp"
#include "barretenberg/vm/constants.hpp"
#include "barretenberg/vm/stats.hpp"

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
namespace {

// The SRS needs to be able to accommodate the circuit subgroup size.
// Note: The *2 is due to how init_bn254_crs works, look there.
static_assert(Execution::SRS_SIZE >= AvmCircuitBuilder::CIRCUIT_SUBGROUP_SIZE * 2);

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

    bb::constexpr_for<0, std::tuple_size_v<AvmFlavor::MainRelations>, 1>([&]<size_t i>() {
        std::unordered_map<int, int> degree_distribution;
        using Relation = std::tuple_element_t<i, AvmFlavor::Relations>;
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
        bool column_is_nonzero[trace.front().SIZE];
        for (auto const& row : trace) {
            const auto row_vec = row.as_vector();
            for (size_t col = 0; col < row.SIZE; col++) {
                if (!row_vec[col].is_zero()) {
                    column_is_nonzero[col] = true;
                }
            }
        }
        return static_cast<size_t>(std::count(column_is_nonzero, column_is_nonzero + trace.front().SIZE, true));
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

// Needed for dependency injection in tests.
Execution::TraceBuilderConstructor Execution::trace_builder_constructor = [](VmPublicInputs public_inputs,
                                                                             ExecutionHints execution_hints,
                                                                             uint32_t side_effect_counter,
                                                                             std::vector<FF> calldata) {
    return AvmTraceBuilder(
        std::move(public_inputs), std::move(execution_hints), side_effect_counter, std::move(calldata));
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
 * @param bytecode A vector of bytes representing the bytecode to execute.
 * @param calldata expressed as a vector of finite field elements.
 * @throws runtime_error exception when the bytecode is invalid.
 * @return The verifier key and zk proof of the execution.
 */
std::tuple<AvmFlavor::VerificationKey, HonkProof> Execution::prove(std::vector<FF> const& calldata,
                                                                   std::vector<FF> const& public_inputs_vec,
                                                                   ExecutionHints const& execution_hints)
{
    if (public_inputs_vec.size() != PUBLIC_CIRCUIT_PUBLIC_INPUTS_LENGTH) {
        throw_or_abort("Public inputs vector is not of PUBLIC_CIRCUIT_PUBLIC_INPUTS_LENGTH");
    }

    std::vector<FF> returndata;
    std::vector<Row> trace =
        AVM_TRACK_TIME_V("prove/gen_trace", gen_trace(calldata, public_inputs_vec, returndata, execution_hints));
    if (!avm_dump_trace_path.empty()) {
        info("Dumping trace as CSV to: " + avm_dump_trace_path.string());
        dump_trace_as_csv(trace, avm_dump_trace_path);
    }
    auto circuit_builder = bb::AvmCircuitBuilder();
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

    auto composer = AVM_TRACK_TIME_V("prove/create_composer", AvmComposer());
    auto prover = AVM_TRACK_TIME_V("prove/create_prover", composer.create_prover(circuit_builder));
    auto verifier = AVM_TRACK_TIME_V("prove/create_verifier", composer.create_verifier(circuit_builder));
    // Reclaim memory. Ideally this would be done as soon as the polynomials are created, but the above flow requires
    // the trace both in creation of the prover and the verifier.
    circuit_builder.clear_trace();

    vinfo("------- PROVING EXECUTION -------");
    // Proof structure: public_inputs | calldata_size | calldata | returndata_size | returndata | raw proof
    HonkProof proof(public_inputs_vec);
    proof.emplace_back(calldata.size());
    proof.insert(proof.end(), calldata.begin(), calldata.end());
    proof.emplace_back(returndata.size());
    proof.insert(proof.end(), returndata.begin(), returndata.end());
    auto raw_proof = prover.construct_proof();
    proof.insert(proof.end(), raw_proof.begin(), raw_proof.end());
    return std::make_tuple(*verifier.key, proof);
}

bool Execution::verify(AvmFlavor::VerificationKey vk, HonkProof const& proof)
{
    AvmVerifier verifier(std::make_shared<AvmFlavor::VerificationKey>(vk));

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

    VmPublicInputs public_inputs = avm_trace::convert_public_inputs(public_inputs_vec);
    std::vector<std::vector<FF>> public_inputs_columns =
        copy_public_inputs_columns(public_inputs, calldata, returndata);
    return verifier.verify_proof(raw_proof, public_inputs_columns);
}

/**
 * @brief Generate the execution trace pertaining to the supplied instructions returns the return data.
 *
 * @param instructions A vector of the instructions to be executed.
 * @param calldata expressed as a vector of finite field elements.
 * @param public_inputs expressed as a vector of finite field elements.
 * @return The trace as a vector of Row.
 */
std::vector<Row> Execution::gen_trace(std::vector<FF> const& calldata,
                                      std::vector<FF> const& public_inputs_vec,
                                      std::vector<FF>& returndata,
                                      ExecutionHints const& execution_hints)

{

    vinfo("------- GENERATING TRACE -------");
    // TODO(https://github.com/AztecProtocol/aztec-packages/issues/6718): construction of the public input columns
    // should be done in the kernel - this is stubbed and underconstrained
    VmPublicInputs public_inputs = avm_trace::convert_public_inputs(public_inputs_vec);
    uint32_t start_side_effect_counter =
        !public_inputs_vec.empty() ? static_cast<uint32_t>(public_inputs_vec[PCPI_START_SIDE_EFFECT_COUNTER_OFFSET])
                                   : 0;

    // This address is the top-level contract address
    vinfo("Length of all contract bytecode: ", execution_hints.all_contract_bytecode.size());

    FF contract_address = std::get<0>(public_inputs)[ADDRESS_SELECTOR];
    vinfo("Top level contract address: ", contract_address);
    // We use it to extract the bytecode we need to execute
    std::vector<uint8_t> bytecode =
        std::find_if(execution_hints.all_contract_bytecode.begin(),
                     execution_hints.all_contract_bytecode.end(),
                     [&](auto& contract) { return contract.contract_instance.address == contract_address; })
            ->bytecode;

    std::vector<Instruction> instructions = Deserialization::parse(bytecode);
    vinfo("Deserialized " + std::to_string(instructions.size()) + " instructions");
    AvmTraceBuilder trace_builder =
        Execution::trace_builder_constructor(public_inputs, execution_hints, start_side_effect_counter, calldata);

    // Copied version of pc maintained in trace builder. The value of pc is evolving based
    // on opcode logic and therefore is not maintained here. However, the next opcode in the execution
    // is determined by this value which require read access to the code below.
    uint32_t pc = 0;
    while ((pc = trace_builder.getPc()) < instructions.size()) {
        auto inst = instructions.at(pc);
        debug("[@" + std::to_string(pc) + "] " + inst.to_string());

        switch (inst.op_code) {
            // Compute
            // Compute - Arithmetic
        case OpCode::ADD_8:
            trace_builder.op_add(std::get<uint8_t>(inst.operands.at(0)),
                                 std::get<uint8_t>(inst.operands.at(2)),
                                 std::get<uint8_t>(inst.operands.at(3)),
                                 std::get<uint8_t>(inst.operands.at(4)),
                                 std::get<AvmMemoryTag>(inst.operands.at(1)));
            break;
        case OpCode::ADD_16:
            trace_builder.op_add(std::get<uint8_t>(inst.operands.at(0)),
                                 std::get<uint16_t>(inst.operands.at(2)),
                                 std::get<uint16_t>(inst.operands.at(3)),
                                 std::get<uint16_t>(inst.operands.at(4)),
                                 std::get<AvmMemoryTag>(inst.operands.at(1)));
            break;
        case OpCode::SUB_8:
            trace_builder.op_sub(std::get<uint8_t>(inst.operands.at(0)),
                                 std::get<uint8_t>(inst.operands.at(2)),
                                 std::get<uint8_t>(inst.operands.at(3)),
                                 std::get<uint8_t>(inst.operands.at(4)),
                                 std::get<AvmMemoryTag>(inst.operands.at(1)));
            break;
        case OpCode::SUB_16:
            trace_builder.op_sub(std::get<uint8_t>(inst.operands.at(0)),
                                 std::get<uint16_t>(inst.operands.at(2)),
                                 std::get<uint16_t>(inst.operands.at(3)),
                                 std::get<uint16_t>(inst.operands.at(4)),
                                 std::get<AvmMemoryTag>(inst.operands.at(1)));
            break;
        case OpCode::MUL_8:
            trace_builder.op_mul(std::get<uint8_t>(inst.operands.at(0)),
                                 std::get<uint8_t>(inst.operands.at(2)),
                                 std::get<uint8_t>(inst.operands.at(3)),
                                 std::get<uint8_t>(inst.operands.at(4)),
                                 std::get<AvmMemoryTag>(inst.operands.at(1)));
            break;
        case OpCode::MUL_16:
            trace_builder.op_mul(std::get<uint8_t>(inst.operands.at(0)),
                                 std::get<uint16_t>(inst.operands.at(2)),
                                 std::get<uint16_t>(inst.operands.at(3)),
                                 std::get<uint16_t>(inst.operands.at(4)),
                                 std::get<AvmMemoryTag>(inst.operands.at(1)));
            break;
        case OpCode::DIV_8:
            trace_builder.op_div(std::get<uint8_t>(inst.operands.at(0)),
                                 std::get<uint8_t>(inst.operands.at(2)),
                                 std::get<uint8_t>(inst.operands.at(3)),
                                 std::get<uint8_t>(inst.operands.at(4)),
                                 std::get<AvmMemoryTag>(inst.operands.at(1)));
            break;
        case OpCode::DIV_16:
            trace_builder.op_div(std::get<uint8_t>(inst.operands.at(0)),
                                 std::get<uint16_t>(inst.operands.at(2)),
                                 std::get<uint16_t>(inst.operands.at(3)),
                                 std::get<uint16_t>(inst.operands.at(4)),
                                 std::get<AvmMemoryTag>(inst.operands.at(1)));
            break;
        case OpCode::FDIV_8:
            trace_builder.op_fdiv(std::get<uint8_t>(inst.operands.at(0)),
                                  std::get<uint8_t>(inst.operands.at(2)),
                                  std::get<uint8_t>(inst.operands.at(3)),
                                  std::get<uint8_t>(inst.operands.at(4)),
                                  std::get<AvmMemoryTag>(inst.operands.at(1)));
            break;
        case OpCode::FDIV_16:
            trace_builder.op_fdiv(std::get<uint8_t>(inst.operands.at(0)),
                                  std::get<uint16_t>(inst.operands.at(2)),
                                  std::get<uint16_t>(inst.operands.at(3)),
                                  std::get<uint16_t>(inst.operands.at(4)),
                                  std::get<AvmMemoryTag>(inst.operands.at(1)));
            break;
        case OpCode::EQ_8:
            trace_builder.op_eq(std::get<uint8_t>(inst.operands.at(0)),
                                std::get<uint8_t>(inst.operands.at(2)),
                                std::get<uint8_t>(inst.operands.at(3)),
                                std::get<uint8_t>(inst.operands.at(4)),
                                std::get<AvmMemoryTag>(inst.operands.at(1)));
            break;
        case OpCode::EQ_16:
            trace_builder.op_eq(std::get<uint8_t>(inst.operands.at(0)),
                                std::get<uint16_t>(inst.operands.at(2)),
                                std::get<uint16_t>(inst.operands.at(3)),
                                std::get<uint16_t>(inst.operands.at(4)),
                                std::get<AvmMemoryTag>(inst.operands.at(1)));
            break;
        case OpCode::LT_8:
            trace_builder.op_lt(std::get<uint8_t>(inst.operands.at(0)),
                                std::get<uint8_t>(inst.operands.at(2)),
                                std::get<uint8_t>(inst.operands.at(3)),
                                std::get<uint8_t>(inst.operands.at(4)),
                                std::get<AvmMemoryTag>(inst.operands.at(1)));
            break;
        case OpCode::LT_16:
            trace_builder.op_lt(std::get<uint8_t>(inst.operands.at(0)),
                                std::get<uint16_t>(inst.operands.at(2)),
                                std::get<uint16_t>(inst.operands.at(3)),
                                std::get<uint16_t>(inst.operands.at(4)),
                                std::get<AvmMemoryTag>(inst.operands.at(1)));
            break;
        case OpCode::LTE_8:
            trace_builder.op_lte(std::get<uint8_t>(inst.operands.at(0)),
                                 std::get<uint8_t>(inst.operands.at(2)),
                                 std::get<uint8_t>(inst.operands.at(3)),
                                 std::get<uint8_t>(inst.operands.at(4)),
                                 std::get<AvmMemoryTag>(inst.operands.at(1)));
            break;
        case OpCode::LTE_16:
            trace_builder.op_lte(std::get<uint8_t>(inst.operands.at(0)),
                                 std::get<uint16_t>(inst.operands.at(2)),
                                 std::get<uint16_t>(inst.operands.at(3)),
                                 std::get<uint16_t>(inst.operands.at(4)),
                                 std::get<AvmMemoryTag>(inst.operands.at(1)));
            break;
        case OpCode::AND_8:
            trace_builder.op_and(std::get<uint8_t>(inst.operands.at(0)),
                                 std::get<uint8_t>(inst.operands.at(2)),
                                 std::get<uint8_t>(inst.operands.at(3)),
                                 std::get<uint8_t>(inst.operands.at(4)),
                                 std::get<AvmMemoryTag>(inst.operands.at(1)));
            break;
        case OpCode::AND_16:
            trace_builder.op_and(std::get<uint8_t>(inst.operands.at(0)),
                                 std::get<uint16_t>(inst.operands.at(2)),
                                 std::get<uint16_t>(inst.operands.at(3)),
                                 std::get<uint16_t>(inst.operands.at(4)),
                                 std::get<AvmMemoryTag>(inst.operands.at(1)));
            break;
        case OpCode::OR_8:
            trace_builder.op_or(std::get<uint8_t>(inst.operands.at(0)),
                                std::get<uint8_t>(inst.operands.at(2)),
                                std::get<uint8_t>(inst.operands.at(3)),
                                std::get<uint8_t>(inst.operands.at(4)),
                                std::get<AvmMemoryTag>(inst.operands.at(1)));
            break;
        case OpCode::OR_16:
            trace_builder.op_or(std::get<uint8_t>(inst.operands.at(0)),
                                std::get<uint16_t>(inst.operands.at(2)),
                                std::get<uint16_t>(inst.operands.at(3)),
                                std::get<uint16_t>(inst.operands.at(4)),
                                std::get<AvmMemoryTag>(inst.operands.at(1)));
            break;
        case OpCode::XOR_8:
            trace_builder.op_xor(std::get<uint8_t>(inst.operands.at(0)),
                                 std::get<uint8_t>(inst.operands.at(2)),
                                 std::get<uint8_t>(inst.operands.at(3)),
                                 std::get<uint8_t>(inst.operands.at(4)),
                                 std::get<AvmMemoryTag>(inst.operands.at(1)));
            break;
        case OpCode::XOR_16:
            trace_builder.op_xor(std::get<uint8_t>(inst.operands.at(0)),
                                 std::get<uint16_t>(inst.operands.at(2)),
                                 std::get<uint16_t>(inst.operands.at(3)),
                                 std::get<uint16_t>(inst.operands.at(4)),
                                 std::get<AvmMemoryTag>(inst.operands.at(1)));
            break;
        case OpCode::NOT_8:
            trace_builder.op_not(std::get<uint8_t>(inst.operands.at(0)),
                                 std::get<uint8_t>(inst.operands.at(1)),
                                 std::get<uint8_t>(inst.operands.at(2)));
            break;
        case OpCode::NOT_16:
            trace_builder.op_not(std::get<uint8_t>(inst.operands.at(0)),
                                 std::get<uint16_t>(inst.operands.at(1)),
                                 std::get<uint16_t>(inst.operands.at(2)));
            break;
        case OpCode::SHL_8:
            trace_builder.op_shl(std::get<uint8_t>(inst.operands.at(0)),
                                 std::get<uint8_t>(inst.operands.at(2)),
                                 std::get<uint8_t>(inst.operands.at(3)),
                                 std::get<uint8_t>(inst.operands.at(4)),
                                 std::get<AvmMemoryTag>(inst.operands.at(1)));
            break;
        case OpCode::SHL_16:
            trace_builder.op_shl(std::get<uint8_t>(inst.operands.at(0)),
                                 std::get<uint16_t>(inst.operands.at(2)),
                                 std::get<uint16_t>(inst.operands.at(3)),
                                 std::get<uint16_t>(inst.operands.at(4)),
                                 std::get<AvmMemoryTag>(inst.operands.at(1)));
            break;
        case OpCode::SHR_8:
            trace_builder.op_shr(std::get<uint8_t>(inst.operands.at(0)),
                                 std::get<uint8_t>(inst.operands.at(2)),
                                 std::get<uint8_t>(inst.operands.at(3)),
                                 std::get<uint8_t>(inst.operands.at(4)),
                                 std::get<AvmMemoryTag>(inst.operands.at(1)));
            break;
        case OpCode::SHR_16:
            trace_builder.op_shr(std::get<uint8_t>(inst.operands.at(0)),
                                 std::get<uint16_t>(inst.operands.at(2)),
                                 std::get<uint16_t>(inst.operands.at(3)),
                                 std::get<uint16_t>(inst.operands.at(4)),
                                 std::get<AvmMemoryTag>(inst.operands.at(1)));
            break;

            // Compute - Type Conversions
        case OpCode::CAST_8:
            trace_builder.op_cast(std::get<uint8_t>(inst.operands.at(0)),
                                  std::get<uint8_t>(inst.operands.at(2)),
                                  std::get<uint8_t>(inst.operands.at(3)),
                                  std::get<AvmMemoryTag>(inst.operands.at(1)));
            break;
        case OpCode::CAST_16:
            trace_builder.op_cast(std::get<uint8_t>(inst.operands.at(0)),
                                  std::get<uint16_t>(inst.operands.at(2)),
                                  std::get<uint16_t>(inst.operands.at(3)),
                                  std::get<AvmMemoryTag>(inst.operands.at(1)));
            break;

            // Execution Environment
            // TODO(https://github.com/AztecProtocol/aztec-packages/issues/6284): support indirect for below
        case OpCode::GETENVVAR_16:
            trace_builder.op_get_env_var(std::get<uint8_t>(inst.operands.at(0)),
                                         std::get<uint8_t>(inst.operands.at(1)),
                                         std::get<uint16_t>(inst.operands.at(2)));
            break;

            // Execution Environment - Calldata
        case OpCode::CALLDATACOPY:
            trace_builder.op_calldata_copy(std::get<uint8_t>(inst.operands.at(0)),
                                           std::get<uint32_t>(inst.operands.at(1)),
                                           std::get<uint32_t>(inst.operands.at(2)),
                                           std::get<uint32_t>(inst.operands.at(3)));
            break;

            // Machine State - Internal Control Flow
        case OpCode::JUMP_16:
            trace_builder.op_jump(std::get<uint16_t>(inst.operands.at(0)));
            break;
        case OpCode::JUMPI_16:
            trace_builder.op_jumpi(std::get<uint8_t>(inst.operands.at(0)),
                                   std::get<uint16_t>(inst.operands.at(1)),
                                   std::get<uint16_t>(inst.operands.at(2)));
            break;
        case OpCode::INTERNALCALL:
            trace_builder.op_internal_call(std::get<uint32_t>(inst.operands.at(0)));
            break;
        case OpCode::INTERNALRETURN:
            trace_builder.op_internal_return();
            break;

            // Machine State - Memory
        case OpCode::SET_8: {
            trace_builder.op_set(std::get<uint8_t>(inst.operands.at(0)),
                                 std::get<uint8_t>(inst.operands.at(2)),
                                 std::get<uint8_t>(inst.operands.at(3)),
                                 std::get<AvmMemoryTag>(inst.operands.at(1)));
            break;
        }
        case OpCode::SET_16: {
            trace_builder.op_set(std::get<uint8_t>(inst.operands.at(0)),
                                 std::get<uint16_t>(inst.operands.at(2)),
                                 std::get<uint16_t>(inst.operands.at(3)),
                                 std::get<AvmMemoryTag>(inst.operands.at(1)));
            break;
        }
        case OpCode::SET_32: {
            trace_builder.op_set(std::get<uint8_t>(inst.operands.at(0)),
                                 std::get<uint32_t>(inst.operands.at(2)),
                                 std::get<uint16_t>(inst.operands.at(3)),
                                 std::get<AvmMemoryTag>(inst.operands.at(1)));
            break;
        }
        case OpCode::SET_64: {
            trace_builder.op_set(std::get<uint8_t>(inst.operands.at(0)),
                                 std::get<uint64_t>(inst.operands.at(2)),
                                 std::get<uint16_t>(inst.operands.at(3)),
                                 std::get<AvmMemoryTag>(inst.operands.at(1)));
            break;
        }
        case OpCode::SET_128: {
            trace_builder.op_set(std::get<uint8_t>(inst.operands.at(0)),
                                 uint256_t::from_uint128(std::get<uint128_t>(inst.operands.at(2))),
                                 std::get<uint16_t>(inst.operands.at(3)),
                                 std::get<AvmMemoryTag>(inst.operands.at(1)));
            break;
        }
        case OpCode::SET_FF: {
            trace_builder.op_set(std::get<uint8_t>(inst.operands.at(0)),
                                 std::get<FF>(inst.operands.at(2)),
                                 std::get<uint16_t>(inst.operands.at(3)),
                                 std::get<AvmMemoryTag>(inst.operands.at(1)));
            break;
        }
        case OpCode::MOV_8:
            trace_builder.op_mov(std::get<uint8_t>(inst.operands.at(0)),
                                 std::get<uint8_t>(inst.operands.at(1)),
                                 std::get<uint8_t>(inst.operands.at(2)));
            break;
        case OpCode::MOV_16:
            trace_builder.op_mov(std::get<uint8_t>(inst.operands.at(0)),
                                 std::get<uint16_t>(inst.operands.at(1)),
                                 std::get<uint16_t>(inst.operands.at(2)));
            break;
        case OpCode::CMOV:
            trace_builder.op_cmov(std::get<uint8_t>(inst.operands.at(0)),
                                  std::get<uint32_t>(inst.operands.at(1)),
                                  std::get<uint32_t>(inst.operands.at(2)),
                                  std::get<uint32_t>(inst.operands.at(3)),
                                  std::get<uint32_t>(inst.operands.at(4)));
            break;

            // World State
        case OpCode::SLOAD:
            trace_builder.op_sload(std::get<uint8_t>(inst.operands.at(0)),
                                   std::get<uint32_t>(inst.operands.at(1)),
                                   1,
                                   std::get<uint32_t>(inst.operands.at(2)));
            break;
        case OpCode::SSTORE:
            trace_builder.op_sstore(std::get<uint8_t>(inst.operands.at(0)),
                                    std::get<uint32_t>(inst.operands.at(1)),
                                    1,
                                    std::get<uint32_t>(inst.operands.at(2)));
            break;
        case OpCode::NOTEHASHEXISTS:
            trace_builder.op_note_hash_exists(std::get<uint8_t>(inst.operands.at(0)),
                                              std::get<uint32_t>(inst.operands.at(1)),
                                              std::get<uint32_t>(inst.operands.at(2)),
                                              std::get<uint32_t>(inst.operands.at(3)));
            break;
        case OpCode::EMITNOTEHASH:
            trace_builder.op_emit_note_hash(std::get<uint8_t>(inst.operands.at(0)),
                                            std::get<uint32_t>(inst.operands.at(1)));
            break;
        case OpCode::NULLIFIEREXISTS:
            trace_builder.op_nullifier_exists(std::get<uint8_t>(inst.operands.at(0)),
                                              std::get<uint32_t>(inst.operands.at(1)),
                                              // std::get<uint32_t>(inst.operands.at(2))
                                              /**TODO: Address offset for siloing */
                                              std::get<uint32_t>(inst.operands.at(3)));
            break;
        case OpCode::EMITNULLIFIER:
            trace_builder.op_emit_nullifier(std::get<uint8_t>(inst.operands.at(0)),
                                            std::get<uint32_t>(inst.operands.at(1)));
            break;

        case OpCode::L1TOL2MSGEXISTS:
            trace_builder.op_l1_to_l2_msg_exists(std::get<uint8_t>(inst.operands.at(0)),
                                                 std::get<uint32_t>(inst.operands.at(1)),
                                                 std::get<uint32_t>(inst.operands.at(2)),
                                                 std::get<uint32_t>(inst.operands.at(3)));
            break;
        case OpCode::GETCONTRACTINSTANCE:
            trace_builder.op_get_contract_instance(std::get<uint8_t>(inst.operands.at(0)),
                                                   std::get<uint32_t>(inst.operands.at(1)),
                                                   std::get<uint32_t>(inst.operands.at(2)));
            break;

            // Accrued Substate
        case OpCode::EMITUNENCRYPTEDLOG:
            trace_builder.op_emit_unencrypted_log(std::get<uint8_t>(inst.operands.at(0)),
                                                  std::get<uint32_t>(inst.operands.at(1)),
                                                  std::get<uint32_t>(inst.operands.at(2)));
            break;
        case OpCode::SENDL2TOL1MSG:
            trace_builder.op_emit_l2_to_l1_msg(std::get<uint8_t>(inst.operands.at(0)),
                                               std::get<uint32_t>(inst.operands.at(1)),
                                               std::get<uint32_t>(inst.operands.at(2)));
            break;

            // Control Flow - Contract Calls
        case OpCode::CALL:
            trace_builder.op_call(std::get<uint8_t>(inst.operands.at(0)),
                                  std::get<uint32_t>(inst.operands.at(1)),
                                  std::get<uint32_t>(inst.operands.at(2)),
                                  std::get<uint32_t>(inst.operands.at(3)),
                                  std::get<uint32_t>(inst.operands.at(4)),
                                  std::get<uint32_t>(inst.operands.at(5)),
                                  std::get<uint32_t>(inst.operands.at(6)),
                                  std::get<uint32_t>(inst.operands.at(7)),
                                  std::get<uint32_t>(inst.operands.at(8)));
            break;
        case OpCode::STATICCALL:
            trace_builder.op_static_call(std::get<uint8_t>(inst.operands.at(0)),
                                         std::get<uint32_t>(inst.operands.at(1)),
                                         std::get<uint32_t>(inst.operands.at(2)),
                                         std::get<uint32_t>(inst.operands.at(3)),
                                         std::get<uint32_t>(inst.operands.at(4)),
                                         std::get<uint32_t>(inst.operands.at(5)),
                                         std::get<uint32_t>(inst.operands.at(6)),
                                         std::get<uint32_t>(inst.operands.at(7)),
                                         std::get<uint32_t>(inst.operands.at(8)));
            break;
        case OpCode::RETURN: {
            auto ret = trace_builder.op_return(std::get<uint8_t>(inst.operands.at(0)),
                                               std::get<uint32_t>(inst.operands.at(1)),
                                               std::get<uint32_t>(inst.operands.at(2)));
            returndata.insert(returndata.end(), ret.begin(), ret.end());

            break;
        }
        case OpCode::REVERT_8: {
            auto ret = trace_builder.op_revert(std::get<uint8_t>(inst.operands.at(0)),
                                               std::get<uint8_t>(inst.operands.at(1)),
                                               std::get<uint8_t>(inst.operands.at(2)));
            returndata.insert(returndata.end(), ret.begin(), ret.end());

            break;
        }
        case OpCode::REVERT_16: {
            auto ret = trace_builder.op_revert(std::get<uint8_t>(inst.operands.at(0)),
                                               std::get<uint16_t>(inst.operands.at(1)),
                                               std::get<uint16_t>(inst.operands.at(2)));
            returndata.insert(returndata.end(), ret.begin(), ret.end());

            break;
        }

            // Misc
        case OpCode::DEBUGLOG:
            // We want a noop, but we need to execute something that both advances the PC,
            // and adds a valid row to the trace.
            trace_builder.op_jump(pc + 1);
            break;

            // Gadgets
        case OpCode::KECCAK:
            trace_builder.op_keccak(std::get<uint8_t>(inst.operands.at(0)),
                                    std::get<uint32_t>(inst.operands.at(1)),
                                    std::get<uint32_t>(inst.operands.at(2)),
                                    std::get<uint32_t>(inst.operands.at(3)));

            break;
        case OpCode::POSEIDON2:
            trace_builder.op_poseidon2_permutation(std::get<uint8_t>(inst.operands.at(0)),
                                                   std::get<uint32_t>(inst.operands.at(1)),
                                                   std::get<uint32_t>(inst.operands.at(2)));

            break;
        case OpCode::PEDERSEN:
            trace_builder.op_pedersen_hash(std::get<uint8_t>(inst.operands.at(0)),
                                           std::get<uint32_t>(inst.operands.at(1)),
                                           std::get<uint32_t>(inst.operands.at(2)),
                                           std::get<uint32_t>(inst.operands.at(3)),
                                           std::get<uint32_t>(inst.operands.at(4)));
            break;
        case OpCode::ECADD:
            trace_builder.op_ec_add(std::get<uint8_t>(inst.operands.at(0)),
                                    std::get<uint32_t>(inst.operands.at(1)),
                                    std::get<uint32_t>(inst.operands.at(2)),
                                    std::get<uint32_t>(inst.operands.at(3)),
                                    std::get<uint32_t>(inst.operands.at(4)),
                                    std::get<uint32_t>(inst.operands.at(5)),
                                    std::get<uint32_t>(inst.operands.at(6)),
                                    std::get<uint32_t>(inst.operands.at(7)));
            break;
        case OpCode::MSM:
            trace_builder.op_variable_msm(std::get<uint8_t>(inst.operands.at(0)),
                                          std::get<uint32_t>(inst.operands.at(1)),
                                          std::get<uint32_t>(inst.operands.at(2)),
                                          std::get<uint32_t>(inst.operands.at(3)),
                                          std::get<uint32_t>(inst.operands.at(4)));
            break;

            // Conversions
        case OpCode::TORADIXLE:
            trace_builder.op_to_radix_le(std::get<uint8_t>(inst.operands.at(0)),
                                         std::get<uint32_t>(inst.operands.at(1)),
                                         std::get<uint32_t>(inst.operands.at(2)),
                                         std::get<uint32_t>(inst.operands.at(3)),
                                         std::get<uint32_t>(inst.operands.at(4)),
                                         std::get<uint8_t>(inst.operands.at(5)));
            break;

        case OpCode::SHA256COMPRESSION:
            trace_builder.op_sha256_compression(std::get<uint8_t>(inst.operands.at(0)),
                                                std::get<uint32_t>(inst.operands.at(1)),
                                                std::get<uint32_t>(inst.operands.at(2)),
                                                std::get<uint32_t>(inst.operands.at(3)),
                                                std::get<uint32_t>(inst.operands.at(4)),
                                                std::get<uint32_t>(inst.operands.at(5)));
            break;

        case OpCode::KECCAKF1600:
            trace_builder.op_keccakf1600(std::get<uint8_t>(inst.operands.at(0)),
                                         std::get<uint32_t>(inst.operands.at(1)),
                                         std::get<uint32_t>(inst.operands.at(2)),
                                         std::get<uint32_t>(inst.operands.at(3)));

            break;
        case OpCode::PEDERSENCOMMITMENT:
            trace_builder.op_pedersen_commit(std::get<uint8_t>(inst.operands.at(0)),
                                             std::get<uint32_t>(inst.operands.at(1)),
                                             std::get<uint32_t>(inst.operands.at(2)),
                                             std::get<uint32_t>(inst.operands.at(3)),
                                             std::get<uint32_t>(inst.operands.at(4)));

            break;
        default:
            throw_or_abort("Don't know how to execute opcode " + to_hex(inst.op_code) + " at pc " + std::to_string(pc) +
                           ".");
            break;
        }
    }

    auto trace = trace_builder.finalize();

    show_trace_info(trace);
    return trace;
}

} // namespace bb::avm_trace
