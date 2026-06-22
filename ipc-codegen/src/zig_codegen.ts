/**
 * Zig Code Generator
 *
 * Generates Zig structs, serialization/deserialization functions, and IPC client
 * from a CompiledSchema. Uses zig-msgpack's Payload API for wire encoding.
 *
 * Since Zig has no reflection-based serde, all serialization code is generated
 * explicitly per struct.
 */

import type {
  CompiledSchema,
  Type,
  Struct,
  Field,
  Command,
} from "./schema_visitor.ts";
import { toSnakeCase, toPascalCase, toAliasName, dedupeStructsByName } from "./naming.ts";

export interface ZigCodegenOptions {
  /** Type prefix (e.g., 'Wsdb') */
  prefix?: string;
  /** Strip the prefix from method names, e.g. WsdbGetLeaf -> get_leaf */
  stripMethodPrefix?: boolean;
  /** Client struct name (e.g., 'WsdbClient') */
  clientName?: string;
}

export class ZigCodegen {
  private errorTypeName: string = "ErrorResponse";
  private opts: Required<ZigCodegenOptions>;

  constructor(options?: ZigCodegenOptions) {
    this.opts = {
      prefix: options?.prefix ?? "",
      clientName: options?.clientName ?? "Client",
      stripMethodPrefix: options?.stripMethodPrefix ?? false,
    };
  }

  private primitiveType(type: Type): string {
    switch (type.primitive) {
      case "bool":
        return "bool";
      case "u8":
        return "u8";
      case "u16":
        return "u16";
      case "u32":
        return "u32";
      case "u64":
        return "u64";
      case "f64":
        return "f64";
      case "string":
        return "[]const u8";
      case "bytes":
        return "[]const u8";
      case "bin32":
        return "[32]u8";
    }
    throw new Error(`Unsupported primitive type: ${type.primitive}`);
  }

  /** Map schema type to Zig type */
  private mapType(type: Type): string {
    switch (type.kind) {
      case "primitive":
        return type.originalName
          ? toAliasName(type.originalName)
          : this.primitiveType(type);
      case "vector":
        return `[]const ${this.mapType(type.element!)}`;
      case "array":
        return `[${type.size}]${this.mapType(type.element!)}`;
      case "optional":
        return `?${this.mapType(type.element!)}`;
      case "struct":
        return toPascalCase(type.struct!.name);
    }
    throw new Error(`Unsupported type kind: ${type.kind}`);
  }

  /** Generate a Zig field-to-payload conversion expression */
  private fieldToPayload(
    fieldExpr: string,
    type: import("./schema_visitor.ts").Type,
  ): string {
    switch (type.kind) {
      case "primitive":
        switch (type.primitive) {
          case "bool":
            return `Payload{ .bool = ${fieldExpr} }`;
          case "u8":
          case "u16":
          case "u32":
          case "u64":
            return `Payload{ .uint = @intCast(${fieldExpr}) }`;
          case "f64":
            return `Payload{ .float = ${fieldExpr} }`;
          case "string":
            return `try Payload.strToPayload(${fieldExpr}, allocator)`;
          case "bytes":
            return `try Payload.binToPayload(${fieldExpr}, allocator)`;
          case "bin32":
            return `try Payload.binToPayload(&${fieldExpr}, allocator)`;
          default:
            throw new Error(`Unsupported primitive type: ${type.primitive}`);
        }
      case "optional":
        return `if (${fieldExpr}) |v| ${this.fieldToPayload("v", type.element!)} else Payload{ .nil = {} }`;
      case "vector": {
        // For vectors, build an array payload
        return `blk: {
                var arr = try Payload.arrPayload(${fieldExpr}.len, allocator);
                for (${fieldExpr}, 0..) |item, i| {
                    try arr.setArrElement(i, ${this.fieldToPayload("item", type.element!)});
                }
                break :blk arr;
            }`;
      }
      case "struct":
        return `try ${fieldExpr}.toPayload(allocator)`;
      case "array":
        return `blk: {
                var arr = try Payload.arrPayload(${fieldExpr}.len, allocator);
                for (${fieldExpr}, 0..) |item, i| {
                    try arr.setArrElement(i, ${this.fieldToPayload("item", type.element!)});
                }
                break :blk arr;
            }`;
      default:
        throw new Error(`Unsupported type kind: ${type.kind}`);
    }
  }

