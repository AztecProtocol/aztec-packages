use std::{
    collections::BTreeMap,
};

use acvm::acir::native_types::WitnessMap;

use crate::errors::CliError;

/// Creates a toml representation of the provided witness map
pub(crate) fn create_output_witness_string(witnesses: &WitnessMap) -> Result<String, CliError> {
    let mut witness_map: BTreeMap<String, String> = BTreeMap::new();
    for (key, value) in witnesses.clone().into_iter() {
        witness_map.insert(key.0.to_string(), format!("0x{}", value.to_hex()));
    }

    toml::to_string(&witness_map).map_err(|_| CliError::OutputWitnessSerializationFailed())
}
