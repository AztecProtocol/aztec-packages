/**
 * C++ IPC Client Code Generator
 *
 * Generates a C++ IPC client from a CompiledSchema. The generated client:
 *   - Connects to a server over Unix Domain Socket via ipc::IpcClient
 *   - Wraps each command in a NamedUnion, serializes with msgpack, sends, receives, deserializes
 *   - Has one method per command, returning the typed response
 *
 * Usage:
 *   const gen = new CppCodegen({ namespace: 'my_service', prefix: 'MyService' });
 *   const header = gen.generateHeader(schema);
 *   const impl = gen.generateImpl(schema);
 */

import type { CompiledSchema, Command } from "./schema_visitor.ts";
import { toPascalCase, toSnakeCase } from "./naming.ts";

// Convert a schema alias name into its C++ type name. Strips a trailing
// `_t` (uint256_t → Uint256) and PascalCases the rest, so `fr` → `Fr`,
// `secp256k1_fr` → `Secp256k1Fr`, `uint256_t` → `Uint256`.
function toAliasName(name: string): string {
  const trimmed = name.endsWith("_t") ? name.slice(0, -2) : name;
  return toPascalCase(trimmed);
}

export interface CppCodegenOptions {
  /** C++ namespace for generated code, e.g. 'my_service' */
  namespace: string;
  /** Prefix for command/response types, e.g. 'MyService' */
  prefix: string;
  /**
   * Override for the generated output directory include path.
   */
  generatedIncludeDir?: string;
  /**
   * Sub-namespace for wire types (e.g. 'wire' → types in ns::wire).
   * When set, standalone types are wrapped in this sub-namespace,
   * and the server dispatch deserializes into wire types then converts to domain types.
   */
  wireNamespace?: string;
}

export class CppCodegen {
  constructor(private opts: CppCodegenOptions) {}

  private primitiveType(type: import("./schema_visitor.ts").Type): string {
    switch (type.primitive) {
      case "bool":
        return "bool";
      case "u8":
        return "uint8_t";
      case "u16":
        return "uint16_t";
      case "u32":
        return "uint32_t";
      case "u64":
        return "uint64_t";
      case "f64":
        return "double";
      case "string":
        return "std::string";
      case "bytes":
        return "std::vector<uint8_t>";
      case "bin32":
        return "std::array<uint8_t, 32>";
    }
    throw new Error(`Unsupported primitive type: ${type.primitive}`);
  }

  /** Convert a command name to a C++ method name (snake_case without prefix) */
  private methodName(commandName: string): string {
    // Strip prefix: "CdbGetContractInstance" -> "GetContractInstance" -> "get_contract_instance"
    const withoutPrefix = commandName.startsWith(this.opts.prefix)
      ? commandName.slice(this.opts.prefix.length)
      : commandName;
    return toSnakeCase(withoutPrefix);
  }

  /** Check if the response has fields (non-void return) */
  private hasResponseFields(command: Command, schema: CompiledSchema): boolean {
    const resp = schema.responses.get(command.responseType);
    return !!resp && resp.fields.length > 0;
  }

  /** Generate the method signature using command struct types directly */
  private generateMethodSignature(
    command: Command,
    schema: CompiledSchema,
    className?: string,
  ): string {
    const method = this.methodName(command.name);
    const hasFields = this.hasResponseFields(command, schema);
    // Wire types use top-level response names (BbFooResponse).
    // Command types with nested Response use Cmd::Response.
    const retType = hasFields
      ? this.opts.wireNamespace
        ? command.responseType
        : `${command.name}::Response`
      : "void";

    // If the command has fields, take the whole command struct by value
    const params = command.fields.length > 0 ? `${command.name} cmd` : "";

    const prefix = className ? `${className}::` : "";
    const constSuffix = !this.isWriteCommand(command) ? " const" : "";

    return `${retType} ${prefix}${method}(${params})${constSuffix}`;
  }

  /** Check if a command modifies state (non-const) */
  private isWriteCommand(command: Command): boolean {
    const name = command.name.toLowerCase();
    return (
      name.includes("add") ||
      name.includes("create") ||
      name.includes("commit") ||
      name.includes("revert") ||
      name.includes("register") ||
      name.includes("shutdown") ||
      name.includes("delete") ||
      name.includes("sync") ||
      name.includes("rollback") ||
      name.includes("unwind")
    );
  }

  /** Generate the header file */
  generateHeader(schema: CompiledSchema, schemaHash?: string): string {
    const { namespace: ns, prefix } = this.opts;
    const wireNs = this.opts.wireNamespace;
    const className = `${prefix}IpcClient`;

    const methods = schema.commands
      .map((cmd) => {
        const sig = this.generateMethodSignature(cmd, schema);
        return `    ${sig};`;
      })
      .join("\n");

    const hashConstant = schemaHash
      ? `\n/** Schema version hash for compatibility checking */\nstatic constexpr const char SCHEMA_HASH[] = "${schemaHash}";\n`
      : "";

    // When wireNamespace is set, include wire types and bring them into scope
    const wireInclude = wireNs
      ? `#include "${this.generatedInclude(`${toSnakeCase(prefix)}_types.hpp`)}"\n`
      : "";
    const wireUsing = wireNs ? `using namespace ${wireNs};\n` : "";

    const typesInclude = this.generatedInclude(
      `${toSnakeCase(prefix)}_types.hpp`,
    );

    return `// AUTOGENERATED FILE - DO NOT EDIT
#pragma once

#include "${typesInclude}"
#include "ipc_runtime/ipc_client.hpp"
#include "ipc_runtime/serve_helper.hpp"
// clang-format on

#include <memory>
#include <string>

namespace ${ns} {
${wireUsing}${hashConstant}
/**
 * @brief Auto-generated IPC client.
 *
 * Each method sends a msgpack-serialized command to the server and returns
 * the typed response. Transport (UDS or MPSC-SHM) is selected by the path
 * suffix passed to the constructor: ".sock" → UDS, ".shm" → MPSC-SHM. All
 * methods block until the response arrives.
 */
class ${className} {
  public:
    explicit ${className}(const std::string& path);
    ~${className}();

    ${className}(const ${className}&) = delete;
    ${className}& operator=(const ${className}&) = delete;

${methods}

  private:
    template <typename Cmd, typename Resp>
    Resp send(Cmd&& cmd) const;

    mutable std::unique_ptr<::ipc::IpcClient> client_;
};

} // namespace ${ns}
`;
  }

