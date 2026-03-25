/**
 * Zig Code Generator
 *
 * Generates Zig structs, serialization/deserialization functions, and IPC client
 * from a CompiledSchema. Uses zig-msgpack's Payload API for wire encoding.
 *
 * Since Zig has no reflection-based serde, all serialization code is generated
 * explicitly per struct.
 */

import type { CompiledSchema, Type, Struct, Field, Command } from './schema_visitor.js';
import { toSnakeCase, toPascalCase } from './naming.js';

export interface ZigCodegenOptions {
  /** Service prefix to strip from method names (e.g., 'Wsdb') */
  prefix?: string;
  /** Client struct name (e.g., 'WsdbClient') */
  clientName?: string;
}

export class ZigCodegen {
  private errorTypeName: string = 'ErrorResponse';
  private opts: Required<ZigCodegenOptions>;

  constructor(options?: ZigCodegenOptions) {
    this.opts = {
      prefix: options?.prefix ?? '',
      clientName: options?.clientName ?? 'Client',
    };
  }

  /** Map schema type to Zig type */
  private mapType(type: Type): string {
    switch (type.kind) {
      case 'primitive':
        switch (type.primitive) {
          case 'bool': return 'bool';
          case 'u8': return 'u8';
          case 'u16': return 'u16';
          case 'u32': return 'u32';
          case 'u64': return 'u64';
          case 'f64': return 'f64';
          case 'string': return '[]const u8';
          case 'bytes': return '[]const u8';
          case 'field2': return '[2][]const u8';
          case 'enum_u32': return 'u32';
          case 'map_u32_pair': return 'void'; // TODO: proper map support
        }
        break;
      case 'vector':
        return `[]const ${this.mapType(type.element!)}`;
      case 'array':
        return `[${type.size}]${this.mapType(type.element!)}`;
      case 'optional':
        return `?${this.mapType(type.element!)}`;
      case 'struct':
        return toPascalCase(type.struct!.name);
    }
    return 'void';
  }

  /** Generate a Zig struct definition */
  private generateStruct(struct: Struct): string {
    const zigName = toPascalCase(struct.name);
    const fields = struct.fields.map(f => {
      const zigFieldName = toSnakeCase(f.name);
      const zigType = this.mapType(f.type);
      return `    ${zigFieldName}: ${zigType},`;
    }).join('\n');

    return `/// ${struct.name}
pub const ${zigName} = struct {
${fields}
};`;
  }

  /** Generate serialize function for a struct */
  private generateSerializeFn(struct: Struct): string {
    const zigName = toPascalCase(struct.name);
    const fieldCount = struct.fields.length;

    const fieldPacks = struct.fields.map(f => {
      const zigFieldName = toSnakeCase(f.name);
      return `    try packField(packer, "${f.name}", self.${zigFieldName});`;
    }).join('\n');

    return `pub fn serialize${zigName}(self: ${zigName}, packer: anytype) !void {
    try packer.writeMapHeader(${fieldCount});
${fieldPacks}
}`;
  }

  /** Generate deserialize function for a struct */
  private generateDeserializeFn(struct: Struct): string {
    const zigName = toPascalCase(struct.name);

    const fieldReads = struct.fields.map(f => {
      const zigFieldName = toSnakeCase(f.name);
      const zigType = this.mapType(f.type);
      return `        .${zigFieldName} = try readField(${zigType}, unpacker, "${f.name}"),`;
    }).join('\n');

    return `pub fn deserialize${zigName}(unpacker: anytype, allocator: std.mem.Allocator) !${zigName} {
    _ = allocator;
    const map_len = try unpacker.readMapHeader();
    _ = map_len;
    return ${zigName}{
${fieldReads}
    };
}`;
  }

  /** Generate the Command tagged union */
  private generateCommandUnion(schema: CompiledSchema): string {
    const variants = schema.commands.map(c => {
      const zigName = toPascalCase(c.name);
      return `    ${toSnakeCase(c.name)}: ${zigName},`;
    }).join('\n');

    const nameMap = schema.commands.map(c => {
      return `        .${toSnakeCase(c.name)} => "${c.name}",`;
    }).join('\n');

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
    const commandResponseTypes = Array.from(new Set(schema.commands.map(c => c.responseType)));
    const errorName = schema.errorTypeName || 'ErrorResponse';
    const responseTypes = schema.responses.has(errorName)
      ? [...commandResponseTypes, errorName]
      : commandResponseTypes;

    const variants = responseTypes.map(name => {
      const zigName = toPascalCase(name);
      return `    ${toSnakeCase(name)}: ${zigName},`;
    }).join('\n');

    return `/// Tagged union of all responses
pub const Response = union(enum) {
${variants}
};`;
  }

