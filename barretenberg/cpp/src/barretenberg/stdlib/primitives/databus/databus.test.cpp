
#include <gtest/gtest.h>

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "databus.hpp"

using namespace bb;

using Builder = MegaCircuitBuilder;
using field_ct = stdlib::field_t<Builder>;
using witness_ct = stdlib::witness_t<Builder>;
using databus_ct = stdlib::databus<Builder>;

namespace {
auto& engine = bb::numeric::get_debug_randomness();
}

/**
 * @brief An expository test demonstrating the functionality of the databus in a small but representative use case
 *
 */
TEST(Databus, CallDataAndReturnData)
{
    Builder builder;
    databus_ct databus;

    // The databus is advantageous in situations where we want to pass large amounts of public inputs between circuits
    // in a chain (like private function execution in Aztec) but where we only need to use a small subset of those
    // values in any given circuit. As an example of this utility, consider the case where the output (return data) is
    // defined by simply taking the last two elements of the input (calldata) and summing them together. We can use the
    // databus mechanism to establish that the return data was indeed formed in this way.

    // Define some bus data that conform to the pattern described above
    std::array<fr, 4> raw_calldata_values = { 4, 5, 6, 7 };
    std::array<fr, 3> raw_return_data_values = { 4, 5, 13 }; // 13 = 6 + 7

    // Populate the calldata in the databus
    std::vector<field_ct> calldata_values;
    for (auto& value : raw_calldata_values) {
        calldata_values.emplace_back(witness_ct(&builder, value));
    }
    databus.kernel_calldata.set_values(calldata_values);

    // Populate the return data in the databus
    std::vector<field_ct> return_data_values;
    for (auto& value : raw_return_data_values) {
        return_data_values.emplace_back(witness_ct(&builder, value));
    }
    databus.return_data.set_values(return_data_values);

    // Establish that the first two outputs are simply copied over from the inputs. Each 'copy' requires two read gates.
    field_ct idx_0(witness_ct(&builder, 0));
    field_ct idx_1(witness_ct(&builder, 1));
    databus.kernel_calldata[idx_0].assert_equal(databus.return_data[idx_0]);
    databus.kernel_calldata[idx_1].assert_equal(databus.return_data[idx_1]);

    // Get the last two entries in calldata and compute their sum
    field_ct idx_2(witness_ct(&builder, 2));
    field_ct idx_3(witness_ct(&builder, 3));
    // This line creates an arithmetic gate and two calldata read gates (via operator[]).
    field_ct sum = databus.kernel_calldata[idx_2] + databus.kernel_calldata[idx_3];

    // Read the last index of the return data. (Creates a return data read gate via operator[]).
    field_ct idx(witness_ct(&builder, 2));
    field_ct read_result = databus.return_data[idx];

    // By construction, the last return data value is equal to the sum of the last two calldata values
    EXPECT_EQ(sum.get_value(), read_result.get_value());

    // Asserting that 'sum' is equal to the read result completes the process of establishing that the corresponding
    // return data entry was formed correctly; 'sum' is equal to the read result (enforced via copy constraint) and the
    // read result is connected to the value in the databus return data column via the read gate. 'sum' is connected to
    // the calldata values via an arithmetic gate and the two calldata read gates.
    sum.assert_equal(read_result);

    EXPECT_TRUE(CircuitChecker::check(builder));
}

/**
 * @brief An expository test demonstrating the functionality of the databus in a small use case when the entries are
 * constant witnesses
 */
TEST(Databus, ConstantEntryAccess)
{

    Builder builder;
    databus_ct databus;
    fr value_0 = 13;
    fr value_1 = 12;
    auto constant_0 = witness_ct::create_constant_witness(&builder, value_0);
    auto constant_1 = witness_ct::create_constant_witness(&builder, value_1);
    databus.return_data.set_values({ constant_0, constant_1 });
    field_ct idx_0(witness_ct(&builder, 0));
    field_ct idx_1(witness_ct(&builder, 1));

    field_ct read_result_0 = databus.return_data[idx_0];
    field_ct read_result_1 = databus.return_data[idx_1];

    EXPECT_EQ(value_0, read_result_0.get_value());
    EXPECT_EQ(value_1, read_result_1.get_value());
    EXPECT_TRUE(CircuitChecker::check(builder));
}

/**
 * @brief An expository test demonstrating the functionality of the databus in a small use case when the entries of the
 * bus_vector are not normalized
 */
