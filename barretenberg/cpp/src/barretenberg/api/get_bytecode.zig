const std = @import("std");

export fn gunzip(path: [*:0]const u8, out_len: *usize) [*]const u8 {
    const gpa = std.heap.c_allocator;

    const path_slice = std.mem.span(path);
    const max_size: usize = 16 * 1024 * 1024;
    const contents = std.fs.cwd().readFileAlloc(gpa, path_slice, max_size) catch unreachable;
    defer gpa.free(contents);

    if (contents.len < 18 or contents[0] != 0x1f or contents[1] != 0x8b) {
        unreachable;
    }
    var reader: std.Io.Reader = .fixed(contents);
    var decompress_buffer: [std.compress.flate.max_window_len]u8 = undefined;
    var decompress: std.compress.flate.Decompress = .init(&reader, .gzip, &decompress_buffer);
    var writer: std.io.Writer.Allocating = .init(gpa);
    _ = decompress.reader.streamRemaining(&writer.writer) catch unreachable;
    // print("Decompressed bytecode: {d} bytes\n", .{decompressed_len});

    const bc = writer.toOwnedSlice() catch unreachable;

    out_len.* = bc.len;
    return bc.ptr;
}

export fn get_bytecode(path: [*:0]const u8, out_len: *usize) [*]const u8 {
    const gpa = std.heap.c_allocator;

    const path_slice = std.mem.span(path);
    const max_size: usize = 16 * 1024 * 1024;
    const contents = std.fs.cwd().readFileAlloc(gpa, path_slice, max_size) catch unreachable;
    defer gpa.free(contents);

    var arena_state = std.heap.ArenaAllocator.init(gpa);
    defer arena_state.deinit();
    const arena = arena_state.allocator();

    var parsed = std.json.parseFromSlice(std.json.Value, arena, contents, .{}) catch unreachable;
    defer parsed.deinit();

    const bc = getByteCode(gpa, parsed.value) catch unreachable;

    out_len.* = bc.len;
    return bc.ptr;
}

pub fn getByteCode(allocator: std.mem.Allocator, function: std.json.Value) ![]const u8 {
    // Extract bytecode from the function
    const bytecode_obj = function.object.get("bytecode") orelse return error.NoBytecode;
    const bytecode_b64 = switch (bytecode_obj) {
        .string => |str| str,
        else => return error.BytecodeNotString,
    };

    // Decode base64
    // print("Base64 bytecode length: {d}\n", .{bytecode_b64.len});
    const decoder = std.base64.standard.Decoder;
    const decoded_size = try decoder.calcSizeForSlice(bytecode_b64);
    const decoded_compressed = try allocator.alloc(u8, decoded_size);
    defer allocator.free(decoded_compressed);
    try decoder.decode(decoded_compressed, bytecode_b64);
    // print("Decoded compressed data: {d} bytes\n", .{decoded_compressed.len});

    // Decompress using Zig std library
    if (decoded_compressed.len < 18 or decoded_compressed[0] != 0x1f or decoded_compressed[1] != 0x8b) {
        return error.InvalidGzip;
    }
    var reader: std.Io.Reader = .fixed(decoded_compressed);
    var decompress_buffer: [std.compress.flate.max_window_len]u8 = undefined;
    var decompress: std.compress.flate.Decompress = .init(&reader, .gzip, &decompress_buffer);
    var writer: std.io.Writer.Allocating = .init(allocator);
    _ = try decompress.reader.streamRemaining(&writer.writer);
    // print("Decompressed bytecode: {d} bytes\n", .{decompressed_len});

    return writer.toOwnedSlice();
}
