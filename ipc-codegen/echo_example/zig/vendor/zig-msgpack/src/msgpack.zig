//! MessagePack implementation with zig
//! https://msgpack.org/

const std = @import("std");
const builtin = @import("builtin");

const current_zig = builtin.zig_version;
const Allocator = std.mem.Allocator;
const comptimePrint = std.fmt.comptimePrint;
const native_endian = builtin.cpu.arch.endian();

const big_endian = std.builtin.Endian.big;
const little_endian = std.builtin.Endian.little;

/// Cache line size for prefetch optimization
const CACHE_LINE_SIZE: usize = 64;

/// Prefetch hint for read-ahead optimization
/// Uses compiler intrinsics to hint CPU to prefetch data
/// This is a performance hint and may be a no-op on some architectures
inline fn prefetchRead(ptr: [*]const u8, comptime locality: u2) void {
    // locality: 0=no temporal locality (NTA), 1=low (T2), 2=medium (T1), 3=high (T0)
    const arch = comptime builtin.cpu.arch;

    // x86/x64: Check for SSE support (required for PREFETCH instructions)
    if (comptime arch.isX86()) {
        const has_sse = comptime std.Target.x86.featureSetHas(builtin.cpu.features, .sse);
        if (has_sse) {
            // Use different prefetch instructions based on locality
            switch (locality) {
                3 => asm volatile ("prefetcht0 %[ptr]"
                    :
                    : [ptr] "m" (@as(*const u8, ptr)),
                ), // High locality -> L1+L2+L3
                2 => asm volatile ("prefetcht1 %[ptr]"
                    :
                    : [ptr] "m" (@as(*const u8, ptr)),
                ), // Medium -> L2+L3
                1 => asm volatile ("prefetcht2 %[ptr]"
                    :
                    : [ptr] "m" (@as(*const u8, ptr)),
                ), // Low -> L3 only
                0 => asm volatile ("prefetchnta %[ptr]"
                    :
                    : [ptr] "m" (@as(*const u8, ptr)),
                ), // Non-temporal
            }
        }
    }
    // ARM64 (Apple Silicon, Linux ARM): Use PRFM instruction
    else if (comptime arch.isAARCH64()) {
        // ARM PRFM (Prefetch Memory) instruction
        // Syntax: prfm <prfop>, [<Xn|SP>{, #<pimm>}]
        // prfop encoding: PLD (prefetch for load) + locality hint
        switch (locality) {
            3 => asm volatile ("prfm pldl1keep, [%[ptr]]"
                :
                : [ptr] "r" (ptr),
            ), // Keep in L1
            2 => asm volatile ("prfm pldl2keep, [%[ptr]]"
                :
                : [ptr] "r" (ptr),
            ), // Keep in L2
            1 => asm volatile ("prfm pldl3keep, [%[ptr]]"
                :
                : [ptr] "r" (ptr),
            ), // Keep in L3
            0 => asm volatile ("prfm pldl1strm, [%[ptr]]"
                :
                : [ptr] "r" (ptr),
            ), // Streaming (non-temporal)
        }
    }
    // Other architectures: no-op (compiler optimizes away)
    // RISC-V, MIPS, etc. may have their own prefetch extensions but not standard
}

/// Prefetch data for write operations
inline fn prefetchWrite(ptr: [*]u8, comptime locality: u2) void {
    const arch = comptime builtin.cpu.arch;

    // x86/x64: Use PREFETCHW if available (3DNow!/SSE), fallback to read prefetch
    if (comptime arch.isX86()) {
        // PREFETCHW is part of 3DNow! (AMD) or PRFCHW feature (Intel Broadwell+)
        const has_prefetchw = comptime std.Target.x86.featureSetHas(builtin.cpu.features, .prfchw) or
            std.Target.x86.featureSetHas(builtin.cpu.features, .@"3dnow");
        const has_sse = comptime std.Target.x86.featureSetHas(builtin.cpu.features, .sse);

        if (has_prefetchw) {
            // Use write-specific prefetch (ignores locality for simplicity)
            asm volatile ("prefetchw %[ptr]"
                :
                : [ptr] "m" (@as(*u8, ptr)),
            );
        } else if (has_sse) {
            // Fallback to read prefetch with specified locality
            switch (locality) {
                3 => asm volatile ("prefetcht0 %[ptr]"
                    :
                    : [ptr] "m" (@as(*u8, ptr)),
                ),
                2 => asm volatile ("prefetcht1 %[ptr]"
                    :
                    : [ptr] "m" (@as(*u8, ptr)),
                ),
                1 => asm volatile ("prefetcht2 %[ptr]"
                    :
                    : [ptr] "m" (@as(*u8, ptr)),
                ),
                0 => asm volatile ("prefetchnta %[ptr]"
                    :
                    : [ptr] "m" (@as(*u8, ptr)),
                ),
            }
        }
    }
    // ARM64: Use PST (prefetch for store)
    else if (comptime arch.isAARCH64()) {
        switch (locality) {
            3 => asm volatile ("prfm pstl1keep, [%[ptr]]"
                :
                : [ptr] "r" (ptr),
            ),
            2 => asm volatile ("prfm pstl2keep, [%[ptr]]"
                :
                : [ptr] "r" (ptr),
            ),
            1 => asm volatile ("prfm pstl3keep, [%[ptr]]"
                :
                : [ptr] "r" (ptr),
            ),
            0 => asm volatile ("prfm pstl1strm, [%[ptr]]"
                :
                : [ptr] "r" (ptr),
            ),
        }
    }
}

/// Prefetch multiple cache lines for large data operations
/// Used for arrays/maps/strings >= 256 bytes
inline fn prefetchLarge(ptr: [*]const u8, size: usize) void {
    // Prefetch first few cache lines
    const lines_to_prefetch = @min(size / CACHE_LINE_SIZE, 4); // Max 4 lines
    var i: usize = 0;
    while (i < lines_to_prefetch) : (i += 1) {
        prefetchRead(ptr + i * CACHE_LINE_SIZE, 2); // Medium locality
    }
}

/// MessagePack format limits for fix types
pub const FixLimits = struct {
    pub const POSITIVE_INT_MAX: u8 = 0x7f;
    pub const NEGATIVE_INT_MIN: i8 = -32;
    pub const STR_LEN_MAX: u8 = 31;
    pub const ARRAY_LEN_MAX: u8 = 15;
    pub const MAP_LEN_MAX: u8 = 15;
};

/// Integer type boundaries
pub const IntBounds = struct {
    pub const UINT8_MAX: u64 = 0xff;
    pub const UINT16_MAX: u64 = 0xffff;
    pub const UINT32_MAX: u64 = 0xffff_ffff;
    pub const INT8_MIN: i64 = -128;
    pub const INT16_MIN: i64 = -32768;
    pub const INT32_MIN: i64 = -2147483648;
};

/// Fixed extension type data lengths
pub const FixExtLen = struct {
    pub const EXT1: usize = 1;
    pub const EXT2: usize = 2;
    pub const EXT4: usize = 4;
    pub const EXT8: usize = 8;
    pub const EXT16: usize = 16;
};

/// Timestamp extension type constants
pub const TimestampExt = struct {
    pub const TYPE_ID: i8 = -1;
    pub const FORMAT32_LEN: usize = 4;
    pub const FORMAT64_LEN: usize = 8;
    pub const FORMAT96_LEN: usize = 12;
    pub const SECONDS_BITS_64: u6 = 34;
    pub const SECONDS_MASK_64: u64 = 0x3ffffffff;
    pub const NANOSECONDS_MAX: u32 = 999_999_999;
    pub const NANOSECONDS_PER_SECOND: f64 = 1_000_000_000.0;
};

/// Marker byte base values and masks
pub const MarkerBase = struct {
    pub const FIXARRAY: u8 = 0x90;
    pub const FIXMAP: u8 = 0x80;
    pub const FIXSTR: u8 = 0xa0;
    pub const FIXSTR_LEN_MASK: u8 = 0x1f;
    pub const FIXSTR_TYPE_MASK: u8 = 0xe0;
};

// Backward compatibility aliases (will be deprecated)
const MAX_POSITIVE_FIXINT: u8 = FixLimits.POSITIVE_INT_MAX;
const MIN_NEGATIVE_FIXINT: i8 = FixLimits.NEGATIVE_INT_MIN;
const MAX_FIXSTR_LEN: u8 = FixLimits.STR_LEN_MAX;
const MAX_FIXARRAY_LEN: u8 = FixLimits.ARRAY_LEN_MAX;
const MAX_FIXMAP_LEN: u8 = FixLimits.MAP_LEN_MAX;
const TIMESTAMP_EXT_TYPE: i8 = TimestampExt.TYPE_ID;
const MAX_UINT8: u64 = IntBounds.UINT8_MAX;
const MAX_UINT16: u64 = IntBounds.UINT16_MAX;
const MAX_UINT32: u64 = IntBounds.UINT32_MAX;
const MIN_INT8: i64 = IntBounds.INT8_MIN;
const MIN_INT16: i64 = IntBounds.INT16_MIN;
const MIN_INT32: i64 = IntBounds.INT32_MIN;
const FIXEXT1_LEN: usize = FixExtLen.EXT1;
const FIXEXT2_LEN: usize = FixExtLen.EXT2;
const FIXEXT4_LEN: usize = FixExtLen.EXT4;
const FIXEXT8_LEN: usize = FixExtLen.EXT8;
const FIXEXT16_LEN: usize = FixExtLen.EXT16;
const TIMESTAMP32_DATA_LEN: usize = TimestampExt.FORMAT32_LEN;
const TIMESTAMP64_DATA_LEN: usize = TimestampExt.FORMAT64_LEN;
const TIMESTAMP96_DATA_LEN: usize = TimestampExt.FORMAT96_LEN;
const TIMESTAMP64_SECONDS_BITS: u6 = TimestampExt.SECONDS_BITS_64;
const TIMESTAMP64_SECONDS_MASK: u64 = TimestampExt.SECONDS_MASK_64;
const MAX_NANOSECONDS: u32 = TimestampExt.NANOSECONDS_MAX;
const NANOSECONDS_PER_SECOND: f64 = TimestampExt.NANOSECONDS_PER_SECOND;
const FIXARRAY_BASE: u8 = MarkerBase.FIXARRAY;
const FIXMAP_BASE: u8 = MarkerBase.FIXMAP;
const FIXSTR_BASE: u8 = MarkerBase.FIXSTR;
const FIXSTR_MASK: u8 = MarkerBase.FIXSTR_LEN_MASK;
const FIXSTR_TYPE_MASK: u8 = MarkerBase.FIXSTR_TYPE_MASK;

/// Parse safety limits configuration
pub const ParseLimits = struct {
    /// Maximum nesting depth (default 1000 layers)
    max_depth: usize = 1000,

    /// Maximum array length (default 1 million elements)
    max_array_length: usize = 1_000_000,

    /// Maximum map size (default 1 million key-value pairs)
    max_map_size: usize = 1_000_000,

    /// Maximum string data length (default 100MB)
    max_string_length: usize = 100 * 1024 * 1024,

    /// Maximum binary data length (default 100MB)
    max_bin_length: usize = 100 * 1024 * 1024,

    /// Maximum extension data length (default 100MB)
    max_ext_length: usize = 100 * 1024 * 1024,
};

/// Default parse limits
pub const DEFAULT_LIMITS = ParseLimits{};

/// the Str Type
pub const Str = struct {
    str: []const u8,

    /// Initialize a new Str instance
    pub inline fn init(str: []const u8) Str {
        return Str{ .str = str };
    }

    /// get Str values
    pub fn value(self: Str) []const u8 {
        return self.str;
    }
};

/// this is for encode str in struct
pub inline fn wrapStr(str: []const u8) Str {
    return Str.init(str);
}

/// the Bin Type
pub const Bin = struct {
    bin: []u8,

    /// Initialize a new Bin instance
    pub inline fn init(bin: []u8) Bin {
        return Bin{ .bin = bin };
    }

    /// get bin values
    pub fn value(self: Bin) []u8 {
        return self.bin;
    }
};

/// this is wrapping for bin
pub inline fn wrapBin(bin: []u8) Bin {
    return Bin.init(bin);
}

/// the EXT Type
pub const EXT = struct {
    type: i8,
    data: []u8,

    /// Initialize a new EXT instance
    pub inline fn init(t: i8, data: []u8) EXT {
        return EXT{
            .type = t,
            .data = data,
        };
    }
};

/// t is type, data is data
pub inline fn wrapEXT(t: i8, data: []u8) EXT {
    return EXT.init(t, data);
}

/// the Timestamp Type
/// Represents an instantaneous point on the time-line in the world
/// that is independent from time zones or calendars.
/// Maximum precision is nanoseconds.
pub const Timestamp = struct {
    /// seconds since 1970-01-01 00:00:00 UTC
    seconds: i64,
    /// nanoseconds (0-999999999)
    nanoseconds: u32,

    /// Create a new timestamp
    pub inline fn new(seconds: i64, nanoseconds: u32) Timestamp {
        return Timestamp{
            .seconds = seconds,
            .nanoseconds = nanoseconds,
        };
    }

    /// Create timestamp from seconds only (nanoseconds = 0)
    pub inline fn fromSeconds(seconds: i64) Timestamp {
        return Timestamp{
            .seconds = seconds,
            .nanoseconds = 0,
        };
    }

    /// Create timestamp from nanoseconds since Unix epoch
    /// This is useful for converting from various time sources
    /// Example: Timestamp.fromNanos(some_nanosecond_value)
    pub fn fromNanos(nanos: i128) Timestamp {
        const ns_i64: i64 = @intCast(@divFloor(nanos, std.time.ns_per_s));
        const nano_remainder: i64 = @intCast(@mod(nanos, std.time.ns_per_s));
        const nanoseconds: u32 = @intCast(if (nano_remainder < 0) nano_remainder + std.time.ns_per_s else nano_remainder);
        return Timestamp{
            .seconds = if (nano_remainder < 0) ns_i64 - 1 else ns_i64,
            .nanoseconds = nanoseconds,
        };
    }

    /// Get total seconds as f64 (including fractional nanoseconds)
    pub fn toFloat(self: Timestamp) f64 {
        return @as(f64, @floatFromInt(self.seconds)) + @as(f64, @floatFromInt(self.nanoseconds)) / NANOSECONDS_PER_SECOND;
    }
};

