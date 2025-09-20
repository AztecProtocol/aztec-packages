const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    // Create a simple executable to test threading
    const exe = b.addExecutable(.{
        .name = "threading-test",
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
        }),
    });

    // Add the main.cpp file
    exe.addCSourceFile(.{
        .file = b.path("main.cpp"),
        .flags = &.{
            "-std=c++20",
        },
    });

    exe.linkLibC();
    exe.linkLibCpp();

    // Install the executable
    b.installArtifact(exe);

    // Create a run step
    const run_cmd = b.addRunArtifact(exe);
    run_cmd.step.dependOn(b.getInstallStep());
    if (b.args) |args| {
        run_cmd.addArgs(args);
    }

    const run_step = b.step("run", "Run the threading test");
    run_step.dependOn(&run_cmd.step);

    // WASM target for testing
    const wasm_target = b.resolveTargetQuery(.{
        .cpu_arch = .wasm32,
        .os_tag = .wasi,
        .cpu_features_add = std.Target.wasm.featureSet(&.{ .atomics, .bulk_memory }),
    });

    const wasm_exe = b.addExecutable(.{
        .name = "threading-test-wasm",
        .root_module = b.createModule(.{
            .target = wasm_target,
            .optimize = optimize,
            .single_threaded = false,
        }),
    });

    wasm_exe.libc_file = b.path("wasi-libc-posix.txt");
    wasm_exe.shared_memory = true;
    wasm_exe.import_memory = true;
    wasm_exe.export_memory = true;
    wasm_exe.export_table = true;
    // wasm_exe.import_table = true;
    wasm_exe.initial_memory = 1024 * 1024 * 64;
    wasm_exe.max_memory = 1024 * 1024 * 1024 * 4;
    wasm_exe.stack_size = 1024 * 1024 * 8;
    wasm_exe.import_symbols = true;
    // wasm_exe.wasi_exec_model = .reactor;

    // Add C++ file
    wasm_exe.addCSourceFile(.{
        .file = b.path("main.cpp"),
        .flags = &.{
            "-std=c++20",
            "-pthread",
            "-DWASM_BUILD",
            "-fno-exceptions",
            "-fno-rtti",
        },
    });

    wasm_exe.linkLibC();
    wasm_exe.linkLibCpp();

    const wasm_install = b.addInstallArtifact(wasm_exe, .{ .dest_dir = .{ .override = .bin } });

    const wasm_step = b.step("wasm", "Build WASM version");
    wasm_step.dependOn(&wasm_install.step);

    // Test with wasmtime (if available)
    const wasmtime_cmd = b.addSystemCommand(&.{
        "/mnt/user-data/charlie/.wasmtime/bin/wasmtime",
        "--wasm",
        "threads=y",
        "--wasm",
        "bulk-memory=y",
        "--wasi",
        "threads=y",
        "./zig-out/bin/threading-test-wasm.wasm",
    });
    wasmtime_cmd.step.dependOn(&wasm_install.step);

    const test_wasm_step = b.step("test-wasm", "Test WASM version with wasmtime");
    test_wasm_step.dependOn(&wasmtime_cmd.step);
}
