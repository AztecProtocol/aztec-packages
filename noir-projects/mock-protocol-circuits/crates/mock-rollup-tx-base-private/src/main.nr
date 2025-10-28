use dep::mock_types::{ChonkProofData, RollupPublicInputs};

fn main(chonk_proof_data: ChonkProofData) -> pub RollupPublicInputs {
    chonk_proof_data.verify();
    RollupPublicInputs::new(1)
}
