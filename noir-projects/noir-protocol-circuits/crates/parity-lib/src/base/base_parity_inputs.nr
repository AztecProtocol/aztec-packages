use dep::parity_lib::ParityPublicInputs;

global NUM_MSGS_PER_BASE_PARITY: Field = 2;

struct BaseParityInputs {
    msgs: [Field; NUM_MSGS_PER_BASE_PARITY],
}

impl BaseParityInputs {
    pub fn base_parity_circuit(self) -> ParityPublicInputs {
        
    }
}