  /** Generate the implementation file — string-based serialization, no NamedUnion */
  generateImpl(schema: CompiledSchema): string {
    const { namespace: ns, prefix } = this.opts;
    const className = `${prefix}IpcClient`;
    const errorType = schema.errorTypeName || `${prefix}ErrorResponse`;

    const methods = schema.commands
      .map((cmd) => {
        return this.generateMethodImpl(cmd, schema, className);
      })
      .join("\n");

    return `// AUTOGENERATED FILE - DO NOT EDIT

#include "${this.headerIncludePath()}"

// THROW/RETHROW satisfy msgpack-c builds with -fno-exceptions support. They
// must be defined before <msgpack.hpp> is included (transitively via
// ipc_codegen/msgpack_adaptor.hpp). Under BB_NO_EXCEPTIONS THROW aborts;
// the guard lets a consumer predefine its own variant.
#include "ipc_codegen/throw.hpp"
#include "ipc_codegen/msgpack_adaptor.hpp"

#include <cstdint>
#include <stdexcept>
#include <string>

// Client-side glue is exception-using and transport-using. Under WASM /
// -fno-exceptions consumers that don't need a transport-based client (e.g.
// in-process FFI callers) can skip the whole translation unit so we don't
// have to thread THROW through every site.
#ifndef BB_NO_EXCEPTIONS

namespace ${ns} {

namespace {
constexpr uint64_t DEFAULT_CALL_TIMEOUT_NS = 1000000000ULL;
}

${className}::${className}(const std::string& path)
    : client_(::ipc::make_client(path))
{
    if (!client_) {
        throw std::runtime_error("ipc::make_client: unrecognised path suffix (expected .sock or .shm): " + path);
    }
    if (!client_->connect()) {
        throw std::runtime_error("ipc::IpcClient::connect() failed for " + path);
    }
}

${className}::~${className}() = default;

template <typename Cmd, typename Resp>
Resp ${className}::send(Cmd&& cmd) const
{
    // Serialize as [[CommandName, {payload}]]
    msgpack::sbuffer send_buffer;
    msgpack::packer<msgpack::sbuffer> pk(send_buffer);
    pk.pack_array(1);
    pk.pack_array(2);
    pk.pack(std::string(Cmd::MSGPACK_SCHEMA_NAME));
    pk.pack(std::forward<Cmd>(cmd));

    // Send request, receive response.
    if (!client_->send(send_buffer.data(), send_buffer.size(), DEFAULT_CALL_TIMEOUT_NS)) {
        throw std::runtime_error("ipc::IpcClient::send failed");
    }
    auto response_view = client_->receive(DEFAULT_CALL_TIMEOUT_NS);
    if (response_view.empty()) {
        throw std::runtime_error("Empty response from server");
    }
    // Copy out before release() — for SHM this gives up zero-copy semantics
    // but keeps the rest of the code simple. convert() below copies anyway.
    std::vector<uint8_t> response_bytes(response_view.begin(), response_view.end());
    client_->release(response_view.size());

    // Parse response: [ResponseName, {payload}]
    auto unpacked = msgpack::unpack(
        reinterpret_cast<const char*>(response_bytes.data()), response_bytes.size());
    auto obj = unpacked.get();

    if (obj.type != msgpack::type::ARRAY || obj.via.array.size != 2 ||
        obj.via.array.ptr[0].type != msgpack::type::STR) {
        throw std::runtime_error("Invalid response format from server");
    }

    std::string resp_name(obj.via.array.ptr[0].via.str.ptr, obj.via.array.ptr[0].via.str.size);
    if (resp_name == "${errorType}") {
        std::string message;
        auto& payload = obj.via.array.ptr[1];
        // Extract message field from the error map
        if (payload.type == msgpack::type::MAP) {
            for (uint32_t i = 0; i < payload.via.map.size; ++i) {
                auto& kv = payload.via.map.ptr[i];
                if (kv.key.type == msgpack::type::STR) {
                    std::string key(kv.key.via.str.ptr, kv.key.via.str.size);
                    if (key == "message" && kv.val.type == msgpack::type::STR) {
                        message = std::string(kv.val.via.str.ptr, kv.val.via.str.size);
                    }
                }
            }
        }
        throw std::runtime_error("Server error: " + message);
    }

    Resp result;
    obj.via.array.ptr[1].convert(result);
    return result;
}

${methods}
} // namespace ${ns}

#endif // BB_NO_EXCEPTIONS
`;
  }

  /** Generate a single method implementation */
  private generateMethodImpl(
    command: Command,
    schema: CompiledSchema,
    className: string,
  ): string {
    const sig = this.generateMethodSignature(command, schema, className);
    const hasFields = this.hasResponseFields(command, schema);
    const respType = this.opts.wireNamespace
      ? command.responseType
      : `${command.name}::Response`;

    const cmdExpr =
      command.fields.length > 0 ? "std::move(cmd)" : `${command.name}{}`;

    if (!hasFields) {
      return `${sig}
{
    send<${command.name}, ${respType}>(${cmdExpr});
}
`;
    }

    return `${sig}
{
    return send<${command.name}, ${respType}>(${cmdExpr});
}
`;
  }

