#if !defined(__wasm__) && !defined(_WIN32)
#include "barretenberg/api/api_msgpack.hpp"
#include "barretenberg/bbapi/bbapi_chonk.hpp"
#include "barretenberg/bbapi/bbapi_handlers.hpp"
#include "barretenberg/bbapi/bbapi_wire_convert.hpp"
#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/chonk/mock_circuit_producer.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/test.hpp"
#include "ipc_runtime/ipc_client.hpp"
#include "ipc_runtime/ipc_server.hpp"

#include <map>
#include <thread>
#include <unistd.h>

using namespace bb;
using namespace bb::bbapi;

namespace {

constexpr uint64_t RECEIVE_TIMEOUT_NS = 600ULL * 1000 * 1000 * 1000;

template <typename Cmd> std::vector<uint8_t> request_bytes(const std::string& name, const Cmd& cmd)
{
    msgpack::sbuffer buf;
    msgpack::packer<msgpack::sbuffer> pk(buf);
    pk.pack_array(1);
    pk.pack_array(2);
    pk.pack(name);
    pk.pack(cmd);
    return { buf.data(), buf.data() + buf.size() };
}

/** A response's variant name and its still-encoded payload. */
struct Response {
    std::string type;
    std::vector<uint8_t> raw;

    template <typename T> T payload() const
    {
        auto handle = msgpack::unpack(reinterpret_cast<const char*>(raw.data()), raw.size());
        T value;
        handle.get().via.array.ptr[1].convert(value);
        return value;
    }
};

Response decode(std::span<const uint8_t> raw)
{
    Response response{ .raw = { raw.begin(), raw.end() } };
    auto handle = msgpack::unpack(reinterpret_cast<const char*>(raw.data()), raw.size());
    handle.get().via.array.ptr[0].convert(response.type);
    return response;
}

} // namespace

class MsgpackReactorTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    static std::pair<ChonkProof, std::shared_ptr<MegaZKFlavor::VKAndHash>> generate_chonk_proof()
    {
        PrivateFunctionExecutionMockCircuitProducer circuit_producer(/*num_app_circuits=*/1);
        Chonk ivc{ circuit_producer.circuit_kinds() };
        TestSettings settings{ .log2_num_gates = 5 };
        for (size_t j = 0; j < circuit_producer.total_num_circuits; ++j) {
            circuit_producer.construct_and_accumulate_next_circuit(ivc, settings);
        }
        return { ivc.prove(), ivc.get_hiding_kernel_vk_and_hash() };
    }

    void SetUp() override
    {
        socket_path_ = "/tmp/bb-reactor-test-" + std::to_string(getpid()) + ".sock";
        server_ = ipc::IpcServer::create_socket(socket_path_, /*max_clients=*/1);
        ASSERT_TRUE(server_->listen());
        serving_ = std::thread([this] { serve_msgpack_reactor(*server_, request_); });
        client_ = ipc::IpcClient::create_socket(socket_path_);
        ASSERT_TRUE(client_->connect());
    }

    void TearDown() override
    {
        client_->close();
        server_->request_shutdown();
        serving_.join();
        server_->close();
    }

    void send(uint64_t id, const std::vector<uint8_t>& bytes)
    {
        ASSERT_TRUE(client_->send(id, bytes.data(), bytes.size(), RECEIVE_TIMEOUT_NS));
    }

    std::pair<uint64_t, Response> receive()
    {
        uint64_t id = 0;
        auto raw = client_->receive(RECEIVE_TIMEOUT_NS, id);
        BB_ASSERT(raw.data() != nullptr, "no response");
        Response response = decode(raw);
        client_->release(raw.size());
        return { id, std::move(response) };
    }

    std::string socket_path_;
    std::unique_ptr<ipc::IpcServer> server_;
    BBApiRequest request_;
    std::thread serving_;
    std::unique_ptr<ipc::IpcClient> client_;
};