/// Key-Value pair for map entries
pub const KeyValuePair = struct {
    key: Payload,
    value: Payload,
};

/// Compute hash for Payload (used for HashMap)
/// Note: For performance, consider using simple types as map keys (int, uint, str)
fn payloadHash(payload: Payload) u64 {
    return payloadHashDepth(payload, 0);
}

/// Internal helper for hashing with depth tracking to prevent infinite recursion
fn payloadHashDepth(payload: Payload, depth: usize) u64 {
    // Prevent excessive recursion for deeply nested structures
    const MAX_DEPTH = 100;
    if (depth > MAX_DEPTH) {
        return 0;
    }

    const Wyhash = std.hash.Wyhash;

    return switch (payload) {
        .nil => 0,
        .bool => |v| if (v) 1 else 0,
        .int => |v| @bitCast(@as(i64, v)),
        .uint => |v| v,
        .float => |v| @bitCast(v),
        .timestamp => |t| {
            var h = Wyhash.init(0);
            h.update(std.mem.asBytes(&t.seconds));
            h.update(std.mem.asBytes(&t.nanoseconds));
            return h.final();
        },
        .str => |s| {
            return Wyhash.hash(0, s.value());
        },
        .bin => |b| {
            return Wyhash.hash(0, b.value());
        },
        .ext => |e| {
            var h = Wyhash.init(0);
            h.update(std.mem.asBytes(&e.type));
            h.update(e.data);
            return h.final();
        },
        .arr => |arr| {
            var h = Wyhash.init(0);
            h.update(std.mem.asBytes(&arr.len));
            for (arr) |item| {
                const item_hash = payloadHashDepth(item, depth + 1);
                h.update(std.mem.asBytes(&item_hash));
            }
            return h.final();
        },
        .map => |m| {
            var h = Wyhash.init(0);
            const count = m.count();
            h.update(std.mem.asBytes(&count));
            // Hash map entries (order-independent by XOR)
            var hash_acc: u64 = 0;
            var it = m.map.iterator();
            while (it.next()) |entry| {
                const key_hash = payloadHashDepth(entry.key_ptr.*, depth + 1);
                const value_hash = payloadHashDepth(entry.value_ptr.*, depth + 1);
                // XOR makes hash order-independent
                hash_acc ^= key_hash ^ value_hash;
            }
            h.update(std.mem.asBytes(&hash_acc));
            return h.final();
        },
    };
}

/// Detect best SIMD vector size at compile time based on target features
/// Returns the optimal chunk size for SIMD operations
fn detectSIMDChunkSize() comptime_int {
    // Check target features for best available SIMD support
    const has_avx512 = std.Target.x86.featureSetHas(builtin.cpu.features, .avx512f);
    const has_avx2 = std.Target.x86.featureSetHas(builtin.cpu.features, .avx2);
    const has_sse2 = std.Target.x86.featureSetHas(builtin.cpu.features, .sse2);
    const has_neon = builtin.cpu.arch.isAARCH64();

    // Prefer larger vectors for better throughput
    if (has_avx512) {
        return 64; // AVX-512: 512 bits = 64 bytes
    } else if (has_avx2) {
        return 32; // AVX2: 256 bits = 32 bytes
    } else if (has_sse2 or has_neon) {
        return 16; // SSE2/NEON: 128 bits = 16 bytes
    } else {
        return 0; // No SIMD support, use scalar only
    }
}

/// SIMD-optimized string equality comparison
/// Automatically uses the best available SIMD instruction set (AVX-512, AVX2, SSE2, or NEON)
/// For strings >= chunk_size bytes, uses vector operations; otherwise falls back to scalar
fn stringEqualSIMD(a: []const u8, b: []const u8) bool {
    if (a.len != b.len) return false;
    if (a.len == 0) return true;

    const len = a.len;

    // Detect optimal SIMD chunk size at compile time
    const chunk_size = comptime detectSIMDChunkSize();

    // For very short strings or no SIMD support, use scalar comparison
    if (chunk_size == 0 or len < chunk_size) {
        return std.mem.eql(u8, a, b);
    }

    // Use compile-time detected vector size
    const VecType = @Vector(chunk_size, u8);

    var i: usize = 0;

    // Process chunks with SIMD
    while (i + chunk_size <= len) : (i += chunk_size) {
        const vec_a: VecType = a[i..][0..chunk_size].*;
        const vec_b: VecType = b[i..][0..chunk_size].*;

        // Compare vectors: returns a vector of bools
        const cmp_result = vec_a == vec_b;

        // Check if all elements are equal
        // Use @reduce to check if all comparisons are true
        if (!@reduce(.And, cmp_result)) {
            return false;
        }
    }

    // Process remaining bytes with scalar comparison
    if (i < len) {
        return std.mem.eql(u8, a[i..], b[i..]);
    }

    return true;
}

/// SIMD-optimized binary data equality comparison (same as string)
inline fn binaryEqualSIMD(a: []const u8, b: []const u8) bool {
    return stringEqualSIMD(a, b);
}

/// SIMD-optimized memory copy for binary data
/// Uses larger vector operations when available for better throughput
/// Optimized with memory alignment to reduce unaligned access penalties
fn memcpySIMD(dest: []u8, src: []const u8) void {
    std.debug.assert(dest.len >= src.len);

    const len = src.len;
    const chunk_size = comptime detectSIMDChunkSize();

    // For small copies or no SIMD, use standard memcpy
    if (chunk_size == 0 or len < chunk_size * 2) {
        @memcpy(dest[0..len], src);
        return;
    }

    const VecType = @Vector(chunk_size, u8);
    var i: usize = 0;

    // Memory alignment optimization:
    // Align destination pointer to chunk_size boundary for better SIMD performance
    // Unaligned loads/stores can be 2-3x slower on some architectures
    const dest_addr = @intFromPtr(dest.ptr);
    const alignment_offset = dest_addr & (chunk_size - 1); // Modulo chunk_size

    if (alignment_offset != 0 and len >= chunk_size) {
        // Calculate bytes needed to reach alignment
        const bytes_to_align = chunk_size - alignment_offset;
        if (bytes_to_align < len) {
            // Copy unaligned head using scalar operations
            @memcpy(dest[0..bytes_to_align], src[0..bytes_to_align]);
            i = bytes_to_align;
        }
    }

    // Process chunks with SIMD
    while (i + chunk_size <= len) : (i += chunk_size) {
        const vec: VecType = src[i..][0..chunk_size].*;
        dest[i..][0..chunk_size].* = vec;
    }

    // Copy remaining bytes
    if (i < len) {
        @memcpy(dest[i..len], src[i..]);
    }
}

// ========== Byte Order Conversion Optimizations ==========

/// Check if a pointer is aligned to a given boundary at runtime
inline fn isAligned(ptr: [*]const u8, comptime alignment: usize) bool {
    return (@intFromPtr(ptr) & (alignment - 1)) == 0;
}

/// Check if a pointer is aligned to the optimal SIMD boundary
inline fn isAlignedToSIMD(ptr: [*]const u8) bool {
    const chunk_size = comptime detectSIMDChunkSize();
    if (chunk_size == 0) return true; // No SIMD, always "aligned"
    return isAligned(ptr, chunk_size);
}

/// Optimized aligned memory read for u32 (faster when data is aligned)
inline fn readU32Aligned(ptr: *align(@alignOf(u32)) const [4]u8) u32 {
    // Aligned read can use direct pointer cast for better performance
    const val_ptr: *align(@alignOf(u32)) const u32 = @ptrCast(ptr);
    return byteSwapU32SIMD(val_ptr.*);
}

/// Optimized aligned memory read for u64
inline fn readU64Aligned(ptr: *align(@alignOf(u64)) const [8]u8) u64 {
    const val_ptr: *align(@alignOf(u64)) const u64 = @ptrCast(ptr);
    return byteSwapU64SIMD(val_ptr.*);
}

/// Optimized aligned memory write for u32
inline fn writeU32Aligned(ptr: *align(@alignOf(u32)) [4]u8, val: u32) void {
    const swapped = byteSwapU32SIMD(val);
    const dest_ptr: *align(@alignOf(u32)) u32 = @ptrCast(ptr);
    dest_ptr.* = swapped;
}

/// Optimized aligned memory write for u64
inline fn writeU64Aligned(ptr: *align(@alignOf(u64)) [8]u8, val: u64) void {
    const swapped = byteSwapU64SIMD(val);
    const dest_ptr: *align(@alignOf(u64)) u64 = @ptrCast(ptr);
    dest_ptr.* = swapped;
}

/// Large data copy with alignment hints for better optimization
/// Useful for copying strings, binary data >= 64 bytes
inline fn memcpyLarge(dest: []u8, src: []const u8) void {
    std.debug.assert(dest.len >= src.len);

    const len = src.len;

    // For very large copies (>= 64 bytes), use SIMD-optimized copy
    if (len >= 64) {
        memcpySIMD(dest[0..len], src);
    } else {
        // For smaller sizes, standard memcpy is sufficient
        @memcpy(dest[0..len], src);
    }
}

/// Check if byte swap is needed at compile time
inline fn needsByteSwap() bool {
    return comptime (native_endian != big_endian);
}

/// SIMD-accelerated byte swap for u32 (4 bytes)
/// Uses vector operations when available for better throughput
inline fn byteSwapU32SIMD(val: u32) u32 {
    if (!needsByteSwap()) {
        return val;
    }

    const chunk_size = comptime detectSIMDChunkSize();

    // Use SIMD if available (SSE2+ or NEON)
    if (chunk_size >= 16) {
        // Zig's @byteSwap is optimized to use BSWAP on x86 or REV on ARM
        return @byteSwap(val);
    } else {
        // Scalar fallback (still efficient)
        return @byteSwap(val);
    }
}

/// SIMD-accelerated byte swap for u64 (8 bytes)
inline fn byteSwapU64SIMD(val: u64) u64 {
    if (!needsByteSwap()) {
        return val;
    }

    const chunk_size = comptime detectSIMDChunkSize();

    if (chunk_size >= 16) {
        return @byteSwap(val);
    } else {
        return @byteSwap(val);
    }
}

/// Fast integer write with optimized byte order conversion
/// This replaces the manual std.mem.writeInt for better performance
inline fn writeU32Fast(buffer: *[4]u8, val: u32) void {
    const swapped = byteSwapU32SIMD(val);
    const bytes: *const [4]u8 = @ptrCast(&swapped);
    buffer.* = bytes.*;
}

/// Fast integer write for u64
inline fn writeU64Fast(buffer: *[8]u8, val: u64) void {
    const swapped = byteSwapU64SIMD(val);
    const bytes: *const [8]u8 = @ptrCast(&swapped);
    buffer.* = bytes.*;
}

/// Fast integer read with optimized byte order conversion
inline fn readU32Fast(buffer: *const [4]u8) u32 {
    const val: u32 = @bitCast(buffer.*);
    return byteSwapU32SIMD(val);
}

/// Fast integer read for u64
inline fn readU64Fast(buffer: *const [8]u8) u64 {
    const val: u64 = @bitCast(buffer.*);
    return byteSwapU64SIMD(val);
}

/// Batch convert u32 array to big-endian (optimized for array serialization)
/// This is useful when writing arrays of integers with known format
/// Returns the number of bytes written
/// Optimized with alignment-aware fast paths
pub fn batchU32ToBigEndian(values: []const u32, output: []u8) usize {
    std.debug.assert(output.len >= values.len * 4);

    if (!needsByteSwap()) {
        // Already big-endian, direct copy
        @memcpy(output[0 .. values.len * 4], std.mem.sliceAsBytes(values));
        return values.len * 4;
    }

    const chunk_size = comptime detectSIMDChunkSize();

    // SIMD optimization for batch conversion
    if (chunk_size >= 16) {
        // Check if output is aligned for faster writes
        const output_aligned = isAligned(output.ptr, @alignOf(u32));

        // Process 4 u32s at a time (16 bytes = 128 bits)
        const VecType = @Vector(4, u32);
        var i: usize = 0;

        while (i + 4 <= values.len) : (i += 4) {
            const vec: VecType = values[i..][0..4].*;
            const swapped = @byteSwap(vec);

            const out_offset = i * 4;

            if (output_aligned and isAligned(output.ptr + out_offset, 16)) {
                // Fast path: aligned write (can be faster on some CPUs)
                const dest_ptr: *align(16) [16]u8 = @ptrCast(@alignCast(output[out_offset..].ptr));
                const swapped_bytes: *const [16]u8 = @ptrCast(&swapped);
                dest_ptr.* = swapped_bytes.*;
            } else {
                // Standard path: unaligned write
                const swapped_bytes: *const [16]u8 = @ptrCast(&swapped);
                @memcpy(output[out_offset..][0..16], swapped_bytes);
            }
        }

        // Handle remaining elements
        while (i < values.len) : (i += 1) {
            var buffer: [4]u8 = undefined;
            writeU32Fast(&buffer, values[i]);
            @memcpy(output[i * 4 ..][0..4], &buffer);
        }

        return values.len * 4;
    } else {
        // Scalar fallback
        for (values, 0..) |val, i| {
            var buffer: [4]u8 = undefined;
            writeU32Fast(&buffer, val);
            @memcpy(output[i * 4 ..][0..4], &buffer);
        }
        return values.len * 4;
    }
}