TEST(Databus, UnnormalizedEntryAccess)
{

    Builder builder;
    databus_ct databus;
    std::array<fr, 3> raw_calldata_entries = { 3, 2, 1 };
    std::array<fr, 3> raw_returndata_entries = { 3, 2, 1 };
    std::vector<field_ct> calldata_entries;
    for (fr entry : raw_calldata_entries) {
        calldata_entries.emplace_back(witness_ct(&builder, entry));
    }
    std::vector<field_ct> returndata_entries;
    for (fr entry : raw_returndata_entries) {
        field_ct entry_witness = witness_ct(&builder, entry);
        // add the value to itself to make it unnormalized (the multiplicative constant will be 2)
        returndata_entries.emplace_back(entry_witness + entry_witness);
    }
    databus.kernel_calldata.set_values(calldata_entries);
    databus.return_data.set_values(returndata_entries);
    field_ct idx_0 = witness_ct(&builder, 0);
    field_ct idx_1 = witness_ct(&builder, 1);
    field_ct idx_2 = witness_ct(&builder, 2);
    databus.return_data[idx_0].assert_equal(databus.kernel_calldata[idx_0] + databus.kernel_calldata[idx_0]);
    databus.return_data[idx_1].assert_equal(databus.kernel_calldata[idx_1] + databus.kernel_calldata[idx_1]);
    databus.return_data[idx_2].assert_equal(databus.kernel_calldata[idx_2] + databus.kernel_calldata[idx_2]);
    EXPECT_TRUE(CircuitChecker::check(builder));
}

/**
 * @brief An expository test demonstrating the functionality of the databus in a small use case where the indices are
 * constant and/or unnormalized
 */
TEST(Databus, ConstantAndUnnormalizedIndices)
{
    Builder builder;
    databus_ct databus;
    std::array<fr, 3> raw_calldata_values = { 54, 32, 30 };
    std::array<fr, 3> raw_returndata_values = { 54, 32, 116 };
    // Populate the calldata in the databus
    std::vector<field_ct> calldata_values;
    for (auto& value : raw_calldata_values) {
        calldata_values.emplace_back(witness_ct(&builder, value));
    }
    databus.kernel_calldata.set_values(calldata_values);

    // Populate the return data in the databus
    std::vector<field_ct> returndata_values;
    for (auto& value : raw_returndata_values) {
        returndata_values.emplace_back(witness_ct(&builder, value));
    }
    databus.return_data.set_values(returndata_values);

    // constant first index
    field_ct idx_0(witness_ct::create_constant_witness(&builder, 0));
    field_ct idx_1(witness_ct(&builder, 1));
    // un-normalized index (with multiplicative constant 2)
    field_ct idx_2 = idx_1 + idx_1;
    field_ct sum = databus.kernel_calldata[idx_0] + databus.kernel_calldata[idx_1] + databus.kernel_calldata[idx_2];

    databus.return_data[idx_0].assert_equal(databus.kernel_calldata[idx_0]);
    databus.return_data[idx_1].assert_equal(databus.kernel_calldata[idx_1]);
    databus.return_data[idx_2].assert_equal(sum);

    EXPECT_TRUE(CircuitChecker::check(builder));
}

/**
 * @brief A failure test demonstrating that trying to prove (via a databus read) that an erroneous value is present in
 * the databus will result in an invalid witness.
 *
 */
TEST(Databus, BadReadFailure)
{
    Builder builder;
    databus_ct databus;

    // Populate return data with a single arbitrary value
    fr actual_value = 13;
    databus.return_data.set_values({ witness_ct(&builder, actual_value) });

    // Read the value from the return data
    size_t raw_idx = 0; // read at 0th index
    field_ct idx(witness_ct(&builder, raw_idx));
    field_ct read_result = databus.return_data[idx];

    // The result of the read should be as expected
    EXPECT_EQ(actual_value, read_result.get_value());

    // Since the read gate implicitly created by using operator[] on return data is valid, the witness is valid
    EXPECT_TRUE(CircuitChecker::check(builder));

    // Now assert that the read result is equal to some erroneous value. This effectively updates the return data read
    // gate to attest to the erroneous value being present at index 0 in the return data.
    field_ct erroneous_value(witness_ct(&builder, actual_value - 1));
    erroneous_value.assert_equal(read_result);

    // Since the read gate is no longer valid, the circuit checker will fail
    EXPECT_FALSE(CircuitChecker::check(builder));
}

/**
 * @brief A failure test demonstrating that a bad input-output 'copy' will lead to an invalid witness
 *
 */
