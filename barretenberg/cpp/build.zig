const std = @import("std");
const builtin = @import("builtin");
const sources = @import("zig-build/sources.zig");
const deps = @import("zig-build/deps.zig");

const Platform = struct {
    arch: std.Target.Cpu.Arch,
    os: std.Target.Os.Tag,
    name: []const u8,
};

const platforms = [_]Platform{
    .{ .arch = .x86_64, .os = .linux, .name = "x86_64-linux" },
    .{ .arch = .aarch64, .os = .linux, .name = "aarch64-linux" },
    .{ .arch = .x86_64, .os = .macos, .name = "x86_64-macos" },
    .{ .arch = .aarch64, .os = .macos, .name = "aarch64-macos" },
    .{ .arch = .x86_64, .os = .windows, .name = "x86_64-windows" },
    .{ .arch = .aarch64, .os = .windows, .name = "aarch64-windows" },
    .{ .arch = .wasm32, .os = .wasi, .name = "wasm32-wasi" },
};

const common_flags = [_][]const u8{
    "-std=c++20",
    "-fPIC",
    "-fno-sanitize=undefined",
    "-Wno-unused-function",
    "-Wno-unused-variable",
    "-Wno-unused-parameter",
    "-Wno-missing-field-initializers",
    "-DNO_PAR_ALGOS",
    "-fbracket-depth=1024",
    "-fconstexpr-steps=1000000000",
};

const no_avm_flags = common_flags ++ [_][]const u8{
    "-DDISABLE_AZTEC_VM=1",
};

const wasm_flags = no_avm_flags ++ [_][]const u8{
    "-DDISABLE_ADX",
    "-DDISABLE_ASM",
    "-D_WASI_EMULATED_PROCESS_CLOCKS",
    "-D_LIBCPP_HAS_FILESYSTEM",
    "-D_LIBCPP_HAS_LOCALIZATION",
    "-DBB_NO_EXCEPTIONS",
    "-fno-exceptions",
};

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    // Add AVM option
    const enable_avm = b.option(bool, "avm", "Enable Aztec Virtual Machine support") orelse false;

    // Determine current host platform for default build
    const host_platform = std.fmt.allocPrint(
        b.allocator,
        "{s}-{s}",
        .{ @tagName(target.result.cpu.arch), @tagName(target.result.os.tag) },
    ) catch unreachable;

    // Create cross-compilation step
    const cross_step = b.step("cross", "Build for all platforms");

    for (platforms) |platform| {
        if (platform.os == .wasi) {
            // We always default to ReleaseSmall for WASM builds with no AVM.
            // Debug builds are so slow they basically hang.
            const platform_step = getBuildStepForTarget(b, platform, .ReleaseSmall, false, false);
            // We build the wasm reactor for JS.
            addBuildStepForWasmReactor(b, optimize, platform_step);
            cross_step.dependOn(platform_step);
        } else {
            const is_host = std.mem.eql(u8, platform.name, host_platform);
            const platform_step = getBuildStepForTarget(b, platform, optimize, enable_avm, is_host);
            cross_step.dependOn(platform_step);
        }
    }
}

