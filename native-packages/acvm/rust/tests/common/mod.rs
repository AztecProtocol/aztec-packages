//! The fixture programs in tests/fixtures (compiled from tests/programs by regenerate.sh), and how
//! to run them.

use std::future::Future;
use std::io::Read;
use std::path::PathBuf;

use acir::native_types::{Witness, WitnessMap, WitnessStack};
use acir::FieldElement;
use acvm::AcirField;
use aztec_acvm::{Execution, ForeignCallResolver};
use base64::Engine;

fn fixture(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures")
        .join(name)
}

/// A fixture program's bytecode, as `Program::serialize_program` wrote it.
pub fn bytecode(program: &str) -> Vec<u8> {
    let artifact: serde_json::Value =
        serde_json::from_slice(&std::fs::read(fixture(&format!("{program}.json"))).unwrap())
            .unwrap();
    base64::engine::general_purpose::STANDARD
        .decode(artifact["bytecode"].as_str().unwrap())
        .unwrap()
}

/// The witness stack `nargo execute` solved a fixture program to, from its Prover.toml.
pub fn nargo_witness_stack(program: &str) -> WitnessStack<FieldElement> {
    WitnessStack::deserialize(&std::fs::read(fixture(&format!("{program}.witness.gz"))).unwrap())
        .unwrap()
}

/// A main function's initial witness: its ABI inputs, flattened, are witnesses 0, 1, ...
pub fn inputs(values: &[u128]) -> WitnessMap<FieldElement> {
    let mut witness = WitnessMap::new();
    for (index, value) in values.iter().enumerate() {
        witness.insert(Witness(index as u32), FieldElement::from(*value));
    }
    witness
}

pub fn field(value: u128) -> FieldElement {
    FieldElement::from(value)
}

/// Decompress a gzipped buffer.
pub fn gunzip(bytes: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    flate2::read::GzDecoder::new(bytes)
        .read_to_end(&mut out)
        .unwrap();
    out
}

/// Runs [`aztec_acvm::execute`] with a resolver that answers at once, so it finishes on its first
/// poll.
#[allow(dead_code)]
pub fn execute(
    bytecode: &[u8],
    initial_witness: WitnessMap<FieldElement>,
    resolver: &mut impl ForeignCallResolver,
) -> Result<Execution, String> {
    let future = std::pin::pin!(aztec_acvm::execute(bytecode, initial_witness, resolver));
    match future.poll(&mut std::task::Context::from_waker(std::task::Waker::noop())) {
        std::task::Poll::Ready(execution) => execution,
        std::task::Poll::Pending => panic!("the resolver answers at once"),
    }
}