  /** Get the generated/ directory include prefix.
   *  Returns either the explicit --cpp-include-dir value (e.g. "myservice/generated")
   *  or empty for callers that include generated files by their bare filename. */
  private generatedDir(): string {
    if (this.opts.generatedIncludeDir) {
      return this.opts.generatedIncludeDir;
    }
    return "";
  }

  /** Form an include path: `<dir>/<file>` if dir is non-empty, else bare `<file>`. */
  private generatedInclude(filename: string): string {
    const dir = this.generatedDir();
    return dir ? `${dir}/${filename}` : filename;
  }

  /** Compute the include path for the generated client header */
  private headerIncludePath(): string {
    return this.generatedInclude(
      `${toSnakeCase(this.opts.prefix)}_ipc_client.hpp`,
    );
  }

  // -----------------------------------------------------------------------
  // Standalone types (no external project dependencies)
  // -----------------------------------------------------------------------

  /** Generate standalone C++ types with MSGPACK_DEFINE_MAP — no external project deps */
  generateStandaloneTypes(schema: CompiledSchema): string {
    const { namespace: ns, prefix } = this.opts;

    const aliasTypes = new Map<string, { underlying: string; schemaName: string }>();
    const collect = (type: import("./schema_visitor.ts").Type): void => {
      if (type.kind === "primitive" && type.originalName) {
        aliasTypes.set(toAliasName(type.originalName), {
          underlying: this.primitiveType(type),
          schemaName: type.originalName,
        });
      } else if (
        type.kind === "vector" ||
        type.kind === "array" ||
        type.kind === "optional"
      ) {
        if (type.element) collect(type.element);
      }
    };
    for (const s of schema.structs.values()) {
      for (const f of s.fields) collect(f.type);
    }
    for (const s of schema.responses.values()) {
      for (const f of s.fields) collect(f.type);
    }
    const aliasDecls = [...aliasTypes.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, { underlying, schemaName }]) => {
        if (underlying === "std::array<uint8_t, 32>") {
          return `struct ${name} : ::ipc::Bin32Alias<${name}> {
    using ::ipc::Bin32Alias<${name}>::Bin32Alias;
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "${schemaName}";
};`;
        }
        return `using ${name} = ${underlying};`;
      })
      .join("\n");

    // Map schema types to C++ types
    const mapType = (type: import("./schema_visitor.ts").Type): string => {
      switch (type.kind) {
        case "primitive":
          return type.originalName
            ? toAliasName(type.originalName)
            : this.primitiveType(type);
        case "vector":
          return `std::vector<${mapType(type.element!)}>`;
        case "array":
          return `std::array<${mapType(type.element!)}, ${type.size}>`;
        case "optional":
          return `std::optional<${mapType(type.element!)}>`;
        case "struct":
          return type.struct!.name;
      }
      throw new Error(`Unsupported type kind: ${type.kind}`);
    };

    const allStructs = [
      ...schema.structs.values(),
      ...schema.responses.values(),
    ];
    const structs = allStructs
      .map((s) => {
        const fields = s.fields
          .map((f) => `    ${mapType(f.type)} ${f.name};`)
          .join("\n");
        const fieldNames = s.fields.map((f) => f.name).join(", ");
        const schemaName = `    static constexpr const char MSGPACK_SCHEMA_NAME[] = "${s.name}";`;
        const serialization = fieldNames
          ? `    SERIALIZATION_FIELDS(${fieldNames})`
          : `    template <typename _PackFn> void msgpack(_PackFn&& pack_fn) { pack_fn(); }`;
        return `struct ${s.name} {\n${schemaName}\n${fields}\n${serialization}\n    bool operator==(const ${s.name}&) const = default;\n};`;
      })
      .join("\n\n");

    return `// AUTOGENERATED FILE - DO NOT EDIT
// Standalone types for ${prefix} service.
#pragma once

#include <array>
#include <cstdint>
#include <cstring>
#include <optional>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

// Pull in THROW/RETHROW: \`throw\` natively, abort-on-throw under
// BB_NO_EXCEPTIONS (WASM). Must be in scope before <msgpack.hpp> so msgpack-c
// picks up the right variant.
#include "ipc_codegen/throw.hpp"
#include <msgpack.hpp>

// ---------------------------------------------------------------------------
// Self-contained serialization macro.
// Defines a msgpack() method that enumerates field name/value pairs.
// Works with msgpack packers (serialization) and schema reflectors.
// Skipped if the consumer already defines SERIALIZATION_FIELDS (which then
// wins, so wire and domain types share the same enumeration semantics).
// ---------------------------------------------------------------------------
#ifndef SERIALIZATION_FIELDS
#define _SF_E1(x) #x, x
#define _SF_E2(x, ...) #x, x, _SF_E1(__VA_ARGS__)
#define _SF_E3(x, ...) #x, x, _SF_E2(__VA_ARGS__)
#define _SF_E4(x, ...) #x, x, _SF_E3(__VA_ARGS__)
#define _SF_E5(x, ...) #x, x, _SF_E4(__VA_ARGS__)
#define _SF_E6(x, ...) #x, x, _SF_E5(__VA_ARGS__)
#define _SF_E7(x, ...) #x, x, _SF_E6(__VA_ARGS__)
#define _SF_E8(x, ...) #x, x, _SF_E7(__VA_ARGS__)
#define _SF_E9(x, ...) #x, x, _SF_E8(__VA_ARGS__)
#define _SF_E10(x, ...) #x, x, _SF_E9(__VA_ARGS__)
#define _SF_E11(x, ...) #x, x, _SF_E10(__VA_ARGS__)
#define _SF_E12(x, ...) #x, x, _SF_E11(__VA_ARGS__)
#define _SF_E13(x, ...) #x, x, _SF_E12(__VA_ARGS__)
#define _SF_E14(x, ...) #x, x, _SF_E13(__VA_ARGS__)
#define _SF_E15(x, ...) #x, x, _SF_E14(__VA_ARGS__)
#define _SF_E16(x, ...) #x, x, _SF_E15(__VA_ARGS__)
#define _SF_E17(x, ...) #x, x, _SF_E16(__VA_ARGS__)
#define _SF_E18(x, ...) #x, x, _SF_E17(__VA_ARGS__)
#define _SF_E19(x, ...) #x, x, _SF_E18(__VA_ARGS__)
#define _SF_E20(x, ...) #x, x, _SF_E19(__VA_ARGS__)
#define _SF_CNT(_1,_2,_3,_4,_5,_6,_7,_8,_9,_10,_11,_12,_13,_14,_15,_16,_17,_18,_19,_20,N,...) N
#define _SF_NUM(...) _SF_CNT(__VA_ARGS__,20,19,18,17,16,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1)
#define _SF_CAT(a, b) a##b
#define _SF_SEL(n) _SF_CAT(_SF_E, n)
#define _SF_NVP(...) _SF_SEL(_SF_NUM(__VA_ARGS__))(__VA_ARGS__)
#define SERIALIZATION_FIELDS(...) \\
    template <typename _PackFn> void msgpack(_PackFn pack_fn) { pack_fn(_SF_NVP(__VA_ARGS__)); }
#endif

// ---------------------------------------------------------------------------
// Wire aliases for primitive schema aliases. bin32 aliases are nominal wrappers
// so schema reflection can preserve their alias names.
// ---------------------------------------------------------------------------

#ifndef IPC_CODEGEN_BIN32_ALIAS_DEFINED
#define IPC_CODEGEN_BIN32_ALIAS_DEFINED
namespace ipc {
template <typename Tag> struct Bin32Alias {
    using IPC_CODEGEN_BIN32_ALIAS = void;
    std::array<uint8_t, 32> value{};

    Bin32Alias() = default;
    Bin32Alias(const std::array<uint8_t, 32>& bytes) : value(bytes) {}
    Bin32Alias(std::array<uint8_t, 32>&& bytes) : value(std::move(bytes)) {}

    uint8_t* data() { return value.data(); }
    const uint8_t* data() const { return value.data(); }
    constexpr std::size_t size() const { return 32; }

    uint8_t& operator[](std::size_t i) { return value[i]; }
    const uint8_t& operator[](std::size_t i) const { return value[i]; }

    auto begin() { return value.begin(); }
    auto end() { return value.end(); }
    auto begin() const { return value.begin(); }
    auto end() const { return value.end(); }

    operator std::array<uint8_t, 32>&() { return value; }
    operator const std::array<uint8_t, 32>&() const { return value; }

    void msgpack_pack(auto& packer) const
    {
        packer.pack_bin(static_cast<uint32_t>(value.size()));
        packer.pack_bin_body(reinterpret_cast<const char*>(value.data()), static_cast<uint32_t>(value.size()));
    }

    void msgpack_unpack(auto object)
    {
        if constexpr (requires { object.template as<std::array<uint8_t, 32>>(); }) {
            value = object.template as<std::array<uint8_t, 32>>();
        } else {
            value = static_cast<std::array<uint8_t, 32>>(object);
        }
    }

    void msgpack_schema(auto& packer) const { packer.pack_alias(Tag::MSGPACK_SCHEMA_NAME, "bin32"); }
    bool operator==(const Bin32Alias&) const = default;
};
} // namespace ipc
#endif

namespace ${ns} {

${aliasDecls}

${this.opts.wireNamespace ? `namespace ${this.opts.wireNamespace} {` : ""}

${structs}

${this.opts.wireNamespace ? `} // namespace ${this.opts.wireNamespace}` : ""}
} // namespace ${ns}
`;
  }

  /** Generate standalone server dispatch (no external project deps) */
  generateStandaloneServer(schema: CompiledSchema): string {
    const { namespace: ns, prefix } = this.opts;
    const errorType = schema.errorTypeName || `${prefix}ErrorResponse`;

    const dispatchCases = schema.commands
      .filter((c) => !c.name.endsWith("Shutdown"))
      .map((c) => {
        return `        if (cmd_name == "${c.name}") {
            ${c.name} cmd; cmd_payload.convert(cmd);
            auto resp = handle_${toSnakeCase(c.name.startsWith(prefix) ? c.name.slice(prefix.length) : c.name)}(cmd);
            pk.pack_array(2); pk.pack(std::string("${c.responseType}")); pk.pack(resp);
        }`;
      })
      .join(" else ");

    const stubs = schema.commands
      .filter((c) => !c.name.endsWith("Shutdown"))
      .map((c) => {
        const method = toSnakeCase(
          c.name.startsWith(prefix) ? c.name.slice(prefix.length) : c.name,
        );
        return `// TODO: implement ${c.name}
