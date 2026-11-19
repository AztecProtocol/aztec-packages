#include "store.hpp"

#include "sha256.hpp"

#include <sqlite3mc_amalgamation.h>

#include <algorithm>
#include <stdexcept>

namespace aztec::kv {

namespace {

constexpr const char* SCHEMA_SQL = R"(
  CREATE TABLE IF NOT EXISTS data (
    slot TEXT NOT NULL PRIMARY KEY,
    container TEXT NOT NULL,
    key BLOB NOT NULL,
    key_count INTEGER NOT NULL,
    hash TEXT NOT NULL,
    value BLOB
  ) WITHOUT ROWID;

  CREATE INDEX IF NOT EXISTS idx_container_key ON data(container, key);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_container_key_count ON data(container, key, key_count);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_container_key_hash ON data(container, key, hash);
)";

/** user_version once the `hash` column holds value_hash digests (the browser store's ohash ones before). */
constexpr int HASHES_ARE_DIGESTS = 1;

std::string hex(const uint8_t* data, size_t length)
{
    static constexpr char digits[] = "0123456789abcdef";
    std::string out(length * 2, '\0');
    for (size_t i = 0; i < length; i++) {
        out[2 * i] = digits[data[i] >> 4];
        out[2 * i + 1] = digits[data[i] & 0xf];
    }
    return out;
}

std::string slot(const std::string& container, const Bytes& key, uint64_t index)
{
    return container + ':' + hex(key.data(), key.size()) + ':' + std::to_string(index);
}

void sql_value_hash(sqlite3_context* context, int /*argc*/, sqlite3_value** argv)
{
    auto* data = static_cast<const uint8_t*>(sqlite3_value_blob(argv[0]));
    auto hash = value_hash(data, static_cast<size_t>(sqlite3_value_bytes(argv[0])));
    sqlite3_result_text(context, hash.c_str(), static_cast<int>(hash.size()), SQLITE_TRANSIENT);
}

} // namespace

std::string value_hash(const uint8_t* data, size_t length)
{
    Sha256 sha;
    sha.update(data, length);
    auto digest = sha.finish();
    return hex(digest.data(), digest.size());
}

/** A cached prepared statement, bound for one use and reset when it goes. */
class Store::Statement {
  public:
    Statement(Store& store, sqlite3_stmt* stmt)
        : store_(store)
        , stmt_(stmt)
    {}
    ~Statement()
    {
        sqlite3_reset(stmt_);
        sqlite3_clear_bindings(stmt_);
    }
    Statement(const Statement&) = delete;
    Statement& operator=(const Statement&) = delete;

    Statement& bind(int i, const std::string& text)
    {
        check(sqlite3_bind_text(stmt_, i, text.data(), static_cast<int>(text.size()), SQLITE_TRANSIENT));
        return *this;
    }
    Statement& bind(int i, const Bytes& blob)
    {
        // A zero-length blob, not NULL: sqlite3_bind_blob takes a null pointer as NULL.
        check(sqlite3_bind_blob64(
            stmt_, i, blob.empty() ? "" : static_cast<const void*>(blob.data()), blob.size(), SQLITE_TRANSIENT));
        return *this;
    }
    Statement& bind(int i, uint64_t value)
    {
        check(sqlite3_bind_int64(stmt_, i, static_cast<sqlite3_int64>(value)));
        return *this;
    }

    /** Steps once: true with a row to read, false when done. */
    bool step()
    {
        int rc = sqlite3_step(stmt_);
        if (rc == SQLITE_ROW) {
            return true;
        }
        if (rc != SQLITE_DONE) {
            store_.fail("step");
        }
        return false;
    }
    void run()
    {
        while (step()) {
        }
    }

    Bytes blob(int column) const
    {
        auto* data = static_cast<const uint8_t*>(sqlite3_column_blob(stmt_, column));
        return Bytes(data, data + sqlite3_column_bytes(stmt_, column));
    }
    std::optional<Bytes> maybe_blob(int column) const
    {
        if (sqlite3_column_type(stmt_, column) == SQLITE_NULL) {
            return std::nullopt;
        }
        return blob(column);
    }
    uint64_t integer(int column) const { return static_cast<uint64_t>(sqlite3_column_int64(stmt_, column)); }

