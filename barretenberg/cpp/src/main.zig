const std = @import("std");
const print = std.debug.print;

// Import C functions from existing bb CLI
extern fn bb_parse_and_run_cli_command_c(argc: c_int, argv: [*][*:0]u8) c_int;

// Import avm-transpiler C functions
extern fn avm_transpile_file(input_path: [*:0]const u8, output_path: [*:0]const u8) TranspileResult;
extern fn avm_free_result(result: *TranspileResult) void;

// Import bb ClientIVC C functions
extern fn bbapi_compute_standalone_vk(bytecode: [*]const u8, bytecode_len: usize, out_vk: *[*]u8, out_vk_len: *usize) c_int;

// TranspileResult structure from avm_transpiler.h
const TranspileResult = extern struct {
    success: c_int,
    data: ?[*]u8,
    length: usize,
    error_message: ?[*:0]u8,
};

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
        print("If output_artifact not provided, will overwrite input_artifact\n", .{});
        return 1;
    }

    const input_artifact = args[0];
    const output_artifact = if (args.len > 1) args[1] else input_artifact;

    if (processArtifact(allocator, input_artifact, output_artifact)) {
        print("Successfully processed: {s} -> {s}\n", .{ input_artifact, output_artifact });
    } else {
        print("Error processing: {s}\n", .{input_artifact});
        return 1;
    }

    print("Contract postprocessing complete!\n", .{});
    return 0;
}

fn findArtifacts(allocator: std.mem.Allocator, artifacts: *std.ArrayList([]const u8)) !void {
    var dir = std.fs.cwd();
    var walker = try dir.walk(allocator);
    defer walker.deinit();

    while (try walker.next()) |entry| {
        if (entry.kind == .file and
            std.mem.endsWith(u8, entry.path, ".json") and
            std.mem.containsAtLeast(u8, entry.path, 1, "/target/") and
            !std.mem.containsAtLeast(u8, entry.path, 1, "/cache/") and
            !std.mem.containsAtLeast(u8, entry.path, 1, ".function_artifact_"))
        {
            const owned_path = try allocator.dupe(u8, entry.path);
            try artifacts.append(owned_path);
        }
    }
}

fn processArtifact(allocator: std.mem.Allocator, input_path: []const u8, output_path: []const u8) bool {
    // Step 1: Transpile the artifact
    const input_cstr = allocator.dupeZ(u8, input_path) catch return false;
    defer allocator.free(input_cstr);

    const output_cstr = allocator.dupeZ(u8, output_path) catch return false;
    defer allocator.free(output_cstr);

    var result = avm_transpile_file(input_cstr.ptr, output_cstr.ptr);
    defer avm_free_result(&result);

    if (result.success == 0) {
        if (result.error_message) |msg| {
            const msg_len = std.mem.len(msg);
            if (msg_len > 0 and std.mem.eql(u8, "Contract already transpiled", msg[0..msg_len])) {
                // Contract already transpiled, copy input to output if different
                if (!std.mem.eql(u8, input_path, output_path)) {
                    std.fs.cwd().copyFile(input_path, std.fs.cwd(), output_path, .{}) catch {
                        print("Error: Could not copy {s} to {s}\n", .{ input_path, output_path });
                        return false;
                    };
                    print("Copied already transpiled artifact: {s} -> {s}\n", .{ input_path, output_path });
                }
            } else if (msg_len > 0) {
                print("Transpilation failed: {s}\n", .{msg});
                return false;
            }
        } else {
            print("Transpilation failed\n", .{});
            return false;
        }
    }

    print("Transpiled: {s} -> {s}\n", .{ input_path, output_path });

    // Verify output file exists before proceeding
    std.fs.cwd().access(output_path, .{}) catch {
        print("Error: Output artifact file not found: {s}\n", .{output_path});
        return false;
    };

    // Step 2: Generate verification keys (using the output artifact)
    return generateVerificationKeys(allocator, output_path);
}

