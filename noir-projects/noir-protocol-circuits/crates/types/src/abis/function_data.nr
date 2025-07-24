use crate::{abis::function_selector::FunctionSelector, traits::{Deserialize, Empty, Serialize}};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct FunctionData {
    pub selector: FunctionSelector,
    pub is_private: bool,
}

impl Empty for FunctionData {
    fn empty() -> Self {
        FunctionData { selector: FunctionSelector::empty(), is_private: false }
    }
}

mod test {
    use crate::{
        abis::function_data::FunctionData,
        constants::FUNCTION_DATA_LENGTH,
        traits::{Deserialize, Empty, Serialize},
    };

    #[test]
    fn serialization_of_empty() {
        let data = FunctionData::empty();
        // We use the FUNCTION_DATA_LENGTH constant to ensure that there is a match between the derived trait
        // implementation and the constant.
        let serialized: [Field; FUNCTION_DATA_LENGTH] = data.serialize();
        let deserialized = FunctionData::deserialize(serialized);
        assert(data.eq(deserialized));
    }
}