  private:
    void check(int rc)
    {
        if (rc != SQLITE_OK) {
            store_.fail("bind");
        }
    }

    Store& store_;
    sqlite3_stmt* stmt_;
};

Store::Store(std::optional<std::string> path, std::optional<Bytes> encryption_key)
    : path_(std::move(path))
{
    if (encryption_key && encryption_key->size() != 32) {
        throw std::invalid_argument("encryptionKey must be 32 bytes (got " + std::to_string(encryption_key->size()) +
                                    ")");
    }
    if (encryption_key && !path_) {
        throw std::invalid_argument("encryptionKey is not supported for ephemeral (:memory:) stores");
    }
    int flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_NOMUTEX;
    if (sqlite3_open_v2(path_ ? path_->c_str() : ":memory:", &db_, flags, nullptr) != SQLITE_OK) {
        std::string message = db_ ? sqlite3_errmsg(db_) : "out of memory";
        close();
        throw std::runtime_error(message);
    }
    try {
        if (encryption_key) {
            exec("PRAGMA cipher = 'chacha20'");
            std::string pragma = "PRAGMA key = \"x'" + hex(encryption_key->data(), encryption_key->size()) + "'\"";
            exec(pragma.c_str());
            std::fill(pragma.begin(), pragma.end(), '\0');
        }
        exec(SCHEMA_SQL);
        if (sqlite3_create_function(db_,
                                    "kv_value_hash",
                                    1,
                                    SQLITE_UTF8 | SQLITE_DETERMINISTIC,
                                    nullptr,
                                    sql_value_hash,
                                    nullptr,
                                    nullptr) != SQLITE_OK) {
            fail("kv_value_hash");
        }
        uint64_t version = 0;
        {
            auto stmt = statement("PRAGMA user_version");
            if (stmt.step()) {
                version = stmt.integer(0);
            }
        }
        if (version < HASHES_ARE_DIGESTS) {
            // OR IGNORE: two values the browser store told apart but whose bytes are equal keep their old digest
            // rather than failing the open on the unique index.
            exec("BEGIN; UPDATE OR IGNORE data SET hash = kv_value_hash(value); PRAGMA user_version = 1; COMMIT;");
        }
    } catch (...) {
        close();
        throw;
    }
}

Store::~Store()
{
    close();
}

void Store::close()
{
    for (auto& [_, stmt] : statements_) {
        sqlite3_finalize(stmt);
    }
    statements_.clear();
    if (db_) {
        sqlite3_close_v2(db_);
        db_ = nullptr;
    }
}

void Store::fail(const std::string& context) const
{
    throw std::runtime_error(db_ ? std::string(sqlite3_errmsg(db_)) : context + ": the store is closed");
}

void Store::exec(const char* sql)
{
    if (!db_) {
        fail("exec");
    }
    if (sqlite3_exec(db_, sql, nullptr, nullptr, nullptr) != SQLITE_OK) {
        fail("exec");
    }
}

Store::Statement Store::statement(const char* sql)
{
    if (!db_) {
        fail("statement");
    }
    auto it = statements_.find(sql);
    if (it == statements_.end()) {
        sqlite3_stmt* stmt = nullptr;
        if (sqlite3_prepare_v3(db_, sql, -1, SQLITE_PREPARE_PERSISTENT, &stmt, nullptr) != SQLITE_OK) {
            fail("prepare");
        }
        it = statements_.emplace(sql, stmt).first;
    }
    return Statement(*this, it->second);
}

template <typename F> auto Store::atomically(F&& body) -> decltype(body())
{
    exec("SAVEPOINT kv_op");
    try {
        if constexpr (std::is_void_v<decltype(body())>) {
            body();
            exec("RELEASE kv_op");
        } else {
            auto result = body();
            exec("RELEASE kv_op");
            return result;
        }
    } catch (...) {
        sqlite3_exec(db_, "ROLLBACK TO kv_op; RELEASE kv_op", nullptr, nullptr, nullptr);
        throw;
    }
}