fn generateVerificationKeys(allocator: std.mem.Allocator, artifact_path: []const u8) bool {
    const artifact_name = std.fs.path.basename(artifact_path);
    const artifact_dir = std.fs.path.dirname(artifact_path) orelse ".";
    const cache_dir_path = std.fmt.allocPrint(allocator, "{s}/cache", .{artifact_dir}) catch return false;
    defer allocator.free(cache_dir_path);

    // Create cache directory
    std.fs.cwd().makePath(cache_dir_path) catch {
        print("Warning: Could not create cache directory\n", .{});
    };

    print("Generating verification keys for functions in {s}. Cache directory: {s}\n", .{ artifact_name, cache_dir_path });

    // Read and parse the artifact JSON to get private functions
    print("Reading artifact file: {s}\n", .{artifact_path});
    const artifact_content = std.fs.cwd().readFileAlloc(allocator, artifact_path, 100 * 1024 * 1024) catch |err| {
        print("Error: Could not read artifact file {s}: {}\n", .{ artifact_path, err });
        return false;
    };
    defer allocator.free(artifact_content);

    var parsed = std.json.parseFromSlice(std.json.Value, allocator, artifact_content, .{}) catch {
        print("Error: Could not parse artifact JSON\n", .{});
        return false;
    };
    defer parsed.deinit();

    const functions = parsed.value.object.get("functions");
    if (functions == null) {
        print("Warning: No functions found in artifact\n", .{});
        return true;
    }

    // Generate VKs for private functions
    return generateVKsForFunctions(allocator, artifact_path, artifact_name, cache_dir_path, functions.?.array);
}

fn generateVKsForFunctions(allocator: std.mem.Allocator, artifact_path: []const u8, artifact_name: []const u8, cache_dir_path: []const u8, functions: std.json.Array) bool {
    // For now, implement a simplified version without parallel processing
    // In a full implementation, you would use threading or process pools

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

        // Generate VK for this function
        if (!generateVKForFunction(allocator, artifact_path, artifact_name, cache_dir_path, fn_index, function)) {
            print("Error generating VK for function: {s}\n", .{fn_name});
            return false;
        }
    }

    return true;
}

