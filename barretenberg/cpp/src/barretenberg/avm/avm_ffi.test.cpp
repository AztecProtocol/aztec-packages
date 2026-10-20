#include "barretenberg/avm/generated/avm_ffi.hpp"
#include "barretenberg/avm/minimal_tx_fixture.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"

#include <gtest/gtest.h>

#include <string>
#include <vector>

using namespace bb;
using namespace bb::avm;

namespace {

const std::vector<uint8_t> MINIMAL_TX(std::begin(MINIMAL_TX_FIXTURE), std::end(MINIMAL_TX_FIXTURE));

/** A decoded response frame: its tag, and the payload (or the service's error message). */
struct Response {
    std::string tag;
    std::vector<uint8_t> result;
    std::string error;
};

/** Call the service through the generated in-process FFI entry: the path the wasm transport takes. */
Response call_ffi(const char* name, const auto& cmd)
{
    msgpack::sbuffer buf;
    msgpack::packer<msgpack::sbuffer> pk(buf);
    pk.pack_array(1);
    pk.pack_array(2);
    pk.pack(std::string(name));
    pk.pack(cmd);

    uint8_t* output = nullptr;
    size_t output_len = 0;
    avm_ipc_ffi_entry(reinterpret_cast<const uint8_t*>(buf.data()), buf.size(), &output, &output_len);
    auto unpacked = msgpack::unpack(reinterpret_cast<const char*>(output), output_len);
    avm_ipc_ffi_free(output);

    auto obj = unpacked.get();
    Response response{ .tag = std::string(obj.via.array.ptr[0].via.str.ptr, obj.via.array.ptr[0].via.str.size) };
    if (response.tag == "AvmErrorResponse") {
        wire::AvmErrorResponse error;
        obj.via.array.ptr[1].convert(error);
        response.error = error.message;
    } else {
        wire::AvmSimulateWithHintsResponse ok;
        obj.via.array.ptr[1].convert(ok);
        response.result = ok.result;
    }
    return response;
}

} // namespace

// The fixture carries the public inputs the transaction produced, so the simulation's outputs can be checked against
// them. A build where a wider type narrows (size_t is 32-bit on wasm32) gets them wrong.
TEST(AvmFfi, SimulateWithHintsMatchesTheFixturesPublicInputs)
{
    auto response = call_ffi("AvmSimulateWithHints", wire::AvmSimulateWithHints{ .inputs = MINIMAL_TX });
    ASSERT_EQ(response.tag, "AvmSimulateWithHintsResponse") << response.error;

    avm2::TxSimulationResult result;
    msgpack::unpack(reinterpret_cast<const char*>(response.result.data()), response.result.size())
        .get()
        .convert(result);
    auto expected = avm2::AvmProvingInputs::from(MINIMAL_TX).public_inputs;
    EXPECT_EQ(result.revert_code == avm2::RevertCode::OK, !expected.reverted);
    EXPECT_EQ(result.gas_used.total_gas, expected.end_gas_used);
    EXPECT_EQ(result.public_tx_effect.transaction_fee, expected.transaction_fee);
    EXPECT_EQ(result.public_tx_effect.note_hashes.size(), expected.accumulated_data_array_lengths.note_hashes);
    EXPECT_EQ(result.public_tx_effect.nullifiers.size(), expected.accumulated_data_array_lengths.nullifiers);
    EXPECT_EQ(result.public_tx_effect.public_data_writes.size(),
              expected.accumulated_data_array_lengths.public_data_writes);
}

// The exceptions the simulator signals exceptional halts with are caught where it expects, including in wasm.
TEST(AvmFfi, SimulatorExceptionsAreCaught)
{
    EXPECT_THROW(avm2::TaggedValue::from<uint8_t>(1) + avm2::TaggedValue::from<uint16_t>(1),
                 avm2::TagMismatchException);
}

// Inputs that fail to decode throw inside the simulator, and the entry answers with an error rather than ending the
// module, so the next call still succeeds.
TEST(AvmFfi, MalformedInputsGetAnErrorAndTheEntryKeepsAnswering)
{
    auto bad = call_ffi("AvmSimulateWithHints", wire::AvmSimulateWithHints{ .inputs = { 1, 2, 3 } });
    EXPECT_EQ(bad.tag, "AvmErrorResponse");
    EXPECT_FALSE(bad.error.empty());

    auto good = call_ffi("AvmSimulateWithHints", wire::AvmSimulateWithHints{ .inputs = MINIMAL_TX });
    EXPECT_EQ(good.tag, "AvmSimulateWithHintsResponse") << good.error;
}

TEST(AvmFfi, SimulateAnswersWithAnError)
{
    auto response = call_ffi("AvmSimulate", wire::AvmSimulate{ .inputs = MINIMAL_TX });
    EXPECT_EQ(response.tag, "AvmErrorResponse");
    EXPECT_NE(response.error.find("SimulateWithHints"), std::string::npos) << response.error;
}

// wasm does not find main() in gtest_main (see ecc_tests' secp256r1.test.cpp).
#ifdef __wasm__
GTEST_API_ int main(int argc, char** argv)
{
    testing::InitGoogleTest(&argc, argv);
    return RUN_ALL_TESTS();
}
#endif
