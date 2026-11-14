/**
 * @file wsdb_init.test.cpp
 * @brief aztec-wsdb started without a genesis takes it from Init, once.
 */
// The world state before the generated wire types: both declare MerkleTreeId, and the wire one must not be found
// first while the world state headers are parsed.
#include "wsdb/wsdb_service.hpp"

#include "common/aztec_constants.hpp"
#include "world_state/test_genesis.hpp"
#include "wsdb/generated/wsdb_client.hpp"
#include "wsdb/generated/wsdb_types.hpp"

#include <gtest/gtest.h>

#include <filesystem>
#include <functional>
#include <sstream>
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

std::string hex(const fr& value)
{
    std::ostringstream out;
    out << value;
    return out.str().substr(2);
}

// One genesis, as Init and as the options that give the same one.
constexpr uint64_t NULLIFIER_PREFILL = 128;
constexpr uint64_t PUBLIC_DATA_PREFILL = 64;
constexpr uint64_t TIMESTAMP = 1234;

wire::WsdbInit genesis_init()
{
    wire::WsdbInit init{ .treeHeights = { { .treeId = 0, .height = NULLIFIER_TREE_HEIGHT },
                                          { .treeId = 1, .height = NOTE_HASH_TREE_HEIGHT },
                                          { .treeId = 2, .height = PUBLIC_DATA_TREE_HEIGHT },
                                          { .treeId = 3, .height = L1_TO_L2_MSG_TREE_HEIGHT },
                                          { .treeId = 4, .height = ARCHIVE_HEIGHT } },
                         .treePrefill = { { .treeId = 0, .size = NULLIFIER_PREFILL },
                                          { .treeId = 2, .size = PUBLIC_DATA_PREFILL } },
                         .prefilledPublicData = { { .slot = wire_fr<wire::PublicDataSlot>(fr(1000)),
                                                   .value = wire_fr<wire::PublicDataValue>(fr(7)) } },
                         .prefilledNullifiers = {},
                         .genesisTimestamp = TIMESTAMP,
                         .initialHeaderGeneratorPoint = static_cast<uint32_t>(DOM_SEP__BLOCK_HEADER_HASH) };
    for (const auto& nullifier : world_state::test_genesis_nullifiers()) {
        init.prefilledNullifiers.push_back(wire_fr(nullifier));
    }
    return init;
}

WsdbConfig with_genesis_options(WsdbConfig config)
{
    std::ostringstream heights;
    heights << "{0:" << NULLIFIER_TREE_HEIGHT << ",1:" << NOTE_HASH_TREE_HEIGHT << ",2:" << PUBLIC_DATA_TREE_HEIGHT
            << ",3:" << L1_TO_L2_MSG_TREE_HEIGHT << ",4:" << ARCHIVE_HEIGHT << "}";
    config.tree_heights_json = heights.str();
    config.tree_prefill_json =
        "{0:" + std::to_string(NULLIFIER_PREFILL) + ",2:" + std::to_string(PUBLIC_DATA_PREFILL) + "}";
    config.initial_header_generator_point = static_cast<uint32_t>(DOM_SEP__BLOCK_HEADER_HASH);
    config.genesis_timestamp = TIMESTAMP;
    config.prefilled_public_data_json = "[[\"" + hex(fr(1000)) + "\",\"" + hex(fr(7)) + "\"]]";
    std::string nullifiers = "[";
    for (const auto& nullifier : world_state::test_genesis_nullifiers()) {
        nullifiers += (nullifiers.size() > 1 ? ",\"" : "\"") + hex(nullifier) + "\"";
    }
    config.prefilled_nullifiers_json = nullifiers + "]";
    return config;
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

    /** Resource options only, with stores in their own directory under this test's. */
    WsdbConfig config(const std::string& name) const
    {
        auto dir = root_ / name;
        std::filesystem::create_directories(dir);
        return WsdbConfig{ .data_dir = dir.string(), .threads = 2 };
    }

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

TEST_F(WsdbInitTest, InitGivesTheGenesisTheOptionsGive)
{
    WsdbService from_init(config("init"), []() { return false; });
    WsdbService from_options(with_genesis_options(config("options")), []() { return false; });
    Api init_api{ ServiceBackend(&from_init) };
    Api options_api{ ServiceBackend(&from_options) };

    init_api.init(genesis_init());

    EXPECT_EQ(init_api.get_initial_state_reference(), options_api.get_initial_state_reference());
    wire::WorldStateRevision latest{ .forkId = 0, .blockNumber = 0, .includeUncommitted = false };
    for (uint32_t tree = 0; tree <= 4; ++tree) {
        EXPECT_EQ(init_api.get_tree_info({ .treeId = tree, .revision = latest }),
                  options_api.get_tree_info({ .treeId = tree, .revision = latest }))
            << "tree " << tree;
    }
    EXPECT_EQ(init_api.get_state_reference({ .revision = latest }),
              options_api.get_state_reference({ .revision = latest }));
}

TEST_F(WsdbInitTest, RefusesCommandsBeforeInit)
{
    WsdbService service(config("service"), []() { return false; });
    Api api{ ServiceBackend(&service) };

    expect_error_containing([&] { api.get_initial_state_reference(); }, "send Init first");
    wire::WorldStateRevision latest{ .forkId = 0, .blockNumber = 0, .includeUncommitted = false };
    expect_error_containing([&] { api.get_tree_info({ .treeId = 0, .revision = latest }); }, "send Init first");

    api.init(genesis_init());
    api.get_initial_state_reference();
}

TEST_F(WsdbInitTest, InitIsSentOnce)
{
    WsdbService service(config("service"), []() { return false; });
    Api api{ ServiceBackend(&service) };
    api.init(genesis_init());
    auto genesis = api.get_initial_state_reference();

    expect_error_containing([&] { api.init(genesis_init()); }, "already has a world state");
    EXPECT_EQ(api.get_initial_state_reference(), genesis);
}

TEST_F(WsdbInitTest, ServiceStartedWithAGenesisRefusesInit)
{
    WsdbService service(with_genesis_options(config("service")), []() { return false; });
    Api api{ ServiceBackend(&service) };

    expect_error_containing([&] { api.init(genesis_init()); }, "already has a world state");
}

TEST_F(WsdbInitTest, GenesisOptionsNeedTreeHeights)
{
    WsdbConfig partial = with_genesis_options(config("service"));
    partial.tree_heights_json.clear();
    expect_error_containing([&] { WsdbService service(partial, []() { return false; }); }, "need --tree-heights");
}
