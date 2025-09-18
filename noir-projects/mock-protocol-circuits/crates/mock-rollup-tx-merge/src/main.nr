use mock_types::{PreviousRollupData, RollupPublicInputs};

fn main(a: PreviousRollupData, b: PreviousRollupData) -> pub RollupPublicInputs {
    a.verify(false);
    b.verify(false);

    a.public_inputs().merge(b.public_inputs())
}
