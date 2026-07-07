//! acvm-sim server binary. Spawned by the `@aztec/acvm-sim` TS client, which passes
//! `--input <ipc-path>` (a `.sock` UDS or `.shm` path). Serves `execute` requests until
//! signalled to shut down.

use acvm_sim::generated::acvm_server::handle_request;
use acvm_sim::AcvmHandler;
use ipc_runtime::IpcServer;

fn main() {
    let ipc_path = parse_input_arg().unwrap_or_else(|| {
        eprintln!("usage: acvm-sim --input <ipc-path>");
        std::process::exit(2);
    });

    let mut handler = AcvmHandler;
    let mut server = IpcServer::from_path(&ipc_path).expect("failed to create IPC server");
    server.install_default_signal_handlers();
    server.listen().expect("failed to listen on IPC path");
    server.run(|_client_id, request| handle_request(&mut handler, request));
}

fn parse_input_arg() -> Option<String> {
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        if arg == "--input" {
            return args.next();
        }
    }
    None
}
