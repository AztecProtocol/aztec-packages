/**
 * @file wsdb_init.test.cpp
 * @brief aztec-wsdb takes its genesis from Init, once.
 */
// The world state before the generated wire types: both declare MerkleTreeId, and the wire one must not be found
// first while the world state headers are parsed.
#include "wsdb/wsdb_service.hpp"

#include "common/aztec_constants.hpp"
#include "world_state/test_genesis.hpp"
#include "wsdb/generated/wsdb_client.hpp"
#include "wsdb/generated/wsdb_types.hpp"
#include "wsdb/wsdb_test_options.hpp"

#include <gtest/gtest.h>

#include <filesystem>
#include <functional>
#include <map>
#include <optional>
#include <string>
#include <unistd.h>
#include <vector>

using namespace azteclabs::wsdb;

namespace {

class ServiceBackend {
  public:
    explicit ServiceBackend(WsdbService* service)
        : service_(service)
    {}
    std::vector<uint8_t> call(std::span<const uint8_t> request) { return service_->call(request); }

  private:
    WsdbService* service_;
};

using Api = WsdbApi<ServiceBackend>;

template <typename W = wire::Fr> W wire_fr(const fr& value)
{
    W w{};
    fr::serialize_to_buffer(value, w.data());
    return w;
}

wire::WsdbInit genesis_init(std::optional<std::vector<uint8_t>> options)
{
    wire::WsdbInit init{ .treeHeights = { { .treeId = 0, .height = NULLIFIER_TREE_HEIGHT },
                                          { .treeId = 1, .height = NOTE_HASH_TREE_HEIGHT },
                                          { .treeId = 2, .height = PUBLIC_DATA_TREE_HEIGHT },
                                          { .treeId = 3, .height = L1_TO_L2_MSG_TREE_HEIGHT },
                                          { .treeId = 4, .height = ARCHIVE_HEIGHT } },
                         .treePrefill = { { .treeId = 0, .size = 128 }, { .treeId = 2, .size = 64 } },
                         .prefilledPublicData = { { .slot = wire_fr<wire::PublicDataSlot>(fr(1000)),
                                                    .value = wire_fr<wire::PublicDataValue>(fr(7)) } },
                         .prefilledNullifiers = {},
                         .genesisTimestamp = 1234,
                         .initialHeaderGeneratorPoint = static_cast<uint32_t>(DOM_SEP__BLOCK_HEADER_HASH) };
    for (const auto& nullifier : world_state::test_genesis_nullifiers()) {
        init.prefilledNullifiers.push_back(wire_fr(nullifier));
    }
    init.options = std::move(options);
    return init;
}

class WsdbInitTest : public ::testing::Test {
  protected:
    void SetUp() override
    {
        root_ =
            std::filesystem::temp_directory_path() / ("wsdb-init-" + std::to_string(getpid()) + "-" +
                                                      ::testing::UnitTest::GetInstance()->current_test_info()->name());
        std::filesystem::remove_all(root_);
    }
    void TearDown() override { std::filesystem::remove_all(root_); }

    /** A directory of its own under this test's. */
    std::string dir(const std::string& name) const
    {
        auto path = root_ / name;
        std::filesystem::create_directories(path);
        return path.string();
    }

    /** Init options with the stores in their own directory under this test's. */
    std::vector<uint8_t> options(const std::string& name) const { return test_support::wsdb_options(dir(name), 2); }

  private:
    std::filesystem::path root_;
};

void expect_error_containing(const std::function<void()>& call, const std::string& text)
{
    try {
        call();
        ADD_FAILURE() << "expected an error containing '" << text << "'";
    } catch (const std::exception& e) {
        EXPECT_NE(std::string(e.what()).find(text), std::string::npos) << e.what();
    }
}

} // namespace

TEST_F(WsdbInitTest, RefusesCommandsBeforeInit)
{
    WsdbService service;
    Api api{ ServiceBackend(&service) };

    expect_error_containing([&] { api.get_initial_state_reference(); }, "send Init first");
    wire::WorldStateRevision latest{ .forkId = 0, .blockNumber = 0, .includeUncommitted = false };
    expect_error_containing([&] { api.get_tree_info({ .treeId = 0, .revision = latest }); }, "send Init first");

    api.init(genesis_init(options("service")));
    api.get_initial_state_reference();
}

TEST_F(WsdbInitTest, InitIsSentOnce)
{
    WsdbService service;
    Api api{ ServiceBackend(&service) };
    api.init(genesis_init(options("service")));
    auto genesis = api.get_initial_state_reference();

    expect_error_containing([&] { api.init(genesis_init(options("service"))); }, "already has a world state");
    EXPECT_EQ(api.get_initial_state_reference(), genesis);
}

TEST_F(WsdbInitTest, RefusesOptionsItCannotRead)
{
    WsdbService service;
    Api api{ ServiceBackend(&service) };

    expect_error_containing([&] { api.init(genesis_init(std::nullopt)); }, "needs Init options");
    expect_error_containing([&] { api.init(genesis_init(std::vector<uint8_t>{ 0xc1 })); }, "not msgpack");
    msgpack::sbuffer unknown;
    msgpack::packer<msgpack::sbuffer>(unknown).pack(std::map<std::string, uint32_t>{ { "cacheSize", 4 } });
    expect_error_containing(
        [&] { api.init(genesis_init(std::vector<uint8_t>(unknown.data(), unknown.data() + unknown.size()))); },
        "unknown option cacheSize");
    expect_error_containing([&] { api.init(genesis_init(test_support::wsdb_options("", 2))); }, "dataDir");
    expect_error_containing([&] { api.init(genesis_init(test_support::wsdb_options(dir("stores"), 0))); },
                            "threads must be positive");
    expect_error_containing([&] { api.get_initial_state_reference(); }, "send Init first");

    // A refused Init leaves nothing behind: the next one opens the stores.
    api.init(genesis_init(options("stores")));
    api.get_initial_state_reference();
}