/// Batch convert u64 array to big-endian
/// Optimized with alignment-aware fast paths
pub fn batchU64ToBigEndian(values: []const u64, output: []u8) usize {
    std.debug.assert(output.len >= values.len * 8);

    if (!needsByteSwap()) {
        @memcpy(output[0 .. values.len * 8], std.mem.sliceAsBytes(values));
        return values.len * 8;
    }

    const chunk_size = comptime detectSIMDChunkSize();

    if (chunk_size >= 16) {
        // Check if output is aligned for faster writes
        const output_aligned = isAligned(output.ptr, @alignOf(u64));

        // Process 2 u64s at a time (16 bytes)
        const VecType = @Vector(2, u64);
        var i: usize = 0;

        while (i + 2 <= values.len) : (i += 2) {
            const vec: VecType = values[i..][0..2].*;
            const swapped = @byteSwap(vec);

            const out_offset = i * 8;

            if (output_aligned and isAligned(output.ptr + out_offset, 16)) {
                // Fast path: aligned write
                const dest_ptr: *align(16) [16]u8 = @ptrCast(@alignCast(output[out_offset..].ptr));
                const swapped_bytes: *const [16]u8 = @ptrCast(&swapped);
                dest_ptr.* = swapped_bytes.*;
            } else {
                // Standard path: unaligned write
                const swapped_bytes: *const [16]u8 = @ptrCast(&swapped);
                @memcpy(output[out_offset..][0..16], swapped_bytes);
            }
        }

        // Handle remaining element
        if (i < values.len) {
            var buffer: [8]u8 = undefined;
            writeU64Fast(&buffer, values[i]);
            @memcpy(output[i * 8 ..][0..8], &buffer);
        }

        return values.len * 8;
    } else {
        for (values, 0..) |val, i| {
            var buffer: [8]u8 = undefined;
            writeU64Fast(&buffer, val);
            @memcpy(output[i * 8 ..][0..8], &buffer);
        }
        return values.len * 8;
    }
}

// ========== End of Byte Order Conversion Optimizations ==========

/// Helper to check if two Payloads are equal (deep equality)
/// Note: For performance, consider limiting the use of arrays/maps as keys
fn payloadEqual(a: Payload, b: Payload) bool {
    return payloadEqualDepth(a, b, 0);
}

/// Internal helper for deep equality checking with depth tracking
/// max_depth prevents infinite recursion for cyclic structures
fn payloadEqualDepth(a: Payload, b: Payload, depth: usize) bool {
    // Prevent excessive recursion (e.g., deeply nested structures)
    const MAX_DEPTH = 100;
    if (depth > MAX_DEPTH) {
        return false;
    }

    // Compare by type first
    if (@as(@typeInfo(@TypeOf(a)).@"union".tag_type.?, a) != @as(@typeInfo(@TypeOf(b)).@"union".tag_type.?, b)) {
        return false;
    }

    return switch (a) {
        .nil => true,
        .bool => |av| av == b.bool,
        .int => |av| av == b.int,
        .uint => |av| av == b.uint,
        .float => |av| av == b.float,
        .str => |av| stringEqualSIMD(av.value(), b.str.value()),
        .bin => |av| binaryEqualSIMD(av.value(), b.bin.value()),
        .timestamp => |av| av.seconds == b.timestamp.seconds and av.nanoseconds == b.timestamp.nanoseconds,
        .ext => |av| av.type == b.ext.type and binaryEqualSIMD(av.data, b.ext.data),

        // Deep equality for arrays
        .arr => |av| {
            const bv = b.arr;
            if (av.len != bv.len) return false;
            for (av, bv) |a_item, b_item| {
                if (!payloadEqualDepth(a_item, b_item, depth + 1)) {
                    return false;
                }
            }
            return true;
        },

        // Deep equality for maps
        .map => |av| {
            const bv = b.map;
            if (av.count() != bv.count()) return false;

            // Check that all entries in 'a' exist in 'b' with same values
            var it = av.map.iterator();
            while (it.next()) |a_entry| {
                // Look up the key in map b
                if (bv.map.get(a_entry.key_ptr.*)) |b_value| {
                    if (!payloadEqualDepth(a_entry.value_ptr.*, b_value, depth + 1)) {
                        return false; // Key found but value differs
                    }
                } else {
                    return false; // Key not found in b
                }
            }
            return true;
        },
    };
}

/// Deep clone a Payload (allocates new memory for dynamic types)
fn clonePayload(payload: Payload, allocator: Allocator) !Payload {
    return switch (payload) {
        .nil, .bool, .int, .uint, .float, .timestamp => payload, // Value types, no allocation needed

        .str => |s| try Payload.strToPayload(s.value(), allocator),
        .bin => |b| try Payload.binToPayload(b.value(), allocator),
        .ext => |e| try Payload.extToPayload(e.type, e.data, allocator),

        .arr => |arr| {
            const new_arr = try allocator.alloc(Payload, arr.len);
            var cloned_count: usize = 0;
            errdefer {
                // cleanup partial clones on error
                for (new_arr[0..cloned_count]) |item| {
                    item.free(allocator);
                }
                allocator.free(new_arr);
            }
            for (arr, 0..) |item, i| {
                new_arr[i] = try clonePayload(item, allocator);
                cloned_count += 1;
            }
            return Payload{ .arr = new_arr };
        },

        .map => |m| {
            var new_map = Map.init(allocator);
            errdefer (Payload{ .map = new_map }).free(allocator);

            // Clone all entries
            var it = m.map.iterator();
            while (it.next()) |entry| {
                const cloned_key = try clonePayload(entry.key_ptr.*, allocator);
                errdefer cloned_key.free(allocator);
                const cloned_value = try clonePayload(entry.value_ptr.*, allocator);
                errdefer cloned_value.free(allocator);

                // Use putInternal to insert without additional cloning
                try new_map.putInternal(cloned_key, cloned_value);
            }
            return Payload{ .map = new_map };
        },
    };
}

/// HashMap context for Payload keys
const PayloadHashContext = struct {
    pub fn hash(_: PayloadHashContext, key: Payload) u64 {
        return payloadHash(key);
    }

    pub fn eql(_: PayloadHashContext, a: Payload, b: Payload) bool {
        return payloadEqual(a, b);
    }
};

/// Internal HashMap type alias for cleaner code
const PayloadHashMap = std.HashMap(Payload, Payload, PayloadHashContext, std.hash_map.default_max_load_percentage);

/// Map type supporting any Payload as key
/// Now uses HashMap for O(1) average case lookups instead of O(n) linear search
pub const Map = struct {
    map: PayloadHashMap,
    allocator: Allocator,

    const Self = @This();

    /// Iterator for Map entries
    pub const Iterator = struct {
        inner: PayloadHashMap.Iterator,

        pub const Entry = struct {
            key_ptr: *const Payload,
            value_ptr: *Payload,
        };

        pub fn next(self: *Iterator) ?Entry {
            const entry = self.inner.next() orelse return null;
            return Entry{
                .key_ptr = entry.key_ptr,
                .value_ptr = entry.value_ptr,
            };
        }
    };

    pub fn init(allocator: Allocator) Self {
        return Self{
            .map = PayloadHashMap.init(allocator),
            .allocator = allocator,
        };
    }

    pub fn deinit(self: *Self) void {
        self.map.deinit();
    }

    pub fn count(self: Self) usize {
        return self.map.count();
    }

    /// Get value by Payload key
    pub fn get(self: Self, key: Payload) ?Payload {
        return self.map.get(key);
    }

    /// Get pointer to value by Payload key
    pub fn getPtr(self: Self, key: Payload) ?*Payload {
        return self.map.getPtr(key);
    }

    /// Get value by string key (for backward compatibility)
    pub fn getByString(self: Self, key: []const u8) ?Payload {
        const key_payload = Payload{ .str = Str.init(key) };
        return self.map.get(key_payload);
    }

    /// Put or update a key-value pair (internal, no cloning)
    /// Used by deserialization where keys are already allocated
    fn putInternal(self: *Self, key: Payload, value: Payload) !void {
        const gop = try self.map.getOrPut(key);
        if (gop.found_existing) {
            // Key already exists, free the old key and update value
            gop.key_ptr.free(self.allocator);
            gop.key_ptr.* = key;
            gop.value_ptr.* = value;
        } else {
            // New entry, set key and value
            gop.key_ptr.* = key;
            gop.value_ptr.* = value;
        }
    }

    /// Put or update a key-value pair
    /// Note: The key will be deep-cloned to ensure the map owns it
    /// Optimization: Uses getOrPut to hash key only once instead of twice
    pub fn put(self: *Self, key: Payload, value: Payload) !void {
        // Use getOrPut to hash key only once (instead of getPtr + put)
        const gop = try self.map.getOrPut(key);
        if (gop.found_existing) {
            // Key exists, just update the value without cloning
            gop.value_ptr.* = value;
        } else {
            // Key doesn't exist, clone it and insert
            const cloned_key = try clonePayload(key, self.allocator);
            errdefer cloned_key.free(self.allocator);
            gop.key_ptr.* = cloned_key;
            gop.value_ptr.* = value;
        }
    }

    /// Put or update with string key (for backward compatibility)
    /// This allocates memory for the key string
    /// Optimization: Uses getOrPut to hash key only once instead of twice
    pub fn putString(self: *Self, key: []const u8, value: Payload) !void {
        const key_payload = Payload{ .str = Str.init(key) };

        // Use getOrPut to hash key only once (instead of getPtr + put)
        const gop = try self.map.getOrPut(key_payload);
        if (gop.found_existing) {
            // Key exists, just update the value
            gop.value_ptr.* = value;
        } else {
            // Key doesn't exist, allocate and insert
            const new_key = try self.allocator.alloc(u8, key.len);
            errdefer self.allocator.free(new_key);
            @memcpy(new_key, key);

            gop.key_ptr.* = Payload{ .str = Str.init(new_key) };
            gop.value_ptr.* = value;
        }
    }

    /// Get or create an entry, returning pointers to key and value
    pub fn getOrPut(self: *Self, key: []const u8) !struct { found_existing: bool, key_ptr: *[]const u8, value_ptr: *Payload } {
        const key_payload = Payload{ .str = Str.init(key) };

        const gop = try self.map.getOrPut(key_payload);
        if (gop.found_existing) {
            // Entry exists, return pointers
            const key_str_ptr: *[]const u8 = @constCast(&gop.key_ptr.str.str);
            return .{
                .found_existing = true,
                .key_ptr = key_str_ptr,
                .value_ptr = gop.value_ptr,
            };
        } else {
            // New entry, allocate key and initialize
            const new_key = try self.allocator.alloc(u8, key.len);
            errdefer self.allocator.free(new_key);
            @memcpy(new_key, key);

            gop.key_ptr.* = Payload{ .str = Str.init(new_key) };
            gop.value_ptr.* = Payload{ .nil = void{} };

            const key_str_ptr: *[]const u8 = @constCast(&gop.key_ptr.str.str);
            return .{
                .found_existing = false,
                .key_ptr = key_str_ptr,
                .value_ptr = gop.value_ptr,
            };
        }
    }

    /// Ensure capacity for at least the specified number of entries
    pub fn ensureTotalCapacity(self: *Self, new_capacity: u32) !void {
        try self.map.ensureTotalCapacity(new_capacity);
    }

    /// Get an iterator over map entries
    pub fn iterator(self: *const Self) Iterator {
        return Iterator{
            .inner = self.map.iterator(),
        };
    }
};

