use std::path::PathBuf;

use crate::cli::{
    CircuitReport, GatesCommand, 
};
use crate::{Backend, BackendError};

impl Backend {
    pub fn get_exact_circuit_sizes(
        &self,
        artifact_path: PathBuf,
    ) -> Result<Vec<CircuitReport>, BackendError> {
        let binary_path = self.assert_binary_exists()?;
        self.assert_correct_version()?;

        GatesCommand { crs_path: self.crs_directory(), artifact_path }.run(binary_path)
    }

}
