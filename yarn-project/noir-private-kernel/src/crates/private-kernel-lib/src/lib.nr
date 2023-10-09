mod utils;
mod address;
mod point;
// This is intentionally spelled like this 
// since contract is a reserved keyword, so it cannot 
// be used as an ident.
mod contrakt;
mod transaction;
mod abis;
mod block;
// TODO: rename to be precise as to what its common to.
mod common;

mod mocked;
mod hash;

use abis::kernel_circuit_public_inputs::KernelCircuitPublicInputs;

// Hmm
// PrivateCircuitPublicInputs vs CombinedAccumulatedData (Duplicated fields)
// ?Que es la diferencia entre contract_address y storage_address?
