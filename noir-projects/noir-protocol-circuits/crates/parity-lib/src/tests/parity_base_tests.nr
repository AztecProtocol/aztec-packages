use crate::base::parity_base_private_inputs::ParityBasePrivateInputs;

#[test]
fn public_inputs_match_expected() {
    let msgs = [
        0x151de48ca3efbae39f180fe00b8f472ec9f25be10b4f283a87c6d783935370,
        0x14c2ea9dedf77698d4afe23bc663263eed0bf9aa3a8b17d9b74812f185610f,
        0x1570cc6641699e3ae87fa258d80a6d853f7b8ccb211dc244d017e2ca6530f8,
        0x2806c860af67e9cd50000378411b8c4c4db172ceb2daa862b259b689ccbdc1,
    ];

    let private_inputs = ParityBasePrivateInputs { msgs, vk_tree_root: 42 };
    let public_inputs = private_inputs.execute();

    let expected_sha_root = 0xfc986d54a5e0af4f6e0d49399b9806c2b225e6c652fa5a831ecf6c6c29719d;
    let expected_converted_root =
        0x21b24252ca04466cd4c569026caf9e1c602e228f420f877e4db719c29767774b;

    assert_eq(public_inputs.sha_root, expected_sha_root);
    assert_eq(public_inputs.converted_root, expected_converted_root);
    assert_eq(public_inputs.vk_tree_root, 42);
}
