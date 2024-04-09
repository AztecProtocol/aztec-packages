use dep::types::{mocked::AggregationObject};

struct ParityPublicInputs {
    aggregation_object: AggregationObject,
    sha_root: Field,
    converted_root: Field,
}

impl Default for ParityPublicInputs {
    fn default() -> Self {
        ParityPublicInputs {
            aggregation_object: AggregationObject::default(),
            sha_root: 0,
            converted_root: 0,
        }
    }
}
