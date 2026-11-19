/**
 * @file hermes_host.cpp
 * @brief A minimal React Native stand-in for testing off-device: Hermes, an event loop (tasks posted from any
 * thread, timers, microtasks), print(), readFile(), and what @aztec-foundation/react-native installs into an app
 * (aztec::react_native::install), with the app's data directory at $AZTEC_RN_DATA_DIR.
 *
 * Usage: hermes_host <script.js> [args...]. The script ends the process with exit(code).
 */
#include "../cpp/aztec_react_native.hpp"

#include <hermes/hermes.h>

#include <chrono>
#include <condition_variable>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <deque>
#include <fstream>
#include <functional>
#include <iostream>
#include <map>
#include <memory>
#include <mutex>
#include <netdb.h>
#include <optional>
#include <sstream>
#include <string>
#include <sys/socket.h>
#include <thread>
#include <unistd.h>
#include <utility>
#include <vector>

namespace jsi = facebook::jsi;

namespace {

class EventLoop {
  public:
    using Task = std::function<void(jsi::Runtime&)>;

    void post(Task task)
    {
        {
            std::lock_guard<std::mutex> lock(mutex_);
            tasks_.push_back(std::move(task));
        }
        ready_.notify_one();
    }

    /** Adds a timer; returns its id. */
    double add_timer(std::shared_ptr<jsi::Function> fn, double delay_ms)
    {
        auto id = next_timer_++;
        timers_.emplace(std::chrono::steady_clock::now() + std::chrono::microseconds(int64_t(delay_ms * 1000)),
                        std::make_pair(id, std::move(fn)));
        return double(id);
    }

    void clear_timer(double id)
    {
        for (auto it = timers_.begin(); it != timers_.end(); ++it) {
            if (double(it->second.first) == id) {
                timers_.erase(it);
                return;
            }
        }
    }

    /** Runs until exit() is called; returns its code. */
    int run(jsi::Runtime& rt)
    {
        auto deadline = std::chrono::steady_clock::now() + std::chrono::minutes(30);
        while (!exit_code_) {
            rt.drainMicrotasks();
            if (exit_code_) {
                break;
            }
            std::optional<Task> task;
            {
                std::unique_lock<std::mutex> lock(mutex_);
                auto wake = timers_.empty() ? deadline : std::min(deadline, timers_.begin()->first);
                ready_.wait_until(lock, wake, [this] { return !tasks_.empty(); });
                if (!tasks_.empty()) {
                    task = std::move(tasks_.front());
                    tasks_.pop_front();
                }
            }
            if (task) {
                (*task)(rt);
                continue;
            }
            auto now = std::chrono::steady_clock::now();
            if (!timers_.empty() && timers_.begin()->first <= now) {
                auto fn = timers_.begin()->second.second;
                timers_.erase(timers_.begin());
                fn->call(rt);
                continue;
            }
            if (now >= deadline) {
                std::cerr << "hermes_host: timed out\n";
                return 124;
            }
        }
        return *exit_code_;
    }

    void exit(int code) { exit_code_ = code; }

  private:
    std::mutex mutex_;
    std::condition_variable ready_;
    std::deque<Task> tasks_;
    std::multimap<std::chrono::steady_clock::time_point, std::pair<uint64_t, std::shared_ptr<jsi::Function>>> timers_;
    uint64_t next_timer_ = 1;
    std::optional<int> exit_code_;
};

class FileBuffer final : public jsi::MutableBuffer {
  public:
    explicit FileBuffer(std::string bytes)
        : bytes_(std::move(bytes))
    {}
    size_t size() const override { return bytes_.size(); }
    uint8_t* data() override { return reinterpret_cast<uint8_t*>(bytes_.data()); }

