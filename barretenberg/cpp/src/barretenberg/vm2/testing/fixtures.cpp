#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

#include <vector>

using bb::avm2::tracegen::TestTraceContainer;

namespace bb::avm2::testing {

std::vector<FF> random_fields(size_t n)
{
    std::vector<FF> fields;
    fields.reserve(n);
    for (size_t i = 0; i < n; ++i) {
        fields.push_back(FF::random_element());
    }
    return fields;
}

std::vector<uint8_t> random_bytes(size_t n)
{
    std::vector<uint8_t> bytes;
    bytes.reserve(n);
    for (size_t i = 0; i < n; ++i) {
        bytes.push_back(static_cast<uint8_t>(rand() % 256));
    }
    return bytes;
}

TestTraceContainer empty_trace()
{
    return TestTraceContainer::from_rows({ { .precomputed_first_row = 1 }, { .precomputed_clk = 1 } });
}

} // namespace bb::avm2::testing
