const std = @import("std");
const print = std.debug.print;

// Import C functions from existing bb CLI
extern fn bb_parse_and_run_cli_command_c(argc: c_int, argv: [*][*:0]u8) c_int;

// Import bb ClientIVC C functions
extern fn bbapi_compute_standalone_vk(bytecode: [*]const u8, bytecode_len: usize, out_vk: *[*]u8, out_vk_len: *usize) c_int;

// Import avm-transpiler C functions and types
const c = @cImport({
    @cInclude("avm_transpiler.h");
});

const TranspileResult = c.TranspileResult;

pub fn main() !u8 {
    var arena = std.heap.ArenaAllocator.init(std.heap.page_allocator);
    defer arena.deinit();
    const allocator = arena.allocator();

    const args = try std.process.argsAlloc(allocator);

    // Check if this is an aztec-process command
    if (args.len > 1 and std.mem.eql(u8, args[1], "aztec-process")) {
        return processAztecCommand(allocator, args[2..]);
    }

    // Convert Zig args to C-style args for existing CLI
    const c_args = try allocator.alloc([*:0]u8, args.len);
    for (args, 0..) |arg, i| {
        c_args[i] = @ptrCast(arg.ptr);
    }

    // Fallback to existing bb CLI handler
    const result = bb_parse_and_run_cli_command_c(@intCast(args.len), c_args.ptr);
    return @intCast(result);
}

fn processAztecCommand(allocator: std.mem.Allocator, args: [][:0]u8) u8 {
    if (args.len == 0) {
        print("Usage: bb aztec-process <input_artifact> [output_artifact]\n", .{});
        return 1;
    }

    const input_artifact = args[0];
    const output_artifact = if (args.len > 1) args[1] else input_artifact;

    processArtifact(allocator, input_artifact, output_artifact) catch |err| {
        print("Error processing: {s}: {}\n", .{ input_artifact, err });
        return 1;
    };

    print("Successfully processed: {s} -> {s}\n", .{ input_artifact, output_artifact });
    print("Contract postprocessing complete!\n", .{});
    return 0;
}

fn processArtifact(allocator: std.mem.Allocator, input_path: []const u8, output_path: []const u8) !void {
    // Step 1: Transpile the artifact
    const input_cstr = try allocator.dupeZ(u8, input_path);
    defer allocator.free(input_cstr);

    const output_cstr = try allocator.dupeZ(u8, output_path);
    defer allocator.free(output_cstr);

    var result = c.avm_transpile_file(input_cstr.ptr, output_cstr.ptr);
    defer c.avm_free_result(&result);

    if (result.success == 0) {
        if (result.error_message) |msg| {
            const msg_len = std.mem.len(msg);
            if (msg_len > 0 and std.mem.eql(u8, "Contract already transpiled", msg[0..msg_len])) {
                // Contract already transpiled, copy input to output if different
                if (!std.mem.eql(u8, input_path, output_path)) {
                    try std.fs.cwd().copyFile(input_path, std.fs.cwd(), output_path, .{});
                    print("Copied already transpiled artifact: {s} -> {s}\n", .{ input_path, output_path });
                }
            } else if (msg_len > 0) {
                print("Transpilation failed: {s}\n", .{msg});
                return error.TranspilationFailed;
            }
        } else {
            return error.TranspilationFailed;
        }
    }

    print("Transpiled: {s} -> {s}\n", .{ input_path, output_path });

    // Verify output file exists before proceeding
    try std.fs.cwd().access(output_path, .{});

    // Step 2: Generate verification keys (using the output artifact)
    try generateVerificationKeys(allocator, output_path);
}