inline ${c.responseType} handle_${method}(const ${c.name}& /*cmd*/) {
    throw std::runtime_error("not implemented: ${c.name}");
}`;
      })
      .join("\n\n");

    const shutdownName =
      schema.commands.find((c) => c.name.endsWith("Shutdown"))?.name ||
      `${prefix}Shutdown`;
    const shutdownResp = shutdownName + "Response";

    return `// AUTOGENERATED FILE - DO NOT EDIT
// ${prefix} server dispatch — only depends on msgpack-c.
// Implement the handle_* functions to build your ${prefix} service.
#pragma once

#include "types_gen.hpp"
#include "${this.generatedInclude("ipc_server.hpp")}"
#include <stdexcept>

namespace ${ns} {

// ---------------------------------------------------------------------------
// Dispatch: routes commands to handler functions
// ---------------------------------------------------------------------------

inline std::vector<uint8_t> dispatch(const std::vector<uint8_t>& payload) {
    auto oh = msgpack::unpack(reinterpret_cast<const char*>(payload.data()), payload.size());
    auto obj = oh.get();
    auto& inner = obj.via.array.ptr[0];
    std::string cmd_name(inner.via.array.ptr[0].via.str.ptr, inner.via.array.ptr[0].via.str.size);
    auto& cmd_payload = inner.via.array.ptr[1];

    msgpack::sbuffer resp_buf;
    msgpack::packer<msgpack::sbuffer> pk(resp_buf);

    try {
        if (cmd_name == "${shutdownName}") {
            pk.pack_array(2); pk.pack(std::string("${shutdownResp}")); pk.pack_map(0);
        } else ${dispatchCases} else {
            pk.pack_array(2); pk.pack(std::string("${errorType}"));
            pk.pack_map(1); pk.pack(std::string("message")); pk.pack(std::string("unknown command: ") + cmd_name);
        }
    } catch (const std::exception& e) {
        resp_buf.clear();
        msgpack::packer<msgpack::sbuffer> epk(resp_buf);
        epk.pack_array(2); epk.pack(std::string("${errorType}"));
        epk.pack_map(1); epk.pack(std::string("message")); epk.pack(std::string(e.what()));
    }

    return std::vector<uint8_t>(resp_buf.data(), resp_buf.data() + resp_buf.size());
}

/// Start the server on the given socket path.
inline void serve(const char* socket_path) {
    ipc::serve(socket_path, dispatch);
}

// ---------------------------------------------------------------------------
// Handler stubs — implement these to build your ${prefix} service.
// ---------------------------------------------------------------------------

${stubs}

} // namespace ${ns}
`;
  }

  /** Generate standalone client wrapper (no external project deps) */
  generateStandaloneClient(schema: CompiledSchema): string {
    const { namespace: ns, prefix } = this.opts;
    const errorType = schema.errorTypeName || `${prefix}ErrorResponse`;

    const methods = schema.commands
      .filter((c) => !c.name.endsWith("Shutdown"))
      .map((c) => {
        const method = toSnakeCase(
          c.name.startsWith(prefix) ? c.name.slice(prefix.length) : c.name,
        );
        const hasFields = c.fields.length > 0;
        const param = hasFields ? `const ${c.name}& cmd` : "";
        const packCmd = hasFields ? "cmd" : `${c.name}{}`;
        return `    ${c.responseType} ${method}(${param}) {
        msgpack::sbuffer buf;
        msgpack::packer<msgpack::sbuffer> pk(buf);
        pk.pack_array(1); pk.pack_array(2); pk.pack(std::string("${c.name}")); pk.pack(${packCmd});
        auto resp = client_.call(std::vector<uint8_t>(buf.data(), buf.data() + buf.size()));
        auto oh = msgpack::unpack(reinterpret_cast<const char*>(resp.data()), resp.size());
        auto obj = oh.get();
        std::string resp_name(obj.via.array.ptr[0].via.str.ptr, obj.via.array.ptr[0].via.str.size);
        if (resp_name == "${errorType}") throw std::runtime_error("server error");
        ${c.responseType} result; obj.via.array.ptr[1].convert(result);
        return result;
    }`;
      })
      .join("\n\n");

    return `// AUTOGENERATED FILE - DO NOT EDIT
