use crate::abis::{
    function_data::FunctionData, function_selector::FunctionSelector,
    membership_witness::FunctionLeafMembershipWitness
};

struct ContractFunction {
    data: FunctionData,
    vk_hash: Field,
    acir_hash: Field,
    membership_witness: FunctionLeafMembershipWitness,
}

// sibling_path taken from __snapshots__/noir_test_gen.test.ts.snap
global default_private_function = ContractFunction {
    data: FunctionData {
        selector: FunctionSelector { inner: 1010101 },
        is_private: true,
        is_transpiled: false,
    },
    vk_hash: 0,
    acir_hash: 1111,
    membership_witness: FunctionLeafMembershipWitness {
        leaf_index: 0,
        sibling_path: [
            0x190f453689cdbbfd7b55d9e3e27875d44bf429a8092c385cc6377f3081e3936a,
            0x0ef82d751ad1ac0746146dd1c2d922a6f77efa70d46a6539b43a70272137020b,
            0x24d2b6697e7e5722ad0c872bf5187698c8e49ee9fac359eb0793bcccae528af1,
            0x0b458947d3ae5144004bd47d5610818d057e3557316b479360a81af0d882039f,
            0x1dce25e4ad3d04f02dc2808a2506592e1a9d83ee05f61800103862c0faa39ad7,
        ],
    },
};

global default_public_function = ContractFunction {
    data: FunctionData {
        selector: FunctionSelector { inner: 3030303 },
        is_private: false,
        is_transpiled: false,
    },
    vk_hash: 0,
    acir_hash: 3333,
    membership_witness: FunctionLeafMembershipWitness {
        leaf_index: 2,
        sibling_path: [
            0x0b63a53787021a4a962a452c2921b3663aff1ffd8d5510540f8e659e782956f1,
            0x10e3c4c6189e1bd763dbd34d0b7c5d92d903f12f1c4b2dff68e356f958bb846f,
            0x24d2b6697e7e5722ad0c872bf5187698c8e49ee9fac359eb0793bcccae528af1,
            0x0b458947d3ae5144004bd47d5610818d057e3557316b479360a81af0d882039f,
            0x1dce25e4ad3d04f02dc2808a2506592e1a9d83ee05f61800103862c0faa39ad7,
        ],
    },
};

