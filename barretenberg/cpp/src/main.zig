const std = @import("std");
const print = std.debug.print;
const App = @import("yazap").App;
const Arg = @import("yazap").Arg;
const ArgMatches = @import("yazap").ArgMatches;

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

    // Check if this is an aztec-process command before using yazap
    if (args.len > 1 and std.mem.eql(u8, args[1], "aztec-process")) {
        var app = App.init(allocator, "bb", "Barretenberg CLI");
        defer app.deinit();

        var root = app.rootCommand();

        // Add aztec-process subcommand
        var aztec_cmd = app.createCommand("aztec-process", "Process Aztec contract artifacts");
        try aztec_cmd.addArg(Arg.positional("input_artifact", "Input artifact path", null));
        try aztec_cmd.addArg(Arg.positional("output_artifact", "Output artifact path (optional)", null));
        try aztec_cmd.addArg(Arg.booleanOption("force", 'f', "Force rebuild even if cache exists"));
        aztec_cmd.setProperty(.help_on_empty_args);

        try root.addSubcommand(aztec_cmd);

        const matches = try app.parseProcess();

        // Check for aztec-process command
        if (matches.subcommandMatches("aztec-process")) |aztec_matches| {
            if (!aztec_matches.containsArgs()) {
                try app.displaySubcommandHelp();
                return 1;
            }

            const input = aztec_matches.getSingleValue("input_artifact") orelse {
                print("Error: input_artifact is required\n", .{});
                try app.displaySubcommandHelp();
                return 1;
            };
            const output = aztec_matches.getSingleValue("output_artifact") orelse input;
            const force = aztec_matches.containsArg("force");

            return processAztecCommand(allocator, input, output, force);
        }
    }

    // Fall back to existing bb CLI for all other commands
    const c_args = try allocator.alloc([*:0]u8, args.len);
    for (args, 0..) |arg, i| {
        c_args[i] = @ptrCast(arg.ptr);
    }

    const result = bb_parse_and_run_cli_command_c(@intCast(args.len), c_args.ptr);
    return @intCast(result);
}

fn processAztecCommand(allocator: std.mem.Allocator, input_artifact: []const u8, output_artifact: []const u8, force: bool) u8 {
    processArtifact(allocator, input_artifact, output_artifact, force) catch |err| {
        print("Error processing: {s}: {}\n", .{ input_artifact, err });
        return 1;
    };

    print("Successfully processed: {s} -> {s}\n", .{ input_artifact, output_artifact });
    print("Contract postprocessing complete!\n", .{});
    return 0;
}

fn processArtifact(allocator: std.mem.Allocator, input_path: []const u8, output_path: []const u8, force: bool) !void {
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
    try generateVerificationKeys(allocator, output_path, force);
}

fn generateVerificationKeys(allocator: std.mem.Allocator, artifact_path: []const u8, force: bool) !void {
    const artifact_name = std.fs.path.basename(artifact_path);

    // Use ~/.bb/vk_cache as cache directory
    const home_dir = std.posix.getenv("HOME") orelse ".";
    const cache_dir_path = try std.fmt.allocPrint(allocator, "{s}/.bb/vk_cache", .{home_dir});
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
    try generateVKsForFunctions(allocator, cache_dir_path, &parsed.value, functions.?.array, force);

    // Write the complete updated JSON to file once at the end
    var out: std.io.Writer.Allocating = .init(allocator);
    try std.json.Stringify.value(parsed.value, .{ .whitespace = .indent_2 }, &out.writer);
    var arr = out.toArrayList();
    defer arr.deinit(allocator);

    try std.fs.cwd().writeFile(.{ .sub_path = artifact_path, .data = arr.items });
}

const WorkerData = struct {
    start_index: usize,
    end_index: usize,
    functions: []std.json.Value,
    cache_dir_path: []const u8,
    allocator: std.mem.Allocator,
    force: bool,
};

fn vkWorkerProcess(data: WorkerData) void {
    for (data.start_index..data.end_index) |fn_index| {
        const function = data.functions[fn_index];
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
        print("Processing function: {s} (PID: {d})\n", .{ fn_name, std.c.getpid() });

        // Get raw bytecode first
        const bytecode = getByteCode(data.allocator, function) catch {
            std.posix.exit(1);
        };
        defer data.allocator.free(bytecode);

        // Generate VK for this function - this will cache it automatically
        const vk_data = generateCachedVK(data.allocator, data.cache_dir_path, bytecode, data.force) catch {
            std.posix.exit(1);
        };
        defer data.allocator.free(vk_data);

        // print("Cached VK for function: {s}\n", .{fn_name});
    }
}

