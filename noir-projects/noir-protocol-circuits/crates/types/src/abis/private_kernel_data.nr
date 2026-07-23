use crate::{
    abis::kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
    constants::{
        MEGA_VK_LENGTH_IN_FIELDS, PRIVATE_KERNEL_RESET_BLOCK_END,
        PRIVATE_KERNEL_RESET_TAIL_TO_PUBLIC_VK_INDEX, PRIVATE_KERNEL_RESET_TAIL_VK_INDEX,
        PRIVATE_KERNEL_RESET_VK_INDEX, PROOF_TYPE_HN, PROOF_TYPE_HN_TAIL,
    },
    proof::vk_data::VkData,
    utils::arrays::find_first_index,
};

pub struct PrivateKernelData {
    pub public_inputs: PrivateKernelCircuitPublicInputs,
    pub vk_data: VkData<MEGA_VK_LENGTH_IN_FIELDS>,
}

impl PrivateKernelData {
    /// Validates the vk hash is in the vk tree at an allowed index. Differs from the helper in
    /// `vk_data.nr`: an entry in `allowed_indices` that is a reset-family base permits every variant
    /// of that family.
    ///
    /// Reset families occupy contiguous blocks within `[PRIVATE_KERNEL_RESET_VK_INDEX,
    /// PRIVATE_KERNEL_RESET_BLOCK_END)`; a variant's leaf index is normalised to its family base.
    pub fn validate_vk_in_vk_tree<let N: u32>(self, allowed_indices: [u32; N]) {
        let leaf = self.vk_data.leaf_index;
        let vk_index = if leaf < PRIVATE_KERNEL_RESET_VK_INDEX
            | leaf >= PRIVATE_KERNEL_RESET_BLOCK_END {
            leaf
        } else if leaf >= PRIVATE_KERNEL_RESET_TAIL_TO_PUBLIC_VK_INDEX {
            PRIVATE_KERNEL_RESET_TAIL_TO_PUBLIC_VK_INDEX
        } else if leaf >= PRIVATE_KERNEL_RESET_TAIL_VK_INDEX {
            PRIVATE_KERNEL_RESET_TAIL_VK_INDEX
        } else {
            PRIVATE_KERNEL_RESET_VK_INDEX
        };

        // Safety: `index_hint` is validated against the `allowed_indices` array below.
        // If an incorrect hint is provided, the validation will fail, affecting only the prover.
        let index_hint = unsafe { find_first_index(allowed_indices, |index| index == vk_index) };
        assert(index_hint != N, "Vk index not in allowed list");
        // If `index_hint` exceeds `N`, the code below will trigger an index-out-of-bounds error. Such a case would
        // require the return value of the unconstrained `find_first_index` to be intentionally manipulated, so we don't
        // care the error message isn't more explicit.
        assert_eq(allowed_indices[index_hint], vk_index, "Invalid vk index");

        // Note: The hash of the verification key is checked in `verify_proof_with_type` against the given vk hash.
        self.vk_data.validate_in_vk_tree(self.public_inputs.constants.vk_tree_root);
    }

    pub fn verify(self, is_last_kernel: bool) {
        let mut proof_type = PROOF_TYPE_HN;
        if is_last_kernel {
            proof_type = PROOF_TYPE_HN_TAIL;
        }

        // verify_proof_with_type sends the verification data to barretenberg, which adds to the circuit the required
        // constraints to recursively verify the proof. For recursive verification happening inside the kernels, barretenberg
        // only needs the vk, the proof type, and the purported vk hash. Then, barretenberg adds to the circuit:
        // 1. Witnesses for the proofs. These are added based on the proofs generated during the accumulation steps.
        //    The function in barretenberg that generates these proofs is `accumulate`.
        // 2. Constraints that enforce self.vk.hash = Hash(self.vk.key)
        // 3. Constraints that recursively verify the proofs.
        //
        // Note: We talk about proofs because if proof_type = PROOF_TYPE_OINK, then there is only one proof (the accumulation of the first app)
        //       If proof_type = PROOF_TYPE_HN, then there are two proofs (the accumulation of the previous kernel and that of the new app).
        // Note 2: There are no public inputs because CHONK uses that databus to propagate public inputs. This means that the public inputs of the kernel
        //         are not represented as single field elements, but rather as commitments (points on BN254). Barretenberg handles these public inputs internally
        //         and requires no input from Noir.
        // Note on public inputs: While from Noir it looks like kernel circuits have no public inputs, this is not the case. Barretenberg adds public inputs
        //                        to kernels for a series of reasons. Among these inputs, there are the databus public inputs. As mentioned above, these
        //                        public inputs are completely handled by barretenberg and decoupled from Noir. This is why Noir sends to barretenberg an
        //                        empty vector as public inputs.
        std::verify_proof_with_type(
            self.vk_data.vk.key,
            [],
            [],
            self.vk_data.vk.hash,
            proof_type,
        );
    }
}

pub struct PrivateKernelDataWithoutPublicInputs {
    pub vk_data: VkData<MEGA_VK_LENGTH_IN_FIELDS>,
}

impl PrivateKernelDataWithoutPublicInputs {
    pub fn to_private_kernel_data(
        self,
        public_inputs: PrivateKernelCircuitPublicInputs,
    ) -> PrivateKernelData {
        PrivateKernelData { public_inputs, vk_data: self.vk_data }
    }
}
