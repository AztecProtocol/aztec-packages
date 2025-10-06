use dep::mock_types::{CivcProofData, RollupPublicInputs};

fn main(civc_proof_data: CivcProofData) -> pub RollupPublicInputs {
    civc_proof_data.verify();
    RollupPublicInputs::new(1)
}