fn getBuildStepForTarget(
    b: *std.Build,
    platform: Platform,
    optimize: std.builtin.OptimizeMode,
    enable_avm: bool,
    is_host: bool,
) *std.Build.Step {
    const platform_step = b.step(platform.name, b.fmt("Build for {s}", .{platform.name}));
    const platform_tests_step = b.step(b.fmt("{s}-tests", .{platform.name}), b.fmt("Build tests for {s}", .{platform.name}));
    const tests_step = if (is_host) b.step("tests", "Build tests for host platform") else null;

    const target = b.resolveTargetQuery(.{
        .cpu_arch = platform.arch,
        .os_tag = platform.os,
        .cpu_features_add = if (platform.os == .wasi)
            std.Target.wasm.featureSet(&.{ .atomics, .bulk_memory })
        else
            std.Target.Cpu.Feature.Set.empty,
    });

    const flags = if (platform.os == .wasi) &wasm_flags else if (enable_avm) &common_flags else &no_avm_flags;

    const libdeflate_lib = deps.buildLibdeflate(b, target, optimize);
    const lmdb_lib = deps.buildLmdb(b, target, optimize);
    const gtest_lib = deps.buildGTest(b, target, optimize);

    const libdeflate_dep = b.dependency("libdeflate", .{});
    const lmdb_dep = b.dependency("lmdb", .{});
    const gtest_dep = b.dependency("googletest", .{});
    const msgpack_dep = b.dependency("msgpack", .{});

    // ### LIBRARY OBJECTS #############################################################################################
    // Object files that make up libbarretenberg.a
    const lib_objects = b.addObject(.{
        .name = "lib_objects",
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
        }),
    });

    lib_objects.addCSourceFiles(.{ .files = &sources.core_sources, .flags = flags });
    lib_objects.addCSourceFiles(.{ .files = &sources.env_sources, .flags = flags });
    if (enable_avm) {
        lib_objects.addCSourceFiles(.{ .files = &sources.avm_sources, .flags = flags });
    }

    lib_objects.addIncludePath(b.path("src"));
    lib_objects.addIncludePath(b.path("src/tracy_stub"));
    lib_objects.addIncludePath(lmdb_dep.path("libraries/liblmdb"));
    lib_objects.addIncludePath(msgpack_dep.path("include"));
    lib_objects.addIncludePath(libdeflate_dep.path("."));
    lib_objects.addIncludePath(libdeflate_dep.path("lib"));
    lib_objects.linkLibCpp();

    // ### LIBRARY #####################################################################################################
    // libbarretenberg.a
    const lib = b.addLibrary(.{
        .name = "barretenberg",
        .linkage = .static,
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
            .single_threaded = false,
        }),
    });

    lib.addObject(lib_objects);
    lib.linkLibCpp();

    const install_lib = b.addInstallArtifact(lib, .{ .dest_dir = .{ .override = .{ .custom = platform.name } } });
    platform_step.dependOn(&install_lib.step);

    // ### EXECUTABLE ##################################################################################################
    // bb executable
    const exe = b.addExecutable(.{
        .name = "bb",
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
            .single_threaded = false,
            // .strip = false,
        }),
    });

    exe.addCSourceFiles(.{
        .files = &.{"src/barretenberg/bb/main.cpp"},
        .flags = flags,
    });

    exe.linkLibrary(lib);
    exe.linkLibrary(libdeflate_lib);
    exe.linkLibCpp();
    exe.addIncludePath(b.path("src"));

    // Platform-specific settings.
    switch (target.result.os.tag) {
        .windows => {
            exe.linkSystemLibrary("ws2_32");
            exe.linkSystemLibrary("advapi32"); // For CryptoAPI
            exe.linkSystemLibrary("psapi"); // For process info
        },
        .wasi => {
            exe.addObjectFile(b.path("zig-out/lib/libcxxfs.a"));

            exe.libc_file = b.path("wasi-libc-posix.txt");
            exe.wasi_exec_model = .command;
            exe.shared_memory = true;
            exe.import_memory = true;
            exe.export_memory = true;
            exe.export_table = true;
            exe.initial_memory = 1024 * 1024 * 64;
            exe.max_memory = 1024 * 1024 * 1024 * 4;
            exe.stack_size = 1024 * 1024 * 8;
        },
        else => {},
    }

    const install = b.addInstallArtifact(exe, .{ .dest_dir = .{ .override = .{ .custom = platform.name } } });
    platform_step.dependOn(&install.step);

    // ### TEST EXECUTABLES ############################################################################################
    // We create a test executable for each test group path, from which we collect all nested .test.cpp files.
    // Start with a global collection of objects that all tests will link to.
    // Includes world state and test utils.
    const global_test_objects = b.addObject(.{
        .name = "test_util_objects",
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
        }),
    });

    global_test_objects.addCSourceFiles(.{ .files = &sources.test_util_sources, .flags = flags });
    global_test_objects.addCSourceFiles(.{ .files = &sources.world_state_sources, .flags = flags });
    if (enable_avm) {
        global_test_objects.addCSourceFiles(.{ .files = &sources.test_avm_util_sources, .flags = flags });
    }

    global_test_objects.addIncludePath(b.path("src"));
    global_test_objects.addIncludePath(b.path("src/tracy_stub"));
    global_test_objects.addIncludePath(lmdb_dep.path("libraries/liblmdb"));
    global_test_objects.addIncludePath(msgpack_dep.path("include"));
    global_test_objects.addIncludePath(libdeflate_dep.path("."));
    global_test_objects.addIncludePath(libdeflate_dep.path("lib"));
    global_test_objects.addIncludePath(gtest_dep.path("googletest/include"));
    global_test_objects.addIncludePath(gtest_dep.path("googlemock/include"));
    global_test_objects.linkLibCpp();

    for (sources.test_group_paths) |test_group_path| {
        // Skip VM2 tests if AVM is not enabled.
        if (!enable_avm and std.mem.endsWith(u8, test_group_path, "/vm2")) {
            continue;
        }

        // Extract project name from path (e.g., "src/barretenberg/crypto/aes128" -> "crypto_aes128")
        const project_name = getProjectName(test_group_path);

        // Collect all .test.cpp files in this directory and subdirectories.
        var test_files = std.ArrayList([]u8).empty;
        defer test_files.deinit(b.allocator);
        getFilesEndingWith(b, test_group_path, ".test.cpp", &test_files);
        if (test_files.items.len == 0) continue;

        const test_objects = b.addObject(.{
            .name = b.fmt("{s}_test_objects", .{project_name}),
            .root_module = b.createModule(.{
                .target = target,
                .optimize = optimize,
            }),
        });

        test_objects.addCSourceFiles(.{ .files = test_files.items, .flags = flags });

        test_objects.addIncludePath(b.path("src"));
        test_objects.addIncludePath(b.path("src/tracy_stub"));
        test_objects.addIncludePath(lmdb_dep.path("libraries/liblmdb"));
        test_objects.addIncludePath(msgpack_dep.path("include"));
        test_objects.addIncludePath(libdeflate_dep.path("."));
        test_objects.addIncludePath(libdeflate_dep.path("lib"));
        test_objects.addIncludePath(gtest_dep.path("googletest/include"));
        test_objects.addIncludePath(gtest_dep.path("googlemock/include"));
        test_objects.linkLibCpp();

        const test_exe = b.addExecutable(.{
            .name = b.fmt("{s}_tests", .{project_name}),
            .root_module = b.createModule(.{
                .target = target,
                .optimize = optimize,
                // .strip = false,
            }),
        });

        test_exe.addObject(global_test_objects);
        test_exe.addObject(test_objects);

        test_exe.linkLibCpp();
        test_exe.linkLibrary(lmdb_lib);
        test_exe.linkLibrary(gtest_lib);
        test_exe.linkLibrary(libdeflate_lib);
        test_exe.linkLibrary(lib);
        test_exe.addIncludePath(b.path("src"));
        test_exe.addIncludePath(b.path("src/tracy_stub"));
        test_exe.addIncludePath(lmdb_dep.path("libraries/liblmdb"));
        test_exe.addIncludePath(msgpack_dep.path("include"));
        test_exe.addIncludePath(gtest_dep.path("googletest/include"));
        test_exe.addIncludePath(gtest_dep.path("googlemock/include"));

        // Platform-specific settings
        switch (target.result.os.tag) {
            .windows => {
                test_exe.linkSystemLibrary("ws2_32");
                test_exe.linkSystemLibrary("advapi32");
                test_exe.linkSystemLibrary("psapi");
            },
            else => {},
        }

        const test_install = b.addInstallArtifact(test_exe, .{ .dest_dir = .{ .override = .{ .custom = platform.name } } });
        platform_tests_step.dependOn(&test_install.step);

        // If this platform is the host platform, add to the "tests" step.
        if (tests_step) |step| {
            step.dependOn(&test_install.step);
        }
    }

    // If this platform is the host platform, it should be built by default.
    if (is_host) {
        b.getInstallStep().dependOn(platform_step);
    }

    return platform_step;
}

