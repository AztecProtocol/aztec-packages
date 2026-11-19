#include "store.hpp"

#include <sqlite3mc_amalgamation.h>

#include <gtest/gtest.h>

#include <filesystem>
#include <random>
#include <string>

using namespace aztec::kv;

namespace {

Bytes b(const std::string& s)
{
    return Bytes(s.begin(), s.end());
}

std::vector<std::string> keys_of(const std::vector<std::pair<Bytes, Bytes>>& entries)
{
    std::vector<std::string> out;
    for (const auto& [key, _] : entries) {
        out.emplace_back(key.begin(), key.end());
    }
    return out;
}

class TempDir {
  public:
    TempDir()
        : path_(std::filesystem::temp_directory_path() / ("kv_test_" + std::to_string(std::random_device{}())))
    {
        std::filesystem::create_directories(path_);
    }
    ~TempDir() { std::filesystem::remove_all(path_); }
    std::string file(const std::string& name) const { return (path_ / name).string(); }

  private:
    std::filesystem::path path_;
};

void raw_exec(const std::string& path, const std::string& sql)
{
    sqlite3* db = nullptr;
    ASSERT_EQ(sqlite3_open(path.c_str(), &db), SQLITE_OK);
    char* error = nullptr;
    int rc = sqlite3_exec(db, sql.c_str(), nullptr, nullptr, &error);
    std::string message = error ? error : "";
    sqlite3_free(error);
    sqlite3_close(db);
    ASSERT_EQ(rc, SQLITE_OK) << message;
}

} // namespace

TEST(KvStore, MapPutGetHasDelete)
{
    Store store(std::nullopt, std::nullopt);
    store.put("map:a", b("k1"), b("v1"));
    store.put("map:a", b("k1"), b("v1b"));
    store.put("map:b", b("k1"), b("other"));
    auto got = store.get("map:a", { b("k1"), b("missing") });
    ASSERT_EQ(got.size(), 2U);
    EXPECT_EQ(got[0], b("v1b"));
    EXPECT_EQ(got[1], std::nullopt);
    EXPECT_TRUE(store.has("map:a", b("k1")));
    EXPECT_EQ(store.count("map:a", std::nullopt), 1U);
    store.remove("map:a", b("k1"));
    EXPECT_FALSE(store.has("map:a", b("k1")));
    EXPECT_TRUE(store.has("map:b", b("k1")));
}

TEST(KvStore, EmptyValuesAndKeysRoundTrip)
{
    Store store(std::nullopt, std::nullopt);
    store.put("map:a", b(""), b(""));
    auto got = store.get("map:a", { b("") });
    ASSERT_TRUE(got[0].has_value());
    EXPECT_TRUE(got[0]->empty());
}

TEST(KvStore, RangeBoundsAndOrder)
{
    Store store(std::nullopt, std::nullopt);
    for (const char* k : { "a", "b", "c", "d" }) {
        store.put("map:r", b(k), b(k));
    }
    EXPECT_EQ(keys_of(store.range("map:r", std::nullopt, std::nullopt, false, std::nullopt)),
              (std::vector<std::string>{ "a", "b", "c", "d" }));
    EXPECT_EQ(keys_of(store.range("map:r", b("b"), b("d"), false, std::nullopt)),
              (std::vector<std::string>{ "b", "c" }));
    EXPECT_EQ(keys_of(store.range("map:r", b("b"), b("d"), true, std::nullopt)),
              (std::vector<std::string>{ "d", "c" }));
    EXPECT_EQ(keys_of(store.range("map:r", std::nullopt, std::nullopt, true, 2)),
              (std::vector<std::string>{ "d", "c" }));
    EXPECT_EQ(keys_of(store.range("map:r", b("c"), std::nullopt, false, std::nullopt)),
              (std::vector<std::string>{ "c", "d" }));
}

TEST(KvStore, KeysSortAsBytes)
{
    Store store(std::nullopt, std::nullopt);
    store.put("map:r", Bytes{ 0x80 }, b("high"));
    store.put("map:r", Bytes{ 0x01, 0x00 }, b("low"));
    store.put("map:r", Bytes{ 0x01 }, b("prefix"));
    auto entries = store.range("map:r", std::nullopt, std::nullopt, false, std::nullopt);
    ASSERT_EQ(entries.size(), 3U);
    EXPECT_EQ(entries[0].second, b("prefix"));
    EXPECT_EQ(entries[1].second, b("low"));
    EXPECT_EQ(entries[2].second, b("high"));
}

TEST(KvStore, MultimapAppendUniqueAndDeleteValue)
{
    Store store(std::nullopt, std::nullopt);
    EXPECT_EQ(store.append("map:m", b("k"), { b("x"), b("y"), b("x") }, true), 2U);
    EXPECT_EQ(store.append("map:m", b("k"), { b("y"), b("z") }, true), 3U);
    EXPECT_EQ(store.values("map:m", b("k")), (std::vector<Bytes>{ b("x"), b("y"), b("z") }));
    store.delete_value("map:m", b("k"), b("y"));
    EXPECT_EQ(store.values("map:m", b("k")), (std::vector<Bytes>{ b("x"), b("z") }));
    // A deleted value's index is not reused: the next lands after the highest.
    store.append("map:m", b("k"), { b("y") }, true);
    EXPECT_EQ(store.values("map:m", b("k")), (std::vector<Bytes>{ b("x"), b("z"), b("y") }));
    auto range = store.range("map:m", std::nullopt, std::nullopt, false, std::nullopt);
    ASSERT_EQ(range.size(), 3U);
    EXPECT_EQ(range[2].second, b("y"));
}