/// Entity to store msgpack
///
/// Note: The payload and its subvalues must have the same allocator
pub const Payload = union(enum) {
    /// the error for Payload
    pub const Error = error{
        NotMap,
        NotArray,
    };

    nil: void,
    bool: bool,
    int: i64,
    uint: u64,
    float: f64,
    str: Str,
    bin: Bin,
    arr: []Payload,
    map: Map,
    ext: EXT,
    timestamp: Timestamp,

    /// get array element
    pub fn getArrElement(self: Payload, index: usize) !Payload {
        if (self != .arr) {
            return Error.NotArray;
        }
        return self.arr[index];
    }

    /// get array length
    pub fn getArrLen(self: Payload) !usize {
        if (self != .arr) {
            return Error.NotArray;
        }
        return self.arr.len;
    }

    /// get map's element by string key (backward compatible)
    pub fn mapGet(self: Payload, key: []const u8) !?Payload {
        if (self != .map) {
            return Error.NotMap;
        }
        return self.map.getByString(key);
    }

    /// get map's element by Payload key (supports any key type)
    pub fn mapGetGeneric(self: Payload, key: Payload) !?Payload {
        if (self != .map) {
            return Error.NotMap;
        }
        return self.map.get(key);
    }

    /// set array element
    pub fn setArrElement(self: *Payload, index: usize, val: Payload) !void {
        if (self.* != .arr) {
            return Error.NotArray;
        }
        self.arr[index] = val;
    }

    /// put a new element to map payload with string key (backward compatible)
    pub fn mapPut(self: *Payload, key: []const u8, val: Payload) !void {
        if (self.* != .map) {
            return Error.NotMap;
        }
        try self.map.putString(key, val);
    }

    /// put a new element to map payload with Payload key (supports any key type)
    /// Note: The key Payload will be stored directly, caller is responsible for
    /// managing key's memory if needed (e.g., for str/bin/ext types)
    pub fn mapPutGeneric(self: *Payload, key: Payload, val: Payload) !void {
        if (self.* != .map) {
            return Error.NotMap;
        }
        try self.map.put(key, val);
    }

    /// deep clone a Payload, allocating owned copies for dynamic data
    pub fn deepClone(self: Payload, allocator: Allocator) !Payload {
        return clonePayload(self, allocator);
    }

    /// get a NIL payload
    pub inline fn nilToPayload() Payload {
        return Payload{
            .nil = void{},
        };
    }

    /// get a bool payload
    pub inline fn boolToPayload(val: bool) Payload {
        return Payload{
            .bool = val,
        };
    }

    /// get a int payload
    pub inline fn intToPayload(val: i64) Payload {
        return Payload{
            .int = val,
        };
    }

    /// get a uint payload
    pub inline fn uintToPayload(val: u64) Payload {
        return Payload{
            .uint = val,
        };
    }

    /// get a float payload
    pub inline fn floatToPayload(val: f64) Payload {
        return Payload{
            .float = val,
        };
    }

    /// get a str payload
    pub fn strToPayload(val: []const u8, allocator: Allocator) !Payload {
        // allocate memory
        const new_str = try allocator.alloc(u8, val.len);
        // copy the value
        @memcpy(new_str, val);
        return Payload{
            .str = Str.init(new_str),
        };
    }

    /// get a bin payload
    pub fn binToPayload(val: []const u8, allocator: Allocator) !Payload {
        // allocate memory
        const new_bin = try allocator.alloc(u8, val.len);
        // copy the value
        @memcpy(new_bin, val);
        return Payload{
            .bin = Bin.init(new_bin),
        };
    }

    /// get an array payload
    pub fn arrPayload(len: usize, allocator: Allocator) !Payload {
        const arr = try allocator.alloc(Payload, len);
        // Initialize with nil to ensure safe memory state for free()
        // Note: While this adds overhead, it prevents undefined behavior
        // when arrays are partially filled or freed before full initialization

        // Optimization: Use pointer arithmetic for faster initialization
        // This is significantly faster than a loop for large arrays
        const nil_payload = Payload.nilToPayload();
        for (arr) |*item| {
            item.* = nil_payload;
        }
        return Payload{
            .arr = arr,
        };
    }

    /// get a map payload
    pub fn mapPayload(allocator: Allocator) Payload {
        return Payload{
            .map = Map.init(allocator),
        };
    }

    /// get an ext payload
    pub fn extToPayload(t: i8, data: []const u8, allocator: Allocator) !Payload {
        // allocate memory
        const new_data = try allocator.alloc(u8, data.len);
        // copy the value
        @memcpy(new_data, data);
        return Payload{
            .ext = EXT.init(t, new_data),
        };
    }

    /// get a timestamp payload
    pub inline fn timestampToPayload(seconds: i64, nanoseconds: u32) Payload {
        return Payload{
            .timestamp = Timestamp.new(seconds, nanoseconds),
        };
    }

    /// get a timestamp payload from seconds only
    pub inline fn timestampFromSeconds(seconds: i64) Payload {
        return Payload{
            .timestamp = Timestamp.fromSeconds(seconds),
        };
    }

    /// get a timestamp payload from nanoseconds since Unix epoch
    pub inline fn timestampFromNanos(nanos: i128) Payload {
        return Payload{
            .timestamp = Timestamp.fromNanos(nanos),
        };
    }

    /// free all memory for this payload and sub payloads
    /// the allocator is payload's allocator
    /// This is an iterative implementation that avoids stack overflow from deep nesting
    /// Optimization: Uses stack-allocated buffer for shallow structures to avoid heap allocation during free
    pub fn free(self: Payload, allocator: Allocator) void {
        // Use stack-allocated buffer for shallow structures (up to 256 items)
        // This avoids heap allocation during memory cleanup for most common cases
        const STACK_BUFFER_SIZE = 256;
        var stack_buffer: [STACK_BUFFER_SIZE]Payload = undefined;
        var stack_len: usize = 0;

        // Fallback to heap if we exceed stack buffer
        var heap_stack: ?std.ArrayList(Payload) = null;
        defer if (heap_stack) |*hs| {
            if (current_zig.minor == 14) {
                hs.deinit();
            } else {
                hs.deinit(allocator);
            }
        };

        // Helper to push to stack (tries stack first, falls back to heap)
        const pushPayload = struct {
            fn push(
                buffer: []Payload,
                len: *usize,
                heap: *?std.ArrayList(Payload),
                alloc: Allocator,
                payload: Payload,
            ) void {
                if (heap.*) |*h| {
                    // Already using heap
                    if (current_zig.minor == 14) {
                        h.append(payload) catch {};
                    } else {
                        h.append(alloc, payload) catch {};
                    }
                } else if (len.* < buffer.len) {
                    // Stack buffer has space
                    buffer[len.*] = payload;
                    len.* += 1;
                } else {
                    // Stack buffer full, migrate to heap
                    var new_heap = if (current_zig.minor == 14)
                        std.ArrayList(Payload).init(alloc)
                    else
                        std.ArrayList(Payload).empty;

                    // Copy existing items from stack buffer to heap
                    for (buffer[0..len.*]) |item| {
                        if (current_zig.minor == 14) {
                            new_heap.append(item) catch return;
                        } else {
                            new_heap.append(alloc, item) catch return;
                        }
                    }
                    // Add new item
                    if (current_zig.minor == 14) {
                        new_heap.append(payload) catch return;
                    } else {
                        new_heap.append(alloc, payload) catch return;
                    }
                    heap.* = new_heap;
                    len.* = 0; // Clear stack buffer
                }
            }
        }.push;

        // Helper to pop from stack
        const popPayload = struct {
            fn pop(
                buffer: []Payload,
                len: *usize,
                heap: *?std.ArrayList(Payload),
            ) ?Payload {
                if (heap.*) |*h| {
                    if (h.items.len > 0) {
                        return h.pop();
                    }
                }
                if (len.* > 0) {
                    len.* -= 1;
                    return buffer[len.*];
                }
                return null;
            }
        }.pop;

        // Start with self
        pushPayload(&stack_buffer, &stack_len, &heap_stack, allocator, self);

        while (popPayload(&stack_buffer, &stack_len, &heap_stack)) |payload_item| {
            switch (payload_item) {
                .str => |s| allocator.free(s.value()),
                .bin => |b| allocator.free(b.value()),
                .ext => |e| allocator.free(e.data),

                .arr => |arr| {
                    defer allocator.free(arr);
                    // Push children to stack in reverse order
                    var i = arr.len;
                    while (i > 0) {
                        i -= 1;
                        pushPayload(&stack_buffer, &stack_len, &heap_stack, allocator, arr[i]);
                    }
                },

                .map => |map| {
                    var map_copy = map;
                    defer map_copy.deinit();
                    // Push both keys and values to stack for recursive freeing
                    var it = map_copy.map.iterator();
                    while (it.next()) |entry| {
                        pushPayload(&stack_buffer, &stack_len, &heap_stack, allocator, entry.key_ptr.*);
                        pushPayload(&stack_buffer, &stack_len, &heap_stack, allocator, entry.value_ptr.*);
                    }
                },

                else => {}, // nil, bool, int, uint, float, timestamp - no memory to free
            }
        }
    }

    /// get an i64 value from payload
    /// Tries to get i64 value, converting uint if it fits within i64 range.
    /// This is a lenient conversion method.
    pub fn getInt(self: Payload) !i64 {
        return switch (self) {
            .int => |val| val,
            .uint => |val| {
                if (val <= std.math.maxInt(i64)) {
                    return @intCast(val);
                }
                // Value exceeds i64 range
                return MsgPackError.InvalidType;
            },
            else => return MsgPackError.InvalidType,
        };
    }

    /// get an u64 value from payload
    /// Tries to get u64 value, converting positive int if possible.
    /// This is a lenient conversion method.
    pub fn getUint(self: Payload) !u64 {
        return switch (self) {
            .int => |val| {
                if (val >= 0) {
                    return @intCast(val);
                }
                // Negative values cannot be converted to u64
                return MsgPackError.InvalidType;
            },
            .uint => |val| val,
            else => return MsgPackError.InvalidType,
        };
    }

    /// Get i64 value without type conversion (strict mode).
    /// Returns error if payload is not exactly an int type.
    pub fn asInt(self: Payload) !i64 {
        return switch (self) {
            .int => |val| val,
            else => MsgPackError.InvalidType,
        };
    }

    /// Get u64 value without type conversion (strict mode).
    /// Returns error if payload is not exactly a uint type.
    pub fn asUint(self: Payload) !u64 {
        return switch (self) {
            .uint => |val| val,
            else => MsgPackError.InvalidType,
        };
    }

    /// Get f64 value without type conversion.
    pub fn asFloat(self: Payload) !f64 {
        return switch (self) {
            .float => |val| val,
            else => MsgPackError.InvalidType,
        };
    }

    /// Get bool value.
    pub fn asBool(self: Payload) !bool {
        return switch (self) {
            .bool => |val| val,
            else => MsgPackError.InvalidType,
        };
    }

    /// Get string slice. The string data is owned by the Payload.
    pub fn asStr(self: Payload) ![]const u8 {
        return switch (self) {
            .str => |s| s.value(),
            else => MsgPackError.InvalidType,
        };
    }

    /// Get binary data slice. The data is owned by the Payload.
    pub fn asBin(self: Payload) ![]u8 {
        return switch (self) {
            .bin => |b| b.value(),
            else => MsgPackError.InvalidType,
        };
    }

    /// Check if payload is nil.
    pub inline fn isNil(self: Payload) bool {
        return self == .nil;
    }

    /// Check if payload is a number (int, uint, or float).
    pub inline fn isNumber(self: Payload) bool {
        return switch (self) {
            .int, .uint, .float => true,
            else => false,
        };
    }

    /// Check if payload is an integer (int or uint).
    pub inline fn isInteger(self: Payload) bool {
        return switch (self) {
            .int, .uint => true,
            else => false,
        };
    }
};

/// markers
const Markers = enum(u8) {
    POSITIVE_FIXINT = 0x00,
    FIXMAP = 0x80,
    FIXARRAY = 0x90,
    FIXSTR = 0xa0,
    NIL = 0xc0,
    FALSE = 0xc2,
    TRUE = 0xc3,
    BIN8 = 0xc4,
    BIN16 = 0xc5,
    BIN32 = 0xc6,
    EXT8 = 0xc7,
    EXT16 = 0xc8,
    EXT32 = 0xc9,
    FLOAT32 = 0xca,
    FLOAT64 = 0xcb,
    UINT8 = 0xcc,
    UINT16 = 0xcd,
    UINT32 = 0xce,
    UINT64 = 0xcf,
    INT8 = 0xd0,
    INT16 = 0xd1,
    INT32 = 0xd2,
    INT64 = 0xd3,
    FIXEXT1 = 0xd4,
    FIXEXT2 = 0xd5,
    FIXEXT4 = 0xd6,
    FIXEXT8 = 0xd7,
    FIXEXT16 = 0xd8,
    STR8 = 0xd9,
    STR16 = 0xda,
    STR32 = 0xdb,
    ARRAY16 = 0xdc,
    ARRAY32 = 0xdd,
    MAP16 = 0xde,
    MAP32 = 0xdf,
    NEGATIVE_FIXINT = 0xe0,
};

/// A collection of errors that may occur when reading the payload
pub const MsgPackError = error{
    StrDataLengthTooLong,
    BinDataLengthTooLong,
    ArrayLengthTooLong,
    TupleLengthTooLong,
    MapLengthTooLong,
    InputValueTooLarge,
    FixedValueWriting,
    TypeMarkerReading,
    TypeMarkerWriting,
    DataReading,
    DataWriting,
    ExtTypeReading,
    ExtTypeWriting,
    ExtTypeLength,
    InvalidType,
    LengthReading,
    LengthWriting,
    Internal,

    // New safety errors for iterative parser
    MaxDepthExceeded, // Nesting depth exceeded limit
    ArrayTooLarge, // Array has too many elements
    MapTooLarge, // Map has too many key-value pairs
    StringTooLong, // String exceeds length limit
    ExtDataTooLarge, // Extension data exceeds length limit
};