fn addBuildStepForWasmReactor(
    b: *std.Build,
    optimize: std.builtin.OptimizeMode,
    platform_step: *std.Build.Step,
) void {
    const target = b.resolveTargetQuery(.{
        .cpu_arch = .wasm32,
        .os_tag = .wasi,
        .cpu_features_add = std.Target.wasm.featureSet(&.{ .atomics, .bulk_memory }),
    });

    const libdeflate_lib = deps.buildLibdeflate(b, target, optimize);
    const libdeflate_dep = b.dependency("libdeflate", .{});
    const msgpack_dep = b.dependency("msgpack", .{});

    const exe = b.addExecutable(.{
        .name = "barretenberg",
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
            .single_threaded = false,
        }),
    });
    exe.libc_file = b.path("wasi-libc-posix.txt");
    exe.entry = .disabled;
    exe.wasi_exec_model = .reactor;
    exe.shared_memory = true;
    exe.import_memory = true;
    exe.import_symbols = true;
    exe.export_memory = true;
    exe.export_table = true;
    exe.stack_size = 1024 * 1024;
    exe.max_memory = 1024 * 1024 * 1024 * 4;
    exe.rdynamic = true;

    // Includes
    exe.addIncludePath(b.path("src"));
    exe.addIncludePath(b.path("src/tracy_stub"));
    exe.addIncludePath(libdeflate_dep.path("."));
    exe.addIncludePath(libdeflate_dep.path("lib"));
    exe.addIncludePath(msgpack_dep.path("include"));

    // Sources
    exe.addCSourceFiles(.{ .files = &sources.core_sources, .flags = &wasm_flags });
    exe.addCSourceFiles(.{ .files = &sources.wasi_sources, .flags = &wasm_flags });

    exe.linkLibC();
    exe.linkLibCpp();
    exe.linkLibrary(libdeflate_lib);

    const install = b.addInstallArtifact(exe, .{ .dest_dir = .{ .override = .{ .custom = "wasm32-wasi" } } });
    // Add step to gzip the output wasm file to the same file with .gz extension.
    const gzip = b.addSystemCommand(&.{ "gzip", "-k", "-f", b.getInstallPath(.{ .custom = "wasm32-wasi" }, "barretenberg.wasm") });
    gzip.step.dependOn(&install.step);
    platform_step.dependOn(&gzip.step);
}

fn getFilesEndingWith(b: *std.Build, project_path: []const u8, suffix: []const u8, out: *std.ArrayList([]u8)) void {
    var dir = std.fs.cwd().openDir(project_path, .{ .iterate = true }) catch return;
    defer dir.close();

    var walker = dir.walk(b.allocator) catch return;
    defer walker.deinit();

    while (walker.next() catch null) |entry| {
        if (entry.kind == .file and std.mem.endsWith(u8, entry.path, suffix)) {
            const full_path = b.fmt("{s}/{s}", .{ project_path, entry.path });
            out.append(b.allocator, b.dupe(full_path)) catch unreachable;
        }
    }
}

// Convert project path to a clean name (e.g., "src/barretenberg/crypto/aes128" -> "crypto_aes128")
fn getProjectName(project_path: []const u8) []const u8 {
    // Remove "src/barretenberg/" prefix
    const prefix = "src/barretenberg/";
    if (std.mem.startsWith(u8, project_path, prefix)) {
        const name = project_path[prefix.len..];
        // Replace slashes with underscores
        const result = std.heap.page_allocator.dupe(u8, name) catch return name;
        for (result) |*char| {
            if (char.* == '/') char.* = '_';
        }
        return result;
    }
    return project_path;
}
