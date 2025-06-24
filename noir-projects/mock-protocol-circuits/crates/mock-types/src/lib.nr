pub global MAX_COMMITMENTS_PER_CALL: u32 = 2;
pub global MAX_COMMITMENTS_PER_TX: u32 = 4;
pub global MAX_COMMITMENT_READ_REQUESTS_PER_CALL: u32 = 2;
pub global MAX_COMMITMENT_READ_REQUESTS_PER_TX: u32 = 4;

pub use protocol_types::{
    abis::avm_circuit_public_inputs::AvmCircuitPublicInputs,
    constants::{
        AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED, AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED,
        CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS, NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
        PROOF_TYPE_AVM, PROOF_TYPE_OINK, PROOF_TYPE_PG, PROOF_TYPE_ROLLUP_HONK,
        PROOF_TYPE_ROOT_ROLLUP_HONK, ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS,
        TUBE_PROOF_LENGTH,
    },
    proof::verification_key::{RollupHonkVerificationKey, VerificationKey},
    traits::Serialize,
};

pub struct TxRequest {
    pub number_of_calls: u32,
}

pub struct AppPublicInputs {
    pub commitments: [Field; MAX_COMMITMENTS_PER_CALL],
    pub read_requests: [Field; MAX_COMMITMENT_READ_REQUESTS_PER_CALL],
}

impl Default for AppPublicInputs {
    fn default() -> Self {
        Self {
            commitments: [0; MAX_COMMITMENTS_PER_CALL],
            read_requests: [0; MAX_COMMITMENT_READ_REQUESTS_PER_CALL],
        }
    }
}

pub struct PrivateKernelPublicInputs {
    pub remaining_calls: u32,
    pub commitments: [Field; MAX_COMMITMENTS_PER_TX],
    pub read_requests: [Field; MAX_COMMITMENT_READ_REQUESTS_PER_TX],
}

impl Default for PrivateKernelPublicInputs {
    fn default() -> Self {
        Self {
            remaining_calls: 0,
            commitments: [0; MAX_COMMITMENTS_PER_TX],
            read_requests: [0; MAX_COMMITMENT_READ_REQUESTS_PER_TX],
        }
    }
}

pub struct PrivateKernelPublicInputsBuilder {
    pub remaining_calls: u32,
    pub commitments: BoundedVec<Field, MAX_COMMITMENTS_PER_TX>,
    pub read_requests: BoundedVec<Field, MAX_COMMITMENT_READ_REQUESTS_PER_TX>,
}

impl PrivateKernelPublicInputsBuilder {
    pub fn from_tx(tx: TxRequest) -> Self {
        Self {
            remaining_calls: tx.number_of_calls,
            commitments: BoundedVec::new(),
            read_requests: BoundedVec::new(),
        }
    }

    pub fn from_previous_kernel(prev_kernel_public_inputs: PrivateKernelPublicInputs) -> Self {
        let mut builder = PrivateKernelPublicInputsBuilder {
            remaining_calls: prev_kernel_public_inputs.remaining_calls,
            commitments: BoundedVec::new(),
            read_requests: BoundedVec::new(),
        };
        for i in 0..MAX_COMMITMENTS_PER_TX {
            if prev_kernel_public_inputs.commitments[i] != 0 {
                builder.commitments.push(prev_kernel_public_inputs.commitments[i]);
            }
        }
        for i in 0..MAX_COMMITMENT_READ_REQUESTS_PER_TX {
            if prev_kernel_public_inputs.read_requests[i] != 0 {
                builder.read_requests.push(prev_kernel_public_inputs.read_requests[i]);
            }
        }
        builder
    }

    pub fn ingest_app_inputs(&mut self, app_inputs: AppPublicInputs) {
        for i in 0..MAX_COMMITMENTS_PER_CALL {
            if app_inputs.commitments[i] != 0 {
                self.commitments.push(app_inputs.commitments[i]);
            }
        }

        for i in 0..MAX_COMMITMENT_READ_REQUESTS_PER_CALL {
            if app_inputs.read_requests[i] != 0 {
                self.read_requests.push(app_inputs.read_requests[i]);
            }
        }

        self.remaining_calls -= 1;
    }

    pub fn finish(self) -> PrivateKernelPublicInputs {
        PrivateKernelPublicInputs {
            remaining_calls: self.remaining_calls,
            commitments: self.commitments.storage(),
            read_requests: self.read_requests.storage(),
        }
    }
}

pub struct KernelPublicInputs {
    pub commitments: [Field; MAX_COMMITMENTS_PER_TX],
}

impl Default for KernelPublicInputs {
    fn default() -> Self {
        Self { commitments: [0; MAX_COMMITMENTS_PER_TX] }
    }
}

impl Serialize<MAX_COMMITMENTS_PER_TX> for KernelPublicInputs {
    fn serialize(self) -> [Field; MAX_COMMITMENTS_PER_TX] {
        self.commitments
    }
}

pub struct RollupPublicInputs {
    accumulated: u32,
}

impl RollupPublicInputs {
    pub fn new(accumulated: u32) -> Self {
        Self { accumulated }
    }

    pub fn merge(self, other: Self) -> Self {
        Self { accumulated: self.accumulated + other.accumulated }
    }
}

impl Serialize<1> for RollupPublicInputs {
    fn serialize(self) -> [Field; 1] {
        [self.accumulated as Field]
    }
}

pub struct PreviousRollupData {
    base_or_merge_public_inputs: RollupPublicInputs,
    proof: [Field; NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH],
    vk: RollupHonkVerificationKey,
}

impl PreviousRollupData {
    pub fn verify(self, is_root: bool) {
        let inputs = self.base_or_merge_public_inputs.serialize();

        std::verify_proof_with_type(
            self.vk.key,
            self.proof,
            inputs,
            self.vk.hash,
            if is_root {
                PROOF_TYPE_ROOT_ROLLUP_HONK
            } else {
                PROOF_TYPE_ROLLUP_HONK
            },
        );
    }

    pub fn public_inputs(self) -> RollupPublicInputs {
        self.base_or_merge_public_inputs
    }
}

pub struct TubeData {
    pub public_inputs: KernelPublicInputs,
    pub proof: [Field; TUBE_PROOF_LENGTH],
    pub vk_data: VerificationKey<ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS>,
}

impl TubeData {
    pub fn verify(self) {
        let inputs = KernelPublicInputs::serialize(self.public_inputs);
        std::verify_proof_with_type(
            self.vk_data.key,
            self.proof,
            inputs,
            self.vk_data.hash,
            PROOF_TYPE_ROLLUP_HONK,
        );
    }
}
