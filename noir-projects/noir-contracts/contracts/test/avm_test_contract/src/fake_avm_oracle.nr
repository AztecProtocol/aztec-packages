use aztec::protocol::address::AztecAddress;

pub unconstrained fn call<let N: u32>(
    l2_gas_allocation: u32,
    da_gas_allocation: u32,
    address: AztecAddress,
    args: [Field; N],
) {
    call_opcode(l2_gas_allocation, da_gas_allocation, address, N, args)
}

pub unconstrained fn success_copy() -> bool {
    success_copy_opcode()
}

pub unconstrained fn returndata_size() -> u32 {
    returndata_size_opcode()
}

pub unconstrained fn returndata_copy(rdoffset: u32, copy_size: u32) -> [Field] {
    returndata_copy_opcode(rdoffset, copy_size)
}

pub unconstrained fn avm_return(returndata: [Field]) {
    return_opcode(returndata)
}

pub unconstrained fn revert(revertdata: [Field]) {
    revert_opcode(revertdata)
}

// While the length parameter might seem unnecessary given that we have N we keep it around because at the AVM bytecode
// level, we want to support non-comptime-known lengths for such opcodes, even if Noir code will not generally take that
// route.
#[oracle(aztec_avm_call)]
unconstrained fn call_opcode<let N: u32>(
    l2_gas_allocation: u32,
    da_gas_allocation: u32,
    address: AztecAddress,
    length: u32,
    args: [Field; N],
) {}

#[oracle(aztec_avm_successCopy)]
unconstrained fn success_copy_opcode() -> bool {}

#[oracle(aztec_avm_returndataSize)]
unconstrained fn returndata_size_opcode() -> u32 {}

#[oracle(aztec_avm_returndataCopy)]
unconstrained fn returndata_copy_opcode(rdoffset: u32, copy_size: u32) -> [Field] {}

#[oracle(aztec_avm_return)]
unconstrained fn return_opcode(returndata: [Field]) {}

#[oracle(aztec_avm_revert)]
unconstrained fn revert_opcode(revertdata: [Field]) {}
