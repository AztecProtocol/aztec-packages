use dep::private_kernel_lib::abis::previous_kernel_data::PreviousKernelData;
use dep::private_kernel_lib::abis::kernel_circuit_public_inputs_final::KernelCircuitPublicInputsFinal;
use dep::private_kernel_lib::common;
use dep::private_kernel_lib::utils::arrays::{array_rearrange};
use dep::private_kernel_lib::constants::per_transaction::{MAX_READ_REQUESTS_PER_TX,MAX_NEW_NULLIFIERS_PER_TX,MAX_NEW_COMMITMENTS_PER_TX};
use dep::private_kernel_lib::constants::misc::{EMPTY_NULLIFIED_COMMITMENT};
use dep::std::unsafe;
use dep::private_kernel_lib::hash::{compute_unique_commitment,compute_commitment_nonce};

fn main(input : PrivateKernelInputsOrdering) -> distinct pub KernelCircuitPublicInputsFinal {
    let empty_public_inputs : KernelCircuitPublicInputsFinal = unsafe::zeroed();
    empty_public_inputs
}

struct PrivateKernelInputsOrdering {
    previous_kernel : PreviousKernelData,

    read_commitment_hints : [Field; MAX_READ_REQUESTS_PER_TX],
    nullifier_commitment_hints : [Field; MAX_NEW_NULLIFIERS_PER_TX],
}

impl PrivateKernelInputsOrdering {
    fn initialize_end_values(self, public_inputs : &mut KernelCircuitPublicInputsFinal) {
        common::initialize_end_values_final(self.previous_kernel, public_inputs);
        public_inputs.end.new_contracts = self.previous_kernel.public_inputs.end.new_contracts;
    }

    fn match_reads_to_commitments(read_requests : [Field; MAX_READ_REQUESTS_PER_TX], read_commitment_hints :[Field; MAX_READ_REQUESTS_PER_TX],new_commitments : [Field; MAX_NEW_COMMITMENTS_PER_TX]) {
        // match reads to commitments from the previous call(s)
        for rr_idx in 0..MAX_READ_REQUESTS_PER_TX {
            let read_request = read_requests[rr_idx];
            let read_commitment_hint = read_commitment_hints[rr_idx];
            //TODO(David): Shouldn't this just be a uint64?
            let hint_pos = read_commitment_hint as u64;

            if (read_request != 0) {
                let mut match_pos = MAX_NEW_COMMITMENTS_PER_TX as u64;
                if (hint_pos < MAX_NEW_COMMITMENTS_PER_TX as u64) {
                    match_pos = if read_request == new_commitments[hint_pos] { hint_pos } else { match_pos};
                }
            
                assert(match_pos != MAX_NEW_COMMITMENTS_PER_TX as u64, "read request is transient but does not match any commitment");
            }
        }
      
    }

    fn match_nullifiers_to_commitments_and_squash(new_nullifiers : &mut [Field; MAX_NEW_NULLIFIERS_PER_TX], nullified_commitments : [Field; MAX_NEW_NULLIFIERS_PER_TX], nullifier_commitment_hints : [Field; MAX_NEW_NULLIFIERS_PER_TX], new_commitments : &mut [Field; MAX_NEW_COMMITMENTS_PER_TX]) {    
        // match nullifiers/nullified_commitments to commitments from the previous call(s)
        for n_idx in 0..MAX_NEW_NULLIFIERS_PER_TX {
            let nullified_commitment = nullified_commitments[n_idx];
            let nullifier_commitment_hint = nullifier_commitment_hints[n_idx];
            let hint_pos = nullifier_commitment_hint as u64;

            // Nullified_commitment of value `EMPTY_NULLIFIED_COMMITMENT` implies non-transient (persistable)
            // nullifier in which case no attempt will be made to match it to a commitment.
            // Non-empty nullified_commitment implies transient nullifier which MUST be matched to a commitment below!
            // 0-valued nullified_commitment is empty and will be ignored
            if (nullified_commitments[n_idx] != 0) && (nullified_commitments[n_idx] != EMPTY_NULLIFIED_COMMITMENT) {
                let mut match_pos = MAX_NEW_COMMITMENTS_PER_TX as u64;
                if (hint_pos < MAX_NEW_COMMITMENTS_PER_TX as u64) {
                    let new_commitment_hint_pos = noir_array_get(new_commitments,hint_pos);
                    match_pos = if (nullified_commitment == new_commitment_hint_pos){ hint_pos } else { match_pos };
                    if (match_pos != MAX_NEW_COMMITMENTS_PER_TX as u64) { 
                        // match found!
                        // squash both the nullifier and the commitment
                        // (set to 0 here and then rearrange array after loop)
                        dep::std::println("chopped commitment for siloed inner hash note");
                        dep::std::println(noir_array_get(new_commitments,match_pos));

                        noir_array_set(new_commitments, match_pos, 0);
                        noir_array_set(new_nullifiers, n_idx as u64, 0);
                    } else {
                        // Transient nullifiers MUST match a pending commitment
                        // TODO(Kev/David): This pattern is quite unintuitive, we could do:
                        /*
                            assert(match_pos != MAX_NEW_COMMITMENTS_PER_TX, "new nullifier is transient ...");
                            new_commitments[match_pos] = 0;
                            new_nullifiers[n_idx] = 0;
                            I guess its done this way, so that the `important` does not trigger.
                            If important is only for debug then we can do it like i said and it will not trigger at execution time
                            since the assert will return an error.
                        */
                        assert(false, "new nullifier is transient but does not match any new commitment");
                    }
                }
            }
            // non-transient (persistable) nullifiers are just kept in new_nullifiers array and forwarded
            // to public inputs (used later by base rollup circuit)
        }
        // Move all zero-ed (removed) entries of these arrays to the end and preserve ordering of other entries
        *new_commitments = array_rearrange(*new_commitments);
        *new_nullifiers = array_rearrange(*new_nullifiers);
    }

