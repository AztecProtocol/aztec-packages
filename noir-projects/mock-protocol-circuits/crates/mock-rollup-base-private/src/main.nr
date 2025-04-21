use dep::mock_types::{RollupPublicInputs, TubeData};

fn main(tube_data: TubeData) -> pub RollupPublicInputs {
    tube_data.verify();
    RollupPublicInputs::new(1)
}