fn generateVKsForFunctions(
    allocator: std.mem.Allocator,
    cache_dir_path: []const u8,
    parsed_json: *std.json.Value,
    functions: std.json.Array,
    force: bool,
) !void {
    const parsed_functions = parsed_json.object.getPtr("functions").?;

    // Determine number of processes to use
    const cpu_count = std.Thread.getCpuCount() catch 1;
    const process_count = @min(functions.items.len, cpu_count);

    if (process_count <= 1) {
        // Single process - handle directly
        const data = WorkerData{
            .start_index = 0,
            .end_index = functions.items.len,
            .functions = functions.items,
            .cache_dir_path = cache_dir_path,
            .allocator = allocator,
            .force = force,
        };
        vkWorkerProcess(data);
    } else {
        // Multi-process - fork workers
        var pids = try std.ArrayList(std.posix.pid_t).initCapacity(allocator, process_count);
        defer pids.deinit(allocator);

        const functions_per_process = (functions.items.len + process_count - 1) / process_count;

        for (0..process_count) |i| {
            const start_index = i * functions_per_process;
            const end_index = @min((i + 1) * functions_per_process, functions.items.len);

            if (start_index >= functions.items.len) break;

            const pid = try std.posix.fork();
            if (pid == 0) {
                // Child process
                const data = WorkerData{
                    .start_index = start_index,
                    .end_index = end_index,
                    .functions = functions.items,
                    .cache_dir_path = cache_dir_path,
                    .allocator = allocator,
                    .force = force,
                };
                vkWorkerProcess(data);
                std.posix.exit(0);
            } else {
                // Parent process - store child PID
                pids.appendAssumeCapacity(pid);
            }
        }

        // Wait for all children to complete
        for (pids.items) |pid| {
            const result = std.posix.waitpid(pid, 0);
            if (result.status != 0) {
                return error.VKGenerationFailed;
            }
        }
    }

    // Collect results from cache and update JSON
    for (functions.items, 0..) |function, fn_index| {
        const func_obj = function.object;

        // Check if this is a private function (same logic as worker)
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

        // Get bytecode to compute cache key
        const bytecode = try getByteCode(allocator, function);
        defer allocator.free(bytecode);

        // Read from cache (should exist now)
        const vk_data = try generateCachedVK(allocator, cache_dir_path, bytecode, force);
        defer allocator.free(vk_data);

        // Encode to base64 for JSON storage
        const encoder = std.base64.standard.Encoder;
        const encoded_size = encoder.calcSize(vk_data.len);
        const encoded_vk = try allocator.alloc(u8, encoded_size);
        _ = encoder.encode(encoded_vk, vk_data);

        const vk_value = std.json.Value{ .string = encoded_vk };
        try parsed_functions.array.items[fn_index].object.put("verification_key", vk_value);
    }
}

fn generateCachedVK(
    allocator: std.mem.Allocator,
    cache_dir_path: []const u8,
    bytecode: []const u8,
    force: bool,
) ![]const u8 {
    // Create SHA256 hash of bytecode for cache filename
    var hasher = std.crypto.hash.sha2.Sha256.init(.{});
    hasher.update(bytecode);
    var hash: [32]u8 = undefined;
    hasher.final(&hash);

    // Convert hash to hex string
    const hex_str = std.fmt.bytesToHex(hash, .lower);

    const vk_cache_path = try std.fmt.allocPrint(allocator, "{s}/{s}.vk", .{ cache_dir_path, hex_str });
    defer allocator.free(vk_cache_path);

    // Check cache unless force is true
    if (!force) {
        if (std.fs.cwd().access(vk_cache_path, .{})) {
            // print("Using cached verification key\n", .{});
            return try std.fs.cwd().readFileAlloc(allocator, vk_cache_path, 4 * 1024);
        } else |_| {
            // Cache doesn't exist, generate new VK
        }
    }

    // Force is true or cache doesn't exist, generate new VK
    const raw_vk = try generateVK(allocator, bytecode);
    // Cache the raw VK bytes and return.
    std.fs.cwd().writeFile(.{ .sub_path = vk_cache_path, .data = raw_vk }) catch {};
    return raw_vk;
}

fn getByteCode(allocator: std.mem.Allocator, function: std.json.Value) ![]const u8 {
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

fn generateVK(allocator: std.mem.Allocator, bytecode: []const u8) ![]const u8 {
    var vk_output_len: usize = 0;
    var vk_output_ptr: [*]u8 = undefined;
    const result_code = bbapi_compute_standalone_vk(
        bytecode.ptr,
        bytecode.len,
        &vk_output_ptr,
        &vk_output_len,
    );

    if (result_code != 0) {
        return error.VKGenerationFailed;
    }

    const vk_data = vk_output_ptr[0..vk_output_len];
    return try allocator.dupe(u8, vk_data);
}