/// Create an instance of msgpack_pack with custom limits
pub fn PackWithLimits(
    comptime WriteContext: type,
    comptime ReadContext: type,
    comptime WriteError: type,
    comptime ReadError: type,
    comptime writeFn: fn (context: WriteContext, bytes: []const u8) WriteError!usize,
    comptime readFn: fn (context: ReadContext, arr: []u8) ReadError!usize,
    comptime limits: ParseLimits,
) type {
    return struct {
        write_context: WriteContext,
        read_context: ReadContext,

        const Self = @This();
        const parse_limits = limits;

        /// init
        pub fn init(writeContext: WriteContext, readContext: ReadContext) Self {
            return Self{
                .write_context = writeContext,
                .read_context = readContext,
            };
        }

        /// wrap for writeFn
        fn writeTo(self: Self, bytes: []const u8) !usize {
            return writeFn(self.write_context, bytes);
        }

        /// write one byte
        inline fn writeByte(self: Self, byte: u8) !void {
            const bytes = [_]u8{byte};
            const len = try self.writeTo(&bytes);
            if (len != 1) {
                return MsgPackError.LengthWriting;
            }
        }

        /// write data
        inline fn writeData(self: Self, data: []const u8) !void {
            const len = try self.writeTo(data);
            if (len != data.len) {
                return MsgPackError.LengthWriting;
            }
        }

        /// Generic integer write helper
        inline fn writeIntRaw(self: Self, comptime T: type, val: T) !void {
            // Use optimized SIMD byte swap for common integer types
            if (T == u32) {
                var arr: [4]u8 = undefined;
                writeU32Fast(&arr, val);
                try self.writeData(&arr);
            } else if (T == u64) {
                var arr: [8]u8 = undefined;
                writeU64Fast(&arr, val);
                try self.writeData(&arr);
            } else {
                // Standard path for other types (u8, u16, i8, i16, i32, i64)
                var arr: [@sizeOf(T)]u8 = undefined;
                std.mem.writeInt(T, &arr, val, big_endian);
                try self.writeData(&arr);
            }
        }

        /// Generic data write with length prefix
        inline fn writeDataWithLength(self: Self, comptime LenType: type, data: []const u8) !void {
            try self.writeIntRaw(LenType, @intCast(data.len));
            try self.writeData(data);
        }

        /// Generic integer value write (without marker)
        inline fn writeIntValue(self: Self, comptime T: type, val: T) !void {
            if (T == u8 or T == i8) {
                try self.writeByte(@bitCast(val));
            } else {
                try self.writeIntRaw(T, val);
            }
        }

        /// Generic integer write with marker
        inline fn writeIntWithMarker(self: Self, comptime T: type, marker: Markers, val: T) !void {
            try self.writeTypeMarker(marker);
            try self.writeIntValue(T, val);
        }

        /// write type marker
        inline fn writeTypeMarker(self: Self, comptime marker: Markers) !void {
            switch (marker) {
                .POSITIVE_FIXINT, .FIXMAP, .FIXARRAY, .FIXSTR, .NEGATIVE_FIXINT => {
                    const err_msg = comptimePrint("marker ({}) is wrong, the can not be write directly!", .{marker});
                    @compileError(err_msg);
                },
                else => {},
            }
            try self.writeByte(@intFromEnum(marker));
        }

        /// write nil
        fn writeNil(self: Self) !void {
            try self.writeTypeMarker(Markers.NIL);
        }

        /// write bool
        fn writeBool(self: Self, val: bool) !void {
            if (val) {
                try self.writeTypeMarker(Markers.TRUE);
            } else {
                try self.writeTypeMarker(Markers.FALSE);
            }
        }

        /// write positive fix int
        inline fn writePfixInt(self: Self, val: u8) !void {
            if (val <= MAX_POSITIVE_FIXINT) {
                try self.writeByte(val);
            } else {
                return MsgPackError.InputValueTooLarge;
            }
        }

        inline fn writeU8Value(self: Self, val: u8) !void {
            try self.writeIntValue(u8, val);
        }

        /// write u8 int
        fn writeU8(self: Self, val: u8) !void {
            try self.writeIntWithMarker(u8, .UINT8, val);
        }

        inline fn writeU16Value(self: Self, val: u16) !void {
            try self.writeIntValue(u16, val);
        }

        /// write u16 int
        fn writeU16(self: Self, val: u16) !void {
            try self.writeIntWithMarker(u16, .UINT16, val);
        }

        inline fn writeU32Value(self: Self, val: u32) !void {
            try self.writeIntValue(u32, val);
        }

        /// write u32 int
        fn writeU32(self: Self, val: u32) !void {
            try self.writeIntWithMarker(u32, .UINT32, val);
        }

        inline fn writeU64Value(self: Self, val: u64) !void {
            try self.writeIntValue(u64, val);
        }

        /// write u64 int
        fn writeU64(self: Self, val: u64) !void {
            try self.writeIntWithMarker(u64, .UINT64, val);
        }

        /// write negative fix int
        inline fn writeNfixInt(self: Self, val: i8) !void {
            if (val >= MIN_NEGATIVE_FIXINT and val <= -1) {
                try self.writeByte(@bitCast(val));
            } else {
                return MsgPackError.InputValueTooLarge;
            }
        }

        inline fn writeI8Value(self: Self, val: i8) !void {
            try self.writeIntValue(i8, val);
        }

        /// write i8 int
        fn writeI8(self: Self, val: i8) !void {
            try self.writeIntWithMarker(i8, .INT8, val);
        }

        inline fn writeI16Value(self: Self, val: i16) !void {
            try self.writeIntValue(i16, val);
        }

        /// write i16 int
        fn writeI16(self: Self, val: i16) !void {
            try self.writeIntWithMarker(i16, .INT16, val);
        }

        inline fn writeI32Value(self: Self, val: i32) !void {
            try self.writeIntValue(i32, val);
        }

        /// write i32 int
        fn writeI32(self: Self, val: i32) !void {
            try self.writeIntWithMarker(i32, .INT32, val);
        }

        inline fn writeI64Value(self: Self, val: i64) !void {
            try self.writeIntValue(i64, val);
        }

        /// write i64 int
        fn writeI64(self: Self, val: i64) !void {
            try self.writeIntWithMarker(i64, .INT64, val);
        }

        /// write uint
        fn writeUint(self: Self, val: u64) !void {
            if (val <= MAX_POSITIVE_FIXINT) {
                try self.writePfixInt(@intCast(val));
            } else if (val <= MAX_UINT8) {
                try self.writeU8(@intCast(val));
            } else if (val <= MAX_UINT16) {
                try self.writeU16(@intCast(val));
            } else if (val <= MAX_UINT32) {
                try self.writeU32(@intCast(val));
            } else {
                try self.writeU64(val);
            }
        }

        /// write int
        fn writeInt(self: Self, val: i64) !void {
            if (val >= 0) {
                try self.writeUint(@intCast(val));
            } else if (val >= MIN_NEGATIVE_FIXINT) {
                try self.writeNfixInt(@intCast(val));
            } else if (val >= MIN_INT8) {
                try self.writeI8(@intCast(val));
            } else if (val >= MIN_INT16) {
                try self.writeI16(@intCast(val));
            } else if (val >= MIN_INT32) {
                try self.writeI32(@intCast(val));
            } else {
                try self.writeI64(val);
            }
        }

        inline fn writeF32Value(self: Self, val: f32) !void {
            const int: u32 = @bitCast(val);
            var buffer: [4]u8 = undefined;
            writeU32Fast(&buffer, int);
            try self.writeData(&buffer);
        }

        /// write f32
        fn writeF32(self: Self, val: f32) !void {
            try self.writeTypeMarker(.FLOAT32);
            try self.writeF32Value(val);
        }

        inline fn writeF64Value(self: Self, val: f64) !void {
            const int: u64 = @bitCast(val);
            var arr: [8]u8 = undefined;
            std.mem.writeInt(u64, &arr, int, big_endian);

            try self.writeData(&arr);
        }

        /// write f64
        fn writeF64(self: Self, val: f64) !void {
            try self.writeTypeMarker(.FLOAT64);
            try self.writeF64Value(val);
        }

        /// write float
        fn writeFloat(self: Self, val: f64) !void {
            // A value should only be encoded as f32 if it can be
            // represented exactly without loss of precision.
            const val_f32: f32 = @floatCast(val);
            if (val == @as(f64, val_f32)) {
                try self.writeF32(val_f32);
            } else {
                try self.writeF64(val);
            }
        }

        inline fn writeFixStrValue(self: Self, str: []const u8) !void {
            try self.writeData(str);
        }

        /// write fix str
        fn writeFixStr(self: Self, str: []const u8) !void {
            const len = str.len;
            if (len > MAX_FIXSTR_LEN) {
                return MsgPackError.StrDataLengthTooLong;
            }
            const header: u8 = @intFromEnum(Markers.FIXSTR) + @as(u8, @intCast(len));
            try self.writeByte(header);
            try self.writeFixStrValue(str);
        }

        /// Generic string writer for different size formats
        /// Reduces code duplication for STR8/16/32
        inline fn writeStrGeneric(self: Self, comptime LenType: type, comptime marker: Markers, str: []const u8) !void {
            const max_len = std.math.maxInt(LenType);
            if (str.len > max_len) {
                return MsgPackError.StrDataLengthTooLong;
            }
            try self.writeTypeMarker(marker);
            try self.writeDataWithLength(LenType, str);
        }

        inline fn writeStr8Value(self: Self, str: []const u8) !void {
            try self.writeDataWithLength(u8, str);
        }

        fn writeStr8(self: Self, str: []const u8) !void {
            try self.writeStrGeneric(u8, .STR8, str);
        }

        inline fn writeStr16Value(self: Self, str: []const u8) !void {
            try self.writeDataWithLength(u16, str);
        }

        fn writeStr16(self: Self, str: []const u8) !void {
            try self.writeStrGeneric(u16, .STR16, str);
        }

        inline fn writeStr32Value(self: Self, str: []const u8) !void {
            try self.writeDataWithLength(u32, str);
        }

        fn writeStr32(self: Self, str: []const u8) !void {
            try self.writeStrGeneric(u32, .STR32, str);
        }

        /// write str
        fn writeStr(self: Self, str: Str) !void {
            const len = str.value().len;
            if (len <= MAX_FIXSTR_LEN) {
                try self.writeFixStr(str.value());
            } else if (len <= MAX_UINT8) {
                try self.writeStr8(str.value());
            } else if (len <= MAX_UINT16) {
                try self.writeStr16(str.value());
            } else {
                try self.writeStr32(str.value());
            }
        }

        /// Generic binary writer for different size formats
        /// Reduces code duplication for BIN8/16/32
        inline fn writeBinGeneric(self: Self, comptime LenType: type, comptime marker: Markers, bin: []const u8) !void {
            const max_len = std.math.maxInt(LenType);
            if (bin.len > max_len) {
                return MsgPackError.BinDataLengthTooLong;
            }
            try self.writeTypeMarker(marker);
            try self.writeDataWithLength(LenType, bin);
        }

        fn writeBin8(self: Self, bin: []const u8) !void {
            try self.writeBinGeneric(u8, .BIN8, bin);
        }

        fn writeBin16(self: Self, bin: []const u8) !void {
            try self.writeBinGeneric(u16, .BIN16, bin);
        }

        fn writeBin32(self: Self, bin: []const u8) !void {
            try self.writeBinGeneric(u32, .BIN32, bin);
        }

        /// write bin
        fn writeBin(self: Self, bin: Bin) !void {
            const len = bin.value().len;
            if (len <= MAX_UINT8) {
                try self.writeBin8(bin.value());
            } else if (len <= MAX_UINT16) {
                try self.writeBin16(bin.value());
            } else {
                try self.writeBin32(bin.value());
            }
        }

        inline fn writeExtValue(self: Self, ext: EXT) !void {
            try self.writeI8Value(ext.type);
            try self.writeData(ext.data);
        }

        /// Generic fixed-size extension writer
        /// Reduces code duplication for FIXEXT1/2/4/8/16
        inline fn writeFixExtGeneric(self: Self, comptime expected_len: usize, comptime marker: Markers, ext: EXT) !void {
            if (ext.data.len != expected_len) {
                return MsgPackError.ExtTypeLength;
            }
            try self.writeTypeMarker(marker);
            try self.writeExtValue(ext);
        }

        fn writeFixExt1(self: Self, ext: EXT) !void {
            try self.writeFixExtGeneric(FIXEXT1_LEN, .FIXEXT1, ext);
        }

        fn writeFixExt2(self: Self, ext: EXT) !void {
            try self.writeFixExtGeneric(FIXEXT2_LEN, .FIXEXT2, ext);
        }

        fn writeFixExt4(self: Self, ext: EXT) !void {
            try self.writeFixExtGeneric(FIXEXT4_LEN, .FIXEXT4, ext);
        }

        fn writeFixExt8(self: Self, ext: EXT) !void {
            try self.writeFixExtGeneric(FIXEXT8_LEN, .FIXEXT8, ext);
        }

        fn writeFixExt16(self: Self, ext: EXT) !void {
            try self.writeFixExtGeneric(FIXEXT16_LEN, .FIXEXT16, ext);
        }

        /// Generic extension writer for variable-size formats
        /// Reduces code duplication for EXT8/16/32
        inline fn writeExtGeneric(self: Self, comptime LenType: type, comptime marker: Markers, ext: EXT) !void {
            const max_len = std.math.maxInt(LenType);
            if (ext.data.len > max_len) {
                return MsgPackError.ExtTypeLength;
            }
            try self.writeTypeMarker(marker);

            // Write length using appropriate size
            const len_val: LenType = @intCast(ext.data.len);
            try self.writeIntValue(LenType, len_val);

            try self.writeExtValue(ext);
        }

        fn writeExt8(self: Self, ext: EXT) !void {
            try self.writeExtGeneric(u8, .EXT8, ext);
        }

        fn writeExt16(self: Self, ext: EXT) !void {
            try self.writeExtGeneric(u16, .EXT16, ext);
        }

        fn writeExt32(self: Self, ext: EXT) !void {
            try self.writeExtGeneric(u32, .EXT32, ext);
        }

        fn writeExt(self: Self, ext: EXT) !void {
            const len = ext.data.len;
            if (len == FIXEXT1_LEN) {
                try self.writeFixExt1(ext);
            } else if (len == FIXEXT2_LEN) {
                try self.writeFixExt2(ext);
            } else if (len == FIXEXT4_LEN) {
                try self.writeFixExt4(ext);
            } else if (len == FIXEXT8_LEN) {
                try self.writeFixExt8(ext);
            } else if (len == FIXEXT16_LEN) {
                try self.writeFixExt16(ext);
            } else if (len <= std.math.maxInt(u8)) {
                try self.writeExt8(ext);
            } else if (len <= std.math.maxInt(u16)) {
                try self.writeExt16(ext);
            } else if (len <= std.math.maxInt(u32)) {
                try self.writeExt32(ext);
            } else {
                return MsgPackError.ExtTypeLength;
            }
        }

        /// write timestamp
        fn writeTimestamp(self: Self, timestamp: Timestamp) !void {
            // According to MessagePack spec, timestamp uses extension type -1

            // timestamp 32 format: seconds fit in 32-bit unsigned int and nanoseconds is 0
            if (timestamp.nanoseconds == 0 and timestamp.seconds >= 0 and timestamp.seconds <= MAX_UINT32) {
                var data: [TIMESTAMP32_DATA_LEN]u8 = undefined;
                writeU32Fast(&data, @intCast(timestamp.seconds));
                const ext = EXT{ .type = TIMESTAMP_EXT_TYPE, .data = &data };
                try self.writeExt(ext);
                return;
            }

            // timestamp 64 format: seconds fit in 34-bit and nanoseconds <= 999999999
            if (timestamp.seconds >= 0 and (timestamp.seconds >> TIMESTAMP64_SECONDS_BITS) == 0 and timestamp.nanoseconds <= MAX_NANOSECONDS) {
                const data64: u64 = (@as(u64, timestamp.nanoseconds) << TIMESTAMP64_SECONDS_BITS) | @as(u64, @intCast(timestamp.seconds));
                var data: [TIMESTAMP64_DATA_LEN]u8 = undefined;
                writeU64Fast(&data, data64);
                const ext = EXT{ .type = TIMESTAMP_EXT_TYPE, .data = &data };
                try self.writeExt(ext);
                return;
            }

            // timestamp 96 format: full range with signed 64-bit seconds and 32-bit nanoseconds
            if (timestamp.nanoseconds <= MAX_NANOSECONDS) {
                var data: [TIMESTAMP96_DATA_LEN]u8 = undefined;
                writeU32Fast(data[0..4], timestamp.nanoseconds);
                // For i64, use standard path (could add writeI64Fast if needed)
                std.mem.writeInt(i64, data[4..12], timestamp.seconds, big_endian);
                const ext = EXT{ .type = TIMESTAMP_EXT_TYPE, .data = &data };
                try self.writeExt(ext);
                return;
            }

            return MsgPackError.InvalidType;
        }

        /// write payload
        pub fn write(self: Self, payload: Payload) !void {
            switch (payload) {
                .nil => {
                    try self.writeNil();
                },
                .bool => |val| {
                    try self.writeBool(val);
                },
                .int => |val| {
                    try self.writeInt(val);
                },
                .uint => |val| {
                    try self.writeUint(val);
                },
                .float => |val| {
                    try self.writeFloat(val);
                },
                .str => |val| {
                    try self.writeStr(val);
                },
                .bin => |val| {
                    try self.writeBin(val);
                },
                .arr => |arr| {
                    const len = arr.len;
                    if (len <= MAX_FIXARRAY_LEN) {
                        const header: u8 = @intFromEnum(Markers.FIXARRAY) + @as(u8, @intCast(len));
                        try self.writeU8Value(header);
                    } else if (len <= MAX_UINT16) {
                        try self.writeTypeMarker(.ARRAY16);
                        try self.writeU16Value(@as(u16, @intCast(len)));
                    } else if (len <= MAX_UINT32) {
                        try self.writeTypeMarker(.ARRAY32);
                        try self.writeU32Value(@as(u32, @intCast(len)));
                    } else {
                        return MsgPackError.ArrayLengthTooLong;
                    }
                    for (arr) |val| {
                        try self.write(val);
                    }
                },
                .map => |map| {
                    const len = map.count();
                    if (len <= MAX_FIXMAP_LEN) {
                        const header: u8 = @intFromEnum(Markers.FIXMAP) + @as(u8, @intCast(len));
                        try self.writeU8Value(header);
                    } else if (len <= MAX_UINT16) {
                        try self.writeTypeMarker(.MAP16);
                        try self.writeU16Value(@intCast(len));
                    } else if (len <= MAX_UINT32) {
                        try self.writeTypeMarker(.MAP32);
                        try self.writeU32Value(@intCast(len));
                    } else {
                        return MsgPackError.MapLengthTooLong;
                    }
                    // Write key-value pairs, key can be any Payload type
                    var itera = map.iterator();
                    while (itera.next()) |entry| {
                        try self.write(entry.key_ptr.*);
                        try self.write(entry.value_ptr.*);
                    }
                },
                .ext => |ext| {
                    try self.writeExt(ext);
                },
                .timestamp => |timestamp| {
                    try self.writeTimestamp(timestamp);
                },
            }
        }

        fn readFrom(self: Self, bytes: []u8) !usize {
            return readFn(self.read_context, bytes);
        }

        inline fn readByte(self: Self) !u8 {
            var res = [1]u8{0};
            const len = try self.readFrom(&res);

            if (len != 1) {
                return MsgPackError.LengthReading;
            }

            return res[0];
        }

        inline fn readData(self: Self, allocator: Allocator, len: usize) ![]u8 {
            const data = try allocator.alloc(u8, len);
            errdefer allocator.free(data);
            const data_len = try self.readFrom(data);

            if (data_len != len) {
                return MsgPackError.LengthReading;
            }

            return data;
        }

        /// Generic integer read helper
        inline fn readIntRaw(self: Self, comptime T: type) !T {
            // Use optimized SIMD byte swap for common integer types
            if (T == u32) {
                var buffer: [4]u8 = undefined;
                const len = try self.readFrom(&buffer);
                if (len != 4) {
                    return MsgPackError.LengthReading;
                }
                return readU32Fast(&buffer);
            } else if (T == u64) {
                var buffer: [8]u8 = undefined;
                const len = try self.readFrom(&buffer);
                if (len != 8) {
                    return MsgPackError.LengthReading;
                }
                return readU64Fast(&buffer);
            } else {
                // Standard path for other types
                var buffer: [@sizeOf(T)]u8 = undefined;
                const len = try self.readFrom(&buffer);
                if (len != @sizeOf(T)) {
                    return MsgPackError.LengthReading;
                }
                return std.mem.readInt(T, &buffer, big_endian);
            }
        }

        /// Generic integer value read
        inline fn readTypedInt(self: Self, comptime T: type) !T {
            if (T == u8) {
                return self.readByte();
            } else if (T == i8) {
                const val = try self.readByte();
                return @bitCast(val);
            } else {
                return self.readIntRaw(T);
            }
        }

        fn readTypeMarkerU8(self: Self) !u8 {
            const val = try self.readByte();
            return val;
        }

        /// Precomputed lookup table for marker byte to Markers enum conversion
        /// This eliminates branch misprediction overhead from switch statements
        const MARKER_LOOKUP_TABLE: [256]Markers = blk: {
            var table: [256]Markers = undefined;
            var i: usize = 0;
            while (i < 256) : (i += 1) {
                const byte: u8 = @intCast(i);
                table[i] = switch (byte) {
                    0x00...0x7f => .POSITIVE_FIXINT,
                    0x80...0x8f => .FIXMAP,
                    0x90...0x9f => .FIXARRAY,
                    0xa0...0xbf => .FIXSTR,
                    0xc0 => .NIL,
                    0xc1 => .NIL, // Reserved byte, treat as NIL
                    0xc2 => .FALSE,
                    0xc3 => .TRUE,
                    0xc4 => .BIN8,
                    0xc5 => .BIN16,
                    0xc6 => .BIN32,
                    0xc7 => .EXT8,
                    0xc8 => .EXT16,
                    0xc9 => .EXT32,
                    0xca => .FLOAT32,
                    0xcb => .FLOAT64,
                    0xcc => .UINT8,
                    0xcd => .UINT16,
                    0xce => .UINT32,
                    0xcf => .UINT64,
                    0xd0 => .INT8,
                    0xd1 => .INT16,
                    0xd2 => .INT32,
                    0xd3 => .INT64,
                    0xd4 => .FIXEXT1,
                    0xd5 => .FIXEXT2,
                    0xd6 => .FIXEXT4,
                    0xd7 => .FIXEXT8,
                    0xd8 => .FIXEXT16,
                    0xd9 => .STR8,
                    0xda => .STR16,
                    0xdb => .STR32,
                    0xdc => .ARRAY16,
                    0xdd => .ARRAY32,
                    0xde => .MAP16,
                    0xdf => .MAP32,
                    0xe0...0xff => .NEGATIVE_FIXINT,
                };
            }
            break :blk table;
        };

        /// Fast marker type lookup using precomputed table (O(1) with no branches)
        inline fn markerU8To(_: Self, marker_u8: u8) Markers {
            return MARKER_LOOKUP_TABLE[marker_u8];
        }

        fn readTypeMarker(self: Self) !Markers {
            const val = try self.readTypeMarkerU8();
            return self.markerU8To(val);
        }

        inline fn readBoolValue(_: Self, marker: Markers) !bool {
            switch (marker) {
                .TRUE => return true,
                .FALSE => return false,
                else => return MsgPackError.TypeMarkerReading,
            }
        }

        fn readBool(self: Self) !bool {
            const marker = try self.readTypeMarker();
            return self.readBoolValue(marker);
        }

        inline fn readFixintValue(_: Self, marker_u8: u8) i8 {
            return @bitCast(marker_u8);
        }

        inline fn readI8Value(self: Self) !i8 {
            return self.readTypedInt(i8);
        }

        inline fn readV8Value(self: Self) !u8 {
            return self.readTypedInt(u8);
        }

        inline fn readI16Value(self: Self) !i16 {
            return self.readTypedInt(i16);
        }

        inline fn readU16Value(self: Self) !u16 {
            return self.readTypedInt(u16);
        }

        inline fn readI32Value(self: Self) !i32 {
            return self.readTypedInt(i32);
        }

        inline fn readU32Value(self: Self) !u32 {
            return self.readTypedInt(u32);
        }

        inline fn readI64Value(self: Self) !i64 {
            return self.readTypedInt(i64);
        }

        inline fn readU64Value(self: Self) !u64 {
            return self.readTypedInt(u64);
        }

        fn readIntValue(self: Self, marker_u8: u8) !i64 {
            const marker = self.markerU8To(marker_u8);
            // Optimized branch order: handle most common cases first
            // fixint and 8-bit integers are most common in typical data
            switch (marker) {
                .NEGATIVE_FIXINT, .POSITIVE_FIXINT => {
                    const val = self.readFixintValue(marker_u8);
                    return val;
                },
                .INT8 => {
                    const val = try self.readI8Value();
                    return val;
                },
                .UINT8 => {
                    const val = try self.readV8Value();
                    return val;
                },
                .INT16 => {
                    const val = try self.readI16Value();
                    return val;
                },
                .UINT16 => {
                    const val = try self.readU16Value();
                    return val;
                },
                .INT32 => {
                    const val = try self.readI32Value();
                    return val;
                },
                .UINT32 => {
                    const val = try self.readU32Value();
                    return val;
                },
                .INT64 => {
                    return self.readI64Value();
                },
                .UINT64 => {
                    const val = try self.readU64Value();
                    if (val <= std.math.maxInt(i64)) {
                        return @intCast(val);
                    }
                    return MsgPackError.InvalidType;
                },
                else => return MsgPackError.TypeMarkerReading,
            }
        }

        fn readUintValue(self: Self, marker_u8: u8) !u64 {
            const marker = self.markerU8To(marker_u8);
            // Optimized branch order: handle most common cases first
            // fixint and 8-bit integers are most common in typical data
            switch (marker) {
                .POSITIVE_FIXINT => {
                    return marker_u8;
                },
                .UINT8 => {
                    const val = try self.readV8Value();
                    return val;
                },
                .INT8 => {
                    const val = try self.readI8Value();
                    if (val >= 0) {
                        return @intCast(val);
                    }
                    return MsgPackError.InvalidType;
                },
                .UINT16 => {
                    const val = try self.readU16Value();
                    return val;
                },
                .INT16 => {
                    const val = try self.readI16Value();
                    if (val >= 0) {
                        return @intCast(val);
                    }
                    return MsgPackError.InvalidType;
                },
                .UINT32 => {
                    const val = try self.readU32Value();
                    return val;
                },
                .INT32 => {
                    const val = try self.readI32Value();
                    if (val >= 0) {
                        return @intCast(val);
                    }
                    return MsgPackError.InvalidType;
                },
                .UINT64 => {
                    return self.readU64Value();
                },
                .INT64 => {
                    const val = try self.readI64Value();
                    if (val >= 0) {
                        return @intCast(val);
                    }
                    return MsgPackError.InvalidType;
                },
                else => return MsgPackError.TypeMarkerReading,
            }
        }

        inline fn readF32Value(self: Self) !f32 {
            // Use optimized read for u32
            var buffer: [4]u8 = undefined;
            const len = try self.readFrom(&buffer);
            if (len != 4) {
                return MsgPackError.LengthReading;
            }
            const val_int = readU32Fast(&buffer);
            const val: f32 = @bitCast(val_int);
            return val;
        }

        inline fn readF64Value(self: Self) !f64 {
            // Use optimized read for u64
            var buffer: [8]u8 = undefined;
            const len = try self.readFrom(&buffer);
            if (len != 8) {
                return MsgPackError.LengthReading;
            }
            const val_int = readU64Fast(&buffer);
            const val: f64 = @bitCast(val_int);
            return val;
        }

        fn readFloatValue(self: Self, marker: Markers) !f64 {
            switch (marker) {
                .FLOAT32 => {
                    const val = try self.readF32Value();
                    return val;
                },
                .FLOAT64 => {
                    return self.readF64Value();
                },
                else => return MsgPackError.TypeMarkerReading,
            }
        }

        fn readFixStrValue(self: Self, allocator: Allocator, marker_u8: u8) ![]const u8 {
            const len: u8 = marker_u8 - @intFromEnum(Markers.FIXSTR);
            const str = try self.readData(allocator, len);

            return str;
        }

        /// Generic string reader for different size formats
        /// Reduces code duplication for STR8/16/32
        inline fn readStrValueGeneric(self: Self, comptime LenType: type, allocator: Allocator) ![]const u8 {
            const len = try self.readTypedInt(LenType);
            return try self.readData(allocator, len);
        }

        fn readStr8Value(self: Self, allocator: Allocator) ![]const u8 {
            return try self.readStrValueGeneric(u8, allocator);
        }

        fn readStr16Value(self: Self, allocator: Allocator) ![]const u8 {
            return try self.readStrValueGeneric(u16, allocator);
        }

        fn readStr32Value(self: Self, allocator: Allocator) ![]const u8 {
            return try self.readStrValueGeneric(u32, allocator);
        }

        fn readStrValue(self: Self, marker_u8: u8, allocator: Allocator) ![]const u8 {
            const marker = self.markerU8To(marker_u8);

            switch (marker) {
                .FIXSTR => {
                    return self.readFixStrValue(allocator, marker_u8);
                },
                .STR8 => {
                    return self.readStr8Value(allocator);
                },
                .STR16 => {
                    return self.readStr16Value(allocator);
                },
                .STR32 => {
                    return self.readStr32Value(allocator);
                },
                else => return MsgPackError.TypeMarkerReading,
            }
        }

        inline fn validateBinLength(len: usize) !void {
            // Inline validation for hot path
            if (len > parse_limits.max_bin_length) {
                return MsgPackError.BinDataLengthTooLong;
            }
        }

        /// Generic binary data reader for different size formats
        /// Reduces code duplication for BIN8/16/32
        inline fn readBinValueGeneric(self: Self, comptime LenType: type, allocator: Allocator) ![]u8 {
            const len = try self.readTypedInt(LenType);
            try validateBinLength(len);
            return try self.readData(allocator, len);
        }

        fn readBin8Value(self: Self, allocator: Allocator) ![]u8 {
            return try self.readBinValueGeneric(u8, allocator);
        }

        fn readBin16Value(self: Self, allocator: Allocator) ![]u8 {
            return try self.readBinValueGeneric(u16, allocator);
        }

        fn readBin32Value(self: Self, allocator: Allocator) ![]u8 {
            return try self.readBinValueGeneric(u32, allocator);
        }

        fn readBinValue(self: Self, marker: Markers, allocator: Allocator) ![]u8 {
            switch (marker) {
                .BIN8 => {
                    return self.readBin8Value(allocator);
                },
                .BIN16 => {
                    return self.readBin16Value(allocator);
                },
                .BIN32 => {
                    return self.readBin32Value(allocator);
                },
                else => return MsgPackError.TypeMarkerReading,
            }
        }

        inline fn validateExtLength(len: usize) !void {
            // Inline validation for hot path
            if (len > parse_limits.max_ext_length) {
                return MsgPackError.ExtDataTooLarge;
            }
        }

        inline fn readExtData(self: Self, allocator: Allocator, len: usize) !EXT {
            try validateExtLength(len);
            const ext_type = try self.readI8Value();
            const data = try self.readData(allocator, len);
            return EXT{
                .type = ext_type,
                .data = data,
            };
        }

        /// Check if a marker can potentially be a timestamp
        inline fn isTimestampCandidate(marker: Markers) bool {
            return marker == .FIXEXT4 or marker == .FIXEXT8 or marker == .EXT8;
        }

        /// Read timestamp 32-bit format (seconds only, 0 nanoseconds)
        inline fn readTimestamp32(self: Self) !Timestamp {
            const seconds = try self.readU32Value();
            return Timestamp.new(@intCast(seconds), 0);
        }

        /// Read timestamp 64-bit format (34-bit seconds + 30-bit nanoseconds)
        inline fn readTimestamp64(self: Self) !Timestamp {
            const data64 = try self.readU64Value();
            const nanoseconds: u32 = @intCast(data64 >> TIMESTAMP64_SECONDS_BITS);
            const seconds: i64 = @intCast(data64 & TIMESTAMP64_SECONDS_MASK);
            return Timestamp.new(seconds, nanoseconds);
        }

        /// Read timestamp 96-bit format (32-bit nanoseconds + 64-bit seconds)
        inline fn readTimestamp96(self: Self) !Timestamp {
            const nanoseconds = try self.readU32Value();
            const seconds = try self.readI64Value();
            return Timestamp.new(seconds, nanoseconds);
        }

        /// Read non-timestamp EXT data
        inline fn readRegularExt(self: Self, ext_type: i8, len: usize, allocator: Allocator) !Payload {
            try validateExtLength(len);
            const ext_data = try allocator.alloc(u8, len);
            errdefer allocator.free(ext_data);
            _ = try self.readFrom(ext_data);
            return Payload{ .ext = EXT{ .type = ext_type, .data = ext_data } };
        }

        /// Get EXT data length from marker
        inline fn getExtLength(marker: Markers) usize {
            return switch (marker) {
                .FIXEXT1 => FIXEXT1_LEN,
                .FIXEXT2 => FIXEXT2_LEN,
                .FIXEXT4 => FIXEXT4_LEN,
                .FIXEXT8 => FIXEXT8_LEN,
                .FIXEXT16 => FIXEXT16_LEN,
                else => unreachable,
            };
        }

        /// Read and validate EXT8 length for timestamp detection
        fn readExt8Length(self: Self) !struct { len: usize, is_timestamp_candidate: bool } {
            const len = try self.readV8Value();
            // Only timestamp 96 format uses 12 bytes in EXT8
            if (len != TIMESTAMP96_DATA_LEN) {
                return .{ .len = len, .is_timestamp_candidate = false };
            }
            return .{ .len = len, .is_timestamp_candidate = true };
        }

        /// Read timestamp payload based on marker
        inline fn readTimestampPayload(self: Self, marker: Markers) !Payload {
            const required_len: usize = switch (marker) {
                .FIXEXT4 => FIXEXT4_LEN,
                .FIXEXT8 => FIXEXT8_LEN,
                .EXT8 => TIMESTAMP96_DATA_LEN,
                else => unreachable,
            };
            try validateExtLength(required_len);
            const timestamp: Timestamp = switch (marker) {
                .FIXEXT4 => try self.readTimestamp32(),
                .FIXEXT8 => try self.readTimestamp64(),
                .EXT8 => try self.readTimestamp96(),
                else => unreachable,
            };
            return Payload{ .timestamp = timestamp };
        }

        /// read ext value or timestamp if it's timestamp type (-1)
        fn readExtValueOrTimestamp(self: Self, marker: Markers, allocator: Allocator) !Payload {
            // Fast path: not a timestamp candidate
            if (!isTimestampCandidate(marker)) {
                const val = try self.readExtValue(marker, allocator);
                return Payload{ .ext = val };
            }

            // Handle EXT8 special case (need to read length first)
            if (marker == .EXT8) {
                const len_info = try self.readExt8Length();

                // If not timestamp length, read as regular EXT
                if (!len_info.is_timestamp_candidate) {
                    const ext_type = try self.readI8Value();
                    return try self.readRegularExt(ext_type, len_info.len, allocator);
                }
            }

            // Read extension type to determine if it's a timestamp
            const ext_type = try self.readI8Value();

            // Timestamp type: read timestamp data
            if (ext_type == TIMESTAMP_EXT_TYPE) {
                return try self.readTimestampPayload(marker);
            }

            // Regular EXT: read remaining data
            const actual_len = if (marker == .EXT8) TIMESTAMP96_DATA_LEN else getExtLength(marker);
            return try self.readRegularExt(ext_type, actual_len, allocator);
        }

        fn readExtValue(self: Self, marker: Markers, allocator: Allocator) !EXT {
            switch (marker) {
                .FIXEXT1 => {
                    return self.readExtData(allocator, FIXEXT1_LEN);
                },
                .FIXEXT2 => {
                    return self.readExtData(allocator, FIXEXT2_LEN);
                },
                .FIXEXT4 => {
                    return self.readExtData(allocator, FIXEXT4_LEN);
                },
                .FIXEXT8 => {
                    return self.readExtData(allocator, FIXEXT8_LEN);
                },
                .FIXEXT16 => {
                    return self.readExtData(allocator, FIXEXT16_LEN);
                },
                .EXT8 => {
                    const len = try self.readV8Value();
                    return self.readExtData(allocator, len);
                },
                .EXT16 => {
                    const len = try self.readU16Value();
                    return self.readExtData(allocator, len);
                },
                .EXT32 => {
                    const len = try self.readU32Value();
                    return self.readExtData(allocator, len);
                },
                else => {
                    return MsgPackError.InvalidType;
                },
            }
        }

        // ========== Iterative Parser State Machine ==========

        /// Parse state for iterative parsing
        const ParseState = struct {
            container_type: enum {
                array, // Parsing array elements
                map_key, // Expecting map key (must be string)
                map_value, // Expecting map value
            },
            data: union(enum) {
                array: ArrayState,
                map: MapState,
            },
        };

        const ArrayState = struct {
            items: []Payload,
            current_index: usize,
            total_length: usize,
        };

        const MapState = struct {
            map: Map,
            current_key: ?Payload,
            remaining_pairs: usize,
        };

        /// Clean up parse stack on error
        fn cleanupParseStack(stack: *std.ArrayList(ParseState), allocator: Allocator) void {
            // Pop and free all states from the stack
            while (stack.items.len > 0) {
                const state = stack.pop() orelse break;
                switch (state.data) {
                    .array => |arr_state| {
                        // Free already parsed elements
                        for (arr_state.items[0..arr_state.current_index]) |item| {
                            item.free(allocator);
                        }
                        // Free the array itself
                        allocator.free(arr_state.items);
                    },
                    .map => |map_state| {
                        // Free current_key if it exists (orphaned key waiting for value)
                        if (map_state.current_key) |key| {
                            key.free(allocator);
                        }
                        // Free the map and its contents
                        var map_copy = map_state.map;
                        defer map_copy.deinit();
                        var it = map_copy.map.iterator();
                        while (it.next()) |entry| {
                            // Need to cast away const since we own the keys and need to free them
                            const key_ptr_mut: *Payload = @constCast(entry.key_ptr);
                            key_ptr_mut.free(allocator);
                            entry.value_ptr.free(allocator);
                        }
                    },
                }
            }
        }

        /// Generic container length reader
        /// Reduces code duplication for array and map length reading
        inline fn readContainerLength(
            self: Self,
            marker: Markers,
            marker_u8: u8,
            comptime fix_marker: Markers,
            comptime marker_16: Markers,
            comptime marker_32: Markers,
            comptime base: u8,
        ) !usize {
            return switch (marker) {
                fix_marker => marker_u8 - base,
                marker_16 => try self.readU16Value(),
                marker_32 => try self.readU32Value(),
                else => MsgPackError.InvalidType,
            };
        }

        /// Read array length based on marker
        inline fn readArrayLength(self: Self, marker: Markers, marker_u8: u8) !usize {
            return self.readContainerLength(marker, marker_u8, .FIXARRAY, .ARRAY16, .ARRAY32, FIXARRAY_BASE);
        }

        /// Read map length based on marker
        inline fn readMapLength(self: Self, marker: Markers, marker_u8: u8) !usize {
            return self.readContainerLength(marker, marker_u8, .FIXMAP, .MAP16, .MAP32, FIXMAP_BASE);
        }

        /// Helper to append to parse stack (handles Zig version differences)
        inline fn appendToStack(stack: *std.ArrayList(ParseState), allocator: Allocator, item: ParseState) !void {
            if (current_zig.minor == 14) {
                try stack.append(item);
            } else {
                try stack.append(allocator, item);
            }
        }

        // ========== End of State Machine Helpers ==========

        /// Fast path for simple types that don't require heap allocation or complex state management
        inline fn readSimpleTypeFast(self: Self, marker: Markers, marker_u8: u8) !?Payload {
            return switch (marker) {
                .NIL => Payload{ .nil = void{} },
                .TRUE => Payload{ .bool = true },
                .FALSE => Payload{ .bool = false },

                .POSITIVE_FIXINT => Payload{ .uint = marker_u8 },
                .NEGATIVE_FIXINT => Payload{ .int = @as(i8, @bitCast(marker_u8)) },

                .UINT8 => Payload{ .uint = try self.readV8Value() },
                .UINT16 => Payload{ .uint = try self.readU16Value() },
                .UINT32 => Payload{ .uint = try self.readU32Value() },
                .UINT64 => Payload{ .uint = try self.readU64Value() },

                .INT8 => Payload{ .int = try self.readI8Value() },
                .INT16 => Payload{ .int = try self.readI16Value() },
                .INT32 => Payload{ .int = try self.readI32Value() },
                .INT64 => Payload{ .int = try self.readI64Value() },

                .FLOAT32 => Payload{ .float = try self.readF32Value() },
                .FLOAT64 => Payload{ .float = try self.readF64Value() },

                // Note: FIXEXT4/FIXEXT8 could be timestamps, but we need to read ext_type first
                // Since we can't "unread" in the stream, we handle all EXT types in the complex path
                // to avoid consuming bytes that need to be re-processed.

                else => null, // Not a simple type, needs complex handling
            };
        }

        /// read a payload, please use payload.free to free the memory
        /// This is an iterative implementation that avoids stack overflow from deep nesting
        pub fn read(self: Self, allocator: Allocator) !Payload {
            // Fast path optimization: handle simple types without state machine overhead
            const first_marker_u8 = try self.readTypeMarkerU8();
            const first_marker = self.markerU8To(first_marker_u8);

            // Try fast path for simple types (no containers, no allocation needed)
            if (try self.readSimpleTypeFast(first_marker, first_marker_u8)) |simple_payload| {
                return simple_payload;
            }

            // Complex types: use full iterative parser
            return self.readComplex(allocator, first_marker, first_marker_u8);
        }

        /// Internal iterative parser for complex types (arrays, maps, strings, etc.)
        fn readComplex(self: Self, allocator: Allocator, first_marker: Markers, first_marker_u8: u8) !Payload {
            // Explicit stack for iterative parsing (on heap)
            var parse_stack = if (current_zig.minor == 14)
                std.ArrayList(ParseState).init(allocator)
            else
                std.ArrayList(ParseState).empty;
            defer if (current_zig.minor == 14) parse_stack.deinit() else parse_stack.deinit(allocator);
            errdefer cleanupParseStack(&parse_stack, allocator);

            // Root payload to return
            var root: ?Payload = null;

            // Start with the already-read first marker
            var marker_u8 = first_marker_u8;
            var marker = first_marker;

            // Main loop (replaces recursion)
            // Process first marker directly, then read subsequent markers in loop
            var is_first = true;
            while (true) {
                // Check depth limit
                if (parse_stack.items.len >= parse_limits.max_depth) {
                    return MsgPackError.MaxDepthExceeded;
                }

                // Read next type marker (skip on first iteration)
                if (!is_first) {
                    marker_u8 = try self.readTypeMarkerU8();
                    marker = self.markerU8To(marker_u8);
                }
                is_first = false;

                // Current payload being constructed
                var current_payload: Payload = undefined;
                var needs_parent_fill = true;

                switch (marker) {
                    // Simple types: construct directly
                    .NIL => {
                        current_payload = Payload{ .nil = void{} };
                    },
                    .TRUE, .FALSE => {
                        const val = try self.readBoolValue(marker);
                        current_payload = Payload{ .bool = val };
                    },
                    .POSITIVE_FIXINT, .UINT8, .UINT16, .UINT32, .UINT64 => {
                        const val = try self.readUintValue(marker_u8);
                        current_payload = Payload{ .uint = val };
                    },
                    .NEGATIVE_FIXINT, .INT8, .INT16, .INT32, .INT64 => {
                        const val = try self.readIntValue(marker_u8);
                        current_payload = Payload{ .int = val };
                    },
                    .FLOAT32, .FLOAT64 => {
                        const val = try self.readFloatValue(marker);
                        current_payload = Payload{ .float = val };
                    },
                    .FIXSTR, .STR8, .STR16, .STR32 => {
                        const val = try self.readStrValue(marker_u8, allocator);

                        // Validate string length
                        if (val.len > parse_limits.max_string_length) {
                            allocator.free(val);
                            return MsgPackError.StringTooLong;
                        }

                        current_payload = Payload{ .str = Str.init(val) };
                    },
                    .BIN8, .BIN16, .BIN32 => {
                        const val = try self.readBinValue(marker, allocator);

                        // Validate binary length
                        if (val.len > parse_limits.max_bin_length) {
                            allocator.free(val);
                            return MsgPackError.BinDataLengthTooLong;
                        }

                        current_payload = Payload{ .bin = Bin.init(val) };
                    },

                    // Container types: push to stack and continue
                    .FIXARRAY, .ARRAY16, .ARRAY32 => {
                        const len = try self.readArrayLength(marker, marker_u8);

                        // Validate array length
                        if (len > parse_limits.max_array_length) {
                            return MsgPackError.ArrayTooLarge;
                        }

                        // Special case: empty array
                        if (len == 0) {
                            const arr = try allocator.alloc(Payload, 0);
                            current_payload = Payload{ .arr = arr };
                        } else {
                            // Allocate array
                            const arr = try allocator.alloc(Payload, len);
                            errdefer allocator.free(arr);

                            // Push to stack
                            try appendToStack(&parse_stack, allocator, .{
                                .container_type = .array,
                                .data = .{ .array = .{
                                    .items = arr,
                                    .current_index = 0,
                                    .total_length = len,
                                } },
                            });

                            needs_parent_fill = false;
                            continue; // Continue to read first element
                        }
                    },

                    .FIXMAP, .MAP16, .MAP32 => {
                        const len = try self.readMapLength(marker, marker_u8);

                        // Validate map size
                        if (len > parse_limits.max_map_size) {
                            return MsgPackError.MapTooLarge;
                        }

                        // Special case: empty map
                        if (len == 0) {
                            current_payload = Payload{ .map = Map.init(allocator) };
                        } else {
                            // Initialize map
                            var map = Map.init(allocator);
                            var map_owned = false;
                            errdefer if (!map_owned) map.deinit();

                            const capacity = std.math.cast(u32, len) orelse {
                                return MsgPackError.MapTooLarge;
                            };
                            try map.ensureTotalCapacity(capacity);

                            // Push to stack
                            try appendToStack(&parse_stack, allocator, .{
                                .container_type = .map_key,
                                .data = .{ .map = .{
                                    .map = map,
                                    .current_key = null,
                                    .remaining_pairs = len,
                                } },
                            });
                            map_owned = true;

                            needs_parent_fill = false;
                            continue; // Continue to read first key
                        }
                    },

                    // Extension types
                    .FIXEXT1, .FIXEXT2, .FIXEXT4, .FIXEXT8, .FIXEXT16, .EXT8, .EXT16, .EXT32 => {
                        const ext_result = try self.readExtValueOrTimestamp(marker, allocator);
                        current_payload = ext_result;
                    },
                }

                // Fill parent container or set root
                if (needs_parent_fill) {
                    // Add errdefer to clean up current_payload if parent fill fails
                    errdefer current_payload.free(allocator);

                    if (parse_stack.items.len == 0) {
                        // No parent, this is the root
                        root = current_payload;
                        break;
                    }

                    // Fill parent and check if complete
                    while (true) {
                        const parent = &parse_stack.items[parse_stack.items.len - 1];
                        const finished = try fillParentContainer(parent, current_payload);

                        if (!finished) {
                            // Parent needs more elements
                            break;
                        }

                        // Parent container is complete, pop it
                        const completed_state = parse_stack.pop() orelse return MsgPackError.Internal;
                        const completed_payload = containerToPayload(completed_state);

                        if (parse_stack.items.len == 0) {
                            // This was the root container
                            root = completed_payload;
                            break;
                        }

                        // Continue with completed container as new current
                        current_payload = completed_payload;
                    }

                    if (root != null) break;
                }
            }

            return root orelse MsgPackError.Internal;
        }

        /// Fill parent container with child element
        /// Returns true if parent container is complete
        /// This is a hot path function, optimized for common cases
        inline fn fillParentContainer(
            parent: *ParseState,
            child: Payload,
        ) !bool {
            switch (parent.container_type) {
                .array => {
                    // Fast path: array insertion is just pointer assignment
                    var arr_state = &parent.data.array;
                    arr_state.items[arr_state.current_index] = child;
                    arr_state.current_index += 1;
                    return arr_state.current_index >= arr_state.total_length;
                },

                .map_key => {
                    // Key can be any Payload type (not just string)
                    parent.data.map.current_key = child;
                    parent.container_type = .map_value;
                    return false; // Still need to read value
                },

                .map_value => {
                    var map_state = &parent.data.map;
                    const key = map_state.current_key orelse return MsgPackError.Internal;
                    // Use putInternal to avoid cloning already-allocated deserialized keys
                    try map_state.map.putInternal(key, child);
                    map_state.current_key = null;
                    map_state.remaining_pairs -= 1;

                    if (map_state.remaining_pairs == 0) {
                        return true; // Map complete
                    }

                    parent.container_type = .map_key;
                    return false; // Continue reading next key
                },
            }
        }

        /// Convert completed ParseState to Payload
        inline fn containerToPayload(state: ParseState) Payload {
            return switch (state.data) {
                .array => |arr_state| Payload{ .arr = arr_state.items },
                .map => |map_state| Payload{ .map = map_state.map },
            };
        }
    };
}

