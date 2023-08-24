
// refer `l1-contracts/test/portals/UniswapPortal.sol` on how L2 to L1 message is expected
fn compute_swap_content_hash(
    inputTokenPortal: Field,
    inAmount: Field,
    uniswapFeeTier: Field,
    outputTokenPortal: Field,
    amountOutMin: Field,
    aztecRecipientAddress: Field,
    secretHash: Field,
    deadlineForL1ToL2Message: Field,
    canceller: Field,
    callerOnL1: Field, // ethereum address that can call this function on the L1 portal (0x0 if anyone can call)
) -> Field {

    let mut hash_bytes: [u8; 324] = [0; 324]; // 10 fields of 32 bytes each + 4 bytes fn selector

    let inputTokenPortal_bytes = inputTokenPortal.to_be_bytes(32);
    let inAmount_bytes = inAmount.to_be_bytes(32);
    let uniswapFeeTier_bytes = uniswapFeeTier.to_be_bytes(32);
    let outputTokenPortal_bytes = outputTokenPortal.to_be_bytes(32);
    let amountOutMin_bytes = amountOutMin.to_be_bytes(32);
    let aztecRecipientAddress_bytes = aztecRecipientAddress.to_be_bytes(32);
    let secretHash_bytes = secretHash.to_be_bytes(32);
    let deadlineForL1ToL2Message_bytes = deadlineForL1ToL2Message.to_be_bytes(32);
    let canceller_bytes = canceller.to_be_bytes(32);
    let callerOnL1_bytes = callerOnL1.to_be_bytes(32);

    // function selector: 0x9c073c81 keccak256("swap(address,uint256,uint24,address,uint256,bytes32,bytes32,uint32,address,address)")
    hash_bytes[0] = 0x9c;
    hash_bytes[1] = 0x07;
    hash_bytes[2] = 0x3c;
    hash_bytes[3] = 0x81;

    for i in 0..32 {
        hash_bytes[i + 4] = inputTokenPortal_bytes[i];
        hash_bytes[i + 36] = inAmount_bytes[i];
        hash_bytes[i + 68] = uniswapFeeTier_bytes[i];
        hash_bytes[i + 100] = outputTokenPortal_bytes[i];
        hash_bytes[i + 132] = amountOutMin_bytes[i];
        hash_bytes[i + 164] = aztecRecipientAddress_bytes[i];
        hash_bytes[i + 196] = secretHash_bytes[i];
        hash_bytes[i + 228] = deadlineForL1ToL2Message_bytes[i];
        hash_bytes[i + 260] = canceller_bytes[i];
        hash_bytes[i + 292] = callerOnL1_bytes[i];
    }

    let content_sha256 = dep::std::hash::sha256(hash_bytes);

    // // Convert the content_sha256 to a field element
    let mut v = 1;
    let mut high = 0 as Field;
    let mut low = 0 as Field;

    for i in 0..16 {
        high = high + (content_sha256[15 - i] as Field) * v;
        low = low + (content_sha256[16 + 15 - i] as Field) * v;
        v = v * 256;
    }

    // Abuse that a % p + b % p = (a + b) % p and that low < p
    let content_hash = low + high * v;

    content_hash
}