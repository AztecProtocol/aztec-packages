use dep::aztec::constants_gen::{
    EMPTY_NULLIFIED_COMMITMENT,
    MAX_NEW_COMMITMENTS_PER_TX,
    MAX_NEW_NULLIFIERS_PER_TX,
    MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX,
    MAX_READ_REQUESTS_PER_TX,
};
use crate::common;
use crate::mocked::{Proof, AggregationObject, verify_previous_kernel_state};
use crate::transaction::request::TxRequest;
use crate::abis::{
    combined_constant_data::CombinedConstantData,
    previous_kernel_data::PreviousKernelData,
    private_kernel::private_call_data::PrivateCallData,
    new_contract_data::NewContractData,
    kernel_circuit_public_inputs::{
        KernelCircuitPublicInputs, 
        KernelCircuitPublicInputsBuilder, 
        KernelCircuitPublicInputsFinal,
    },
};
use crate::utils::{
    arrays,
    bounded_vec::BoundedVec,
};
use crate::hash::{
    compute_commitment_nonce,
    compute_unique_commitment,
};
use dep::std::unsafe;

struct PrivateKernelInputsOrdering {
    previous_kernel : PreviousKernelData,

    read_commitment_hints : [Field; MAX_READ_REQUESTS_PER_TX],
    nullifier_commitment_hints : [Field; MAX_NEW_NULLIFIERS_PER_TX],
}

impl PrivateKernelInputsOrdering {
    fn initialize_end_values(self, public_inputs : &mut KernelCircuitPublicInputsBuilder) {
        let previous_kernel = self.previous_kernel;
        
        common::initialize_end_values(previous_kernel, public_inputs);

        // Ensure the arrays are the same as previously, before we start pushing more data onto them in other
        // functions within this circuit:
        let start = previous_kernel.public_inputs.end;
        public_inputs.end.read_requests = arrays::array_to_bounded_vec(start.read_requests, arrays::is_empty, 0);
        public_inputs.end.new_contracts = arrays::array_to_bounded_vec(self.previous_kernel.public_inputs.end.new_contracts, |ncd: NewContractData| ncd.is_empty(), NewContractData::default());
    }

    fn match_reads_to_commitments(public_inputs : &mut KernelCircuitPublicInputsBuilder, read_commitment_hints :[Field; MAX_READ_REQUESTS_PER_TX]) {
        let new_commitments = public_inputs.end.new_commitments;
        let read_requests = public_inputs.end.read_requests;

        // match reads to commitments from the previous call(s)
        for rr_idx in 0..MAX_READ_REQUESTS_PER_TX {
            let read_request = read_requests.get_unchecked(rr_idx);
            let read_commitment_hint = read_commitment_hints[rr_idx];
            //TODO(David): Shouldn't this just be a uint64?
            let hint_pos = read_commitment_hint as u64;

            if (read_request != 0) {
                let mut match_pos = MAX_NEW_COMMITMENTS_PER_TX as u64;
                if (hint_pos < MAX_NEW_COMMITMENTS_PER_TX as u64) {
                    match_pos = if read_request == new_commitments.get_unchecked(hint_pos as Field) { hint_pos } else { match_pos };
                }
            
                assert(match_pos != MAX_NEW_COMMITMENTS_PER_TX as u64, "read request is transient but does not match any commitment");
            }
        }

        // Empty out read requests after matching them to commitments
        public_inputs.end.read_requests = BoundedVec::new(0);
    }