TEST(KvStore, ArrayAppendGetSetPop)
{
    Store store(std::nullopt, std::nullopt);
    EXPECT_EQ(store.append("array:a", b("a"), { b("x"), b("x"), b("y") }, false), 3U);
    EXPECT_EQ(store.get_at("array:a", b("a"), 2), b("x"));
    EXPECT_TRUE(store.set_at("array:a", b("a"), 2, b("y")));
    EXPECT_FALSE(store.set_at("array:a", b("a"), 9, b("y")));
    EXPECT_EQ(store.values("array:a", b("a")), (std::vector<Bytes>{ b("x"), b("y"), b("y") }));
    EXPECT_EQ(store.pop("array:a", b("a")), b("y"));
    EXPECT_EQ(store.count("array:a", b("a")), 2U);
    EXPECT_EQ(store.append("array:a", b("a"), { b("z") }, false), 3U);
    EXPECT_EQ(store.get_at("array:a", b("a"), 3), b("z"));
    store.pop("array:a", b("a"));
    store.pop("array:a", b("a"));
    store.pop("array:a", b("a"));
    EXPECT_EQ(store.pop("array:a", b("a")), std::nullopt);
}

TEST(KvStore, TransactionsCommitAndRollBack)
{
    Store store(std::nullopt, std::nullopt);
    store.begin();
    store.put("map:t", b("k"), b("kept"));
    store.commit();
    store.begin();
    store.put("map:t", b("k"), b("dropped"));
    store.append("array:t", b("a"), { b("dropped") }, false);
    store.rollback();
    EXPECT_EQ(store.get("map:t", { b("k") })[0], b("kept"));
    EXPECT_EQ(store.count("array:t", std::nullopt), 0U);
    // Composite commands nest inside an open transaction.
    store.begin();
    store.put_many("map:t", { { b("a"), b("1") }, { b("b"), b("2") } });
    store.rollback();
    EXPECT_FALSE(store.has("map:t", b("a")));
}

TEST(KvStore, PersistsAndClears)
{
    TempDir dir;
    auto path = dir.file("store.sqlite");
    {
        Store store(path, std::nullopt);
        store.put("map:p", b("k"), b("v"));
    }
    {
        Store store(path, std::nullopt);
        EXPECT_EQ(store.get("map:p", { b("k") })[0], b("v"));
        auto exported = store.export_file();
        EXPECT_EQ(std::string(exported.begin(), exported.begin() + 15), "SQLite format 3");
        store.clear();
        EXPECT_EQ(store.count("map:p", std::nullopt), 0U);
        store.delete_files();
    }
    EXPECT_FALSE(std::filesystem::exists(path));
}

TEST(KvStore, EncryptedStoreNeedsItsKey)
{
    TempDir dir;
    auto path = dir.file("enc.sqlite");
    Bytes key(32, 7);
    {
        Store store(path, key);
        store.put("map:e", b("k"), b("secret"));
        auto exported = store.export_file();
        EXPECT_NE(std::string(exported.begin(), exported.begin() + 15), "SQLite format 3");
    }
    EXPECT_THROW(Store(path, Bytes(32, 8)), std::runtime_error);
    EXPECT_THROW(Store(path, std::nullopt), std::runtime_error);
    Store store(path, key);
    EXPECT_EQ(store.get("map:e", { b("k") })[0], b("secret"));
    EXPECT_THROW(Store(path, Bytes(31, 7)), std::invalid_argument);
}

// A database as the browser store left it: its own slot strings and ohash digests in `hash`.
TEST(KvStore, OpensTheBrowserStoresDatabases)
{
    TempDir dir;
    auto path = dir.file("browser.sqlite");
    raw_exec(path, R"(
      CREATE TABLE data (slot TEXT NOT NULL PRIMARY KEY, container TEXT NOT NULL, key BLOB NOT NULL,
        key_count INTEGER NOT NULL, hash TEXT NOT NULL, value BLOB) WITHOUT ROWID;
      CREATE INDEX idx_container_key ON data(container, key);
      CREATE UNIQUE INDEX idx_container_key_count ON data(container, key, key_count);
      CREATE UNIQUE INDEX idx_container_key_hash ON data(container, key, hash);
      INSERT INTO data VALUES ('map:m:slot:k:0', 'map:m', x'6b', 1, 'ohashA', x'76');
      INSERT INTO data VALUES ('map:mm:slot:k:0', 'map:mm', x'6b', 1, 'ohashX', x'78');
      INSERT INTO data VALUES ('map:mm:slot:k:1', 'map:mm', x'6b', 2, 'ohashY', x'79');
    )");
    Store store(path, std::nullopt);
    EXPECT_EQ(store.get("map:m", { b("k") })[0], b("v"));
    // Its multimap values are identified by value again: dedup and DeleteValue see them.
    EXPECT_EQ(store.append("map:mm", b("k"), { b("x") }, true), 2U);
    store.delete_value("map:mm", b("k"), b("y"));
    EXPECT_EQ(store.values("map:mm", b("k")), (std::vector<Bytes>{ b("x") }));
    // A put replaces the entry the browser store wrote, under its slot string or not.
    store.put("map:m", b("k"), b("v2"));
    EXPECT_EQ(store.count("map:m", std::nullopt), 1U);
    EXPECT_EQ(store.get("map:m", { b("k") })[0], b("v2"));
}

TEST(KvStore, ValueHashIsSha256Hex)
{
    auto abc = b("abc");
    EXPECT_EQ(value_hash(abc.data(), abc.size()), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
}
