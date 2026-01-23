#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/vm2/generated/columns.hpp"

#pragma once

namespace bb::avm2::constraining {

/**
 * @brief Stores the fixed AVM VK commitments (to precomputed polynomials) that depend only on the precomputed columns.
 * @details If the precomputed columns change, these commitments must be updated accordingly. Their values can be
 * obtained from the test AvmFixedVKTests.FixedVKCommitments. If the NUM_PRECOMPUTED_COMMITMENTS changes, fill the extra
 * with Commitment::one() or trim the extra items, and run the test to get the new values.
 */
class AvmHardCodedVKAndHash {
  public:
    using Commitment = bb::curve::BN254::AffineElement;
    using FF = bb::curve::BN254::ScalarField;

    // Precomputed VK hash (hash of all commitments below).
    static FF vk_hash() { return FF(uint256_t("0x2b1fc730f23ab1a3db0c967d92e6d5d7fb9be9aa8feee3fd3ecae2dee8637deb")); }

    static constexpr std::array<Commitment, NUM_PRECOMPUTED_ENTITIES> get_all()
    {
        return {
            Commitment(
                uint256_t("0x167ea379a8608239054c0df304316e7f91b9bc2c2b127fca9711c82aa2c9cd30"),
                uint256_t(
                    "0x1d0e1881db1e7a631ac9718f5f771c3bb00431c417108bb0ae14e11cac14ca10")), // precomputed_addressing_gas
            Commitment(
                uint256_t("0x20f2cce4356437e823da8f6781f795ca8eecd764ebd5d6e3cfca981bc55d0ec8"),
                uint256_t(
                    "0x12b232126fc543c841bedf201cc3ca827b6a514b13bdcda0ab8659951cfacd79")), // precomputed_bitwise_input_a
            Commitment(
                uint256_t("0x0cdaa6a840d41adc1a1b774f088d4a507b3aa9421b34620630513af0ee19eff6"),
                uint256_t(
                    "0x2fd2d124baeabe1a51a1bee0c4f2f283ce90f1c18f30cb74c1f86a2cd03e92b5")), // precomputed_bitwise_input_b
            Commitment(
                uint256_t("0x16d0c870e74447111803623ccba2cd4098a6777055f08783ac068ce943476d8d"),
                uint256_t(
                    "0x0d05ca7f4c49cfb8d7f64f7a284b6089b5eb571555971ef0eaf2620c34f3de64")), // precomputed_bitwise_op_id
            Commitment(
                uint256_t("0x302ca89489db6a8475874cc59ce7aa2ef77f11af5622c5ed60f8501711c8b954"),
                uint256_t(
                    "0x0281f371b3fc75d6068e15637c8d5636eafc95ceaf56b67dd993be344f495720")), // precomputed_bitwise_output
            Commitment(
                uint256_t("0x265b02f746978dbf5bec0536127692b4c7e4f8806e43a086e6947e7dba46a708"),
                uint256_t("0x096e8c64b24dd80043fe5f6d4b9ee22403eefbde9f90cec46df6d6f57d4fc6d0")), // precomputed_clk
            Commitment(
                uint256_t("0x298cbe8d7aabda5cf9272257c13681843126d8ffaa6087a1773e5c9b3c5dd513"),
                uint256_t(
                    "0x1485cbdb64eacfe673a6c4d6a9666d627ce5357fb22551b6f8b4cee23db1b315")), // precomputed_dyn_gas_id
            Commitment(
                uint256_t("0x2e3d6772c0dc1f547adb030a56f4334faa5820f5844fe22d304d69634622e15f"),
                uint256_t(
                    "0x0ba448b2839e88df5399de029135bb7a843df9fad37003895cf4b0e4ea824f69")), // precomputed_envvar_pi_row_idx
            Commitment(
                uint256_t("0x149eda0d6c72305cbc8c12e5db72971e08fead559aab4501bb97f20c4f2cae1f"),
                uint256_t(
                    "0x09f2eef32136799118634a108531dc248506d5f58f64885575b245865b56d48e")), // precomputed_exec_opcode
            Commitment(
                uint256_t("0x0188169f0225c14e925347c4f9f192d191b2ab6ca2fbc1d0453f48af5d9c667b"),
                uint256_t(
                    "0x25b997de6f92af3ea3b409b41437fea01980b344a12fabc6b833656f26d6e954")), // precomputed_exec_opcode_base_da_gas
            Commitment(
                uint256_t("0x1ddbbb27c627edafce021d5f332867ac9234c6f507442633bff9a5dbb4d02803"),
                uint256_t(
                    "0x10fda7a2360b21bbfbb1e815377adc0fa869bbcb4a46b29c31ae017893fdfb0d")), // precomputed_exec_opcode_dynamic_da_gas
            Commitment(
                uint256_t("0x06c03e425e92d09aa8243220a0968b4d7d00c89e541a2b6095920883a8a6fa72"),
                uint256_t(
                    "0x090dda25e7d64ab5cabe09fd80fbb731af2a98de7a608157dc10394b4fc022a4")), // precomputed_exec_opcode_dynamic_l2_gas
            Commitment(
                uint256_t("0x1139e8df5eabbe4201a0d73a0cfa7e12833955b6e190ec05fcdc0002d2756736"),
                uint256_t(
                    "0x1ed8930b01998a1ba6c2df226f9e9a2aa93606228ed6d74b568c93cbdd6fb77f")), // precomputed_exec_opcode_opcode_gas
            Commitment(
                uint256_t("0x296def9415d1c96b4d8ab91df5f59ad8522a726f98461b1ab5c4d4c5b22471a4"),
                uint256_t(
                    "0x25af891969963477ee60f67f7f592402c1720525c0b8b15a631397a9d2a0b285")), // precomputed_expected_tag_reg_0_
            Commitment(
                uint256_t("0x267d9986093f6c0ddc9362b80757412efef866dd05b38a47f7cde550c5c9bfda"),
                uint256_t(
                    "0x06ea9cd6f2a50e2156f80beebc721d11d24821fd4b723932da48d8750300fbaa")), // precomputed_expected_tag_reg_1_
            Commitment(
                uint256_t("0x1cb1c6d46ddf9f7bd7a87a5e7dca5ef92c8a44669ab0cbc557a0fcb8331d0d8d"),
                uint256_t(
                    "0x281a3e4b96e4f595db502ba69acda314bc335957ae605af17423b0ff3d0528c3")), // precomputed_expected_tag_reg_2_
            Commitment(
                uint256_t("0x1a3c36c4933c956751e6ca5631077a9418cd0ba4ec29e965508eaf8bc1a7ffd4"),
                uint256_t(
                    "0x1203bdd1aab5bfc5f3ed6abbefc30ab303770b847d022c1c9c0f8de202a76560")), // precomputed_expected_tag_reg_3_
            Commitment::infinity(), // precomputed_expected_tag_reg_4_
            Commitment(
                uint256_t("0x11b316123744c8602e394b9a558ed664a70d8a7e8f5a3138c9971302c193dd84"),
                uint256_t(
                    "0x08a817c8ab332c7f8b478ec9bddb41a8ca1593c3b8fb85d6236d3eecc2df3b37")), // precomputed_expected_tag_reg_5_
            Commitment(
                uint256_t("0x0000000000000000000000000000000000000000000000000000000000000001"),
                uint256_t(
                    "0x0000000000000000000000000000000000000000000000000000000000000002")), // precomputed_first_row
            Commitment(
                uint256_t("0x00d3b534945cae272828a9621e350a4f42efe4258f3432b2ba7a535a6f8bd68f"),
                uint256_t(
                    "0x07924546f2d14918d809f440d770e88525d4787c828e1efcb6154e1c2b257da9")), // precomputed_instr_size
            Commitment(
                uint256_t("0x11b710f896157a9557278a1f776cd6c7e1e7e256a572bd080797daaf1d6307d1"),
                uint256_t(
                    "0x12c5149d3cc7dfd6e418eb5c6b4f5123a537e7b62a23f6d929f55af7b5d048cb")), // precomputed_invalid_envvar_enum
            Commitment(
                uint256_t("0x0000000000000000000000000000000000000000000000000000000000000001"),
                uint256_t(
                    "0x0000000000000000000000000000000000000000000000000000000000000002")), // precomputed_is_address
            Commitment(
                uint256_t("0x2d360628289ff943ff6bd1a87bbe4e62abe7fb61ba83effd266f22bdcf31e6f9"),
                uint256_t(
                    "0x26b92a79e563c3f48252cce7feeca2f0f8d33dcb4ef7b0643bf07bd405700aaa")), // precomputed_is_class_id
            Commitment(
                uint256_t("0x1bd6129f9646aa21af0d77e7b1cc9794e611b5d59a27773f744710b476fbd30f"),
                uint256_t(
                    "0x2f8d492d76a22b6834f0b88e2d4096139a9d1593d56e65e710b2f344756b721e")), // precomputed_is_cleanup
            Commitment(
                uint256_t("0x0e84090add56f2500ab518c655cae63896ea793e6b3f6a14218d476534109610"),
                uint256_t(
                    "0x2b78a584bd6ae88cf4ec7c65c90e0b65df446fdddba972f3c4414ad3c901f4f9")), // precomputed_is_collect_fee
            Commitment(
                uint256_t("0x1bd6129f9646aa21af0d77e7b1cc9794e611b5d59a27773f744710b476fbd30f"),
                uint256_t(
                    "0x2f8d492d76a22b6834f0b88e2d4096139a9d1593d56e65e710b2f344756b721e")), // precomputed_is_dagasleft
            Commitment(
                uint256_t("0x0000000000000000000000000000000000000000000000000000000000000001"),
                uint256_t(
                    "0x0000000000000000000000000000000000000000000000000000000000000002")), // precomputed_is_deployer
            Commitment(
                uint256_t("0x020ad6e43ccd48a6a39e43897cc85187bd364919be8a3b82d4809715cfe489db"),
                uint256_t(
                    "0x21a79ebae2ea3d92b49c521407d2600ac061146f2c188c6c6a33c598179e4543")), // precomputed_is_init_hash
            Commitment(
                uint256_t("0x0e84090add56f2500ab518c655cae63896ea793e6b3f6a14218d476534109610"),
                uint256_t(
                    "0x2b78a584bd6ae88cf4ec7c65c90e0b65df446fdddba972f3c4414ad3c901f4f9")), // precomputed_is_isstaticcall
            Commitment(
                uint256_t("0x1618ea679c4ee1467267e50bb898148ef78d5de08341b5afdc0c863a59ab7e70"),
                uint256_t(
                    "0x23268ad7678b97fba97cc3e75da6cff9a3659c3b8a49046cce4062820e5c1116")), // precomputed_is_l2gasleft
            Commitment(
                uint256_t("0x1449c845957e866c1918655add72528e4d5cb4cd366c5994227c4b99e5597a0e"),
                uint256_t(
                    "0x2095bf274ca2bea7fd16b154484700c973174daac258c4de31e47a562396a824")), // precomputed_is_public_call_request
            Commitment(
                uint256_t("0x1f604e77b958511e81c83b4d7c0f0b6d5df70c4495c22633ea71d2f2de3dc889"),
                uint256_t(
                    "0x188df8394af710199aa231aca038f80faaee28456105f5bfcf8307dbf526950c")), // precomputed_is_revertible
            Commitment(
                uint256_t("0x2d360628289ff943ff6bd1a87bbe4e62abe7fb61ba83effd266f22bdcf31e6f9"),
                uint256_t(
                    "0x26b92a79e563c3f48252cce7feeca2f0f8d33dcb4ef7b0643bf07bd405700aaa")), // precomputed_is_sender
            Commitment(
                uint256_t("0x2c4e3788efe883d91b423233818890599ad233cecf88be80debce9e5ac727e29"),
                uint256_t(
                    "0x0d79fb9abbbde1fdb4c53d148cfcf083e84f3153e6817f5a19f0560e831dda8f")), // precomputed_is_teardown
            Commitment(
                uint256_t("0x020ad6e43ccd48a6a39e43897cc85187bd364919be8a3b82d4809715cfe489db"),
                uint256_t(
                    "0x21a79ebae2ea3d92b49c521407d2600ac061146f2c188c6c6a33c598179e4543")), // precomputed_is_transactionfee
            Commitment(
                uint256_t("0x1618ea679c4ee1467267e50bb898148ef78d5de08341b5afdc0c863a59ab7e70"),
                uint256_t(
                    "0x23268ad7678b97fba97cc3e75da6cff9a3659c3b8a49046cce4062820e5c1116")), // precomputed_is_tree_padding
            Commitment(
                uint256_t("0x210cdba7d0dae8d84cdd77a912060188657a0628905c0531fa63138ec3cbc9ea"),
                uint256_t(
                    "0x264f0d3eab260e5a20bdc5324e1ddcb3a0c0d811bb4a23b983417fd8c280486a")), // precomputed_is_valid_member_enum
            Commitment(
                uint256_t("0x057e5478fbad129bb84bfb618f6e7a747812510b4f6f70bd84d4688f760ecb62"),
                uint256_t(
                    "0x0b58fc6f3ddf7f2102d3887500236eac683dbfa7a2aedccff632442c57268b37")), // precomputed_keccak_round_constant
            Commitment(
                uint256_t("0x262ae25ad030a2c9015433161c3442e4ac80d1cc89c6458116af6868f2dd6aa9"),
                uint256_t(
                    "0x198bbca7d643a07fdbd486f4a2e9fe51eaff73597bc3035c94070558da7ad139")), // precomputed_next_phase_on_revert
            Commitment(
                uint256_t("0x051899227510844c5380f4f7b829658ba5132d444b6aa62fe8667d64e7bca1ad"),
                uint256_t(
                    "0x294c89a6093692ffc964583003b3dadd7733f4c54b9e36038b7ec52c5b9db889")), // precomputed_opcode_out_of_range
            Commitment(
                uint256_t("0x1d317a7a8b818e73f8b663856245535942d4fb8bc0da358fb3123ff315843c55"),
                uint256_t("0x1ffd7547b3b9efe7807b4f53ab2c1b5058bd33cc5b8d21fd9625e7ab9e2dcaf3")), // precomputed_out_tag
            Commitment(
                uint256_t("0x2e71d4c9940d15c480d4a4a19d87d85edf451467b8440366c092a6cff30be9f3"),
                uint256_t(
                    "0x22ea9c920f03a29f3072574323acba39c7189244912ee46d13ea019e7d19036a")), // precomputed_p_decomposition_limb
            Commitment(
                uint256_t("0x09ea5407dba0e7ded40cb1fe7edf67129bf13cbea25e1ca76de711200bef8a98"),
                uint256_t(
                    "0x12d748597b71a36836070aa309373985d130cb13575852442ef92936dca6b813")), // precomputed_p_decomposition_limb_index
            Commitment(
                uint256_t("0x03ef15f58038e5f85bae3faef9d61cc64bc3429551099fe59570e6c8f503ccea"),
                uint256_t(
                    "0x1ad63fa86ad47d1585b77dc775719dea35b6836b830a5fc5a5fcf5e77e7030f3")), // precomputed_p_decomposition_radix
            Commitment(
                uint256_t("0x2aaa723f062908d51d9e95fec400bb10babb904108ebe564d6d10b0c0a4ac7eb"),
                uint256_t(
                    "0x0e7f6f70a1ad8d463f67bfd94c5906191ced0f735a0dd2db3612c774e63c81df")), // precomputed_power_of_2
            Commitment(
                uint256_t("0x0e7b889e3e3d0989738bebaf65ce200a3c9f53f8572120ef7a4d16cf368c1782"),
                uint256_t(
                    "0x25d9171406ea22f5f89ce6a2d1b313d8a5e45637f11c71765deeda623f4de1d3")), // precomputed_read_pi_length_offset
            Commitment(
                uint256_t("0x0f503028576d5222e2cb2bfe1bcf108387994d271fcd00ea3e2c57d8d75341c7"),
                uint256_t(
                    "0x2c6b247f1c6c17498724bcd962ec07a9455e776e62bb14890c9cfb75557153a0")), // precomputed_read_pi_start_offset
            Commitment(
                uint256_t("0x2e7cf27c49223cad8ed651445f746efe88f441a495bf2a3e5560d68327d19a14"),
                uint256_t(
                    "0x0c76ef320d793294cfbf1519c7a124b640859b99d43d051dc828f0053081a4f0")), // precomputed_rw_reg_0_
            Commitment(
                uint256_t("0x23d96c05f4bc75a456d34d051f876ef99ad7b22c4e21908b13b9f576a9d4c620"),
                uint256_t(
                    "0x008b8cb54710e5387557d73f2122ddd02a393ced7c57987776b55d6292964d89")), // precomputed_rw_reg_1_
            Commitment(
                uint256_t("0x039eae92cc21bf3c73b8406d17e8a06154a76ea489dfa0fb6049b9750a40b388"),
                uint256_t(
                    "0x1e2e477b3a65fc69df47516f7d306b81d3205d1e1983aadafe99f6aea755d944")), // precomputed_rw_reg_2_
            Commitment::infinity(),                                                         // precomputed_rw_reg_3_
            Commitment::infinity(),                                                         // precomputed_rw_reg_4_
            Commitment::infinity(),                                                         // precomputed_rw_reg_5_
            Commitment(
                uint256_t("0x0752e216f6398f2dc16b86cd762f9bd9f961964f9c6a354530c45b04920f06ab"),
                uint256_t(
                    "0x062522db0dc283ad1d328147904f0fdc0e44add870aa0b099cf16c3d73352a9e")), // precomputed_sel_addressing_gas
            Commitment(
                uint256_t("0x090adcd60a3b21f21d8a5430363dcf910d557ca60f9083701018fb7f017720a4"),
                uint256_t(
                    "0x023511f630aa2ee36aaab2771634259abce3b2e3cea9bf5ff958f81a5c3b23f1")), // precomputed_sel_bitwise
            Commitment(
                uint256_t("0x2059be69211e5ea9bb365ab69c1132eb7b7c6814925453953f62bf731e5e42f9"),
                uint256_t(
                    "0x00a0c3ab39b3041e7996f98bb8065ff6d0ddcf70403dff0f8f3cf91da4ca69ce")), // precomputed_sel_envvar_pi_lookup_col0
            Commitment(
                uint256_t("0x2c066d46d386975a57df073e19403bd8019ded441b9e454eb4045069cefee487"),
                uint256_t(
                    "0x1bbf8b9e8c4b2184984b994c744d216bf779063abc501d4102fbfc99d4227c16")), // precomputed_sel_envvar_pi_lookup_col1
            Commitment(
                uint256_t("0x0a488841f66021e37cea1982d222861509084368088cca07894cd6921311ba91"),
                uint256_t(
                    "0x120c46c4092f97c787b9630d90ba43ddf7fbdeae205366e21e67d596095c4c2a")), // precomputed_sel_exec_spec
            Commitment(
                uint256_t("0x1fc3ae437a3b0b01a4af2a06343c9f9dcd6893573e887e0b3d6a54fa49d1e77e"),
                uint256_t(
                    "0x25c3660d4f0195f08cc66d4e4adab16edc664789a8d2b25811d3d1be836c263e")), // precomputed_sel_has_tag
            Commitment(
                uint256_t("0x1b46eba5303aaa250d24e50dc9ec58ba83fdf393701ede56a8f515333edd5b93"),
                uint256_t(
                    "0x2530ee60cb7dd489c0e4376d87845b01133d0ec1c0c3e0aef8ff03199b7032e8")), // precomputed_sel_keccak
            Commitment(
                uint256_t("0x0f3729cae0def7758dd359a313b2719ec454383750a7559c4ec869615e926ab6"),
                uint256_t(
                    "0x191fc6f9dcdb51265271f35a65c7ddefae84e6b2df9434e51216c0d9ac551da4")), // precomputed_sel_mem_op_reg_0_
            Commitment(
                uint256_t("0x1f579c47cbed9e59bc75bfa9faea264e1f8d13bf8fdb2bc241796a6ee1322e7f"),
                uint256_t(
                    "0x04a79156fabb49e693ddcf07815f53d163489149958311b79a4fcfd2703bf3fd")), // precomputed_sel_mem_op_reg_1_
            Commitment(
                uint256_t("0x252ca1bf6e5e141f715b94f7c186675aed430fe49c8ec06e46160e41c9086c97"),
                uint256_t(
                    "0x29d3d381d379ce261c1e66817822d796c6e605c276bf1f5993715ee56a5c7b82")), // precomputed_sel_mem_op_reg_2_
            Commitment(
                uint256_t("0x1530ccb47d1198320c163380a82ca8cbaf87b2d40ede856d21c60535e2251262"),
                uint256_t(
                    "0x29dd7ccea05e6d47a7373ea950a7988caed0d20880612e046af575217a21652a")), // precomputed_sel_mem_op_reg_3_
            Commitment(
                uint256_t("0x11b316123744c8602e394b9a558ed664a70d8a7e8f5a3138c9971302c193dd84"),
                uint256_t(
                    "0x08a817c8ab332c7f8b478ec9bddb41a8ca1593c3b8fb85d6236d3eecc2df3b37")), // precomputed_sel_mem_op_reg_4_
            Commitment(
                uint256_t("0x11b316123744c8602e394b9a558ed664a70d8a7e8f5a3138c9971302c193dd84"),
                uint256_t(
                    "0x08a817c8ab332c7f8b478ec9bddb41a8ca1593c3b8fb85d6236d3eecc2df3b37")), // precomputed_sel_mem_op_reg_5_
            Commitment(
                uint256_t("0x089cdab4e8e8381977b093cb267a1b7c8c60f4466c39a99af1247e37fe56ebfe"),
                uint256_t(
                    "0x1144347d2bfe5c1f4a6d44418562facb9a5c9c7bf2b6b463424e8b0915254710")), // precomputed_sel_mem_tag_out_of_range
            Commitment(
                uint256_t("0x020ad6e43ccd48a6a39e43897cc85187bd364919be8a3b82d4809715cfe489db"),
                uint256_t(
                    "0x21a79ebae2ea3d92b49c521407d2600ac061146f2c188c6c6a33c598179e4543")), // precomputed_sel_non_revertible_append_l2_l1_msg
            Commitment(
                uint256_t("0x2d360628289ff943ff6bd1a87bbe4e62abe7fb61ba83effd266f22bdcf31e6f9"),
                uint256_t(
                    "0x26b92a79e563c3f48252cce7feeca2f0f8d33dcb4ef7b0643bf07bd405700aaa")), // precomputed_sel_non_revertible_append_note_hash
            Commitment(
                uint256_t("0x0000000000000000000000000000000000000000000000000000000000000001"),
                uint256_t(
                    "0x0000000000000000000000000000000000000000000000000000000000000002")), // precomputed_sel_non_revertible_append_nullifier
            Commitment(
                uint256_t("0x0bf1970c2e92fee577ba15d063fa78fdd17752cafd19261ff0f176a1d3348769"),
                uint256_t(
                    "0x21f1906edf2fe01e804774aa539abe8411cfda1731be99853f90253ed2652868")), // precomputed_sel_op_dc_0
            Commitment(
                uint256_t("0x2ad6f77a7f7c14780d95de8bd1f5b2146fe71fb1b7e6d55016734664f10d653b"),
                uint256_t(
                    "0x131ac1fc680fbc2584b74e5aece1f0d50afe030adf4289613e54935339829496")), // precomputed_sel_op_dc_1
            Commitment(
                uint256_t("0x225d208d9012b15a17b7dac26e737c0d2f9c8bf80de627bd13e1a9c042ede642"),
                uint256_t(
                    "0x25e222231924d6d509af40b4eefdb801be27b2dc85dced6774ecd5c568e7adc3")), // precomputed_sel_op_dc_10
            Commitment(
                uint256_t("0x2208697b1fb2af79c1fa6ce554118d48ea6cc700bebe3d13ca5e55ea4236e5b5"),
                uint256_t(
                    "0x013755e618e12263ae341a18aab3460dcd8fb28564570c7f955697e997f5bdc4")), // precomputed_sel_op_dc_11
            Commitment(
                uint256_t("0x1e0b4d8d583dbf99076c3d2913531d0f70da58b26d7bf3f5dab93e616d1bf1e4"),
                uint256_t(
                    "0x2291f76ff29ec8693af21347039cefd25e880454db8ea8d7e93ffbe7e06b2323")), // precomputed_sel_op_dc_12
            Commitment(
                uint256_t("0x290f2ceb7f9583d8ae4e91b9285e74a7747011843097bfec3cc4350d7076bbe6"),
                uint256_t(
                    "0x2a5c3e4b56b8fb209eba525fca6f00baf8f4374d9a184b3d03996305d37d8a9b")), // precomputed_sel_op_dc_13
            Commitment(
                uint256_t("0x09a2c0f7774a49fb5c7d08eeadd655a06f13f349b607f85cb7d9f18ac46f996c"),
                uint256_t(
                    "0x045a4d77597b78898859b98f709312fc43313bfa34f656fa3d036eb55cf33f21")), // precomputed_sel_op_dc_14
            Commitment(
                uint256_t("0x1063dc25284b4970530a339cb60ca497a52be8ba15e464b2170302c84e2e7ebd"),
                uint256_t(
                    "0x0503276c10a251edf84b95573d51e1367851ccee4aaca2aecd6f8ef612b27453")), // precomputed_sel_op_dc_15
            Commitment(
                uint256_t("0x1a81d9ac52aa2a7fde7ee8b78f3606a35a8758e8de801673cea21e9a03b7ff4a"),
                uint256_t(
                    "0x1d22d13122365e7ce6b1015f81eb2ba0e7fc566a64737406aeeabe279ece22ba")), // precomputed_sel_op_dc_16
            Commitment::infinity(),                                                         // precomputed_sel_op_dc_17
            Commitment(
                uint256_t("0x1081a61f4edf2b68d9184bf3b60e78bab17e61612bc8c29c5a3198c39271284f"),
                uint256_t(
                    "0x0ce24b4a52226bd9fccfd584ab1ac615dff0dee0ed3d3e51f397db2f3f411cb7")), // precomputed_sel_op_dc_2
            Commitment(
                uint256_t("0x24e9cfce03cc25465ca6a1acd4f916e30e986ed3af63754f5a61294f55071a02"),
                uint256_t(
                    "0x07aa17a6a67bcafb019d4adc0192a41f801563508f1ba7c64cd056731e2a7e01")), // precomputed_sel_op_dc_3
            Commitment(
                uint256_t("0x074d234606a4d5bb93e0b2ad331eb61bdeaf87a7813bcc2b06494251154d9fb8"),
                uint256_t(
                    "0x13e4734b603d75d2e71ba58a0fcf7532b2007296d22365242432bd708f5ed76a")), // precomputed_sel_op_dc_4
            Commitment(
                uint256_t("0x0ddf9e9dd8363fd4119ac1d79553829192ac465e7ee6656f099e40e5a8b709b0"),
                uint256_t(
                    "0x00196d43a3f837ea29755efb3d0582c1ef702dd495b8bf5f29a26c9bc395f3c9")), // precomputed_sel_op_dc_5
            Commitment(
                uint256_t("0x1cfb0a4d316144588ae992066b52b718403b3144a9ec49ea66ae45d6697fa1a0"),
                uint256_t(
                    "0x1f8edf29518d905174ef85dfb0072c777b1c710b64e9c74086804584c0c8484d")), // precomputed_sel_op_dc_6
            Commitment(
                uint256_t("0x05080b6c3232b890bbcabdb5a827168a1ad3b2f7408301e6090d07d09bb76b91"),
                uint256_t(
                    "0x2a0a71fb6431159e3d618cd73b3397d71a3edc2bc3414e05f64182297bb3bdfa")), // precomputed_sel_op_dc_7
            Commitment(
                uint256_t("0x2ff30ab94cefa0c5789be2f10a8a1bd318c4da2b35a0b877c11d1fb8fbd7ca7f"),
                uint256_t(
                    "0x22ad6d508142f1a80e6b1db087879f51ac57e9977eb2960eb391b0c1f246b103")), // precomputed_sel_op_dc_8
            Commitment(
                uint256_t("0x11b316123744c8602e394b9a558ed664a70d8a7e8f5a3138c9971302c193dd84"),
                uint256_t(
                    "0x08a817c8ab332c7f8b478ec9bddb41a8ca1593c3b8fb85d6236d3eecc2df3b37")), // precomputed_sel_op_dc_9
            Commitment(
                uint256_t("0x1c850ea0df76c329d78ab653fdbe442ead01edc3b9cdf549f92fd4fea3d6bdf2"),
                uint256_t(
                    "0x2a8bf9b3aac7240652dbc5264c42b21bcf636e041eb9cd4e766bb22db068bcd9")), // precomputed_sel_op_is_address_0_
            Commitment(
                uint256_t("0x0585cbddf88636682471678c5259f4aef1e11af956268de802d9d98a25e12643"),
                uint256_t(
                    "0x1945936772c40110b3ba7682c358ec4772d42e9b6152a4f8706fda2c4bbe85ff")), // precomputed_sel_op_is_address_1_
            Commitment(
                uint256_t("0x06ea2e61015bf705c8e4f76bcccf8549ff3c66d1aaaaba0eefa491c2629922b2"),
                uint256_t(
                    "0x08381a2b896ad123189cf793ad2a205484c9c269572b8041261b60a358e8eee3")), // precomputed_sel_op_is_address_2_
            Commitment(
                uint256_t("0x3052e46c51289f5e76d606f7b57dd4f535602a065abdb0c6e9d02355ea1a31aa"),
                uint256_t(
                    "0x01dc9b87e73622b263d930b3df1d82f8f95c985f939a3a5a8c75083849f10911")), // precomputed_sel_op_is_address_3_
            Commitment(
                uint256_t("0x1530ccb47d1198320c163380a82ca8cbaf87b2d40ede856d21c60535e2251262"),
                uint256_t(
                    "0x29dd7ccea05e6d47a7373ea950a7988caed0d20880612e046af575217a21652a")), // precomputed_sel_op_is_address_4_
            Commitment(
                uint256_t("0x11b316123744c8602e394b9a558ed664a70d8a7e8f5a3138c9971302c193dd84"),
                uint256_t(
                    "0x08a817c8ab332c7f8b478ec9bddb41a8ca1593c3b8fb85d6236d3eecc2df3b37")), // precomputed_sel_op_is_address_5_
            Commitment(
                uint256_t("0x11b316123744c8602e394b9a558ed664a70d8a7e8f5a3138c9971302c193dd84"),
                uint256_t(
                    "0x08a817c8ab332c7f8b478ec9bddb41a8ca1593c3b8fb85d6236d3eecc2df3b37")), // precomputed_sel_op_is_address_6_
            Commitment(
                uint256_t("0x1525ae740393f8dec3a1ea8f39f456861afece20561b5870db4291410d2f3429"),
                uint256_t(
                    "0x06dd8a3d3910bf6e98a49d6145afadecf9e2a5eb95c6e8dd0ebd06655ec07a84")), // precomputed_sel_p_decomposition
            Commitment(
                uint256_t("0x0f340b87fe418eac3aae7d33bc2f17b83821ce35f1297073c5707df1de1c0034"),
                uint256_t(
                    "0x096c152f04c54ea0da36542b16f76be5754cddd9a0a5456311f2c64b2496f32e")), // precomputed_sel_phase
            Commitment(
                uint256_t("0x0752e216f6398f2dc16b86cd762f9bd9f961964f9c6a354530c45b04920f06ab"),
                uint256_t(
                    "0x062522db0dc283ad1d328147904f0fdc0e44add870aa0b099cf16c3d73352a9e")), // precomputed_sel_range_16
            Commitment(
                uint256_t("0x2e51e57417ece86800e7afa2ac53cfffcf35343cfb4bad1f6016a5b657fc3bfe"),
                uint256_t(
                    "0x2c8617a36d1bbb5e7bf06c192e8ffc9aa90c714d222f8c8c29ed6a8a7e5eb717")), // precomputed_sel_range_8
            Commitment(
                uint256_t("0x262d212add82bcbcf96d0773c59926e1b8e68e45c662f9348f2e4f64770595b3"),
                uint256_t(
                    "0x2fe4de705da2b7bfb03cb3baa199ed4cc97e6ce620d0e939b603493223e88703")), // precomputed_sel_revertible_append_l2_l1_msg
            Commitment(
                uint256_t("0x041008987db8f55ded689b589133da9860150ed8c97b6bb5e87f0a31f78582b8"),
                uint256_t(
                    "0x113ecb4f4d07b4efb19a22b59e5634d58e5f1d5a433b08a32f1ac2bdd0e7c01a")), // precomputed_sel_revertible_append_note_hash
            Commitment(
                uint256_t("0x2a56ce41f6b0be13b9c26747621b821eee81b23a887f299049b14c11e98460d6"),
                uint256_t(
                    "0x1aa98f2de3ddda547d8f6de4e725ded5827d6338c78656c0d12ca1aea6ef2c7c")), // precomputed_sel_revertible_append_nullifier
            Commitment(
                uint256_t("0x2db8d548af3efd182047c9081ce2870f3c2e7a96b4a6469aca26167209285d9b"),
                uint256_t(
                    "0x063d0df54d2aba02c2c82b4e6fe8bf2ed6223822b4602ad263892e0799b27eba")), // precomputed_sel_sha256_compression
            Commitment(
                uint256_t("0x01033193fd93132e8fb821a8c0da012671acf84949d0e29b85fb0c52695c2d10"),
                uint256_t(
                    "0x20361a4e1e73f07142325b1271d5fb172cb32252b44996dbed0264117cdb7b01")), // precomputed_sel_tag_check_reg_0_
            Commitment(
                uint256_t("0x061fc7f3ab86d2e539fa6acfa1a57c36ae3cdeb3f94f27fd4621e0b290a3e367"),
                uint256_t(
                    "0x2d6b6d6a6af0eb44678a40ac35a86dd3b2ba2529151d23589c1e65ff502dd888")), // precomputed_sel_tag_check_reg_1_
            Commitment(
                uint256_t("0x1530ccb47d1198320c163380a82ca8cbaf87b2d40ede856d21c60535e2251262"),
                uint256_t(
                    "0x29dd7ccea05e6d47a7373ea950a7988caed0d20880612e046af575217a21652a")), // precomputed_sel_tag_check_reg_2_
            Commitment(
                uint256_t("0x1530ccb47d1198320c163380a82ca8cbaf87b2d40ede856d21c60535e2251262"),
                uint256_t(
                    "0x29dd7ccea05e6d47a7373ea950a7988caed0d20880612e046af575217a21652a")), // precomputed_sel_tag_check_reg_3_
            Commitment(
                uint256_t("0x11b316123744c8602e394b9a558ed664a70d8a7e8f5a3138c9971302c193dd84"),
                uint256_t(
                    "0x08a817c8ab332c7f8b478ec9bddb41a8ca1593c3b8fb85d6236d3eecc2df3b37")), // precomputed_sel_tag_check_reg_4_
            Commitment(
                uint256_t("0x11b316123744c8602e394b9a558ed664a70d8a7e8f5a3138c9971302c193dd84"),
                uint256_t(
                    "0x08a817c8ab332c7f8b478ec9bddb41a8ca1593c3b8fb85d6236d3eecc2df3b37")), // precomputed_sel_tag_check_reg_5_
            Commitment(
                uint256_t("0x2b770f46bb0db9c1447e6010b3ca12f1dc2b2a237ff6d2390d9ddf5a056d09ad"),
                uint256_t(
                    "0x0327a1ae68d02f91aa58b4fab7a92bc665080c8e734f85073c528a474a4024f0")), // precomputed_sel_tag_is_op2
            Commitment(
                uint256_t("0x179855b0edff774f3aefb51e03b8a1a8c6fc76971b2026bfda2a9e22d306c1f1"),
                uint256_t(
                    "0x1f4f53d8c274f2019474fe304b7ec352663f08b2a128de79bdf7bc65e5db32b3")), // precomputed_sel_tag_parameters
            Commitment(
                uint256_t("0x122c377cad49f6338188909ccb858cf8304b3b00383bd44be42861a3d4158090"),
                uint256_t(
                    "0x2af6b300db680f1713472c2c931cd10ec804eb227a659b7928dbc2bc01a33791")), // precomputed_sel_to_radix_p_limb_counts
            Commitment(
                uint256_t("0x1aad75d8502dcfee5df4a491c540577ad095025f94405a19bb3c314d9b88af45"),
                uint256_t(
                    "0x09902415965a26179fea02c723fbf099f2ee80a38ba4ad0da3d401469cbe0180")), // precomputed_sha256_compression_round_constant
            Commitment(
                uint256_t("0x2ef1731ff114c76a897e80a447cca6aec1283c576b4b0a5aecdb5d89211d65a5"),
                uint256_t(
                    "0x241dc58b4f57809022eee95a0d3f8d08fb16f2c275f96c59fb4830bb04d7a6af")), // precomputed_subtrace_id
            Commitment(
                uint256_t("0x2e542025316c7ca8fa71b539a82c40af9821810550f1fbfef3ec81c26f58783f"),
                uint256_t(
                    "0x272c0391c98583bbaecb5f571caaa4b9f2005c06180ff8e012f1457137c4cc62")), // precomputed_subtrace_operation_id
            Commitment(
                uint256_t("0x10b9bc6cdaea8b22bd070b67a9cdf17ba12d38dd36c78b03dd92c1c22c691b4a"),
                uint256_t(
                    "0x08c9fe6c3507e0c9b9c5ea437a251ff6e98eb7ed166fc37bced5122a4fcc3fc2")), // precomputed_tag_byte_length
            Commitment(
                uint256_t("0x22f79aad1e22b1ec13208ec1bc21e19d2e69e8f76431ad3438e1c87e5df832de"),
                uint256_t(
                    "0x05ce47e68ff07bb26ccfa38afabbbc88d0f93b43bea5b9ba95089c8d7665591d")), // precomputed_tag_max_bits
            Commitment(
                uint256_t("0x09d7078f3bf2088b0d912aa0f683eedb9cec66398b0da3223daf2c24a4a6c398"),
                uint256_t(
                    "0x0a3d292719d396119620d944ea8d715e6bdb8a3dfd45e459cff4fadc7680363c")), // precomputed_tag_max_value
            Commitment(
                uint256_t("0x2d9bed7db9c99d2eb9262c45c87f25b4318e698b44d62d8fa2be696d8972f81b"),
                uint256_t(
                    "0x087dcd217bd498384849ec02b865b68f47e7c685438966f024afb08756b4ce41")), // precomputed_to_radix_num_limbs_for_p
            Commitment(
                uint256_t("0x2e919216e7ec35e511d02b467e47a44e0cfca5cd5a149d6afc85210e8c99647d"),
                uint256_t(
                    "0x13e54d92311f40cf609dee03568a2017a45bb91e22fc2aa30bb6473677a184b8")), // precomputed_to_radix_safe_limbs
            Commitment::infinity(),                                                         // precomputed_zero
            Commitment(
                uint256_t("0x0a7190c93191fed22f5b173384abef0cf48107d720b0c1852544d49b455483b9"),
                uint256_t("0x0a850532f260ffae28991f0fc9a8650a5080a7376c69a02eb302f91428f2d87f")) // public_inputs_sel
        };
    }
};

} // namespace bb::avm2::constraining
