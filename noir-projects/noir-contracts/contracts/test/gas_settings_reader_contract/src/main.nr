use aztec::macros::aztec;

/// Used by aztec-nr's test_environment gas-settings tests to verify that values configured using `TestEnvironment`
/// reach the called function's context.
#[aztec]
pub contract GasSettingsReader {
    use aztec::{macros::functions::external, protocol::abis::gas_settings::GasSettings};

    /// Returns the gas settings observed by the called private function.
    #[external("private")]
    fn read_gas_settings() -> GasSettings {
        self.context.gas_settings()
    }

    /// Returns the remaining `(da, l2)` gas observed by the called public function. Together with
    /// the function's own gas usage these reveal the configured `gas_limits`.
    #[external("public")]
    fn read_public_gas_left() -> (u32, u32) {
        (self.context.da_gas_left(), self.context.l2_gas_left())
    }
}
