//! Spike 2: native outbound-client oracle resolution. Proves "a service is a client of another
//! service" — acvm-sim, mid-execution, resolves a Brillig foreign call by making a *blocking*
//! outbound ipc-runtime call to a separate Oracle Resolver service over a second UDS connection.
//!
//! The reverse-channel payload is opaque bytes (rmp `ForeignCallWaitInfo` -> rmp `ForeignCallResult`),
//! identical to what the wasm `host_call` import carries (Spike 3) — so both backends share one ABI.

use std::thread;
use std::time::Duration;

use acir::brillig::ForeignCallResult;
use acir::{AcirField, FieldElement};
use acvm::pwg::ForeignCallWaitInfo;
use acvm_sim::{execute_acir, oracle_invert_program};
use ipc_runtime::{IpcClient, IpcServer};

fn be32(n: u8) -> [u8; 32] {
    let mut b = [0u8; 32];
    b[31] = n;
    b
}

/// The Oracle Resolver service: an ipc-runtime server whose sole oracle, `invert`, returns the field
/// inverse of its single input. Stands in for a real resolver (e.g. a TXE) in the spike.
fn spawn_invert_resolver(sock: String) {
    thread::spawn(move || {
        let mut server = IpcServer::from_path(&sock).expect("resolver server");
        server.listen().expect("resolver listen");
        server.run(|_client_id, req| {
            let wait: ForeignCallWaitInfo<FieldElement> =
                rmp_serde::from_slice(req).expect("decode wait info");
            assert_eq!(wait.function, "invert");
            let input = wait.inputs[0].unwrap_field();
            let result = ForeignCallResult::from(input.inverse());
            rmp_serde::to_vec_named(&result).expect("encode result")
        });
    });
}

#[test]
fn native_resolves_oracle_over_second_ipc_connection() {
    let sock = format!("/tmp/acvm-sim-oracle-{}.sock", std::process::id());
    let _ = std::fs::remove_file(&sock);
    spawn_invert_resolver(sock.clone());

    // Connect the outbound client (retry until the resolver thread is listening).
    let mut client = (0..100)
        .find_map(|_| match IpcClient::from_path(&sock) {
            Ok(c) => Some(c),
            Err(_) => {
                thread::sleep(Duration::from_millis(50));
                None
            }
        })
        .expect("connect to resolver");

    // The backend-agnostic resolver closure: serialize the pending foreign call, make the blocking
    // outbound IPC call, deserialize the result. This is exactly the native branch the AcvmHandler
    // will construct once the resolver connection is threaded through (Spike 4).
    let resolve_fc = |wait: &ForeignCallWaitInfo<FieldElement>| {
        let req = rmp_serde::to_vec_named(wait).map_err(|e| format!("serialize fc: {e}"))?;
        let resp = client
            .call(&req)
            .map_err(|e| format!("resolver call: {e}"))?;
        rmp_serde::from_slice::<ForeignCallResult<FieldElement>>(&resp)
            .map_err(|e| format!("deserialize fc result: {e}"))
    };

    // x = 2, y = 3 -> z = 5 -> oracle must return 1/5.
    let out = execute_acir(
        &oracle_invert_program(),
        &[(1, be32(2)), (2, be32(3))],
        resolve_fc,
    )
    .expect("execute oracle circuit");

    // Solving only succeeds if the oracle returned the correct inverse (the circuit constrains
    // `w_oracle * z == 1`); assert the witness bytes too for explicit native parity.
    let w_oracle = out.iter().find(|(i, _)| *i == 3).expect("oracle solved").1;
    let inv = FieldElement::from(5u64).inverse().to_be_bytes();
    let mut expected = [0u8; 32];
    expected[32 - inv.len()..].copy_from_slice(&inv);
    assert_eq!(
        w_oracle, expected,
        "witness must match native inline resolver"
    );

    let _ = std::fs::remove_file(&sock);
}
