// Runs one public transaction through vm2_sim from hinted inputs (AvmProvingInputs, msgpack), as `bb avm_simulate`
// does, and first checks that a C++ exception thrown inside the simulator is caught.
//
// Usage: vm2_sim_smoke <avm proving inputs file>
#include "barretenberg/vm2/avm_sim_api.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"

#include <cstdint>
#include <cstdio>
#include <vector>

using namespace bb::avm2;

namespace {

std::vector<uint8_t> read_all(const char* path)
{
    std::vector<uint8_t> data;
    FILE* file = std::fopen(path, "rb");
    if (file == nullptr) {
        return data;
    }
    uint8_t chunk[1 << 16];
    size_t n = 0;
    while ((n = std::fread(chunk, 1, sizeof(chunk), file)) > 0) {
        data.insert(data.end(), chunk, chunk + n);
    }
    std::fclose(file);
    return data;
}

} // namespace

int main(int argc, char** argv)
{
    try {
        auto sum = TaggedValue::from<uint8_t>(1) + TaggedValue::from<uint16_t>(1);
        std::printf("FAIL: mismatched tags added without throwing (tag %d)\n", static_cast<int>(sum.get_tag()));
        return 1;
    } catch (const TagMismatchException& e) {
        std::printf("caught TagMismatchException: %s\n", e.what());
    }

    if (argc < 2) {
        std::printf("usage: %s <avm proving inputs file>\n", argv[0]);
        return 2;
    }
    auto bytes = read_all(argv[1]);
    if (bytes.empty()) {
        std::printf("FAIL: could not read %s\n", argv[1]);
        return 1;
    }
    auto inputs = AvmSimAPI::ProvingInputs::from(bytes);
    auto result = AvmSimAPI().simulate_with_hinted_dbs(inputs);
    std::printf("revert_code=%d total_l2_gas=%u total_da_gas=%u\n",
                static_cast<int>(result.revert_code),
                result.gas_used.total_gas.l2_gas,
                result.gas_used.total_gas.da_gas);
    return 0;
}
