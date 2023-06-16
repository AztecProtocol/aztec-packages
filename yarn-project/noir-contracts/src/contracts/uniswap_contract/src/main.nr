contract Uniswap {
    use dep::aztec3::abi;
    use dep::aztec3::abi::PrivateContextInputs;
    use dep::aztec3::abi::PublicContextInputs;
    use dep::aztec3::context::PrivateFunctionContext;
    use dep::aztec3::oracle::public_call;
    use dep::aztec3::private_call_stack_item::PrivateCallStackItem;
    use dep::aztec3::public_call_stack_item::PublicCallStackItem;
    use dep::aztec3::types::point::Point;
    
    fn constructor(
        inputs: pub PrivateContextInputs,
    ) -> pub [Field; dep::aztec3::abi::PUBLIC_INPUTS_LENGTH] {
        PrivateFunctionContext::new().finish(inputs)
    }

    // What we need to make this nicer:
    // 1. A way to access other (and my own) contract's portal addresses (we need many additional args for no good reason now)
    // 2. don't pass all args manually to initial context
    // 3. Variable length arrays for input arguments (8 not enough)
    // 4. Should have storage for fixed values.
    // 5. account abstraction using its own "custom" constants instead of using shared constants...

    fn swap(
        inputs: pub PrivateContextInputs,
        withdrawFnSelector: pub Field, // withdraw method on inputAsset (l2 contract) that would withdraw to L1
        inputAsset: pub Field, 
        inputAssetPortalAddress: pub Field, // l1 portal of input asset
        inputAmount: pub Field,
        uniswapFeeTier: pub Field, // which uniswap tier to use (eg 3000 for 0.3% fee)
        outputAsset: pub Field,
        outputAssetPortalAddress: pub Field, // l1 portal of output asset
        sender: pub Point, 
        recipient: pub Field, // recevier address of output asset after the swap
        secretHash: pub Field, // for when l1 uniswap portal inserts the message to consume output assets on L2
        deadlineForL1ToL2Message: pub Field, // for when l1 uniswap portal inserts the message to consume output assets on L2
        cancellerForL1ToL2Message: pub Field, // L1 address of who can cancel the message to consume assets on L2.
        l1UniswapPortal: pub Field, // L1 address of uniswap portal contract
    ) -> pub [Field; dep::aztec3::abi::PUBLIC_INPUTS_LENGTH] {
        let mut initialContext = PrivateFunctionContext::new();
        // manually pass all the arguments into the current context - 
        initialContext.args = initialContext.args.push_array([
            withdrawFnSelector,
            inputAsset,
            inputAssetPortalAddress,
            inputAmount,
            uniswapFeeTier,
            outputAsset,
            outputAssetPortalAddress,
            sender.x,
            sender.y,
            recipient,
            secretHash,
            deadlineForL1ToL2Message,
            cancellerForL1ToL2Message,
            l1UniswapPortal,
        ]);

        // inputAsset.withdraw(inputAmount, l1UniswapPortal)
        let mut args = [0; dep::aztec3::abi::MAX_ARGS];
        args[0] = inputAmount;
        args[1] = sender.x;
        args[2] = sender.y;
        args[3] = l1UniswapPortal;
        let (callStackItem, mut context) = PrivateCallStackItem::call(inputAsset, withdrawFnSelector, args, initialContext);
        
        let result = callStackItem.public_inputs.return_values[0];
        context.return_values = context.return_values.push(result);

        // Send the swap message to L1 portal
        let content_hash = _compute_swap_content_hash(
           inputAssetPortalAddress,
           inputAmount,
           uniswapFeeTier,
           outputAssetPortalAddress,
           recipient,
           secretHash,
           deadlineForL1ToL2Message,
           cancellerForL1ToL2Message
        );
        context = context.message_portal(content_hash);

        context.finish(inputs)
    }

    // refer uniswapPortal.sol on how L2 to L1 message is expected
    fn _compute_swap_content_hash(
        inputTokenPortal: Field,
        inAmount: Field,
        uniswapFeeTier: Field,
        outputTokenPortal: Field,
        aztecRecipientAddress: Field,
        secretHash: Field,
        deadlineForL1ToL2Message: Field,
        canceller: Field,
    ) -> pub Field {

        let mut hash_bytes: [u8; 260] = [0; 260]; // 8 fields of 32 bytes each + 4 bytes fn selector

        let inputTokenPortal_bytes = inputTokenPortal.to_be_bytes(32);
        let inAmount_bytes = inAmount.to_be_bytes(32);
        let uniswapFeeTier_bytes = uniswapFeeTier.to_be_bytes(32);
        let outputTokenPortal_bytes = outputTokenPortal.to_be_bytes(32);
        let aztecRecipientAddress_bytes = aztecRecipientAddress.to_be_bytes(32);
        let secretHash_bytes = secretHash.to_be_bytes(32);
        let deadlineForL1ToL2Message_bytes = deadlineForL1ToL2Message.to_be_bytes(32);
        let canceller_bytes = canceller.to_be_bytes(32);

        // function selector: 0x5a83260a keccak256("swap(address,uint256,uint24,address,bytes32,bytes32,uint32,address)")
        hash_bytes[0] = 0x5a;
        hash_bytes[1] = 0x83;
        hash_bytes[2] = 0x26;
        hash_bytes[3] = 0x0a;
        hash_bytes[4] = inputTokenPortal_bytes[0];
        hash_bytes[5] = inputTokenPortal_bytes[1];
        hash_bytes[6] = inputTokenPortal_bytes[2];
        hash_bytes[7] = inputTokenPortal_bytes[3];
        hash_bytes[8] = inputTokenPortal_bytes[4];
        hash_bytes[9] = inputTokenPortal_bytes[5];
        hash_bytes[10] = inputTokenPortal_bytes[6];
        hash_bytes[11] = inputTokenPortal_bytes[7];
        hash_bytes[12] = inputTokenPortal_bytes[8];
        hash_bytes[13] = inputTokenPortal_bytes[9];
        hash_bytes[14] = inputTokenPortal_bytes[10];
        hash_bytes[15] = inputTokenPortal_bytes[11];
        hash_bytes[16] = inputTokenPortal_bytes[12];
        hash_bytes[17] = inputTokenPortal_bytes[13];
        hash_bytes[18] = inputTokenPortal_bytes[14];
        hash_bytes[19] = inputTokenPortal_bytes[15];
        hash_bytes[20] = inputTokenPortal_bytes[16];
        hash_bytes[21] = inputTokenPortal_bytes[17];
        hash_bytes[22] = inputTokenPortal_bytes[18];
        hash_bytes[23] = inputTokenPortal_bytes[19];
        hash_bytes[24] = inputTokenPortal_bytes[20];
        hash_bytes[25] = inputTokenPortal_bytes[21];
        hash_bytes[26] = inputTokenPortal_bytes[22];
        hash_bytes[27] = inputTokenPortal_bytes[23];
        hash_bytes[28] = inputTokenPortal_bytes[24];
        hash_bytes[29] = inputTokenPortal_bytes[25];
        hash_bytes[30] = inputTokenPortal_bytes[26];
        hash_bytes[31] = inputTokenPortal_bytes[27];
        hash_bytes[32] = inputTokenPortal_bytes[28];
        hash_bytes[33] = inputTokenPortal_bytes[29];
        hash_bytes[34] = inputTokenPortal_bytes[30];
        hash_bytes[35] = inputTokenPortal_bytes[31];
        hash_bytes[36] = inAmount_bytes[0];
        hash_bytes[37] = inAmount_bytes[1];
        hash_bytes[38] = inAmount_bytes[2];
        hash_bytes[39] = inAmount_bytes[3];
        hash_bytes[40] = inAmount_bytes[4];
        hash_bytes[41] = inAmount_bytes[5];
        hash_bytes[42] = inAmount_bytes[6];
        hash_bytes[43] = inAmount_bytes[7];
        hash_bytes[44] = inAmount_bytes[8];
        hash_bytes[45] = inAmount_bytes[9];
        hash_bytes[46] = inAmount_bytes[10];
        hash_bytes[47] = inAmount_bytes[11];
        hash_bytes[48] = inAmount_bytes[12];
        hash_bytes[49] = inAmount_bytes[13];
        hash_bytes[50] = inAmount_bytes[14];
        hash_bytes[51] = inAmount_bytes[15];
        hash_bytes[52] = inAmount_bytes[16];
        hash_bytes[53] = inAmount_bytes[17];
        hash_bytes[54] = inAmount_bytes[18];
        hash_bytes[55] = inAmount_bytes[19];
        hash_bytes[56] = inAmount_bytes[20];
        hash_bytes[57] = inAmount_bytes[21];
        hash_bytes[58] = inAmount_bytes[22];
        hash_bytes[59] = inAmount_bytes[23];
        hash_bytes[60] = inAmount_bytes[24];
        hash_bytes[61] = inAmount_bytes[25];
        hash_bytes[62] = inAmount_bytes[26];
        hash_bytes[63] = inAmount_bytes[27];
        hash_bytes[64] = inAmount_bytes[28];
        hash_bytes[65] = inAmount_bytes[29];
        hash_bytes[66] = inAmount_bytes[30];
        hash_bytes[67] = inAmount_bytes[31];
        hash_bytes[68] = uniswapFeeTier_bytes[0];
        hash_bytes[69] = uniswapFeeTier_bytes[1];
        hash_bytes[70] = uniswapFeeTier_bytes[2];
        hash_bytes[71] = uniswapFeeTier_bytes[3];
        hash_bytes[72] = uniswapFeeTier_bytes[4];
        hash_bytes[73] = uniswapFeeTier_bytes[5];
        hash_bytes[74] = uniswapFeeTier_bytes[6];
        hash_bytes[75] = uniswapFeeTier_bytes[7];
        hash_bytes[76] = uniswapFeeTier_bytes[8];
        hash_bytes[77] = uniswapFeeTier_bytes[9];
        hash_bytes[78] = uniswapFeeTier_bytes[10];
        hash_bytes[79] = uniswapFeeTier_bytes[11];
        hash_bytes[80] = uniswapFeeTier_bytes[12];
        hash_bytes[81] = uniswapFeeTier_bytes[13];
        hash_bytes[82] = uniswapFeeTier_bytes[14];
        hash_bytes[83] = uniswapFeeTier_bytes[15];
        hash_bytes[84] = uniswapFeeTier_bytes[16];
        hash_bytes[85] = uniswapFeeTier_bytes[17];
        hash_bytes[86] = uniswapFeeTier_bytes[18];
        hash_bytes[87] = uniswapFeeTier_bytes[19];
        hash_bytes[88] = uniswapFeeTier_bytes[20];
        hash_bytes[89] = uniswapFeeTier_bytes[21];
        hash_bytes[90] = uniswapFeeTier_bytes[22];
        hash_bytes[91] = uniswapFeeTier_bytes[23];
        hash_bytes[92] = uniswapFeeTier_bytes[24];
        hash_bytes[93] = uniswapFeeTier_bytes[25];
        hash_bytes[94] = uniswapFeeTier_bytes[26];
        hash_bytes[95] = uniswapFeeTier_bytes[27];
        hash_bytes[96] = uniswapFeeTier_bytes[28];
        hash_bytes[97] = uniswapFeeTier_bytes[29];
        hash_bytes[98] = uniswapFeeTier_bytes[30];
        hash_bytes[99] = uniswapFeeTier_bytes[31];
        hash_bytes[100] = outputTokenPortal_bytes[0];
        hash_bytes[101] = outputTokenPortal_bytes[1];
        hash_bytes[102] = outputTokenPortal_bytes[2];
        hash_bytes[103] = outputTokenPortal_bytes[3];
        hash_bytes[104] = outputTokenPortal_bytes[4];
        hash_bytes[105] = outputTokenPortal_bytes[5];
        hash_bytes[106] = outputTokenPortal_bytes[6];
        hash_bytes[107] = outputTokenPortal_bytes[7];
        hash_bytes[108] = outputTokenPortal_bytes[8];
        hash_bytes[109] = outputTokenPortal_bytes[9];
        hash_bytes[110] = outputTokenPortal_bytes[10];
        hash_bytes[111] = outputTokenPortal_bytes[11];
        hash_bytes[112] = outputTokenPortal_bytes[12];
        hash_bytes[113] = outputTokenPortal_bytes[13];
        hash_bytes[114] = outputTokenPortal_bytes[14];
        hash_bytes[115] = outputTokenPortal_bytes[15];
        hash_bytes[116] = outputTokenPortal_bytes[16];
        hash_bytes[117] = outputTokenPortal_bytes[17];
        hash_bytes[118] = outputTokenPortal_bytes[18];
        hash_bytes[119] = outputTokenPortal_bytes[19];
        hash_bytes[120] = outputTokenPortal_bytes[20];
        hash_bytes[121] = outputTokenPortal_bytes[21];
        hash_bytes[122] = outputTokenPortal_bytes[22];
        hash_bytes[123] = outputTokenPortal_bytes[23];
        hash_bytes[124] = outputTokenPortal_bytes[24];
        hash_bytes[125] = outputTokenPortal_bytes[25];
        hash_bytes[126] = outputTokenPortal_bytes[26];
        hash_bytes[127] = outputTokenPortal_bytes[27];
        hash_bytes[128] = outputTokenPortal_bytes[28];
        hash_bytes[129] = outputTokenPortal_bytes[29];
        hash_bytes[130] = outputTokenPortal_bytes[30];
        hash_bytes[131] = outputTokenPortal_bytes[31];
        hash_bytes[132] = aztecRecipientAddress_bytes[0];
        hash_bytes[133] = aztecRecipientAddress_bytes[1];
        hash_bytes[134] = aztecRecipientAddress_bytes[2];
        hash_bytes[135] = aztecRecipientAddress_bytes[3];
        hash_bytes[136] = aztecRecipientAddress_bytes[4];
        hash_bytes[137] = aztecRecipientAddress_bytes[5];
        hash_bytes[138] = aztecRecipientAddress_bytes[6];
        hash_bytes[139] = aztecRecipientAddress_bytes[7];
        hash_bytes[140] = aztecRecipientAddress_bytes[8];
        hash_bytes[141] = aztecRecipientAddress_bytes[9];
        hash_bytes[142] = aztecRecipientAddress_bytes[10];
        hash_bytes[143] = aztecRecipientAddress_bytes[11];
        hash_bytes[144] = aztecRecipientAddress_bytes[12];
        hash_bytes[145] = aztecRecipientAddress_bytes[13];
        hash_bytes[146] = aztecRecipientAddress_bytes[14];
        hash_bytes[147] = aztecRecipientAddress_bytes[15];
        hash_bytes[148] = aztecRecipientAddress_bytes[16];
        hash_bytes[149] = aztecRecipientAddress_bytes[17];
        hash_bytes[150] = aztecRecipientAddress_bytes[18];
        hash_bytes[151] = aztecRecipientAddress_bytes[19];
        hash_bytes[152] = aztecRecipientAddress_bytes[20];
        hash_bytes[153] = aztecRecipientAddress_bytes[21];
        hash_bytes[154] = aztecRecipientAddress_bytes[22];
        hash_bytes[155] = aztecRecipientAddress_bytes[23];
        hash_bytes[156] = aztecRecipientAddress_bytes[24];
        hash_bytes[157] = aztecRecipientAddress_bytes[25];
        hash_bytes[158] = aztecRecipientAddress_bytes[26];
        hash_bytes[159] = aztecRecipientAddress_bytes[27];
        hash_bytes[160] = aztecRecipientAddress_bytes[28];
        hash_bytes[161] = aztecRecipientAddress_bytes[29];
        hash_bytes[162] = aztecRecipientAddress_bytes[30];
        hash_bytes[163] = aztecRecipientAddress_bytes[31];
        hash_bytes[164] = secretHash_bytes[0];
        hash_bytes[165] = secretHash_bytes[1];
        hash_bytes[166] = secretHash_bytes[2];
        hash_bytes[167] = secretHash_bytes[3];
        hash_bytes[168] = secretHash_bytes[4];
        hash_bytes[169] = secretHash_bytes[5];
        hash_bytes[170] = secretHash_bytes[6];
        hash_bytes[171] = secretHash_bytes[7];
        hash_bytes[172] = secretHash_bytes[8];
        hash_bytes[173] = secretHash_bytes[9];
        hash_bytes[174] = secretHash_bytes[10];
        hash_bytes[175] = secretHash_bytes[11];
        hash_bytes[176] = secretHash_bytes[12];
        hash_bytes[177] = secretHash_bytes[13];
        hash_bytes[178] = secretHash_bytes[14];
        hash_bytes[179] = secretHash_bytes[15];
        hash_bytes[180] = secretHash_bytes[16];
        hash_bytes[181] = secretHash_bytes[17];
        hash_bytes[182] = secretHash_bytes[18];
        hash_bytes[183] = secretHash_bytes[19];
        hash_bytes[184] = secretHash_bytes[20];
        hash_bytes[185] = secretHash_bytes[21];
        hash_bytes[186] = secretHash_bytes[22];
        hash_bytes[187] = secretHash_bytes[23];
        hash_bytes[188] = secretHash_bytes[24];
        hash_bytes[189] = secretHash_bytes[25];
        hash_bytes[190] = secretHash_bytes[26];
        hash_bytes[191] = secretHash_bytes[27];
        hash_bytes[192] = secretHash_bytes[28];
        hash_bytes[193] = secretHash_bytes[29];
        hash_bytes[194] = secretHash_bytes[30];
        hash_bytes[195] = secretHash_bytes[31];
        hash_bytes[196] = deadlineForL1ToL2Message_bytes[0];
        hash_bytes[197] = deadlineForL1ToL2Message_bytes[1];
        hash_bytes[198] = deadlineForL1ToL2Message_bytes[2];
        hash_bytes[199] = deadlineForL1ToL2Message_bytes[3];
        hash_bytes[200] = deadlineForL1ToL2Message_bytes[4];
        hash_bytes[201] = deadlineForL1ToL2Message_bytes[5];
        hash_bytes[202] = deadlineForL1ToL2Message_bytes[6];
        hash_bytes[203] = deadlineForL1ToL2Message_bytes[7];
        hash_bytes[204] = deadlineForL1ToL2Message_bytes[8];
        hash_bytes[205] = deadlineForL1ToL2Message_bytes[9];
        hash_bytes[206] = deadlineForL1ToL2Message_bytes[10];
        hash_bytes[207] = deadlineForL1ToL2Message_bytes[11];
        hash_bytes[208] = deadlineForL1ToL2Message_bytes[12];
        hash_bytes[209] = deadlineForL1ToL2Message_bytes[13];
        hash_bytes[210] = deadlineForL1ToL2Message_bytes[14];
        hash_bytes[211] = deadlineForL1ToL2Message_bytes[15];
        hash_bytes[212] = deadlineForL1ToL2Message_bytes[16];
        hash_bytes[213] = deadlineForL1ToL2Message_bytes[17];
        hash_bytes[214] = deadlineForL1ToL2Message_bytes[18];
        hash_bytes[215] = deadlineForL1ToL2Message_bytes[19];
        hash_bytes[216] = deadlineForL1ToL2Message_bytes[20];
        hash_bytes[217] = deadlineForL1ToL2Message_bytes[21];
        hash_bytes[218] = deadlineForL1ToL2Message_bytes[22];
        hash_bytes[219] = deadlineForL1ToL2Message_bytes[23];
        hash_bytes[220] = deadlineForL1ToL2Message_bytes[24];
        hash_bytes[221] = deadlineForL1ToL2Message_bytes[25];
        hash_bytes[222] = deadlineForL1ToL2Message_bytes[26];
        hash_bytes[223] = deadlineForL1ToL2Message_bytes[27];
        hash_bytes[224] = deadlineForL1ToL2Message_bytes[28];
        hash_bytes[225] = deadlineForL1ToL2Message_bytes[29];
        hash_bytes[226] = deadlineForL1ToL2Message_bytes[30];
        hash_bytes[227] = deadlineForL1ToL2Message_bytes[31];
        hash_bytes[228] = canceller_bytes[0];
        hash_bytes[229] = canceller_bytes[1];
        hash_bytes[230] = canceller_bytes[2];
        hash_bytes[231] = canceller_bytes[3];
        hash_bytes[232] = canceller_bytes[4];
        hash_bytes[233] = canceller_bytes[5];
        hash_bytes[234] = canceller_bytes[6];
        hash_bytes[235] = canceller_bytes[7];
        hash_bytes[236] = canceller_bytes[8];
        hash_bytes[237] = canceller_bytes[9];
        hash_bytes[238] = canceller_bytes[10];
        hash_bytes[239] = canceller_bytes[11];
        hash_bytes[240] = canceller_bytes[12];
        hash_bytes[241] = canceller_bytes[13];
        hash_bytes[242] = canceller_bytes[14];
        hash_bytes[243] = canceller_bytes[15];
        hash_bytes[244] = canceller_bytes[16];
        hash_bytes[245] = canceller_bytes[17];
        hash_bytes[246] = canceller_bytes[18];
        hash_bytes[247] = canceller_bytes[19];
        hash_bytes[248] = canceller_bytes[20];
        hash_bytes[249] = canceller_bytes[21];
        hash_bytes[250] = canceller_bytes[22];
        hash_bytes[251] = canceller_bytes[23];
        hash_bytes[252] = canceller_bytes[24];
        hash_bytes[253] = canceller_bytes[25];
        hash_bytes[254] = canceller_bytes[26];
        hash_bytes[255] = canceller_bytes[27];
        hash_bytes[256] = canceller_bytes[28];
        hash_bytes[257] = canceller_bytes[29];
        hash_bytes[258] = canceller_bytes[30];
        hash_bytes[259] = canceller_bytes[31];

        let content_sha256 = dep::std::hash::sha256(hash_bytes);

        // // Convert the content_sha256 to a field element
        let mut v = 1;
        let mut high = 0 as Field;
        let mut low = 0 as Field;

        // Unroll loops because otherwise takes forever to compile
        // for i in [15 - i for i in range(16)]:
        //     print('high = high + (content_sha256[{0}] as Field) * v;'.format(i))
        //     print('low = low + (content_sha256[16 + {0}] as Field) * v;'.format(i))
        //     print('v = v * 256;');
        high = high + (content_sha256[15] as Field) * v;
        low = low + (content_sha256[16 + 15] as Field) * v;
        v = v * 256;
        high = high + (content_sha256[14] as Field) * v;
        low = low + (content_sha256[16 + 14] as Field) * v;
        v = v * 256;
        high = high + (content_sha256[13] as Field) * v;
        low = low + (content_sha256[16 + 13] as Field) * v;
        v = v * 256;
        high = high + (content_sha256[12] as Field) * v;
        low = low + (content_sha256[16 + 12] as Field) * v;
        v = v * 256;
        high = high + (content_sha256[11] as Field) * v;
        low = low + (content_sha256[16 + 11] as Field) * v;
        v = v * 256;
        high = high + (content_sha256[10] as Field) * v;
        low = low + (content_sha256[16 + 10] as Field) * v;
        v = v * 256;
        high = high + (content_sha256[9] as Field) * v;
        low = low + (content_sha256[16 + 9] as Field) * v;
        v = v * 256;
        high = high + (content_sha256[8] as Field) * v;
        low = low + (content_sha256[16 + 8] as Field) * v;
        v = v * 256;
        high = high + (content_sha256[7] as Field) * v;
        low = low + (content_sha256[16 + 7] as Field) * v;
        v = v * 256;
        high = high + (content_sha256[6] as Field) * v;
        low = low + (content_sha256[16 + 6] as Field) * v;
        v = v * 256;
        high = high + (content_sha256[5] as Field) * v;
        low = low + (content_sha256[16 + 5] as Field) * v;
        v = v * 256;
        high = high + (content_sha256[4] as Field) * v;
        low = low + (content_sha256[16 + 4] as Field) * v;
        v = v * 256;
        high = high + (content_sha256[3] as Field) * v;
        low = low + (content_sha256[16 + 3] as Field) * v;
        v = v * 256;
        high = high + (content_sha256[2] as Field) * v;
        low = low + (content_sha256[16 + 2] as Field) * v;
        v = v * 256;
        high = high + (content_sha256[1] as Field) * v;
        low = low + (content_sha256[16 + 1] as Field) * v;
        v = v * 256;
        high = high + (content_sha256[0] as Field) * v;
        low = low + (content_sha256[16 + 0] as Field) * v;
        v = v * 256;

        // Abuse that a % p + b % p = (a + b) % p and that low < p
        let content_hash = low + high * v;

        content_hash
    }
}