// ${prefix} typed IPC client — only depends on msgpack-c.
#pragma once

#include "types_gen.hpp"
#include "${this.generatedInclude("ipc_client.hpp")}"
#include <stdexcept>

namespace ${ns} {

class ${prefix}Client {
  public:
    explicit ${prefix}Client(const char* socket_path) : client_(socket_path) {}

${methods}

    void shutdown() {
        msgpack::sbuffer buf;
        msgpack::packer<msgpack::sbuffer> pk(buf);
        pk.pack_array(1); pk.pack_array(2); pk.pack(std::string("${prefix}Shutdown")); pk.pack_map(0);
        client_.call(std::vector<uint8_t>(buf.data(), buf.data() + buf.size()));
    }

  private:
    ipc::IpcClient client_;
};

} // namespace ${ns}
`;
  }

  // -----------------------------------------------------------------------
  // Server-side code generation (uses standalone ipc_server.hpp template)
  // -----------------------------------------------------------------------

  /** Generate the server dispatch — header-only, template<typename Ctx> */
  generateServerHeader(schema: CompiledSchema): string {
    const { namespace: ns, prefix } = this.opts;
    const errorTypeName = schema.errorTypeName || `${prefix}ErrorResponse`;
    const typesHeader = `${toSnakeCase(prefix)}_types.hpp`;
    const prefixLower = toSnakeCase(prefix);

    // Per-service NamedUnions + schema reflection. The codegen-emitted
    // <Prefix>Command / <Prefix>CommandResponse aggregate every wire type
    // so the binary can pack its own schema back out via
    // ipc::msgpack_schema_to_string. This is the C++-canonical dev workflow:
    // edit a wire type, rebuild, dump the schema, commit the JSON.
    const cmdUnionMembers = schema.commands
      .map((c) => `wire::${c.name}`)
      .join(",\n                                   ");
    const respUnionMembers = [
      errorTypeName,
      ...schema.commands.map((c) => c.responseType),
    ]
      .map((r) => `wire::${r}`)
      .join(",\n                                           ");

    // Handler declarations — template<typename Ctx>
    const handlerDecls = schema.commands
      .filter((c) => !c.name.endsWith("Shutdown"))
      .map((c) => {
        const method = toSnakeCase(
          c.name.startsWith(prefix) ? c.name.slice(prefix.length) : c.name,
        );
        return `template<typename Ctx>\nwire::${c.responseType} handle_${method}(Ctx& ctx, wire::${c.name}&& cmd);`;
      })
      .join("\n\n");

    // Handler entries for dispatch map
    const handlerEntries = schema.commands
      .map((cmd) => {
        const isShutdown = cmd.name.endsWith("Shutdown");
        const method = toSnakeCase(
          cmd.name.startsWith(prefix)
            ? cmd.name.slice(prefix.length)
            : cmd.name,
        );

        if (isShutdown) {
          return `            { "${cmd.name}", []([[maybe_unused]] Ctx& ctx, [[maybe_unused]] const msgpack::object& payload) -> std::vector<uint8_t> {
                msgpack::sbuffer buf;
                msgpack::packer<msgpack::sbuffer> pk(buf);
                pk.pack_array(2); pk.pack(std::string("${cmd.responseType}")); pk.pack_map(0);
                THROW ::ipc::ShutdownRequested(std::vector<uint8_t>(buf.data(), buf.data() + buf.size()));
            } }`;
        }

        const deserialize =
          cmd.fields.length > 0
            ? `wire::${cmd.name} wire_cmd; payload.convert(wire_cmd);`
            : `wire::${cmd.name} wire_cmd;`;

        return `            { "${cmd.name}", [](Ctx& ctx, [[maybe_unused]] const msgpack::object& payload) -> std::vector<uint8_t> {
                ${deserialize}
                auto wire_resp = handle_${method}(ctx, std::move(wire_cmd));
                if constexpr (requires { ctx.error_message; }) {
                    if (!ctx.error_message.empty()) {
                        std::string msg = std::move(ctx.error_message);
                        ctx.error_message.clear();
                        return detail::make_error(msg);
                    }
                }
                msgpack::sbuffer buf;
                msgpack::packer<msgpack::sbuffer> pk(buf);
                pk.pack_array(2); pk.pack(std::string("${cmd.responseType}")); pk.pack(wire_resp);
                return std::vector<uint8_t>(buf.data(), buf.data() + buf.size());
            } }`;
      })
      .join(",\n");

    return `// AUTOGENERATED FILE - DO NOT EDIT
