#pragma once
/**
 * @file store.hpp
 * @brief The Kv service's store over SQLite3 Multiple Ciphers.
 *
 * Every container's entries are rows of one table, the layout @aztec-labs/kv-store's browser store has always
 * written, so a database it wrote opens here unchanged:
 *
 *   data(slot TEXT PRIMARY KEY, container TEXT, key BLOB, key_count INTEGER, hash TEXT, value BLOB)
 *
 * `key_count` is the entry's index. `hash` identifies the value within its key: the SHA-256 of the value
 * (lowercase hex), with "#<index>" appended for entries appended without `unique`, which may repeat a value. The
 * browser store wrote ohash digests there; opening such a database rewrites them once (user_version 0 to 1).
 * `slot` is any string unique to (container, key, index); the browser store's slots stay as they were.
 */

#include <cstdint>
#include <memory>
#include <optional>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

struct sqlite3;
struct sqlite3_stmt;

namespace aztec::kv {

using Bytes = std::vector<uint8_t>;

class Store {
  public:
    /**
     * Opens (creating if need be) the store at `path`, or one in memory without a path. With `encryption_key` (32
     * bytes) the database is encrypted at rest as the browser store's encrypted databases are: sqlite3mc's ChaCha20
     * cipher, keyed with the raw key. Throws with SQLite's message if the database can't be opened or read, as a
     * wrong key reads.
     */
    Store(std::optional<std::string> path, std::optional<Bytes> encryption_key);
    ~Store();
    Store(const Store&) = delete;
    Store& operator=(const Store&) = delete;

    void clear();
    /** The database file's bytes as stored (encrypted, for an encrypted store). */
    Bytes export_file();
    /** Closes the store and removes its files. */
    void delete_files();

    void begin();
    void commit();
    void rollback();

    std::vector<std::optional<Bytes>> get(const std::string& container, const std::vector<Bytes>& keys);
    bool has(const std::string& container, const Bytes& key);
    uint64_t count(const std::string& container, const std::optional<Bytes>& key);
    std::vector<std::pair<Bytes, Bytes>> range(const std::string& container,
                                               const std::optional<Bytes>& start,
                                               const std::optional<Bytes>& end,
                                               bool reverse,
                                               std::optional<uint32_t> limit);
    void put(const std::string& container, const Bytes& key, const Bytes& value);
    void put_many(const std::string& container, const std::vector<std::pair<Bytes, Bytes>>& entries);
    void remove(const std::string& container, const Bytes& key);
    uint64_t append(const std::string& container, const Bytes& key, const std::vector<Bytes>& values, bool unique);
    std::vector<Bytes> values(const std::string& container, const Bytes& key);
    void delete_value(const std::string& container, const Bytes& key, const Bytes& value);
    std::optional<Bytes> get_at(const std::string& container, const Bytes& key, uint64_t index);
    bool set_at(const std::string& container, const Bytes& key, uint64_t index, const Bytes& value);
    std::optional<Bytes> pop(const std::string& container, const Bytes& key);

  private:
    class Statement;
    Statement statement(const char* sql);
    void exec(const char* sql);
    void insert(
        const std::string& container, const Bytes& key, uint64_t index, const std::string& hash, const Bytes& value);
    template <typename F> auto atomically(F&& body) -> decltype(body());
    [[noreturn]] void fail(const std::string& context) const;
    void close();

    sqlite3* db_ = nullptr;
    std::optional<std::string> path_;
    std::unordered_map<std::string, sqlite3_stmt*> statements_;
};

/** The value's digest as the `hash` column holds it: SHA-256, lowercase hex. */
std::string value_hash(const uint8_t* data, size_t length);

/**
 * Where a store's files live: the file system natively, the host's `files` target in a wasm module
 * (host_vfs.cpp). SQLite reaches them through its VFS; these are for what the store does to whole files.
 */
namespace files {
/** The file's bytes. Throws if it can't be read. */
Bytes read(const std::string& path);
/** Removes the file if it exists. */
void remove(const std::string& path);
} // namespace files

} // namespace aztec::kv
