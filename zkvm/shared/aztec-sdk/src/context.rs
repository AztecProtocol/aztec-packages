use alloc::vec::Vec;
use zkvm_data_types::field::Digest;
use zkvm_data_types::side_effects::*;
use zkvm_data_types::types::{AztecAddress, EthAddress, FunctionSelector};

/// The private execution context. Tracks side effects emitted during a
/// private function call. Analogous to PrivateContext in aztec.nr.
///
/// Unlike the current Noir design with fixed-size arrays, this uses Vecs —
/// the zkVM approach has no per-function capacity limits.
pub struct PrivateContext<D: Digest> {
    side_effect_counter: u32,
    contract_address: AztecAddress<D>,
    msg_sender: AztecAddress<D>,
    function_selector: FunctionSelector,
    is_static: bool,

    // Collected side effects
    note_hashes: Vec<NoteHash<D>>,
    nullifiers: Vec<Nullifier<D>>,
    private_logs: Vec<PrivateLogData<D>>,
    l2_to_l1_messages: Vec<ScopedL2ToL1Message<D>>,
    public_call_requests: Vec<PublicCallRequest<D>>,
    note_hash_read_requests: Vec<ReadRequest<D>>,
    nullifier_read_requests: Vec<ReadRequest<D>>,

    // Tx-level settings
    is_fee_payer: bool,
    expiration_timestamp: Option<u64>,

    // Map from note hash counter to nullifier counter (for transient squash hints)
    note_hash_nullifier_counters: Vec<(u32, u32)>,
}

impl<D: Digest> PrivateContext<D> {
    pub fn new(
        contract_address: AztecAddress<D>,
        msg_sender: AztecAddress<D>,
        function_selector: FunctionSelector,
        initial_counter: u32,
    ) -> Self {
        Self {
            side_effect_counter: initial_counter,
            contract_address,
            msg_sender,
            function_selector,
            is_static: false,
            note_hashes: Vec::new(),
            nullifiers: Vec::new(),
            private_logs: Vec::new(),
            l2_to_l1_messages: Vec::new(),
            public_call_requests: Vec::new(),
            note_hash_read_requests: Vec::new(),
            nullifier_read_requests: Vec::new(),
            is_fee_payer: false,
            expiration_timestamp: None,
            note_hash_nullifier_counters: Vec::new(),
        }
    }

    fn next_counter(&mut self) -> u32 {
        let c = self.side_effect_counter;
        self.side_effect_counter += 1;
        c
    }

    pub fn current_counter(&self) -> u32 {
        self.side_effect_counter
    }

    pub fn contract_address(&self) -> AztecAddress<D> {
        self.contract_address
    }

    pub fn msg_sender(&self) -> AztecAddress<D> {
        self.msg_sender
    }

    // -- Side effect emission --

    pub fn emit_note_hash(&mut self, value: D) {
        let counter = self.next_counter();
        self.note_hashes.push(NoteHash { value, counter });
    }

    pub fn emit_nullifier(&mut self, value: D) {
        let counter = self.next_counter();
        self.nullifiers.push(Nullifier {
            value,
            counter,
            nullified_note_hash: D::zero(),
        });
    }

    /// Emit a nullifier that references a specific note hash (for transient squash).
    pub fn emit_nullifier_for_note_hash(&mut self, value: D, note_hash: D, note_hash_counter: u32) {
        let counter = self.next_counter();
        self.nullifiers.push(Nullifier {
            value,
            counter,
            nullified_note_hash: note_hash,
        });
        self.note_hash_nullifier_counters.push((note_hash_counter, counter));
    }

    pub fn emit_l2_to_l1_message(&mut self, recipient: EthAddress, content: D) {
        let counter = self.next_counter();
        self.l2_to_l1_messages.push(ScopedL2ToL1Message {
            recipient,
            content,
            counter,
            contract_address: self.contract_address,
        });
    }

    pub fn emit_private_log(&mut self, fields: Vec<D>) {
        let counter = self.next_counter();
        let len = fields.len() as u32;
        self.private_logs.push(PrivateLogData {
            fields,
            emitted_length: len,
            counter,
            note_hash_counter: 0,
        });
    }

    pub fn enqueue_public_call(
        &mut self,
        contract: AztecAddress<D>,
        selector: FunctionSelector,
        calldata_hash: D,
    ) {
        let counter = self.next_counter();
        self.public_call_requests.push(PublicCallRequest {
            contract_address: contract,
            function_selector: selector,
            calldata_hash,
            counter,
        });
    }

    pub fn push_note_hash_read_request(&mut self, value: D) {
        let counter = self.next_counter();
        self.note_hash_read_requests.push(ReadRequest { value, counter });
    }

    pub fn push_nullifier_read_request(&mut self, value: D) {
        let counter = self.next_counter();
        self.nullifier_read_requests.push(ReadRequest { value, counter });
    }

    pub fn set_as_fee_payer(&mut self) {
        self.is_fee_payer = true;
    }

    pub fn set_expiration_timestamp(&mut self, ts: u64) {
        self.expiration_timestamp = Some(ts);
    }

    // -- Convert to ExecutionResult for kernel processing --

    pub fn into_execution_result(self) -> ExecutionResult<D> {
        ExecutionResult {
            contract_address: self.contract_address,
            function_selector: self.function_selector,
            note_hashes: self.note_hashes,
            nullifiers: self.nullifiers,
            read_requests: self.note_hash_read_requests,
            nullifier_read_requests: self.nullifier_read_requests,
            private_logs: self.private_logs,
            l2_to_l1_messages: self.l2_to_l1_messages,
            contract_class_log_hashes: Vec::new(),
            public_call_requests: self.public_call_requests,
            teardown_call_request: None,
            is_fee_payer: self.is_fee_payer,
            expiration_timestamp: self.expiration_timestamp,
            note_hash_nullifier_counters: self.note_hash_nullifier_counters,
            nested_results: Vec::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use zkvm_data_types::field::NativeDigest;

    #[test]
    fn context_emits_and_increments_counter() {
        let mut ctx = PrivateContext::new(
            AztecAddress { inner: NativeDigest::from_u64(1) },
            AztecAddress { inner: NativeDigest::from_u64(2) },
            FunctionSelector { inner: 0xdeadbeef },
            0,
        );

        ctx.emit_note_hash(NativeDigest::from_u64(42));
        ctx.emit_nullifier(NativeDigest::from_u64(99));
        ctx.emit_note_hash(NativeDigest::from_u64(43));

        assert_eq!(ctx.current_counter(), 3);

        let result = ctx.into_execution_result();
        assert_eq!(result.note_hashes.len(), 2);
        assert_eq!(result.nullifiers.len(), 1);
        assert_eq!(result.note_hashes[0].counter, 0);
        assert_eq!(result.nullifiers[0].counter, 1);
        assert_eq!(result.note_hashes[1].counter, 2);
    }

    #[test]
    fn context_fee_payer_and_expiration() {
        let mut ctx = PrivateContext::new(
            AztecAddress { inner: NativeDigest::from_u64(1) },
            AztecAddress { inner: NativeDigest::from_u64(2) },
            FunctionSelector { inner: 1 },
            0,
        );

        ctx.set_as_fee_payer();
        ctx.set_expiration_timestamp(9999);

        let result = ctx.into_execution_result();
        assert!(result.is_fee_payer);
        assert_eq!(result.expiration_timestamp, Some(9999));
    }
}