// Header-only server dispatch — template<typename Ctx> for service context.
#pragma once

#include "${typesHeader}"
#include "ipc_runtime/ipc_server.hpp"
#include "ipc_codegen/named_union.hpp"
#include "ipc_codegen/schema.hpp"
#include "ipc_runtime/serve_helper.hpp"
#include "ipc_runtime/signal_handlers.hpp"
#include "ipc_codegen/msgpack_adaptor.hpp"

// Pull in THROW/RETHROW — 'throw' natively, abort-on-throw under
// BB_NO_EXCEPTIONS (WASM). ipc_codegen/throw.hpp keeps definitions guarded
// with #ifndef THROW, so a parent project that predefines them wins.
#include "ipc_codegen/throw.hpp"
#include <msgpack.hpp>

#include <atomic>
#include <functional>
#include <iostream>
#include <string>
#include <unordered_map>
#include <vector>

namespace ${ns} {

// Wire types are in the 'wire' sub-namespace (from ${typesHeader})
// Handler declarations — implement these in your handler file.
// Template specializations must be visible before make_handler() is instantiated.

${handlerDecls}

// ---------------------------------------------------------------------------
// Dispatch — template on service context type
// ---------------------------------------------------------------------------

namespace detail {

inline std::vector<uint8_t> make_error(const std::string& message)
{
    msgpack::sbuffer buf;
    msgpack::packer<msgpack::sbuffer> pk(buf);
    pk.pack_array(2);
    pk.pack(std::string("${errorTypeName}"));
    pk.pack_map(1);
    pk.pack(std::string("message"));
    pk.pack(message);
    return std::vector<uint8_t>(buf.data(), buf.data() + buf.size());
}

} // namespace detail

// Dispatcher signature — independent of the chosen IPC server backend. The
// lightweight ipc_server.hpp template's ::ipc::Handler is the same type, so
// the dispatcher converts implicitly when passed to the lightweight serve().
// The runtime backend (--cpp-runtime-include) wraps it in a lambda that
// adapts to ipc::IpcServer::Handler's (client_id, span) signature.
using DispatchHandler = std::function<std::vector<uint8_t>(const std::vector<uint8_t>&)>;

template<typename Ctx>
DispatchHandler make_${toSnakeCase(prefix)}_handler(Ctx& ctx)
{
    using HandlerFn = std::function<std::vector<uint8_t>(Ctx&, const msgpack::object&)>;
    static const std::unordered_map<std::string, HandlerFn> table = {
${handlerEntries},
    };

    return [&ctx](const std::vector<uint8_t>& raw_request) -> std::vector<uint8_t> {
        auto unpacked = msgpack::unpack(
            reinterpret_cast<const char*>(raw_request.data()), raw_request.size());
        auto obj = unpacked.get();

        if (obj.type != msgpack::type::ARRAY || obj.via.array.size != 1) {
            std::cerr << "Error: Expected array of size 1\\n";
            return {};
        }

        auto& inner = obj.via.array.ptr[0];
        if (inner.type != msgpack::type::ARRAY || inner.via.array.size != 2 ||
            inner.via.array.ptr[0].type != msgpack::type::STR) {
            std::cerr << "Error: Expected [CommandName, {payload}]\\n";
            return {};
        }

        std::string cmd_name(inner.via.array.ptr[0].via.str.ptr, inner.via.array.ptr[0].via.str.size);
        auto& cmd_payload = inner.via.array.ptr[1];

        auto it = table.find(cmd_name);
        if (it == table.end()) {
            return detail::make_error("unknown command: " + cmd_name);
        }
#ifdef BB_NO_EXCEPTIONS
        return it->second(ctx, cmd_payload);
#else
        try {
            return it->second(ctx, cmd_payload);
        } catch (const ::ipc::ShutdownRequested&) {
            throw;
        } catch (const std::exception& e) {
            std::cerr << "Error processing " << cmd_name << ": " << e.what() << '\\n';
            return detail::make_error(e.what());
        }
#endif
    };
}

// Server-side glue. Native targets compile this; WASM consumers pull in the
// header for the dispatcher only (no transport in WASM), so we hide the
// transport-using path from the WASM toolchain — its sysroot can't link
// sockets/shm and \`throw\` is forbidden under -fno-exceptions.
#ifndef BB_NO_EXCEPTIONS
template<typename Ctx>
void serve(const std::string& input_path, Ctx& ctx)
{
    // Pick UDS vs MPSC-SHM by path suffix; ipc-runtime production server.
    auto server = ::ipc::make_server(input_path);
    if (!server) {
        throw std::runtime_error("ipc::make_server: unrecognised path suffix (expected .sock or .shm): " + input_path);
    }
    ::ipc::install_default_signal_handlers(*server);
    if (!server->listen()) {
        throw std::runtime_error("ipc::IpcServer::listen() failed for " + input_path);
    }
    auto handler = make_${toSnakeCase(prefix)}_handler(ctx);
    server->run([&handler](int /*client_id*/, std::span<const uint8_t> raw) {
        return handler(std::vector<uint8_t>(raw.begin(), raw.end()));
    });
}
#endif // BB_NO_EXCEPTIONS

// ---------------------------------------------------------------------------
// Schema reflection — the binary serialises its own understanding of the wire
// format. Edit a wire type, rebuild, dump the schema, commit the JSON.
// ---------------------------------------------------------------------------

using ${prefix}Command = ::ipc::NamedUnion<${cmdUnionMembers}>;
using ${prefix}CommandResponse = ::ipc::NamedUnion<${respUnionMembers}>;

namespace detail {
struct ${prefix}Api {
    ${prefix}Command commands;
    ${prefix}CommandResponse responses;
    SERIALIZATION_FIELDS(commands, responses);
};
} // namespace detail

inline std::string get_${prefixLower}_schema_as_json()
{
    return ::ipc::msgpack_schema_to_string(detail::${prefix}Api{});
}

} // namespace ${ns}
`;
  }

  /** Generate the server dispatch implementation — map-based O(1) lookup */
  generateServerImpl(schema: CompiledSchema): string {
    const { namespace: ns, prefix } = this.opts;
    const requestType = `${prefix}Request`;
    const errorTypeName = schema.errorTypeName || `${prefix}ErrorResponse`;

    const serverHeaderPath = this.generatedInclude(
      `${toSnakeCase(prefix)}_ipc_server.hpp`,
    );

    // Generate handler lambdas for each command
    const wireNs = this.opts.wireNamespace;
    const handlerEntries = schema.commands
      .map((cmd) => {
        const isShutdown = cmd.name.endsWith("Shutdown");

        // When wireNamespace is set: deserialize wire type, call handle_xxx() which returns wire response
        // When not set: wire types ARE domain types, call cmd.execute(request) directly
        const method = toSnakeCase(
          cmd.name.startsWith(prefix)
            ? cmd.name.slice(prefix.length)
            : cmd.name,
        );
        let body: string;

        if (wireNs) {
          if (isShutdown) {
            // Shutdown: no handler call, just serialize empty response and throw
            body = `msgpack::sbuffer buf;
            msgpack::packer<msgpack::sbuffer> pk(buf);
            pk.pack_array(2); pk.pack(std::string("${cmd.responseType}")); pk.pack_map(0);`;
          } else {
            const wireType = `${wireNs}::${cmd.name}`;
            const deserialize =
              cmd.fields.length > 0
                ? `${wireType} wire_cmd; payload.convert(wire_cmd);`
                : `${wireType} wire_cmd;`;
            body = `${deserialize}
            auto wire_resp = handle_${method}(request, std::move(wire_cmd));
            msgpack::sbuffer buf;
            msgpack::packer<msgpack::sbuffer> pk(buf);
            pk.pack_array(2); pk.pack(std::string("${cmd.responseType}")); pk.pack(wire_resp);`;
          }
        } else {
          const deserialize =
            cmd.fields.length > 0
              ? `${cmd.name} cmd; payload.convert(cmd);`
              : `${cmd.name} cmd;`;
          body = `${deserialize}
            auto resp = std::move(cmd).execute(request);
            msgpack::sbuffer buf;
            msgpack::packer<msgpack::sbuffer> pk(buf);
            pk.pack_array(2); pk.pack(std::string("${cmd.responseType}")); pk.pack(resp);`;
        }

        if (isShutdown) {
          return `        { "${cmd.name}", []([[maybe_unused]] ${requestType}& request, [[maybe_unused]] const msgpack::object& payload) -> std::vector<uint8_t> {
            ${body}
            throw ::ipc::ShutdownRequested(std::vector<uint8_t>(buf.data(), buf.data() + buf.size()));
        } }`;
        }
        return `        { "${cmd.name}", [](${requestType}& request, [[maybe_unused]] const msgpack::object& payload) -> std::vector<uint8_t> {
            ${body}
            return std::vector<uint8_t>(buf.data(), buf.data() + buf.size());
        } }`;
      })
      .join(",\n");

    // Include wire types header when wire/domain split is used
    const wireTypesInclude = wireNs
      ? `#include "${this.generatedInclude(`${toSnakeCase(prefix)}_types.hpp`)}"\n`
      : "";

    return `// AUTOGENERATED FILE - DO NOT EDIT

#include "${serverHeaderPath}"
${wireTypesInclude}#include "ipc_codegen/msgpack_adaptor.hpp"

#include <functional>
#include <iostream>
#include <string>
#include <unordered_map>

namespace ${ns} {

using CommandHandler = std::function<std::vector<uint8_t>(${requestType}&, const msgpack::object&)>;

static const std::unordered_map<std::string, CommandHandler>& get_dispatch_table()
{
    static const std::unordered_map<std::string, CommandHandler> table = {
${handlerEntries},
    };
    return table;
}

static std::vector<uint8_t> make_error(const std::string& message)
{
    msgpack::sbuffer buf;
    msgpack::packer<msgpack::sbuffer> pk(buf);
    pk.pack_array(2);
    pk.pack(std::string("${errorTypeName}"));
    pk.pack_map(1);
    pk.pack(std::string("message"));
    pk.pack(message);
    return std::vector<uint8_t>(buf.data(), buf.data() + buf.size());
}

::ipc::Handler make_${toSnakeCase(prefix)}_handler(${requestType}& request)
{
    return [&request](const std::vector<uint8_t>& raw_request) -> std::vector<uint8_t> {
        // Parse: [[CommandName, {payload}]]
        auto unpacked = msgpack::unpack(
            reinterpret_cast<const char*>(raw_request.data()), raw_request.size());
        auto obj = unpacked.get();

        if (obj.type != msgpack::type::ARRAY || obj.via.array.size != 1) {
            std::cerr << "Error: Expected array of size 1\\n";
            return {};
        }

        auto& inner = obj.via.array.ptr[0];
        if (inner.type != msgpack::type::ARRAY || inner.via.array.size != 2 ||
            inner.via.array.ptr[0].type != msgpack::type::STR) {
            std::cerr << "Error: Expected [CommandName, {payload}]\\n";
            return {};
        }

        std::string cmd_name(inner.via.array.ptr[0].via.str.ptr, inner.via.array.ptr[0].via.str.size);
        auto& cmd_payload = inner.via.array.ptr[1];

        try {
            auto& table = get_dispatch_table();
            auto it = table.find(cmd_name);
            if (it == table.end()) {
                return make_error("unknown command: " + cmd_name);
            }
            return it->second(request, cmd_payload);
        } catch (const ::ipc::ShutdownRequested&) {
            throw;
        } catch (const std::exception& e) {
            std::cerr << "Error processing " << cmd_name << ": " << e.what() << '\\n';
            return make_error(e.what());
        }
    };
}

} // namespace ${ns}
`;
  }

  // -----------------------------------------------------------------------
  // Skeleton generation (one-time handler stubs + main)
  // -----------------------------------------------------------------------

  /** Generate handler stub implementations that throw "not implemented" */
  generateHandlerStubs(schema: CompiledSchema): string {
    const { namespace: ns, prefix } = this.opts;
    const typesHeader = `${toSnakeCase(prefix)}_ipc_server.hpp`;
    const ctxName = `${prefix}Context`;

    const stubs = schema.commands
      .filter((c) => !c.name.endsWith("Shutdown"))
      .map((c) => {
        const method = toSnakeCase(
          c.name.startsWith(prefix) ? c.name.slice(prefix.length) : c.name,
        );
        return `template<>
wire::${c.responseType} handle_${method}(${ctxName}& /*ctx*/, wire::${c.name}&& /*cmd*/)
{
    throw std::runtime_error("not implemented: ${c.name}");
}`;
      })
      .join("\n\n");

    return `// Handler stubs — implement your service logic here.
// This file is generated ONCE. Edit freely — it will not be overwritten.
#include "generated/${typesHeader}"
#include <stdexcept>

struct ${ctxName} {
    // Add your shared state here (database connection, etc.)
};

namespace ${ns} {

${stubs}

// Explicit template instantiation — must be at the bottom after all handlers.
template ::ipc::Handler make_${toSnakeCase(prefix)}_handler(${ctxName}& ctx);

} // namespace ${ns}
`;
  }

  /** Generate a main.cpp entry point for a standalone service */
  generateMain(schema: CompiledSchema): string {
    const { namespace: ns, prefix } = this.opts;
    const ctxName = `${prefix}Context`;

    return `// Entry point for ${prefix} service.
// This file is generated ONCE. Edit freely — it will not be overwritten.
#include "generated/${toSnakeCase(prefix)}_ipc_server.hpp"
#include "${toSnakeCase(prefix)}_handlers.cpp"

#include <atomic>
#include <csignal>
#include <iostream>

static std::atomic<bool> shutdown_flag{ false };

int main(int argc, char* argv[])
{
    if (argc < 2) {
        std::cerr << "Usage: " << argv[0] << " <socket_path>\\n";
        return 1;
    }

    ${ctxName} ctx{};
    std::signal(SIGTERM, [](int) { shutdown_flag.store(true); });
    std::signal(SIGINT, [](int) { shutdown_flag.store(true); });

    std::cerr << "${prefix} server starting on " << argv[1] << "\\n";
    ::ipc::serve(argv[1], ${ns}::make_${toSnakeCase(prefix)}_handler(ctx), &shutdown_flag);
    return 0;
}
`;
  }

  /** Generate CMakeLists.txt for a standalone service */
  generateBuildFile(schema: CompiledSchema): string {
    const { prefix } = this.opts;
    const snakePrefix = toSnakeCase(prefix);

    return `cmake_minimum_required(VERSION 3.20)
project(${snakePrefix}_service CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Generated IPC code
file(GLOB GENERATED_SOURCES generated/*.cpp generated/*.hpp)

add_executable(${snakePrefix}
    main.cpp
    \${GENERATED_SOURCES}
)

target_include_directories(${snakePrefix} PRIVATE \${CMAKE_CURRENT_SOURCE_DIR})
target_link_libraries(${snakePrefix} PRIVATE pthread)
`;
  }

  /** Generate .gitignore for the skeleton project */
  generateGitignore(): string {
    return `# Generated IPC code — do not edit, re-run generate.sh instead
generated/
build/
`;
  }

  /** Generate a shell script to re-run codegen */
  generateGenerateScript(schemaPath: string): string {
    const { prefix, namespace: ns } = this.opts;
    return `#!/usr/bin/env bash
# Re-generate IPC types, server, and client from schema.
# Run from the project root directory.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
SCHEMA="${schemaPath}"

node --experimental-strip-types "$(dirname "$SCRIPT_DIR")/codegen/src/generate.ts" \\
  --schema "$SCHEMA" \\
  --lang cpp \\
  --out "$SCRIPT_DIR/generated" \\
  --prefix ${prefix} \\
  --cpp-namespace ${ns} \\
  --server
`;
  }
}
