#pragma once
#include "./tree_meta.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "msgpack/assert.hpp"
#include <cstdint>
#include <exception>
#include <memory>
#include <stdexcept>
#include <unordered_map>
#include <utility>
#include <vector>

namespace bb::crypto::merkle_tree {

/**
 * @brief Serves as a key-value node store for merkle trees, uses an unordered_map as a cache
 */
template <typename PersistedStore> class CachedLeavesStore {

  public:
    using ReadTransaction = typename PersistedStore::ReadTransaction;
    using WriteTransaction = typename PersistedStore::WriteTransaction;
    using ReadTransactionPtr = std::unique_ptr<ReadTransaction>;
    using WriteTransactionPtr = std::unique_ptr<WriteTransaction>;

    CachedLeavesStore(PersistedStore& leavesStore, index_t expected_size)
        : leavesStore(leavesStore)
    {
        initialise(expected_size);
    }
    ~CachedLeavesStore() = default;

    CachedLeavesStore() = delete;
    CachedLeavesStore(CachedLeavesStore const& other) = delete;
    CachedLeavesStore(CachedLeavesStore const&& other) = delete;
    CachedLeavesStore& operator=(CachedLeavesStore const& other) = delete;
    CachedLeavesStore& operator=(CachedLeavesStore const&& other) = delete;

    index_t get_size(bool includeUncommitted) const { return meta.size + (includeUncommitted ? leaves_.size() : 0); }

    void commit()
    {
        {
            if (leaves_.size() != indices_.size()) {
                throw std::runtime_error("Inconsistent sizes in leaves data store");
            }
            WriteTransactionPtr tx = createWriteTransaction();
            for (auto& idx : indices_) {
                std::vector<uint8_t> key;
                std::vector<uint8_t> value;
                write(key, idx.first);
                write(value, idx.second);
                tx->put_value(key, value);
            }
            for (uint32_t i = 0; i < leaves_.size(); ++i) {
                msgpack::sbuffer buffer;
                msgpack::pack(buffer, leaves_[i]);
                std::vector<uint8_t> value(buffer.data(), buffer.data() + buffer.size());
                std::vector<uint8_t> key;
                write(key, index_t(meta.size + i));
                tx->put_value(key, value);
            }
            meta.size += leaves_.size();
            persistMeta(meta, *tx);
        }
        rollback();
    };
    void rollback()
    {
        indices_ = std::map<uint256_t, index_t>();
        leaves_ = std::vector<indexed_leaf>();
    };

    ReadTransactionPtr createReadTransaction() const { return leavesStore.createReadNodeTransaction(); }
    WriteTransactionPtr createWriteTransaction() const { return leavesStore.createWriteNodeTransaction(); }

  private:
    std::map<uint256_t, index_t> indices_;
    std::vector<indexed_leaf> leaves_;
    PersistedStore& leavesStore;
    LeavesMeta meta;

    bool readPersistedMeta(LeavesMeta& m, ReadTransaction& tx) const
    {
        std::vector<uint8_t> data;
        std::vector<uint8_t> key{ 0 };
        bool success = tx.get_value(key, data);
        if (success) {
            msgpack::unpack((const char*)data.data(), data.size()).get().convert(m);
        }
        return success;
    }

    void persistMeta(LeavesMeta& m, WriteTransaction& tx)
    {
        msgpack::sbuffer buffer;
        msgpack::pack(buffer, m);
        std::vector<uint8_t> encoded(buffer.data(), buffer.data() + buffer.size());
        std::vector<uint8_t> key{ 0 };
        tx.put_value(key, encoded);
    }

    void initialise(index_t expected_size)
    {
        std::vector<uint8_t> data;
        {
            ReadTransactionPtr tx = createReadTransaction();
            bool success = readPersistedMeta(meta, *tx);
            if (success) {
                if (expected_size == meta.size) {
                    return;
                }
                throw std::runtime_error("Invalid tree meta data");
            }
        }

        meta.size = 0;
        WriteTransactionPtr tx = createWriteTransaction();
        persistMeta(meta, *tx);
    }
};
} // namespace bb::crypto::merkle_tree