fn generateVerificationKeys(allocator: std.mem.Allocator, artifact_path: []const u8) !void {
    const artifact_name = std.fs.path.basename(artifact_path);
    const artifact_dir = std.fs.path.dirname(artifact_path) orelse ".";
    const cache_dir_path = try std.fmt.allocPrint(allocator, "{s}/cache", .{artifact_dir});
    defer allocator.free(cache_dir_path);

    // Create cache directory
    std.fs.cwd().makePath(cache_dir_path) catch {};

    print("Generating verification keys for functions in {s}. Cache directory: {s}\n", .{ artifact_name, cache_dir_path });

    // Read and parse the artifact JSON to get private functions
    print("Reading artifact file: {s}\n", .{artifact_path});
    const artifact_content = try std.fs.cwd().readFileAlloc(allocator, artifact_path, 100 * 1024 * 1024);
    defer allocator.free(artifact_content);

    var parsed = try std.json.parseFromSlice(std.json.Value, allocator, artifact_content, .{});
    defer parsed.deinit();

    const functions = parsed.value.object.get("functions");
    if (functions == null) {
        print("Warning: No functions found in artifact\n", .{});
        return;
    }

    // Generate VKs for private functions and update the JSON in memory
    try generateVKsForFunctions(allocator, artifact_name, cache_dir_path, &parsed.value, functions.?.array);

    // Write the complete updated JSON to file once at the end
    var out: std.io.Writer.Allocating = .init(allocator);
    try std.json.Stringify.value(parsed.value, .{ .whitespace = .indent_2 }, &out.writer);
    var arr = out.toArrayList();
    defer arr.deinit(allocator);

    try std.fs.cwd().writeFile(.{ .sub_path = artifact_path, .data = arr.items });
}

fn generateVKsForFunctions(
    allocator: std.mem.Allocator,
    artifact_name: []const u8,
    cache_dir_path: []const u8,
    parsed_json: *std.json.Value,
    functions: std.json.Array,
) !void {
    const parsed_functions = parsed_json.object.getPtr("functions").?;

    for (functions.items, 0..) |function, fn_index| {
        const func_obj = function.object;

        // Check if this is a private function (not public and not unconstrained)
        const custom_attributes = func_obj.get("custom_attributes");
        const is_unconstrained = func_obj.get("is_unconstrained");

        var is_public = false;
        if (custom_attributes) |attrs| {
            for (attrs.array.items) |attr| {
                if (std.mem.eql(u8, attr.string, "public")) {
                    is_public = true;
                    break;
                }
            }
        }

        const is_constrained = is_unconstrained == null or !is_unconstrained.?.bool;

        if (is_public or !is_constrained) {
            continue; // Skip public or unconstrained functions
        }

        const fn_name = func_obj.get("name").?.string;
        print("Processing function: {s}\n", .{fn_name});

        // Generate VK for this function and add it to the parsed JSON
        const vk_data = try generateVKDataForFunction(allocator, artifact_name, cache_dir_path, fn_index, function);
        defer allocator.free(vk_data);

        // Add VK data to the parsed JSON
        const vk_string = try allocator.dupe(u8, vk_data);
        defer allocator.free(vk_string);

        const vk_value = std.json.Value{ .string = vk_string };
        try parsed_functions.array.items[fn_index].object.put("verification_key", vk_value);
    }
}

fn generateVKDataForFunction(
    allocator: std.mem.Allocator,
    artifact_name: []const u8,
    cache_dir_path: []const u8,
    fn_index: usize,
    function: std.json.Value,
) ![]const u8 {
    // Use a simple hash based on function index and name for cache key
    const fn_name = function.object.get("name").?.string;
    const hash_input = try std.fmt.allocPrint(allocator, "{d}-{s}", .{ fn_index, fn_name });
    defer allocator.free(hash_input);

    const func_hash = try computeSha256(allocator, hash_input);
    defer allocator.free(func_hash);

    const vk_cache_path = try std.fmt.allocPrint(allocator, "{s}/{s}_{s}.vk", .{ cache_dir_path, artifact_name, func_hash });
    defer allocator.free(vk_cache_path);

    // Check if VK already exists in cache
    if (std.fs.cwd().access(vk_cache_path, .{})) {
        print("Using cached verification key for function \"{s}\"\n", .{fn_name});
        const raw_vk = try std.fs.cwd().readFileAlloc(allocator, vk_cache_path, 10 * 1024 * 1024);
        defer allocator.free(raw_vk);

        // Encode to base64 for JSON storage
        const encoder = std.base64.standard.Encoder;
        const encoded_size = encoder.calcSize(raw_vk.len);
        const encoded_vk = try allocator.alloc(u8, encoded_size);
        _ = encoder.encode(encoded_vk, raw_vk);
        return encoded_vk;
    } else |_| {
        // Generate new VK
        const base64_vk = try generateAndReturnVK(allocator, function);

        // Decode base64 to get raw bytes for caching
        const decoder = std.base64.standard.Decoder;
        const decoded_size = try decoder.calcSizeForSlice(base64_vk);
        const raw_vk = try allocator.alloc(u8, decoded_size);
        defer allocator.free(raw_vk);

        _ = try decoder.decode(raw_vk, base64_vk);

        // Cache the raw VK bytes
        std.fs.cwd().writeFile(.{ .sub_path = vk_cache_path, .data = raw_vk }) catch {};

        return base64_vk;
    }
}