  /** Generate the types file */
  generateTypes(schema: CompiledSchema, schemaHash?: string): string {
    this.errorTypeName = schema.errorTypeName || 'ErrorResponse';

    const allStructs = [...schema.structs.values(), ...schema.responses.values()];

    const structDefs = allStructs.map(s => this.generateStruct(s)).join('\n\n');

    const hashLine = schemaHash
      ? `\n/// Schema version hash for compatibility checking\npub const SCHEMA_HASH = "${schemaHash}";\n`
      : '';

    return `//! AUTOGENERATED - DO NOT EDIT
//! Generated from Aztec IPC msgpack schema

const std = @import("std");
${hashLine}
// ---------------------------------------------------------------------------
// Helper functions for msgpack serialization
// ---------------------------------------------------------------------------

fn packField(packer: anytype, key: []const u8, value: anytype) !void {
    try packer.writeStr(key);
    try packValue(packer, value);
}

fn packValue(packer: anytype, value: anytype) !void {
    const T = @TypeOf(value);
    switch (@typeInfo(T)) {
        .bool => try packer.writeBool(value),
        .int => |info| {
            if (info.signedness == .unsigned) {
                try packer.writeUint(@as(u64, value));
            } else {
                try packer.writeInt(@as(i64, value));
            }
        },
        .float => try packer.writeFloat(value),
        .pointer => |ptr| {
            if (ptr.size == .Slice and ptr.child == u8) {
                try packer.writeBin(value);
            } else if (ptr.size == .Slice) {
                try packer.writeArrayHeader(value.len);
                for (value) |item| {
                    try packValue(packer, item);
                }
            }
        },
        .optional => {
            if (value) |v| {
                try packValue(packer, v);
            } else {
                try packer.writeNil();
            }
        },
        else => @compileError("unsupported type for packValue: " ++ @typeName(T)),
    }
}

fn readField(comptime T: type, unpacker: anytype, expected_key: []const u8) !T {
    const key = try unpacker.readStr();
    std.debug.assert(std.mem.eql(u8, key, expected_key));
    return readValue(T, unpacker);
}

fn readValue(comptime T: type, unpacker: anytype) !T {
    switch (@typeInfo(T)) {
        .bool => return try unpacker.readBool(),
        .int => return @intCast(try unpacker.readInt()),
        .float => return @floatCast(try unpacker.readFloat()),
        .pointer => |ptr| {
            if (ptr.size == .Slice and ptr.child == u8) {
                return try unpacker.readBin();
            } else if (ptr.size == .Slice) {
                const len = try unpacker.readArrayHeader();
                var result = try std.heap.page_allocator.alloc(ptr.child, len);
                for (result) |*item| {
                    item.* = try readValue(ptr.child, unpacker);
                }
                return result;
            }
        },
        .optional => |opt| {
            if (try unpacker.isNil()) {
                try unpacker.readNil();
                return null;
            }
            return try readValue(opt.child, unpacker);
        },
        else => @compileError("unsupported type for readValue: " ++ @typeName(T)),
    }
}

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

  /** Strip service prefix from command name for method naming */
  private methodName(commandName: string): string {
    const withoutPrefix = this.opts.prefix && commandName.startsWith(this.opts.prefix)
      ? commandName.slice(this.opts.prefix.length)
      : commandName;
    return toSnakeCase(withoutPrefix);
  }

  /** Generate the client file */
  generateClient(schema: CompiledSchema, schemaHash?: string): string {
    this.errorTypeName = schema.errorTypeName || 'ErrorResponse';
    const { clientName } = this.opts;

    const methods = schema.commands
      .filter(c => !c.name.endsWith('Shutdown'))
      .map(c => {
        const methodName = this.methodName(c.name);
        const zigCmdName = toPascalCase(c.name);
        const zigRespName = toPascalCase(c.responseType);
        const params = c.fields.map(f => {
          return `${toSnakeCase(f.name)}: ${this.mapType(f.type)}`;
        }).join(', ');

        const fieldInits = c.fields.map(f => {
          return `            .${toSnakeCase(f.name)} = ${toSnakeCase(f.name)},`;
        }).join('\n');

        return `    /// Execute ${c.name}
    pub fn ${methodName}(self: *${clientName}, ${params.length > 0 ? params + ', ' : ''}allocator: std.mem.Allocator) !types.${zigRespName} {
        const cmd = types.${zigCmdName}{
${fieldInits}
        };
        _ = cmd;
        _ = allocator;
        _ = self;
        @panic("TODO: serialize command, send over UDS, deserialize response");
    }`;
      }).join('\n\n');

    return `//! AUTOGENERATED - DO NOT EDIT
//! ${clientName} - IPC client for Aztec service

const std = @import("std");
const types = @import("generated_types.zig");

/// IPC client that communicates with the service over a Unix Domain Socket.
/// Uses 4-byte LE length-prefix framing with msgpack payloads.
pub const ${clientName} = struct {
    stream: std.net.Stream,

    /// Connect to a service at the given socket path.
    pub fn connect(socket_path: []const u8) !${clientName} {
        const addr = try std.net.Address.initUnix(socket_path);
        const stream = try std.net.tcpConnectToAddress(addr);
        return .{ .stream = stream };
    }

    /// Close the connection.
    pub fn close(self: *${clientName}) void {
        self.stream.close();
    }

    /// Send a length-prefixed message.
    fn send(self: *${clientName}, data: []const u8) !void {
        const len: u32 = @intCast(data.len);
        try self.stream.writer().writeInt(u32, len, .little);
        try self.stream.writer().writeAll(data);
    }

    /// Receive a length-prefixed message.
    fn receive(self: *${clientName}, allocator: std.mem.Allocator) ![]u8 {
        const len = try self.stream.reader().readInt(u32, .little);
        const data = try allocator.alloc(u8, len);
        try self.stream.reader().readNoEof(data);
        return data;
    }

${methods}
};
`;
  }
}
