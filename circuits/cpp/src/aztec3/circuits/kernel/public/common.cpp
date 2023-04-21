#include "init.hpp"
#include "common.hpp"

namespace aztec3::circuits::kernel::public_kernel {

NT::fr hash_public_data_tree_value(NT::fr const& value)
{
    return crypto::pedersen_commitment::compress_native({ value }, GeneratorIndex::PUBLIC_DATA_LEAF);
}
NT::fr hash_public_data_tree_index(NT::fr const& contract_address, NT::fr const& storage_slot)
{
    return crypto::pedersen_commitment::compress_native({ contract_address, storage_slot },
                                                        GeneratorIndex::PUBLIC_LEAF_INDEX);
}

} // namespace aztec3::circuits::kernel::public_kernel