  private:
    std::string bytes_;
};

struct HttpResponse {
    int status = 0;
    std::string headers;
    std::string body;
    std::string error;
};

/** A plain-HTTP/1.1 request (the test host's stand-in for React Native's networking; no TLS). */
HttpResponse http_request(const std::string& method,
                          const std::string& url,
                          const std::vector<std::pair<std::string, std::string>>& headers,
                          const std::string& body)
{
    HttpResponse response;
    const std::string scheme = "http://";
    if (url.rfind(scheme, 0) != 0) {
        response.error = "only http:// URLs are supported by the test host: " + url;
        return response;
    }
    auto rest = url.substr(scheme.size());
    auto slash = rest.find('/');
    auto authority = rest.substr(0, slash);
    auto path = slash == std::string::npos ? "/" : rest.substr(slash);
    auto colon = authority.rfind(':');
    auto host = colon == std::string::npos ? authority : authority.substr(0, colon);
    auto port = colon == std::string::npos ? "80" : authority.substr(colon + 1);

    addrinfo hints{};
    hints.ai_family = AF_UNSPEC;
    hints.ai_socktype = SOCK_STREAM;
    addrinfo* addresses = nullptr;
    if (getaddrinfo(host.c_str(), port.c_str(), &hints, &addresses) != 0) {
        response.error = "cannot resolve " + host;
        return response;
    }
    int fd = -1;
    for (auto* a = addresses; a != nullptr; a = a->ai_next) {
        fd = ::socket(a->ai_family, a->ai_socktype, a->ai_protocol);
        if (fd >= 0 && ::connect(fd, a->ai_addr, a->ai_addrlen) == 0) {
            break;
        }
        if (fd >= 0) {
            ::close(fd);
            fd = -1;
        }
    }
    freeaddrinfo(addresses);
    if (fd < 0) {
        response.error = "cannot connect to " + authority;
        return response;
    }
    std::string request = method + " " + path + " HTTP/1.1\r\nHost: " + authority + "\r\nConnection: close\r\n";
    for (const auto& [name, value] : headers) {
        request += name + ": " + value + "\r\n";
    }
    request += "Content-Length: " + std::to_string(body.size()) + "\r\n\r\n" + body;
    for (size_t sent = 0; sent < request.size();) {
        auto n = ::send(fd, request.data() + sent, request.size() - sent, MSG_NOSIGNAL);
        if (n <= 0) {
            ::close(fd);
            response.error = "send failed";
            return response;
        }
        sent += size_t(n);
    }
    std::string raw;
    char chunk[65536];
    for (ssize_t n = 0; (n = ::recv(fd, chunk, sizeof(chunk), 0)) > 0;) {
        raw.append(chunk, size_t(n));
    }
    ::close(fd);
    auto header_end = raw.find("\r\n\r\n");
    if (header_end == std::string::npos || raw.size() < 12) {
        response.error = "malformed HTTP response";
        return response;
    }
    response.status = std::atoi(raw.c_str() + 9);
    auto first_line_end = raw.find("\r\n");
    response.headers = raw.substr(first_line_end + 2, header_end - first_line_end - 2);
    auto payload = raw.substr(header_end + 4);
    std::string lower = response.headers;
    for (auto& c : lower) {
        c = char(std::tolower(static_cast<unsigned char>(c)));
    }
    if (lower.find("transfer-encoding: chunked") != std::string::npos) {
        std::string decoded;
        size_t pos = 0;
        while (pos < payload.size()) {
            auto line_end = payload.find("\r\n", pos);
            if (line_end == std::string::npos) {
                break;
            }
            auto size = std::stoul(payload.substr(pos, line_end - pos), nullptr, 16);
            if (size == 0) {
                break;
            }
            decoded.append(payload, line_end + 2, size);
            pos = line_end + 2 + size + 2;
        }
        payload = std::move(decoded);
    }
    response.body = std::move(payload);
    return response;
}

void define(jsi::Runtime& rt,
            const char* name,
            unsigned params,
            std::function<jsi::Value(jsi::Runtime&, const jsi::Value*, size_t)> fn)
{
    rt.global().setProperty(
        rt,
        name,
        jsi::Function::createFromHostFunction(
            rt,
            jsi::PropNameID::forAscii(rt, name),
            params,
            [fn = std::move(fn)](jsi::Runtime& rt, const jsi::Value&, const jsi::Value* args, size_t count) {
                return fn(rt, args, count);
            }));
}

} // namespace