  /** Generate a Zig payload-to-field conversion expression */
  private fieldFromPayload(
    payloadExpr: string,
    type: import("./schema_visitor.ts").Type,
  ): string {
    switch (type.kind) {
      case "primitive":
        switch (type.primitive) {
          case "bool":
            return `try ${payloadExpr}.asBool()`;
          case "u8":
            return `try payloadCastUint(u8, ${payloadExpr})`;
          case "u16":
            return `try payloadCastUint(u16, ${payloadExpr})`;
          case "u32":
            return `try payloadCastUint(u32, ${payloadExpr})`;
          case "u64":
            return `try payloadCastUint(u64, ${payloadExpr})`;
          case "f64":
            return `try ${payloadExpr}.asFloat()`;
          case "string":
            return `try ${payloadExpr}.asStr()`;
          case "bytes":
            return `${payloadExpr}.bin.value()`;
          case "bin32":
            return `${payloadExpr}.bin.value()[0..32].*`;
          default:
            throw new Error(`Unsupported primitive type: ${type.primitive}`);
        }
      case "vector": {
        const elemConv = this.fieldFromPayload("elem", type.element!);
        return `blk: {
                const arr_len = try ${payloadExpr}.getArrLen();
                var result = try std.heap.page_allocator.alloc(${this.mapType(type.element!)}, arr_len);
                for (0..arr_len) |i| {
                    const elem = try ${payloadExpr}.getArrElement(i);
                    result[i] = ${elemConv};
                }
                break :blk result;
            }`;
      }
      case "optional":
        return `if (${payloadExpr} == .nil) null else ${this.fieldFromPayload(payloadExpr, type.element!)}`;
      case "struct":
        return `try ${toPascalCase(type.struct!.name)}.fromPayload(${payloadExpr})`;
      case "array": {
        const elemConv = this.fieldFromPayload("elem", type.element!);
        return `blk: {
                var result: ${this.mapType(type)} = undefined;
                for (0..${type.size}) |i| {
                    const elem = try ${payloadExpr}.getArrElement(i);
                    result[i] = ${elemConv};
                }
                break :blk result;
            }`;
      }
      default:
        throw new Error(`Unsupported type kind: ${type.kind}`);
    }
  }

  /** Generate a Zig struct definition with toPayload/fromPayload methods */
  private generateStruct(struct: Struct): string {
    const zigName = toPascalCase(struct.name);
    const fields = struct.fields
      .map((f) => {
        const zigFieldName = toSnakeCase(f.name);
        const zigType = this.mapType(f.type);
        return `    ${zigFieldName}: ${zigType},`;
      })
      .join("\n");

    const hasFields = struct.fields.length > 0;

    // toPayload method
    const toPayloadFields = struct.fields
      .map((f) => {
        const zigFieldName = toSnakeCase(f.name);
        return `        try map.mapPut("${f.name}", ${this.fieldToPayload(`self.${zigFieldName}`, f.type)});`;
      })
      .join("\n");

    // fromPayload method
    const fromPayloadFields = struct.fields
      .map((f) => {
        const zigFieldName = toSnakeCase(f.name);
        return `            .${zigFieldName} = ${this.fieldFromPayload(`(try payload.mapGet("${f.name}")).?`, f.type)},`;
      })
      .join("\n");

    // Empty structs: suppress unused parameter warnings
    if (!hasFields) {
      return `/// ${struct.name}
pub const ${zigName} = struct {

    pub fn toPayload(_: ${zigName}, allocator: std.mem.Allocator) !Payload {
        return Payload.mapPayload(allocator);
    }

    pub fn fromPayload(_: Payload) !${zigName} {
        return ${zigName}{};
    }
};`;
    }

    return `/// ${struct.name}
pub const ${zigName} = struct {
${fields}

    pub fn toPayload(self: ${zigName}, allocator: std.mem.Allocator) !Payload {
        var map = Payload.mapPayload(allocator);
${toPayloadFields}
        return map;
    }

    pub fn fromPayload(payload: Payload) !${zigName} {
        return ${zigName}{
${fromPayloadFields}
        };
    }
};`;
  }

