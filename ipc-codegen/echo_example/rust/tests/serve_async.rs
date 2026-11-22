//! echo_server processes serving through `serve_async`: a Relay's "peer" is a socket that leads
//! back into a server whose earlier hops are still waiting on their host calls, which a server
//! answering one request at a time would deadlock on.

use echo_wire_compat::generated::echo_client::EchoApi;
use ipc_runtime::IpcClient;
use std::process::{Child, Command};
use std::time::Duration;

struct Server(Child);

impl Server {
    fn spawn(socket: &str, peer: &str) -> Self {
        let _ = std::fs::remove_file(socket);
        let child = Command::new(env!("CARGO_BIN_EXE_echo_server"))
            .args(["--socket", socket, "--host-call", &format!("peer={peer}")])
            .spawn()
            .expect("spawn echo_server");
        Self(child)
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

fn socket(name: &str) -> String {
    format!("/tmp/echo_sa_{name}_{}.sock", std::process::id())
}

fn connect(path: &str) -> EchoApi<IpcClient> {
    for _ in 0..100 {
        if let Ok(client) = IpcClient::from_path(path) {
            return EchoApi::new(client);
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    panic!("echo_server never listened on {path}");
}

#[test]
fn a_relay_calls_back_into_its_own_server() {
    let path = socket("self");
    let _server = Server::spawn(&path, &path);
    let mut api = connect(&path);
    let answer = api.relay(&[9], 3).expect("relay");
    assert_eq!(answer.data, vec![9, 3, 2, 1]);
}

#[test]
fn two_servers_relay_back_and_forth() {
    let a = socket("a");
    let b = socket("b");
    let _server_a = Server::spawn(&a, &b);
    let _server_b = Server::spawn(&b, &a);
    let mut api = connect(&a);
    let answer = api.relay(&[7], 4).expect("relay");
    assert_eq!(answer.data, vec![7, 4, 3, 2, 1]);
    // Each server keeps serving once the relay is done.
    assert_eq!(connect(&b).relay(&[1], 0).expect("relay").data, vec![1]);
}
