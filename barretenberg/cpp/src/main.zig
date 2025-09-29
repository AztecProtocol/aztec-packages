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

// Wraps getByteCode to provide linkable C function for bb to call.
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

pub fn main() !u8 {
    var arena = std.heap.ArenaAllocator.init(std.heap.page_allocator);
    defer arena.deinit();
    const allocator = arena.allocator();

    const args = try std.process.argsAlloc(allocator);

    // Check if this is an aztec-process command before using yazap.
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

            processArtifact(allocator, input, output, force) catch |err| {
                print("Error processing: {s}: {}\n", .{ input, err });
                return 1;
            };

            print("Successfully processed: {s} -> {s}\n", .{ input, output });
            return 0;
        }
    }

    // Fall back to existing bb CLI for all other commands.
    const c_args = try allocator.alloc([*:0]u8, args.len);
    for (args, 0..) |arg, i| {
        c_args[i] = @ptrCast(arg.ptr);
    }

    const result = bb_parse_and_run_cli_command_c(@intCast(args.len), c_args.ptr);
    return @intCast(result);
}

fn processArtifact(allocator: std.mem.Allocator, input_path: []const u8, output_path: []const u8, force: bool) !void {
    // Step 1: Transpile the artifact.
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
                // Contract already transpiled, copy input to output if different.
                if (!std.mem.eql(u8, input_path, output_path)) {
                    try std.fs.cwd().copyFile(input_path, std.fs.cwd(), output_path, .{});
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

    // Verify output file exists before proceeding.
    try std.fs.cwd().access(output_path, .{});

    // Step 2: Generate verification keys (using the output artifact).
    try generateVerificationKeys(allocator, output_path, force);
}

fn isPrivateConstrainedFunction(function: std.json.Value) bool {
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

    return !is_public and is_constrained;
}

fn generateVerificationKeys(allocator: std.mem.Allocator, artifact_path: []const u8, force: bool) !void {
    const artifact_name = std.fs.path.basename(artifact_path);

    // Use ~/.bb/vk_cache as cache directory.
    const home_dir = std.posix.getenv("HOME") orelse ".";
    const cache_dir_path = try std.fmt.allocPrint(allocator, "{s}/.bb/vk_cache", .{home_dir});
    defer allocator.free(cache_dir_path);

    // Create cache directory.
    std.fs.cwd().makePath(cache_dir_path) catch {};

    print("Generating verification keys for functions in {s}.\nCache directory: {s}\n", .{
        artifact_name,
        cache_dir_path,
    });

    // Read and parse the artifact JSON to get private functions.
    const artifact_content = try std.fs.cwd().readFileAlloc(allocator, artifact_path, 100 * 1024 * 1024);
    defer allocator.free(artifact_content);

    var parsed = try std.json.parseFromSlice(std.json.Value, allocator, artifact_content, .{});
    defer parsed.deinit();

    const functions = parsed.value.object.get("functions");
    if (functions == null) {
        print("Warning: No functions found in artifact.\n", .{});
        return;
    }

    // Filter to only private constrained functions upfront.
    var private_functions = std.ArrayList(*std.json.Value).empty;
    defer private_functions.deinit(allocator);

    for (functions.?.array.items) |*function| {
        if (isPrivateConstrainedFunction(function.*)) {
            try private_functions.append(allocator, function);
        }
    }

    if (private_functions.items.len == 0) {
        print("No private constrained functions found.\n", .{});
        return;
    }

    // Generate VKs for filtered functions and update the JSON in memory.
    try generateVKsForFunctions(allocator, cache_dir_path, private_functions.items, force);

    // Write the complete updated JSON directly to file.
    const file = try std.fs.cwd().createFile(artifact_path, .{});
    defer file.close();

    var write_buffer: [8192]u8 = undefined;
    var file_writer = file.writer(&write_buffer);
    try std.json.Stringify.value(parsed.value, .{ .whitespace = .indent_2 }, &file_writer.interface);
}

const WorkerData = struct {
    start_index: usize,
    end_index: usize,
    functions: []*std.json.Value,
    cache_dir_path: []const u8,
    allocator: std.mem.Allocator,
    force: bool,
};

const ChildInfo = struct {
    pid: std.posix.pid_t,
    pipe_read: std.posix.fd_t,
};

fn generateVKsForFunctions(
    allocator: std.mem.Allocator,
    cache_dir_path: []const u8,
    functions: []*std.json.Value,
    force: bool,
) !void {

    // Determine number of processes to use
    const cpu_count = std.Thread.getCpuCount() catch 1;
    const process_count = @min(functions.len, cpu_count);

    // Always use fork for output control
    {
        // Multi-process - fork workers with pipes for output
        var child_infos = try std.ArrayList(ChildInfo).initCapacity(allocator, process_count);
        defer child_infos.deinit(allocator);

        const functions_per_process = (functions.len + process_count - 1) / process_count;

        for (0..process_count) |i| {
            const start_index = i * functions_per_process;
            const end_index = @min((i + 1) * functions_per_process, functions.len);

            if (start_index >= functions.len) break;

            // Create pipe for this child's output
            const pipe_fds = try std.posix.pipe();

            const pid = try std.posix.fork();
            if (pid == 0) {
                // Child process.
                // Close read end in child.
                std.posix.close(pipe_fds[0]);

                // Now redirect stdout/stderr to pipe for Zig output
                try std.posix.dup2(pipe_fds[1], std.posix.STDOUT_FILENO);
                try std.posix.dup2(pipe_fds[1], std.posix.STDERR_FILENO);

                const data = WorkerData{
                    .start_index = start_index,
                    .end_index = end_index,
                    .functions = functions,
                    .cache_dir_path = cache_dir_path,
                    .allocator = allocator,
                    .force = force,
                };
                vkWorkerProcess(data);
                std.posix.exit(0);
            } else {
                // Parent process.
                // Close write end in parent.
                std.posix.close(pipe_fds[1]);
                child_infos.appendAssumeCapacity(ChildInfo{
                    .pid = pid,
                    .pipe_read = pipe_fds[0],
                });
            }
        }

        // Wait for children to complete and print their output.
        for (child_infos.items, 0..) |info, i| {
            // Wait for the child to complete first.
            const result = std.posix.waitpid(info.pid, 0);
            if (result.status != 0) {
                std.posix.close(info.pipe_read);
                return error.VKGenerationFailed;
            }

            // Read all output (assume < 64KB). Child would hang beyond this.
            var output_buffer: [65536]u8 = undefined;
            const bytes_read = std.posix.read(info.pipe_read, &output_buffer) catch 0;
            std.posix.close(info.pipe_read);

            if (bytes_read > 0) {
                const output = output_buffer[0..bytes_read];
                const function_name = functions[i].object.get("name") orelse unreachable;

                print("\n--- {s} ---\n", .{function_name.string});
                print("{s}", .{output});
                if (output[output.len - 1] != '\n') {
                    print("\n", .{});
                }
            }
        }
        print("\n", .{});
    }

    // Collect results from cache and update JSON object in memory.
    for (functions) |function| {
        // Get bytecode to compute cache key. Ugly duplicated work. Can we get the key from the worker?
        const bytecode = try getByteCode(allocator, function.*);
        defer allocator.free(bytecode);

        // Read from cache (should exist now) - never force since children already generated.
        const vk_data = try getCachedVK(allocator, cache_dir_path, bytecode);
        defer allocator.free(vk_data);

        // Encode to base64 for JSON.
        const encoder = std.base64.standard.Encoder;
        const encoded_size = encoder.calcSize(vk_data.len);
        const encoded_vk = try allocator.alloc(u8, encoded_size);
        _ = encoder.encode(encoded_vk, vk_data);

        const vk_value = std.json.Value{ .string = encoded_vk };
        try function.object.put("verification_key", vk_value);
    }
}

fn vkWorkerProcess(data: WorkerData) void {
    for (data.start_index..data.end_index) |fn_index| {
        const function = data.functions[fn_index];
        const func_obj = function.object;
        const fn_name = func_obj.get("name").?.string;
        print("Processing function: {s} (PID: {d})\n", .{ fn_name, std.c.getpid() });

        // Get raw bytecode first
        const bytecode = getByteCode(data.allocator, function.*) catch {
            std.posix.exit(1);
        };
        defer data.allocator.free(bytecode);

        // Generate VK for this function - this will cache it automatically
        generateCachedVK(data.allocator, data.cache_dir_path, bytecode, data.force) catch {
            std.posix.exit(1);
        };
    }
}

fn computeBytecodeHash(bytecode: []const u8) [64]u8 {
    var hasher = std.crypto.hash.sha2.Sha256.init(.{});
    hasher.update(bytecode);
    var hash: [32]u8 = undefined;
    hasher.final(&hash);
    return std.fmt.bytesToHex(hash, .lower);
}

fn getCachedVK(
    allocator: std.mem.Allocator,
    cache_dir_path: []const u8,
    bytecode: []const u8,
) ![]const u8 {
    const hex_str = computeBytecodeHash(bytecode);
    const vk_cache_path = try std.fmt.allocPrint(allocator, "{s}/{s}.vk", .{ cache_dir_path, hex_str });
    defer allocator.free(vk_cache_path);
    return try std.fs.cwd().readFileAlloc(allocator, vk_cache_path, 4 * 1024);
}

fn generateCachedVK(
    allocator: std.mem.Allocator,
    cache_dir_path: []const u8,
    bytecode: []const u8,
    force: bool,
) !void {
    const hex_str = computeBytecodeHash(bytecode);

    const vk_cache_path = try std.fmt.allocPrint(allocator, "{s}/{s}.vk", .{ cache_dir_path, hex_str });
    defer allocator.free(vk_cache_path);

    // Check cache unless force is true.
    if (!force) {
        if (std.fs.cwd().access(vk_cache_path, .{})) {
            print("Verification key already in cache: {s}\n", .{hex_str});
            return;
        } else |_| {
            // Cache doesn't exist, generate new VK.
        }
    }

    // Force is true or cache doesn't exist, generate new VK.
    const raw_vk = try generateVK(allocator, bytecode);
    defer allocator.free(raw_vk);

    // Cache the raw VK bytes.
    std.fs.cwd().writeFile(.{ .sub_path = vk_cache_path, .data = raw_vk }) catch {};
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
    defer std.c.free(vk_output_ptr);
    return try allocator.dupe(u8, vk_data);
}
