const std = @import("std");
const builtin = @import("builtin");

pub fn buildLmdb(b: *std.Build, target: std.Build.ResolvedTarget, optimize: std.builtin.OptimizeMode) *std.Build.Step.Compile {
    const lmdb_dep = b.dependency("lmdb", .{
        .target = target,
        .optimize = optimize,
    });

    const lmdb_lib = b.addLibrary(.{
        .name = "lmdb",
        .linkage = .static,
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
        }),
    });

    lmdb_lib.addCSourceFiles(.{
        .files = &.{
            "libraries/liblmdb/mdb.c",
            "libraries/liblmdb/midl.c",
        },
        .root = lmdb_dep.path("."),
    });

    lmdb_lib.addIncludePath(lmdb_dep.path("libraries/liblmdb"));
    lmdb_lib.linkLibC();

    return lmdb_lib;
}

pub fn buildLibdeflate(b: *std.Build, target: std.Build.ResolvedTarget, optimize: std.builtin.OptimizeMode) *std.Build.Step.Compile {
    const libdeflate_dep = b.dependency("libdeflate", .{
        .target = target,
        .optimize = optimize,
    });

    const libdeflate_lib = b.addLibrary(.{
        .name = "deflate",
        .linkage = .static,
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
        }),
    });

    const libdeflate_sources = [_][]const u8{
        "lib/utils.c",
        "lib/deflate_compress.c",
        "lib/deflate_decompress.c",
        "lib/gzip_compress.c",
        "lib/gzip_decompress.c",
        "lib/zlib_compress.c",
        "lib/zlib_decompress.c",
        "lib/adler32.c",
        "lib/crc32.c",
        "lib/arm/cpu_features.c",
        "lib/x86/cpu_features.c",
    };

    libdeflate_lib.addCSourceFiles(.{
        .files = &libdeflate_sources,
        .flags = &[_][]const u8{"-std=c99"},
        .root = libdeflate_dep.path("."),
    });

    libdeflate_lib.addIncludePath(libdeflate_dep.path("."));
    libdeflate_lib.addIncludePath(libdeflate_dep.path("lib"));
    libdeflate_lib.linkLibC();

    return libdeflate_lib;
}

pub fn buildGTest(b: *std.Build, target: std.Build.ResolvedTarget, optimize: std.builtin.OptimizeMode) *std.Build.Step.Compile {
    const gtest_dep = b.dependency("googletest", .{
        .target = target,
        .optimize = optimize,
    });

    const gtest_lib = b.addLibrary(.{
        .name = "gtest",
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
        }),
    });

    const gtest_sources = [_][]const u8{
        "googletest/src/gtest-all.cc",
        "googletest/src/gtest_main.cc",
        "googlemock/src/gmock-all.cc",
        "googlemock/src/gmock_main.cc",
    };

    gtest_lib.addCSourceFiles(.{
        .files = &gtest_sources,
        .flags = &[_][]const u8{"-std=c++14"},
        .root = gtest_dep.path("."),
    });

    gtest_lib.addIncludePath(gtest_dep.path("googletest/include"));
    gtest_lib.addIncludePath(gtest_dep.path("googletest"));
    gtest_lib.addIncludePath(gtest_dep.path("googlemock/include"));
    gtest_lib.addIncludePath(gtest_dep.path("googlemock"));
    gtest_lib.linkLibCpp();

    return gtest_lib;
}
