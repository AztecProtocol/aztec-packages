use dep::parity_lib::{RootParityInputs, ParityPublicInputs};

fn main(inputs: RootParityInputs) -> pub ParityPublicInputs {
    inputs.root_parity_circuit()
}

//use dep::std;

// self.children[0].verification_key.key.as_slice(),
// self.children[0].proof.fields.as_slice(),
// ParityPublicInputs::serialize(self.children[0].public_inputs).as_slice(),
// self.children[0].verification_key.hash

// fn main(
//     verification_key: [Field; 114],
//     proof: [Field; 93],
//     public_inputs: [Field; 2],
//     key_hash: Field,
//     inputs: RootParityInputs
// ) {
//     let serialized: [Field; 2] = ParityPublicInputs::serialize(inputs.children[0].public_inputs);
//     println(serialized);
//     println(public_inputs);
//     std::verify_proof(
//         inputs.children[0].verification_key.key.as_slice(),
//         inputs.children[0].proof.fields.as_slice(),
//         serialized.as_slice(),
//         inputs.children[0].verification_key.hash
//     );
// }