  /** Generate the Command tagged union */
  private generateCommandUnion(schema: CompiledSchema): string {
    const variants = schema.commands
      .map((c) => {
        const zigName = toPascalCase(c.name);
        return `    ${toSnakeCase(c.name)}: ${zigName},`;
      })
      .join("\n");

    const nameMap = schema.commands
      .map((c) => {
        return `        .${toSnakeCase(c.name)} => "${c.name}",`;
      })
      .join("\n");

    return `/// Tagged union of all commands
pub const Command = union(enum) {
${variants}

    pub fn schemaName(self: Command) []const u8 {
        return switch (self) {
${nameMap}
        };
    }
};`;
  }

  /** Generate the Response tagged union */
  private generateResponseUnion(schema: CompiledSchema): string {
    const commandResponseTypes = Array.from(
      new Set(schema.commands.map((c) => c.responseType)),
    );
    const errorName = schema.errorTypeName;
    const responseTypes = schema.responses.has(errorName)
      ? [...commandResponseTypes, errorName]
      : commandResponseTypes;

    const variants = responseTypes
      .map((name) => {
        const zigName = toPascalCase(name);
        return `    ${toSnakeCase(name)}: ${zigName},`;
      })
      .join("\n");

    return `/// Tagged union of all responses
pub const Response = union(enum) {
${variants}
};`;
  }