    fn apply_commitment_nonces(first_nullifier : Field, new_commitments : &mut [Field; MAX_NEW_COMMITMENTS_PER_TX]) {
        for c_idx in 0..MAX_NEW_COMMITMENTS_PER_TX {
            // Apply nonce to all non-zero/non-empty commitments
            // Nonce is the hash of the first (0th) nullifier and the commitment's index into new_commitments array
            let nonce = compute_commitment_nonce(first_nullifier, c_idx);
            let new_commitments_c_idx = if noir_array_get(new_commitments, c_idx as u64) == 0 {
                0
            } else {
                compute_unique_commitment(nonce, noir_array_get(new_commitments, c_idx as u64))
            };
            noir_array_set(new_commitments, c_idx as u64, new_commitments_c_idx);
        }
    }

    fn native_private_kernel_circuit_ordering(self) -> KernelCircuitPublicInputsFinal {
        let mut public_inputs : KernelCircuitPublicInputsFinal = unsafe::zeroed();

        common::validate_previous_kernel_values(self.previous_kernel.public_inputs.end);
        
        // Do this before any functions can modify the inputs.
        self.initialize_end_values(&mut public_inputs);

        // TODO(https://github.com/AztecProtocol/aztec-packages/issues/1486): validate that `len(new_nullifiers) ==
        // len(nullified_commitments)`

        // Matching read requests to pending commitments requires the full list of new commitments accumulated over
        // all iterations of the private kernel. Therefore, we match reads against new_commitments in
        // previous_kernel.public_inputs.end, where "previous kernel" is the last "inner" kernel iteration.
        // Remark: The commitments in public_inputs.end have already been siloed by contract address!

        PrivateKernelInputsOrdering::match_reads_to_commitments(self.previous_kernel.public_inputs.end.read_requests,
                                self.read_commitment_hints,
                                self.previous_kernel.public_inputs.end.new_commitments);        

        // Matching nullifiers to pending commitments requires the full list of new commitments accumulated over
        // all iterations of the private kernel. Therefore, we match nullifiers (their nullified_commitments)
        // against new_commitments in public_inputs.end which has been initialized to
        // previous_kernel.public_inputs.end in common_initialize_*() above.
        // Remark: The commitments in public_inputs.end have already been siloed by contract address!
        PrivateKernelInputsOrdering::match_nullifiers_to_commitments_and_squash(&mut public_inputs.end.new_nullifiers,
                                                   public_inputs.end.nullified_commitments,
                                                   self.nullifier_commitment_hints,
                                                   &mut public_inputs.end.new_commitments);        

        // tx hash
        let first_nullifier = self.previous_kernel.public_inputs.end.new_nullifiers[0];
        PrivateKernelInputsOrdering::apply_commitment_nonces(first_nullifier, &mut public_inputs.end.new_commitments); 

        public_inputs
    }
}


// TODO(Jake)
// This is here because x[index] = value is not working in Noir right now
// when x is &mut 
fn noir_array_set<N>(x : &mut [Field; N], index : u64, value : Field) {
  // x[index] = value;
}
// This is here because x[index] is not working in Noir right now
// when x is &mut 
fn noir_array_get<N>(x : &mut [Field; N], index : u64) -> Field {
    // x[index]
    0
}