#include "field/field_element.hpp"
#include "field/hash_policy.hpp"
#include "field/poseidon2.hpp"

#include "barretenberg/aztec/aztec_hash_policy.hpp"
#include "barretenberg/crypto/merkle_tree/hash.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <gtest/gtest.h>
#include <msgpack.hpp>

// Consensus gate: the wsdb FieldElement + c_bind hashing path must produce
// byte-identical results to barretenberg's Poseidon2HashPolicy, which is what the
// AVM proves against and what is committed on L1. If this holds, replacing bb::fr
// with FieldElement and the hash policy with the c_bind cannot change any root.
namespace {
azteclabs::wsdb::FieldElement to_fe(const bb::fr& x)
{
    azteclabs::wsdb::FieldElement fe;
    bb::fr::serialize_to_buffer(x, fe.data());
    return fe;
}
} // namespace

TEST(FieldElementCbind, HashMatchesBbPolicy)
{
    for (int i = 0; i < 256; ++i) {
        bb::fr a = bb::fr::random_element();
        bb::fr b = bb::fr::random_element();
        bb::fr expected = bb::crypto::merkle_tree::Poseidon2HashPolicy::hash_pair(a, b);
        azteclabs::wsdb::FieldElement got = azteclabs::wsdb::poseidon2_hash({ to_fe(a), to_fe(b) });
        EXPECT_EQ(got, to_fe(expected));
    }
}

TEST(FieldElementCbind, HashPairWithSeparatorMatchesBbPolicy)
{
    for (uint64_t sep : { uint64_t(0), uint64_t(1), uint64_t(7), uint64_t(1) << 40 }) {
        for (int i = 0; i < 64; ++i) {
            bb::fr a = bb::fr::random_element();
            bb::fr b = bb::fr::random_element();
            bb::fr expected = bb::crypto::merkle_tree::Poseidon2HashPolicy::hash_pair_with_separator(sep, a, b);
            azteclabs::wsdb::FieldElement got =
                azteclabs::wsdb::poseidon2_hash_pair_with_separator(sep, to_fe(a), to_fe(b));
            EXPECT_EQ(got, to_fe(expected));
        }
    }
}

TEST(FieldElementCbind, OrderingMatchesNumericOrder)
{
    // Big-endian canonical bytes => lexicographic FieldElement order == numeric fr order.
    for (int i = 0; i < 256; ++i) {
        bb::fr a = bb::fr::random_element();
        bb::fr b = bb::fr::random_element();
        bool fe_lt = to_fe(a) < to_fe(b);
        bool num_lt = uint256_t(a) < uint256_t(b);
        EXPECT_EQ(fe_lt, num_lt);
    }
}

// msgpack byte-identical to bb::fr => on-disk lmdb data and the IPC wire are unchanged.
TEST(FieldElementMsgpack, ByteIdenticalToBbFr)
{
    for (int i = 0; i < 256; ++i) {
        bb::fr a = bb::fr::random_element();
        msgpack::sbuffer fe_buf;
        msgpack::pack(fe_buf, to_fe(a));
        msgpack::sbuffer fr_buf;
        msgpack::pack(fr_buf, a);
        ASSERT_EQ(fe_buf.size(), fr_buf.size());
        EXPECT_EQ(0, std::memcmp(fe_buf.data(), fr_buf.data(), fe_buf.size()));
        // round-trips back to the same value
        azteclabs::wsdb::FieldElement rt;
        msgpack::unpack(fe_buf.data(), fe_buf.size()).get().convert(rt);
        EXPECT_EQ(rt, to_fe(a));
    }
}

TEST(FieldElementMsgpack, FromUint64MatchesBbFr)
{
    for (uint64_t v : { uint64_t(0), uint64_t(1), uint64_t(900), (uint64_t(1) << 63) | 7 }) {
        EXPECT_EQ(azteclabs::wsdb::FieldElement(v), to_fe(bb::fr(v)));
    }
}

// The domain-separated policies must match bb::aztec's exactly (consensus).
TEST(HashPolicy, DomainSeparatedPoliciesMatchBb)
{
    for (int i = 0; i < 64; ++i) {
        bb::fr a = bb::fr::random_element();
        bb::fr b = bb::fr::random_element();
        auto fa = to_fe(a);
        auto fb = to_fe(b);
        EXPECT_EQ(azteclabs::wsdb::NullifierMerkleHashPolicy::hash_pair(fa, fb),
                  to_fe(bb::aztec::NullifierMerkleHashPolicy::hash_pair(a, b)));
        EXPECT_EQ(azteclabs::wsdb::PublicDataMerkleHashPolicy::hash_pair(fa, fb),
                  to_fe(bb::aztec::PublicDataMerkleHashPolicy::hash_pair(a, b)));
        EXPECT_EQ(azteclabs::wsdb::AztecMerkleHashPolicy::hash_pair(fa, fb),
                  to_fe(bb::aztec::AztecMerkleHashPolicy::hash_pair(a, b)));
    }
}
