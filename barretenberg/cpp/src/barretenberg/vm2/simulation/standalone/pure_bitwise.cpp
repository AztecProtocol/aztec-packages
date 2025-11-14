#include "barretenberg/vm2/simulation/standalone/pure_bitwise.hpp"

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"
#include "barretenberg/vm2/simulation/interfaces/bitwise.hpp"

namespace bb::avm2::simulation {

MemoryValue PureBitwise::and_op(const MemoryValue& a, const MemoryValue& b)
{
    try {
        return a & b;
    } catch (const std::exception& e) {
        throw BitwiseException("AND, " + std::string(e.what()));
    }
}
MemoryValue PureBitwise::or_op(const MemoryValue& a, const MemoryValue& b)
{
    try {
        return a | b;
    } catch (const std::exception& e) {
        throw BitwiseException("OR, " + std::string(e.what()));
    }
}
MemoryValue PureBitwise::xor_op(const MemoryValue& a, const MemoryValue& b)
{
    try {
        return a ^ b;
    } catch (const std::exception& e) {
        throw BitwiseException("XOR, " + std::string(e.what()));
    }
}

} // namespace bb::avm2::simulation