TEST_F(MsgpackReactorTests, AnswersPipelinedProofsWithTheirVerdictsWithoutHoldingUpOtherCommands)
{
    BB_DISABLE_ASSERTS();
    auto [good_proof, vk] = generate_chonk_proof();
    ChonkProof tampered_proof = good_proof;
    tampered_proof.ipa_proof[0] = tampered_proof.ipa_proof[0] + bb::fr(1);

    send(1,
         request_bytes("BbChonkBatchVerifierStart",
                       wire::BbChonkBatchVerifierStart{
                           .vks = { to_buffer(*vk->vk) }, .num_cores = 2, .batch_size = 2, .fifo_path = "" }));
    auto [start_id, started] = receive();
    ASSERT_EQ(start_id, 1U);
    ASSERT_EQ(started.type, "BbChonkBatchVerifierStartResponse");

    // Proofs 10-14, all in flight at once; 12 is tampered. Then a hash, sent last.
    for (uint64_t id = 10; id <= 14; ++id) {
        const ChonkProof& proof = id == 12 ? tampered_proof : good_proof;
        send(id,
             request_bytes("BbChonkBatchVerifierVerify",
                           wire::BbChonkBatchVerifierVerify{
                               .vk_index = 0, .proof_fields = fr_vec_to_wire(proof.to_field_elements()) }));
    }
    send(20, request_bytes("BbPoseidon2Hash", wire::BbPoseidon2Hash{ .inputs = fr_vec_to_wire({ bb::fr(1) }) }));

    std::vector<uint64_t> order;
    std::map<uint64_t, Response> responses;
    for (size_t i = 0; i < 6; ++i) {
        auto [id, response] = receive();
        order.push_back(id);
        responses.emplace(id, std::move(response));
    }

    // The hash isn't held up behind proofs still being checked.
    EXPECT_EQ(order.front(), 20U);
    EXPECT_EQ(responses.at(20).type, "BbPoseidon2HashResponse");
    for (uint64_t id = 10; id <= 14; ++id) {
        ASSERT_EQ(responses.at(id).type, "BbChonkBatchVerifierVerifyResponse") << "request " << id;
        EXPECT_EQ(responses.at(id).payload<wire::BbChonkBatchVerifierVerifyResponse>().verified, id != 12)
            << "request " << id;
    }
}

TEST_F(MsgpackReactorTests, AnUnregisteredKeyIsAnErrorNotAVerdict)
{
    auto [proof, vk] = generate_chonk_proof();
    send(1,
         request_bytes("BbChonkBatchVerifierStart",
                       wire::BbChonkBatchVerifierStart{
                           .vks = { to_buffer(*vk->vk) }, .num_cores = 1, .batch_size = 1, .fifo_path = "" }));
    ASSERT_EQ(receive().second.type, "BbChonkBatchVerifierStartResponse");

    send(2,
         request_bytes("BbChonkBatchVerifierVerify",
                       wire::BbChonkBatchVerifierVerify{ .vk_index = 7,
                                                         .proof_fields = fr_vec_to_wire(proof.to_field_elements()) }));
    EXPECT_EQ(receive().second.type, "BbErrorResponse");
}

TEST_F(MsgpackReactorTests, StoppingAnswersQueuedProofsAsUncheckedRatherThanCheckingThemAll)
{
    auto [proof, vk] = generate_chonk_proof();
    send(1,
         request_bytes("BbChonkBatchVerifierStart",
                       wire::BbChonkBatchVerifierStart{
                           .vks = { to_buffer(*vk->vk) }, .num_cores = 1, .batch_size = 1, .fifo_path = "" }));
    ASSERT_EQ(receive().second.type, "BbChonkBatchVerifierStartResponse");

    // One proof per batch, so most of these are still queued when the stop arrives.
    constexpr uint64_t NUM_PROOFS = 8;
    for (uint64_t id = 10; id < 10 + NUM_PROOFS; ++id) {
        send(id,
             request_bytes("BbChonkBatchVerifierVerify",
                           wire::BbChonkBatchVerifierVerify{
                               .vk_index = 0, .proof_fields = fr_vec_to_wire(proof.to_field_elements()) }));
    }
    send(2, request_bytes("BbChonkBatchVerifierStop", wire::BbChonkBatchVerifierStop{}));

    size_t verified = 0;
    size_t unchecked = 0;
    bool stopped = false;
    for (size_t i = 0; i < NUM_PROOFS + 1; ++i) {
        auto [id, response] = receive();
        if (id == 2) {
            stopped = response.type == "BbChonkBatchVerifierStopResponse";
        } else if (response.type == "BbChonkBatchVerifierVerifyResponse") {
            EXPECT_TRUE(response.payload<wire::BbChonkBatchVerifierVerifyResponse>().verified);
            ++verified;
        } else {
            EXPECT_EQ(response.type, "BbErrorResponse");
            ++unchecked;
        }
    }
    EXPECT_TRUE(stopped);
    EXPECT_EQ(verified + unchecked, NUM_PROOFS);
    EXPECT_GT(unchecked, 0U);
}
#endif