int main(int argc, char** argv)
{
    if (argc < 2) {
        std::cerr << "usage: jsi_host <script.js> [args...]\n";
        return 2;
    }
    std::ifstream file(argv[1]);
    if (!file) {
        std::cerr << "hermes_host: cannot read " << argv[1] << "\n";
        return 2;
    }
    std::stringstream source;
    source << file.rdbuf();

    auto runtime =
        facebook::hermes::makeHermesRuntime(::hermes::vm::RuntimeConfig::Builder().withMicrotaskQueue(true).build());
    jsi::Runtime& rt = *runtime;
    EventLoop loop;

    define(rt, "print", 1, [](jsi::Runtime& rt, const jsi::Value* args, size_t count) {
        std::string line;
        for (size_t i = 0; i < count; i++) {
            line += (i ? " " : "") + args[i].toString(rt).utf8(rt);
        }
        std::cout << line << std::endl;
        return jsi::Value::undefined();
    });
    define(rt, "exit", 1, [&loop](jsi::Runtime&, const jsi::Value* args, size_t count) {
        loop.exit(count > 0 && args[0].isNumber() ? int(args[0].getNumber()) : 0);
        return jsi::Value::undefined();
    });
    define(rt, "setTimeout", 2, [&loop](jsi::Runtime& rt, const jsi::Value* args, size_t count) {
        auto fn = std::make_shared<jsi::Function>(args[0].getObject(rt).getFunction(rt));
        return jsi::Value(loop.add_timer(fn, count > 1 && args[1].isNumber() ? args[1].getNumber() : 0));
    });
    define(rt, "clearTimeout", 1, [&loop](jsi::Runtime&, const jsi::Value* args, size_t count) {
        if (count > 0 && args[0].isNumber()) {
            loop.clear_timer(args[0].getNumber());
        }
        return jsi::Value::undefined();
    });
    define(rt, "readFile", 1, [](jsi::Runtime& rt, const jsi::Value* args, size_t count) {
        auto path = count > 0 ? args[0].toString(rt).utf8(rt) : std::string();
        std::ifstream in(path, std::ios::binary);
        if (!in) {
            throw jsi::JSError(rt, "readFile: cannot read " + path);
        }
        std::stringstream bytes;
        bytes << in.rdbuf();
        jsi::ArrayBuffer buffer(rt, std::make_shared<FileBuffer>(bytes.str()));
        return rt.global().getPropertyAsFunction(rt, "Uint8Array").callAsConstructor(rt, buffer);
    });
    // httpRequest(method, url, [[name, value]...], body: string, callback(status, headers, body: Uint8Array, error))
    define(rt, "httpRequest", 5, [&loop](jsi::Runtime& rt, const jsi::Value* args, size_t count) {
        if (count < 5) {
            throw jsi::JSError(rt, "httpRequest(method, url, headers, body, callback)");
        }
        auto method = args[0].getString(rt).utf8(rt);
        auto url = args[1].getString(rt).utf8(rt);
        std::vector<std::pair<std::string, std::string>> headers;
        auto list = args[2].getObject(rt).getArray(rt);
        for (size_t i = 0; i < list.size(rt); i++) {
            auto pair = list.getValueAtIndex(rt, i).getObject(rt).getArray(rt);
            headers.emplace_back(pair.getValueAtIndex(rt, 0).getString(rt).utf8(rt),
                                 pair.getValueAtIndex(rt, 1).getString(rt).utf8(rt));
        }
        auto body = args[3].isString() ? args[3].getString(rt).utf8(rt) : std::string();
        auto callback = std::make_shared<jsi::Function>(args[4].getObject(rt).getFunction(rt));
        std::thread([&loop, method, url, headers, body, callback] {
            auto response = std::make_shared<HttpResponse>(http_request(method, url, headers, body));
            loop.post([response, callback](jsi::Runtime& rt) {
                jsi::ArrayBuffer buffer(rt, std::make_shared<FileBuffer>(std::move(response->body)));
                auto bytes = rt.global().getPropertyAsFunction(rt, "Uint8Array").callAsConstructor(rt, buffer);
                callback->call(rt,
                               jsi::Value(response->status),
                               jsi::String::createFromUtf8(rt, response->headers),
                               bytes,
                               response->error.empty() ? jsi::Value::undefined()
                                                       : jsi::Value(jsi::String::createFromUtf8(rt, response->error)));
            });
        }).detach();
        return jsi::Value::undefined();
    });
    jsi::Array script_args(rt, size_t(argc - 2));
    for (int i = 2; i < argc; i++) {
        script_args.setValueAtIndex(rt, size_t(i - 2), jsi::String::createFromUtf8(rt, argv[i]));
    }
    rt.global().setProperty(rt, "scriptArgs", script_args);

    const char* data_dir = std::getenv("AZTEC_RN_DATA_DIR");
    aztec::react_native::install(
        rt,
        [&loop](std::function<void(jsi::Runtime&)> task) { loop.post(std::move(task)); },
        data_dir != nullptr ? data_dir : "/tmp/aztec-rn-data");

    // HERMES_PROFILE=<file>: sample the JavaScript thread and write the samples there (a Chrome trace) at exit.
    const char* profile = std::getenv("HERMES_PROFILE");
    auto* hermes_api = jsi::castInterface<facebook::hermes::IHermesRootAPI>(facebook::hermes::makeHermesRootAPI());
    if (profile != nullptr) {
        hermes_api->enableSamplingProfiler(1000);
    }
    auto finish_profile = [&] {
        if (profile != nullptr) {
            hermes_api->disableSamplingProfiler();
            hermes_api->dumpSampledTraceToFile(profile);
        }
    };
    try {
        rt.evaluateJavaScript(std::make_shared<jsi::StringBuffer>(source.str()), argv[1]);
        int code = loop.run(rt);
        finish_profile();
        return code;
    } catch (const jsi::JSError& e) {
        std::cerr << "hermes_host: uncaught " << e.getMessage() << "\n" << e.getStack() << "\n";
        return 1;
    }
}
