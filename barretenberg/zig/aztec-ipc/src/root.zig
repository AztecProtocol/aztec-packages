//! Aztec IPC Service Clients (Zig)
//!
//! Generated Zig clients for Aztec IPC services (wsdb, cdb, avm).
//! Each service module contains types, serialization, and a typed client.
//!
//! ## Usage
//!
//! ```zig
//! const ipc = @import("aztec-ipc");
//! var client = try ipc.wsdb.WsdbClient.connect("/tmp/wsdb.sock");
//! defer client.close();
//! ```

pub const ipc_framing = @import("ipc_framing.zig");

// Per-service generated modules (populated by codegen)
pub const wsdb = @import("wsdb/generated_types.zig");
pub const cdb = @import("cdb/generated_types.zig");
pub const avm = @import("avm/generated_types.zig");

test {
    _ = ipc_framing;
}