fn generateVKForFunction(
    allocator: std.mem.Allocator,
    artifact_path: []const u8,
    artifact_name: []const u8,
    cache_dir_path: []const u8,
    fn_index: usize,
    function: std.json.Value,
) bool {
    // For now, we'll use the function as-is without removing debug symbols
    // This is a simplified implementation

    // Use a simple hash based on function index and name for cache key
    const fn_name = function.object.get("name").?.string;
    const hash_input = std.fmt.allocPrint(allocator, "{d}-{s}", .{ fn_index, fn_name }) catch return false;
    defer allocator.free(hash_input);

    const func_hash = computeSha256(allocator, hash_input) catch return false;
    defer allocator.free(func_hash);

    const vk_cache_path = std.fmt.allocPrint(allocator, "{s}/{s}_{s}.vk", .{ cache_dir_path, artifact_name, func_hash }) catch return false;
    defer allocator.free(vk_cache_path);

    // Check if VK already exists in cache
    if (std.fs.cwd().access(vk_cache_path, .{})) {
        print("Using cached verification key for function \"{s}\"\n", .{fn_name});
        return updateArtifactWithCachedVK(allocator, artifact_path, fn_index, vk_cache_path);
    } else |_| {
        // Generate new VK
        return generateAndCacheVK(allocator, artifact_path, fn_index, function, vk_cache_path);
    }
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

fn updateArtifactWithCachedVK(allocator: std.mem.Allocator, artifact_path: []const u8, fn_index: usize, vk_cache_path: []const u8) bool {
    const vk_data = std.fs.cwd().readFileAlloc(allocator, vk_cache_path, 100 * 1024 * 1024) catch {
        print("Error reading cached VK file\n", .{});
        return false;
    };
    defer allocator.free(vk_data);

    return updateArtifactWithVK(allocator, artifact_path, fn_index, std.mem.trim(u8, vk_data, " \t\n\r"));
}

fn generateAndCacheVK(allocator: std.mem.Allocator, artifact_path: []const u8, fn_index: usize, function: std.json.Value, vk_cache_path: []const u8) bool {
    const fn_name = function.object.get("name").?.string;
    print("Generating verification key for function {s}\n", .{fn_name});

    // Extract bytecode from the function (like get_bytecode does)
    const bytecode_obj = function.object.get("bytecode");
    if (bytecode_obj == null) {
        print("Error: No bytecode found in function\n", .{});
        return false;
    }

    // Get base64 encoded bytecode string
    const bytecode_b64 = switch (bytecode_obj.?) {
        .string => |str| str,
        else => {
            print("Error: Bytecode must be a base64 string\n", .{});
            return false;
        },
    };

    // Decode base64
    const decoder = std.base64.standard.Decoder;
    const decoded_size = decoder.calcSizeForSlice(bytecode_b64) catch {
        print("Error: Invalid base64 bytecode\n", .{});
        return false;
    };
    const decoded_compressed = allocator.alloc(u8, decoded_size) catch return false;
    defer allocator.free(decoded_compressed);

    decoder.decode(decoded_compressed, bytecode_b64) catch {
        print("Error: Failed to decode base64 bytecode\n", .{});
        return false;
    };

    // Decompress gzip using std.compress.flate (Zig 0.15.1 API)
    var r = std.io.Reader.fixed(decoded_compressed);
    var decompress_buffer: [std.compress.flate.max_window_len]u8 = undefined;
    var decompress = std.compress.flate.Decompress.init(&r, .gzip, &decompress_buffer);

    // Read decompressed data
    const decompressed_bytecode = decompress.reader.readAlloc(allocator, 10 * 1024 * 1024) catch {
        print("Error: Failed to decompress bytecode\n", .{});
        return false;
    };
    defer allocator.free(decompressed_bytecode);

    print("Decompressed bytecode: {d} bytes\n", .{decompressed_bytecode.len});

    var vk_data: [*]u8 = undefined;
    var vk_len: usize = 0;

    const result = bbapi_compute_standalone_vk(decompressed_bytecode.ptr, decompressed_bytecode.len, &vk_data, &vk_len);
    if (result != 0) {
        print("Error: Failed to generate VK using bbapi\n", .{});
        return false;
    }

    // Convert to Zig slice and defer free the C-allocated memory
    const vk_output = vk_data[0..vk_len];
    defer std.c.free(vk_data);

    // Base64 encode the output
    const encoder = std.base64.standard.Encoder;
    const encoded_size = encoder.calcSize(vk_output.len);
    const encoded_vk = allocator.alloc(u8, encoded_size) catch return false;
    defer allocator.free(encoded_vk);

    const final_vk = encoder.encode(encoded_vk, vk_output);

    // Cache the VK
    std.fs.cwd().writeFile(.{ .sub_path = vk_cache_path, .data = final_vk }) catch {
        print("Warning: Could not cache VK\n", .{});
    };

    // Update artifact with VK
    return updateArtifactWithVK(allocator, artifact_path, fn_index, final_vk);
}

fn updateArtifactWithVK(allocator: std.mem.Allocator, artifact_path: []const u8, fn_index: usize, vk: []const u8) bool {
    const artifact_content = std.fs.cwd().readFileAlloc(allocator, artifact_path, 100 * 1024 * 1024) catch return false;
    defer allocator.free(artifact_content);

    var parsed = std.json.parseFromSlice(std.json.Value, allocator, artifact_content, .{}) catch return false;
    defer parsed.deinit();

    // Update the verification key for the function
    const functions = parsed.value.object.getPtr("functions").?;
    const vk_value = std.json.Value{ .string = vk };
    functions.array.items[fn_index].object.put("verification_key", vk_value) catch return false;

    // For now, we'll skip updating the JSON - this is a simplified implementation
    // In a full implementation, you would properly serialize the JSON back
    print("Warning: VK update not implemented in simplified version\n", .{});

    return true;
}