/// Create an instance of msgpack_pack with default limits (backward compatible)
pub fn Pack(
    comptime WriteContext: type,
    comptime ReadContext: type,
    comptime WriteError: type,
    comptime ReadError: type,
    comptime writeFn: fn (context: WriteContext, bytes: []const u8) WriteError!usize,
    comptime readFn: fn (context: ReadContext, arr: []u8) ReadError!usize,
) type {
    return PackWithLimits(
        WriteContext,
        ReadContext,
        WriteError,
        ReadError,
        writeFn,
        readFn,
        DEFAULT_LIMITS,
    );
}

// ============================================================================
// std.io.Reader and std.io.Writer Support (Zig 0.15+)
// ============================================================================

/// Check if we're using Zig 0.15 or later with the new I/O system
const has_new_io = current_zig.minor >= 15;

/// Wrapper context for std.io.Writer (Zig 0.15+)
const IoWriterContext = struct {
    writer: if (has_new_io) *std.Io.Writer else void,

    fn write(self: IoWriterContext, bytes: []const u8) !usize {
        if (!has_new_io) @compileError("std.Io.Writer requires Zig 0.15 or later");
        try self.writer.writeAll(bytes);
        return bytes.len;
    }
};

/// Wrapper context for std.io.Reader (Zig 0.15+)
const IoReaderContext = struct {
    reader: if (has_new_io) *std.Io.Reader else void,

    fn read(self: IoReaderContext, buf: []u8) !usize {
        if (!has_new_io) @compileError("std.Io.Reader requires Zig 0.15 or later");
        try self.reader.readSliceAll(buf);
        return buf.len;
    }
};