fn getByteCode(allocator: std.mem.Allocator, function: std.json.Value) ![]const u8 {
    // Extract bytecode from the function
    const bytecode_obj = function.object.get("bytecode") orelse return error.NoBytecode;
    const bytecode_b64 = switch (bytecode_obj) {
        .string => |str| str,
        else => return error.BytecodeNotString,
    };

    // Decode base64
    print("Base64 bytecode length: {d}\n", .{bytecode_b64.len});
    const decoder = std.base64.standard.Decoder;
    const decoded_size = try decoder.calcSizeForSlice(bytecode_b64);
    const decoded_compressed = try allocator.alloc(u8, decoded_size);
    defer allocator.free(decoded_compressed);
    try decoder.decode(decoded_compressed, bytecode_b64);
    print("Decoded compressed data: {d} bytes\n", .{decoded_compressed.len});

    // Decompress using Zig std library
    if (decoded_compressed.len < 18 or decoded_compressed[0] != 0x1f or decoded_compressed[1] != 0x8b) {
        return error.InvalidGzip;
    }
    var reader: std.Io.Reader = .fixed(decoded_compressed);
    var decompress_buffer: [std.compress.flate.max_window_len]u8 = undefined;
    var decompress: std.compress.flate.Decompress = .init(&reader, .gzip, &decompress_buffer);
    var writer: std.io.Writer.Allocating = .init(allocator);
    const decompressed_len = try decompress.reader.streamRemaining(&writer.writer);
    print("Decompressed bytecode: {d} bytes\n", .{decompressed_len});

    return writer.toOwnedSlice();
}

fn generateAndReturnVK(allocator: std.mem.Allocator, function: std.json.Value) ![]const u8 {
    const fn_name = function.object.get("name").?.string;
    print("Generating verification key for function {s}\n", .{fn_name});

    const bytecode = try getByteCode(allocator, function);

    // Call the C function to generate VK
    var vk_output_len: usize = 0;
    const vk_output_ptr: [*c]u8 = 0;
    defer std.c.free(vk_output_ptr);
    const result_code = bbapi_compute_standalone_vk(
        bytecode.ptr,
        bytecode.len,
        @ptrCast(vk_output_ptr),
        &vk_output_len,
    );

    if (result_code != 0) {
        return error.VKGenerationFailed;
    }

    // Create slice from C output.
    const vk_data = vk_output_ptr.*[0..vk_output_len];

    // Convert to base64 for storage.
    const encoder = std.base64.standard.Encoder;
    const encoded_size = encoder.calcSize(vk_data.len);
    const final_vk = try allocator.alloc(u8, encoded_size);

    _ = encoder.encode(final_vk, vk_data);

    return final_vk;
}

fn computeSha256(allocator: std.mem.Allocator, input: []const u8) ![]const u8 {
    var hasher = std.crypto.hash.sha2.Sha256.init(.{});
    hasher.update(input);
    var hash: [32]u8 = undefined;
    hasher.final(&hash);

    // Convert to hex string
    const hex_chars = "0123456789abcdef";
    var hex_string = try allocator.alloc(u8, 64);
    for (hash, 0..) |byte, i| {
        hex_string[i * 2] = hex_chars[byte >> 4];
        hex_string[i * 2 + 1] = hex_chars[byte & 0xf];
    }
    return hex_string;
}
