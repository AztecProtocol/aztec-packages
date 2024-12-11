pub struct GasOpts {
    pub l2_gas: Option<Field>,
    pub da_gas: Option<Field>,
}

impl GasOpts {
    pub fn default() -> Self {
        GasOpts { l2_gas: Option::none(), da_gas: Option::none() }
    }

    pub fn new(l2_gas: Field, da_gas: Field) -> Self {
        GasOpts { l2_gas: Option::some(l2_gas), da_gas: Option::some(da_gas) }
    }
}
