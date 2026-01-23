#include "barretenberg/avm_fuzzer/mutations/basic_types/eth_address.hpp"

#include "barretenberg/avm_fuzzer/mutations/basic_types/field.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"

using bb::avm2::EthAddress;
using bb::avm2::FF;

namespace {

EthAddress ff_to_eth_address(FF ff)
{
    return EthAddress(static_cast<uint256_t>(ff).slice(0, 20));
}

} // namespace

EthAddress generate_random_eth_address(std::mt19937_64& rng)
{
    return ff_to_eth_address(generate_random_field(rng));
}
