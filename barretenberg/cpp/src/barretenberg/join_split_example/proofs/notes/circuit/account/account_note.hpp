#pragma once
#include "barretenberg/join_split_example/types.hpp"
#include "commit.hpp"

namespace bb::join_split_example::proofs::notes::circuit::account {

struct account_note {
    field_ct account_alias_hash;
    group_ct account_public_key;
    group_ct signing_pub_key;
    field_ct commitment;

    account_note(field_ct const& account_alias_hash,
                 group_ct const& account_public_key,
                 group_ct const& signing_pub_key)
        : account_alias_hash(account_alias_hash)
        , account_public_key(account_public_key)
        , signing_pub_key(signing_pub_key)
        , commitment(account::commit(account_alias_hash, account_public_key, signing_pub_key))
    {}

    operator byte_array_ct() const { return byte_array_ct(commitment); }
};

} // namespace bb::join_split_example::proofs::notes::circuit::account
