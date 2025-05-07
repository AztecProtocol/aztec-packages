#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/full_row.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/class_id_derivation_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::tracegen {
namespace {

using testing::ElementsAre;
using testing::Field;

using R = TestTraceContainer::Row;

TEST(ClassIdDerivationTraceGenTest, TraceGeneration)
{
    TestTraceContainer trace;
    ClassIdDerivationTraceBuilder builder;

    ContractClassId class_id = FF(0xdeadbeef);
    ContractClass klass{
        .artifact_hash = FF(12),
        .private_function_root = FF(23),
        .public_bytecode_commitment = FF(45),
        .packed_bytecode = {},
    };
    builder.process({ { .class_id = class_id, .klass = klass } }, trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(
                    // Only one row.
                    AllOf(ROW_FIELD_EQ(R, class_id_derivation_sel, 1),
                          ROW_FIELD_EQ(R, class_id_derivation_class_id, FF(0xdeadbeef)),
                          ROW_FIELD_EQ(R, class_id_derivation_artifact_hash, FF(12)),
                          ROW_FIELD_EQ(R, class_id_derivation_private_function_root, FF(23)),
                          ROW_FIELD_EQ(R, class_id_derivation_public_bytecode_commitment, FF(45)))));
}

} // namespace
} // namespace bb::avm2::tracegen