void Store::clear()
{
    exec("DELETE FROM data");
}

Bytes Store::export_file()
{
    if (!path_) {
        throw std::runtime_error("an ephemeral store has no file to export");
    }
    return files::read(*path_);
}

void Store::delete_files()
{
    close();
    if (path_) {
        files::remove(*path_);
        files::remove(*path_ + "-journal");
    }
}

void Store::begin()
{
    exec("BEGIN");
}

void Store::commit()
{
    exec("COMMIT");
}

void Store::rollback()
{
    exec("ROLLBACK");
}

std::vector<std::optional<Bytes>> Store::get(const std::string& container, const std::vector<Bytes>& keys)
{
    std::vector<std::optional<Bytes>> out;
    out.reserve(keys.size());
    for (const auto& key : keys) {
        auto stmt = statement("SELECT value FROM data WHERE container = ? AND key = ? AND key_count = 1");
        stmt.bind(1, container).bind(2, key);
        out.push_back(stmt.step() ? stmt.maybe_blob(0) : std::nullopt);
    }
    return out;
}

bool Store::has(const std::string& container, const Bytes& key)
{
    auto stmt = statement("SELECT 1 FROM data WHERE container = ? AND key = ? LIMIT 1");
    stmt.bind(1, container).bind(2, key);
    return stmt.step();
}

uint64_t Store::count(const std::string& container, const std::optional<Bytes>& key)
{
    if (key) {
        auto stmt = statement("SELECT COUNT(*) FROM data WHERE container = ? AND key = ?");
        stmt.bind(1, container).bind(2, *key);
        return stmt.step() ? stmt.integer(0) : 0;
    }
    auto stmt = statement("SELECT COUNT(*) FROM data WHERE container = ?");
    stmt.bind(1, container);
    return stmt.step() ? stmt.integer(0) : 0;
}

std::vector<std::pair<Bytes, Bytes>> Store::range(const std::string& container,
                                                  const std::optional<Bytes>& start,
                                                  const std::optional<Bytes>& end,
                                                  bool reverse,
                                                  std::optional<uint32_t> limit)
{
    // Forward [start, end); reverse (start, end]. One statement per combination of bounds, so each bound is a plain
    // comparison the (container, key) index serves; no limit is -1, which SQLite reads as none.
    std::string sql = "SELECT key, value FROM data WHERE container = ?1";
    if (start) {
        sql += reverse ? " AND key > ?2" : " AND key >= ?2";
    }
    if (end) {
        sql += reverse ? " AND key <= ?3" : " AND key < ?3";
    }
    sql += reverse ? " ORDER BY key DESC, key_count DESC LIMIT ?4" : " ORDER BY key ASC, key_count ASC LIMIT ?4";
    auto stmt = statement(sql.c_str());
    stmt.bind(1, container);
    if (start) {
        stmt.bind(2, *start);
    }
    if (end) {
        stmt.bind(3, *end);
    }
    stmt.bind(4, limit ? static_cast<uint64_t>(*limit) : static_cast<uint64_t>(-1));
    std::vector<std::pair<Bytes, Bytes>> out;
    while (stmt.step()) {
        out.emplace_back(stmt.blob(0), stmt.blob(1));
    }
    return out;
}

void Store::insert(
    const std::string& container, const Bytes& key, uint64_t index, const std::string& hash, const Bytes& value)
{
    // OR REPLACE: the entry at (container, key, index) is replaced whatever its slot, so one the browser store wrote
    // (under its own slot string) is replaced too.
    auto stmt = statement(
        "INSERT OR REPLACE INTO data (slot, container, key, key_count, hash, value) VALUES (?, ?, ?, ?, ?, ?)");
    stmt.bind(1, slot(container, key, index))
        .bind(2, container)
        .bind(3, key)
        .bind(4, index)
        .bind(5, hash)
        .bind(6, value);
    stmt.run();
}

