#include "barretenberg/avm_fuzzer/mutations/basic_types/eth_address.hpp"

#include "barretenberg/avm_fuzzer/mutations/basic_types/field.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"

using bb::avm2::EthAddress;
using bb::avm2::FF;

namespace {

EthAddress ff_to_eth_address(const FF& field)
{
    return EthAddress(static_cast<uint256_t>(field).slice(0, MAX_ETH_ADDRESS_BIT_SIZE));
}

} // namespace

EthAddress generate_random_eth_address(std::mt19937_64& rng)
{
    return ff_to_eth_address(generate_random_field(rng));
}
