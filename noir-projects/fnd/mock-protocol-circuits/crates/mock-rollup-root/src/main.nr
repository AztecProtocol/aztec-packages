use mock_types::{PreviousRollupData, RollupPublicInputs};

fn main(a: PreviousRollupData, b: PreviousRollupData) -> pub RollupPublicInputs {
    a.verify(true);
    b.verify(true);

    a.public_inputs().merge(b.public_inputs())
}
