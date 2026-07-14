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
    static FF vk_hash() { return FF(uint256_t("0x0addedd4b81da78acb65def08192639b3f7101dd382e758b84817c3288616d3a")); }

    static constexpr std::array<Commitment, NUM_PRECOMPUTED_ENTITIES> get_all()
    {
        return {
            Commitment(
                uint256_t("0x126582762172e3f21aee5adef53ba48db1076f66f6ab1281ec6eab0d0a7f3873"),
                uint256_t(
                    "0x1695a921e5671bc37a693d19e431ed3ab66b610102e0b3041f792cffe3644cb0")), // precomputed_addressing_gas
            Commitment(
                uint256_t("0x28e006f1c68610a97cd821df8416820bcbdb62e93a6d86bdfeecaba9f955976c"),
                uint256_t(
                    "0x10aab914652512dbf354db0e377910c772d43409e85b3fbaf69d439e89c95a80")), // precomputed_bitwise_input_a
            Commitment(
                uint256_t("0x0ab5d49ff0c4b8f33c5b25f1fb2515c505c7b0c3fe5526ecb3500e6c03768cae"),
                uint256_t(
                    "0x05a9c6d9e6458d1fcf581dfddc9b02ae9d65c396a8d07f213b17ca751b0f7ee5")), // precomputed_bitwise_input_b
            Commitment(
                uint256_t("0x17b8b5c3a60c4f40f8c23d7320b670dbdc335493bb9bd6c8301e526ef8e3af59"),
                uint256_t(
                    "0x2b425004dee4be45c207322c520876ad0ebe10280842f889b21ee426a24161e2")), // precomputed_bitwise_output_and
            Commitment(
                uint256_t("0x059ab9a83dbefa97d1292202e7c430f4ff8c1b127b14fab6fe687a42c7b9c345"),
                uint256_t(
                    "0x11be6bf3aec1b8e482a2173971a654eb678638ef03aab04c8f43ed58f0dfae7b")), // precomputed_bitwise_output_or
            Commitment(
                uint256_t("0x2025a67502a72aceee2f4b7e9d11e27281463c4788e263ca03d6e3ef665a6668"),
                uint256_t(
                    "0x0d4cd55a09c6f5b869381c0054f5c5a6912a912176ecec2d130b286984ac3b12")), // precomputed_bitwise_output_xor
            Commitment(
                uint256_t("0x0b93e4bc109d95b07bd127ba23646a0833dfb8e3e911b8564f9d933ac08a8b15"),
                uint256_t(
                    "0x02d3d60e6334bc240128dfe5e19cbf7f0963f68666181229331018e5739fadaf")), // precomputed_dyn_gas_id
            Commitment(
                uint256_t("0x2e3d6772c0dc1f547adb030a56f4334faa5820f5844fe22d304d69634622e15f"),
                uint256_t(
                    "0x0ba448b2839e88df5399de029135bb7a843df9fad37003895cf4b0e4ea824f69")), // precomputed_envvar_pi_row_idx
            Commitment(
                uint256_t("0x149eda0d6c72305cbc8c12e5db72971e08fead559aab4501bb97f20c4f2cae1f"),
                uint256_t(
                    "0x09f2eef32136799118634a108531dc248506d5f58f64885575b245865b56d48e")), // precomputed_exec_opcode
            Commitment(
                uint256_t("0x09bd44905d676585d8c7a91c8ba8fd6b1b598326cb80b95e80b4b39703c7e2c8"),
                uint256_t(
                    "0x1bec3a67476715f88745bc09b1ea57859c8fe809fae4376efab6ba773ea7f6d4")), // precomputed_exec_opcode_base_da_gas
            Commitment(
                uint256_t("0x0f5b3fee86f9815eb0be052412de7f2a4c82f678604ba9e161c4412529810057"),
                uint256_t(
                    "0x1ad065dec1d51664807b4d551d0eb8abe0b061b8380dde6d662e2df36a1f85c8")), // precomputed_exec_opcode_dynamic_da_gas
            Commitment(
                uint256_t("0x2fc6974982c88b3c85d7d2ec45d01c20999ea2f59516e06f20f611b564ed89fc"),
                uint256_t(
                    "0x20cc4e40e8484240996a59d968fbf87bb8edbfda9534c3c113e940efebaecf3e")), // precomputed_exec_opcode_dynamic_l2_gas
            Commitment(
                uint256_t("0x1fbccee2ff656d845414c1a520adde56aa3625e29b6fff377044986493023e6d"),
                uint256_t(
                    "0x05c88802d3174f1c7b3c9aa1abf4754ebdaf6409d1aaf1dfa3f551da1c10fa93")), // precomputed_exec_opcode_opcode_gas
            Commitment(
                uint256_t("0x296def9415d1c96b4d8ab91df5f59ad8522a726f98461b1ab5c4d4c5b22471a4"),
                uint256_t(
                    "0x25af891969963477ee60f67f7f592402c1720525c0b8b15a631397a9d2a0b285")), // precomputed_expected_tag_reg_0_
            Commitment(
                uint256_t("0x267d9986093f6c0ddc9362b80757412efef866dd05b38a47f7cde550c5c9bfda"),
                uint256_t(
                    "0x06ea9cd6f2a50e2156f80beebc721d11d24821fd4b723932da48d8750300fbaa")), // precomputed_expected_tag_reg_1_
            Commitment(
                uint256_t("0x034e06277dc6d6e4f2ddea6d71635693db1a2869d33b918f0f70efa0530ecaa6"),
                uint256_t(
                    "0x2d3e564f6e8885163d356daec0387132097e73dbf8e04475675b715151ce3cb9")), // precomputed_expected_tag_reg_2_
            Commitment(
                uint256_t("0x1a3c36c4933c956751e6ca5631077a9418cd0ba4ec29e965508eaf8bc1a7ffd4"),
                uint256_t(
                    "0x1203bdd1aab5bfc5f3ed6abbefc30ab303770b847d022c1c9c0f8de202a76560")), // precomputed_expected_tag_reg_3_
            Commitment(
                uint256_t("0x0000000000000000000000000000000000000000000000000000000000000001"),
                uint256_t(
                    "0x0000000000000000000000000000000000000000000000000000000000000002")), // precomputed_first_row
            Commitment(
                uint256_t("0x14567e2c3e84fc1e3e69d81f6ce5808ca9a0451964a7bbabbd9e369db7556253"),
                uint256_t("0x0378926f150c30c760965df469ae6ed609c59feecf899f2b95aff519bbf3fb3c")), // precomputed_idx
            Commitment(
                uint256_t("0x2bef1e5de8c449d3cfa4cf9ab94e8b846755023b02e94dbbba1ffb3c73da0d1d"),
                uint256_t(
                    "0x06905ac3e0ae01f14b1bc598f9ba30af7eced70893019ca78b0e55668c38f3e0")), // precomputed_instr_size
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
                uint256_t("0x210bedcbb97a2e72905c082dd087be36c29c67e85b47de07b639e28a7dd78c76"),
                uint256_t(
                    "0x18d1e431b83aa3ab2f6904bbbc452fee3472c01c0ceaf6d2fe6e37c4ff79e265")), // precomputed_is_immutables_hash
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
                uint256_t("0x00c43726f75b6fda0de22ce0e0dfab6bcc7a05ff95a96b289424c5f733670d96"),
                uint256_t(
                    "0x2f9b6e0b4e2c01968de5c32482aa7d1d0a09d7178ec93bad7858f96e64f0b48d")), // precomputed_is_valid_member_enum
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
                uint256_t("0x1514f55599854ffc9929fab5629758348be02434c30ff6fdda82f8754e05703e"),
                uint256_t(
                    "0x2cab4a1a6d88bd0b45a60416aa72c8761afe05af7f60b6ae2013d2244c7634fe")), // precomputed_rw_reg_1_
            Commitment(
                uint256_t("0x13acdb89fe8349f7339bb20baa54d50fe9e15b3d515ee14096bfc204ec144222"),
                uint256_t(
                    "0x176b78b990ea79d06072fb91fd96b2a8472376baf05016f668d2c3162d0a7984")), // precomputed_rw_reg_2_
            Commitment::infinity(),                                                         // precomputed_rw_reg_3_
            Commitment(
                uint256_t("0x095419f3dc475e499012c5d001c266643669a19173217b51fd5f2a86b3e1a8b2"),
                uint256_t(
                    "0x0f9bf4c4f62da52213998f25ab3eca754175cf4580e070f1abb251e2d8a8e64a")), // precomputed_sel_append_l2_l1_msg
            Commitment(
                uint256_t("0x2932e8961b4b905fe11c2f93092e57d7e541a9bb00aca69af2a6d213577670ea"),
                uint256_t(
                    "0x20b57b640b0186c53727c6f4724dc71b51387a34d8db51af06b1f9ad3a92d467")), // precomputed_sel_append_note_hash
            Commitment(
                uint256_t("0x1eba8da14083ce2c1b307a5493006a232c89e55fa657f9c193f5654990f06544"),
                uint256_t(
                    "0x07b64d628ee70ee71e89aaabb91abd9005096a24e8c4cd3543cbf1b9344e108f")), // precomputed_sel_append_nullifier
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
                uint256_t("0x23194ac869ec4d3bd7e286588b4c021bf60032b57dd3f136308bfd7f7f3f4f37"),
                uint256_t(
                    "0x1405fa7e3bf07c30eb87ebce030c9288e67f5897a3d38c6f21d3c035e4a55a92")), // precomputed_sel_mem_op_reg_2_
            Commitment(
                uint256_t("0x1530ccb47d1198320c163380a82ca8cbaf87b2d40ede856d21c60535e2251262"),
                uint256_t(
                    "0x29dd7ccea05e6d47a7373ea950a7988caed0d20880612e046af575217a21652a")), // precomputed_sel_mem_op_reg_3_
            Commitment(
                uint256_t("0x089cdab4e8e8381977b093cb267a1b7c8c60f4466c39a99af1247e37fe56ebfe"),
                uint256_t(
                    "0x1144347d2bfe5c1f4a6d44418562facb9a5c9c7bf2b6b463424e8b0915254710")), // precomputed_sel_mem_tag_out_of_range
            Commitment(
                uint256_t("0x0bf1970c2e92fee577ba15d063fa78fdd17752cafd19261ff0f176a1d3348769"),
                uint256_t(
                    "0x21f1906edf2fe01e804774aa539abe8411cfda1731be99853f90253ed2652868")), // precomputed_sel_op_dc_0
            Commitment(
                uint256_t("0x1081a61f4edf2b68d9184bf3b60e78bab17e61612bc8c29c5a3198c39271284f"),
                uint256_t(
                    "0x0ce24b4a52226bd9fccfd584ab1ac615dff0dee0ed3d3e51f397db2f3f411cb7")), // precomputed_sel_op_dc_1
            Commitment(
                uint256_t("0x2208697b1fb2af79c1fa6ce554118d48ea6cc700bebe3d13ca5e55ea4236e5b5"),
                uint256_t(
                    "0x013755e618e12263ae341a18aab3460dcd8fb28564570c7f955697e997f5bdc4")), // precomputed_sel_op_dc_10
            Commitment(
                uint256_t("0x1e0b4d8d583dbf99076c3d2913531d0f70da58b26d7bf3f5dab93e616d1bf1e4"),
                uint256_t(
                    "0x2291f76ff29ec8693af21347039cefd25e880454db8ea8d7e93ffbe7e06b2323")), // precomputed_sel_op_dc_11
            Commitment(
                uint256_t("0x290f2ceb7f9583d8ae4e91b9285e74a7747011843097bfec3cc4350d7076bbe6"),
                uint256_t(
                    "0x2a5c3e4b56b8fb209eba525fca6f00baf8f4374d9a184b3d03996305d37d8a9b")), // precomputed_sel_op_dc_12
            Commitment(
                uint256_t("0x09a2c0f7774a49fb5c7d08eeadd655a06f13f349b607f85cb7d9f18ac46f996c"),
                uint256_t(
                    "0x045a4d77597b78898859b98f709312fc43313bfa34f656fa3d036eb55cf33f21")), // precomputed_sel_op_dc_13
            Commitment(
                uint256_t("0x1063dc25284b4970530a339cb60ca497a52be8ba15e464b2170302c84e2e7ebd"),
                uint256_t(
                    "0x0503276c10a251edf84b95573d51e1367851ccee4aaca2aecd6f8ef612b27453")), // precomputed_sel_op_dc_14
            Commitment(
                uint256_t("0x1a81d9ac52aa2a7fde7ee8b78f3606a35a8758e8de801673cea21e9a03b7ff4a"),
                uint256_t(
                    "0x1d22d13122365e7ce6b1015f81eb2ba0e7fc566a64737406aeeabe279ece22ba")), // precomputed_sel_op_dc_15
            Commitment(
                uint256_t("0x24e9cfce03cc25465ca6a1acd4f916e30e986ed3af63754f5a61294f55071a02"),
                uint256_t(
                    "0x07aa17a6a67bcafb019d4adc0192a41f801563508f1ba7c64cd056731e2a7e01")), // precomputed_sel_op_dc_2
            Commitment(
                uint256_t("0x23b6dc02dd758474624a21ac6f25c96e0439e161a2649034e459fc1977c3bf34"),
                uint256_t(
                    "0x08aaf4df0c48942efb9dd7dd8fc440edf0a1a84a3f20bf593e66f92a1bb39e70")), // precomputed_sel_op_dc_3
            Commitment(
                uint256_t("0x0ddf9e9dd8363fd4119ac1d79553829192ac465e7ee6656f099e40e5a8b709b0"),
                uint256_t(
                    "0x00196d43a3f837ea29755efb3d0582c1ef702dd495b8bf5f29a26c9bc395f3c9")), // precomputed_sel_op_dc_4
            Commitment(
                uint256_t("0x1cfb0a4d316144588ae992066b52b718403b3144a9ec49ea66ae45d6697fa1a0"),
                uint256_t(
                    "0x1f8edf29518d905174ef85dfb0072c777b1c710b64e9c74086804584c0c8484d")), // precomputed_sel_op_dc_5
            Commitment(
                uint256_t("0x05080b6c3232b890bbcabdb5a827168a1ad3b2f7408301e6090d07d09bb76b91"),
                uint256_t(
                    "0x2a0a71fb6431159e3d618cd73b3397d71a3edc2bc3414e05f64182297bb3bdfa")), // precomputed_sel_op_dc_6
            Commitment(
                uint256_t("0x2ff30ab94cefa0c5789be2f10a8a1bd318c4da2b35a0b877c11d1fb8fbd7ca7f"),
                uint256_t(
                    "0x22ad6d508142f1a80e6b1db087879f51ac57e9977eb2960eb391b0c1f246b103")), // precomputed_sel_op_dc_7
            Commitment(
                uint256_t("0x11b316123744c8602e394b9a558ed664a70d8a7e8f5a3138c9971302c193dd84"),
                uint256_t(
                    "0x08a817c8ab332c7f8b478ec9bddb41a8ca1593c3b8fb85d6236d3eecc2df3b37")), // precomputed_sel_op_dc_8
            Commitment(
                uint256_t("0x225d208d9012b15a17b7dac26e737c0d2f9c8bf80de627bd13e1a9c042ede642"),
                uint256_t(
                    "0x25e222231924d6d509af40b4eefdb801be27b2dc85dced6774ecd5c568e7adc3")), // precomputed_sel_op_dc_9
            Commitment(
                uint256_t("0x1c850ea0df76c329d78ab653fdbe442ead01edc3b9cdf549f92fd4fea3d6bdf2"),
                uint256_t(
                    "0x2a8bf9b3aac7240652dbc5264c42b21bcf636e041eb9cd4e766bb22db068bcd9")), // precomputed_sel_op_is_address_0_
            Commitment(
                uint256_t("0x0585cbddf88636682471678c5259f4aef1e11af956268de802d9d98a25e12643"),
                uint256_t(
                    "0x1945936772c40110b3ba7682c358ec4772d42e9b6152a4f8706fda2c4bbe85ff")), // precomputed_sel_op_is_address_1_
            Commitment(
                uint256_t("0x055865fd96b5dec0940fcb6e3abeaba208c5dee83b8a2f459daca685a4bc26c1"),
                uint256_t(
                    "0x1b23b6b6412b0a5c96d195b8fbacb8d362d2fb08c49e523e2064431d2455a408")), // precomputed_sel_op_is_address_2_
            Commitment(
                uint256_t("0x3052e46c51289f5e76d606f7b57dd4f535602a065abdb0c6e9d02355ea1a31aa"),
                uint256_t(
                    "0x01dc9b87e73622b263d930b3df1d82f8f95c985f939a3a5a8c75083849f10911")), // precomputed_sel_op_is_address_3_
            Commitment(
                uint256_t("0x1530ccb47d1198320c163380a82ca8cbaf87b2d40ede856d21c60535e2251262"),
                uint256_t(
                    "0x29dd7ccea05e6d47a7373ea950a7988caed0d20880612e046af575217a21652a")), // precomputed_sel_op_is_address_4_
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
                uint256_t("0x2db8d548af3efd182047c9081ce2870f3c2e7a96b4a6469aca26167209285d9b"),
                uint256_t(
                    "0x063d0df54d2aba02c2c82b4e6fe8bf2ed6223822b4602ad263892e0799b27eba")), // precomputed_sel_sha256_compression
            Commitment(
                uint256_t("0x01033193fd93132e8fb821a8c0da012671acf84949d0e29b85fb0c52695c2d10"),
                uint256_t(
                    "0x20361a4e1e73f07142325b1271d5fb172cb32252b44996dbed0264117cdb7b01")), // precomputed_sel_tag_check_reg_0_
            Commitment(
                uint256_t("0x0e69699ba807e2b1b0c7f43462ec98fdd167798a2225036ccab37fce90d832f0"),
                uint256_t(
                    "0x22cf1b04a5ba6078f995cb38394bff539fb715f2c6e46e6e3781a51ef5945392")), // precomputed_sel_tag_check_reg_1_
            Commitment(
                uint256_t("0x1530ccb47d1198320c163380a82ca8cbaf87b2d40ede856d21c60535e2251262"),
                uint256_t(
                    "0x29dd7ccea05e6d47a7373ea950a7988caed0d20880612e046af575217a21652a")), // precomputed_sel_tag_check_reg_2_
            Commitment(
                uint256_t("0x1530ccb47d1198320c163380a82ca8cbaf87b2d40ede856d21c60535e2251262"),
                uint256_t(
                    "0x29dd7ccea05e6d47a7373ea950a7988caed0d20880612e046af575217a21652a")), // precomputed_sel_tag_check_reg_3_
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
                uint256_t("0x1626cdb458887f54faff30d3d775643a2d453922b535cea15048169925d941d7"),
                uint256_t(
                    "0x2141947d2d99d743ff20793b370f0c374343c48ee90ed8184269433d1dfb1b61")), // precomputed_subtrace_operation_id
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
