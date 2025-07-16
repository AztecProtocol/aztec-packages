pub struct GasOpts {
    pub l2_gas: Option<u32>,
    pub da_gas: Option<u32>,
}

impl GasOpts {
    pub fn default() -> Self {
        GasOpts { l2_gas: Option::none(), da_gas: Option::none() }
    }

    pub fn new(l2_gas: u32, da_gas: u32) -> Self {
        GasOpts { l2_gas: Option::some(l2_gas), da_gas: Option::some(da_gas) }
    }
}
