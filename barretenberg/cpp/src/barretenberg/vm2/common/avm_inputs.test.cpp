#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/avm_inputs.hpp"

#include <cstdint>

#include "barretenberg/api/file_io.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2 {
namespace {

TEST(AvmInputsTest, Deserialization)
{
    // cwd is expected to be barretenberg/cpp/build.
    auto data = read_file("../src/barretenberg/vm2/common/avm_inputs.testdata.bin");
    // We only check that deserialization does not crash.
    // Correctness of the deserialization itself is assumed via MessagePack.
    // What we are testing here is that the structure of the inputs in TS matches the C++ structs
    // that we have here. If someone changes the structure of the inputs in TS, this test would
    // force them to update the C++ structs as well (and therefore any usage of these structs).
    AvmProvingInputs::from(data);
}

} // namespace
} // namespace bb::avm2
