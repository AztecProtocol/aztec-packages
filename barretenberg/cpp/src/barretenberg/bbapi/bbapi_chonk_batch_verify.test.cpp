#ifndef __wasm__
#include "barretenberg/bbapi/bbapi_chonk.hpp"
#include "barretenberg/bbapi/bbapi_handlers.hpp"
#include "barretenberg/bbapi/bbapi_wire_convert.hpp"
#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/chonk/mock_circuit_producer.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/test.hpp"

#include <condition_variable>
#include <map>
#include <mutex>
#include <optional>

using namespace bb;
using namespace bb::bbapi;

namespace {

constexpr size_t SMALL_LOG_2_NUM_GATES = 5;

struct Reply {
    std::string type;
    wire::BbChonkBatchVerifierVerifyResponse response{};
    std::string error;
};

Reply decode(const std::vector<uint8_t>& raw)
{
    auto handle = msgpack::unpack(reinterpret_cast<const char*>(raw.data()), raw.size());
    const auto& parts = handle.get().via.array;
    Reply reply;
    parts.ptr[0].convert(reply.type);
    if (reply.type == "BbChonkBatchVerifierVerifyResponse") {
        parts.ptr[1].convert(reply.response);
    } else {
        std::map<std::string, std::string> error;
        parts.ptr[1].convert(error);
        reply.error = error["message"];
    }
    return reply;
}

std::vector<uint8_t> verify_request(const std::vector<bb::fr>& proof_fields)
{
    msgpack::sbuffer buf;
    msgpack::packer<msgpack::sbuffer> pk(buf);
    pk.pack_array(1);
    pk.pack_array(2);
    pk.pack(std::string("BbChonkBatchVerifierVerify"));
    pk.pack(wire::BbChonkBatchVerifierVerify{ .vk_index = 0, .proof_fields = fr_vec_to_wire(proof_fields) });
    return { buf.data(), buf.data() + buf.size() };
}

/** The response to one request, which may arrive later and from another thread. */
class PendingReply {
  public:
    RawRespond sink()
    {
        return [this](std::vector<uint8_t> raw) {
            std::lock_guard lock(mutex_);
            reply_ = decode(raw);
            cv_.notify_all();
        };
    }

    Reply wait()
    {
        std::unique_lock lock(mutex_);
        cv_.wait(lock, [this] { return reply_.has_value(); });
        return *reply_;
    }

  private:
    std::mutex mutex_;
    std::condition_variable cv_;
    std::optional<Reply> reply_;
};

} // namespace

class ChonkBatchVerifierVerifyTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    static std::pair<ChonkProof, std::shared_ptr<MegaZKFlavor::VKAndHash>> generate_chonk_proof()
    {
        PrivateFunctionExecutionMockCircuitProducer circuit_producer(/*num_app_circuits=*/1);
        Chonk ivc{ circuit_producer.circuit_kinds() };
        TestSettings settings{ .log2_num_gates = SMALL_LOG_2_NUM_GATES };
        for (size_t j = 0; j < circuit_producer.total_num_circuits; ++j) {
            circuit_producer.construct_and_accumulate_next_circuit(ivc, settings);
        }
        return { ivc.prove(), ivc.get_hiding_kernel_vk_and_hash() };
    }

    /** A request context with a batch verifier service started without a result FIFO. */
    static BBApiRequest context_with_service(std::shared_ptr<MegaZKFlavor::VKAndHash> vk, bool deferred_responses)
    {
        BBApiRequest ctx;
        ctx.deferred_responses = deferred_responses;
        ctx.batch_verifier_service = std::make_shared<ChonkBatchVerifierService>();
        ctx.batch_verifier_service->start({ std::move(vk) }, /*num_cores=*/2, /*batch_size=*/2, /*fifo_path=*/"");
        return ctx;
    }
};

TEST_F(ChonkBatchVerifierVerifyTests, RespondsWithEachProofsVerdictOnceChecked)
{
    BB_DISABLE_ASSERTS();
    auto [good_proof, vk] = generate_chonk_proof();
    ChonkProof tampered_proof = good_proof;
    tampered_proof.ipa_proof[0] = tampered_proof.ipa_proof[0] + bb::fr(1);

    BBApiRequest ctx = context_with_service(vk, /*deferred_responses=*/true);
    auto handler = make_bb_handler(ctx);

    PendingReply good;
    PendingReply tampered;
    PendingReply malformed;
    handler(verify_request(good_proof.to_field_elements()), good.sink());
    handler(verify_request(tampered_proof.to_field_elements()), tampered.sink());
    handler(verify_request({}), malformed.sink());

    for (auto* pending : { &good, &tampered, &malformed }) {
        Reply reply = pending->wait();
        ASSERT_EQ(reply.type, "BbChonkBatchVerifierVerifyResponse") << reply.error;
    }
    EXPECT_TRUE(good.wait().response.verified);
    EXPECT_FALSE(tampered.wait().response.verified);
    EXPECT_FALSE(malformed.wait().response.verified);

    ctx.batch_verifier_service->stop();
}

TEST_F(ChonkBatchVerifierVerifyTests, NeedsAServerThatCanRespondLater)
{
    auto [proof, vk] = generate_chonk_proof();
    BBApiRequest ctx = context_with_service(vk, /*deferred_responses=*/false);
    auto handler = make_bb_handler(ctx);

    PendingReply reply;
    handler(verify_request(proof.to_field_elements()), reply.sink());

    EXPECT_EQ(reply.wait().type, "BbErrorResponse");
    EXPECT_NE(reply.wait().error.find("--reactor"), std::string::npos) << reply.wait().error;
    ctx.batch_verifier_service->stop();
}

TEST_F(ChonkBatchVerifierVerifyTests, ResultFifoAndPerProofResponsesDoNotMix)
{
    auto [proof, vk] = generate_chonk_proof();

    // Started without a FIFO: queueing for the FIFO is refused, as its results would go nowhere.
    BBApiRequest without_fifo = context_with_service(vk, /*deferred_responses=*/true);
    EXPECT_THROW(
        (ChonkBatchVerifierQueue{ .request_id = 1, .vk_index = 0, .proof_fields = proof.to_field_elements() }.execute(
            without_fifo)),
        std::runtime_error);
    without_fifo.batch_verifier_service->stop();

    // Started with a FIFO: per-proof responses are refused, as the results go to the FIFO.
    BBApiRequest with_fifo;
    with_fifo.deferred_responses = true;
    with_fifo.batch_verifier_service = std::make_shared<ChonkBatchVerifierService>();
    with_fifo.batch_verifier_service->start({ vk }, /*num_cores=*/1, /*batch_size=*/1, "/nonexistent/results.fifo");
    auto handler = make_bb_handler(with_fifo);
    PendingReply reply;
    handler(verify_request(proof.to_field_elements()), reply.sink());
    EXPECT_EQ(reply.wait().type, "BbErrorResponse");
    with_fifo.batch_verifier_service->stop();
}
#endif