    fn match_nullifiers_to_commitments_and_squash(public_inputs : &mut KernelCircuitPublicInputsBuilder, nullifier_commitment_hints : [Field; MAX_NEW_NULLIFIERS_PER_TX]) {    
        // match nullifiers/nullified_commitments to commitments from the previous call(s)
        let nullified_commitments = public_inputs.end.nullified_commitments.storage;
        let mut new_commitments = public_inputs.end.new_commitments.storage;
        let mut new_nullifiers = public_inputs.end.new_nullifiers.storage;

        for n_idx in 0..MAX_NEW_NULLIFIERS_PER_TX {
            let nullified_commitment = nullified_commitments[n_idx];
            let nullifier_commitment_hint = nullifier_commitment_hints[n_idx];
            let hint_pos = nullifier_commitment_hint as u64;

            // Nullified_commitment of value `EMPTY_NULLIFIED_COMMITMENT` implies non-transient (persistable)
            // nullifier in which case no attempt will be made to match it to a commitment.
            // Non-empty nullified_commitment implies transient nullifier which MUST be matched to a commitment below!
            // 0-valued nullified_commitment is empty and will be ignored
            if (nullified_commitments[n_idx] != 0) & (nullified_commitments[n_idx] != EMPTY_NULLIFIED_COMMITMENT) {
                assert(hint_pos < MAX_NEW_COMMITMENTS_PER_TX as u64, "New nullifier is transient but does not match any new commitment");
                assert_eq(nullified_commitment, new_commitments[hint_pos], "Incorrect commitment hint");
                // match found!
                // squash both the nullifier and the commitment
                // (set to 0 here and then rearrange array after loop)
                dep::std::println("chopped commitment for siloed inner hash note");
                dep::std::println(new_commitments[hint_pos]);
                new_commitments[hint_pos] = 0;
                new_nullifiers[n_idx as u64] = 0;
            }
            // non-transient (persistable) nullifiers are just kept in new_nullifiers array and forwarded
            // to public inputs (used later by base rollup circuit)
        }
        // Move all zero-ed (removed) entries of these arrays to the end and preserve ordering of other entries
        public_inputs.end.new_commitments = arrays::array_to_bounded_vec(arrays::array_rearrange(new_commitments), arrays::is_empty, 0);
        public_inputs.end.new_nullifiers = arrays::array_to_bounded_vec(arrays::array_rearrange(new_nullifiers), arrays::is_empty, 0);
    }

    fn apply_commitment_nonces(public_inputs : &mut KernelCircuitPublicInputsBuilder) {
        // tx hash
        let first_nullifier = public_inputs.end.new_nullifiers.get(0);
        let mut unique_commitments = BoundedVec::new(0);

        for c_idx in 0..MAX_NEW_COMMITMENTS_PER_TX {
            // Apply nonce to all non-zero/non-empty commitments
            // Nonce is the hash of the first (0th) nullifier and the commitment's index into new_commitments array
            let nonce = compute_commitment_nonce(first_nullifier, c_idx);
            let commitment = public_inputs.end.new_commitments.get_unchecked(c_idx);
            if commitment != 0 {
                let unique_commitment = compute_unique_commitment(nonce, commitment);
                unique_commitments.push(unique_commitment);
            }
        }

        public_inputs.end.new_commitments = unique_commitments;
    }

    pub fn native_private_kernel_circuit_ordering(self) -> KernelCircuitPublicInputsFinal {
        let mut public_inputs : KernelCircuitPublicInputsBuilder = unsafe::zeroed();
        public_inputs.is_private = true;

        common::validate_previous_kernel_values(self.previous_kernel.public_inputs.end);
        
        // Do this before any functions can modify the inputs.
        self.initialize_end_values(&mut public_inputs);

        // TODO(https://github.com/AztecProtocol/aztec-packages/issues/1486): validate that `len(new_nullifiers) ==
        // len(nullified_commitments)`

        // Matching read requests to pending commitments requires the full list of new commitments accumulated over
        // all iterations of the private kernel. Therefore, we match reads against new_commitments in
        // previous_kernel.public_inputs.end, where "previous kernel" is the last "inner" kernel iteration.
        // Remark: The commitments in public_inputs.end have already been siloed by contract address!

        PrivateKernelInputsOrdering::match_reads_to_commitments(&mut public_inputs, self.read_commitment_hints);

        // Matching nullifiers to pending commitments requires the full list of new commitments accumulated over
        // all iterations of the private kernel. Therefore, we match nullifiers (their nullified_commitments)
        // against new_commitments in public_inputs.end which has been initialized to
        // previous_kernel.public_inputs.end in common_initialize_*() above.
        // Remark: The commitments in public_inputs.end have already been siloed by contract address!
        PrivateKernelInputsOrdering::match_nullifiers_to_commitments_and_squash(&mut public_inputs, self.nullifier_commitment_hints);        

        PrivateKernelInputsOrdering::apply_commitment_nonces(&mut public_inputs); 

        public_inputs.to_final()
    }
}