void Store::put(const std::string& container, const Bytes& key, const Bytes& value)
{
    insert(container, key, 1, value_hash(value.data(), value.size()), value);
}

void Store::put_many(const std::string& container, const std::vector<std::pair<Bytes, Bytes>>& entries)
{
    atomically([&] {
        for (const auto& [key, value] : entries) {
            put(container, key, value);
        }
    });
}

void Store::remove(const std::string& container, const Bytes& key)
{
    auto stmt = statement("DELETE FROM data WHERE container = ? AND key = ?");
    stmt.bind(1, container).bind(2, key);
    stmt.run();
}

uint64_t Store::append(const std::string& container, const Bytes& key, const std::vector<Bytes>& values, bool unique)
{
    return atomically([&] {
        uint64_t last = 0;
        {
            auto stmt = statement("SELECT COALESCE(MAX(key_count), 0) FROM data WHERE container = ? AND key = ?");
            stmt.bind(1, container).bind(2, key);
            if (stmt.step()) {
                last = stmt.integer(0);
            }
        }
        for (const auto& value : values) {
            auto hash = value_hash(value.data(), value.size());
            if (unique) {
                auto stmt = statement("SELECT 1 FROM data WHERE container = ? AND key = ? AND hash = ? LIMIT 1");
                stmt.bind(1, container).bind(2, key).bind(3, hash);
                if (stmt.step()) {
                    continue;
                }
            } else {
                hash += '#' + std::to_string(last + 1);
            }
            insert(container, key, ++last, hash, value);
        }
        return count(container, key);
    });
}

std::vector<Bytes> Store::values(const std::string& container, const Bytes& key)
{
    auto stmt = statement("SELECT value FROM data WHERE container = ? AND key = ? ORDER BY key_count ASC");
    stmt.bind(1, container).bind(2, key);
    std::vector<Bytes> out;
    while (stmt.step()) {
        out.push_back(stmt.blob(0));
    }
    return out;
}

void Store::delete_value(const std::string& container, const Bytes& key, const Bytes& value)
{
    auto stmt = statement("DELETE FROM data WHERE container = ? AND key = ? AND hash = ?");
    stmt.bind(1, container).bind(2, key).bind(3, value_hash(value.data(), value.size()));
    stmt.run();
}

std::optional<Bytes> Store::get_at(const std::string& container, const Bytes& key, uint64_t index)
{
    auto stmt = statement("SELECT value FROM data WHERE container = ? AND key = ? AND key_count = ?");
    stmt.bind(1, container).bind(2, key).bind(3, index);
    return stmt.step() ? stmt.maybe_blob(0) : std::nullopt;
}

bool Store::set_at(const std::string& container, const Bytes& key, uint64_t index, const Bytes& value)
{
    auto stmt = statement("UPDATE data SET value = ?, hash = ? WHERE container = ? AND key = ? AND key_count = ?");
    stmt.bind(1, value)
        .bind(2, value_hash(value.data(), value.size()) + '#' + std::to_string(index))
        .bind(3, container)
        .bind(4, key)
        .bind(5, index);
    stmt.run();
    return sqlite3_changes(db_) > 0;
}

std::optional<Bytes> Store::pop(const std::string& container, const Bytes& key)
{
    return atomically([&]() -> std::optional<Bytes> {
        uint64_t index = 0;
        std::optional<Bytes> value;
        {
            auto stmt = statement(
                "SELECT key_count, value FROM data WHERE container = ? AND key = ? ORDER BY key_count DESC LIMIT 1");
            stmt.bind(1, container).bind(2, key);
            if (!stmt.step()) {
                return std::nullopt;
            }
            index = stmt.integer(0);
            value = stmt.maybe_blob(1);
        }
        auto stmt = statement("DELETE FROM data WHERE container = ? AND key = ? AND key_count = ?");
        stmt.bind(1, container).bind(2, key).bind(3, index);
        stmt.run();
        return value;
    });
}

} // namespace aztec::kv