TEST(Databus, BadCopyFailure)
{
    Builder builder;
    databus_ct databus;

    // Populate calldata with a single input
    fr input = 13;
    databus.kernel_calldata.set_values({ witness_ct(&builder, input) });

    // Populate return data with an output different from the input
    fr output = input - 1;
    databus.return_data.set_values({ witness_ct(&builder, output) });

    // Attempt to attest that the calldata has been copied into the return data
    size_t raw_idx = 0; // read at 0th index
    field_ct idx(witness_ct(&builder, raw_idx));
    databus.kernel_calldata[idx].assert_equal(databus.return_data[idx]);

    // Since the output data is not a copy of the input, the checker should fail
    EXPECT_FALSE(CircuitChecker::check(builder));
}

/**
 * @brief Check that multiple reads from the same index results in a valid circuit
 *
 */
TEST(Databus, DuplicateRead)
{
    Builder builder;
    databus_ct databus;

    // Define some arbitrary bus data
    std::array<bb::fr, 3> raw_calldata_values = { 5, 1, 2 };
    std::array<bb::fr, 3> raw_return_data_values = { 25, 6, 3 };

    // Populate the calldata in the databus
    std::vector<field_ct> calldata_values;
    for (auto& value : raw_calldata_values) {
        calldata_values.emplace_back(witness_ct(&builder, value));
    }
    databus.kernel_calldata.set_values(calldata_values);

    // Populate the return data in the databus
    std::vector<field_ct> return_data_values;
    for (auto& value : raw_return_data_values) {
        return_data_values.emplace_back(witness_ct(&builder, value));
    }
    databus.return_data.set_values(return_data_values);

    // Perform some arbitrary reads from both calldata and return data with some repeated indices
    field_ct idx_1(witness_ct(&builder, 1));
    field_ct idx_2(witness_ct(&builder, 2));

    databus.kernel_calldata[idx_1];
    databus.kernel_calldata[idx_1];
    databus.kernel_calldata[idx_1];
    databus.kernel_calldata[idx_2];

    databus.return_data[idx_2];
    databus.return_data[idx_2];
    databus.return_data[idx_1];

    EXPECT_TRUE(CircuitChecker::check(builder));
}

/**
 * @brief Appending to a bus column emits the init-read that binds the bus entry to the appended witness.
 *
 * The bus column is not part of the copy-constraint permutation, so this init-read's lookup is what links
 * bus_column[slot] to its main-wire witness. Two slots with distinct values exercise the assertions broadly:
 * a missing row, missing read_count increment, wrong index wire, swapped index/value wires, or wrong value
 * wire all leave at least one structural assertion or the lookup balance failing.
 */
TEST(Databus, AppendBindsBusEntryViaInitRead)
{
    Builder builder;
    const size_t initial_busread_rows = builder.blocks.busread.size();

    const uint32_t w0_idx = builder.add_variable(bb::fr(42));
    const uint32_t w1_idx = builder.add_variable(bb::fr(100));
    builder.add_public_calldata(BusId::KERNEL_CALLDATA, w0_idx);
    builder.add_public_calldata(BusId::KERNEL_CALLDATA, w1_idx);

    const auto& bus_vec = builder.get_calldata(BusId::KERNEL_CALLDATA);
    EXPECT_EQ(builder.blocks.busread.size(), initial_busread_rows + 2);
    EXPECT_EQ(bus_vec.size(), 2U);
    EXPECT_EQ(bus_vec.get_read_count(0), 1U);
    EXPECT_EQ(bus_vec.get_read_count(1), 1U);
    EXPECT_TRUE(CircuitChecker::check(builder));
}

/**
 * @brief The init-read's lookup rejects a bus_column / value-wire divergence.
 *
 * Appends a witness with value 13 (creating an init-read at slot 0), then overwrites the row's value wire to
 * point at a witness with value 14. The bus column at slot 0 materializes to 13 from `bus_vec[0]`; the lookup
 * at the row now expects (0, 14) ∈ bus_col, and `check_databus_read` rejects.
 */
TEST(Databus, InitReadCatchesValueMismatch)
{
    Builder builder;

    const uint32_t w_expected = builder.add_variable(bb::fr(13));
    builder.add_public_calldata(BusId::KERNEL_CALLDATA, w_expected);
    EXPECT_TRUE(CircuitChecker::check(builder));

    // Rewrite the value-wire of the just-emitted init-read row to point at a different witness.
    const uint32_t w_attacker = builder.add_variable(bb::fr(14));
    auto& value_wire = builder.blocks.busread.wires[0];
    ASSERT_FALSE(value_wire.empty());
    value_wire.back() = w_attacker;

    EXPECT_FALSE(CircuitChecker::check(builder));
}