/// Type alias for the Pack type used with std.io.Reader/Writer
const IoPackType = if (has_new_io) Pack(
    IoWriterContext,
    IoReaderContext,
    std.Io.Writer.Error,
    std.Io.Reader.Error,
    IoWriterContext.write,
    IoReaderContext.read,
) else void;

/// Packer that works with std.io.Reader and std.io.Writer interfaces (Zig 0.15+)
///
/// This provides a convenient wrapper around the generic Pack type for working
/// with Zig's standard I/O interfaces.
///
/// Example:
/// ```zig
/// const std = @import("std");
/// const msgpack = @import("msgpack");
///
/// pub fn main() !void {
///     var gpa = std.heap.GeneralPurposeAllocator(.{}){};
///     defer _ = gpa.deinit();
///     const allocator = gpa.allocator();
///
///     // Create file for I/O
///     var file = try std.fs.cwd().createFile("data.msgpack", .{ .read = true });
///     defer file.close();
///
///     // Create reader and writer with buffers
///     var reader_buf: [4096]u8 = undefined;
///     var reader = file.reader(&reader_buf);
///     var writer_buf: [4096]u8 = undefined;
///     var writer = file.writer(&writer_buf);
///
///     // Create packer
///     var packer = try msgpack.PackerIO.init(&reader, &writer);
///
///     // Serialize
///     var payload = msgpack.Payload.mapPayload(allocator);
///     defer payload.free(allocator);
///     try payload.mapPut("name", try msgpack.Payload.strToPayload("Alice", allocator));
///     try packer.write(payload);
///
///     // Flush and reset for reading
///     try writer.flush();
///     try file.seekTo(0);
///     reader.seek = 0;
///     reader.end = 0;
///
///     // Deserialize
///     const decoded = try packer.read(allocator);
///     defer decoded.free(allocator);
/// }
/// ```
pub const PackerIO = if (has_new_io) struct {
    packer: IoPackType,
    write_ctx: IoWriterContext,
    read_ctx: IoReaderContext,

    /// Initialize a PackerIO with std.io.Reader and std.io.Writer
    ///
    /// The Reader and Writer must remain valid for the lifetime of this PackerIO.
    pub fn init(
        reader: *std.Io.Reader,
        writer: *std.Io.Writer,
    ) PackerIO {
        const write_ctx = IoWriterContext{ .writer = writer };
        const read_ctx = IoReaderContext{ .reader = reader };

        return .{
            .packer = IoPackType.init(write_ctx, read_ctx),
            .write_ctx = write_ctx,
            .read_ctx = read_ctx,
        };
    }

    /// Write a Payload to the writer
    ///
    /// The payload must be freed by the caller after writing.
    pub fn write(self: *PackerIO, payload: Payload) !void {
        return self.packer.write(payload);
    }

    /// Read a Payload from the reader
    ///
    /// The returned payload must be freed by the caller using `payload.free(allocator)`.
    /// Note: The read method uses an iterative parser that is safe for deeply nested data.
    pub fn read(self: *PackerIO, allocator: Allocator) !Payload {
        return self.packer.read(allocator);
    }
} else struct {
    pub fn init(_: anytype, _: anytype) @This() {
        @compileError("PackerIO requires Zig 0.15 or later");
    }
};

/// Convenience function to create a PackerIO from std.io.Reader and std.io.Writer
///
/// This is a shorthand for `PackerIO.init(reader, writer)`.
///
/// Example:
/// ```zig
/// var reader_buf: [4096]u8 = undefined;
/// var reader = file.reader(&reader_buf);
/// var writer_buf: [4096]u8 = undefined;
/// var writer = file.writer(&writer_buf);
/// var packer = msgpack.packIO(&reader, &writer);
/// ```
pub fn packIO(
    reader: if (has_new_io) *std.Io.Reader else void,
    writer: if (has_new_io) *std.Io.Writer else void,
) if (has_new_io) PackerIO else void {
    if (!has_new_io) @compileError("packIO requires Zig 0.15 or later");
    return PackerIO.init(reader, writer);
}

// Export compatibility layer for cross-version support
pub const compat = @import("compat.zig");