  /** Generate the types file */
  generateTypes(schema: CompiledSchema, schemaHash?: string): string {
    this.errorTypeName = schema.errorTypeName;

    const allStructs = dedupeStructsByName([
      ...schema.structs.values(),
      ...schema.responses.values(),
    ]);

    const aliasTypes = new Map<string, string>();
    const collect = (type: Type): void => {
      if (type.kind === "primitive" && type.originalName) {
        aliasTypes.set(
          toAliasName(type.originalName),
          type.primitive === "bin32" ? "[32]u8" : this.primitiveType(type),
        );
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
      .map(([name, underlying]) => `pub const ${name} = ${underlying};`)
      .join("\n");

    const structDefs = allStructs
      .map((s) => this.generateStruct(s))
      .join("\n\n");

    const hashLine = schemaHash
      ? `\n/// Schema version hash for compatibility checking\npub const SCHEMA_HASH = "${schemaHash}";\n`
      : "";

    return `//! AUTOGENERATED - DO NOT EDIT
//! Generated from IPC msgpack schema
//!
//! Each struct has toPayload() and fromPayload() methods that convert
//! to/from zig-msgpack Payload objects for serialization.

const std = @import("std");
const msgpack = @import("msgpack");
const Payload = msgpack.Payload;
const PackerIO = msgpack.PackerIO;
${hashLine}
/// Decode an unsigned wire integer with range checking. Accepts both msgpack
/// uint and non-negative int encodings: some encoders (e.g. msgpackr via
/// bigint) emit positive values with the signed int64 (0xd3) format.
pub fn payloadCastUint(comptime T: type, payload: Payload) !T {
    const wide: u64 = switch (payload) {
        .uint => |v| v,
        .int => |v| if (v >= 0) @as(u64, @intCast(v)) else return error.InvalidType,
        else => return error.InvalidType,
    };
    return std.math.cast(T, wide) orelse error.InvalidType;
}

// ---------------------------------------------------------------------------
// Primitive schema aliases. Bin32 aliases use [32]u8 and are encoded as
// msgpack bin32 by fieldToPayload / fieldFromPayload; scalar aliases use
// their scalar wire type directly.
// ---------------------------------------------------------------------------

${aliasDecls}

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

${structDefs}

// ---------------------------------------------------------------------------
// Command / Response unions
// ---------------------------------------------------------------------------

${this.generateCommandUnion(schema)}

${this.generateResponseUnion(schema)}
`;
  }

  /** Convert a command name to a Zig method name (snake_case) */
  private methodName(commandName: string): string {
    const withoutPrefix =
      this.opts.stripMethodPrefix &&
      this.opts.prefix &&
      commandName.startsWith(this.opts.prefix)
        ? commandName.slice(this.opts.prefix.length)
        : commandName;
    return toSnakeCase(withoutPrefix);
  }

  /** Generate the client wrapper — typed methods parameterized on backend type */
  generateClient(schema: CompiledSchema): string {
    this.errorTypeName = schema.errorTypeName;
    const { prefix } = this.opts;
    const errorRespName = toPascalCase(this.errorTypeName);
    const typesFile = `${toSnakeCase(prefix)}_types.zig`;

    const methods = schema.commands
      .map((c) => {
        const methodName = this.methodName(c.name);
        const zigCmdName = toPascalCase(c.name);
        const zigRespName = toPascalCase(c.responseType);
        return `        pub fn ${methodName}(self: *Self, cmd: types.${zigCmdName}) !types.${zigRespName} {
            const request_bytes = try Self.encode("${c.name}", try cmd.toPayload(alloc));
            defer alloc.free(request_bytes);
            const response_bytes = try self.backend.call(request_bytes);
            defer alloc.free(response_bytes);
            const resp_name, const resp_payload = try Self.decode(response_bytes);
            if (std.mem.eql(u8, resp_name, "${this.errorTypeName}")) {
                self.last_server_error = extractErrorMessage(resp_payload);
                return error.ServerError;
            }
            return try types.${zigRespName}.fromPayload(resp_payload);
        }`;
      })
      .join("\n\n");

    return `//! AUTOGENERATED - DO NOT EDIT
//! ${prefix} client — typed methods parameterized on a backend type.
//!
//! The backend must satisfy: call(self, request: []const u8) ![]u8 and destroy(self) void.
//! See backend.zig for the interface contract.
//! Implementations: ipc_runtime.Client, FfiBackend (ffi_backend.zig).

const std = @import("std");
const msgpack = @import("msgpack");
const Payload = msgpack.Payload;
const types = @import("${typesFile}");
const backend_mod = @import("backend.zig");

const alloc = std.heap.page_allocator;

pub fn Client(comptime BackendType: type) type {
    comptime backend_mod.assertBackend(BackendType);

    return struct {
        const Self = @This();
        backend: *BackendType,
        /// Message from the most recent server error response. Zig errors
        /// carry no payload, so error.ServerError callers read this for the
        /// server's diagnostic. Valid until the next call on this client.
        last_server_error: ?[]const u8 = null,

        pub fn init(backend: *BackendType) Self {
            return .{ .backend = backend };
        }

        pub fn destroy(self: *Self) void {
            self.backend.destroy();
        }

${methods}

        // --- internal helpers ---

        fn encode(cmd_name: []const u8, cmd_fields: Payload) ![]u8 {
            var inner = try Payload.arrPayload(2, alloc);
            try inner.setArrElement(0, try Payload.strToPayload(cmd_name, alloc));
            try inner.setArrElement(1, cmd_fields);
            var outer = try Payload.arrPayload(1, alloc);
            try outer.setArrElement(0, inner);

            var allocating_writer = std.Io.Writer.Allocating.init(alloc);
            var packer = msgpack.PackerIO.init(undefined, &allocating_writer.writer);
            try packer.write(outer);
            return try allocating_writer.toOwnedSlice();
        }

        fn decode(response_bytes: []const u8) !struct { []const u8, Payload } {
            var reader = std.Io.Reader.fixed(response_bytes);
            var unpacker = msgpack.PackerIO.init(&reader, undefined);
            const resp = try unpacker.read(alloc);
            const resp_len = try resp.getArrLen();
            if (resp_len != 2) return error.InvalidResponse;
            const name = try (try resp.getArrElement(0)).asStr();
            const payload = try resp.getArrElement(1);
            return .{ name, payload };
        }
    };
}

fn extractErrorMessage(payload: Payload) ?[]const u8 {
    const msg = (payload.mapGet("message") catch return null) orelse return null;
    return msg.asStr() catch null;
}
`;
  }

  /** Generate the server wrapper — typed dispatch parameterized on a handler type */
  generateServer(schema: CompiledSchema): string {
    this.errorTypeName = schema.errorTypeName;
    const { prefix } = this.opts;
    const typesFile = `${toSnakeCase(prefix)}_types.zig`;

    const handlerMethodNames = schema.commands.map((c) =>
      this.methodName(c.name),
    );

    // Dispatch cases: match command name → deserialize → call handler → serialize response
    const dispatchCases = schema.commands
      .map((c) => {
        const methodName = this.methodName(c.name);
        const zigCmdName = toPascalCase(c.name);
        return `            if (std.mem.eql(u8, cmd_name, "${c.name}")) {
                const cmd = types.${zigCmdName}.fromPayload(cmd_fields) catch |err| return makeErrorFmt("decode of ${c.name} failed: {s}", .{@errorName(err)});
                const resp = self.handler.${methodName}(cmd) catch |err| return self.handlerError("${c.name}", err);
                const resp_payload = resp.toPayload(alloc) catch |err| return makeErrorFmt("encode of ${c.responseType} failed: {s}", .{@errorName(err)});
                return .{ .resp_name = "${c.responseType}", .resp_payload = resp_payload };
            }`;
      })
      .join("\n");

    return `//! AUTOGENERATED - DO NOT EDIT
//! ${prefix} IPC server — typed dispatch parameterized on a handler type.
//!
//! The handler is any type with one method per command:
//!     pub fn ${handlerMethodNames[0] ?? "command"}(self: *@This(), cmd: types.${toPascalCase(schema.commands[0]?.name ?? "Command")}) !types.${toPascalCase(schema.commands[0]?.responseType ?? "Response")}
//! Handler failures are wrapped into the schema error variant.
//!
//! Wire it into a transport, e.g. @import("ipc_runtime"):
//!
//!     var dispatcher = Dispatcher(MyHandler).init(&handler);
//!     var server = try ipc_runtime.Server.fromPath(path);
//!     try server.listen();
//!     server.run(*Dispatcher(MyHandler), &dispatcher, Dispatcher(MyHandler).handleRequest);

const std = @import("std");
const msgpack = @import("msgpack");
const Payload = msgpack.Payload;
const types = @import("${typesFile}");

const alloc = std.heap.page_allocator;

/// Result of dispatching one command.
pub const DispatchResult = struct { resp_name: []const u8, resp_payload: Payload };

/// Comptime check that HandlerType has every command handler method.
pub fn assertHandler(comptime HandlerType: type) void {
${handlerMethodNames
  .map(
    (m) => `    if (!@hasDecl(HandlerType, "${m}")) {
        @compileError(@typeName(HandlerType) ++ " is missing handler method '${m}'");
    }`,
  )
  .join("\n")}
}

pub fn Dispatcher(comptime HandlerType: type) type {
    comptime assertHandler(HandlerType);

    return struct {
        const Self = @This();
        handler: *HandlerType,
        // Per-request response scratch; freed on the next call. The transport
        // contract requires the returned slice to stay valid until then.
        resp_scratch: ?[]u8 = null,

        pub fn init(handler: *HandlerType) Self {
            return .{ .handler = handler };
        }

        /// Typed dispatch of a decoded [name, payload] command.
        pub fn dispatch(self: *Self, cmd_name: []const u8, cmd_fields: Payload) DispatchResult {
${dispatchCases}

            return makeErrorFmt("unknown command: {s}", .{cmd_name});
        }

        /// Transport entry point: decode framed request bytes, dispatch, and
        /// encode framed response bytes. All failures (malformed framing
        /// included) produce the schema error variant.
        pub fn handleRequest(self: *Self, client_id: i32, request_bytes: []const u8) []u8 {
            _ = client_id;
            if (self.resp_scratch) |prev| alloc.free(prev);
            self.resp_scratch = null;

            const parsed = parseRequest(request_bytes) catch |err| {
                return self.encodeResponse(makeErrorFmt("malformed request: {s}", .{@errorName(err)}));
            };
            return self.encodeResponse(self.dispatch(parsed.cmd_name, parsed.cmd_fields));
        }

        /// Build the error variant for a failed handler call. Zig errors
        /// carry no payload, so a handler can stash a rich diagnostic in an
        /// optional \`error_message: ?[]const u8\` field on itself before
        /// returning; otherwise the error name is used.
        fn handlerError(self: *Self, command_name: []const u8, err: anyerror) DispatchResult {
            if (comptime @hasField(HandlerType, "error_message")) {
                if (self.handler.error_message) |message| {
                    self.handler.error_message = null;
                    return makeErrorFmt("{s}", .{message});
                }
            }
            return makeErrorFmt("{s} failed: {s}", .{ command_name, @errorName(err) });
        }

        fn encodeResponse(self: *Self, result: DispatchResult) []u8 {
            const bytes = encodeNamed(result.resp_name, result.resp_payload) catch
                encodeNamed("${this.errorTypeName}", makeErrorFmt("response encode failed", .{}).resp_payload) catch
                @panic("cannot encode error response");
            self.resp_scratch = bytes;
            return bytes;
        }
    };
}

const ParsedRequest = struct { cmd_name: []const u8, cmd_fields: Payload };

fn parseRequest(request_bytes: []const u8) !ParsedRequest {
    var reader = std.Io.Reader.fixed(request_bytes);
    var unpacker = msgpack.PackerIO.init(&reader, undefined);
    const request = try unpacker.read(alloc);
    if (try request.getArrLen() != 1) return error.BadOuterArray;
    const inner = try request.getArrElement(0);
    if (try inner.getArrLen() != 2) return error.BadInnerArray;
    const cmd_name = try (try inner.getArrElement(0)).asStr();
    const cmd_fields = try inner.getArrElement(1);
    return .{ .cmd_name = cmd_name, .cmd_fields = cmd_fields };
}

fn encodeNamed(name: []const u8, payload: Payload) ![]u8 {
    var resp = try Payload.arrPayload(2, alloc);
    try resp.setArrElement(0, try Payload.strToPayload(name, alloc));
    try resp.setArrElement(1, payload);
    var allocating_writer = std.Io.Writer.Allocating.init(alloc);
    var packer = msgpack.PackerIO.init(undefined, &allocating_writer.writer);
    try packer.write(resp);
    return try allocating_writer.toOwnedSlice();
}

fn makeErrorFmt(comptime fmt: []const u8, args: anytype) DispatchResult {
    const message = std.fmt.allocPrint(alloc, fmt, args) catch "error";
    var err_map = Payload.mapPayload(alloc);
    err_map.mapPut("message", Payload.strToPayload(message, alloc) catch Payload{ .nil = {} }) catch {};
    return .{ .resp_name = "${this.errorTypeName}", .resp_payload = err_map };
}
`;
  }
}
