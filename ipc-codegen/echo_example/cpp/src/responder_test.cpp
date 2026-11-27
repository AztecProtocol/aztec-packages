// A handler's mistakes answer the caller once: a throw after answering sends
// nothing more, a second answer is ignored, and a responder dropped unanswered
// sends an error rather than leaving the caller waiting. Drives the generated
// dispatcher directly, with handlers that misbehave.
//
// Usage: responder_test

#include "generated/echo_dispatch.hpp"

#include <iostream>
#include <optional>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace echo {

struct FaultyCtx {
  std::optional<Responder<wire::EchoNestedResponse>> parked;
};

// Answers, then throws.
template <>
void handle_bytes(FaultyCtx & /*ctx*/, wire::EchoBytes &&cmd,
                  Responder<wire::EchoBytesResponse> respond) {
  respond.ok({.data = std::move(cmd.data)});
  throw std::runtime_error("after answering");
}

// Never answers.
template <>
void handle_fields(FaultyCtx & /*ctx*/, wire::EchoFields && /*cmd*/,
                   Responder<wire::EchoFieldsResponse> /*respond*/) {}

// Parks a copy of its responder for the test to answer later.
template <>
void handle_nested(FaultyCtx &ctx, wire::EchoNested && /*cmd*/,
                   Responder<wire::EchoNestedResponse> respond) {
  ctx.parked = respond;
}

// Answers twice.
template <>
void handle_fail(FaultyCtx & /*ctx*/, wire::EchoFail &&cmd,
                 Responder<wire::EchoFailResponse> respond) {
  respond.error(cmd.message);
  respond.error("a second answer");
}

template <>
void handle_aliases(FaultyCtx & /*ctx*/, wire::EchoAliases && /*cmd*/,
                    Responder<wire::EchoAliasesResponse> respond) {
  respond.error("unused");
}

template <>
void handle_blobs(FaultyCtx & /*ctx*/, wire::EchoBlobs && /*cmd*/,
                  Responder<wire::EchoBlobsResponse> respond) {
  respond.error("unused");
}

template <>
void handle_relay(FaultyCtx & /*ctx*/, wire::EchoRelay && /*cmd*/,
                  Responder<wire::EchoRelayResponse> respond) {
  respond.error("unused");
}

} // namespace echo

namespace {

int g_fail = 0;

void check(bool ok, const std::string &label) {
  std::cerr << (ok ? "  PASS: " : "  FAIL: ") << label << "\n";
  if (!ok)
    g_fail++;
}

template <typename Cmd> std::vector<uint8_t> request(const Cmd &cmd) {
  msgpack::sbuffer buf;
  msgpack::packer<msgpack::sbuffer> pk(buf);
  pk.pack_array(1);
  pk.pack_array(2);
  pk.pack(std::string(Cmd::MSGPACK_SCHEMA_NAME));
  pk.pack(cmd);
  return {buf.data(), buf.data() + buf.size()};
}

struct Answer {
  std::string name;
  std::string message; // an error's message
};

Answer decode(const std::vector<uint8_t> &frame) {
  auto handle = msgpack::unpack(reinterpret_cast<const char *>(frame.data()),
                                frame.size());
  const auto &outer = handle.get().via.array;
  Answer answer{.name = outer.ptr[0].as<std::string>(), .message = ""};
  if (answer.name == "EchoErrorResponse") {
    answer.message =
        outer.ptr[1].as<std::map<std::string, std::string>>()["message"];
  }
  return answer;
}

// Every frame sent for one request, decoded.
template <typename Cmd>
std::vector<Answer> dispatch(echo::FaultyCtx &ctx, const Cmd &cmd) {
  auto handler = echo::make_echo_handler(ctx);
  auto answers = std::make_shared<std::vector<Answer>>();
  handler(request(cmd), [answers](std::vector<uint8_t> frame) {
    answers->push_back(decode(frame));
  });
  return *answers;
}

} // namespace

int main() {
  echo::FaultyCtx ctx;

  {
    auto answers = dispatch(ctx, echo::wire::EchoBytes{.data = {1, 2, 3}});
    check(answers.size() == 1 && answers[0].name == "EchoBytesResponse",
          "a throw after answering sends nothing more");
  }
  {
    auto answers = dispatch(ctx, echo::wire::EchoFields{});
    check(answers.size() == 1 && answers[0].name == "EchoErrorResponse" &&
              answers[0].message.find(
                  "dropped its responder without answering") !=
                  std::string::npos,
          "an unanswered responder answers with an error");
  }
  {
    auto answers = dispatch(ctx, echo::wire::EchoFail{.message = "first"});
    check(answers.size() == 1 && answers[0].message == "first",
          "a second answer is ignored");
  }
  {
    auto answers = std::make_shared<std::vector<Answer>>();
    auto handler = echo::make_echo_handler(ctx);
    handler(request(echo::wire::EchoNested{}),
            [answers](std::vector<uint8_t> frame) {
              answers->push_back(decode(frame));
            });
    check(answers->empty(), "a parked copy keeps the request open");
    ctx.parked->ok({});
    ctx.parked.reset();
    check(answers->size() == 1 && (*answers)[0].name == "EchoNestedResponse",
          "the parked copy answers, once");
  }

  if (g_fail > 0) {
    std::cerr << g_fail << " check(s) failed\n";
    return 1;
  }
  std::cerr << "all checks passed\n";
  return 0;
}
