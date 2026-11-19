#include "aztec_react_native.hpp"

#include "sha256.hpp"

#include <cerrno>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <dirent.h>
#include <fstream>
#include <memory>
#include <stdexcept>
#include <string>
#include <sys/stat.h>
#include <unistd.h>
#include <vector>

#if defined(__APPLE__) || defined(__ANDROID__)
#include <stdlib.h> // arc4random_buf
#else
#include <sys/random.h>
#endif

IPC_RUNTIME_JSI_DECLARE_FFI(kv_sqlite)

#ifdef AZTEC_REACT_NATIVE_LINKED_LIBRARIES
IPC_RUNTIME_JSI_DECLARE_FFI_WITH_HOST_CALLS(bb)
IPC_RUNTIME_JSI_DECLARE_FFI_WITH_HOST_CALLS(acvm)
#endif

namespace fj = facebook::jsi;

namespace aztec::react_native {

namespace {

class OwnedBuffer final : public fj::MutableBuffer {
  public:
    explicit OwnedBuffer(std::vector<uint8_t> bytes)
        : bytes_(std::move(bytes))
    {}
    size_t size() const override { return bytes_.size(); }
    uint8_t* data() override { return bytes_.data(); }

  private:
    std::vector<uint8_t> bytes_;
};

fj::Value uint8_array(fj::Runtime& rt, std::vector<uint8_t> bytes)
{
    fj::ArrayBuffer buffer(rt, std::make_shared<OwnedBuffer>(std::move(bytes)));
    return rt.global().getPropertyAsFunction(rt, "Uint8Array").callAsConstructor(rt, buffer);
}

/** The bytes a Uint8Array (or other view) covers, and where. */
std::pair<uint8_t*, size_t> view_of(fj::Runtime& rt, const fj::Value& value)
{
    if (!value.isObject()) {
        throw fj::JSError(rt, "expected a Uint8Array");
    }
    auto object = value.getObject(rt);
    auto buffer = object.getProperty(rt, "buffer").asObject(rt).getArrayBuffer(rt);
    auto offset = static_cast<size_t>(object.getProperty(rt, "byteOffset").asNumber());
    auto length = static_cast<size_t>(object.getProperty(rt, "byteLength").asNumber());
    if (offset + length > buffer.size(rt)) {
        throw fj::JSError(rt, "Uint8Array outside its buffer");
    }
    return { buffer.data(rt) + offset, length };
}

void make_dirs(const std::string& dir)
{
    for (size_t slash = dir.find('/', 1);; slash = dir.find('/', slash + 1)) {
        auto prefix = dir.substr(0, slash);
        if (::mkdir(prefix.c_str(), 0700) != 0 && errno != EEXIST) {
            throw std::runtime_error("cannot make directory " + prefix + ": " + std::strerror(errno));
        }
        if (slash == std::string::npos) {
            return;
        }
    }
}

double file_size(const std::string& path)
{
    struct stat st{};
    return ::stat(path.c_str(), &st) == 0 ? static_cast<double>(st.st_size) : -1.0;
}

std::vector<uint8_t> read_file(const std::string& path, double length)
{
    std::ifstream in(path, std::ios::binary);
    if (!in) {
        throw std::runtime_error("cannot read " + path);
    }
    std::vector<uint8_t> bytes;
    if (length >= 0) {
        bytes.resize(static_cast<size_t>(length));
        in.read(reinterpret_cast<char*>(bytes.data()), static_cast<std::streamsize>(bytes.size()));
        if (static_cast<size_t>(in.gcount()) != bytes.size()) {
            throw std::runtime_error(path + " is shorter than " + std::to_string(bytes.size()) + " bytes");
        }
    } else {
        bytes.assign(std::istreambuf_iterator<char>(in), std::istreambuf_iterator<char>());
    }
    return bytes;
}

/** Writes through a temporary file renamed into place, so a reader never sees half a file. */
void write_file(const std::string& path, const uint8_t* data, size_t length)
{
    auto slash = path.rfind('/');
    if (slash != std::string::npos && slash > 0) {
        make_dirs(path.substr(0, slash));
    }
    auto tmp = path + ".tmp" + std::to_string(::getpid());
    {
        std::ofstream out(tmp, std::ios::binary | std::ios::trunc);
        out.write(reinterpret_cast<const char*>(data), static_cast<std::streamsize>(length));
        if (!out) {
            std::remove(tmp.c_str());
            throw std::runtime_error("cannot write " + path);
        }
    }
    if (std::rename(tmp.c_str(), path.c_str()) != 0) {
        std::remove(tmp.c_str());
        throw std::runtime_error("cannot write " + path + ": " + std::strerror(errno));
    }
}

bool is_directory(const std::string& path)
{
    struct stat st{};
    return ::stat(path.c_str(), &st) == 0 && S_ISDIR(st.st_mode);
}

std::vector<std::string> list_directory(const std::string& path)
{
    std::vector<std::string> names;
    DIR* dir = ::opendir(path.c_str());
    if (dir == nullptr) {
        if (errno == ENOENT) {
            return names;
        }
        throw std::runtime_error("cannot list " + path + ": " + std::strerror(errno));
    }
    while (auto* entry = ::readdir(dir)) {
        std::string name = entry->d_name;
        if (name != "." && name != "..") {
            names.push_back(std::move(name));
        }
    }
    ::closedir(dir);
    return names;
}

void remove_directory(const std::string& path)
{
    for (const auto& name : list_directory(path)) {
        auto child = path + "/" + name;
        struct stat st{};
        if (::lstat(child.c_str(), &st) == 0 && S_ISDIR(st.st_mode)) {
            remove_directory(child);
        } else if (::unlink(child.c_str()) != 0 && errno != ENOENT) {
            throw std::runtime_error("cannot remove " + child + ": " + std::strerror(errno));
        }
    }
    if (::rmdir(path.c_str()) != 0 && errno != ENOENT) {
        throw std::runtime_error("cannot remove " + path + ": " + std::strerror(errno));
    }
}

void random_bytes(uint8_t* data, size_t length)
{
#if defined(__APPLE__) || defined(__ANDROID__)
    arc4random_buf(data, length);
#else
    while (length > 0) {
        auto got = ::getrandom(data, length, 0);
        if (got < 0) {
            if (errno == EINTR) {
                continue;
            }
            throw std::runtime_error(std::string("getrandom: ") + std::strerror(errno));
        }
        data += got;
        length -= static_cast<size_t>(got);
    }
#endif
}

/**
 * The UTF-8 in `data` with each maximal invalid subsequence replaced by U+FFFD, as TextDecoder does (WHATWG
 * Encoding), or an error at the first one when `fatal`.
 */
std::string sanitize_utf8(const uint8_t* data, size_t length, bool fatal)
{
    std::string out;
    out.reserve(length);
    size_t i = 0;
    while (i < length) {
        uint8_t b = data[i];
        if (b < 0x80) {
            out.push_back(char(b));
            i++;
            continue;
        }
        size_t need = 0;
        uint8_t lower = 0x80;
        uint8_t upper = 0xbf;
        if (b >= 0xc2 && b <= 0xdf) {
            need = 1;
        } else if (b >= 0xe0 && b <= 0xef) {
            need = 2;
            lower = b == 0xe0 ? 0xa0 : 0x80;
            upper = b == 0xed ? 0x9f : 0xbf;
        } else if (b >= 0xf0 && b <= 0xf4) {
            need = 3;
            lower = b == 0xf0 ? 0x90 : 0x80;
            upper = b == 0xf4 ? 0x8f : 0xbf;
        }
        size_t seen = 1;
        while (need > 0 && seen <= need && i + seen < length) {
            uint8_t c = data[i + seen];
            if (c < lower || c > upper) {
                break;
            }
            lower = 0x80;
            upper = 0xbf;
            seen++;
        }
        if (need == 0 || seen <= need) {
            if (fatal) {
                throw std::runtime_error("the encoded data was not valid utf-8");
            }
            out += "\xEF\xBF\xBD";
            i += seen;
            continue;
        }
        out.append(reinterpret_cast<const char*>(data + i), need + 1);
        i += need + 1;
    }
    return out;
}

constexpr char BASE64_ALPHABET[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

std::string base64_encode(const uint8_t* data, size_t length)
{
    std::string out;
    out.reserve((length + 2) / 3 * 4);
    size_t i = 0;
    for (; i + 2 < length; i += 3) {
        uint32_t n = uint32_t(data[i]) << 16 | uint32_t(data[i + 1]) << 8 | data[i + 2];
        out.push_back(BASE64_ALPHABET[n >> 18]);
        out.push_back(BASE64_ALPHABET[(n >> 12) & 63]);
        out.push_back(BASE64_ALPHABET[(n >> 6) & 63]);
        out.push_back(BASE64_ALPHABET[n & 63]);
    }
    if (i < length) {
        uint32_t n = uint32_t(data[i]) << 16 | (i + 1 < length ? uint32_t(data[i + 1]) << 8 : 0);
        out.push_back(BASE64_ALPHABET[n >> 18]);
        out.push_back(BASE64_ALPHABET[(n >> 12) & 63]);
        out.push_back(i + 1 < length ? BASE64_ALPHABET[(n >> 6) & 63] : '=');
        out.push_back('=');
    }
    return out;
}

/** Base64 (standard or URL alphabet) as Node's Buffer reads it: other characters are skipped, '=' ends it. */
std::vector<uint8_t> base64_decode(const std::string& text)
{
    std::vector<uint8_t> out;
    out.reserve(text.size() * 3 / 4);
    uint32_t acc = 0;
    int bits = 0;
    for (char c : text) {
        int v = 0;
        if (c >= 'A' && c <= 'Z') {
            v = c - 'A';
        } else if (c >= 'a' && c <= 'z') {
            v = c - 'a' + 26;
        } else if (c >= '0' && c <= '9') {
            v = c - '0' + 52;
        } else if (c == '+' || c == '-') {
            v = 62;
        } else if (c == '/' || c == '_') {
            v = 63;
        } else if (c == '=') {
            break;
        } else {
            continue;
        }
        acc = (acc << 6) | uint32_t(v);
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out.push_back(uint8_t(acc >> bits));
        }
    }
    return out;
}

using Body = std::function<fj::Value(fj::Runtime&, const fj::Value*, size_t)>;

void set_function(fj::Runtime& rt, fj::Object& target, const char* name, unsigned params, Body body)
{
    target.setProperty(
        rt,
        name,
        fj::Function::createFromHostFunction(
            rt,
            fj::PropNameID::forAscii(rt, name),
            params,
            [name, body = std::move(body)](fj::Runtime& rt, const fj::Value&, const fj::Value* args, size_t count) {
                try {
                    return body(rt, args, count);
                } catch (const fj::JSError&) {
                    throw;
                } catch (const std::exception& e) {
                    throw fj::JSError(rt, std::string(name) + ": " + e.what());
                }
            }));
}

std::string string_arg(fj::Runtime& rt, const fj::Value* args, size_t count, size_t i)
{
    if (i >= count || !args[i].isString()) {
        throw fj::JSError(rt, "expected a string argument");
    }
    return args[i].getString(rt).utf8(rt);
}

void install_files(fj::Runtime& rt, const std::string& data_dir)
{
    fj::Object api(rt);
    api.setProperty(rt, "dataDir", fj::String::createFromUtf8(rt, data_dir));
#if defined(__APPLE__)
    api.setProperty(rt, "platform", fj::String::createFromAscii(rt, "ios"));
#elif defined(__ANDROID__)
    api.setProperty(rt, "platform", fj::String::createFromAscii(rt, "android"));
#else
    api.setProperty(rt, "platform", fj::String::createFromAscii(rt, "other"));
#endif
    set_function(rt, api, "fileSize", 1, [](fj::Runtime& rt, const fj::Value* args, size_t count) {
        return fj::Value(file_size(string_arg(rt, args, count, 0)));
    });
    set_function(rt, api, "readFile", 2, [](fj::Runtime& rt, const fj::Value* args, size_t count) {
        double length = count > 1 && args[1].isNumber() ? args[1].getNumber() : -1;
        return uint8_array(rt, read_file(string_arg(rt, args, count, 0), length));
    });
    set_function(rt, api, "writeFile", 2, [](fj::Runtime& rt, const fj::Value* args, size_t count) {
        auto path = string_arg(rt, args, count, 0);
        if (count < 2) {
            throw fj::JSError(rt, "writeFile(path, data) expects the data");
        }
        auto [data, length] = view_of(rt, args[1]);
        write_file(path, data, length);
        return fj::Value::undefined();
    });
    set_function(rt, api, "isDirectory", 1, [](fj::Runtime& rt, const fj::Value* args, size_t count) {
        return fj::Value(is_directory(string_arg(rt, args, count, 0)));
    });
    set_function(rt, api, "listDirectory", 1, [](fj::Runtime& rt, const fj::Value* args, size_t count) {
        auto names = list_directory(string_arg(rt, args, count, 0));
        fj::Array result(rt, names.size());
        for (size_t i = 0; i < names.size(); i++) {
            result.setValueAtIndex(rt, i, fj::String::createFromUtf8(rt, names[i]));
        }
        return fj::Value(rt, result);
    });
    set_function(rt, api, "removeDirectory", 1, [](fj::Runtime& rt, const fj::Value* args, size_t count) {
        remove_directory(string_arg(rt, args, count, 0));
        return fj::Value::undefined();
    });
    set_function(rt, api, "removeFile", 1, [](fj::Runtime& rt, const fj::Value* args, size_t count) {
        std::remove(string_arg(rt, args, count, 0).c_str());
        return fj::Value::undefined();
    });
    // decodeUtf8(data: Uint8Array, fatal?: boolean): string; base64Encode(data): string; base64Decode(text):
    // Uint8Array. The `buffer` package and TextDecoder use them: their JavaScript versions are slow on Hermes.
    set_function(rt, api, "decodeUtf8", 2, [](fj::Runtime& rt, const fj::Value* args, size_t count) {
        if (count < 1) {
            throw fj::JSError(rt, "decodeUtf8 expects a Uint8Array");
        }
        auto [data, length] = view_of(rt, args[0]);
        bool fatal = count > 1 && args[1].isBool() && args[1].getBool();
        auto text = sanitize_utf8(data, length, fatal);
        return fj::Value(rt,
                         fj::String::createFromUtf8(rt, reinterpret_cast<const uint8_t*>(text.data()), text.size()));
    });
    set_function(rt, api, "base64Encode", 1, [](fj::Runtime& rt, const fj::Value* args, size_t count) {
        if (count < 1) {
            throw fj::JSError(rt, "base64Encode expects a Uint8Array");
        }
        auto [data, length] = view_of(rt, args[0]);
        return fj::Value(rt, fj::String::createFromAscii(rt, base64_encode(data, length)));
    });
    set_function(rt, api, "base64Decode", 1, [](fj::Runtime& rt, const fj::Value* args, size_t count) {
        return uint8_array(rt, base64_decode(string_arg(rt, args, count, 0)));
    });
    // sha256(data: Uint8Array | string): Uint8Array, a string hashed as its UTF-8.
    set_function(rt, api, "sha256", 1, [](fj::Runtime& rt, const fj::Value* args, size_t count) {
        if (count < 1) {
            throw fj::JSError(rt, "sha256 expects a Uint8Array or a string");
        }
        Sha256 hasher;
        if (args[0].isString()) {
            auto text = args[0].getString(rt).utf8(rt);
            hasher.update(reinterpret_cast<const uint8_t*>(text.data()), text.size());
        } else {
            auto [data, length] = view_of(rt, args[0]);
            hasher.update(data, length);
        }
        auto digest = hasher.finish();
        return uint8_array(rt, std::vector<uint8_t>(digest.begin(), digest.end()));
    });
    rt.global().setProperty(rt, "__aztecReactNative", api);
}

/** crypto.getRandomValues for runtimes without it (Hermes), filling the array in place as the web's does. */
void install_crypto(fj::Runtime& rt)
{
    auto global = rt.global();
    auto crypto_value = global.getProperty(rt, "crypto");
    if (crypto_value.isObject() && crypto_value.getObject(rt).getProperty(rt, "getRandomValues").isObject()) {
        return;
    }
    fj::Object crypto = crypto_value.isObject() ? crypto_value.getObject(rt) : fj::Object(rt);
    set_function(rt, crypto, "getRandomValues", 1, [](fj::Runtime& rt, const fj::Value* args, size_t count) {
        if (count < 1) {
            throw fj::JSError(rt, "getRandomValues expects a typed array");
        }
        auto [data, length] = view_of(rt, args[0]);
        if (length > 65536) {
            throw fj::JSError(rt, "getRandomValues: more than 65536 bytes requested");
        }
        random_bytes(data, length);
        return fj::Value(rt, args[0]);
    });
    global.setProperty(rt, "crypto", crypto);
}

} // namespace

void install(fj::Runtime& runtime, ::ipc::jsi::RunOnJs run_on_js, const std::string& data_dir)
{
#ifdef AZTEC_REACT_NATIVE_LINKED_LIBRARIES
    ::ipc::jsi::register_ffi("bb", IPC_RUNTIME_JSI_SYMBOLS_WITH_HOST_CALLS(bb));
    ::ipc::jsi::register_ffi("acvm", IPC_RUNTIME_JSI_SYMBOLS_WITH_HOST_CALLS(acvm));
#endif
    ::ipc::jsi::register_ffi("kv_sqlite", IPC_RUNTIME_JSI_SYMBOLS(kv_sqlite));
    ::ipc::jsi::install(runtime, std::move(run_on_js));
    install_files(runtime, data_dir);
    install_crypto(runtime);
}

} // namespace aztec::react_native
