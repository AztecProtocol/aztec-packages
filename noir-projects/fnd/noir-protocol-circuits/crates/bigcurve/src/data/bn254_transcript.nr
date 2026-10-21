use crate::curve_jac::types::AffineTranscript;

use bignum::BigNum;
use bignum::BN254_Fq;

// addition transcrpt for p - 2
pub fn get_transcript() -> [AffineTranscript<BN254_Fq>; 326] {
    [
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xa10fed0e5557e9ed186911225dbdf6,
                0x3ad628e5381f4a3c3448e121024631,
                0x244b,
            ]),
            x3: BN254_Fq::from_limbs([
                0x7816a916871ca8d3c208c16d87cfd3,
                0x44e72e131a029b85045b68181585d9,
                0x0306,
            ]),
            y3: BN254_Fq::from_limbs([
                0xa6a449e3538fc7ff3ebf7a5a18a2c4,
                0x738c0e0a7c92e7845f96b2ae9c0a68,
                0x15ed,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xc00abe4b1758e322f990633ee9a75f,
                0x29358c6b59547bbabadd17120cc967,
                0x1d78,
            ]),
            x3: BN254_Fq::from_limbs([
                0x15d84715b8e679f2d355961915abf0,
                0xbf9ac56bea3ff40232bcb1b6bd1593,
                0x0769,
            ]),
            y3: BN254_Fq::from_limbs([
                0x9e63b40b9c5b57cdf1ff3dd9fe2261,
                0x99bee0489429554fdb7c8d08647531,
                0x2ab7,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x72b9f3808718fe684d12d83dc08dda,
                0xb797531bb4e285d30ad3952c471b2f,
                0x10b6,
            ]),
            x3: BN254_Fq::from_limbs([
                0xe4ded88953a39ce849a8a7fa163fa9,
                0x39df0efee0f766bc0204762b774362,
                0x17c1,
            ]),
            y3: BN254_Fq::from_limbs([
                0xaa9258e0b959273ffc5718c6d4cc7c,
                0x559bacb160664764a357af8a9fe70b,
                0x01e0,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xae9fa3f986e2d245d1e1bc343a72aa,
                0xc360d412b0fe3d20bd5db89fdee434,
                0x020d,
            ]),
            x3: BN254_Fq::from_limbs([
                0x6fc6ecb801bd76983a6b86abffe078,
                0x2b2ed3bb8d759a5325f477629386cb,
                0x1707,
            ]),
            y3: BN254_Fq::from_limbs([
                0xfe3bf05d18f41b77809f7f60d4af9e,
                0xda6cd130dd52017bb54bfa19377aad,
                0x168a,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x52f71f922c0f09669148516890a6e5,
                0x379af8205bfa93fc06e865ca7f4ac2,
                0x0b0f,
            ]),
            x3: BN254_Fq::from_limbs([
                0xc710b7e616683f194f18c43b43b869,
                0x30ea8dff1254c0fee9c0ea777d29a9,
                0x0397,
            ]),
            y3: BN254_Fq::from_limbs([
                0x6982d65b833a5a5c15bf9024b43d98,
                0x5ffcc6fc7a28c30723d6e58ce57735,
                0x073a,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x08c3cb820e33e55ecf63ae00695045,
                0xe6e9a11455b8b485c3f183820f6cf3,
                0x247b,
            ]),
            x3: BN254_Fq::from_limbs([
                0x82477fe92ac12ca8b71f80fc3d49ef,
                0x705537b009189da8808651eecdb824,
                0x2a14,
            ]),
            y3: BN254_Fq::from_limbs([
                0x618c779fd4717db6177e19ea67ec38,
                0xee7f243ea8b38e1ddf14029258877a,
                0x2df7,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xedb67a530634c48c5fc23c0b382d8c,
                0xd3fff57f27971a9f42ea5109e30d79,
                0x02f0,
            ]),
            x3: BN254_Fq::from_limbs([
                0xb8c3fdb41469e408b529e030f52f3f,
                0x6f8cc8a7a4f10f56093465679f17f8,
                0x05e8,
            ]),
            y3: BN254_Fq::from_limbs([
                0xc8738f715417dd6f020725d22bcd90,
                0xbd14bbc09767bed8e913d3ccb42b2b,
                0x2857,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x9930e15507376319c9fa848fd40dbf,
                0x389ceeaa33ec04a02ff1a9f0919d76,
                0x0943,
            ]),
            x3: BN254_Fq::from_limbs([
                0x983a336903524fb05dcd507457f63c,
                0xb121486ab9da7bf549e57d2f8a6cc1,
                0x2d96,
            ]),
            y3: BN254_Fq::from_limbs([
                0xc9b52e3eca22fae279459920daa7e3,
                0x45731979ca35dfde49a476e273a1b1,
                0x1dcb,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x307fcff0531141ec43e3ef33d0fab9,
                0x701f12dc8d16c7d9f2f501eb2b9e9f,
                0x95,
            ]),
            x3: BN254_Fq::from_limbs([
                0xb912cd90a28134e2ca4663fafaed08,
                0xa5c41febff5232bb24b86429eb30fe,
                0x1bea,
            ]),
            y3: BN254_Fq::from_limbs([
                0xb944ce229c2e2f558af34b4d690cd2,
                0x1047f664a0f24b5cdfb3f37dcf4b15,
                0x0719,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x94a4bfaf386a7b0b78680bd747a8d4,
                0x41ab4c461e1d0582c211570b9849a3,
                0x144a,
            ]),
            x3: BN254_Fq::from_limbs([
                0x35e25c24d6ec194f96c3d6b7edd9f5,
                0xef7708356e9018453eef4bffcb97e7,
                0x1d4f,
            ]),
            y3: BN254_Fq::from_limbs([
                0xc060bfaca40be9c5731cec92e1bb5b,
                0x8df67b1845bc6b4e73895280257f92,
                0x0609,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x38eb940bc3cc3c8937526389467958,
                0x0acbfe421985abfd0130b2d989f2d8,
                0x0788,
            ]),
            x3: BN254_Fq::from_limbs([
                0xa3d24972ed82498a25dd6db7a79519,
                0x79d94546a0ef854e088337382fec31,
                0x051c,
            ]),
            y3: BN254_Fq::from_limbs([
                0xeff81d66ce94376b83434d266b87e1,
                0xc5e9bdb9cf531095eefbf1ac8d18e6,
                0x2312,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x0a63ff13668b7ba593bed6512a4246,
                0x1d6bffe095f941b8a907b42b4867b7,
                0x1a2e,
            ]),
            x3: BN254_Fq::from_limbs([
                0xada831cde5812850aba2609304aa05,
                0x4ee78a1f8d825571bbddc6be175695,
                0x0a28,
            ]),
            y3: BN254_Fq::from_limbs([
                0x2ff4f9fc0cf78f8bebec4ee5e4a0e9,
                0xbb0c05c8682e7c17658f36fa39bc83,
                0x2b28,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x976f8aa43e1fe025524271cd01024b,
                0x8a6491a86954a4300b607b4b113695,
                0x047e,
            ]),
            x3: BN254_Fq::from_limbs([
                0xf1984fb91be7fb55774eef0f7db9f9,
                0x53290d6cb6b6b1b3a910d23396eee8,
                0x0f00,
            ]),
            y3: BN254_Fq::from_limbs([
                0x264f43e39f7b4e6947812a1436bf0e,
                0x48565a63a3353805763dfc67b7f27c,
                0x1b99,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xc1a1730b72d7bfd66ae44afe0c2478,
                0x13b7a14c101da33b00ae3d53a4ee73,
                0x1291,
            ]),
            x3: BN254_Fq::from_limbs([
                0x26d9e16214dd3f7dcfe7d00ae59221,
                0x4c2fae70e3da6c09240e3ef8015c21,
                0x02e0,
            ]),
            y3: BN254_Fq::from_limbs([
                0xab76f2b04d4230ce3c377ca8b0f7a6,
                0x2e97bf328c82315572bdbbab144b6b,
                0x0a98,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x81546ad20207defe3c8767ee2975b5,
                0xbe853478ab24797e261353d34b5d33,
                0x02f6,
            ]),
            x3: BN254_Fq::from_limbs([
                0x9051ad0db62e7adc7e54b2f47363d8,
                0x3b1cf22d3aaa7a222087fd1dcd9265,
                0x01fe,
            ]),
            y3: BN254_Fq::from_limbs([
                0x60df363299913dfe11703b5d21d381,
                0x61c198f692db032a9aa140c0584654,
                0x2b18,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x2748cb68970b018653782f288fe8bd,
                0xe9726ee707506f4612aeb53b6f594d,
                0x07c1,
            ]),
            x3: BN254_Fq::from_limbs([
                0xbdaae79140c1d7de1b52cd88f19cd5,
                0x6aef2cd7771b887981d6814f89225a,
                0x24ce,
            ]),
            y3: BN254_Fq::from_limbs([
                0x5537a99544607be0467af264e6c504,
                0x83864dd0d6f5a065aab612d2dd5e27,
                0x134d,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xe59ffc0d4c1b16bb8c9b9cd66487d9,
                0x0e3d6d22abf396c9a16d7e42a66a84,
                0x0ee8,
            ]),
            x3: BN254_Fq::from_limbs([
                0x6148eaec619e5f41f64471b0ed9af6,
                0x814ce523dd492293c65b151156e69a,
                0x0123,
            ]),
            y3: BN254_Fq::from_limbs([
                0x01bec29676d68f1b73a214158b0dc6,
                0xb7337d004a8c0eb13fffa3a4dff330,
                0x1761,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x2a032a6db35329c8fd4c3837ea703a,
                0x20528ccc205a47e913bfc1c0e1d4ab,
                0x264b,
            ]),
            x3: BN254_Fq::from_limbs([
                0xfdcbe40a311282994f38d12387473a,
                0x5e08d0445bd34b9873688d0775c8d6,
                0x2396,
            ]),
            y3: BN254_Fq::from_limbs([
                0xd1e9e29eee7f368c62200a90c3e8e2,
                0xbdaccca688c5115cdc74b438c29e9f,
                0x028e,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x8a86c0a26a996208744a2f90cabe5a,
                0x58320ee3cc5c9af6c9fd88d9b35fe5,
                0x0c7c,
            ]),
            x3: BN254_Fq::from_limbs([
                0x5d8d4d2b1bc8df8d94cd2ab8f02047,
                0xd8c16eb3ef2f620cd602b93cd0b2a5,
                0x15cb,
            ]),
            y3: BN254_Fq::from_limbs([
                0xb5529113b5d34b171896067bbae3d2,
                0x76154a4c8743567234b68c301b5ee1,
                0x1ec4,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x337c61a7746be2d92b3a6f558e0159,
                0x8be9df2e6e8786533ff34b6dd78118,
                0x2231,
            ]),
            x3: BN254_Fq::from_limbs([
                0x50dda8056ea474e0e6acf05b86e6fa,
                0x0a566f32a54e3104de31d1de257fc9,
                0x87,
            ]),
            y3: BN254_Fq::from_limbs([
                0x370816dab25d243e1b70e37db2733d,
                0x7040d45eef00ba76ff36a9dc05dc0c,
                0x07b0,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x12eb341145f393faa7ce5464497a18,
                0x32f2c1d8c7b1b43f30924751bbc033,
                0x0e9e,
            ]),
            x3: BN254_Fq::from_limbs([
                0xc48863f808e75e635ddaffeca345c0,
                0x4f900ba5c36254ec2b18aba333386e,
                0x1b38,
            ]),
            y3: BN254_Fq::from_limbs([
                0xf5d65d73b792821f03b19b7a90b852,
                0x0a936fc35de29f2c41f4acc7d1d604,
                0x2784,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xc2e5e5113950c8f9c325df949cc1e7,
                0xa13d6830e83799999f919234ae1cf0,
                0x3060,
            ]),
            x3: BN254_Fq::from_limbs([
                0x53232d960333a64dbcaa5d57501d0f,
                0xc9018893f41cc8a85a66eac7db7906,
                0x2bae,
            ]),
            y3: BN254_Fq::from_limbs([
                0x0f68b63cc9094b672030989f6f749f,
                0x7c6031cdb1c85589eb4b5d22bf6579,
                0x0b3a,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x48215ea26fa3962853e737510cb069,
                0x32e24bad03103f86b481b9f97b0551,
                0x037a,
            ]),
            x3: BN254_Fq::from_limbs([
                0x22daa07e5e9f8d498c507f13400ff9,
                0x14eee22f7fbff3af26f631212fba40,
                0x24be,
            ]),
            y3: BN254_Fq::from_limbs([
                0x1008286e56567b11de857130764401,
                0xb0ede959f20b1c511197b3ea39c1cc,
                0x0c84,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x2ac8ac62cd8da3657ef1a73f5f9d31,
                0x1f8158c43c792b17348f03612970a7,
                0x076b,
            ]),
            x3: BN254_Fq::from_limbs([
                0x0444413b47b6e68086c1230d501cd2,
                0xe756ea746dbb1515cd3c7c944ec30c,
                0x18fd,
            ]),
            y3: BN254_Fq::from_limbs([
                0x322ff1532ec5fa653a8f23e8c14ab3,
                0xcbc0dcdbebf6e3a3b4e544fe1a8e1a,
                0x1774,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x1e75a8da211b15192ab5f9b01d84c9,
                0xc5f985693ffa300ff6d530c6948f43,
                0x2f93,
            ]),
            x3: BN254_Fq::from_limbs([
                0x9aa5554f6dd709f0bceec91e27927e,
                0xe6636824f115c208ab66bcae32ff15,
                0x1c42,
            ]),
            y3: BN254_Fq::from_limbs([
                0x2add11d35a27ddd9a78d3532a36651,
                0x1c420ac39c091e96bf834fe634ce47,
                0x20f7,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x750c16b1cf3203f69f6e5da3d92734,
                0x6231250aa4ecbddffad9783b591cc1,
                0x2e4c,
            ]),
            x3: BN254_Fq::from_limbs([
                0xc2215f809d73ba1ae7ec98fa79defa,
                0xb17fd3ace0c38c29d31d7e4055e4cc,
                0x18c5,
            ]),
            y3: BN254_Fq::from_limbs([
                0x6f7463951779f64162bddd4ea8dab1,
                0x6be22e3bd872d26bd5b7606ce70bc2,
                0x235d,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xc65bfcd3d7de1188826b5c02fbc3e8,
                0x8723f967f8e5d91f4c6b023658b605,
                0x0364,
            ]),
            x3: BN254_Fq::from_limbs([
                0xca1c54da1a9791ef95df2f7d66dfe6,
                0x43a123025b39c974f2099cb6588d7b,
                0x268e,
            ]),
            y3: BN254_Fq::from_limbs([
                0x214a7f5a7935ad6aeb50eccb7c5f82,
                0xad56604d51d7154a0633df2e4621c3,
                0x012c,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x05f428fcbe58520e6ba8ee86957d14,
                0xf3527a59d417bdf43ceca5d18953c3,
                0x2de2,
            ]),
            x3: BN254_Fq::from_limbs([
                0x3ac4b950be918a2d408e98041c802b,
                0xbd6e719c2096dedaee50296f0e6452,
                0x12c0,
            ]),
            y3: BN254_Fq::from_limbs([
                0x26166dad9c1ecc0a084b03ddb5a163,
                0x97401c8ef002b996e4ab9ad156861d,
                0x28d6,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x8ba6e5f9d676d6b5644bb1a2bdc4d8,
                0x69fa555d42627a0b290823bc8ccae2,
                0x1065,
            ]),
            x3: BN254_Fq::from_limbs([
                0xef5024916c724dda8d393e3f9f49d1,
                0xe3cf66fb987a2dbaaf800922418b01,
                0x0834,
            ]),
            y3: BN254_Fq::from_limbs([
                0x10b7cabd887c3e358be8e84f1d413d,
                0xeb1c31a86538084c495a436eda0901,
                0x1ace,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x09d57a3f683af72588784ad1d43ceb,
                0x18247993ee69ef8f8511cad17f90,
                0x2cf7,
            ]),
            x3: BN254_Fq::from_limbs([
                0x7beced87bc50bb1cf2d09732d5ccba,
                0x05d4fbb9c6d136ca3c8da9309e23a0,
                0x27e9,
            ]),
            y3: BN254_Fq::from_limbs([
                0x5f762cd122a22db69b23ad86cd057e,
                0xdf9301de9fc534c6e0ba80a5a83a35,
                0x1ac7,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xac83f4a3a1f50e7ca79e9c09f9f543,
                0x1220f5b3bd45f762c65314319251e6,
                0x14b4,
            ]),
            x3: BN254_Fq::from_limbs([
                0xe5ca43334a038b2d3a4a149cb42af6,
                0x2762b927afcbfe4214577cf97aab65,
                0x1255,
            ]),
            y3: BN254_Fq::from_limbs([
                0x3d35834147c306fd6cc8b64400a8b0,
                0x830a111a6dadaa9c2194631bab558a,
                0x0885,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xa09176db4cfb63a6322ea307680dae,
                0x5230a8035ba58ecfcb074734c483a9,
                0x05,
            ]),
            x3: BN254_Fq::from_limbs([
                0xdd95be4dcd6de70f78a12c0874be00,
                0x3c6bc3eb8b842da402ae6a9b6fca1b,
                0x2194,
            ]),
            y3: BN254_Fq::from_limbs([
                0x66f6d60e2f8adb79519aa3fd61c0aa,
                0xc63c66aec290df18086cc69cf488b5,
                0x1c4c,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xe8ed851233bc8caeac7f26226f4eca,
                0x5fd797918457d40e5682c2cf772bb0,
                0x21da,
            ]),
            x3: BN254_Fq::from_limbs([
                0x8ef92b10b2086dc83228c8a108cfab,
                0x7404f7275abddb54ac9bcac5bbadb8,
                0x1c00,
            ]),
            y3: BN254_Fq::from_limbs([
                0xa5537a8701d8fb9eb7b0780e546ecf,
                0xaad105c2a2a58d4b08538a4b126e2f,
                0x0530,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xf01cbab1d4ee4b705a420460831db5,
                0x217c0aefbe51df12b45918f26b480a,
                0x2bee,
            ]),
            x3: BN254_Fq::from_limbs([
                0x1a0ebb7dfe993e4457e64307c56a39,
                0xca6c9079fd1050fd288bacec63706c,
                0x0e41,
            ]),
            y3: BN254_Fq::from_limbs([
                0xb7c7e14a9f0b88e9e759bbbb5b9e9c,
                0x931074af8de2f2ed8e4dda40e01da4,
                0x2e64,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x74698e969a51bc20e97d21ecabcb14,
                0x2d9c0e10d029597de0b6431230ce5d,
                0x2d66,
            ]),
            x3: BN254_Fq::from_limbs([
                0xdf6d0dfa699c86506c4407427ea381,
                0xf5d4fd168058628043d8655dd160ba,
                0x1d8d,
            ]),
            y3: BN254_Fq::from_limbs([
                0xb58a4066c275a57de26019883ead6f,
                0xef5486913938a0b70044faaf48b677,
                0x1218,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xe0b7def4d28d053604562501b102ad,
                0x20285d9192632d7b34441c726b098e,
                0x06d3,
            ]),
            x3: BN254_Fq::from_limbs([
                0x6e88bcc0ff844edb65deb46039ea24,
                0x725bac14ec36e711d13ca43d1837a3,
                0x143e,
            ]),
            y3: BN254_Fq::from_limbs([
                0x29bd5e6bb3f61276fbd501bb68aad0,
                0x7b008c61859163563dce00258fcb92,
                0x06fb,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xda9614d5158af8a111c17af6f223ef,
                0x09e7dc679e6787a29f16ee01e357e6,
                0x0695,
            ]),
            x3: BN254_Fq::from_limbs([
                0x760ffc7ba38d5b13dff90db35b7f1f,
                0x70bf9131366bfdb26cb917c7efde38,
                0x0f63,
            ]),
            y3: BN254_Fq::from_limbs([
                0x208f9bde19bde72f3ac4b7237c25d1,
                0xca26dd25e54fe26dc247b2e1a0dc35,
                0x2122,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x11c324c4819392f7dac6e016f7322d,
                0x1b7561d2fb94f21817d0d28f9d0a7c,
                0x89,
            ]),
            x3: BN254_Fq::from_limbs([
                0x319015d243462e956e253fa1fd2376,
                0x5d1e517884daef6112b733134ead21,
                0x1806,
            ]),
            y3: BN254_Fq::from_limbs([
                0xf78e94ca3ffe90a3d6b86b7ad84e10,
                0xc61b8acaac879ea62a5344972772c0,
                0x2d73,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xcc4c11f3f2c185aa0866e31768f1dc,
                0x5f084180a5c9064ebddb19418e8ac7,
                0x1c38,
            ]),
            x3: BN254_Fq::from_limbs([
                0x395b8ab64b1f9bec9d7b14d773817a,
                0xa55375d329dc838c9efb21425e3bc2,
                0x05da,
            ]),
            y3: BN254_Fq::from_limbs([
                0x09aa94ee65809749f350e96a01af66,
                0x628c181929d8b83852c3b9ba6eac96,
                0x197b,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x8727f744ddf6964e80a7a5d3a9581e,
                0x6b038bc81448273179573ef429d4e1,
                0x2d84,
            ]),
            x3: BN254_Fq::from_limbs([
                0xf7bfd829be64f760840b4b053fbcb1,
                0xc7eff01b2f97272ebdd318f29c48b2,
                0xa0,
            ]),
            y3: BN254_Fq::from_limbs([
                0xff8177ca3be1747201895f344b8a9d,
                0x224c0a11e2ce1fb91afcdfdf726e63,
                0x1486,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x34278042db9da2c6d6b78433291608,
                0x1c5dc877df31af7cc2267b15afbd59,
                0x1305,
            ]),
            x3: BN254_Fq::from_limbs([
                0x7879de1f9274890ce5b6cf5a5628af,
                0xdb9aaf18df59deddc632f74f964668,
                0x2546,
            ]),
            y3: BN254_Fq::from_limbs([
                0xa55109f8bbba5a22daa48eff698f2f,
                0x6d9c25ef6c6906ae7b9a31d3fb4f94,
                0x031d,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x5dc3ed71cc433cce31f0d595b6105c,
                0x09e1af5825f4d292795badfa9c54c7,
                0x163c,
            ]),
            x3: BN254_Fq::from_limbs([
                0xdebe06645ae21e965d5a85284c626c,
                0xf896bf71a0a8969c08696b4a80da78,
                0x2864,
            ]),
            y3: BN254_Fq::from_limbs([
                0xc3d60e2c1b29b877afa4c2a7822df7,
                0x2f0009ca90ee5fd867de45b53e3ff7,
                0x1879,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x8a7b00c2240a482081dd0f481fad74,
                0x6fd527a8fc44c2cccf67033d3abc33,
                0x105a,
            ]),
            x3: BN254_Fq::from_limbs([
                0x6366b9ad437d0ccffd45345bfedecc,
                0xd4f8a641d77c8b5d7a7e28948ae96b,
                0x27f7,
            ]),
            y3: BN254_Fq::from_limbs([
                0xce88d976e274c7abc2c563a383a7e4,
                0x18932e29fbc5498a48972c4a65cc75,
                0x176b,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xaa4ecc72e547bda4aff804676f6366,
                0x351f1d893bba8257402e31b15e4370,
                0x1fb6,
            ]),
            x3: BN254_Fq::from_limbs([
                0x2590762919d44c8b3e0759749bada2,
                0xbbd37c5489477bb4f5d578505dffce,
                0x2ab2,
            ]),
            y3: BN254_Fq::from_limbs([
                0x17fcf88aa28258b255a4a4abe82707,
                0xb15036d82b101a37b886fc2b26cbe5,
                0x1600,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xc07ec0d0e68dc5c341f912f75b3fec,
                0x96fc4c7a015a376f67aceb0c07cbb0,
                0x2953,
            ]),
            x3: BN254_Fq::from_limbs([
                0x3b1037ccefb52d28762b6cdb259733,
                0xc284c314750c4b2d92b342b033b4b1,
                0x3051,
            ]),
            y3: BN254_Fq::from_limbs([
                0x300a5a929840d2f11d45c51ca4a45c,
                0x542890fcd188a190dbf81fb4426eec,
                0x1686,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x5c758c109ccb4dd381f4d094ae3aaa,
                0x8c2021a7373d0a71ffd6d6118d0dc8,
                0x1414,
            ]),
            x3: BN254_Fq::from_limbs([
                0xf3fa0040e5d36fefa662050225f75c,
                0xf059bcc99815191c662215a2462072,
                0x0b57,
            ]),
            y3: BN254_Fq::from_limbs([
                0xf8cfd4757b1fcd2b66db43a8ed693b,
                0xff5719347a61708ece388757a31947,
                0x2e4b,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x0ea8393eeb0bd456da77a3c71ebf3a,
                0x8436f534d0c8c5dce32c630c878d09,
                0x0218,
            ]),
            x3: BN254_Fq::from_limbs([
                0x02bd3233d31348e23e25cc0f9bae7b,
                0x47978e822d394bec300377beaeed5c,
                0x1559,
            ]),
            y3: BN254_Fq::from_limbs([
                0x61d0a9772ae6bbe6d6ce518c50ffef,
                0xe362fdf38339c57f2a468d291ec9ea,
                0xc9,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xfd747216854573019a3403f6505e1f,
                0x34c6a94bc79b62caa2df66c2b9cc11,
                0x1dba,
            ]),
            x3: BN254_Fq::from_limbs([
                0xd229ccf4cc33d9c7ddeeac3cc36e0a,
                0x2d31126c02c3678ba1c1f4c790b212,
                0x0fd1,
            ]),
            y3: BN254_Fq::from_limbs([
                0xb5ba08b55634263eaa4b0b4f887260,
                0xab001a17b4cb40f995de453aa616d7,
                0x138d,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x6f376646ff193f1978d1ebcafba9c3,
                0x051138d78f5ae2376a39d8d5e4875f,
                0x1e84,
            ]),
            x3: BN254_Fq::from_limbs([
                0x373bc37d3e005015334a9f9385061d,
                0xfe24afe31107512a7e35d514a39f0c,
                0x19cd,
            ]),
            y3: BN254_Fq::from_limbs([
                0x440cfd9a6f0fa058410d02fc4ff48c,
                0xd9e97225056b1e11e042a938042a61,
                0x248e,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x022903e411ec8165fa20434ff1c2d6,
                0xf481fc5658e04bc5bb04d73c46d4bf,
                0x1e8e,
            ]),
            x3: BN254_Fq::from_limbs([
                0xcadf22b41fc2418c617f57ae8fdfa0,
                0x37de48765109237a27d4d5cb2ae621,
                0x2ae7,
            ]),
            y3: BN254_Fq::from_limbs([
                0xd108c93fbd867eddd60100b6564797,
                0xc52882508d479fcb56f86002640c93,
                0x1b65,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x4a3149ae47e19b7ffb7990d4aa2915,
                0x7a9bd6ffb28048a1ae418eaeef05b1,
                0x07a0,
            ]),
            x3: BN254_Fq::from_limbs([
                0x062101f56d3fec89ac8c65f15b74c4,
                0xc4032831c17f53c1451035a4fa6d0a,
                0x0bf9,
            ]),
            y3: BN254_Fq::from_limbs([
                0x727fc396fa3d07990a10f402a38230,
                0x32dcf909ba2184b294c75dce1146fe,
                0x2385,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x846852c8fcb2e90d3d5e56b256d62b,
                0xeb76d396e0619dd19c4ff7f8a87bc8,
                0x15f2,
            ]),
            x3: BN254_Fq::from_limbs([
                0xb05740ae0ffa70119fa0d5d34688c3,
                0x815872bfe70dd44860ff52525d9108,
                0x062b,
            ]),
            y3: BN254_Fq::from_limbs([
                0x8579cb0b6b26bb945ca9c8ba60675c,
                0x99439df0f09fc8b178a58f3e4bb132,
                0x2250,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xf2c09a25142cf130bf7524a556f65b,
                0x710d04ac623e7040106bd606b93822,
                0x02cd,
            ]),
            x3: BN254_Fq::from_limbs([
                0x609ed97fad4b6db95984249abb9ba6,
                0x4c903c6dd6812cbdcdf74feb9dff38,
                0x2a48,
            ]),
            y3: BN254_Fq::from_limbs([
                0xa2e9c5a348090580cad208008f2fef,
                0xce983b991ec37086184b85fc776c36,
                0x0e13,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xd453eee14676b7c755e6a1dab644d6,
                0x665efc511e3e64a3c85be2a4200309,
                0x2f7d,
            ]),
            x3: BN254_Fq::from_limbs([
                0xcaee16afab6096278fec91ff786924,
                0xc09d04564dfe6f19fdc0f1938cf49e,
                0x0775,
            ]),
            y3: BN254_Fq::from_limbs([
                0x2bbfc2105a17e414624bc648969e48,
                0x945d2df8cade465c9ec82d9a273ad3,
                0x038d,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x7811a423df54ff5974ad7b3da5f9a9,
                0x742327e305907b57ab3e2ba5b2a790,
                0x1918,
            ]),
            x3: BN254_Fq::from_limbs([
                0x6ca603571097a6c8330cbc3df0a3a6,
                0x03b28e89261e705988c09eb9592cfa,
                0x05e9,
            ]),
            y3: BN254_Fq::from_limbs([
                0x7b2272ad9c251da17e6ec0af763cb2,
                0x91bc0bacf7f61f19e7b55d772ea0fa,
                0x2a2b,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x1d18e726c49374dab56a9e670a144e,
                0xab23325e259fd8933433b7c25e6b74,
                0x3010,
            ]),
            x3: BN254_Fq::from_limbs([
                0xc525e62d116a802fb8d38f1e343143,
                0xd6d61cd0dc5cebf289f3b956c4cb84,
                0x03c7,
            ]),
            y3: BN254_Fq::from_limbs([
                0x64db9de6828b837252bf6186f3af26,
                0xd12bb9067ae135196d846f13298898,
                0x03a2,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xa641e9fe5466258fa34495e25b93a5,
                0x5bdc1667753afcf403929de47da9bb,
                0x230b,
            ]),
            x3: BN254_Fq::from_limbs([
                0x87dec3995c7dadc469c8eb3ec9875d,
                0x6f4b80551f705cab99f471c033e7bb,
                0x0a35,
            ]),
            y3: BN254_Fq::from_limbs([
                0x5aec0621355cff3f9c7eebd2e5ef95,
                0xdd24d4062ee421bae9bbe27a297372,
                0x1019,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x35ac9e00332b0cab4e9c82428f1223,
                0xceece9daac6c7fb4f034ec56fd461d,
                0x130a,
            ]),
            x3: BN254_Fq::from_limbs([
                0xcd060dbc2651ded913cfe460674302,
                0x9aec07e2726fbed2f1eb4f76ce32a0,
                0x1a79,
            ]),
            y3: BN254_Fq::from_limbs([
                0xe093a5d532e03aad537007a255c193,
                0xc3520a71c2304d096184e7e6665146,
                0x2ec9,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xfd3fe5a68f6a9d371c17ff0f01f117,
                0x2eb937a47035e9c6dd4b41843b4057,
                0x01b8,
            ]),
            x3: BN254_Fq::from_limbs([
                0x14ff6c02d95fe846b2958c53752fee,
                0x583daa7ad224d3aa5bbf7f159afc4c,
                0x2645,
            ]),
            y3: BN254_Fq::from_limbs([
                0x6a8a43c95d90274ac773eaa18e5ff3,
                0x663587d8fe279a427090db2f30a4f7,
                0x1353,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xea73a691ee0a95c12859520490a1d7,
                0x1965c29696b75796c04a893e294aec,
                0x2f10,
            ]),
            x3: BN254_Fq::from_limbs([
                0x18f0861a3372e0bb7f45feb25e7cd7,
                0xc5b9b9a7f73d79b7c5dfa7f6b6283b,
                0x0783,
            ]),
            y3: BN254_Fq::from_limbs([
                0x2e883c3f4e21c84707ffa72b1651d6,
                0x97139d82fe688e25150fb05a3660cb,
                0x1c06,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xe6a85581fb0d49bfa070202ae528bf,
                0xc2e3bdf1cc57106a982d08a8b284cd,
                0x0cb1,
            ]),
            x3: BN254_Fq::from_limbs([
                0x4e1a1e71e92555b91dbdda5ba9ae43,
                0x5b1ae1b0b47cd0696de2d4a7908f48,
                0x1a32,
            ]),
            y3: BN254_Fq::from_limbs([
                0x0dc40d508dcb127fb3b2d546c77880,
                0x392228a1236e20616d984f5846f5c3,
                0x0b96,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xb499f21e36f7adfed16a8920a19bbb,
                0x5cdb62240e35b5689bdb8cb9d167bb,
                0x107b,
            ]),
            x3: BN254_Fq::from_limbs([
                0xb9ab23c23a8c545950eec1a2f4e98c,
                0xb9668dc888454a8e2d0e49b12587b1,
                0x27f7,
            ]),
            y3: BN254_Fq::from_limbs([
                0xf6607660cd4c234b12a717783e09e6,
                0x1a451e04d0ae0aab91ad425f2b97fe,
                0x1713,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xba71f8de612e0f9931205e4c9fc67c,
                0x0862e28f8852d4874e7f23e131e5c6,
                0x18dc,
            ]),
            x3: BN254_Fq::from_limbs([
                0x3d51a600eff3e4414e7c4337adda46,
                0xd10eae7c23c7a9bde345a9b9bdb85c,
                0x0af4,
            ]),
            y3: BN254_Fq::from_limbs([
                0xa4ea8bc6b55318dec3f911b36d4d66,
                0x48af4f293214f90a89d0e9c74194cb,
                0x1950,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x2c8158ebdb4d0ddd8edf6494a66ae9,
                0x4510932fe68ba83913ca40ebacfb8c,
                0x0508,
            ]),
            x3: BN254_Fq::from_limbs([
                0x4dc5a414d4c698b3ca30358b74d162,
                0xc3638132d33d24cc610d2543fc449e,
                0x2ce2,
            ]),
            y3: BN254_Fq::from_limbs([
                0x53913c881d26bf89906525b43615d4,
                0xc6223d045545a564af0090dc06823b,
                0x2673,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x8498ae38d219b59aef645931bf5ad0,
                0xa700070bfd57084c012aa095c749b6,
                0x028d,
            ]),
            x3: BN254_Fq::from_limbs([
                0x151562fd4bf067c77822c22940b1b6,
                0x73f348d215f7e755848174caf97268,
                0x2b7a,
            ]),
            y3: BN254_Fq::from_limbs([
                0xea1d1fb15b6d7f39b5a0c4cb910bf2,
                0x48cc2595300bd3690568d19d4f2753,
                0x04ca,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x5341825dabc9cc15650c0e2f62f369,
                0xfcb32a8be45d0b3eac640508f455d7,
                0x2644,
            ]),
            x3: BN254_Fq::from_limbs([
                0x9e6de2aca6ea899f42620951ca0d41,
                0xe6c38e9af7e5e88f9e292c3206b43e,
                0x0c12,
            ]),
            y3: BN254_Fq::from_limbs([
                0x7f7885558540c5db00deeca511798d,
                0xaa428438e546bbf88f6b4247ff8730,
                0x238e,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x34614c42b48acc042e60a37d1d0340,
                0x3c700f9f884ad22dd1a11c3acae5bf,
                0x10ef,
            ]),
            x3: BN254_Fq::from_limbs([
                0xc57c35795e53eaba776a873c837039,
                0x9c4495bd1718e11834cb7e1791dc28,
                0x2fa2,
            ]),
            y3: BN254_Fq::from_limbs([
                0x0d6908dd67ba25d207ac56f7b2b155,
                0x19ac524ed082bb61a7c1c9519ca798,
                0x0e44,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x8e1a9043f9ebda94d166bbb0fe44aa,
                0xe256fbd211cc5f0c49df0acb53be60,
                0x1c5d,
            ]),
            x3: BN254_Fq::from_limbs([
                0x467955a22db962c35895cf785d3107,
                0xe6de8607b96283c22933f1c3904571,
                0x1404,
            ]),
            y3: BN254_Fq::from_limbs([
                0xbf21a35529736f16bcfe1db1ed887f,
                0x8e9d6cc856c556a418929dfebd4440,
                0x1ac4,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x4cbd900082a391b12bc421fb957a4b,
                0x560810cd90ccfac7971ad06266017f,
                0x18ca,
            ]),
            x3: BN254_Fq::from_limbs([
                0x4446c62e3e6fcd5c7c11940cf47bfc,
                0x02bd036d4a0320f911cb29b74f35e6,
                0x2750,
            ]),
            y3: BN254_Fq::from_limbs([
                0xa84bd2c11cb960f8057880c53d7c83,
                0x66e00528090f95adc558c95be938d0,
                0x1dc0,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x03dfe2173730e2e88542705d17ae2e,
                0x05b720a385f539fbe5b3913380839b,
                0x23b9,
            ]),
            x3: BN254_Fq::from_limbs([
                0xccb0182f90821e757ac4d2914c262f,
                0xe780d4e406346f4cb8aa39a5297aaa,
                0x21b2,
            ]),
            y3: BN254_Fq::from_limbs([
                0xc44090ff7c3db2f0d70aa1b9ccf2dc,
                0x922ab3a25e2d75a52fad2d28916d26,
                0x0dcc,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xeaf1df050fbc74b28ce51416a3ab3b,
                0xd42718495c71695d003a933c8b4315,
                0xd3,
            ]),
            x3: BN254_Fq::from_limbs([
                0x26e801fbceb0798777a255e918e4d0,
                0x30eea92beb4a83e3b6724ee87fa991,
                0x0361,
            ]),
            y3: BN254_Fq::from_limbs([
                0xfcd3994769242f1bbcf7b794b4ef52,
                0xc9efb06f4d063e6206c32596951de7,
                0x05aa,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xf73d4441eb8cc56a4bfd912ffa4beb,
                0x67434e98fee16c2af8b44d1382c360,
                0x2eef,
            ]),
            x3: BN254_Fq::from_limbs([
                0xcede4ad2e2fcc8eaeb7b5a30c9dfc8,
                0xb4cbf94cca216cc76ee62364855814,
                0x1a1f,
            ]),
            y3: BN254_Fq::from_limbs([
                0x5042a29e0ec39a979e172f91b5b329,
                0x09e2f9ac12939aa5f3d9c853ed86c5,
                0x277e,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x04b4d36ff3d044aab6f6f765116016,
                0xd227a2d7132e13e86bd6c1cf1fec09,
                0x0ac1,
            ]),
            x3: BN254_Fq::from_limbs([
                0x7293644f20624c28c474c658a83b9d,
                0x59a45c6ed2119d824f7d7d01f719e5,
                0x1367,
            ]),
            y3: BN254_Fq::from_limbs([
                0x89aaa233190e7166a22e8e3daab85c,
                0x9308e6d1430b66d861aec540992ffc,
                0x1634,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xc96046b2477688965fcf4fe745a361,
                0xb8ca6455dcc3ca3fd9156038439423,
                0xce,
            ]),
            x3: BN254_Fq::from_limbs([
                0x57b10eeed9f5b4bd3e1c98a5936354,
                0xa356c66be4924c6e0a892126e2087a,
                0x19d5,
            ]),
            y3: BN254_Fq::from_limbs([
                0xb5804d660de8f89c725e50d2681688,
                0xa4cc299b84df3095df29d0529c663d,
                0x2d5f,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x41b190892cde6e8fdd5323fcb0b683,
                0x288053dc7173c47adbd891be9963f6,
                0x09e2,
            ]),
            x3: BN254_Fq::from_limbs([
                0x76cf76cab5e1d2b5ce40376bd72ad0,
                0x2f81b6293265ff8923bf622e37bd36,
                0x2648,
            ]),
            y3: BN254_Fq::from_limbs([
                0xd51076e22bdcfdb8846b665cc60d87,
                0x958ba7a330232f67a288308c932976,
                0x0c6e,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x355dfb28cfe5ea61b5777ad96f84b2,
                0x109a0a9dfd99909bf8962bdf79c5a8,
                0x1197,
            ]),
            x3: BN254_Fq::from_limbs([
                0x4d102a490a1a0135f79ffd4ada6f2b,
                0x077c6687453509dd71a9335e9ace38,
                0x303c,
            ]),
            y3: BN254_Fq::from_limbs([
                0x700d12565eaf490be1980e7fbf3ac3,
                0x9ca9f951d55c42ae4bdae5375daca5,
                0x1c39,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xa69ebca7e9af96ca0657893902f804,
                0xfecde0b14a01cd7f246819229f9934,
                0x1020,
            ]),
            x3: BN254_Fq::from_limbs([
                0x98382fdb748eecfd5e2a730735ea68,
                0x1391936abf8f86603baa39056954c3,
                0x0a7e,
            ]),
            y3: BN254_Fq::from_limbs([
                0x4198e03b12c21f2a678a5e16250eb2,
                0x9f8428625bb4004274115b8f60a31b,
                0x05d9,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xf2521d98fe53e4fd9a0e62fdf533c8,
                0xe3c14b959f88765ac64635835d19c4,
                0x05c7,
            ]),
            x3: BN254_Fq::from_limbs([
                0x507a8416d2234e55e99e63e6537b44,
                0x6f61da9396f91e1a0bcd04a8c4c75a,
                0x06ae,
            ]),
            y3: BN254_Fq::from_limbs([
                0x64562133fbf6a2af6afa11dfbf8d68,
                0xbd17fadcdcf26b16e119cc1c862e71,
                0x2dab,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xe78b094680b16199bcfc75a217eae5,
                0xe13abe83cfbf484748f3f61bc19d88,
                0x282a,
            ]),
            x3: BN254_Fq::from_limbs([
                0xb204288c2534a7688f7d166b59fba4,
                0xfbac0b32d27734d21c1fbb785da611,
                0x02df,
            ]),
            y3: BN254_Fq::from_limbs([
                0x1308025660ce89b926d9b8c8c2f606,
                0x69f8176dd61c0462d7eca8e809ee8f,
                0x275a,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xe77a37d421c8a6b39fe6f518dbd1da,
                0xb927c6fa375e8fc8e12326df35b264,
                0x0caa,
            ]),
            x3: BN254_Fq::from_limbs([
                0x93e598a694a1084533dfb4995871b1,
                0x6049eb2fcdc1f71a687134eed7bc5d,
                0x0a6e,
            ]),
            y3: BN254_Fq::from_limbs([
                0x2fefc811d54e5fe70fbce36a5781f8,
                0xe924ad851b63df8ad3924e54f1abd9,
                0x235b,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xcd7dffa6627fd51f7cc924fd431646,
                0x56c61fc239f6e29633d6f600ecb385,
                0x2b9a,
            ]),
            x3: BN254_Fq::from_limbs([
                0x02c2aba71f9ece1e037072be55e565,
                0xd07df03e2d8483bbba4af80622bb82,
                0x1c7d,
            ]),
            y3: BN254_Fq::from_limbs([
                0xe05833b93f839bd177eccad1a63e37,
                0x72a70da0b2f28b00fe47b4ea90c350,
                0x23a1,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x599f4241b04f2c16e9b29ec6d07ba8,
                0x215dc0b75acace4e3a4d26a3ff8de5,
                0x16fc,
            ]),
            x3: BN254_Fq::from_limbs([
                0x4d09ab35e836bf3dc40909b48ca7ad,
                0x54fa3411290d4bbee87882236cdf12,
                0x256d,
            ]),
            y3: BN254_Fq::from_limbs([
                0xb25eb447e19ea8ff232eb4f7df927a,
                0xf1aaed7c98012040084291d7e8de9d,
                0x0c63,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xfbf46d75e603910d30da77817f3043,
                0x16036a0794fa7ac9649a385fbdf279,
                0x1a93,
            ]),
            x3: BN254_Fq::from_limbs([
                0xebcdeb48cf42303e407eeb07fcd220,
                0xf6dd8b3a0b6322f720fb36197f8a81,
                0x2117,
            ]),
            y3: BN254_Fq::from_limbs([
                0xf77d61e7df2a6ef3a0d8d479bb444c,
                0x657e3da59e3e69b436eecab33b523a,
                0x2149,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x487c441fbe69317737f18cfbe334e5,
                0x7522000cdf97eed26a857be32c2f2d,
                0x0f4d,
            ]),
            x3: BN254_Fq::from_limbs([
                0xeaef727ebd1e885b235af4fcecf2c4,
                0x79b3372576852795f6a2f3028d8be7,
                0x0466,
            ]),
            y3: BN254_Fq::from_limbs([
                0xd648308c95648e204909fc7d0599a6,
                0x05a3fa4b291a33203d62d0ec6f8ce4,
                0x06db,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x73539c1259e83eff9ac429f47c88c9,
                0xb25bd0cc9fdc8f7c9734f843b966a1,
                0x2c47,
            ]),
            x3: BN254_Fq::from_limbs([
                0x76445283113e23f05c5d953ec8d4f1,
                0x422573d757a45fd6dc7f28ac74793c,
                0x1edc,
            ]),
            y3: BN254_Fq::from_limbs([
                0x9c6300bbb2f9910d1e2603609809da,
                0x32487d7aa178bde48a7007f2624574,
                0x025c,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xb35cb26f836809e6f10990de50eb7b,
                0xd172992d6b9e71985c88a99e4b8ef9,
                0x0111,
            ]),
            x3: BN254_Fq::from_limbs([
                0xcca7b14058e78ced1a0964ede658af,
                0x1fd53543fc988c83c7a528f8c6a1fc,
                0x205c,
            ]),
            y3: BN254_Fq::from_limbs([
                0x71b883040ec0af98cf19ac05bb65e4,
                0xc2b1dc91b075c0b9a28baf19c92f9e,
                0x251a,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xbd5ec2d489f0b7da753f3fa81f4285,
                0xf89fa9fbfad8911af924398055aec4,
                0x27a4,
            ]),
            x3: BN254_Fq::from_limbs([
                0x948c538d9c23fdc526ec992e09528f,
                0x35d71680f6c3cdcb41c04517eb6404,
                0x1466,
            ]),
            y3: BN254_Fq::from_limbs([
                0xab256666b1e2c86d54d72cec250006,
                0x0b4140e9b48588c40edd3d5ff66c70,
                0x20a9,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x150189f3bd9a46df2621e78c6c8488,
                0x5329a159b4131d3a54e366169d80ad,
                0x0ee3,
            ]),
            x3: BN254_Fq::from_limbs([
                0x35ec44c4c6ab6ea1f4faf1ad8c1c4d,
                0x118ce4c612157761ce88e93392a69d,
                0x0171,
            ]),
            y3: BN254_Fq::from_limbs([
                0x3b0b7e1f5d24e05743082e46f913a4,
                0xb294cf9c35f5c4614d84748f77ec0d,
                0x2a09,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x92b4e0be2f0e0b62a436ad9184ad0b,
                0xd10eff040e417835037d22315499a4,
                0x2d25,
            ]),
            x3: BN254_Fq::from_limbs([
                0x58c06bd642c41d87a10b4293518639,
                0xc6662833426dc0fed7c358ab03eb34,
                0x1fd1,
            ]),
            y3: BN254_Fq::from_limbs([
                0xd2375c53a5c3785e12c387fe67e2b9,
                0x5a396bcf9641dcc282a654fa7e26b7,
                0x2a48,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x07eb9e29ca5e1b9655017280287ad5,
                0xdfdae11e2e1865298aecc3be195f9d,
                0x066f,
            ]),
            x3: BN254_Fq::from_limbs([
                0xa847922d01c7063e006bb816d7ad7e,
                0x3dfb418aaa6e4cf75de6db27112939,
                0x2012,
            ]),
            y3: BN254_Fq::from_limbs([
                0x685d775aff0db12aa10fb842e7f907,
                0xae48970ae8a23abfb9ec3a8235a50e,
                0x14a1,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x9c3cd4e23372c6fe4e481a195205f3,
                0x3221fc18c0c7b25675ed47c82c1dc9,
                0x1557,
            ]),
            x3: BN254_Fq::from_limbs([
                0x9478771fc7709ce9fcda2f7982523b,
                0x27428aca3d787b123a8a75ddecbfa1,
                0x1dd2,
            ]),
            y3: BN254_Fq::from_limbs([
                0xd0d5259ac25b8e1aef0cfc1591d735,
                0x8d8c099ead7dcb37669433dd1dfe46,
                0x1492,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x33ea781da6ccdf0ff5fd022a7b3703,
                0x34273c00ca21de10eb5e991245df2a,
                0x1897,
            ]),
            x3: BN254_Fq::from_limbs([
                0x53ac90f789fc6381f6eaee77e6d938,
                0xb653cf5d34022902f767c971e9900a,
                0x2ded,
            ]),
            y3: BN254_Fq::from_limbs([
                0x5c9e633f6dab2514703fd6df185805,
                0x11d7a05b39976e70b6061b3ddbf0a5,
                0x1ad0,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x047915c7d43ffaa0aa9ce27f9bf1d9,
                0x5b77862825f6a1b1d57fecc8d33747,
                0x27b5,
            ]),
            x3: BN254_Fq::from_limbs([
                0x968819ca7c912d32d61c8fec979e4b,
                0x8dd9380956af8d6e9f9a83987ffe41,
                0x02be,
            ]),
            y3: BN254_Fq::from_limbs([
                0x485f93b7e66ed019f105c55c6d4767,
                0x66e3ddd12ae12b6d82545c0d501d36,
                0x12b3,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x14b8eccac2c426d64cc157ad928401,
                0xc898823d990f0ecf851e57d9f4150f,
                0x2e1d,
            ]),
            x3: BN254_Fq::from_limbs([
                0x20f0f1c04d1fcc561dd00ca4b15bbb,
                0x9caf7b90d8507511f6589685d1041d,
                0x16b4,
            ]),
            y3: BN254_Fq::from_limbs([
                0x9e245952db46d2c56ae6d23e8a7225,
                0x0cb6db53a806fcbbcdba3fb93293a7,
                0x0108,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xa8deed61986780d8d1c4a05ea8988c,
                0x5baed087fb4f142456177139850edf,
                0x0cae,
            ]),
            x3: BN254_Fq::from_limbs([
                0xe19c01ba1e86ecb44e40db84c13cf4,
                0x9be688ebc18c706b03fee68c17ab22,
                0x094b,
            ]),
            y3: BN254_Fq::from_limbs([
                0x3ae2f6e296426b977c5507cd187ed2,
                0x20562865c774f98f4f8de3c2e7f1f4,
                0x284d,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xb6e227d06751e14610f3f4b2d2e39b,
                0x6c0a7083885216662affe17b740012,
                0x0201,
            ]),
            x3: BN254_Fq::from_limbs([
                0xaf204b73401111307b2f2741be5add,
                0xbf51f06f604657a10bf39e0fdff85e,
                0x1d6a,
            ]),
            y3: BN254_Fq::from_limbs([
                0x7017124d41acc881f786292a469662,
                0x0279f3da8657e27b746b5deba15673,
                0x23cf,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x5d2b03d2ef7574a9a7c01cd221a03e,
                0xe75b6bf240903b1bff574107adb150,
                0x19d7,
            ]),
            x3: BN254_Fq::from_limbs([
                0xd3d0190f968e15e7aee81de30c96fc,
                0xc81fb2c40ac21ed271999610d8839c,
                0x23ff,
            ]),
            y3: BN254_Fq::from_limbs([
                0xd5bf21a70df5fc92491b2f8a5b2f14,
                0xfa75c4f66885bdd259dc0ddd3de3e8,
                0x2512,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x7a7c9a982d56d46a5134cbc8093cf5,
                0xf53a0c819bd8ac96c4bc1bc99572fa,
                0x12d8,
            ]),
            x3: BN254_Fq::from_limbs([
                0x2dd51b74a9db9cd3021e0298ceafec,
                0x8b6a6544ee4317a5437620a18d5b4b,
                0x0b52,
            ]),
            y3: BN254_Fq::from_limbs([
                0x06af43dae39a93b46957ded2bd95d9,
                0xa80ca98a778e169e2c4939a21595f4,
                0x05ac,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xb7bf09ee3a576dde98b63c4c0ad52a,
                0x703b12e84d7c423ce4f55c5396a16c,
                0x11a3,
            ]),
            x3: BN254_Fq::from_limbs([
                0xe3337a40b997120bae10265f1f1c46,
                0xddf8e4e50f63348eae9e3380e3c62b,
                0x0ce1,
            ]),
            y3: BN254_Fq::from_limbs([
                0xf29edd94a79a0a458422a0e94c20bf,
                0x3ce6ad66cc08ba8ec2b7e311630e5b,
                0x2202,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x7b91fe37f5248fd68fb19358ef4ee0,
                0xbf5fa1cd32d02a8be825212770b58a,
                0x0155,
            ]),
            x3: BN254_Fq::from_limbs([
                0x55c596a8b86436601ff6faccd290b3,
                0xc1d1bdfa953ca7f90a29f2bdca28a7,
                0x1041,
            ]),
            y3: BN254_Fq::from_limbs([
                0x6ae036b8dbc71a3b990c383febc55c,
                0x2c707df096ffa4034b817b750ba4dc,
                0x1879,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x45a2ef255b60f5b66f762436e0e6c5,
                0x8df62e32aa0d3320f5a61b84c24ab2,
                0x1a7a,
            ]),
            x3: BN254_Fq::from_limbs([
                0x172bdbe62643fe2a3e09a2c3212dd8,
                0x2520d346d6eab878d10e3da22d5b39,
                0x029e,
            ]),
            y3: BN254_Fq::from_limbs([
                0x47650738e046f5c5672bc32a9bdfec,
                0x7cce9a7c49d9f38381f6f37fe3ea24,
                0x2969,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x8fcecacb1e1baf193dcea0a6f7dbd8,
                0x81ebff24453442e354fd8407805a9c,
                0x098d,
            ]),
            x3: BN254_Fq::from_limbs([
                0x742143acfe7b9477f5cdda97269aa1,
                0x71031830fa215490eb1976391a4c,
                0x2226,
            ]),
            y3: BN254_Fq::from_limbs([
                0x6a8480ddb8597ebf4438a91e339995,
                0x75d7341198ba2700eab96a6705e956,
                0x1dd9,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xda0eae1c472ccadd96906cdfd3cab2,
                0x77868420cca9734747e76fb93ec356,
                0x1a40,
            ]),
            x3: BN254_Fq::from_limbs([
                0x80fd077dc4e495ff9d10fc015385ef,
                0xee45368d407eb1b24e55339fa1dab3,
                0x1586,
            ]),
            y3: BN254_Fq::from_limbs([
                0x33c9d025de0cc57a29efe572a4c776,
                0x0f0805b0ea227e919ea9998bf16e14,
                0x252e,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x46f22aba7a65cfc54d4da82b0e1104,
                0xc2ef79d4c19bf0f92d44ca35a3e160,
                0x12d9,
            ]),
            x3: BN254_Fq::from_limbs([
                0x2376019b96853291d64fad66743501,
                0x265d4b156628a8f196e8f0130396a4,
                0x0b06,
            ]),
            y3: BN254_Fq::from_limbs([
                0x373c38439dade88f23a342e6074054,
                0x8a88616860fe584527366fd1d55dab,
                0x0fea,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xf08968bd8b798195e447ecfa9a4075,
                0x339ae8691bbcc91c293f1d46b7902c,
                0x2966,
            ]),
            x3: BN254_Fq::from_limbs([
                0x6b1360c4ce8b3f4bb2535f586e8fb7,
                0x55bc76bfcb8e226fccf48d7a3bea1f,
                0x104e,
            ]),
            y3: BN254_Fq::from_limbs([
                0x96ed6bd23105afe569c963fb9a3fea,
                0xfe60487ca980bacac6dcb83105a650,
                0x2746,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xa3bbfcbd7ba1ea4fe6d75928c7a410,
                0x3db301bb55f18d45279ac7b4e4b4db,
                0x2eba,
            ]),
            x3: BN254_Fq::from_limbs([
                0xca51a03861d792a7b4fa9209ea7796,
                0xb77c5486b2b2be23194d1911239ebb,
                0x027c,
            ]),
            y3: BN254_Fq::from_limbs([
                0x46e906408c8e7fffabfb7b894972f6,
                0x2add3db259f0353a00a5571f383e0b,
                0x21fd,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xcb72d50c8294af3e5c07bc0d812bb1,
                0x0ff8c5a50645b40f1fc07b76712a16,
                0x1c0d,
            ]),
            x3: BN254_Fq::from_limbs([
                0x9f58e31a1b72d590d836919b0274cc,
                0xcc16a8695afd30f57cceadb59b94c9,
                0x1dc8,
            ]),
            y3: BN254_Fq::from_limbs([
                0x1c0c0299a4dbb796ed1ae3d204997b,
                0x71eb9cf1572f0ff29748e325223dce,
                0x0345,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x4928ad284cd357f4ec16ebc0788490,
                0x09f370663b1e116507b1ec70b57981,
                0x2d24,
            ]),
            x3: BN254_Fq::from_limbs([
                0xf95e238f9f1d493f44f6a0d5068cb9,
                0x0f788118fb9beed3b40ff2d7bcc36c,
                0x0552,
            ]),
            y3: BN254_Fq::from_limbs([
                0xe956f0022e9ffcab438415a8334d8f,
                0xf704d52d1ca9b3f9aadfa74a3ad71c,
                0x1dcf,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xa3315fa1bbb1d19deef293c4f51085,
                0xc52e30c64d999b8ff620483aa95cb9,
                0x0834,
            ]),
            x3: BN254_Fq::from_limbs([
                0xa5ccdb686b325f7003b0ae64ccff70,
                0x83b16d1581130b56f535b39a4e6e93,
                0x104b,
            ]),
            y3: BN254_Fq::from_limbs([
                0xbbe10200deff51797596163d8ae665,
                0x61c3e35ba0a8094490952787ad72d5,
                0x18b1,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xd95c769174a74cd6bd7b378615693f,
                0x0f1ee68d40523d1cc8d38230e5b251,
                0x1f2f,
            ]),
            x3: BN254_Fq::from_limbs([
                0xf4cf84d1f1a294bb841ce3d6e13c74,
                0xd701c60a81c949da8239077600de7e,
                0x1a8a,
            ]),
            y3: BN254_Fq::from_limbs([
                0x979a83b2dbbe3a975d127eeb0656b8,
                0xb521cb1341d492abb68e153a9034ec,
                0x1a15,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x3736fa79a2f6b575677871a368b68a,
                0x93e1f403b1e800c6eed11d47ef4c7b,
                0x02b4,
            ]),
            x3: BN254_Fq::from_limbs([
                0x762190ae21aa4275875a05c785f404,
                0xf17010b52684995589c29bfd23e3e6,
                0x08bc,
            ]),
            y3: BN254_Fq::from_limbs([
                0x8c47bad3ea980a4818a74fc3feefb9,
                0x2436283e4fcbc69f26b6b9b0d7d09d,
                0x1d57,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xcd5e82ed35491e4cf59e2cf67d5dac,
                0x77e0c7f33f56d7d2cfb57ed6e200c4,
                0x2d4d,
            ]),
            x3: BN254_Fq::from_limbs([
                0x4437a10794ec0c9e0f7c4a340bbbff,
                0x1ed9c93cb100ebed51fcd856e66c34,
                0x0382,
            ]),
            y3: BN254_Fq::from_limbs([
                0x8d40c16783e2e08f1e07b284af57e8,
                0x70b21b79b3e3fdb0d8c7b31497450b,
                0x0502,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xbdcca86e2ce5d45482b042780d1e8a,
                0x4ed121937285c8fa6ede73c6002fa8,
                0x144f,
            ]),
            x3: BN254_Fq::from_limbs([
                0xcd84e2ba8a4ffff72cdeb0e8f33415,
                0x97b3b6d9f5ef53ea13b7f8ad673933,
                0x21df,
            ]),
            y3: BN254_Fq::from_limbs([
                0x911108d7219d3bf3c042a5b6fed9a9,
                0xcd242ab5b0dd203c22f0062cf80733,
                0x041b,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x32e14bf06946fd87d189170c751e70,
                0xb94258b84edc4572fb27059d77d23a,
                0x2ff8,
            ]),
            x3: BN254_Fq::from_limbs([
                0xb82c2e3f3bd0e1290f6eff332b5b51,
                0x70ff9a719838eb43d70969af0c902b,
                0x1a8c,
            ]),
            y3: BN254_Fq::from_limbs([
                0xd12a51a86b55746ceda08423462c08,
                0xb9d5317305340d7ebec01c8bf2087f,
                0x1374,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xf9e95d68d6dd6a81250989c45fb411,
                0x2f1ba7b5ba0fae28efda9db4fc46ec,
                0x1e24,
            ]),
            x3: BN254_Fq::from_limbs([
                0x2546e3beb24eb198bbfb7e638692c1,
                0x78594793b2e1904f000f36abff44d7,
                0x2fcf,
            ]),
            y3: BN254_Fq::from_limbs([
                0x17bb8165fb40d53cfc5a1652a01234,
                0xc032a342bb0092f2aa51cb8758aed9,
                0x20e0,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x7c8e8acf22ac1a2b43163845219e22,
                0xfebf635af19d9e50307f5ad75c25eb,
                0x2bb4,
            ]),
            x3: BN254_Fq::from_limbs([
                0x1986a77ba9e383d5414e0517093613,
                0x986988cb0b8ce1dccc5dfd9f75c7b7,
                0x1a09,
            ]),
            y3: BN254_Fq::from_limbs([
                0x855938d34248cf0546f724fced7ee0,
                0x63b5362786a07f1d29855c5d597421,
                0x2e3a,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x5d5a0b29810ff0fcb030a165be9eab,
                0x9ec944b83c34955f0ac76cf08445d8,
                0x13be,
            ]),
            x3: BN254_Fq::from_limbs([
                0x9211f5d9cf2c3b95a0721abc2133aa,
                0x8986a089f0b8a130b896d5bc5f8a71,
                0x16b1,
            ]),
            y3: BN254_Fq::from_limbs([
                0x6fc1b113ac764038d99a7ae27b5e98,
                0x07ec13d1eab54dd9cd2a449e29bda1,
                0x086d,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x15ac35cd70cf2b5711b26b50a301d8,
                0x5bc73b4af78b184e14860e07f08c99,
                0x17fe,
            ]),
            x3: BN254_Fq::from_limbs([
                0x658b97ed3653a43f7b11ed53023542,
                0x5f422e4f8172c443a6fdf1e00f308e,
                0x15fd,
            ]),
            y3: BN254_Fq::from_limbs([
                0x768c55f78862a2966783f98acc8bd5,
                0x0aa0b10e40dbeaf3d2c5835ddde321,
                0x10f9,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xa8519b4ef94c68547548fee04199c4,
                0xbc502172fbce98cfd729bddd98cb80,
                0x0d42,
            ]),
            x3: BN254_Fq::from_limbs([
                0xb08319ef75facb6f7cd5c7db8e7d9a,
                0x1e4bd396f9d2ed868ccad9044368a9,
                0x0630,
            ]),
            y3: BN254_Fq::from_limbs([
                0xc85583677316904e4545f5cb141b8c,
                0xa4ee17168ed884d59b73a056b9802e,
                0x09e7,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x5ffdd7d6e9662daa497b965ee899fe,
                0x308e4d0e0fae5886b175e431977ba3,
                0x2382,
            ]),
            x3: BN254_Fq::from_limbs([
                0xd09a69425278c953640f1d753f6c30,
                0xea25d3c51531a8c52cbed7d39bdbd8,
                0x20cc,
            ]),
            y3: BN254_Fq::from_limbs([
                0xab2dedd1803f397fc91137faecfc4c,
                0xdc572ffd663d77b5f3be7245864f94,
                0x1b2b,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xc0a345167d2048eeca49ea16142256,
                0x76a993f263762e7d035472470fad5a,
                0x1339,
            ]),
            x3: BN254_Fq::from_limbs([
                0x13abd912fa57a16b7984e9699c0c52,
                0x657f259ba03629cff800dd7f60a06d,
                0x25d7,
            ]),
            y3: BN254_Fq::from_limbs([
                0x38a9b2a10697aec76a7ff550146931,
                0x2bd00d0c2434a6f9ae9beba1f2c9bb,
                0x0cf6,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x9e0fbcf0b597e1a9b78635923bd3ff,
                0x092fb1968b2de7dbd14b6656e1732f,
                0x1adb,
            ]),
            x3: BN254_Fq::from_limbs([
                0xd495f8e12b3dd0fa2a30aede6e0528,
                0x4851cfb894c5f75511aaaee5f73e87,
                0x20c8,
            ]),
            y3: BN254_Fq::from_limbs([
                0x514a74a3a65b2e437ebd16c968b94c,
                0x861e2c9bb98dbdaad31991a7bb9e71,
                0x28a9,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x10abf14056d121250e798e656e6521,
                0x36012606d630dc3f039439dd32c6c4,
                0x1c81,
            ]),
            x3: BN254_Fq::from_limbs([
                0x2d321f42ccc300df96d8e808da40de,
                0xd8ff004c3cfc419073c881ae8e6ea3,
                0x2f50,
            ]),
            y3: BN254_Fq::from_limbs([
                0x2f96c133cb1ea3f938761ec4405f54,
                0x3064be233e2f7586b005a3a15ac4da,
                0x1a62,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x11e382319a2a3e30ed91bcd57dcc6b,
                0x9bced318eae7e5d59066579d163720,
                0x0c8c,
            ]),
            x3: BN254_Fq::from_limbs([
                0x74cf6beb5bc68475b355c4b3ffdb9f,
                0x9f730cb5a4e2df6308567585ca26b4,
                0x133e,
            ]),
            y3: BN254_Fq::from_limbs([
                0xa99561d1191c6f3f8ce265e6433f1c,
                0x36e27083dbbe4a6e1ee2ee7ab05589,
                0x2c11,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xaeeec96221370c4a48f0efedb6e347,
                0xa1bc42b7b29ac5f7e09fcf4a47bc53,
                0x198d,
            ]),
            x3: BN254_Fq::from_limbs([
                0x5f1cf2bd7b69a1da428b5398f9a5b7,
                0x6f0795fc90d16f1805301240c3f369,
                0x1212,
            ]),
            y3: BN254_Fq::from_limbs([
                0x73c44b534b62ffd62bbaa0c493819b,
                0xecf62f690f8fbbdd71782e03198a57,
                0x14d3,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xa7dc845fb0fee21bcac6d609e7170a,
                0x89616a4ada994e3915a7e8e20e4cc5,
                0x08f0,
            ]),
            x3: BN254_Fq::from_limbs([
                0xfb149918ac9388b1f53a002d2f8481,
                0xb4d8397e7b3105298de1350d97f633,
                0x18b9,
            ]),
            y3: BN254_Fq::from_limbs([
                0x570cbd5668431e9fd694110945ff14,
                0xa9e083d2ac61977ddcf32328b17f0d,
                0x1e28,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x587d0a1df987c1eb3d32449845a89f,
                0xa90730724a9f847ac5a42ac9b85ab4,
                0x22f2,
            ]),
            x3: BN254_Fq::from_limbs([
                0xef59f246a443fe69340942f0453f92,
                0x49e6306d8e70a65781e3351bdf89dc,
                0x079a,
            ]),
            y3: BN254_Fq::from_limbs([
                0xebe1faf329d0bcf1a8d7e6543a9a0b,
                0xecfb2a90fd0960c0db6b77649f80b7,
                0x050c,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xef21356e0ef4f4ab44a04e1836a787,
                0xe6e651529de16129341d9373cb3403,
                0x0838,
            ]),
            x3: BN254_Fq::from_limbs([
                0xde3ba425142dbec9d6a77db0b636be,
                0x6d8ebce234f16f4352aba3cd65513d,
                0x1c3a,
            ]),
            y3: BN254_Fq::from_limbs([
                0x41d3e934736957ac0ea435dfc6c5d8,
                0x5aca9333c2f201af6e37722cf9d59a,
                0x1f77,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x23d60265748791f77eb66d07ff71ec,
                0xe00bd6e742ac071204ec0eb711f877,
                0x0102,
            ]),
            x3: BN254_Fq::from_limbs([
                0x745e449fe696a9fd63a91578c7b77f,
                0xfed1fe0cbe2a46502979da99d27d51,
                0x28b6,
            ]),
            y3: BN254_Fq::from_limbs([
                0xb67e0d383ab9d3b38eb6198fe5f9e2,
                0xa0ea1e48a7dbec191ad18d9f219b90,
                0x00,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x882e5e95809b8fb33c38f60b726d22,
                0xd6cdd52eae1bbe1a445913e69a3a39,
                0x01ec,
            ]),
            x3: BN254_Fq::from_limbs([
                0xdc6fbd17f8b9192aa38b2360efa8e3,
                0x076a012bbe6d2c89da5d02f8bea99a,
                0x2e9a,
            ]),
            y3: BN254_Fq::from_limbs([
                0xf5b5c656e368546db6f629ad797b3f,
                0x8f147cfab54422d41c03fea34f7c31,
                0x1001,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x2d0261f9968916c3ff42c60dc5aea0,
                0xf0fcf89bb6b2239aeca069cc0da107,
                0x1752,
            ]),
            x3: BN254_Fq::from_limbs([
                0x01e9b6553757326ba80d4270a2a2ea,
                0x8c97fdb0cd09b8e384773c0a21667f,
                0x22fb,
            ]),
            y3: BN254_Fq::from_limbs([
                0x34c7eb9c364b7c7e501bc8da60fd51,
                0xff0557b421c45f32f315ec1a5ef17a,
                0x1b07,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x59f88ccdaaf4b66f6b05db82047744,
                0x24e61180071b2cfef2fd8ba857b95b,
                0x01cf,
            ]),
            x3: BN254_Fq::from_limbs([
                0x85c020b262178cff0ddd7b167a5d49,
                0x8c7dc7a107e84d1b48e199dd0825cc,
                0x2749,
            ]),
            y3: BN254_Fq::from_limbs([
                0xfa92a55377c3f291cb7fb45e523edd,
                0x58af0f843915495e10a21f68b75da8,
                0x1811,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x06e3d7973ce5fbefac5c81331d628f,
                0x81c775992d746f2fedb0d67820292f,
                0x28a8,
            ]),
            x3: BN254_Fq::from_limbs([
                0xf555d37e3d6a41d28844942d19d06c,
                0xa9eb16b8c8451f9bd81f279cdfcfd6,
                0x292c,
            ]),
            y3: BN254_Fq::from_limbs([
                0xf10cff2aca1fb5ad28d6b1b72caf3d,
                0x43148040dd011e465c2e2968684918,
                0x0c1f,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x3eda97bc6ebb7439bcb76416dcbb5e,
                0x3c37c90a22a02236354256b8aaa5ea,
                0x0b09,
            ]),
            x3: BN254_Fq::from_limbs([
                0x470bdb3cb3a4fcef4b99869b6327de,
                0x24b461101d9555bd8c802f35d67e03,
                0x1071,
            ]),
            y3: BN254_Fq::from_limbs([
                0x1c23a53cf39479c5b05e44f3e81ecf,
                0x71da3f30db328a652fd7ad7d60c93c,
                0x1fc1,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x424528c5d3099c64380f64efde96d4,
                0xc19fc8a0dd427565d065af9949662c,
                0x1101,
            ]),
            x3: BN254_Fq::from_limbs([
                0x0a82d24fe16841a376ddb468b5fac7,
                0x8cb1f1013f39f1becd5a4313267132,
                0x0a32,
            ]),
            y3: BN254_Fq::from_limbs([
                0x1804577d5d3d0516644d42699fb00a,
                0x9b0efbc53432a5506d2a94dccb4b72,
                0x07da,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x84b0b3fbfe233be6af95d213624da3,
                0x5387bc0053df64c8be5d0077ee2a84,
                0x28d4,
            ]),
            x3: BN254_Fq::from_limbs([
                0x46256475b07b7699e29328c3781ac0,
                0xfbfd80870d66dca5f825740b5e258f,
                0x17fd,
            ]),
            y3: BN254_Fq::from_limbs([
                0x42a6e35065bd661f5d61d83e8b820b,
                0x79395b4a46cce267cc8722e7bfd031,
                0x0606,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xb3517e95584df7f8eaebdcc4a15c73,
                0xc0ade3aa1d53baa88a84e7c3fce112,
                0x116a,
            ]),
            x3: BN254_Fq::from_limbs([
                0x18437facc820066d65585925fd9a2e,
                0x6b3b3f7b471a90f137e54262ef380f,
                0x1b97,
            ]),
            y3: BN254_Fq::from_limbs([
                0x815787c9603256c2733d129f25d835,
                0x8a286870b1aea566085c21ebdbf51e,
                0x0b9b,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x861b08068065443ecc99f72191b313,
                0x59b07197fedaeb322f3da5322e638f,
                0x2b29,
            ]),
            x3: BN254_Fq::from_limbs([
                0x7b924e7c3e19d9fdc73e3d7607ef56,
                0x3d9735fa75e006d24ca7a356fba5c0,
                0x061f,
            ]),
            y3: BN254_Fq::from_limbs([
                0x9e2b5ec1233876dbe7232a18ee1909,
                0xbc7eb5c7630c6afa87a4887a009cf1,
                0x2246,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x5cf7a708e1912788bed71050e44b08,
                0xef2d716d6ab8e2aa715ecf9f097697,
                0x051f,
            ]),
            x3: BN254_Fq::from_limbs([
                0xc0416c4fdc874333ed6573551d253f,
                0x7bc4c9877c1336c4b7ad32013019c3,
                0x263d,
            ]),
            y3: BN254_Fq::from_limbs([
                0x663b79a3afffa5f0c6f5e9ef4bb1fd,
                0x40a602f48f72335be603b354eaf383,
                0x1604,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x1d54b14242cb34a416c8d349cd55d3,
                0x9d82e94ffc02e788b5700fdc7f48ae,
                0x2a99,
            ]),
            x3: BN254_Fq::from_limbs([
                0xcd72fd1eb354b162f18796a136ca6a,
                0x3a22ac8de486a72a958971fcd4ca43,
                0x1fd5,
            ]),
            y3: BN254_Fq::from_limbs([
                0x5bd94a58f520c73c35d1471866f6ac,
                0xbccabcc045f991ff3a05f2b3f49f65,
                0x0244,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x59a515f884bb0e26fb00e2870be84f,
                0x9c54899f9f588381d391a4ccac764c,
                0x2e19,
            ]),
            x3: BN254_Fq::from_limbs([
                0x923aada1d641a60c800c5767563113,
                0xf50e7224742238372e9b56beef5536,
                0x203e,
            ]),
            y3: BN254_Fq::from_limbs([
                0x85ab9c6ead68fa18305a254aecc2ea,
                0x421291994b06af7069c3e1d414b3bd,
                0x2c29,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x4b4e8f034b700f2bbd3ff7d326605b,
                0x274501ad7a92ccb00b5e6f84d9f506,
                0x1c4d,
            ]),
            x3: BN254_Fq::from_limbs([
                0x25c2a71df710f025ae1ab02a9e86e8,
                0x707bc5d05eee19dfc2db6a72359c82,
                0x14c3,
            ]),
            y3: BN254_Fq::from_limbs([
                0x21acae160977f8319024a3888e5557,
                0x2f27a27002aeb730569718c46d5e87,
                0x2178,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xeb9df87b5a3c503d48068029dd80ec,
                0x05084641867d27dab90b7eb8a17c3c,
                0x2358,
            ]),
            x3: BN254_Fq::from_limbs([
                0x9a9f60364561e15c18c2349a6b7526,
                0x389cf3ec9e36ef8ddceb38605a5e30,
                0x0e3d,
            ]),
            y3: BN254_Fq::from_limbs([
                0x3140889b94c92e253058fa14328955,
                0xbfb344ad1f974b9659f794ef6cf776,
                0x05d7,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x5f18766c72dc67fddc5f52cccc4580,
                0xd6db11cfa43cbc41d6a3f5aee1ef66,
                0x02a1,
            ]),
            x3: BN254_Fq::from_limbs([
                0x29693bb13ce00beaf91b8a4b74d484,
                0xca5f1d4a5095402ac1c52bbb8b7964,
                0x1a71,
            ]),
            y3: BN254_Fq::from_limbs([
                0xa627a7159bc16a7f53fd318b473799,
                0xd97d053349c3d5a7ff792b17ebbaa2,
                0x0d1b,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x55faf9bf33e54d07c40ef5972ce04c,
                0x6130194a0e4bbb5c1b3b8299a18d1b,
                0x20ce,
            ]),
            x3: BN254_Fq::from_limbs([
                0x6ae0b910b5c05df88f5fab266b2021,
                0xb35bb327e82ece9f206cb564389055,
                0x246f,
            ]),
            y3: BN254_Fq::from_limbs([
                0xf59df02989e368396b588dfdde5b6c,
                0x365d5fc2650be491406474ba0ce792,
                0x1712,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x3eb042b15fffff988300d8c0deb02e,
                0xc8480056f96ce3066117110fee6ce4,
                0x0b95,
            ]),
            x3: BN254_Fq::from_limbs([
                0x0121a25ce714b9866757bb5c619999,
                0x13965fb662ac8885d01c0e7ba10fcd,
                0x0dca,
            ]),
            y3: BN254_Fq::from_limbs([
                0x3e15404158a89ccad32bfc5ab573d7,
                0xb764bf6f8ff13767493341c9563660,
                0x2b06,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x70e25ff3a2657906a5382f87db80ed,
                0xbc4e8f68ee140ca5e9a7905446491e,
                0x2249,
            ]),
            x3: BN254_Fq::from_limbs([
                0x1ab743fca160c6d19385c44ecc8422,
                0xde9517fe0a96bc3bc0c8ec5992999d,
                0x2c00,
            ]),
            y3: BN254_Fq::from_limbs([
                0x82878c245b7645fb084bddce4856e4,
                0x21d021e5e8f51432394e2d4d7c36c7,
                0x2b89,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x278915673fc5de33cf806e3928606b,
                0xbba254a73966acba9a75a6237fa99f,
                0x01e5,
            ]),
            x3: BN254_Fq::from_limbs([
                0xcbb3a3137b80f747d90ef265ef7368,
                0x4b473619e8fa8341f9e1e33a47106f,
                0x0262,
            ]),
            y3: BN254_Fq::from_limbs([
                0x91d880ace937b7eb447b95de7885f5,
                0x62c4e51acce3ea56a59f59f909e24f,
                0x1a5b,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xc69159aeca049751cff779b8cc6d12,
                0xf9c05b76ef38a000a0d79bb1dcdb2f,
                0x0abd,
            ]),
            x3: BN254_Fq::from_limbs([
                0xa48d3fbb310403ddf717cae22118cc,
                0xa5b8259e175d03f133552ddf122c59,
                0x2bc9,
            ]),
            y3: BN254_Fq::from_limbs([
                0x317f7a7076d65c9506e4c2b5409a66,
                0x7c2f3a97fa1278949a1f0111c31ba6,
                0x2712,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x302c6a9ab1b1716806a51acd21b985,
                0xca1016c4d98209605a4e6f4db9e20f,
                0x0ddc,
            ]),
            x3: BN254_Fq::from_limbs([
                0xa9473b71435103de0c394b6dd53e72,
                0x8dfe6b1f5f48de0832ef885e80a436,
                0x2013,
            ]),
            y3: BN254_Fq::from_limbs([
                0xe4a2c280a945e00e496554fec4a12d,
                0xf7cb57b4c567446466a84b9962e48c,
                0x0d3c,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x81710212aca4133bbd1db875d61d50,
                0xbbbca4e82d368db5124413856c73c4,
                0x2d81,
            ]),
            x3: BN254_Fq::from_limbs([
                0x60b1da2f8b0bba14af890eafdd0dad,
                0x7ba592daf27bee5306a72ffd98aac3,
                0x089b,
            ]),
            y3: BN254_Fq::from_limbs([
                0xb5d5eb36162ce6d48dd605e9565a9e,
                0xc8725cb13740b5712137bb98cd3b60,
                0x09eb,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x9e822606160fa0830cba948398318a,
                0xa19362bb3dd35cc1ea66e4c91da522,
                0x2012,
            ]),
            x3: BN254_Fq::from_limbs([
                0x8c50c973a16877f843ee75a15c4efa,
                0x45bf9dc3bdc2a98a71af2bd841fc32,
                0x289f,
            ]),
            y3: BN254_Fq::from_limbs([
                0x237dafe9d990aca80ba5252b1f7ee0,
                0xb9e3159e22b63c4e8b4a935e6ccb12,
                0x05ca,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x4d759ba26c86d8b3a8c7fc57eddc27,
                0x56f842d205487c9b04fc6279c441e4,
                0x231e,
            ]),
            x3: BN254_Fq::from_limbs([
                0x40ee46efa9928b4475f49b64b32295,
                0xf8beae3a535583c26288d42159a74a,
                0x1f17,
            ]),
            y3: BN254_Fq::from_limbs([
                0x044b36ef69f6bcf486e92b3abcf97a,
                0x8e9a7cf0cc2e0d0db2400dbb6c4941,
                0x1d90,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xea4a033fd3daef47ab43ed085cee2d,
                0x16a972c1db7c27b96f86e507995271,
                0x1312,
            ]),
            x3: BN254_Fq::from_limbs([
                0xca425250faaaa2028e53a8d3d77060,
                0x59037492a902a5ca650cdeb03d1139,
                0x267a,
            ]),
            y3: BN254_Fq::from_limbs([
                0x60a638a63a1c6deade6425363dbc44,
                0xb04c0d140876e9cee5a63a45e787f4,
                0x0a4e,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x9b5c90688a1fe965fb2b9f273f019c,
                0x31bb837298db1056c04988875597cd,
                0x20c2,
            ]),
            x3: BN254_Fq::from_limbs([
                0x468b8c6ba683b9dbf0feaf713b5feb,
                0x7f4bd3ef282642b6b2045eef4b256d,
                0x0c88,
            ]),
            y3: BN254_Fq::from_limbs([
                0xa6ef6a58dd6439c60256964606878a,
                0x9fdcc80dcda75dc519c109c3992f93,
                0x0da4,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x1c248501bd5077535c616f13344b0d,
                0x6c0f07e3170a0c461323322581c707,
                0x1221,
            ]),
            x3: BN254_Fq::from_limbs([
                0xd67c99d45ccba9501f55a9add5e4a9,
                0xa8e08852551c839ca4bb819e9b7b31,
                0x11e9,
            ]),
            y3: BN254_Fq::from_limbs([
                0x5a412ba5e851300ee831e91b3ee092,
                0xe6fa4c6d9bc5c1b028194b76298f7f,
                0x1da2,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x11b305fccfb2e748e35cb8f4c0db1d,
                0x6cedfb60906118bd83746a64ba650d,
                0x0c96,
            ]),
            x3: BN254_Fq::from_limbs([
                0xcfa9935d2b90c8b2a83dbc7d36edc0,
                0xb9a24c150de40204bebdd88d738072,
                0x0c54,
            ]),
            y3: BN254_Fq::from_limbs([
                0x62e1b31a2e0d34e069b0b1b4a744c9,
                0x184cbf373379c3edff8c63e59cee0c,
                0x24fd,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x22034b9909a1aaf8d22891ef5283d1,
                0x2313cb23fd273f34f2ec5c1e1fcf0a,
                0x0955,
            ]),
            x3: BN254_Fq::from_limbs([
                0x7c24e0b1849b6a3a0f35be2e0e42af,
                0x69f591ac527c9a6431235f681d7ceb,
                0x1e92,
            ]),
            y3: BN254_Fq::from_limbs([
                0x936cac9466d1d08d643df8f76ff862,
                0x803c4f90f371c48921d85ad1c6dd6c,
                0x0c10,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x2f263b0507cd14d27206f947d479bf,
                0xf9bbf3703c4d07a57c8308600781cf,
                0x17,
            ]),
            x3: BN254_Fq::from_limbs([
                0x4d648f9fcca79d35b4c6f1c7755da4,
                0x78b356c4facef6933e3b6cbd99b12f,
                0x12c8,
            ]),
            y3: BN254_Fq::from_limbs([
                0xca62af28d28b41dcfdf284dd200670,
                0xd6a3f1dd62c62476c14c759a06bf6d,
                0x1758,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x494aec23c387a734ce357de0fdc864,
                0x83bfe92a709a5d734edff5771b2bc0,
                0x292c,
            ]),
            x3: BN254_Fq::from_limbs([
                0xebf7226823254860dcb64b9910175d,
                0xade29acd46d22df62b0e4866b01cc4,
                0x10f9,
            ]),
            y3: BN254_Fq::from_limbs([
                0x7bf06a0dd3ae497453ba8bdc9b1ab9,
                0x8e1c42ea6cf4e99c00994312d22961,
                0x1967,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xd5c5dd9a68ec5ad0c4f90d2ff720f0,
                0x27df609fb6069dca85b494b966c59f,
                0x1689,
            ]),
            x3: BN254_Fq::from_limbs([
                0x68bfdf2e21766ec28fa0a86f0652ca,
                0xae685eb73831df00fc3a82d985fc36,
                0x0d88,
            ]),
            y3: BN254_Fq::from_limbs([
                0x240523bc5f4e72a33923a74886ef4a,
                0xe5008206a8d3a235c06986ca83119d,
                0x191c,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x093cd63ae27a3f56db9a3dfca0b164,
                0x1596947752df37a938a3af6e995bda,
                0x2611,
            ]),
            x3: BN254_Fq::from_limbs([
                0xb8f6f87e6e0f1e76477113a3908c6c,
                0x8dd0b06d5213b70b8784e3576c958f,
                0x2771,
            ]),
            y3: BN254_Fq::from_limbs([
                0x680602e96377909f4d67d32c014c80,
                0xf8d8b3c063c0c4f70d00adf96a0245,
                0x04ad,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x697f1ad1ad76abbd79e2b692109e61,
                0xb391ace67002e8962e131df17a4393,
                0x2371,
            ]),
            x3: BN254_Fq::from_limbs([
                0x2e0b15eab2359db930f01dba8bcef5,
                0x975bfb8fca801cbd17a7ac4a317ff0,
                0x1397,
            ]),
            y3: BN254_Fq::from_limbs([
                0x3e344fbc2682637938393f7330a170,
                0x88d33795d8c03ab111e0abaedf5456,
                0x2d58,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xfef5397e95efb4a5c00f4f2bb55aa3,
                0x06107b08747db1de2d19283b5d7cb1,
                0x23fb,
            ]),
            x3: BN254_Fq::from_limbs([
                0x2d68094707060e6b0192c4945a8328,
                0x4d7517027a3a15d6c85fb16809f993,
                0x21b0,
            ]),
            y3: BN254_Fq::from_limbs([
                0x81e3e29493d3f99ec2988024577282,
                0x108bf567f5487cc9d005a8ae67313f,
                0x2bb4,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x981c2344c8b0c7e106c55b4c5faedb,
                0x6b176a3da0aceb084d4d0a1fd8bfae,
                0x0e90,
            ]),
            x3: BN254_Fq::from_limbs([
                0x90fddd85da4b365dfe8b72610b01ca,
                0x408c0c0859a8b6aea83c1fb8597bf3,
                0x11fb,
            ]),
            y3: BN254_Fq::from_limbs([
                0x7f976fe480b02952243d826123f391,
                0xc6de300cd9f9ac9dd2c99c891343c2,
                0x264e,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x44e6aa1382e477afbae9593083061e,
                0x490b00ace47ae9fa342925a139d080,
                0x27d4,
            ]),
            x3: BN254_Fq::from_limbs([
                0x844115ce80d30f60eca8a51397e24f,
                0xcb9a52b693ddf59b438ed9b5050fc8,
                0x25b9,
            ]),
            y3: BN254_Fq::from_limbs([
                0x268a7e5b54e848adf54a1dca803059,
                0x5433a5ddbe532330916905ca213966,
                0x2af1,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xd74a01748737b692532feaf733cccb,
                0x848f45da34f31505bfc7f50255c5c7,
                0x13a5,
            ]),
            x3: BN254_Fq::from_limbs([
                0xf18119b74887f0eac8b72b61993999,
                0x0abf3ed804b46f4fd2079c7a07fc11,
                0x2251,
            ]),
            y3: BN254_Fq::from_limbs([
                0x0ef8d81028f848c37bbcad03d93daf,
                0xbff2e1edbeb6a6be135aed89b73e2c,
                0x2b92,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x9bb5fbf652bb0ce100e2b4e0811294,
                0x3f952dbce5b612a2c1336759e1e161,
                0x0f81,
            ]),
            x3: BN254_Fq::from_limbs([
                0x5f932c7698338523c2085bd490a943,
                0xc634781f15174dc1d068f37d24e679,
                0x143c,
            ]),
            y3: BN254_Fq::from_limbs([
                0xfe0152d91a37303a5d6906dcb3770e,
                0x068a5588f418b94aa1316957939a95,
                0x2a72,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x546e9d65f637e50956bc3302c32ab0,
                0x61ec619acbe338d764606e3f63833d,
                0x0ece,
            ]),
            x3: BN254_Fq::from_limbs([
                0x6aa13eb015770f67a12db6deb81df7,
                0x14fd59b85a5b160e18edd70b86379c,
                0x0a56,
            ]),
            y3: BN254_Fq::from_limbs([
                0x1e1ffaa73ec9bd1b1dcbd65c9433b2,
                0xfa4c0b34088cdceda43b4776b8d67d,
                0x16a5,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xc3277ca7265e762289bce63291a0bb,
                0x4b3c6ac44c52fcbff658934975cced,
                0x069c,
            ]),
            x3: BN254_Fq::from_limbs([
                0xdea91fca7f855df2798662750e70ba,
                0x283158029cc2b49dce28d9e396683d,
                0x01c5,
            ]),
            y3: BN254_Fq::from_limbs([
                0x9aa5c468d6fdff8d13037906657cb3,
                0xbbc7300fd3823f532a86439eedf308,
                0x1353,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xe31d1aededa889c712833daad81f3c,
                0x4b37aba9fd3a504dff9cb66ee9e3da,
                0x2274,
            ]),
            x3: BN254_Fq::from_limbs([
                0xed1bcab108e497e90d59c47e3fa24c,
                0x1c9efd6f8d0bb1fdddce78536d49aa,
                0x2b20,
            ]),
            y3: BN254_Fq::from_limbs([
                0x6da7fb53b5f7a47cc9fe2f9598e6f3,
                0x622b430a7987b51cff85503a929e66,
                0x01d1,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x5741a4f0ef2456204c31cc49b43a01,
                0xd195feb8d3e4fad746d699f653e24b,
                0x26b9,
            ]),
            x3: BN254_Fq::from_limbs([
                0xbd2f130a343a70dbbdb4ce013d22b5,
                0xd573e0eeff4a6b0c940e6761236fa5,
                0x23d4,
            ]),
            y3: BN254_Fq::from_limbs([
                0xb9ce295ecb5e2b3cd8b0dc71da64b4,
                0xcd2604bb73d04175684a5a97aa59d9,
                0x2e68,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x9384c638af6bf825760dbbe5307451,
                0x080ee4c58a986c70a2b43e9f61f9f1,
                0x2f2e,
            ]),
            x3: BN254_Fq::from_limbs([
                0x21f121b9e0f443c68478333deca821,
                0xf59843c9a5a404eef8026af494f092,
                0x0b5f,
            ]),
            y3: BN254_Fq::from_limbs([
                0x2ce94964779997cc3b1be940be4ec5,
                0x5066352065065884c9b74f0ca186ab,
                0x18e8,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x56e9e16491a313b6bc1b3728954a34,
                0x312b15774c52c712c261d1a0ba90c5,
                0x1e17,
            ]),
            x3: BN254_Fq::from_limbs([
                0x4e357306384742998445bf97105d6e,
                0xe7af464896674bc811e33af635dae9,
                0x5f,
            ]),
            y3: BN254_Fq::from_limbs([
                0x8dfc075fcd10362b812dfc35b5f557,
                0xf6a316d6c88f0717b6b6c1aadc3767,
                0x1683,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xcf8a2b6edb57c65662fb0a9bcadbe2,
                0x930c122c4fd4012999921915bd7a7e,
                0x0b3d,
            ]),
            x3: BN254_Fq::from_limbs([
                0x2cc096b0ddf406eb5553b9a7d5f1cc,
                0x056e5593cadb6cf2eb4ddc12014e2f,
                0x06e2,
            ]),
            y3: BN254_Fq::from_limbs([
                0x5ba9ac3e20efcdebca41fa749b381f,
                0xaf0a46d770c897669628af50940cd5,
                0x0b87,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x7b64ea4d77693f7e6e07d02937d527,
                0xb08405a77953e0757ce4f5f1a22629,
                0x0a11,
            ]),
            x3: BN254_Fq::from_limbs([
                0xde7fe7a4d3dc5845c8b81bd4442142,
                0xdaf9c9472776b7eacbcd55556d54a2,
                0x2c98,
            ]),
            y3: BN254_Fq::from_limbs([
                0x826d802aeca75e2d5910967ea83f19,
                0xb4ab7fdf752b91207ecdf4fb2fe841,
                0x1d3a,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x1fc9a024b85dfcbd5cd2b71a885e0a,
                0xc5e210e55d09026443686ca0ba8e92,
                0x20fe,
            ]),
            x3: BN254_Fq::from_limbs([
                0x336284a869373f083dc681a556e855,
                0xb99238bb359f56e03f892356651755,
                0x0e69,
            ]),
            y3: BN254_Fq::from_limbs([
                0x7dbdc9bd2b3e90751fdbbe95bee8ec,
                0x2afb9b918ead016bba35351f4ffc2c,
                0x2045,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x05a3af61e6c5619b9bbb84907e9b2e,
                0xea2a7a7bef4722999951ae234c3baa,
                0x2add,
            ]),
            x3: BN254_Fq::from_limbs([
                0x3765b7ceced8e62c8e5ab8b6c02f5d,
                0x6f0983122d9139727608dea5d34a5f,
                0x12df,
            ]),
            y3: BN254_Fq::from_limbs([
                0xf0aa203b2c98a092eb5ed5cad1f303,
                0xd2d0df9a52aee2852c2abb9170c0c5,
                0x1570,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x330fca7bbe24f584f3f533359af0ef,
                0xaa8dd58df04b3328bca2497f0713cf,
                0x257d,
            ]),
            x3: BN254_Fq::from_limbs([
                0x5e09a5b638e2ac30129ee4f034a22a,
                0x42c8ae054ef8f821b71746cdd681d5,
                0x243c,
            ]),
            y3: BN254_Fq::from_limbs([
                0x5f2d4ea5e95a2cff77a1f20b83b95b,
                0xd548d3c2db26fc51f080d748d86e5c,
                0x0307,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xdaecc02a953dbca54dbc2b67f7c6cd,
                0x49a17f74dc9a35357960f3b9b4f174,
                0x03cf,
            ]),
            x3: BN254_Fq::from_limbs([
                0xbf8cf2b161cca7dde036408aa7e4a3,
                0xd0ebe56401ab68d6552be511ca6ee8,
                0x1f97,
            ]),
            y3: BN254_Fq::from_limbs([
                0xf9bf9967fd096212ef4e7525191018,
                0x4f2b8b7a36cbdb3a7f4cf8194ff516,
                0x2130,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xf796fc114359cc7f7b370d1b770861,
                0xdffe7851323b638ac84c31269fe8d0,
                0x175e,
            ]),
            x3: BN254_Fq::from_limbs([
                0x9616de2909e56d92a248a30bcf7cfa,
                0x55a174c1e93aac08320830a10c5f21,
                0x2b04,
            ]),
            y3: BN254_Fq::from_limbs([
                0x6bfe4365e80f6825f64c9583268e76,
                0xfc603647d376eb00a13a6fcac084f3,
                0x21a9,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xe205904e1b9fd1e8ac35927445977f,
                0x5374db6a423e2e321f6d7103ba2cc7,
                0x1f02,
            ]),
            x3: BN254_Fq::from_limbs([
                0x77a02aaeb3bc68ef9d06c39a482b7c,
                0x4229ab9454acecf160773a2d5661d8,
                0x27e7,
            ]),
            y3: BN254_Fq::from_limbs([
                0x52730924007d599d148ba69535b9a2,
                0x5f6b9d87a06a192497f4e73cd832a4,
                0x0e5a,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x60c782880a3551972f80fb9770bec4,
                0x289d23cd563e424a9ad1e9301e29f1,
                0x0490,
            ]),
            x3: BN254_Fq::from_limbs([
                0x57cf883f159a28a451ab19407c30af,
                0xc7fa79765a9a2d262db343142085a3,
                0x1d29,
            ]),
            y3: BN254_Fq::from_limbs([
                0xf7e56ba07012ac4f3d416fd79b6255,
                0xe698300eabee66c5404c8a8991eae0,
                0x10c6,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x2f8a558cb1b9d59530c6d5c3c5bb7c,
                0x4d65e875e2ada6eb0849d4d8473d7c,
                0x1434,
            ]),
            x3: BN254_Fq::from_limbs([
                0x5bcd122e49a6ab3989d02a82dd3313,
                0x68f402ebeb3885ba2bae436bfac501,
                0x2d8f,
            ]),
            y3: BN254_Fq::from_limbs([
                0xf941c16d9594966546b1a8b5959257,
                0x2785296bc386532244d4ef5ba0d296,
                0x23ed,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x5c69c98ad855a1e821fd73f75c3674,
                0x8de3febddcc7f6cd064620423e6d68,
                0x0c7b,
            ]),
            x3: BN254_Fq::from_limbs([
                0xb5bfd2c1495ac5d2dd96c0819bce78,
                0x2fe7e3fe12d3a725b8981ed9be81a4,
                0x1c99,
            ]),
            y3: BN254_Fq::from_limbs([
                0x5a604abd9394ae6323e74068ebf2a6,
                0x1e0405ab0a8e06d4106335361aa0d8,
                0x2c80,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x196ffc89f402bea33a459b80b93816,
                0xb01b116215df8e7279a614d50c360f,
                0x243a,
            ]),
            x3: BN254_Fq::from_limbs([
                0xd8ed8e114c16255156537a6eeda430,
                0x8cda660aa5b15bc656dea0a15aabd9,
                0x2c66,
            ]),
            y3: BN254_Fq::from_limbs([
                0xdc75f861243936757e35ede4c00e40,
                0xd124b93814c8b1876cfed309f7968c,
                0x0a03,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x0b71e99e2e05d8bc2154d8806cec21,
                0x1f2afd32d7d0dd9d0be240c0d6bf67,
                0x23e4,
            ]),
            x3: BN254_Fq::from_limbs([
                0xa7dd50188090d35779c634457a1d0d,
                0xfdae9966b8d90a57440d2c3912f59a,
                0x10b9,
            ]),
            y3: BN254_Fq::from_limbs([
                0x8d1abf0ecdb8400627d0222e7376fa,
                0xbd859ad6503e09578a4c2f7df7b774,
                0x1475,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xeede527b8b266d10b01c2d80542271,
                0xfe0cf481fc7ac8d7c1f7eec0d52f6f,
                0x14e1,
            ]),
            x3: BN254_Fq::from_limbs([
                0xce45d582766189ccb5afcb509aea3c,
                0x13d139382bce57b0d2e98fb6345ea4,
                0x1691,
            ]),
            y3: BN254_Fq::from_limbs([
                0x138aebf06ac980e0d0efea201b7e82,
                0x9de35aeac305d7dfb61fb5555c05b0,
                0x09d8,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xcfb901fd08fff949a983dffab4ce0b,
                0x4e2ade7d9bba58e13b90aa1fd59724,
                0x189c,
            ]),
            x3: BN254_Fq::from_limbs([
                0x1a289e71b9f4408ca871e410bc88af,
                0xd267c75739a7d333f600cadf327f1b,
                0x0f3c,
            ]),
            y3: BN254_Fq::from_limbs([
                0xb5bdfdb706d03c613b5691346e4af5,
                0x25d9ed7846e04e15f8183917ade8c4,
                0x03a8,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x3fddd14816724aae9d0b73371ba2ef,
                0xa025535397c5f606c1bf2e1d3ddcef,
                0x18c1,
            ]),
            x3: BN254_Fq::from_limbs([
                0xa830ec4f6db3f3b8a1f370de7895a2,
                0x26b622c2d88bbf8d65604fd27483dd,
                0x17fe,
            ]),
            y3: BN254_Fq::from_limbs([
                0x213888d9c8d5f0beb5c91708904e03,
                0xa6444cfd11c48174bba68197fe0067,
                0x121a,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xb61677063625140c50d9a4e5dfeb71,
                0x37499e20364ad0a501ea7e81ea2d1b,
                0x2b63,
            ]),
            x3: BN254_Fq::from_limbs([
                0xed715bfef0e22f8566594622a3dea5,
                0xd1ac704340b78741893329d9790c3d,
                0x2db9,
            ]),
            y3: BN254_Fq::from_limbs([
                0x2d3de941fad4aca7eaacce76ac3be8,
                0x324b5201eb35703dfaba42ed48c802,
                0x012f,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xe9750fa5544fbca90326ef6edee6cf,
                0xa7bb12f9e039e2150dd2c706a08124,
                0x1c0b,
            ]),
            x3: BN254_Fq::from_limbs([
                0x26fb49e60b7073962c41ca7d3e9875,
                0x66588f54f1e35c86c4cf79d31714e1,
                0x063c,
            ]),
            y3: BN254_Fq::from_limbs([
                0xd30e194c838cdad0e28269c38ff1e1,
                0x157237b5c0cb3f98029555d65e822e,
                0x29e7,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xeee1224f8d4f9a84110c7a49868a9d,
                0xa0478f30e52e361df312352ec455ce,
                0x107b,
            ]),
            x3: BN254_Fq::from_limbs([
                0x1d07290e4d880e07ce8293ce846a46,
                0xf56962f4ec91a33cb9d77c5ea8604f,
                0x2a00,
            ]),
            y3: BN254_Fq::from_limbs([
                0x69d4206e62a40ce5c72d56507a56bd,
                0xfa7403cbd844fb5e5502aa507647cd,
                0x10bf,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x8302a330d9cd56a33076c12e2b773d,
                0x6ecfe4e6a2fcead2fda94bb288e289,
                0x0346,
            ]),
            x3: BN254_Fq::from_limbs([
                0x6bc29cc0dfc3e772f5121d68955d9c,
                0xb75dd73805de4bd3d03d4a580b984a,
                0x2f9e,
            ]),
            y3: BN254_Fq::from_limbs([
                0x711108b2381acaf01d7497f97f2455,
                0x7b1491bd36d6e1a6338e2cb5ace670,
                0x0c0a,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x059486f13d6e0d1c75d29c186ef338,
                0xb7f4b87ae90fa8f0bd28ce3fcbba55,
                0x14e0,
            ]),
            x3: BN254_Fq::from_limbs([
                0x9ed1328edc69df615f6af438f074b6,
                0x7271ebb5685e575daff20841b09ca8,
                0x1333,
            ]),
            y3: BN254_Fq::from_limbs([
                0x670d59341b0275b922dd096f060634,
                0x972163998e68ad3126d3585b12905f,
                0x0b6b,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xfd84042ec0bc6b1c992bd7cd80c3a8,
                0xae3730aeda63c07dc31273675bfcec,
                0x04d4,
            ]),
            x3: BN254_Fq::from_limbs([
                0xebf4966b9ae7bdfb9218f0e83cdb8a,
                0xb81c3187748c42763f61a8fb7114dc,
                0x08a5,
            ]),
            y3: BN254_Fq::from_limbs([
                0x08a4b0ec31a030357b771c057c96cf,
                0x08cf736049ae002f2468ca27d24229,
                0x08db,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x3cf447b6b03606c62ebb476e466269,
                0x14018df2fafb185d577ed1925bbec8,
                0x2543,
            ]),
            x3: BN254_Fq::from_limbs([
                0x9784ee9384932ee0e752a2b58f3c93,
                0xeb3da7be41ffa53d2295a4a8eda5de,
                0x167d,
            ]),
            y3: BN254_Fq::from_limbs([
                0x07e18046d710d19e8df5cc9616ac35,
                0x66ccf76d25234bed56ce953cfc52ee,
                0x272e,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x8191673d50b265d6b44edeeca5b5bb,
                0x5ae2e707f259d3fb809dde92ad8863,
                0x17f9,
            ]),
            x3: BN254_Fq::from_limbs([
                0x4a8747b361580504d1e30c3982af64,
                0xf8e6cfe6dda6caac469b2b65c369b8,
                0x2f6e,
            ]),
            y3: BN254_Fq::from_limbs([
                0xe46d25b519d2086b9fd0702ec293a1,
                0x71f10c15e74954f4af58d08ff7a441,
                0x2b6b,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x6584d102ee268f62823f698b22b410,
                0x9253fd7d4595f64740cfd602311093,
                0x1812,
            ]),
            x3: BN254_Fq::from_limbs([
                0x5b23e61d5f043af5cedc0fc6788475,
                0xf88e0e751100480706de9b6a3030ce,
                0x02a5,
            ]),
            y3: BN254_Fq::from_limbs([
                0x8100b826f6619e4c0ba8d1c20e729d,
                0x7e7bd4cb456e64ee2310e16717bc6b,
                0x1e10,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x632f32b7de011e22ac4c8651e0c4cb,
                0x15b779fa40fbaba6dc1812c125346b,
                0x2bc5,
            ]),
            x3: BN254_Fq::from_limbs([
                0x9acfb3f0d2c246256b695d4e6a8cda,
                0xc05adba7c1e2fe43d2ff4a315d1611,
                0x0e79,
            ]),
            y3: BN254_Fq::from_limbs([
                0xe71e1436e2fa05b6af9f54de7a8e64,
                0xb3fb7c1385e9385c68b77cd867cd25,
                0x1330,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x7969f4671b9c15bb3057d4d2bd6204,
                0xf6aa478ff113fde2ee70b0d5e95d,
                0x2e98,
            ]),
            x3: BN254_Fq::from_limbs([
                0x91efc520b1f96a13a5a296bbb5633c,
                0x170647c87b3f9ddaac4dbd2b6fb5aa,
                0x2059,
            ]),
            y3: BN254_Fq::from_limbs([
                0xaeda434c22aa62a87207ce95ab7e9b,
                0x34f4e1852cda11e9ce3d9b26c8db65,
                0x028e,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x9c4687c8ca4ae1cceb1a1de365880a,
                0xa316048f2a55328a1c9cef2df18c18,
                0x0eea,
            ]),
            x3: BN254_Fq::from_limbs([
                0xc5a1092ad928e4b4b1b7dc58f4ff6c,
                0x085eaba042c96288c22657188c6247,
                0x2bf6,
            ]),
            y3: BN254_Fq::from_limbs([
                0xa86b31d9d11605c081caf68d0cbc34,
                0x423debb9bccf39ff1e5dcfc2035051,
                0x04d7,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xfea530bda28ca4c1290d2112331e47,
                0x8bc016377a2565d202fe8086fdfcb6,
                0x1aa6,
            ]),
            x3: BN254_Fq::from_limbs([
                0xb389c750087b69124619a9959fc0f2,
                0xae1af188fd00cd0d735cfc1e53704a,
                0x2397,
            ]),
            y3: BN254_Fq::from_limbs([
                0xb2f54c4e686b722fc08b257aeeb33f,
                0xfcc1f90b3ce09ab4e65db68db768fd,
                0x14bd,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xd74274841c37c4a1ac5a3945d2728d,
                0x700a82886e97891a76c80c1d8f0efa,
                0x1cf8,
            ]),
            x3: BN254_Fq::from_limbs([
                0x6ab3a738d7cdf67b89644bfef58616,
                0x45dd3de48fdf1344de8677595fd7f0,
                0x2572,
            ]),
            y3: BN254_Fq::from_limbs([
                0x165f1937e18a3c041d82f4a1d310a4,
                0x16b4b66cb11d9439adedb359ce02bb,
                0x1cc9,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xf6654f12ac62378f664138f1b26146,
                0x4dd55655ff61013cf2d3953a248107,
                0x10d6,
            ]),
            x3: BN254_Fq::from_limbs([
                0x7cb74d59cd79f180772cf37bfaf67f,
                0xf3277ac31014194ce4498deb58a64d,
                0x0680,
            ]),
            y3: BN254_Fq::from_limbs([
                0x3e43c113895c218961e97bd0b5b93f,
                0x9e8aedd146193dcca4140f736f6348,
                0xb0,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xcab9a6af5967dda4ba2467e314756e,
                0x9929be0428441a8fec8dcc77270031,
                0x34,
            ]),
            x3: BN254_Fq::from_limbs([
                0x02b2c59ed26161bb4d7bd267fa9d3b,
                0x1f78154a8c660f0fdc9f943448036d,
                0x2bf1,
            ]),
            y3: BN254_Fq::from_limbs([
                0x4b6bd3b3b70afeaef4e197776e3a68,
                0xd5d35475fe7796add053b644948ac5,
                0x2f93,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xf66f3d371e105fccce5347bef4bc75,
                0xc924d38ac214ec4ae3b74dca4ee54e,
                0x1971,
            ]),
            x3: BN254_Fq::from_limbs([
                0xd95b2318242b658088bf270d85bc18,
                0x35643dc62382b69cfb3c175736f63d,
                0x2f93,
            ]),
            y3: BN254_Fq::from_limbs([
                0xa6a5982f579b09c5a975f36cd4053b,
                0x9b8cb2dd5c02e039021dbbffd81f9b,
                0x2f56,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x2b0d46c2d02c0115676a5b6b520d9c,
                0xb26f38058c688a57aa09fa5e09e484,
                0x2100,
            ]),
            x3: BN254_Fq::from_limbs([
                0x025905ef730ad4301afd6a0e5547a5,
                0xee6d9d0c1e7e94ccce52757bfd6802,
                0x2bfc,
            ]),
            y3: BN254_Fq::from_limbs([
                0xb6e2a5872c42f2046c36a338aa884c,
                0xb9528a30a31b5fe010a8286a6a976e,
                0x2cc8,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x2385ce851d60e7e712b91fe0b29c0a,
                0x9bcac1f3532189b60f935e4f23f418,
                0x2675,
            ]),
            x3: BN254_Fq::from_limbs([
                0x6afa4dc5be39ae15299b4024195658,
                0xf36a21ff751f876c9f58d1072b6dc6,
                0x238c,
            ]),
            y3: BN254_Fq::from_limbs([
                0x0452f34908f85c22e153ec280ee952,
                0x6a004b724bcf7ef24e2319d3131832,
                0x1ce3,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xa1da4eff434e766183915e5fe0ff36,
                0x174b8ce660da3a9bfee7c5866d7387,
                0x0139,
            ]),
            x3: BN254_Fq::from_limbs([
                0x3add73194c166b235b1346d8ba2494,
                0x868d7cd484ee34f5d4817b970c5444,
                0x0854,
            ]),
            y3: BN254_Fq::from_limbs([
                0x4d797a4f106985c9e5322816ac4d74,
                0x676e6d71983597cf0e43c6cca2f1b3,
                0x21a9,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xa55e2fe0339c620af57dd1a21e34ed,
                0xa9c7f990a6306d61a2dd163e25236b,
                0x0258,
            ]),
            x3: BN254_Fq::from_limbs([
                0xa22ef64125acee7682e1e8f107d024,
                0xa3590297a986a4f58b7c7f79f994f3,
                0x2682,
            ]),
            y3: BN254_Fq::from_limbs([
                0xa1c6e179c5a6660c4222826e2e69ae,
                0x7e8a668b5fc881346fee8e3ef7b117,
                0x2c9d,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x0cc59bc21c52599b45180ca37fd7be,
                0xc1e0770a8e1806a20505a7e60dc149,
                0x15ef,
            ]),
            x3: BN254_Fq::from_limbs([
                0xfb440e721b5b86e610ba0b58a19dd8,
                0xa16231667c912f0ab33a659ea569c5,
                0x247b,
            ]),
            y3: BN254_Fq::from_limbs([
                0xd5e2590f957cea9d94e9be2109b45e,
                0x3c79a4609594a3a491c3a5c4f7b578,
                0xf7,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x27e2bb5b0529e63aae44fb95c339f6,
                0x2bd5615dcdec3e63e85922a8427c7c,
                0x2212,
            ]),
            x3: BN254_Fq::from_limbs([
                0x447092ff6017ee3d79c777632fcf70,
                0x05e818f6262dce022260ab608d177a,
                0x17ec,
            ]),
            y3: BN254_Fq::from_limbs([
                0x0d789188577db92c8488a33ee9f286,
                0x8c222856a02e8ae0b56226a94c1739,
                0x2c41,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x901cc3a7cce58efbb6be267684e4d7,
                0x33205586d76c63312e3eb6f62c7f92,
                0x23af,
            ]),
            x3: BN254_Fq::from_limbs([
                0x0f16dc97fee7f634cfd9ebdf5c9f9d,
                0x236389f541bd29c98874569b39ee45,
                0x2344,
            ]),
            y3: BN254_Fq::from_limbs([
                0x44730fa887f0ee76631fac19d73361,
                0xed15f84117d91254d94f0d57995718,
                0x0264,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xa45e9c103906f88b2cb4abd89b546e,
                0x24b575039bcc539db2574031823efe,
                0x08c2,
            ]),
            x3: BN254_Fq::from_limbs([
                0x684c44c8ee8e9558e271f5b279a9d4,
                0x4517227221a0e31a100dc8e56772da,
                0x0252,
            ]),
            y3: BN254_Fq::from_limbs([
                0xace019a6dc26360d6e31574d0c1ace,
                0x77637829980c164ff6c5e72f6d05ba,
                0x027b,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x169a463940e4b188939935eee700af,
                0x6567f4f6fe3720ef4b9c77ac638eb1,
                0x2ba9,
            ]),
            x3: BN254_Fq::from_limbs([
                0xb540cb8bfe6b305f21aa60d7f37b45,
                0x8c101a9c068821e742d143cc97a699,
                0x0de0,
            ]),
            y3: BN254_Fq::from_limbs([
                0x239b52dc33583a6e370b657ad3ffff,
                0xa04c2f98a3194253634e869364092c,
                0x1d99,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x92214519b70bdf273fd0f8a38b72af,
                0xb64c1735e809cc294b90afbfb14a95,
                0x220e,
            ]),
            x3: BN254_Fq::from_limbs([
                0xdb20c728d51fb38767bdf92d57b4b3,
                0xae67fb79f90565d58fd91332361fe9,
                0x0605,
            ]),
            y3: BN254_Fq::from_limbs([
                0x15d8aa4ea4148b6d37655079bf1a82,
                0x67a55ccda80b2f60b3b980061a72e9,
                0x12c0,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xfe91ec3ad4ccfc261743fa4134124f,
                0x40727c14318bc5cab86bf187a7b4b1,
                0x2446,
            ]),
            x3: BN254_Fq::from_limbs([
                0x69820ac05fc4318051296c72c8f84e,
                0x0bc166e546fa8271f7708a632f3382,
                0x17d3,
            ]),
            y3: BN254_Fq::from_limbs([
                0x718922a3fa12ed3ae1e09748818ddd,
                0x09f9fd27633683a78266b3fe57de63,
                0x2179,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x3e5d64b134e7f664a66c0a8cad23e8,
                0x4d3ac6facd6ad10a7884af180a1217,
                0x05a9,
            ]),
            x3: BN254_Fq::from_limbs([
                0x3c28195d44d611e44c554e47e0a53c,
                0x6ad76210c477aaa168b49fba871add,
                0x2e33,
            ]),
            y3: BN254_Fq::from_limbs([
                0x8e1765f0fe7086210f70587a5998c2,
                0x93b4a38cd0b47359f97595fe9c0491,
                0x18bd,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xa83d0dde7cb86b7188eedf2db9c36d,
                0x9c573e2d7c1f7a7d16650e524c4daf,
                0x2662,
            ]),
            x3: BN254_Fq::from_limbs([
                0x3f6fb071395cac0af7838ced84b088,
                0x14615d6248f7f0c4823c56533fc37d,
                0x1447,
            ]),
            y3: BN254_Fq::from_limbs([
                0x03ee34ad0cf3cdeae2dfcb3126bbe5,
                0x5049d30b688d34937d925fb4d41917,
                0x0a33,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xe5b0640dd63a47873926b30123ab67,
                0x2946708416bb486f90c739b51c22eb,
                0x0d4d,
            ]),
            x3: BN254_Fq::from_limbs([
                0x70c3bbd183ff9bdf346b3142f4c4ab,
                0xf9ecebbd610b72765fbab5ac589e08,
                0x1d9f,
            ]),
            y3: BN254_Fq::from_limbs([
                0x5775296ab97e439aeaa177fe1d977a,
                0x2d7ed1717b9ed058142351c8b87d35,
                0x1377,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x10cc1ff73ea4a9ef027a9367ead109,
                0xf319368c5c0472d122447bff7cde37,
                0x0f5d,
            ]),
            x3: BN254_Fq::from_limbs([
                0xf7f33518710eebc2889956fc197a59,
                0xfd15a8dde30755d3883fb8605993fa,
                0x08f0,
            ]),
            y3: BN254_Fq::from_limbs([
                0x7e05178c9e90f599ed148f9cae261f,
                0x9864adfedc0ae0c2ff9d90de6152e8,
                0x2b32,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xf864c016f2b9340262071576511c12,
                0xf7e5d6c1f7708d9ac396bdb6073dc2,
                0x1bfb,
            ]),
            x3: BN254_Fq::from_limbs([
                0x38eef3f1b71d8c110be99e4d6c3b71,
                0x40eb3cb7b36b946bcee8908d97943a,
                0x0498,
            ]),
            y3: BN254_Fq::from_limbs([
                0xf8a0bdfd5483ee698d6d9b9f8e0ade,
                0x874f22c63f5c7178baf3ca75d2c60c,
                0x22c8,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xb083b8e6a3b17b2aab936aafc8675b,
                0x612f30802e483b12f47f80d8bed5e4,
                0x22b5,
            ]),
            x3: BN254_Fq::from_limbs([
                0x398196410e4be9759f0460efbe7f32,
                0x02fda44d35eb0d9ad4f94b9704ca27,
                0x2896,
            ]),
            y3: BN254_Fq::from_limbs([
                0x674ac100a85d28b388e44df50866ce,
                0x9f32d8f22c762cfa56fd53e3f9dbd3,
                0x0453,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xe64e63b9665052b6cd4854faa1684f,
                0x4bde5e3c40c0330acfc9f0b72acfdb,
                0x287b,
            ]),
            x3: BN254_Fq::from_limbs([
                0x60ec05828d0de69c115465a704c63c,
                0xe5eccd148b08c93d2e9484f1018d92,
                0x0485,
            ]),
            y3: BN254_Fq::from_limbs([
                0x021f45621e14634b35a63676f78c7e,
                0xd935514d7164481f15904533ee4568,
                0x1d41,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x973e6c46d9f29f7a0bb45f11aac514,
                0x2aac905354a67f3617785667868cac,
                0x0fad,
            ]),
            x3: BN254_Fq::from_limbs([
                0xfbb4505a0bb089bee7ee1ef7264043,
                0x630e70355d2837ffeddf9605ec7969,
                0x285e,
            ]),
            y3: BN254_Fq::from_limbs([
                0x9ef57319dd8903f8f1f561e6e9755a,
                0x98cdd91a0ee285acb0422ee373c234,
                0x2b03,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xf1847c84180a22d50a115ae2160f79,
                0xe3460e65968992fc833a8347bdaad8,
                0x1475,
            ]),
            x3: BN254_Fq::from_limbs([
                0xa9f3c9b6418bc9b811ff4ab20dc10d,
                0x27d46b3d5edcf32a1ad2e8a6d906b2,
                0x1ef7,
            ]),
            y3: BN254_Fq::from_limbs([
                0x71fd8c356890dc36bfdd509f6a1522,
                0x0d83cc4623bfb5a56ac3af5c6f92bc,
                0x4f,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xa3a8e4d181720f9b743ce48bf508b1,
                0xb094f4ab1f080f15b1cf52fb0473da,
                0x08f0,
            ]),
            x3: BN254_Fq::from_limbs([
                0x3dadddfc7e834cbc16ceb57c4ad485,
                0xeb9a441afdc95fa7bee10709f86b58,
                0x0b35,
            ]),
            y3: BN254_Fq::from_limbs([
                0x55a530e8ed9ce378831dfcff2acf4b,
                0x5ac09b54b292ffee06949a97d831bb,
                0x127c,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xdd92a7b6af2b0a52e1b369b09b0ab0,
                0x5931702c9861363e2cbeb7a50a51c9,
                0x2a17,
            ]),
            x3: BN254_Fq::from_limbs([
                0x82dfb9b6d526cc2915ff6b4e65054c,
                0x2347b59f8f27ae478f09ec2e919dde,
                0x130b,
            ]),
            y3: BN254_Fq::from_limbs([
                0xb23a019050fef5a7f092d8ddcdfd61,
                0x630229fefc620128390c53e12ca6a5,
                0x1855,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x2d8e1f51f01b091eeae48106648822,
                0x7f5d09bccde36d8219afc5e4dc306f,
                0x047f,
            ]),
            x3: BN254_Fq::from_limbs([
                0x5416dc3c03763bc7fee0005b9f214b,
                0x71020b18df198e034160463189c308,
                0x0154,
            ]),
            y3: BN254_Fq::from_limbs([
                0x5a6cac79a01772858d97dd5eea28c0,
                0x147fd80564d38a809b2d4e83dbc4bc,
                0x1d08,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x89c74a50dae4a02237c56a6a506dd2,
                0x68e4a54db512d1ae150962f87fb6f7,
                0x1baf,
            ]),
            x3: BN254_Fq::from_limbs([
                0xb7ba080adfe8bdbb4028953172bb95,
                0x089abd8aaefa83c549ae6805ccf306,
                0x2928,
            ]),
            y3: BN254_Fq::from_limbs([
                0xcd00ce505514af51d8105164f6f90f,
                0x021c363f08a0b93997c3458bca03cd,
                0x24d1,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xa203d6dee98c448f0c3689dd46fee2,
                0x2ecf520992dedec222d82ba957fa96,
                0x12f5,
            ]),
            x3: BN254_Fq::from_limbs([
                0x91a5dfb64b07d36b372c3fffa8a57a,
                0xe515755e3dccb0fd6bb1a287f77e08,
                0x22d9,
            ]),
            y3: BN254_Fq::from_limbs([
                0x24525898125dcbdd337a76136b986b,
                0x5c0ab2c58581969a3549dc2cbcce10,
                0x2006,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xd14be33f568a7232f9d2be02995721,
                0x4f003cc33edcfca547d373d31b86cc,
                0x1899,
            ]),
            x3: BN254_Fq::from_limbs([
                0x6bbdd1df3263d7e3cae5f96c48042c,
                0x8372622538dd16b5658af5bef4ed8e,
                0x0d35,
            ]),
            y3: BN254_Fq::from_limbs([
                0xf53467f88d0f3fb3650ce4603a3b29,
                0xa3310897e81687237b3cd85268adbb,
                0x1809,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x0ec771f2d8737a8cecc45398d0cc5f,
                0x09031ad7c53bad49d181697e820ae6,
                0x136b,
            ]),
            x3: BN254_Fq::from_limbs([
                0x51798090a854a4b6a5785b6cbd0974,
                0x6a9d570ec3c34312393ab8a9c63dcd,
                0x240b,
            ]),
            y3: BN254_Fq::from_limbs([
                0x86b8fa04865e95adf14d861ad6e2d5,
                0x1203b87041a16f39e34296cefbaa38,
                0x03d3,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xa9591aaa29f85339e1decbb9a968f0,
                0xb61bf69aa4d298519282cf2ffa79d6,
                0x0343,
            ]),
            x3: BN254_Fq::from_limbs([
                0x6dae730d173308bf47ab691cb0bf0b,
                0xf8caa0465561a91a5f963d444d8ab5,
                0x1d3c,
            ]),
            y3: BN254_Fq::from_limbs([
                0x99930871e0dd7e91b7e8ff61cb8251,
                0x8cb50bf9feee035c3731916ed59679,
                0xeb,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xc6c501e7462631ee6210c59988b6ac,
                0x93ed3febfd2c43fd9c78097a16ae7d,
                0x15e1,
            ]),
            x3: BN254_Fq::from_limbs([
                0x5bcd2dc95ce51fce65943c105ac65f,
                0x6f6b66a1653ce9319cefc060e656f0,
                0x1a96,
            ]),
            y3: BN254_Fq::from_limbs([
                0xaf94a52f0bb4083f6b8ffa3951c5e6,
                0xb8b860ec47d7e1dd2e764e14d8b32e,
                0x26f3,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x52b074832d0cd3e87857b6db70b742,
                0x93943edf1eded66c423b87482057b2,
                0x256e,
            ]),
            x3: BN254_Fq::from_limbs([
                0x0fa0f75a2af0c7585b6c9e8110c724,
                0x471d7345f42932affb1e34cec4936c,
                0x0f0d,
            ]),
            y3: BN254_Fq::from_limbs([
                0x9051cf51903c438e3a995db28c5706,
                0x874a61cf3f1d16071aacbf7c3f94ac,
                0x238b,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x2f89c8ac05fa8daac308ca172164a1,
                0xc7b14cabb12f8268aad08cb1eb9b34,
                0x2643,
            ]),
            x3: BN254_Fq::from_limbs([
                0x04abd0162a217e31fcf7ef74655584,
                0x0b1873fb449d971d39c514670b3661,
                0x1096,
            ]),
            y3: BN254_Fq::from_limbs([
                0x9ef767533a8941f0ce748f6208ba0a,
                0x7baaa9904ba092b1ff078d60c6ef0f,
                0x2849,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xeb1b1bb85a0f696cda155870a8d691,
                0xa99b85f0ce1791b7f75538a94cec27,
                0x179e,
            ]),
            x3: BN254_Fq::from_limbs([
                0x133c64e2a1bed1a619c3a154bb25be,
                0x327517fe3b5a74b8553cf63e10ed00,
                0x0a27,
            ]),
            y3: BN254_Fq::from_limbs([
                0xdb0793ee42158c043cf085338b2d46,
                0x50839167b70e2cf9a7bc6eda7d647c,
                0x22f7,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xe38f2928d35039005dff92dac134f9,
                0x50386a144b221b46fe43c594e5dbef,
                0x29ea,
            ]),
            x3: BN254_Fq::from_limbs([
                0x541b2a9bc5b27f0966fc9627474ee5,
                0x6a48980476685b7e7f05174e5a2c6b,
                0x2a39,
            ]),
            y3: BN254_Fq::from_limbs([
                0x57217c176cb20df83c18f986ae927a,
                0x44fd16b86ea5e31a4c05add9515cd5,
                0x2e04,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x6aa7b5e2b050272d27bc21b32500a1,
                0xb14d34e070a4b2856436c36fcee0b1,
                0x2c76,
            ]),
            x3: BN254_Fq::from_limbs([
                0xf64e491102932b422196820820d922,
                0x26f362903d7aebbbbca9eb007d12e1,
                0x2d31,
            ]),
            y3: BN254_Fq::from_limbs([
                0xc50a7d77aede422199f601d4f8efc8,
                0xff3780a26bcddd02e02f444293bba9,
                0x2805,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xe19f15879e7fddbec23675c8ea8236,
                0x740285c110ffb6489628d245ac1d0b,
                0x2456,
            ]),
            x3: BN254_Fq::from_limbs([
                0x6eec0942a3289aca3258c41875caf2,
                0x7f73c9fc59d5cfd1121ec125e1411d,
                0x0b2e,
            ]),
            y3: BN254_Fq::from_limbs([
                0x5e9a4441260d13d125a21887633b48,
                0xa1c33ae34d14bbb3b207e0512fa468,
                0x3028,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xeac6541cbdfc1a39c3731916fd240a,
                0x22ae97de458d9b5bd5e9d3ba7dd1a7,
                0x0ebb,
            ]),
            x3: BN254_Fq::from_limbs([
                0x443a407a89d843ff7553c70db8714d,
                0xc9f27bb465dbd25eefff8a05a89d68,
                0x1c37,
            ]),
            y3: BN254_Fq::from_limbs([
                0x97b2a6e35d394742dfc8c2345f9fce,
                0xcca62ba873db5a504b2e6ce13d7363,
                0x0ea6,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x4a2589ebc19d359bc5c1d1831179c4,
                0x80cd0dc9bf4ceff51464931996f788,
                0x28bf,
            ]),
            x3: BN254_Fq::from_limbs([
                0xeee8637da45dbc53146014c1764c53,
                0xfad79a1fc7b60e1324583036aa39,
                0x16b0,
            ]),
            y3: BN254_Fq::from_limbs([
                0x720d8013caaebd9ed8088776260628,
                0xaa8bfeadeeeec71da1b7615339c32f,
                0x1129,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xf543b8bfd49ec520697be6ebd9d636,
                0xba6698bb69549fa3989dba6ac88eea,
                0x241f,
            ]),
            x3: BN254_Fq::from_limbs([
                0x3d442707a3ac53dc78164d5db50a20,
                0xbc9219ef9355e6e34bb8b659246f69,
                0x12c9,
            ]),
            y3: BN254_Fq::from_limbs([
                0x500770198999f73b92d8096655fffb,
                0x8167548b4e751f65453c79ee0e4c16,
                0x0e1e,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x42f5330b45c42bebd65124ad71d4ed,
                0xe44e13f87cbcf33778677bf576cb7e,
                0x104e,
            ]),
            x3: BN254_Fq::from_limbs([
                0xde88f059b17fc6003ae9de6b195edf,
                0xb7dfca93180fc877fa16406d2a48c9,
                0x1efd,
            ]),
            y3: BN254_Fq::from_limbs([
                0x6cf6aafc0da1b6bfb507d1b7a113a0,
                0x9c325092404f8178aa26cdc3a53b45,
                0x28d6,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xd7ba8f394dd178b01f88637d30d118,
                0x50aef958e3d968521fd7bf5dde416c,
                0x2415,
            ]),
            x3: BN254_Fq::from_limbs([
                0x3f5d5b63e2cfaff6cc5e3dcbfe655c,
                0xc519553de830601661762686296991,
                0x017a,
            ]),
            y3: BN254_Fq::from_limbs([
                0x6789c180d1ec3e4edb817a16bd7e5d,
                0x4d5b81592d124666908854abaa3cce,
                0x1c11,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x9116b6b67bf9328d6ccbf006cd26ed,
                0xc5f06ed207c93866ca48639cc33a67,
                0x15d0,
            ]),
            x3: BN254_Fq::from_limbs([
                0x048c040d5b36f7b659ee906460f37a,
                0x2a59b4e54d87f9a68ac36d47950e58,
                0x09f1,
            ]),
            y3: BN254_Fq::from_limbs([
                0x29adf17788d41eecc4266c188aadde,
                0xc55d9cfa11c42cfa49d1ae3cbcc650,
                0x2294,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x74ed22337a9d2b90a281dd185e3206,
                0xc483166d2352aa687bac9181e8d1f0,
                0x29c7,
            ]),
            x3: BN254_Fq::from_limbs([
                0x15612c6737da610c03014aebf75fad,
                0xf13c9f55ed2e87c3050e250fcdd8da,
                0x1d8f,
            ]),
            y3: BN254_Fq::from_limbs([
                0xe6a41c1f31efe5fa3ee6a863b76d6a,
                0x49faacf46632f6689e7644a954103e,
                0x0bcd,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xdde213fb0f693fe7f9b1909799b84e,
                0xa1dd8aa4b5cb861d379a7a49e635c2,
                0x2193,
            ]),
            x3: BN254_Fq::from_limbs([
                0x014eac28da01e5838bb3e70257463d,
                0xb83694902496a69b7692c9b811cc0a,
                0x0483,
            ]),
            y3: BN254_Fq::from_limbs([
                0x60a20d250870193608f92126bff9ed,
                0xadd4a742bcaaecc955bf416c73d9ba,
                0x2f40,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xf0d5db6fdeb550c70fc1ea042f422d,
                0xd963238fba469412406c37489fbee1,
                0x2293,
            ]),
            x3: BN254_Fq::from_limbs([
                0x36bc8ea8b9cd49e96e49a97271cf91,
                0x536b04f397b5d3ac77a010b3ed3f56,
                0x12b1,
            ]),
            y3: BN254_Fq::from_limbs([
                0xefb7f0a80122d91387ab14340fe712,
                0x8758c54b44a97814cb1cb86ad69e43,
                0x19bd,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xfea6245e6d2bcd44a8d6a400d3cfe2,
                0x9efe985df4e376d0a70cc5fb189528,
                0x1b35,
            ]),
            x3: BN254_Fq::from_limbs([
                0xed47ce649117f0b7985725fc889f56,
                0xd3e9162100760f8c0d7ae97182fc54,
                0x292d,
            ]),
            y3: BN254_Fq::from_limbs([
                0x9ff05a03dfa90215d9fdb7279b5d7d,
                0x2b3833b82d0fed7f025d6b537695b6,
                0x0b65,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x8337b259624c718f093765793caaf8,
                0xb8e7017cad1ffbcffe29a53f83989c,
                0x28a0,
            ]),
            x3: BN254_Fq::from_limbs([
                0x86198c93ec497bc47d706a18e304a0,
                0xd0ff07851951de4580dc83ba7555b5,
                0x0fd6,
            ]),
            y3: BN254_Fq::from_limbs([
                0x9c17b80fc943b8f9e969ab3509aaf8,
                0xfa9a567cd8ee5156fd7dcf8b092dbb,
                0x1635,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x6b6179835fcb2db63a2cf3ee342896,
                0x1ee566f369cf31a2239bbd4465894e,
                0x1997,
            ]),
            x3: BN254_Fq::from_limbs([
                0x6553456b2cd13d2e4b2986da6e8d99,
                0xef0de8949bba33efcc6e4f33659cd9,
                0x2162,
            ]),
            y3: BN254_Fq::from_limbs([
                0x57f05ed48c0a2ceb92a0e66f65d02d,
                0x96cd7fab136c1a9c0f6709b74a97ba,
                0x28f2,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xcf17ea8f95ebc53430c2493f44722e,
                0x4ac7d4a8a8950e2f37d4feeec8097b,
                0x1072,
            ]),
            x3: BN254_Fq::from_limbs([
                0x01e46fc5f8d238d0b3e2655d370933,
                0x765830c8ffca15ca0c26e4cb98be42,
                0x2578,
            ]),
            y3: BN254_Fq::from_limbs([
                0x336bcd72e0b4a9251f6ab6b94bbb86,
                0xc211010e0c5449127284c9c38eb857,
                0x27ee,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xca11dbf925b1c1624adda6f58a5286,
                0xcbc07395543910b1b6dc6c034fce60,
                0x2d69,
            ]),
            x3: BN254_Fq::from_limbs([
                0x1d483f037358394449ace016641c81,
                0x0765f92d7c964db135bb60d8d06fff,
                0x0224,
            ]),
            y3: BN254_Fq::from_limbs([
                0x33b4c748db0f3e181a562d7586f176,
                0x7266ef7ef1a7b5b1687ad3e1e01d77,
                0x23c6,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xebdf1e0a4ecf7b41f72bb3b95913dd,
                0xfbb1a25f55446b7d8783f6b5d06945,
                0x095e,
            ]),
            x3: BN254_Fq::from_limbs([
                0xb263ca2f8175f7265b8724f38006d6,
                0x65d30cc2525f39303a57c33a916a05,
                0x2bfc,
            ]),
            y3: BN254_Fq::from_limbs([
                0x255929f659171746333681d2f57ec4,
                0xc77adfbb99d9d6c42852e77b8beda4,
                0x1027,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xe4f126766d8ce30b4ceff8fd1f0eed,
                0x943b745917bd4549568a27910c230c,
                0x1dba,
            ]),
            x3: BN254_Fq::from_limbs([
                0xb0a2a0c6eba4aedbb535a87f62d159,
                0x7736717c2ecafadb7b31b7f5457c55,
                0x0e14,
            ]),
            y3: BN254_Fq::from_limbs([
                0xa7f9911d4e557828599b27e556cae8,
                0x5e2b44ea5e11eafbd96d8e295e68f6,
                0x082e,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x0417ecbc0e98564d665430bea4aaae,
                0xf940d5831cdff06fa86f09027b5a2f,
                0x0116,
            ]),
            x3: BN254_Fq::from_limbs([
                0x7edda1236c4dc94b63fa2b7a1d2ad6,
                0x62da662f8c5451796c6c7ae813b29d,
                0x21b6,
            ]),
            y3: BN254_Fq::from_limbs([
                0xd8825f0c11faafd43def9c98f1b146,
                0x8c2471d67bf25429ec3427625ebca3,
                0x286c,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xb20d8b2b8f8ea42d7235e4f2a8c935,
                0x2870ed8ca3a162ebf1f17502fdc052,
                0x0b7a,
            ]),
            x3: BN254_Fq::from_limbs([
                0x64248f6e52631ec88bf605c97fc328,
                0x689dc9bc3d0a98205499a178a8aeac,
                0x174a,
            ]),
            y3: BN254_Fq::from_limbs([
                0x1be5b6775bfca9359ecf3f68e4ab65,
                0x1f6790a591e87f34d21a0b98f4a72e,
                0x1476,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x88b154468b50e7a22c12ffb32a1be3,
                0xe62c4ca10058198a87f8a2fbdd2cb2,
                0x02cd,
            ]),
            x3: BN254_Fq::from_limbs([
                0x8c6523a232f572453d2deff355c75c,
                0x540210d494b43aeb15eeeb2ef63603,
                0x2ff3,
            ]),
            y3: BN254_Fq::from_limbs([
                0x563bb22213a9329830b24ea915c1f7,
                0x30f377865b391ff74c3e0636137779,
                0x15f8,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xbdf9acb717ef7981d7f658c464ef0a,
                0x4e98eee90b14ce7495be0cae513cb5,
                0x1a82,
            ]),
            x3: BN254_Fq::from_limbs([
                0x0dbbd7cd613526c36a0c8f8673d33b,
                0x1b72a2b148351edad338ff0edbc60c,
                0x1c50,
            ]),
            y3: BN254_Fq::from_limbs([
                0x3f501be3aef8cbaacaed1b5ab6d50c,
                0xea3a32dd17647215bce659b5af3bca,
                0x0ebf,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x01db3549bd46891e59267e1001f945,
                0xee6676ae3a63aeb022744641152ddd,
                0x21e5,
            ]),
            x3: BN254_Fq::from_limbs([
                0xfcb568d880b4def1203bf528b4794e,
                0x1213c60d9ad8fc9c933848c3fd848f,
                0x2cb9,
            ]),
            y3: BN254_Fq::from_limbs([
                0x7ebe3806e3a69effe300618876f1e0,
                0x147d4b949658adddb337c0cd538c89,
                0x2b08,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xc3dda48018be8dcf508d9f58e7fe8e,
                0x34974977f94fa999af8c87d6a5b58f,
                0x05de,
            ]),
            x3: BN254_Fq::from_limbs([
                0x811dad019f26712bc7d60c04d6455c,
                0x6c25a56f85ea8d6df6b9ea318bc98c,
                0x0e67,
            ]),
            y3: BN254_Fq::from_limbs([
                0xd2dc8b4873d5bfbb21bbc2e88e5056,
                0xfa49bec4eebbd7d8f16a4d516df102,
                0x1603,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x23c48645c50e1da0413e1222f1625e,
                0xb0b31351c3764af60c9d73f5e2e10c,
                0x11e6,
            ]),
            x3: BN254_Fq::from_limbs([
                0x2aca48fa0e8067c4a094fd001d88ff,
                0xe7642a208ac20d2466036e04bd9b55,
                0x2d3a,
            ]),
            y3: BN254_Fq::from_limbs([
                0x428f397794bff2d9eba437be2e5e36,
                0xbaafcd44bc9334c20d08ef28b2553f,
                0x0ab4,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x7158bf135b86120a83b15cd8ba639c,
                0x09f686e01184af818684ab5198a17d,
                0x244a,
            ]),
            x3: BN254_Fq::from_limbs([
                0x1358e9618154969a63189bf81cfaf9,
                0xbb67104cf55f93b9a5af538953b242,
                0x2e8b,
            ]),
            y3: BN254_Fq::from_limbs([
                0xc49b6628799dab8ed170036edc37db,
                0xa4bb10caec015d64681d11f5204e8a,
                0x1634,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x2a0c3f1de1b20de56053e553491f9c,
                0x2f49a135948b93eaaa07618051c94d,
                0x151c,
            ]),
            x3: BN254_Fq::from_limbs([
                0x45cc4dd48bdf6bfd938c41f7999e5e,
                0x8ab736b23316cb8e8b52c48969f4e2,
                0x1a73,
            ]),
            y3: BN254_Fq::from_limbs([
                0x4e8566eaa6b8c041428e018d304ac6,
                0x505cf0c830014472e73422762a86cc,
                0x2322,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x73944eb9d0778d87ae7af3f8a5496e,
                0xba2428160750889f3f7b4254bfd9bf,
                0x0663,
            ]),
            x3: BN254_Fq::from_limbs([
                0x6cf6ab6309c244e846eb83545c6631,
                0x7dad9fac11b4a462911e1eaac0b20b,
                0x2920,
            ]),
            y3: BN254_Fq::from_limbs([
                0xf5a5116c57d5908df0454e3dce51bd,
                0xf51cdab25371ef4d87a765b22f50ea,
                0x2de5,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xc3191f07ef84f2ee66db7b1625f70a,
                0xf7a0ffedb857ffa13528c230af8042,
                0x0a56,
            ]),
            x3: BN254_Fq::from_limbs([
                0xa5ec0d65c9bf774c8e3283786c51f3,
                0x86f4cadf093fb85af5af2af3cf1377,
                0x0531,
            ]),
            y3: BN254_Fq::from_limbs([
                0x684e7a3412d75120ab4eae193d830b,
                0x22c17c34945a3cc0f21ad7b7473b9b,
                0x249a,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xd7f3922f2cb8740fa972678bbef215,
                0x031acc23f33370d061e8f8b1f3d8ec,
                0x2567,
            ]),
            x3: BN254_Fq::from_limbs([
                0x4e4af6f6a3e8395031d3f90ff4c681,
                0x4a47fb6a970b26732cf15ba52b2949,
                0x07a4,
            ]),
            y3: BN254_Fq::from_limbs([
                0x3710592ca183cf550e555cc9e269a5,
                0xb93b763a42f288f38f75367233e12e,
                0x0107,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xd008413922684f696dc62e5115f826,
                0xcc872d2f9c39d1ed8b31e1dba04657,
                0x91,
            ]),
            x3: BN254_Fq::from_limbs([
                0x52ae447ce347d966f32e08534a60,
                0x10aa5d02f493d5d34e311b11d4c660,
                0x2d8d,
            ]),
            y3: BN254_Fq::from_limbs([
                0xbd4e300656979eb25728bef013dcfe,
                0x80e2444ae431aa737494aea4f634f5,
                0x29b5,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x85c162716ee371c5b35e1e56d07694,
                0x1ad1b631f441fb8895d5afbf885a0a,
                0x1897,
            ]),
            x3: BN254_Fq::from_limbs([
                0xefd24d7285736827c83b18b6838e00,
                0xc054e8543bccda992087a8b4d8ed01,
                0x11b3,
            ]),
            y3: BN254_Fq::from_limbs([
                0xc0c6c04f9a1b81a4a93485f1be23fb,
                0xd811c002faaee5e4a7a9894559a8f9,
                0x1731,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x3d2d9d7f192f75fe96445ac29189aa,
                0xab7f037de98036f7505051b3ef29,
                0x0fc5,
            ]),
            x3: BN254_Fq::from_limbs([
                0x2a9afc83b5b000799d5c5f64c3a115,
                0x997b732af0c79e2d3cf1bf63578495,
                0x11c7,
            ]),
            y3: BN254_Fq::from_limbs([
                0xcc6583bc9f32ef28f701c9819bf203,
                0x50b1fe6e07a9a25a54fd6341a44c8a,
                0x270e,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x7e9fa86e0eca0aafe5d9eb148d680c,
                0xba40f4e9a685d1ba2bc6bf20502fc8,
                0x2f97,
            ]),
            x3: BN254_Fq::from_limbs([
                0xfcbde5134233eb279e05fffe33ac48,
                0xa0a557ee8e9a6d939c6f4ef60380d5,
                0x09bc,
            ]),
            y3: BN254_Fq::from_limbs([
                0xf04e580c0f4242721e8b99a6e4319d,
                0x09526830e16a80924a0d051c6c38c8,
                0x114c,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xfbd5e179e20ea95fb5cb8de288311e,
                0x797622cfe5980ab2f328a6d44ece55,
                0x2fe7,
            ]),
            x3: BN254_Fq::from_limbs([
                0x4cd9263722d6dc295053d865a71b4b,
                0x09754ab3762df5f51d7005bee706cc,
                0x16ff,
            ]),
            y3: BN254_Fq::from_limbs([
                0x4edf1d07ede2469755eddb5c5dab9e,
                0x78c6af135040abdaa0e670b73425c3,
                0x0201,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xd36fd823567c85daf814a889458468,
                0x785a9e8c7b2d1379ab3f7302f9a508,
                0x1f6d,
            ]),
            x3: BN254_Fq::from_limbs([
                0x8d83601a50ff3e943fe93abdaf63ef,
                0xe618ca8f5f4b796ee88bb36b690004,
                0x88,
            ]),
            y3: BN254_Fq::from_limbs([
                0x04f730c8ce1c28ecb253ef12028a5c,
                0xd4006cd3d5e7e747302ed7d77fbd73,
                0x089a,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x90204586a984315866b2030e554cd8,
                0x5653153e5389df812d5f8a9395751d,
                0x1e2d,
            ]),
            x3: BN254_Fq::from_limbs([
                0x306013a01cda769d95a193ccf42668,
                0x22981def0381a4a49d16b36c93e786,
                0x1b7c,
            ]),
            y3: BN254_Fq::from_limbs([
                0x0f9f29f0fda409e491db3440c3b555,
                0x52ad6d181dc2b2396d5ed16da1d3db,
                0x1ce6,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x80ebe9379096cd4e35bd6f3ee3f077,
                0x76076dde149a8e1708385ab0460150,
                0x2ded,
            ]),
            x3: BN254_Fq::from_limbs([
                0x705f00758beb37bbd7164270251c80,
                0x887bfccec0c8a81d9eaa262812ad9d,
                0x1a75,
            ]),
            y3: BN254_Fq::from_limbs([
                0xd80dc066b002709ac55149666576a7,
                0x28ba4509e785061b4ba7897290b513,
                0x1a56,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xc74a894aeb2a7b9e423986644728d6,
                0xbc324b35ebc5f47fda6909f40e39e2,
                0x1317,
            ]),
            x3: BN254_Fq::from_limbs([
                0x3792d494f567b229d02c784866e7c9,
                0x994786a2a45b8f9d3962a937258bb5,
                0x297e,
            ]),
            y3: BN254_Fq::from_limbs([
                0x82a888f9ce0c348e438f6cf546291e,
                0x56831cdc927c2db950901cc2d03a2f,
                0x2279,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xee4c3fd39e3ac1b77716d13ec9455e,
                0xfe34e1487e4ad8a5a7682e259a3dde,
                0x0d98,
            ]),
            x3: BN254_Fq::from_limbs([
                0x40523f1e4b408405d88fb0ed9226eb,
                0x22b1005861c4bdf816bc93b591d4b4,
                0x0d39,
            ]),
            y3: BN254_Fq::from_limbs([
                0xbc7e0c4a9eba5eaf4bccdb21b11257,
                0x0ee91b781fc9e5b2709be72abd71b1,
                0x0de3,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x2590d25c6170a875f609fa8fa4a408,
                0xf90a1fbbe6ec4dcb780d5f8eacca1e,
                0x2db8,
            ]),
            x3: BN254_Fq::from_limbs([
                0xe9100a8e382dd68c0ac58c1b828dc9,
                0x90a4c19ad676ad53c9191975f7d77f,
                0x0c19,
            ]),
            y3: BN254_Fq::from_limbs([
                0xcb2b659dc424ee48c38d1a7fc6c459,
                0xb2215938fea204491c29d45641cb25,
                0x0c71,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xad31be9a4188e76a60cf7791d083bc,
                0x5a94d536664860f9fcd869c8be3b6e,
                0x2115,
            ]),
            x3: BN254_Fq::from_limbs([
                0x21cbe05ea0ab3fce600b3aadb06183,
                0x5afa6a7b9626879a01ae5c065c1a52,
                0x1630,
            ]),
            y3: BN254_Fq::from_limbs([
                0x32ccad1e32bfb20bd6bd105acb3412,
                0x589eb20a77c7bd9707ff80353f46b7,
                0x1609,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xbca9e0dcc9797de055f33197049fad,
                0xa1645e095eebb2884cdee196c82dab,
                0x0f20,
            ]),
            x3: BN254_Fq::from_limbs([
                0x012e75d21788535845994d3b85cd2c,
                0xfa3bb968685ad123b315b9c2115ce6,
                0x1830,
            ]),
            y3: BN254_Fq::from_limbs([
                0x1857b996fb914b4271d20c0989cdf6,
                0xfa260b429e5c3e98faa7f79558c064,
                0x0e88,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x1c4f6525a31f6344d2b3b59f02b90b,
                0x3b19b015d5ecf1a580d7cf1c547a62,
                0x20c3,
            ]),
            x3: BN254_Fq::from_limbs([
                0x0fafaaedfdee8dbc5295c8fd48b69e,
                0x3c5dda48be3892c722cf2386fa5dd8,
                0x28c3,
            ]),
            y3: BN254_Fq::from_limbs([
                0xe76924f259cbce309499939d7cea21,
                0x12bed2939c522911246a0ef27bb7db,
                0x0722,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xec1ca8b415203cdf5fa4ca3a9b395a,
                0x642c83c64f6a4bf8178373c9d36565,
                0x1bc0,
            ]),
            x3: BN254_Fq::from_limbs([
                0x263f1c5d37992d239ec8787465992e,
                0x093486e2f1a54a4d27baecb5485266,
                0x2c95,
            ]),
            y3: BN254_Fq::from_limbs([
                0x053df9453f7797addc66ce21be5cda,
                0x7aef4dec4bd15d83717f82e9f37eab,
                0x2271,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x9f2843ff9885fc71c4e41f99edeb52,
                0xd3ba7a2ba0184a329db8bfc1e850e1,
                0x17c7,
            ]),
            x3: BN254_Fq::from_limbs([
                0x2b1d7333429b4c0533d929328fb0d8,
                0xdf9f6b4e43c5905f1230c6349e8df1,
                0x2bf3,
            ]),
            y3: BN254_Fq::from_limbs([
                0xfc616fde517cee25f9b185e080adfd,
                0xd1150b2178c20b5fbd9de6cc970f90,
                0x2ec8,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x0d5ea69d99c3d47e766308e2bf6d22,
                0xa5e1f27be5c680b7d66e242b2e84be,
                0x2eaa,
            ]),
            x3: BN254_Fq::from_limbs([
                0x5c171cf2b3938305bfcba5e624f45f,
                0xd297850486e2c202b969d8e76a2cc0,
                0x2022,
            ]),
            y3: BN254_Fq::from_limbs([
                0x113ff509211d03c06a12acade63874,
                0x9fd45eda5c772211af7c7e107b8a43,
                0x2f88,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x603d92a866f478d6cb78cf61f39b23,
                0x16404a5361b1bf5adb8d125b2d0152,
                0x1eca,
            ]),
            x3: BN254_Fq::from_limbs([
                0xd4a443a5fa82e2701363e7b9c92af2,
                0x017f43059c34813fc36c8d5d7eb337,
                0x0711,
            ]),
            y3: BN254_Fq::from_limbs([
                0x73e33c057042306b9e3fe64c0768f6,
                0x7c4bb0a74022973c4309480f0e3278,
                0x0e39,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xf0beb6fa959dac9ab8b00494a3316e,
                0x663d1bf923fb2cc650ef08cff06e94,
                0x2e4b,
            ]),
            x3: BN254_Fq::from_limbs([
                0xf809ccc3f3d39db03e37a4363c38ce,
                0xed799520150140ee0fae4f4ef3375b,
                0x2b98,
            ]),
            y3: BN254_Fq::from_limbs([
                0x15d2830a3e2915bd3a187c5da7c3bd,
                0x0fffc64f4dc5c914b86cb7e694c151,
                0x26b9,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xd14a65f5be3fe49c6242072c259122,
                0x381f03a7b18da02893e9e6080cb545,
                0x2fcc,
            ]),
            x3: BN254_Fq::from_limbs([
                0x1c61430f50fc5732422242caf0da35,
                0x392fd14b54a60a20d7195e3515fb4e,
                0x06e0,
            ]),
            y3: BN254_Fq::from_limbs([
                0x2d7a54b693b769c0f0d2ec474e1f16,
                0x78690e51f627e43948bbb3dce35832,
                0x304f,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x06a952a986e65deb2d40cb8c27d824,
                0xb026ac12cf61ee4820e80d15e2921e,
                0x2e5b,
            ]),
            x3: BN254_Fq::from_limbs([
                0x6bb8c8c64e1b725c66809969fe5380,
                0xa2e17ed8728a05a24b071507a2a496,
                0x2b0e,
            ]),
            y3: BN254_Fq::from_limbs([
                0x3c06bf775102de7a3583edda5a410c,
                0x5e67589bc59c13c2d347c032197b41,
                0x287f,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x78f523abd19bb62ba7b4640be70328,
                0x5857ce275a2bf3652d6c5513f041f4,
                0x1580,
            ]),
            x3: BN254_Fq::from_limbs([
                0xd8ce8fd7eeb9762c32d690b3ba9f91,
                0xa6a962059a917cd8282ee7e529ef64,
                0x035e,
            ]),
            y3: BN254_Fq::from_limbs([
                0x93122aa9de5e179fa8501b8a849300,
                0x1a25679067a3badb6b303900d2dfbd,
                0x2b32,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xb0c9eade36920d4535e6be58d3032d,
                0x50d0f6377972020df1b478fa703e9c,
                0x03de,
            ]),
            x3: BN254_Fq::from_limbs([
                0x0b270959de93065bbe8bd4237c0fd9,
                0x4a246cd4688844265dbbcc2e075b91,
                0x0e4a,
            ]),
            y3: BN254_Fq::from_limbs([
                0x8dfa9a437a441558db3f31c6f67358,
                0x24e65ced5d0f5ee5e30592994bf17a,
                0x14ad,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x3d5ceb456e88eef9b401fba598dd1d,
                0x717894701e4f192273cb1816fb4fb9,
                0x25c6,
            ]),
            x3: BN254_Fq::from_limbs([
                0xa48f355cecad755970653fbc2a9d82,
                0xe2eb5f12ae098bccb130bf002e6f49,
                0x0fbc,
            ]),
            y3: BN254_Fq::from_limbs([
                0x7ce3fa8e5d8079e14c715b226b5df7,
                0xd7de78359d89cd288edd0d3896badc,
                0x2c9d,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x17ae1ee2aa82f8b989f7360c8440a5,
                0x01927314bda23fcc0252b331138dc6,
                0x18d5,
            ]),
            x3: BN254_Fq::from_limbs([
                0x983a331910af7ec32b20f96ad06210,
                0x350de6383d17d68547d2a4c256a6da,
                0x0309,
            ]),
            y3: BN254_Fq::from_limbs([
                0x7ccfeb46aa9c30e976e855087eb12a,
                0xb0091f515ea4e78b802ed713e37f60,
                0x218b,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x9e7a8158522931db511d6c4ae5c660,
                0xa93a1f733f59bc4a31f656a7e02b6d,
                0x1bad,
            ]),
            x3: BN254_Fq::from_limbs([
                0x2d60d82ae546bf71ea9bc7c0ad0484,
                0xe54395a7b29857f673ece32f80f275,
                0x0b0b,
            ]),
            y3: BN254_Fq::from_limbs([
                0xe2e57bc6043c53f6c59b3919f964e0,
                0x4ae6914052390172c0a8600cf67b02,
                0x0279,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x4f6d8c813680eff55d67b7c220d8a1,
                0xfa2aceb2aee0b22c83c8eeba3c17a3,
                0x03e1,
            ]),
            x3: BN254_Fq::from_limbs([
                0xf06c80c327b836d5afdcd35cacd71d,
                0x24f3cbdc46c777ff1ed77bec286607,
                0x293e,
            ]),
            y3: BN254_Fq::from_limbs([
                0x98c85f255a656a80bd6e1d6fd8138f,
                0xf693d069855d7a178cdd277e41ddc1,
                0x0b73,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xe371c336c0c459525c9a483baa9181,
                0x5b43c98f23bd7509491a155b64749f,
                0x2b81,
            ]),
            x3: BN254_Fq::from_limbs([
                0x3e086fb016311ae95f07110168eda9,
                0x902c7bcc432f9248c150730abef39e,
                0x21a8,
            ]),
            y3: BN254_Fq::from_limbs([
                0x21f59c9a5f571edc2fcec51005ad,
                0x1eb5b084538403817e1a8a619491be,
                0x0b65,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x8941cd70fc712c6e5cda152bea870e,
                0x4e92387d1992c57c9546325bd28f63,
                0x16da,
            ]),
            x3: BN254_Fq::from_limbs([
                0xbcae0e1519cab926f32cb3039ba130,
                0x458dc5632c55564e837ec7f25675c5,
                0x141b,
            ]),
            y3: BN254_Fq::from_limbs([
                0x0e6e8339f44291328b6bde36e4125e,
                0x05dfee227d0e7fa94fb1bda4292c2c,
                0x1fa9,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xa1de6d4e2be7436db829f50a0eaadb,
                0x2d21068e14ebb7b8310e41a8dbbe66,
                0x1799,
            ]),
            x3: BN254_Fq::from_limbs([
                0x327ae734108f96d1cf440a80ea327e,
                0x53dee4570f38e81d255064a7f2efe8,
                0x0dd9,
            ]),
            y3: BN254_Fq::from_limbs([
                0x9580e4a7824837d7449c83abff45b8,
                0x5a369a6d7b1c87d01ed09ab9549020,
                0x1afe,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x37fa30515880d7c00ba3025fb7d24f,
                0xe4c89140416e51935d4bd564177cbe,
                0x1c1a,
            ]),
            x3: BN254_Fq::from_limbs([
                0xd675f876bed32cf98f4d009859e9bf,
                0x8a439059ba7c5098693d23636107cb,
                0x2fc4,
            ]),
            y3: BN254_Fq::from_limbs([
                0xb13e44666f52eadaa3726316d83f54,
                0x9968e53ccbe698cf7f3b0b8fb42bb1,
                0x2d03,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x2f890e6a0012fcca96a6fb618d4af2,
                0x5f8c94490e86ab47e4e3d8a7a08038,
                0x2647,
            ]),
            x3: BN254_Fq::from_limbs([
                0x026675d3c8717ebb3f3b8733c69bec,
                0x03a7804731142dfdb418599e14f544,
                0x0240,
            ]),
            y3: BN254_Fq::from_limbs([
                0xc5758f7503901e887c67dcb57dbeff,
                0x875f8eef17a927db7ca7cc760d8a87,
                0x2f20,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xc5bf422c07f6d92c5f189d399c5f92,
                0xd8e7c7cf28e0e90c4ef0801a3bd3ba,
                0x2a37,
            ]),
            x3: BN254_Fq::from_limbs([
                0x52b18eb37f0c6a4ec3ef6f7bfb0db3,
                0x9e5d51335b5a205478fb5751c38ae6,
                0x0247,
            ]),
            y3: BN254_Fq::from_limbs([
                0x3b8a2ef66f8b6e94ba4f14d4fbf03c,
                0xe388fa948618b2fe786cd76af049e2,
                0x050a,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x6b79b443e4f0a29b433e5f314ac7c4,
                0x18859586d896a157d758e105c9adfc,
                0x07d2,
            ]),
            x3: BN254_Fq::from_limbs([
                0x06f2fb87fe1381613b83ed043abd76,
                0xeace47868f2dfd40d10b588bbf3045,
                0x1e73,
            ]),
            y3: BN254_Fq::from_limbs([
                0x1f0bb185aa2a79f6f295e4ad77c581,
                0xf3011c971c84c673eba47ebb3d4274,
                0x075f,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x36c44b6c3332ccfbd2ea25e2a9f022,
                0x109061c72cbfa58902af84a8907264,
                0x2e08,
            ]),
            x3: BN254_Fq::from_limbs([
                0x3334189621dfc7d3c7c4f06f738c4a,
                0x93f64ac936794e22d3f467c4d65d3b,
                0x07aa,
            ]),
            y3: BN254_Fq::from_limbs([
                0xf0adb6a2dedb4ad631ac64fd964bf4,
                0x3ee641197350149bfbcf4651c0a236,
                0x1f45,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xeb98447df001d62cda76b5039229c9,
                0x3f5c593cc5118e668c85c3bc85ba88,
                0x1c89,
            ]),
            x3: BN254_Fq::from_limbs([
                0xe9dad5bc5eddc82be56e830369eb2b,
                0x3e92c727ac3c59e483f2e2ba699a30,
                0x277b,
            ]),
            y3: BN254_Fq::from_limbs([
                0xc4f4e57585a27f22fa8a105b320c3d,
                0x298b1c1c4f873b21731a6b16ebfdb3,
                0x2358,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x942712a251545a925f7eeaeaabcfa5,
                0xe4393b4f53ea495b84392ded824040,
                0x0b69,
            ]),
            x3: BN254_Fq::from_limbs([
                0x622d5737deed99011f22863985418d,
                0x055afa3ee92760f4fad3de3e9be213,
                0x2c70,
            ]),
            y3: BN254_Fq::from_limbs([
                0x8af1df70915bee6f5ef48680f6ff80,
                0x53523037bddea92b1defcdaf80f4c5,
                0x11cd,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x9a95b6443acac747058d5ed287eaad,
                0x6c257bf2c7cc1aa4f426054fb19719,
                0x2eaa,
            ]),
            x3: BN254_Fq::from_limbs([
                0x2e1058ffc2b3626bbbbd6c81522710,
                0x126d5af482d4f6e72d04b90f770ab3,
                0x0ab6,
            ]),
            y3: BN254_Fq::from_limbs([
                0x1a298fa939431556f33d974182f93b,
                0x0bcb6f88475f71cc44a06eeb632fbd,
                0x21e1,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x0933f0496cf65f0346980d1c8630b1,
                0x36b51299257b1642121b041f65bb41,
                0x0ca5,
            ]),
            x3: BN254_Fq::from_limbs([
                0x2d3d02e8fd91d3ddb01c4c43aae3e1,
                0xedbeb501e415987e02aa616b9ee19f,
                0x0fdd,
            ]),
            y3: BN254_Fq::from_limbs([
                0xe2b0d1a5c6a95d80561a92f2b0148d,
                0x81461760001c95622c0b0fe714b9a2,
                0x07ec,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xd76482e4d0ecc13d42faaa5f604fd0,
                0x0c1ebc67b103760f4e9a4d2b4236c7,
                0x13ab,
            ]),
            x3: BN254_Fq::from_limbs([
                0x52b5dd981077429b1e6aaa97093a84,
                0x621cb6d65e3278aad32327d60452a4,
                0x1de4,
            ]),
            y3: BN254_Fq::from_limbs([
                0xc6070cb04332c7ce2e399ddcdedd7b,
                0x64e138364c711cd6425ef42e9f1516,
                0x1558,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xb5da86a65096a649d22cadc0e24515,
                0x9ee99c8d80e93541a26c1e9ddbba2d,
                0x26e0,
            ]),
            x3: BN254_Fq::from_limbs([
                0x2f796c7c7a50e155fdbee014cc7c6d,
                0xc8165ba050c25d2e1df39fdc2d2519,
                0x1a39,
            ]),
            y3: BN254_Fq::from_limbs([
                0x398a26fbe661c81965db1b28eeaf30,
                0x6458d7d4b9cb7c6c79bd6c886c82db,
                0x0c46,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xd4704cb17077adf193d67ee06cd08c,
                0xbd8f148a1eed8d7fef8606694d58cf,
                0x16fb,
            ]),
            x3: BN254_Fq::from_limbs([
                0x0bb54bbc5288fb1ab260b313f765d1,
                0x03b36d0ee3ebf11dbaee5e4be78060,
                0x22ae,
            ]),
            y3: BN254_Fq::from_limbs([
                0x5581785ab5bfda487bec86fa5ee0c0,
                0x8a6ec05cec1386516bff00f2b0dc55,
                0x0445,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x6f070ac2a46cbf416b2ed962787e7b,
                0x05b396a7d397521ab4051b98f0b226,
                0x26e4,
            ]),
            x3: BN254_Fq::from_limbs([
                0x50c918234a00bd6d76728f50d78832,
                0x87fb0fe407fb26d461f020ade4f9dc,
                0x1631,
            ]),
            y3: BN254_Fq::from_limbs([
                0x0ca48e6aa4182d5a5124e00f31984d,
                0xb3ef32c244d0d87ab3667cfa3bd58c,
                0x236a,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x948d93c0bfb26dca660f7353e1036e,
                0x2248e4898874d944ad97f56823942e,
                0x1f71,
            ]),
            x3: BN254_Fq::from_limbs([
                0x044c80145a181def3bfe7bded22570,
                0xc03da842b5758345f838e6ab8cba50,
                0x22ed,
            ]),
            y3: BN254_Fq::from_limbs([
                0x521fcc4ff9faef0fceace47881d743,
                0x9587c4ca9ac2b117fa7e747a8fa107,
                0x10f8,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xf09e1b6b7ea334c378427fec122059,
                0x67654782157560a551adefe1adecb3,
                0x0dcb,
            ]),
            x3: BN254_Fq::from_limbs([
                0x9043191252e6c621eff524b66a5098,
                0x488651afacddd6d47fb78591e758c0,
                0x1fe5,
            ]),
            y3: BN254_Fq::from_limbs([
                0xbdd3854773e44bab603b68fe5455ac,
                0x6956802ab0807e1575740289633ee2,
                0x22a7,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x65004c8cdd14b8aedef08e2d01d07b,
                0x2ca889f674e704b240189cd71e948d,
                0x0931,
            ]),
            x3: BN254_Fq::from_limbs([
                0x6dd6ae92f9a1956b77f2b73dda7fb9,
                0x46282095daacb03cd3dc8c038705fa,
                0x12dd,
            ]),
            y3: BN254_Fq::from_limbs([
                0xb323e5a6482584c8932a0574fc620d,
                0x33090a100bf57b8a5853e23651a978,
                0x11b1,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xea799e0eafe5ed12046e2920886aa8,
                0x210a9a9b39a0eeedbe902f240dd97b,
                0x0b8d,
            ]),
            x3: BN254_Fq::from_limbs([
                0xe79c86d2d69cba66a6caf706011e06,
                0xbaf3769f456539e365e4ba2a5d66f4,
                0x08bd,
            ]),
            y3: BN254_Fq::from_limbs([
                0xf4a8902e8c234aec1b1511d28e6164,
                0xc8469c7eabcab5a896c4969fb1f2b8,
                0x2392,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x6a4596f6ad1cd08c221800c3225771,
                0xf0152fe29275b402f9c034b1054673,
                0x2b92,
            ]),
            x3: BN254_Fq::from_limbs([
                0x4085099db2c83e592e6b1c5d480af7,
                0x9c14e0a91b350c12641660f709cd32,
                0x1ebe,
            ]),
            y3: BN254_Fq::from_limbs([
                0x7a227de70e44b78ddf6b2c657dbf6a,
                0x17393b03591e43bcebb1a99e7245ab,
                0x0f0c,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x3a20a46d38430993a60bcc93147692,
                0x027330c459ada744215cc7d74b0846,
                0x0121,
            ]),
            x3: BN254_Fq::from_limbs([
                0xfa2909b2b86109f02e546c1ce8ac4d,
                0xdc21aca3e09aba81661353272e3aa5,
                0x178c,
            ]),
            y3: BN254_Fq::from_limbs([
                0xfa7716f05f0169468cdfa86ca8d697,
                0x589ab4a6bcc7af471e4a23c73d2291,
                0x10ed,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x0fa7fa0f8a1f4efc6dcc3baad9a9bf,
                0x8cd8467498d73372d64c803512d949,
                0x0687,
            ]),
            x3: BN254_Fq::from_limbs([
                0x6a832a6862320566a2973c5cf82292,
                0x1096578b7b27eff78ee057dcba1316,
                0x0f05,
            ]),
            y3: BN254_Fq::from_limbs([
                0x9ef4e66aaf96d264a170b8775c8a04,
                0xa110f4c6b578f071ca7e96381dafe1,
                0x25c6,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x02a47fd3e71749d8bb1f3c531ebd96,
                0xf7ca5530f502b84797d2bcadaa57f5,
                0x2b22,
            ]),
            x3: BN254_Fq::from_limbs([
                0x99400656f6e13a46c77455973f34b2,
                0x64ee2039a194e5129d5c59a906e78c,
                0x27e1,
            ]),
            y3: BN254_Fq::from_limbs([
                0xe2310296be4ca1a64635037e549bbc,
                0x979f649446cf1b7a3fec89c715aff3,
                0x18b1,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xa2a8f8fd005cc83b624d65f4be474d,
                0xaa633c9782829a32f67e1396225b9a,
                0x2f55,
            ]),
            x3: BN254_Fq::from_limbs([
                0x6018c5134cb3d2f7024de482823986,
                0x06e93484c8af25551b3d1294b9aec5,
                0x2bd9,
            ]),
            y3: BN254_Fq::from_limbs([
                0xb4b61037dc0b20221c081cd5d2f2a4,
                0xc49f0ea3af282df3d6f5fef5c9c7b2,
                0x15c9,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x6a1f176726123aa6abf632455b2f4a,
                0x5c2fdc9941c2b439e674082d509795,
                0x2e2b,
            ]),
            x3: BN254_Fq::from_limbs([
                0x67fbfac3f8b27047794b394320d672,
                0xdf58bba819824130a43011bc1de1c1,
                0x1add,
            ]),
            y3: BN254_Fq::from_limbs([
                0x38cea53f82301ff34957cd0726bb3a,
                0xdb6843a4c2551f3dfd2d1db481e483,
                0x0184,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x3cd73a4c620eb27d1f55e33a7ab6d5,
                0xc65a8c6b4f577fb9eca0fb0696ee28,
                0x15d2,
            ]),
            x3: BN254_Fq::from_limbs([
                0x6a6b9ea445a6941547f0ae0d4f54a2,
                0x38e42bdf1c41583137a62260efdeb4,
                0x0fd6,
            ]),
            y3: BN254_Fq::from_limbs([
                0x479c627930357dc990c1f6742570bb,
                0x190fd31e8115cffb9d0f1895972f7f,
                0x2855,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([0x00, 0x00, 0x00]),
            x3: BN254_Fq::from_limbs([0x00, 0x00, 0x00]),
            y3: BN254_Fq::from_limbs([0x00, 0x00, 0x00]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x9d52508cd9573de16080282bfa96d6,
                0xb147cab694c6a3805d1bcdc011a909,
                0x0c03,
            ]),
            x3: BN254_Fq::from_limbs([
                0x7816a916871ca8d3c208c16d87cfd3,
                0x44e72e131a029b85045b68181585d9,
                0x0306,
            ]),
            y3: BN254_Fq::from_limbs([
                0xdac647851e3ac53ce1cc9c7e645a83,
                0xdae6d3272396d0cbe61fced2bc532e,
                0x1a76,
            ]),
        },
    ]
}

pub fn get_msm_transcript() -> [AffineTranscript<BN254_Fq>; 397] {
    [
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xa10fed0e5557e9ed186911225dbdf6,
                0x3ad628e5381f4a3c3448e121024631,
                0x244b,
            ]),
            x3: BN254_Fq::from_limbs([
                0x7816a916871ca8d3c208c16d87cfd3,
                0x44e72e131a029b85045b68181585d9,
                0x0306,
            ]),
            y3: BN254_Fq::from_limbs([
                0xa6a449e3538fc7ff3ebf7a5a18a2c4,
                0x738c0e0a7c92e7845f96b2ae9c0a68,
                0x15ed,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xc00abe4b1758e322f990633ee9a75f,
                0x29358c6b59547bbabadd17120cc967,
                0x1d78,
            ]),
            x3: BN254_Fq::from_limbs([
                0x15d84715b8e679f2d355961915abf0,
                0xbf9ac56bea3ff40232bcb1b6bd1593,
                0x0769,
            ]),
            y3: BN254_Fq::from_limbs([
                0x9e63b40b9c5b57cdf1ff3dd9fe2261,
                0x99bee0489429554fdb7c8d08647531,
                0x2ab7,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x72b9f3808718fe684d12d83dc08dda,
                0xb797531bb4e285d30ad3952c471b2f,
                0x10b6,
            ]),
            x3: BN254_Fq::from_limbs([
                0xe4ded88953a39ce849a8a7fa163fa9,
                0x39df0efee0f766bc0204762b774362,
                0x17c1,
            ]),
            y3: BN254_Fq::from_limbs([
                0xaa9258e0b959273ffc5718c6d4cc7c,
                0x559bacb160664764a357af8a9fe70b,
                0x01e0,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xae9fa3f986e2d245d1e1bc343a72aa,
                0xc360d412b0fe3d20bd5db89fdee434,
                0x020d,
            ]),
            x3: BN254_Fq::from_limbs([
                0x6fc6ecb801bd76983a6b86abffe078,
                0x2b2ed3bb8d759a5325f477629386cb,
                0x1707,
            ]),
            y3: BN254_Fq::from_limbs([
                0xfe3bf05d18f41b77809f7f60d4af9e,
                0xda6cd130dd52017bb54bfa19377aad,
                0x168a,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x52f71f922c0f09669148516890a6e5,
                0x379af8205bfa93fc06e865ca7f4ac2,
                0x0b0f,
            ]),
            x3: BN254_Fq::from_limbs([
                0xc710b7e616683f194f18c43b43b869,
                0x30ea8dff1254c0fee9c0ea777d29a9,
                0x0397,
            ]),
            y3: BN254_Fq::from_limbs([
                0x6982d65b833a5a5c15bf9024b43d98,
                0x5ffcc6fc7a28c30723d6e58ce57735,
                0x073a,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x08c3cb820e33e55ecf63ae00695045,
                0xe6e9a11455b8b485c3f183820f6cf3,
                0x247b,
            ]),
            x3: BN254_Fq::from_limbs([
                0x82477fe92ac12ca8b71f80fc3d49ef,
                0x705537b009189da8808651eecdb824,
                0x2a14,
            ]),
            y3: BN254_Fq::from_limbs([
                0x618c779fd4717db6177e19ea67ec38,
                0xee7f243ea8b38e1ddf14029258877a,
                0x2df7,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xedb67a530634c48c5fc23c0b382d8c,
                0xd3fff57f27971a9f42ea5109e30d79,
                0x02f0,
            ]),
            x3: BN254_Fq::from_limbs([
                0xb8c3fdb41469e408b529e030f52f3f,
                0x6f8cc8a7a4f10f56093465679f17f8,
                0x05e8,
            ]),
            y3: BN254_Fq::from_limbs([
                0xc8738f715417dd6f020725d22bcd90,
                0xbd14bbc09767bed8e913d3ccb42b2b,
                0x2857,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x9930e15507376319c9fa848fd40dbf,
                0x389ceeaa33ec04a02ff1a9f0919d76,
                0x0943,
            ]),
            x3: BN254_Fq::from_limbs([
                0x983a336903524fb05dcd507457f63c,
                0xb121486ab9da7bf549e57d2f8a6cc1,
                0x2d96,
            ]),
            y3: BN254_Fq::from_limbs([
                0xc9b52e3eca22fae279459920daa7e3,
                0x45731979ca35dfde49a476e273a1b1,
                0x1dcb,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x87522daf326cb92dafa7af530442e3,
                0x542101dbdfa454d430ec0a3baea619,
                0x01a6,
            ]),
            x3: BN254_Fq::from_limbs([
                0x592b83ee6599824caa6d2ee9141a76,
                0xb64af8f414bcbeef455b1da5208c9b,
                0x06a7,
            ]),
            y3: BN254_Fq::from_limbs([
                0xe99198c18a74286d979cbc9695cd8b,
                0x2f54436e7da803601aec9cf8740c,
                0x277d,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x8cb1c276059141a54730025f8382fc,
                0xc87c436578c2b387b6caf1d99f7a75,
                0x0982,
            ]),
            x3: BN254_Fq::from_limbs([
                0x719215d3b32a762afe3d5b8c684af9,
                0xca411a3f52f4e0792fd9e792779856,
                0x09f4,
            ]),
            y3: BN254_Fq::from_limbs([
                0x0dc03825d3a3fa9f1127bea408237f,
                0x5a9b4b84cb765b0cdf0b5e9cab2a45,
                0x22d5,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x8d7c281ab70f5cc021a05e1375a564,
                0x942ab012fa4e95d296cdc691b23023,
                0x1eef,
            ]),
            x3: BN254_Fq::from_limbs([
                0x7fa518f4ca7904c6951d924b4045b4,
                0xa257b99f1ad804a9e2354ea71c72da,
                0x09d3,
            ]),
            y3: BN254_Fq::from_limbs([
                0x5ca0820162ffa539fff0f1bfb032db,
                0x6d47fd34168c627c612e877118c87d,
                0x1918,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xdb6b14fc008ac89c433bb57b6c8d84,
                0x304f6cafa79ca83ddb37e137a8dad9,
                0x1479,
            ]),
            x3: BN254_Fq::from_limbs([
                0x7bffd1ca57c37fb5a49bd84e53cf66,
                0x2bb17880144b5d1cd2b1f46eff9d61,
                0x15bf,
            ]),
            y3: BN254_Fq::from_limbs([
                0x603bb132183cb5d9d4758d44abc7e8,
                0xd4f34450ceb93471928b234a65736d,
                0x2bc7,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x4ef5c26971bb0139f84e37eadd9603,
                0xd30a18e3b6590162a1ab8fd96ca322,
                0x1e18,
            ]),
            x3: BN254_Fq::from_limbs([
                0x6b02bee047cf401e8db90d73ce56f7,
                0x7ba68f840c758c76373cd37b2cd78d,
                0x2dbc,
            ]),
            y3: BN254_Fq::from_limbs([
                0xc61fe9a366ae76ad545a8367f45f65,
                0x4dda6250c53fbe5cd7977c72a5fb7a,
                0x2a3c,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x0afdb5736afb7a60a19b556ac74c81,
                0xd73cb6846637f2d57f73fab3c61c33,
                0x0c3e,
            ]),
            x3: BN254_Fq::from_limbs([
                0xb23b29af52a8ab9d271c846c1f2075,
                0x4997b1e4f7710df6e925b259327d9b,
                0x22c5,
            ]),
            y3: BN254_Fq::from_limbs([
                0xaaab845733848d69416b4bfbb5b45e,
                0xd7f015d9e1948b66be6fa54e35bdda,
                0x0610,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x30cbb28296eecdf7dce5ffa6350974,
                0x8e5e137b73bc93c564461f5d4f1dcc,
                0x1d7c,
            ]),
            x3: BN254_Fq::from_limbs([
                0xfda280d6f24bdc4401a7c6a9aaff95,
                0x76ac50cfe84a38ff57f1e301671a5e,
                0x1331,
            ]),
            y3: BN254_Fq::from_limbs([
                0x71df015c84a6ffd3deacc21198d231,
                0xfc9513268dd9f8d3dd15daa9f83777,
                0x08e5,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x9b8ac0f07794d03b1a72b5f979ccc9,
                0x55ad20ec72541e0106579cb77481ce,
                0x22c7,
            ]),
            x3: BN254_Fq::from_limbs([
                0xb019feb45f833a876e93848625f5ae,
                0x83bfa420b15a4c11f66a3cffd55318,
                0x0360,
            ]),
            y3: BN254_Fq::from_limbs([
                0x980877e04f957866b3e3636da05f11,
                0x8b2a2117dc3c01005f8c02ef44fbec,
                0x0a33,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x8e6111bb6072b6104efcafca7fa6a0,
                0x1a40abfecd3902bb1c8e3868f2f06a,
                0x0e96,
            ]),
            x3: BN254_Fq::from_limbs([
                0x15d84715b8e679f2d355961915abf0,
                0xbf9ac56bea3ff40232bcb1b6bd1593,
                0x0769,
            ]),
            y3: BN254_Fq::from_limbs([
                0xe306dd5cd56f356e2e8cd8fe7edae6,
                0xb4b400e90c0063006a39f478f3e865,
                0x05ac,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xf3097fad1157d72bd18f670dfd56a7,
                0x34323532d2f0b59529284918656d2c,
                0x21ce,
            ]),
            x3: BN254_Fq::from_limbs([
                0x719215d3b32a762afe3d5b8c684af9,
                0xca411a3f52f4e0792fd9e792779856,
                0x09f4,
            ]),
            y3: BN254_Fq::from_limbs([
                0x0dc03825d3a3fa9f1127bea408237f,
                0x5a9b4b84cb765b0cdf0b5e9cab2a45,
                0x22d5,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xa711995d02486a9647ed2f531d98f1,
                0x971a20c81ef92cd6a41667dca81d86,
                0x24cb,
            ]),
            x3: BN254_Fq::from_limbs([
                0x5ad9e4f36526b09fc0b7d1002bc851,
                0x2c471c8cd1ab9ac9b4118d040166f7,
                0x25d3,
            ]),
            y3: BN254_Fq::from_limbs([
                0x8d3f2d9d55aa818dc4930d82f746ab,
                0xb3892524e67bd91c41aff108682717,
                0x02b3,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x13bb6192aeda4d14938a7e8355d61b,
                0xcbe7317f57617e84c5aa5cc8b3e0d3,
                0x2364,
            ]),
            x3: BN254_Fq::from_limbs([
                0x5668e1b6d8f91de3942f922ec35fb2,
                0x84ee594280d7510d2d0d5e732e5308,
                0x2d38,
            ]),
            y3: BN254_Fq::from_limbs([
                0xd60b32edfaba126892577520472eec,
                0x9998a803fa677f7e5f5c6edd38d3cd,
                0x1b34,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x71843dc18531fad6fa30f738570261,
                0x6ddf8ad356a4d979ddba1ceb553f99,
                0x0e0d,
            ]),
            x3: BN254_Fq::from_limbs([
                0xa7597b49c9f69bb2467a6328b7b406,
                0xc9824d457fcdcdbbe9679bd152d351,
                0x1774,
            ]),
            y3: BN254_Fq::from_limbs([
                0xad859901890182b4b0ee978b721d6e,
                0xaebe7cebd0ef12ea76bead7d4d1136,
                0x25bf,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x758701b3f62779f172a929e540b65e,
                0xf796044182ce200f2c3da06a43b412,
                0x1b25,
            ]),
            x3: BN254_Fq::from_limbs([
                0xf934073d090558413db21ed1ce73d9,
                0xa72ef8bbc77d34767e20341f9bd662,
                0x2773,
            ]),
            y3: BN254_Fq::from_limbs([
                0xb7c9963c00a8f686da4caa57e85689,
                0xfcc5031dbd9fe3f28c63fddb519016,
                0x158a,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x92113959676678b59ffe23c740ec7c,
                0x29744769f4019116458780fe1456ff,
                0x2af8,
            ]),
            x3: BN254_Fq::from_limbs([
                0xfe0b10d1efac214c140ad4ffe4b0cb,
                0xbd5414ced847006fc29e1c58e36fc7,
                0x2805,
            ]),
            y3: BN254_Fq::from_limbs([
                0xf5a19aaed29adeb5c1ceb35bcb41b1,
                0xa192c5ae279467593cb5e598cd64dc,
                0x128f,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xd2ec8d505436b4f225417674de197b,
                0xfbee657bf2c3f0540d1994c0512dea,
                0x0fea,
            ]),
            x3: BN254_Fq::from_limbs([
                0x74a3dd4644c4093dad3088224a1bee,
                0x9f19d2d3190f3b95787735aeaf4726,
                0x14,
            ]),
            y3: BN254_Fq::from_limbs([
                0x6e2d51a7fa81b4d9ce50994808eac8,
                0x0a8bf8de2d5dba378fa447fe9f357b,
                0x1495,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x16ae7bc1bba40a8fd0dcbcdd490d53,
                0x29ff9a975856d22799222542e6acbf,
                0x193e,
            ]),
            x3: BN254_Fq::from_limbs([
                0x3584678703579d17c0f201fe34fe8b,
                0x87dc43547a65ae9753d2a2db070d22,
                0x1dd7,
            ]),
            y3: BN254_Fq::from_limbs([
                0x92d82e47f3e5da05f8977c293fb6ad,
                0x247edff9641e5333b7d3816e434200,
                0x1ffa,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xd0a8c88f42747a0efe58a5e01f1402,
                0xfaaf547d6311601dbf05403cb05411,
                0x1bf1,
            ]),
            x3: BN254_Fq::from_limbs([
                0xe70b434ce8dd0d52b85e2d5bb46625,
                0x2e7f5644ccd3984b14be4694b17e5f,
                0x18f9,
            ]),
            y3: BN254_Fq::from_limbs([
                0x5f63a3c84a1ca5faf460add028a578,
                0xcc25bee27e6eda3d03bfd2c609cfc0,
                0x1e22,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x1ed1efcf6299d2c1b78e728892500c,
                0x979b2323c432abdd05f1481492b5b8,
                0x264e,
            ]),
            x3: BN254_Fq::from_limbs([
                0x6178f9a1078ac949f142edf4876b49,
                0xa80b9bf3b34c465e07262d63f93642,
                0x0192,
            ]),
            y3: BN254_Fq::from_limbs([
                0x2956ceed04ef049ccf7e0167c92ef5,
                0x410676453034e6c6f7b2de6775808d,
                0x0645,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x1cba9784fd4e0648980567775bf69e,
                0x84d9035f230ba6360c8490938a78e8,
                0x1314,
            ]),
            x3: BN254_Fq::from_limbs([
                0xc5059ad533cc74d363b7e85cb6dc42,
                0x5014548b1ef16c209d2ec503b76465,
                0x15e3,
            ]),
            y3: BN254_Fq::from_limbs([
                0xde333dd7ef2268d20432650e69973d,
                0xd4b927c94fe988e25ed634e25a4d3e,
                0x0daa,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xe1d4279c70cf08424bd83ac51cf83f,
                0x89c8831468a33ca94b3933093f9858,
                0x1e7c,
            ]),
            x3: BN254_Fq::from_limbs([
                0x0d8f5e6cd52045090628b05e2cc08a,
                0x3938369a9dae572385612a69506c02,
                0x2943,
            ]),
            y3: BN254_Fq::from_limbs([
                0x688bce67fa3c5fafc2bb5438b7b3e4,
                0xe73e1bb3d5645f7765374cc85a50ae,
                0x0fa0,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x36fb48b5a669a6e001e9bf8e337d2c,
                0x29e6dfc0cdf15ff811530ba6cb0f35,
                0x013a,
            ]),
            x3: BN254_Fq::from_limbs([
                0x8a2d80b55350753d20cbe2d252c00c,
                0xf643f9f2e49b4e35e1fdf7f0e78def,
                0x12e9,
            ]),
            y3: BN254_Fq::from_limbs([
                0x1dc6ab1d5cf366ebf7c70b5171d722,
                0x6be4ce0c240c9ca0df8ebe404248aa,
                0x1f24,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xa2feffce6fdc187699a00670222eb5,
                0x0555ad80074cbe75a5229259b1b9,
                0x224b,
            ]),
            x3: BN254_Fq::from_limbs([
                0xf06da222859ffd9f73d90286f58abf,
                0xec53ebc5a17ca271810fa1b4b95562,
                0x1ceb,
            ]),
            y3: BN254_Fq::from_limbs([
                0x66bbe25e03d1cf4dfbb1bb97892121,
                0x01e75b0a57940fff03e94346e6a41f,
                0x1ccc,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x01acb33f7ace6b9b99d51257264622,
                0x4f310359e7111be480eca9194c9263,
                0x1fd3,
            ]),
            x3: BN254_Fq::from_limbs([
                0xd5ae1e75a0763cb9b01128ae105966,
                0xc0de7c0b01d61c8fd446d706cf103e,
                0x20de,
            ]),
            y3: BN254_Fq::from_limbs([
                0xa8e63a7859ce204bcdcb0d65ff64f4,
                0x542c3ff5bbe9646851083310e0bda0,
                0x2399,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xb199402ab85c647ca1d14f9eff3d8a,
                0x404ac12c31ab81d5946a17528a699d,
                0x09b7,
            ]),
            x3: BN254_Fq::from_limbs([
                0xf35dbd22f6f3827f3b9875a9606b62,
                0xb6e4e72565e0adfdc466d13ad9da25,
                0x1db0,
            ]),
            y3: BN254_Fq::from_limbs([
                0x098affcbc4a60cb848993bc1fc314f,
                0x7485a5e7740f6e13f0c1fa87f5110b,
                0x0768,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x8339c529ac87cfc4e149accd9f88b5,
                0xb813bb7d3e3d5b911b23c8b2932bdd,
                0x2e01,
            ]),
            x3: BN254_Fq::from_limbs([
                0x91ed42c124037814de6054f507deb2,
                0x061e50958b3d0678fe957a62603efc,
                0x1e76,
            ]),
            y3: BN254_Fq::from_limbs([
                0xc11262c7cd5641e86bbb5018eb72e1,
                0x0fb072100ef5981b19823c2b72c7,
                0x178f,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xe9b79409043b435be58489c5eaf2c7,
                0x952fdd7c29806b4301cc8d456b1e8a,
                0x0d45,
            ]),
            x3: BN254_Fq::from_limbs([
                0xe0b0b3d53803c1686f0220556ff408,
                0xad04c65bd0f0aa4fcda59a1753ec35,
                0x1222,
            ]),
            y3: BN254_Fq::from_limbs([
                0x2eed943192eca4f2603b5ec960f498,
                0x97e63f65d0b65aeddfe8d253db827b,
                0x23e6,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x1f59437378883d6edb885481063e34,
                0xa73a73e4e317f8fc231c6ad3048b0f,
                0x080f,
            ]),
            x3: BN254_Fq::from_limbs([
                0x2e206eb9467d95b0b62322e24cc287,
                0x52c1802d16dee4e3f7868fc6fbfe58,
                0x1dd2,
            ]),
            y3: BN254_Fq::from_limbs([
                0xb4f04359a8dfdfc4acff83c89e9a90,
                0x4af1791a1834aa11ddefd3b305fd94,
                0x1a83,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xe7aa3d202c727bb0e4542b87412319,
                0xa9b0e705dd2b1b9279b449d06ca724,
                0x0fcf,
            ]),
            x3: BN254_Fq::from_limbs([
                0x599412e8853ec045ce78c7bd30b5e8,
                0x0d3f9f1ecf81dbcdb1c5cbd92221d0,
                0x2be9,
            ]),
            y3: BN254_Fq::from_limbs([
                0x87775485136673c383886f3bc447d0,
                0xd8af7b74d32f55dfc18d3369169168,
                0x0573,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x0b91005500b63711782308442ad088,
                0x29b9deff5e45d3aa8e79f477e9eee5,
                0x2a9b,
            ]),
            x3: BN254_Fq::from_limbs([
                0xef03d9d959b0de291f7a28b42de778,
                0xb5c5d35e687e8d3cea947cacb67243,
                0x2711,
            ]),
            y3: BN254_Fq::from_limbs([
                0x13541a9e8fb41cb98f042be9f06138,
                0xa3fff4a5b81377c4f5ce6031bebc88,
                0x114c,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x5ee00d1003bca6f538283b69e4a968,
                0x324895efae9710646afa2a10621b12,
                0x2a68,
            ]),
            x3: BN254_Fq::from_limbs([
                0x711460a89d865668e75d45b26af504,
                0xa04b8ea225b21479fe85da55683d64,
                0x1450,
            ]),
            y3: BN254_Fq::from_limbs([
                0x80146b5a60a4b36f1c1c56eced38d4,
                0x26ff0f5296bf202f8b558fe493bd77,
                0x16d0,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x02edf3ee8e78728b34bccaee9032a7,
                0xf8ba0c167d397bd80715e5dadfcd37,
                0x1f06,
            ]),
            x3: BN254_Fq::from_limbs([
                0xd5a3c0a4d58fa8474de5bd278e725c,
                0xcaca4d0f562ee463da213c76a8ecdb,
                0x196b,
            ]),
            y3: BN254_Fq::from_limbs([
                0xc3fe141adb96e2d32f0a2c8815d1ad,
                0xb1e4af3a881dbc4775a4b87cda6b96,
                0x058e,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x407818a148a1ef1e2d44352e19dea7,
                0x2c0438755abd043f7bb4b19c4e94d0,
                0x1bb9,
            ]),
            x3: BN254_Fq::from_limbs([
                0x586755b8b642958024af96e7dedade,
                0x7327207e4e09f677c013c9a76cb53f,
                0x0571,
            ]),
            y3: BN254_Fq::from_limbs([
                0x67a74d36298bd534297b76eda70afb,
                0x7615ea750c44245ad24fef555a387e,
                0x2fd1,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xf1811076f56890434ab55322d900b0,
                0x710a62dd252ccf9af8c0dbae830c1f,
                0x1462,
            ]),
            x3: BN254_Fq::from_limbs([
                0xc1698eaf91a6a3cdf63257f74d3c93,
                0xbf5c6ab42edede9aae6cb578eeed42,
                0x1802,
            ]),
            y3: BN254_Fq::from_limbs([
                0x59bd829ebe0062dfc6b659d0f179a5,
                0x1a0ed1e3b9098327d3ebb0e40a5d73,
                0x0547,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xba855f1e56c00fc473efb2aa8b0fd1,
                0x58d2c347c44edca96744d857649b9d,
                0x0564,
            ]),
            x3: BN254_Fq::from_limbs([
                0x95443243f0bf21eba494c2d6b735fa,
                0x32fe5dd580a0a90f49308fa7e22f06,
                0x0d7b,
            ]),
            y3: BN254_Fq::from_limbs([
                0x999d7b89b2af301ccac6aff7adeebe,
                0x1ac6726b34f7b3f9b1d5f05223297c,
                0x1ba8,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x72f472324fa6e4602828fb29d6946d,
                0x478a068fd263c491237b93cb1de045,
                0x2e48,
            ]),
            x3: BN254_Fq::from_limbs([
                0x3f14b857de7917acbe35decf361cd1,
                0x8ec304943858641fb418ee040d388e,
                0x2660,
            ]),
            y3: BN254_Fq::from_limbs([
                0x64b06ae4b101a3bf2d6a695160c8d9,
                0x5040a3fe6adfbb7cd1b59ee6e667d7,
                0x1b4d,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xab5ad560d13beb2f94efee0e3649dd,
                0x96e3aa5a5aef44290d303b7d16d318,
                0x1e38,
            ]),
            x3: BN254_Fq::from_limbs([
                0x238a5652b1ef89872fab4e015e6fe0,
                0xca5255b92659bc1da4cbf1482743c1,
                0x1e92,
            ]),
            y3: BN254_Fq::from_limbs([
                0xfe7fd95b46da577467cc14b3a0d0f9,
                0xeba9dd11f54dd3624131ccdd115f70,
                0x2421,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x1586ed17b77065fa1f2f8a11b1c246,
                0xc432f3a92d221e75b505d24a1605b2,
                0x15a6,
            ]),
            x3: BN254_Fq::from_limbs([
                0x92cbbe3eff23f021eab2234d9b568b,
                0xb323cdecd65faec9ecb09bcadae952,
                0x242e,
            ]),
            y3: BN254_Fq::from_limbs([
                0x2f988ac5a16045465eb11d1308aa28,
                0xb936ac685d1320c53ead52b6547cb5,
                0x0baf,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xdeb5891030074a9feb0627cbb050b0,
                0x79285713b94f54730cee3be04ab923,
                0x139a,
            ]),
            x3: BN254_Fq::from_limbs([
                0x27ec1f32becc3fee94486c4eaaa6f4,
                0x89c48c9e5214095eaa4551ad406a87,
                0x1d3b,
            ]),
            y3: BN254_Fq::from_limbs([
                0xe5c840e7b05c45ee03e92069ff09f9,
                0xa31c9fed09384b3ec57913d4e44fb6,
                0x20d0,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x38787858cfd7980fe9ae92b7a1a623,
                0xc921c972d9c9a480ba052f74dc8ca1,
                0x021f,
            ]),
            x3: BN254_Fq::from_limbs([
                0x5be68239c78e507b4a18f960484a43,
                0xaecd2467dd254104e5197f7e9b3eb8,
                0x0dec,
            ]),
            y3: BN254_Fq::from_limbs([
                0x1ef9b480561fdb5dab7deb07772742,
                0xfc382edc8cc284ea703d1fdcb403df,
                0x1b52,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x1b4f5513d999ce0cddd31a3f39fe38,
                0x3490293b6a031b3c3d859cb25fac48,
                0x2a31,
            ]),
            x3: BN254_Fq::from_limbs([
                0x7217a5580530409138e349341a248f,
                0x158dcecb114f7341b7011f89ce9829,
                0x2868,
            ]),
            y3: BN254_Fq::from_limbs([
                0x458b3160758b186ba5253fe84128e2,
                0x3f961158529e4261509c4b52730cb1,
                0x2eed,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x02d0726d371aca15459a0af1d9e165,
                0x1d0bb7f406fae7eec65fa122d52696,
                0x2119,
            ]),
            x3: BN254_Fq::from_limbs([
                0xd80c93c3ee4032b83a86b53db147c7,
                0x9b85cf0df56e0208e69fb847115ec3,
                0x1df6,
            ]),
            y3: BN254_Fq::from_limbs([
                0x37bbe6a2cc34d8f7beff4b6990d9a2,
                0x617002cf7a0b2e20f95174545e459b,
                0x2de0,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x3772ce15e34757cbb8d09148725942,
                0xa71e62d03320a96fd36067135db764,
                0x0432,
            ]),
            x3: BN254_Fq::from_limbs([
                0x611f4bb200cd59a4dcd27b8b587bbd,
                0xd6a8dd9d097cb9d8eeb13995eb353d,
                0x269c,
            ]),
            y3: BN254_Fq::from_limbs([
                0x70bd2fe0eafc2556afc9df57bf2f8e,
                0x28bbe05175a20fea28cd867d6c44e3,
                0x0130,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x9b1e3ebb019e45bd5d19ba2343291c,
                0x9707b3c3a2874b9fc7f3fe6b26463f,
                0x14cc,
            ]),
            x3: BN254_Fq::from_limbs([
                0x56a4e8de9f4914bc82593b6a0acc5f,
                0xd5abb9f52fb91991afe5cfaa536b41,
                0x21fa,
            ]),
            y3: BN254_Fq::from_limbs([
                0xd499d023272596fee2fa9b74a52b1b,
                0x3751fb381d1b7670ea35860d8a8776,
                0x0dd2,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xa193d4310220f8b61eaa9ff0f52797,
                0xc67a0a642c4eda3c2f306daa882188,
                0x0177,
            ]),
            x3: BN254_Fq::from_limbs([
                0x84245bc9e1a03e309ec8b3687e3b54,
                0xe7204167047148e9ae9601c3fa23c8,
                0x19c2,
            ]),
            y3: BN254_Fq::from_limbs([
                0x16ccdebbd62cfb19a8bd319c0b992f,
                0x36fd975156c850de5cc2a11573edf6,
                0x297a,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x89ce4b17eaa1b8b140f53699dbb78f,
                0x4d237817c002694552d2be02562dde,
                0x257c,
            ]),
            x3: BN254_Fq::from_limbs([
                0x1f2a2c7e500f3dee357328d9c4744b,
                0x257b76631618ec3d3ca7ce6d66b5c0,
                0x1ce7,
            ]),
            y3: BN254_Fq::from_limbs([
                0x5cc96ea341a2dd8e931b3b01af7ac1,
                0xdd1d3ff18ac59936537e43bfdd46cc,
                0x2a0b,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x36651c56bd3ceddb9bd4025067cc19,
                0x7061393fe1781c146e14490eeb6e19,
                0x0131,
            ]),
            x3: BN254_Fq::from_limbs([
                0x736a78c0d67304c2c3ac689df8e011,
                0xcdfceed465e34cc44573646288e1ae,
                0x0ed0,
            ]),
            y3: BN254_Fq::from_limbs([
                0x3bb79e7a53d8d99addeb3d98f5b554,
                0x6934f67f847feec3668a7edaa717c5,
                0x2071,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x4a1f55b61807c211e017f54108bdd8,
                0x284f3831c485a6e2b9447342c78ffd,
                0x08a4,
            ]),
            x3: BN254_Fq::from_limbs([
                0x95c617b2eec73f3f1e05f22c7841da,
                0x3372fae8d73b650ce64494095bb4a3,
                0x2998,
            ]),
            y3: BN254_Fq::from_limbs([
                0x8d7583313ce2d0f861ee5279679bea,
                0x5789c74e58fbb9aed4591c96175ba6,
                0x2d72,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x400a79046c904b871ca94026364372,
                0xcd696dd3efca37673c0127f693c7ce,
                0x18b5,
            ]),
            x3: BN254_Fq::from_limbs([
                0x0ce588c241a71264f1dac7071df2,
                0xd7ef8859ddd02edcdb77b74df27c6f,
                0x260f,
            ]),
            y3: BN254_Fq::from_limbs([
                0xc763b504385a2feb57825c327965c9,
                0xcd761f5bf963bbe56f3dae1afaf109,
                0x1c49,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xf7c3a845a34746d27c4ce9b1bba483,
                0xd6dc52559e0e403f77169b77c85ad1,
                0x0ddd,
            ]),
            x3: BN254_Fq::from_limbs([
                0xc8e1c9e48f6ec8e12c1672bd6b3a8e,
                0x5899bf4851797dd448f8188b6b3b06,
                0x06bb,
            ]),
            y3: BN254_Fq::from_limbs([
                0x97501c959e31215101f91f3268c9f8,
                0x8895b803203ced68cc1f875141ab29,
                0x2f5a,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x1e7087236b3d20aa75656f6a45c700,
                0xf215c3fe6b8f61718de0266333fa01,
                0x16f2,
            ]),
            x3: BN254_Fq::from_limbs([
                0x97c06f5783635599ef090c350fd3b4,
                0x4163841b3c626db4f47cadaa73d3c9,
                0x27e8,
            ]),
            y3: BN254_Fq::from_limbs([
                0xe838776151fe34130e0019a11bf83d,
                0x8814790840560571eb2fea31cfb32a,
                0x0a71,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x73c8f13e1a4e4d910f58addf6d8e46,
                0x9cc04e1c9389fb051bb554c2b2cbea,
                0x13d7,
            ]),
            x3: BN254_Fq::from_limbs([
                0x6b8e89e697b1ac4cfa70196cff9495,
                0x154d0a2d2987d513bfc2b5ba267ea0,
                0x2d68,
            ]),
            y3: BN254_Fq::from_limbs([
                0xfb138964064baaddfc968ecabb71f2,
                0xd7cc794cfc4c2c28b557275ac449e3,
                0x2b1a,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x87d13e51bc91ea532fdc75cba8851e,
                0x98ff559505f7ad9635f263be0ddeea,
                0x264f,
            ]),
            x3: BN254_Fq::from_limbs([
                0xcf0dfaac81578e76bc46343c16cd08,
                0xf2049e719cbcf6ea80b5a480700c9c,
                0x137d,
            ]),
            y3: BN254_Fq::from_limbs([
                0x5bfa616e732bd2eb305f30de897201,
                0xd248da1bee6d895bfd9c5d44938ab2,
                0x0767,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x3958b01f11f235cd83510538909208,
                0x6b2ddc5e80d88176c81c937eabadcf,
                0x264a,
            ]),
            x3: BN254_Fq::from_limbs([
                0x5d502904b45c40f829644a4d20d561,
                0x7c442f4d82db89d54c7f31ca8f8a00,
                0x0fb7,
            ]),
            y3: BN254_Fq::from_limbs([
                0x9051daf8115412857022378bbe01d5,
                0x6a8251dbd3992e25c00820261458b1,
                0x28f7,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x02beb4fadf4d75b71d2aa57847f4a9,
                0x73ca7387109f46208f0a52fafed221,
                0x1fac,
            ]),
            x3: BN254_Fq::from_limbs([
                0xff51114c3c48418049f2050cde84f4,
                0x4985f22fa4b6431bb3e681577d4c,
                0x174c,
            ]),
            y3: BN254_Fq::from_limbs([
                0x5e6c26c020bf5ad32fed51c0ea8bcb,
                0x445134f7b2532e1f1ef73401518ef6,
                0x1c1d,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xb7944445d6caa4d43c5eb5beb6b62e,
                0xe3449aa0b81ac030324aa664982f14,
                0x0b51,
            ]),
            x3: BN254_Fq::from_limbs([
                0xdfa00aa3835edaa4bc36a5e5c445d4,
                0x6aa0f67c48801981a752193aa0b087,
                0x0184,
            ]),
            y3: BN254_Fq::from_limbs([
                0x54b89592ce7dda611968194decf3a5,
                0x2342a342c6c0846e015339fdc2ed28,
                0x0a37,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x55b9d86e35671d343c65002d36bb57,
                0x534b3025f8bd69793bd56f4c85cf86,
                0x0da3,
            ]),
            x3: BN254_Fq::from_limbs([
                0xd46b6d5d2b3b04c1aff647f523282c,
                0xc5a3ef4ae8f79fc5672f2ace45acfd,
                0x1a7f,
            ]),
            y3: BN254_Fq::from_limbs([
                0xdd53db1f4397c13f7f23697faaa491,
                0xa5c50d930b057705508ed3965a3d28,
                0x280e,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x606f0954a7adb69ad79bd189be0f51,
                0xd9a7c6ea5a338fb90cf6fda6f52c7e,
                0x2907,
            ]),
            x3: BN254_Fq::from_limbs([
                0xe8ccf0e86601321bd7b7a9bb5c223e,
                0x6cfe0844feac6efd5dd00ffd96b03e,
                0x0f9f,
            ]),
            y3: BN254_Fq::from_limbs([
                0x1892761ad29d3b6138aec72c6684a2,
                0x83d41e8a2bd7ef4db2a487b12448fc,
                0x21e8,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x3f87df4554ff9ce3ef69a3bac39670,
                0x6df23da09da927003b23ac6be8f906,
                0x12b6,
            ]),
            x3: BN254_Fq::from_limbs([
                0x2e1293f76a7f6df4343b14f190b8e2,
                0xda4eccec810c93cbdaa65c30f91e1c,
                0x2089,
            ]),
            y3: BN254_Fq::from_limbs([
                0x75c30ed3c0a9603c6a1d0a5d5f8f65,
                0x36143310f1a351362bcfacb9d84004,
                0x0e9d,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x92e67c07fa3e08574137c138fffaba,
                0xea67bb2f0421a3e74cf6745c87acbe,
                0x1a9b,
            ]),
            x3: BN254_Fq::from_limbs([
                0x8b01ac74be7424edc9bc0745908ec8,
                0x29d0c6471f25c08981533fb5b2c41d,
                0x0402,
            ]),
            y3: BN254_Fq::from_limbs([
                0xd5d76face3a5c6732a04713cf78ab9,
                0x845624111c651d27bf1b9229e9f722,
                0x2f1a,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xc0458d6dd74ce18b853623df83f201,
                0x8aa005b480240b54b99aca823da583,
                0x22c9,
            ]),
            x3: BN254_Fq::from_limbs([
                0x887561e9a07e2e06adfa9128f06f9a,
                0x1da23d5dc703543566cd49627eeeea,
                0x24b2,
            ]),
            y3: BN254_Fq::from_limbs([
                0x604d0e356ab77bd7ca7a91e89ad5,
                0x693417c3b920f6b1db9ef9b4783fdf,
                0x1dc7,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x29afd68e736c785d6331f807908c67,
                0x739302c6ff191ac65c6fbf94af11e8,
                0x2d97,
            ]),
            x3: BN254_Fq::from_limbs([
                0x9b32e4cc2aeed6cfb8a3a56cbc8b06,
                0xbb925954e2fe4930a36c634cb1220e,
                0x03f1,
            ]),
            y3: BN254_Fq::from_limbs([
                0x8550b63b496e971fb52530c8bb2088,
                0x56a4bb432456de3b8cbbf94da80ae0,
                0x1b37,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x41d1c149f6fff5d3f8074ea0eb2126,
                0xc0308fbd1cd992e7fa8bf99f1eda5f,
                0x1936,
            ]),
            x3: BN254_Fq::from_limbs([
                0x357953b8604332e887a2f4bcbf0336,
                0x7667b3a84605e8ce962a872562b501,
                0x1776,
            ]),
            y3: BN254_Fq::from_limbs([
                0x3343911cff32f9343c4ac313a69483,
                0x847eb696757c002a6cb6b85c022b59,
                0x2741,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xa7dbb23149b3cbd8708fb683e5cd2e,
                0x34a6e274cd0418f5fbe2bc77c004ec,
                0x117d,
            ]),
            x3: BN254_Fq::from_limbs([
                0xa863812dd6de902fb7f730f3f93cb5,
                0xd01801ab11312ac93ed5e1b4514c25,
                0x164c,
            ]),
            y3: BN254_Fq::from_limbs([
                0x2c46eb0cc7d1e6360f6589b9866c79,
                0x66b6f1c37e84733b051edbedf24be1,
                0x1c36,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xea0b6578a1310e73adde27437e0280,
                0x0aacfa8fbde83471acc501c93a49be,
                0x29a3,
            ]),
            x3: BN254_Fq::from_limbs([
                0x9e3ca917ce6549986ad0755c3e29fd,
                0xa93ec978652ca99049ff297993f182,
                0x0233,
            ]),
            y3: BN254_Fq::from_limbs([
                0x86fdda9e51fc690b3adbbcb977dc13,
                0x3c807a5d6f3a344da23fea586b5fe8,
                0x17ba,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x86348dec8c8523fe1136eb847209a5,
                0x521332b7ffa971e5dce910aed84870,
                0x038d,
            ]),
            x3: BN254_Fq::from_limbs([
                0x712f6d351a53e884fef30c002174e9,
                0x78f0520e179cd1c2f7d2123de0564b,
                0x0e2f,
            ]),
            y3: BN254_Fq::from_limbs([
                0x7633ce2344dca9c003c99dfcc2e91c,
                0xe42fc7095741760d16c490e5332aa4,
                0x1c21,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xa9146556a0fd86b0410a1db3e51ccb,
                0x78d1ce5d2989b9dbe894564fb4724b,
                0x143e,
            ]),
            x3: BN254_Fq::from_limbs([
                0x07519f870457b67d4e5e3b6badda4f,
                0x7baf08da4d334db3fd34201f32f929,
                0x0a64,
            ]),
            y3: BN254_Fq::from_limbs([
                0xf93a7badacee95ffea12475013b712,
                0xe96ab0461c9a3dbbc54966d3719df3,
                0x0b3d,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xd786d4b7ecfc0f3cf5405e8d04d16b,
                0x74072556ea387b0aba5d4e3c97b129,
                0x0949,
            ]),
            x3: BN254_Fq::from_limbs([
                0x30a600ff473ed0d392c40d2fee649e,
                0x573e7aed41480e4744a04faa07ecf2,
                0x1da9,
            ]),
            y3: BN254_Fq::from_limbs([
                0x752597a4bda411a9002dba3e4b64c8,
                0x5bf4fbf792070db2982596262be12a,
                0x2bae,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x16eb38a750477109b0f20df46c5a18,
                0x4960037f64981c4f562af78e8ac9b1,
                0x2ab9,
            ]),
            x3: BN254_Fq::from_limbs([
                0x1606f9e5ece1adcf663fae0cb6ac91,
                0x194a99062020cc86913e0eb7b7a60f,
                0x1eaf,
            ]),
            y3: BN254_Fq::from_limbs([
                0x783d71c52607b0f8d9399bb9dc0291,
                0xd08e19a1c60406090edc698e4e6742,
                0x0140,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x821400de6f7fc047872822b02f7d4d,
                0xded450bcc38e702e4bc24fe3697b44,
                0x2784,
            ]),
            x3: BN254_Fq::from_limbs([
                0x948a4d64c26f6e0bab59e1f5c7bd40,
                0xc18ebfd27c6a67dfabe2809cb7c4a4,
                0x2d00,
            ]),
            y3: BN254_Fq::from_limbs([
                0xdfc431815e683be800550735630fd7,
                0x6b5bdf12d235aca61f64da8cb3a896,
                0x260d,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xb43ee8690475c53adc177e5c4fafec,
                0xe13f6a7dbb35b4a4690880895d02da,
                0x06a7,
            ]),
            x3: BN254_Fq::from_limbs([
                0x5acbeb4f4f2e2fe36441f3b5b26d30,
                0xb0545325e8845898bb6746ea04669c,
                0x05e2,
            ]),
            y3: BN254_Fq::from_limbs([
                0xb9bbee6971ef701907c3aaa3df078b,
                0x6a2ce12f20538789bc61851f829b6b,
                0x01be,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x0997a823df6b31264532b751ad8f01,
                0x22373913c3ab98a408c5964fd6e6cc,
                0x0a6f,
            ]),
            x3: BN254_Fq::from_limbs([
                0x16dbfdf70cfdfae87e018437da2f79,
                0x5b700dfa062649f64bc4445197e3a2,
                0x066e,
            ]),
            y3: BN254_Fq::from_limbs([
                0x5d6ec55d965ee848df7d91c47b9a12,
                0xc5a07e20e43f692fcb607324790e40,
                0x2b7a,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x2c7ae5b80b202cca565e1bbe936ed5,
                0x13d2493e005130d0dea36bb0abc5b5,
                0x0222,
            ]),
            x3: BN254_Fq::from_limbs([
                0x0cdff7d7786c02eb054abe6ac6a2ff,
                0x5c4ec312bf0e3a862a4214f91a090b,
                0x2bd1,
            ]),
            y3: BN254_Fq::from_limbs([
                0x7e935b06ff0da485d8191081ee0a1a,
                0xb25c660b7bd66784f5c396988155c7,
                0x11b7,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xe5ab883b39c586f5801c7d543d9b78,
                0x05a5f194b66a8e3fe5119006790804,
                0x131c,
            ]),
            x3: BN254_Fq::from_limbs([
                0x12be359578ab01d38a78f394edf179,
                0x03cf1d0d1b826be6cc18be05d4070b,
                0x0c03,
            ]),
            y3: BN254_Fq::from_limbs([
                0xeeb01155e4d93f65f49055fef42769,
                0xf4e41594c8692158a5cefdb3c98b4e,
                0x0fa6,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x8067be3c97f20a3c9de193043068c1,
                0xf9447ff41833e1cc94909e95b04435,
                0x17b9,
            ]),
            x3: BN254_Fq::from_limbs([
                0x03cc2c59bd6efcdca6b5629dda1895,
                0xd738bba7fdbde7cf1d1ae80dfb1523,
                0x0f8b,
            ]),
            y3: BN254_Fq::from_limbs([
                0x77874777549c9964ec1ee3b48bd96c,
                0x7736d7cb845399888130e39b83e8f8,
                0x01a9,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xb0df659aabb54a45a29659cc7de465,
                0x9312ad58772455796ce2604e888917,
                0x2f17,
            ]),
            x3: BN254_Fq::from_limbs([
                0x56cf02f1e823d13cb2d5f7d7b8af59,
                0x217a0141b891c8fdecd351dfbee042,
                0x2fd1,
            ]),
            y3: BN254_Fq::from_limbs([
                0x75cda19e4d6d82753d312697c131a3,
                0xfb2b42408f43e84e3013f37fbf7209,
                0x1e7e,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x99c579726589b47d72719a7e288994,
                0xdcac147dc05f39e40ff20c40821f10,
                0x1e64,
            ]),
            x3: BN254_Fq::from_limbs([
                0xac2d6c4e36bfab37bd6a377360e970,
                0xb05e5f0efe8b79941998eaaceb3869,
                0x1276,
            ]),
            y3: BN254_Fq::from_limbs([
                0x7e873771b2a88d84bf9f4f2c8c9c4e,
                0xedf61d7794cb686e06a0f347abdba4,
                0x27ed,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xf72077dbfd5f0143931f1866a2b3e1,
                0x8c879087306955f83f359d08b84630,
                0x1d1e,
            ]),
            x3: BN254_Fq::from_limbs([
                0xf7fb47ff2c21dc2606f5b3d443739f,
                0xcd90134942a3abf26b4df9b551815e,
                0x22b9,
            ]),
            y3: BN254_Fq::from_limbs([
                0xecb7dba2d6f0cc7c0018ed0d40759b,
                0x4d475b919a70d496753a3988f7f0f1,
                0x4d,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xc42000e5c6f9d50ac277d7d89af2f3,
                0x9db84000ee399723387e71ce50e7a9,
                0x0dcb,
            ]),
            x3: BN254_Fq::from_limbs([
                0xac7c60785b79802bb3408d31d9845b,
                0x442121aacee9d10b100f6611b07791,
                0x1ca7,
            ]),
            y3: BN254_Fq::from_limbs([
                0xd2fa1ed4188c28d167f949f665ffe6,
                0x0b5f3011010e6bee9baccd37402df8,
                0x2b1d,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x3628bbaa37ae9d84b1612a33a443b6,
                0xe26419075d533ffc77baa5d2620a3b,
                0x18b9,
            ]),
            x3: BN254_Fq::from_limbs([
                0x60a3ad000bff2a0edcd424ea682692,
                0xf2a3d77d4a6555a42d29aacacbc440,
                0x1008,
            ]),
            y3: BN254_Fq::from_limbs([
                0x9409e286fd5a376f3a819535cd6752,
                0xc35790adc9738bbb9cb72512aa9d5d,
                0x1a2f,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x9fdb9420db9cbf5fb56e7988834d61,
                0xf018108b7d0dc0acd444f4a4279c46,
                0x1ae1,
            ]),
            x3: BN254_Fq::from_limbs([
                0x4b4396e47524fdf1913fa3c2d94cf0,
                0xb0f63062dde94fc993f30034d121ca,
                0x03ed,
            ]),
            y3: BN254_Fq::from_limbs([
                0xbc364a21680d191510b33a212e94af,
                0x5d181f26743feb357f21ba6cdb8e68,
                0x11fa,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x9d442248c711f1f1efd7de5fb167f3,
                0x12e2d65b94af65cf158675579d3e8c,
                0x070c,
            ]),
            x3: BN254_Fq::from_limbs([
                0x58a4fc7756ce58066bb61acb8a3312,
                0xb206993a893dcdfd2b27ae958816a7,
                0x28ff,
            ]),
            y3: BN254_Fq::from_limbs([
                0xf3efff80993dac295e83d0e3e0c83d,
                0x233b95dd0e190267e5e57bcae6cc00,
                0x2030,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xd186bd9cc133f08333fe7167a4a0d3,
                0xdbd642d62b10014835db52c02f0455,
                0x1f15,
            ]),
            x3: BN254_Fq::from_limbs([
                0x9f224493aeee59b8ee02ce490b2e2a,
                0xa771d2a664d16f9858ccb51b32266f,
                0x0ed7,
            ]),
            y3: BN254_Fq::from_limbs([
                0x3970c284fccc33d335097edb4028ea,
                0x8331ab48192491150cf1bf699fc589,
                0x0c9b,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x9b5879f98998b80560270efed1b8c8,
                0x2fdef905405d6c9a566778ca1c6815,
                0x28cc,
            ]),
            x3: BN254_Fq::from_limbs([
                0x7bd59986ff01532b1f6cdcb24fda48,
                0x5c29fb8df08f0607acafa17c685a59,
                0x20c7,
            ]),
            y3: BN254_Fq::from_limbs([
                0x6086b93995f19f159cdc8d971c1b88,
                0xce226df0c618ba8fea2e7a2822d892,
                0x2e6c,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xcf3ef404712e7f5497ab7ecae02c3f,
                0x2d77543af6e70b66029bd4ed1a73cf,
                0x2030,
            ]),
            x3: BN254_Fq::from_limbs([
                0x4a1c96e3c7a6bb32dc4c63daa5f199,
                0xbdd6fbe127e6e0d56969e8d03cd059,
                0x1e24,
            ]),
            y3: BN254_Fq::from_limbs([
                0x85002e0f0d61f485680396865b02de,
                0x02095f2479be09fc389e2ca9851100,
                0x16df,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x2d7dc9dcdd37f0e2848ea645c9b4a1,
                0x2e94def10031437fe1789e24ac38c4,
                0x20ce,
            ]),
            x3: BN254_Fq::from_limbs([
                0xa36ba16954e3f60f8469bb3354b93a,
                0x2ca8e64e6b3f8b42fe3ea43e7de3fb,
                0x1d27,
            ]),
            y3: BN254_Fq::from_limbs([
                0xb4e555442f3545dbb0176185b00071,
                0x0b7ec115c934f2f81cc901a9532b27,
                0x2558,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x4e1788185eb642bd153b99e34655eb,
                0xd6108faf456bdda1be99ea2aac2a5a,
                0x1bdc,
            ]),
            x3: BN254_Fq::from_limbs([
                0x10f3db31d37b4515401e3a9faa6bbf,
                0xaea7f40c3bc0f65fd16f147b539ecc,
                0x02ad,
            ]),
            y3: BN254_Fq::from_limbs([
                0xea38f7caa5d28da6a48d164dbd4a2e,
                0x9e24dba98c62635f3169968bcfbb24,
                0x43,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x9026428d9ac5b5aea11b8943386d06,
                0xd6b9c479128e10e0de4df0546c7b7c,
                0x06d8,
            ]),
            x3: BN254_Fq::from_limbs([
                0x7c12ee1234bd21e29f5f3a875f128b,
                0xb2662882fd740ab5fa9f32e29bd927,
                0x046e,
            ]),
            y3: BN254_Fq::from_limbs([
                0xfe8cf5c22a9c5fb244ebc4aa1b5de7,
                0x121b537d42ead0f17e0a5b3e803bc3,
                0x1816,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x0c4397f47c025291832172231a27e6,
                0xd7ab3541c402b0e9402e76c166c123,
                0x12d1,
            ]),
            x3: BN254_Fq::from_limbs([
                0xcb4ef9e66530e9f1fec00090ec02fd,
                0x7a446c3e34e2921c6b75966cebee21,
                0x29e9,
            ]),
            y3: BN254_Fq::from_limbs([
                0xcb4f021f25e7a0d949327003598500,
                0xb565fca22a394dfb9d92deac5b0938,
                0x10b7,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xb77497f08c23b58e4f5a4b6077bea5,
                0xc65d0496b779b233df3377b3312232,
                0x27e4,
            ]),
            x3: BN254_Fq::from_limbs([
                0x1144e8a764a1154cb92af4b441d118,
                0x61c677f4fd250534601e92cf309e59,
                0x215b,
            ]),
            y3: BN254_Fq::from_limbs([
                0x37b39a4a411c82b841c8cadccc0915,
                0xabcda599a632f918b317de9a16a155,
                0x2218,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x0dc0d7a0d4014a67c72e2319d8a833,
                0x27ed1ff68df17fa969ffb3d2022a29,
                0x2b18,
            ]),
            x3: BN254_Fq::from_limbs([
                0xef3cafc8dc3a8f163f4abe5d93a974,
                0xbe2d246c9777bd417ae7e448b1f251,
                0x0942,
            ]),
            y3: BN254_Fq::from_limbs([
                0x05fb6e14fa66d253fb231a5e375097,
                0x646ae6dc006b8bd420717139bf9b4a,
                0x2d73,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xdc67904ac5ca0ee718c383c795a287,
                0x5e7cc29c16116bf238df0d20028c12,
                0x272b,
            ]),
            x3: BN254_Fq::from_limbs([
                0xf151b7719309f08fd0747127ab35a2,
                0xb20490bd901bdc1c399cf3045e485d,
                0x03a9,
            ]),
            y3: BN254_Fq::from_limbs([
                0x623611e75c0fbdcc88d02199b205d1,
                0x1309edf235af337b2df51755f76dc9,
                0x0174,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x39025367aadf95487e829359d72426,
                0x8ea38bd0ee4c0ce7ba2b6787ea23f8,
                0x033a,
            ]),
            x3: BN254_Fq::from_limbs([
                0xf58d280d811364629e231bbcee272b,
                0xf85f2e24fa7ea079247856f6eb22bd,
                0x1780,
            ]),
            y3: BN254_Fq::from_limbs([
                0x6c8760ebd3540647e7971b694ce7c9,
                0xadfc76abbe00209bfcc6ecd4c24948,
                0x1d13,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x35905bf9c74fc1881d68b988d189ef,
                0xeaaa7a766b9af21a2095868da921ff,
                0x1be3,
            ]),
            x3: BN254_Fq::from_limbs([
                0x30d6a5819db044514f0312d6f4527c,
                0xea5795cb4eb087ce13888e43cfa56f,
                0x29c6,
            ]),
            y3: BN254_Fq::from_limbs([
                0x0c4fb450adb27d3de129462f910086,
                0x37529f9f3fb495d3c353fc1dd5f14a,
                0x2c67,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x3701a25d9e599ea5493b5e1f11b949,
                0x0c3fa76c240145395de87ea7391b96,
                0x0906,
            ]),
            x3: BN254_Fq::from_limbs([
                0xe7176c5fba4e55243cd3d318daf7a0,
                0x2b476cb9db83bdec2f1d5f0e105559,
                0x121c,
            ]),
            y3: BN254_Fq::from_limbs([
                0xadb447dfd5a54c2c24bddbdae98855,
                0x5e21c089348af9a053e058998a3404,
                0x0fdc,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xa492b170fe9cc578b6244af0970d50,
                0xe5b2f54ec3392d8048d4adfab57c2c,
                0x0baa,
            ]),
            x3: BN254_Fq::from_limbs([
                0xe399f1dbf2c0ce9a957e9a82635338,
                0x59a4e8bf593ad93e7263a54267b631,
                0x10c2,
            ]),
            y3: BN254_Fq::from_limbs([
                0xf7c017109acfda6ba0d0439673096a,
                0xc7a35e0170b73a3ae6de6438b267a2,
                0x1307,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x9a94015a497502cb3aaeb73840321c,
                0x0bcbfc6b282b4146297f0ffcd8c87c,
                0x22ea,
            ]),
            x3: BN254_Fq::from_limbs([
                0x7dbe3ab34860eec5a715649c2f85f3,
                0x7f952c8a754a7c349fee299e09c1f0,
                0x0501,
            ]),
            y3: BN254_Fq::from_limbs([
                0x267d5dcf9e2f5787c2f1ef0bff3a01,
                0x9a75175aff43bce8dd13b01296f9b6,
                0x0a74,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x4ce4fd8b1e9d5a4a23aee9c6720dec,
                0x9dfa2473d2511b11f4df892a59bebe,
                0x2332,
            ]),
            x3: BN254_Fq::from_limbs([
                0xc0420b7ec2e95599fe5cf967ff7f77,
                0x01e9c0d343dc2a37fb94f4b1fe33ac,
                0x2910,
            ]),
            y3: BN254_Fq::from_limbs([
                0xc616c10908f476e4de67490055018c,
                0xd05158e1aa29e1518c19da0a8ad254,
                0x0b14,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xe6e1f8d2d9fb2d8c89edc5d7c301af,
                0xa1bc50cd7105908983cece316f09ee,
                0x0ef5,
            ]),
            x3: BN254_Fq::from_limbs([
                0xfb78850089695a45cd07cd09804cf6,
                0x5e3f651090b61fdd9be08a98151a3c,
                0x04ef,
            ]),
            y3: BN254_Fq::from_limbs([
                0xaf01218f8dd1883a72e22f6d413c91,
                0x3db2512b0fc3a4591fc90cdc021e14,
                0x0895,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x855f595ec951b570930b7cdde3d226,
                0x0c26c2f25b7a0a6707c7f6e02d9929,
                0x151b,
            ]),
            x3: BN254_Fq::from_limbs([
                0xe35bd987e0e169a411313dafcd8dad,
                0xdc266e9e1aeaeaccf070e7017608c0,
                0x080e,
            ]),
            y3: BN254_Fq::from_limbs([
                0xdeaa2958c8d0ad684a17537b7b2798,
                0xeec57414214e653d48c639be9d17c8,
                0x28fa,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x12814aa381003c39efcf5ab76654,
                0x196a5df2278e3a80c4c04e01aa7fb4,
                0x261c,
            ]),
            x3: BN254_Fq::from_limbs([
                0x6dcf00812c6b37b9f5e2b51ffa0b,
                0xdc9e0d6ff5778a408c2d0a38f60c7d,
                0x1af0,
            ]),
            y3: BN254_Fq::from_limbs([
                0x5cf5c6d4f440dcfc44407027c0cd5f,
                0x29b5c6e7a5272c0b0e788f0e5ecff0,
                0x1856,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xf4b2da1d8882710b6560df862db3c8,
                0x4db421d7f3335a9fe31981b7f91094,
                0x2787,
            ]),
            x3: BN254_Fq::from_limbs([
                0xcb427febde3df32047cd9e94b89964,
                0xb76d37d5e27012e867dcc54543ccab,
                0x2c9e,
            ]),
            y3: BN254_Fq::from_limbs([
                0x35cc666542d00fa9574ca833a674dd,
                0xb7df21408d189ca0d33c737e8080c8,
                0x09a9,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x94d5ef396fab374c47202606f21422,
                0xaf9f91532df34a39205803522419d5,
                0x14e2,
            ]),
            x3: BN254_Fq::from_limbs([
                0xeb43482f64d7f280e8f5e32e46b175,
                0xf462e43f1a3e3a5b21b26b53a2b415,
                0x1c34,
            ]),
            y3: BN254_Fq::from_limbs([
                0x6efcaa1eafacc475322ed1fd616c58,
                0x2bda44c551beff68ea73d687b8a62d,
                0x0bf5,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x636e616488ce578e0310bbbccf9b68,
                0x8a3e8359eb1892e0b4697a6e10276a,
                0x015e,
            ]),
            x3: BN254_Fq::from_limbs([
                0x1f24be5831520a65dfeea784c74d63,
                0x90bdfc8dda67132b0b023327fa7e31,
                0x1ae6,
            ]),
            y3: BN254_Fq::from_limbs([
                0xa33ca71342481bce17fe13c420f7ef,
                0x9a63dd8d36b7d6aa06b52d9ddbc764,
                0x05fb,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xa8c537e82b7e726dd00c245c5de15f,
                0x5bf6856c8da6e38d88e90ef086c4d2,
                0x177f,
            ]),
            x3: BN254_Fq::from_limbs([
                0xa1c8a2004588641a5e543377ef87f8,
                0xed025478bfea9284fc558b0b6ef795,
                0x1b1e,
            ]),
            y3: BN254_Fq::from_limbs([
                0x173edb71a9407b2389308198a6483a,
                0xd9c5949591c6b5bc36590a2113c9dc,
                0x21c1,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x07f3bcf68915610164a8244345250f,
                0x1717fb311e0c6d84a8ee2bee3ade91,
                0x2193,
            ]),
            x3: BN254_Fq::from_limbs([
                0xdd266b98072741a48a05ede2f64a61,
                0x69d6080adfe7fcd1899066fc890d54,
                0x293b,
            ]),
            y3: BN254_Fq::from_limbs([
                0xb3927ff86a4a775bc5d0e72de203bb,
                0x0adaf53964b7e44a38b7cd8fe5a9d4,
                0x13f9,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x0b7959a227dc333541c1f3ec17bf63,
                0xf3e68cb46f44b2c5acdb16210fbe2e,
                0x0e3a,
            ]),
            x3: BN254_Fq::from_limbs([
                0xcf7b288d47784ffbc77518eca445c8,
                0xcde6ecc40d58c5f0a4525ef5635d7e,
                0x2649,
            ]),
            y3: BN254_Fq::from_limbs([
                0x2b132d96fe16a07048d89db2b26ccb,
                0x9766e0e0c26ecba22d2d25d011b397,
                0x1606,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x63b309ed13b6cf79455d1bebeeaa9f,
                0x1acf0b0684aeea1cc0f1333833f157,
                0x0274,
            ]),
            x3: BN254_Fq::from_limbs([
                0x3e0b60fe9862e55e6f8ee289c228fe,
                0x3a25cb274e5bab206ace360ec67875,
                0x2c10,
            ]),
            y3: BN254_Fq::from_limbs([
                0x1bd006b90fbe3bb2dc6c6e4176bba5,
                0x8d65ed77b836e3707fb130de34e8e6,
                0x26d1,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x514880e34b9945056b6f8ce07a6ab0,
                0x2a8f0e347361102dd8b44fdb94f5b7,
                0x16e4,
            ]),
            x3: BN254_Fq::from_limbs([
                0x340fe217a9a7810d0fc2910deb129a,
                0x0cad4038f99c6afacc1584fbe7fd4c,
                0x1860,
            ]),
            y3: BN254_Fq::from_limbs([
                0xb8afa14d5a96eda5e46a630ff6ee4d,
                0x12c5449f02ca7a91c1729c5cdad98f,
                0x0bd3,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x95ec7c2cdc35f4104caf0bcab15fb1,
                0xeac1df2fbcf5cbc03206f68991e515,
                0x0756,
            ]),
            x3: BN254_Fq::from_limbs([
                0x5a7c332858cc4c0e54f392ba412da4,
                0x76cca7674cd4147314835fca4f526a,
                0x11d6,
            ]),
            y3: BN254_Fq::from_limbs([
                0x8f6ac0488651de4ae853e4cf4aae02,
                0xc0640ab4cf861c3ec7aa401a795883,
                0x1bc7,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xca9e3126be46f168c9938a64713d09,
                0x47ae28b3712b4977e631f08e300329,
                0x0158,
            ]),
            x3: BN254_Fq::from_limbs([
                0x9fb3dec1404960752fe9ae893d2c53,
                0x0b36b83967d628f8f8e4234f8761a0,
                0x0312,
            ]),
            y3: BN254_Fq::from_limbs([
                0x3684606137fb03eabe570c885f9c24,
                0x2ed1a95203383396c948edd6d381ad,
                0x2aa3,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x8d3e4e94a8806bd4585ae41fef109d,
                0x8fb7faefdf6370527715dd7b115cda,
                0x19b6,
            ]),
            x3: BN254_Fq::from_limbs([
                0x7348e1e1c8c44ab1b5cf571a63bfed,
                0xcf79a14c1a6a50d079199267d1729f,
                0x1e26,
            ]),
            y3: BN254_Fq::from_limbs([
                0xce9de7d23b8d5f3a9f12b2aa1ddd43,
                0x50b6695d1aacf0dbe8f0f622af5adf,
                0xef,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xb5ed7aa84d29def934096df8cca30f,
                0x46a6fbdf675283994e5b7497e50525,
                0x2a82,
            ]),
            x3: BN254_Fq::from_limbs([
                0xa42c82ab49030d33147185216b37e5,
                0x304794a21c1ad5774ffce3f873eeee,
                0x1948,
            ]),
            y3: BN254_Fq::from_limbs([
                0x4f6bbd67ae661243235475ff219072,
                0xe72b27c6404e799415d75d4c2388e8,
                0x28d2,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x8b762575c3a2c88f9853ce5feb3d95,
                0x681a81d1ad941aa000635fc10ef8bf,
                0x10f8,
            ]),
            x3: BN254_Fq::from_limbs([
                0x1771327cb314ef387ae1f4b9447b1b,
                0x52297926b37c60a4f7de3381e3b0ca,
                0x29a8,
            ]),
            y3: BN254_Fq::from_limbs([
                0x13a9d1805cd34428c718415759773f,
                0x73d9ada1ce5ba1e5ee42a73d650c29,
                0x23d7,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x440f2288df69deb8435da4513f3d8a,
                0x4d07795ef23cc79f1facb9d68e0ff7,
                0x3057,
            ]),
            x3: BN254_Fq::from_limbs([
                0x96396f1531ca59ef7342c3a3993f75,
                0x227d056b49da8b5a654974e5be119e,
                0x1b02,
            ]),
            y3: BN254_Fq::from_limbs([
                0x60f4285fea1e2b60fb6c99db026371,
                0xaee941cdebdfe8cc26ddf7973e85d9,
                0x0bf2,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x5fb2711278c1adb377c6237ca63301,
                0xd1bc64cde0431a868ba2bb73237a24,
                0x2585,
            ]),
            x3: BN254_Fq::from_limbs([
                0xd86aa1ab6c0d75bffbb822f9777314,
                0x5e56ab4aa8266819664c1d820de0fa,
                0x2e22,
            ]),
            y3: BN254_Fq::from_limbs([
                0x7e0624d70d889e7ed434b16fc277e0,
                0xbb20be60bb1205c8e6356016aa2894,
                0x2ef7,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x81aa9f49a39c5aeab1343550ba4034,
                0x1c765283e1040105d8e0ec5e159560,
                0x0bfd,
            ]),
            x3: BN254_Fq::from_limbs([
                0x6239c1af0a5df46bcd842caf914858,
                0x01ad44cd6e3f5b5dfec6d0775a4bb0,
                0x2103,
            ]),
            y3: BN254_Fq::from_limbs([
                0x643100c576ac7cf5a03db4ce130fb3,
                0x6f1fce0f6870a1d53dc1553a29b391,
                0x0ebe,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xabc7eb3711334eb80558f84ca563a4,
                0xccca46154868d6e3f9267c01cb098d,
                0x1f38,
            ]),
            x3: BN254_Fq::from_limbs([
                0x7bb03c3304ef355b0586aba6f5aa59,
                0x78775403a8d098da16c8b11f8594bd,
                0x17fb,
            ]),
            y3: BN254_Fq::from_limbs([
                0x64e7923de25e919f14d06fb91fbd,
                0x0d48ebd7bfb72a619763c10264ece8,
                0x178d,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x59a9f404becba933faa343c90f3c06,
                0x87eaef3e178ba673bcb51474cb5342,
                0x269e,
            ]),
            x3: BN254_Fq::from_limbs([
                0xbfb688ef9e3ddbe43ef9dff790200a,
                0xe0a2dbfabc305053e5c8852f3bc828,
                0x2ede,
            ]),
            y3: BN254_Fq::from_limbs([
                0x6a193fac8977747fc115a1f84ce5b6,
                0x4e800237b198a3d8934f42a5dbcf88,
                0x028c,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x8eeb87453d10ef3169c6e0afdfcde3,
                0xb946cfa2e7113b8129294d86f7ced8,
                0x2443,
            ]),
            x3: BN254_Fq::from_limbs([
                0xd69d60ac36c1df5ffe0354e3e9bc9a,
                0x6df09039564a449133837afb21ef03,
                0x0299,
            ]),
            y3: BN254_Fq::from_limbs([
                0x77e77ecd41e1182a514f54156e198c,
                0x0821d04ad7773fd589074f219f7dc3,
                0x0228,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x8e18529bb4b3ef5cf3793769cace1d,
                0xdd8606ee906a5b9e0509ea21fcf680,
                0x06a0,
            ]),
            x3: BN254_Fq::from_limbs([
                0x87e0b1b60e7b9ede0b7cee86c37adc,
                0x805ea3d8a32cadffd699fcb9aac47f,
                0x0403,
            ]),
            y3: BN254_Fq::from_limbs([
                0xd92be94ec1094cc8bf57bf394a7766,
                0x773a15cf29c38311d57c51f4691a12,
                0x104c,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xeabaa73a9ebdcedd211d6cb8f805fa,
                0x48340a2c8cd3b51c33bfb5b6d30454,
                0x099b,
            ]),
            x3: BN254_Fq::from_limbs([
                0x119833c6e7896d33ffcda251b08fff,
                0xbffdc8c30ff21c6afd9aa4ac56edd4,
                0x1c1a,
            ]),
            y3: BN254_Fq::from_limbs([
                0x1d0078b461a613b71d63936a28f8f6,
                0x599d28ec5efa9da82f6503204f1c3a,
                0xd0,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x6038fc6c8679d70e89461ec033a2d1,
                0x9d770019e3efd7a17b7c1bfa5bb664,
                0x1bb7,
            ]),
            x3: BN254_Fq::from_limbs([
                0x611d6ec2b8337a0eca1eae4982af56,
                0xc269392a1eb6025fb35e593ec409f6,
                0x0cb2,
            ]),
            y3: BN254_Fq::from_limbs([
                0x38e61b814ece650a70ce2c135a98d0,
                0xf833ce5bbc9c6a5cbb3f11e90fc1b4,
                0x2d67,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x675c1f16bcbe5881c8b05dbaaa7067,
                0x84301d80221263f1e452c6fb5abbc8,
                0x1837,
            ]),
            x3: BN254_Fq::from_limbs([
                0x920c9c34f173cc136816e365510f82,
                0x8f24f9e0e7b8a3e19560a7197b327c,
                0x29b1,
            ]),
            y3: BN254_Fq::from_limbs([
                0xab2bbd2cec1d23fe18c2146319c8a3,
                0x0f63ea8a3f1b56dbfc0feaea01311d,
                0x0554,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xc416cb3e9096e9b4207e50d7ff8f4d,
                0xb19ce9fb2b61e75a0f691b7c7046d7,
                0x0922,
            ]),
            x3: BN254_Fq::from_limbs([
                0xe36a3f13e5494f0988d4e1cb0dc119,
                0x2da8b82a35a7a52238fa8ff2ac7f57,
                0x18ce,
            ]),
            y3: BN254_Fq::from_limbs([
                0x6877ba6d0bf1fe19a9b876387c6e7f,
                0xcecfa5529214383f1e168af0a9e0e2,
                0x1edd,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xc7ea30748677483e7bc69355ae4050,
                0xd2cf4355fb86dda3973d99d7946e8f,
                0x09d3,
            ]),
            x3: BN254_Fq::from_limbs([
                0x5cbd3fec1a6604f164dfbfc20e159e,
                0x612739cf71f3f1cb9de2f04445cb98,
                0x0851,
            ]),
            y3: BN254_Fq::from_limbs([
                0x6bb0e694f2439b6b6b70291087ad3e,
                0x2ca780c5f0233e647242190d431593,
                0x0418,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xb3cd98c5583baf412795f2fd55c3ef,
                0xbf3777250a22ee3d38bbaf460157f9,
                0x15a8,
            ]),
            x3: BN254_Fq::from_limbs([
                0xc6802ab6eac712b62d82bb4bb1999a,
                0x5268a3172bba8ee573df478293911f,
                0x1443,
            ]),
            y3: BN254_Fq::from_limbs([
                0xcbb6d4bff093e38a6f39011255c2df,
                0x8b694ccac879c830c6bad95f1e33e8,
                0x2d0a,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xdbceadf730b349eb491da8c9a2e5aa,
                0x4374e42a6b27c2af334356e63018e8,
                0x2f6c,
            ]),
            x3: BN254_Fq::from_limbs([
                0xa61eb7bb407e240ddbd1d2ab6b92d1,
                0x4fa5046c41b7631cad6b84591dad29,
                0x1c88,
            ]),
            y3: BN254_Fq::from_limbs([
                0x7e6a7c89f1122ed32ba766c8bcbf33,
                0x9c6037b81af0150020691792dba137,
                0x25b5,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x8452071c9f8fd445131d7cde553c49,
                0xd2beadbc3d72bdd1d220ddebee2fd0,
                0x0f77,
            ]),
            x3: BN254_Fq::from_limbs([
                0xf7d58aec4ebf36e5bc6def7bf7f845,
                0xbd9373e870be16aa7e29298836e195,
                0x068b,
            ]),
            y3: BN254_Fq::from_limbs([
                0xabe67e974ebf0671e41814859a9670,
                0x7d4cef05202a990f5ebbb23a5b147d,
                0x08f7,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x757672f7137cf3587da908503b88f5,
                0xd158574531da72d6e60012b82a41ac,
                0x13c0,
            ]),
            x3: BN254_Fq::from_limbs([
                0x08aded2db19ecd6a4542a4a4ccca92,
                0x9f17f021d9e473c4d10227910f4600,
                0xf0,
            ]),
            y3: BN254_Fq::from_limbs([
                0xf211a5a9e551bf9b0b5c5e2402891e,
                0x4cfa4682ba163aef4fdc7e9dac92d0,
                0x09e7,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xceaf2caf74aa5043bdc3cdbf225548,
                0x87b9cd7b3def7c769330c93c7619a9,
                0x019d,
            ]),
            x3: BN254_Fq::from_limbs([
                0x52016448ed89f03db5d29d4903081b,
                0xa89890567da27fd4a288663fdf93eb,
                0x04b2,
            ]),
            y3: BN254_Fq::from_limbs([
                0xbde0b02f333b24153601a033730d65,
                0xa9d0ed6af54af09d8b96804941c4b2,
                0x0a9c,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x5855c27c682be286e41c1ec80b3a75,
                0x9c8fe4441604274860ef8c2c8088a7,
                0x2eeb,
            ]),
            x3: BN254_Fq::from_limbs([
                0x17316c108695a633fb1cb664a20bba,
                0x620c70d1f8374f1bc500c1e58f5a95,
                0x21fd,
            ]),
            y3: BN254_Fq::from_limbs([
                0x408e8854588e874288aa8f93fd65b6,
                0x5855b0645d5a9680b0e17611553a49,
                0x2d53,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x333e30ab6a0b3acbee3f9ec8d4dd4b,
                0xf54243b35f52e4381c71108545b53f,
                0x23ba,
            ]),
            x3: BN254_Fq::from_limbs([
                0x4b1f316b06b2b38fa59e7d4bae0f83,
                0xc344fbbab7471fab8ef1a69fc496f7,
                0x0d85,
            ]),
            y3: BN254_Fq::from_limbs([
                0xe2a7ac72109d7c7f53db710c552ab0,
                0xc82431fdc514d7a28c968cecc7cafd,
                0x0273,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xf23d9b6737d10fdc755c546b3a92fb,
                0xeb434e9b48ee69de72ba06c0746da8,
                0x0ebb,
            ]),
            x3: BN254_Fq::from_limbs([
                0x3a4c0909d22be1b997259cb2ebd769,
                0x81b8793809851f85b73568e30e12a9,
                0x0e59,
            ]),
            y3: BN254_Fq::from_limbs([
                0x5eb37da0bc0d86a9895838e71fb1e4,
                0x704d4b45d2da328dd32fbefd4f9a22,
                0x2342,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x1863143d344ea9bf847e2bd2bcfaf4,
                0xd71bcfca508ab00e22e6defb9288cd,
                0x0caf,
            ]),
            x3: BN254_Fq::from_limbs([
                0xad5d19eb6583b543f20fb21988b735,
                0x91b86612661d4455b13c514b99989e,
                0x0630,
            ]),
            y3: BN254_Fq::from_limbs([
                0xb67407bec5d05651e4230ce12831f7,
                0x14a2dd64bcfd441a9309025686f716,
                0x253a,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xb475e1ca2f95abe1b11470878b8cc2,
                0xb95310ce5d7ad9737b7d48e49ea96d,
                0x13f0,
            ]),
            x3: BN254_Fq::from_limbs([
                0x825676938d2b6abeb9c40daf268eb5,
                0x812a14867d1d70f794c2d07dd33289,
                0x0737,
            ]),
            y3: BN254_Fq::from_limbs([
                0x53a4b8193dc9c9ff64fb24bec110b5,
                0xbceb1dac9c181dd053d3ca1e6e272b,
                0x1001,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x96e8be6bdf1e3ad7df68b71e6ccb75,
                0x2d30e3c87118202b14ab718ebe8293,
                0x2c2d,
            ]),
            x3: BN254_Fq::from_limbs([
                0xedfdfbdeb3d6b1b663b2ea2fdf0525,
                0x4dcf3cb7052a7466746da1618e2c8a,
                0x03dc,
            ]),
            y3: BN254_Fq::from_limbs([
                0x11de24da4f26286d5ac0ba980b221e,
                0xd519219b628b151f3e196dde13acf5,
                0x1d83,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x49f7e8307d3e3cbf6ac32a932cf24d,
                0xf4d8e377fa42b589b49f4575350510,
                0x1d7d,
            ]),
            x3: BN254_Fq::from_limbs([
                0xe6747111e7bc5557b0e5fff35911b3,
                0x341ec37884610043d54fa2f8267945,
                0x057b,
            ]),
            y3: BN254_Fq::from_limbs([
                0x0d1e71b1efc821ea9ba261006a8b3c,
                0xd53d8184cf29906c585f88634b9687,
                0x21bc,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x1d8b78fae5253f9bc3d58a3a6248aa,
                0x9941d64cab7e68efe607ed1b70c22a,
                0x2f7f,
            ]),
            x3: BN254_Fq::from_limbs([
                0xd0c001dbdf31f20979e87c4ef329a0,
                0xf7324eeec941061c117b6f71fb0a14,
                0x1063,
            ]),
            y3: BN254_Fq::from_limbs([
                0x285417d7380fcf3c5ed030e5600f9c,
                0x0132bef0ad10e9717736c4c98bcd49,
                0x03ee,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x7470f5f5f8ce05db9c5eacfffe0103,
                0xdb6bb6deeafded111900146533bfbd,
                0x2be1,
            ]),
            x3: BN254_Fq::from_limbs([
                0x916453b28b27ba4c9b661283238284,
                0xaeb93293dc03073bc2b582c6abe9e3,
                0x2771,
            ]),
            y3: BN254_Fq::from_limbs([
                0x59ba04d0eef0d3648e500454c5df9a,
                0x7020506b2179e9b96c63d4dccec1f4,
                0x26f5,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x7e1152bc59bdc121364f58242244e7,
                0xd8951b5fda918b2ded748183839982,
                0x0d72,
            ]),
            x3: BN254_Fq::from_limbs([
                0x2114273322a2ade1cf3d9bc8f74cef,
                0x0c1bef4484653d7488b118c70bdd03,
                0x248c,
            ]),
            y3: BN254_Fq::from_limbs([
                0x8191b95acdbe077e135abe3ac694cc,
                0x9b9915ca5d8525cd2b19b77728c142,
                0x1385,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x9ab27afe952f1e21fe7efd7c6bf903,
                0xa40909908ebc36c6a143769d78e101,
                0x02e7,
            ]),
            x3: BN254_Fq::from_limbs([
                0xbde8359b61a1f3839ed1546d8cc796,
                0x80d63e1e4f369259dafc3078671fea,
                0x2757,
            ]),
            y3: BN254_Fq::from_limbs([
                0x71575df6a20e98e44bde665f4342fe,
                0x89002638ef90d4defed839894c95b5,
                0x1da0,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x719634912b9f99b8a64c7fee040dce,
                0x1e1e9c0a4b9da438df1fff8a95b9cc,
                0x0364,
            ]),
            x3: BN254_Fq::from_limbs([
                0xf82a395ae48431059a9e2176134639,
                0x5367480967202a1990974d2c244b90,
                0x18f7,
            ]),
            y3: BN254_Fq::from_limbs([
                0xee758f0d21df6438841688025db70f,
                0x47a90c0bfeb52b7aba42b6f2e6a504,
                0x2237,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x672bae26402cdc61e2820a208fcbd4,
                0x05f42cd4888b9786810cf2227b75e1,
                0x17a5,
            ]),
            x3: BN254_Fq::from_limbs([
                0xcce88096877b05f81751194d3cb687,
                0x1cfcbf875b69360563363dd2f6ec53,
                0x1b79,
            ]),
            y3: BN254_Fq::from_limbs([
                0x7e81c5fa901eeb751f74ffae149f3b,
                0x8735dca3cd14b8db1290222cdef13e,
                0x1640,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x60106a8e938f970a2e545c0f902b3f,
                0x3492867db87b8c790abcbdca57ed88,
                0x1bd5,
            ]),
            x3: BN254_Fq::from_limbs([
                0xf15a7b625096d25a73fd3b6c687dee,
                0xcf19a28599643b0fc34cb5727a3fcb,
                0x1afa,
            ]),
            y3: BN254_Fq::from_limbs([
                0x0691490e3116ada2fe1ec1ac920fae,
                0xd2e901ff9f3cd58cdf4c7bfb368c20,
                0x0210,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xf0c276ca5231976b4e9b490fb25586,
                0x460a6b37a4c49d8032fa817e1da026,
                0x14c6,
            ]),
            x3: BN254_Fq::from_limbs([
                0x3a0d9eabcd5305c26e63e3a6625224,
                0x97e6a5b6a59521b6e9fa99d2f19a63,
                0x27a1,
            ]),
            y3: BN254_Fq::from_limbs([
                0x4f40162906b77dcb953879b26ae19f,
                0x0a47d285d57c118c268eb98e1f8e4d,
                0x1b85,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x39e82119115ef478d892ecee8991d2,
                0xdde581a6a107811ed8cfdb6a37bc2c,
                0x1f19,
            ]),
            x3: BN254_Fq::from_limbs([
                0x6f21e217440eadebee3ce1d0e36b6b,
                0xd1a504dfb635695298d2ba6454aac2,
                0x09a8,
            ]),
            y3: BN254_Fq::from_limbs([
                0x0e9d76db2f169afdcc77a4e867b564,
                0x2f1599fb15c551ca56ca4546937423,
                0x25f1,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x245687022c956c70089ad3647cce21,
                0xa7d9a09db2fd5e41edfff4a6a87e50,
                0x101e,
            ]),
            x3: BN254_Fq::from_limbs([
                0x151bfbe79945d47205c8abcd32b8df,
                0xdc609949de9c39eb2959069fdf6678,
                0x09a1,
            ]),
            y3: BN254_Fq::from_limbs([
                0xceb617295f0f29c472ec6b58b02ca9,
                0x9008b7069c4446c3529081250530e4,
                0x0115,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x93d39372117918281072b6c54c0d1c,
                0x27acf403796cae2de6bea8241718b8,
                0x0fa4,
            ]),
            x3: BN254_Fq::from_limbs([
                0xf0213375fb91688059eae4fadff701,
                0xfadb17075586c025902c5e5479fd65,
                0x0f69,
            ]),
            y3: BN254_Fq::from_limbs([
                0x66097bab3bcb4fc11a1ea51111cf8c,
                0xab382a85f69de1199b38bf3debf832,
                0x1250,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x4575085bbc3220ec8d3b95924dabf8,
                0x67669b4e393136d29d70f2b54b200b,
                0x2963,
            ]),
            x3: BN254_Fq::from_limbs([
                0x78ee8b96f7087ba9aba027b9886d32,
                0xcbf8391a40c10fcc778fb11ee41c1f,
                0x1ea4,
            ]),
            y3: BN254_Fq::from_limbs([
                0xcccaa0577384f601098f1120e84f65,
                0x8dcac6ff001ca67bb0054ce3a29728,
                0x0e35,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xc2ebbcdf8c93bb404b7aee68cee379,
                0x886e6e8d12f0ef4aa3b7611d8c0802,
                0x23c1,
            ]),
            x3: BN254_Fq::from_limbs([
                0xc83d9e1b20e22ae930130fead65a72,
                0xb25a59efc458029f12f0aa9bf1dbf8,
                0x2e82,
            ]),
            y3: BN254_Fq::from_limbs([
                0x19d26f90d61df45209f2f87da0f0ee,
                0x7b53185ae04a885f8160dc54b3d91e,
                0x24d5,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x43f65ae041353a064a6336c27cf259,
                0xfc0206973123b29cb3c9fbb40d8414,
                0x2311,
            ]),
            x3: BN254_Fq::from_limbs([
                0x7b3bd124aa44cd0a0e69ba04ac571d,
                0x176275160f462d5b0010c50753f819,
                0x1fb1,
            ]),
            y3: BN254_Fq::from_limbs([
                0x3a326f3992eba2c9eb0805c337bf52,
                0xb46ad80cc20d742156451049495244,
                0x0d57,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x84ae08179f9fc32af4ef63fc1bf4e0,
                0x5d43d4bfbb0711033ba17747de87fc,
                0x1d2e,
            ]),
            x3: BN254_Fq::from_limbs([
                0xf2b77e1702a924c2c2211200aa7199,
                0xc4dd2b0154af106aff0b5ff5cacdaa,
                0x182f,
            ]),
            y3: BN254_Fq::from_limbs([
                0xb8fa144b5e0848000112ddc827c879,
                0x4d05f9fb78e53dd536e5fcf968bfaf,
                0x219f,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x6c81fd9c3f0bc1effa258becb59026,
                0xb87d6c7d13aa030f8d2669ad7467ba,
                0x2e0e,
            ]),
            x3: BN254_Fq::from_limbs([
                0x0c1d51e8a00e29338dcf6cc9c202f7,
                0x4ac75a169fcc35e29ff143d946bc47,
                0x2d74,
            ]),
            y3: BN254_Fq::from_limbs([
                0x4a7e8a4ffb9bec23400d203026d6ca,
                0x98facdc0d0e30f282d7395edb0930a,
                0x2033,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xfe5548686a9a9706e7c7efc5055b10,
                0xd54ed0051fadac7583e9c2ea62b5f5,
                0xe5,
            ]),
            x3: BN254_Fq::from_limbs([
                0xec45c00a3b90ecd79999857749a22f,
                0x04e5b6bb87dcc8ed5ba7c22770e27b,
                0x1f61,
            ]),
            y3: BN254_Fq::from_limbs([
                0x70ef8f215458b04e4c4dcb8871b8f6,
                0x3de520fee9a47bdeb759a72049599e,
                0x2d67,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xb49809b56e83a4f24c2cac04b87aa0,
                0xa33961d06e796302ca70d409a4befd,
                0x4a,
            ]),
            x3: BN254_Fq::from_limbs([
                0xbbd3af826b694d469c1c1edcd6b455,
                0x78b0577da3e3245e9af98365bec0c7,
                0x0490,
            ]),
            y3: BN254_Fq::from_limbs([
                0x470759391b2aad9c7787a5387eb6a8,
                0x0d42bcf0fd4cdec3946d817fecd59d,
                0x1e8e,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x31dd22e9c96c81fdc713a0b519a630,
                0xe60d5f7c7e46097bce5b1359d84c7a,
                0x216c,
            ]),
            x3: BN254_Fq::from_limbs([
                0x61486151805ef909f4d2cb36cf2415,
                0x6668ef0cc4879506ef770c699ded6f,
                0x0740,
            ]),
            y3: BN254_Fq::from_limbs([
                0xf47e241f668a46f5e28ecfd9f33c0e,
                0x8acf4fadd5005c673a40b7ea2a8728,
                0x1998,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xbee48813f6b84f7b162939796ea9ad,
                0xfa6acb32e6db04c090e1d9a7912c13,
                0x1168,
            ]),
            x3: BN254_Fq::from_limbs([
                0xc50f07c025e84932783d57a7358d61,
                0x0a696a0e5eede6c64fec1082c6216c,
                0x2ad1,
            ]),
            y3: BN254_Fq::from_limbs([
                0x48021a5bd67d2186de674d02f87ff1,
                0x966bbfdcea2aab70766eb3ebd36700,
                0x02db,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x14186cc545622b3ef81ae4ca694d12,
                0xbad6c7668d6bc352f2e825228bbf6a,
                0x1ff5,
            ]),
            x3: BN254_Fq::from_limbs([
                0xf50342e61e195b3da9d926d5ba41e4,
                0x4b1595727c487664767b454a8a211c,
                0x2521,
            ]),
            y3: BN254_Fq::from_limbs([
                0x0e4a3d133d186e6d01d0d2dcd3d4b8,
                0xca629151fc3185b74a53f703f77810,
                0x2a47,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x8dcd3c9a1bb608bae4dce3f0902b53,
                0xa4d616b4e711d2227d0436d64c5a5b,
                0x0d78,
            ]),
            x3: BN254_Fq::from_limbs([
                0xbf617c5676664aa3a418bf62a36dd1,
                0x187b8c1b6c185a51516faafffcfa3d,
                0x27ed,
            ]),
            y3: BN254_Fq::from_limbs([
                0x717cdd0f6840c42f2e08d52bdc4606,
                0xad59218ade1d50ce92ec397dd5512c,
                0x2046,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x96e4c731e6589c1d40a24451764d27,
                0x491b75d11bb6cb64febff031ac7a0f,
                0x2ca9,
            ]),
            x3: BN254_Fq::from_limbs([
                0x7ffeffdb595ae9028275ad998e6afe,
                0x9d1f9123e768ccb7797be3e4c25e7f,
                0x2633,
            ]),
            y3: BN254_Fq::from_limbs([
                0x2d17d5ab6ee9905f5e04ba2b72589a,
                0x6afc176309efece00a5eba7a7f73af,
                0x1f58,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x50f891a454e6788776ebecd0c58b64,
                0x24ed19d8a7b90efa56c09b39ee53d9,
                0x291a,
            ]),
            x3: BN254_Fq::from_limbs([
                0xf1870eeb1f9c533fc2466121b897dd,
                0xdcb19c8d9c94847585dab98d85d4e3,
                0x0f2f,
            ]),
            y3: BN254_Fq::from_limbs([
                0xcd7a59facca688dc1f7745c5c9ffa5,
                0xde602b412ae0b37371750598c36b20,
                0x1d6c,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xd2ddf5b83070060d6a33bfb46f2b99,
                0x994404b0dae88b6362c3b404fd25cc,
                0x0a01,
            ]),
            x3: BN254_Fq::from_limbs([
                0x68302a9d0a5693f33ba11efc3bf429,
                0x6c644f120f7b834ca7a29b0e6453fe,
                0x2ef5,
            ]),
            y3: BN254_Fq::from_limbs([
                0xb6e8ce54e23cecaa00b0bc2957c5c9,
                0x13085c14f5ae3f97003a6843682850,
                0x205b,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xcfa92542b2bd72e83483f5b9dae56e,
                0xef3c698d0921ba2a612b1752bc9e6a,
                0x108c,
            ]),
            x3: BN254_Fq::from_limbs([
                0xdd9afc97a3cca3464d42d4d8ee816b,
                0xa9b4d8a1bfbcf0eabc6d0bb85a5816,
                0x0d36,
            ]),
            y3: BN254_Fq::from_limbs([
                0x9d168adf3b1f0b7ad57cd261871e8a,
                0xd30823515e4bd04f40287d3f869ea0,
                0x039d,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x85f31060eae47a7429c4a9b8dda9b3,
                0xe7f1ecccf596a7953811fc86859e2a,
                0x21ea,
            ]),
            x3: BN254_Fq::from_limbs([
                0xdb7718d7efd4067d50fa0d674ed78a,
                0x1d489562bda479ce7bb24b157d7981,
                0x115c,
            ]),
            y3: BN254_Fq::from_limbs([
                0x95f0eaceb3a083c2fb9c6b7d43b092,
                0x8bb4bced4dba847111e3489f771cd8,
                0x1a6a,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x617d53f6413798456227cfdf018466,
                0x3c8e5d63113e4493e59a8241f40adb,
                0x24fd,
            ]),
            x3: BN254_Fq::from_limbs([
                0x1d537d41f55f76f6e08de2bd16737a,
                0xa865a93ce86073cd8f55aaf8ef30e3,
                0x0228,
            ]),
            y3: BN254_Fq::from_limbs([
                0x94e15189b641f52f15f3498f274fb1,
                0xb9d5a1450f2da67d738bb67f696dd7,
                0x2d3d,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x90657f74901a8cf1e32332704af177,
                0xfad774350c3291e5d6071665b89613,
                0x1c2a,
            ]),
            x3: BN254_Fq::from_limbs([
                0x7a7cb8e6583c02bc687a566fb2f988,
                0x16d9401d352915bf9265ca3f766523,
                0x2296,
            ]),
            y3: BN254_Fq::from_limbs([
                0x4e62c9dfcbd55a799bf2dbdf8a0a94,
                0x7fd5ce0d86394aecb32f22bfdc1a12,
                0x099b,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x262b06c79f4ac1486650cf88b5abc2,
                0xeb9a41a0f1ffdbb1f57e7111b39d81,
                0x0b10,
            ]),
            x3: BN254_Fq::from_limbs([
                0x09611283e9758d6117a087726d5217,
                0x1d3360b7279f40fcbbdbea67b2a261,
                0x23f1,
            ]),
            y3: BN254_Fq::from_limbs([
                0xfcd8dd2d24a4ab54801812fdf1c335,
                0x8237eca233b70597741be156dc1b0b,
                0x2f2f,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x39107e929f423435956122e126e6ce,
                0xf0cb9ce41a16e3ae3f0d3193614629,
                0x1cff,
            ]),
            x3: BN254_Fq::from_limbs([
                0x057519c38ad586b1550966c9f5dde3,
                0xd16889f8cacf0610ac15d0d0942030,
                0x27dc,
            ]),
            y3: BN254_Fq::from_limbs([
                0x02a8edfd6ecf99a3cf151c88999998,
                0x323bf9edb75f5d10de641115c1fa7b,
                0x0751,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x0b971caf44399b214d2c646534cbfa,
                0xdf2ac925fa41b13c0e672ee535b2b4,
                0x078c,
            ]),
            x3: BN254_Fq::from_limbs([
                0x3251d2cfe4b012dd4062e44ebb8c63,
                0x299f25661afd71ca86107a01e1ed5e,
                0x0f40,
            ]),
            y3: BN254_Fq::from_limbs([
                0xb5f6799e51a59ff05181ffdcfdc090,
                0xe3554c9e3e368a3d9f4abe8b121a8e,
                0x18c4,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xf1585d62fa07e84fe136544bbf8789,
                0xba0c2a92bcdcbdc28d56b847d5c1fb,
                0x0222,
            ]),
            x3: BN254_Fq::from_limbs([
                0xacfe3fa60b2a627f041c33f09d936c,
                0xb4c7426c4503897f388a77adff6a6a,
                0x03da,
            ]),
            y3: BN254_Fq::from_limbs([
                0x9be251643e02af0350c3788d702d16,
                0x9b1d15d39912460d30b35fe8dd32c9,
                0x07a1,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xf8fd9a2cf62366c3330a1bcb27f1bb,
                0x8cb89533a7a1018da7325364e48ab3,
                0x10f4,
            ]),
            x3: BN254_Fq::from_limbs([
                0xf7da9a922c33a5b46defc1a0b78037,
                0x29ed173ec99c312021aa7bdd887ea4,
                0x0c85,
            ]),
            y3: BN254_Fq::from_limbs([
                0x465bac7a3ca9c7b54ad77e1f2b05ef,
                0x2285da71b35120f64e4d4eef402ccb,
                0x28d2,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x79ba1234e60954ee08baae13b907af,
                0x7acb5a5c7df2a3d366eef01179d684,
                0x1b91,
            ]),
            x3: BN254_Fq::from_limbs([
                0xd80009b2ea505f424a5c37ce02b5b3,
                0x5a890f3d90e8c5fa90173e8c62df82,
                0x1c05,
            ]),
            y3: BN254_Fq::from_limbs([
                0x025b9bd689ff443c55dcf4c3f0a7d4,
                0x62a03680173efb4310b3317538c8e1,
                0x1ce2,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x7f1aa19330b3454932636033adf8ff,
                0x58b0f86e8bc396d3a6424ab944e178,
                0x1a2a,
            ]),
            x3: BN254_Fq::from_limbs([
                0xd58f39ce310d9f36a74ba18ae6f057,
                0xb4d12fff21903859314041dcede7df,
                0x2781,
            ]),
            y3: BN254_Fq::from_limbs([
                0xde25ed6dec17025cc119f06c18f7e0,
                0xae28b466fe54632055cf41cb968c24,
                0x187e,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xc6d991a9a6a2ecd8ba95e501188f34,
                0x49c35ea26c1b3ed8c5158431e438ac,
                0x1a74,
            ]),
            x3: BN254_Fq::from_limbs([
                0x72469353a61b44eab6eca78b532a64,
                0x73b3a68e44be663c3932ea982555b9,
                0x14ef,
            ]),
            y3: BN254_Fq::from_limbs([
                0xabd931b2104e3f201c4380099d2741,
                0x178319eb83c0f2a199665d22bde3e9,
                0x2f8b,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x39405c1ccabdeca193ede658339a75,
                0x9d2920c7847afe035585847162f773,
                0x189e,
            ]),
            x3: BN254_Fq::from_limbs([
                0x62e85f84b9fd932c64f6a5e4f63adc,
                0xfb68b70a0879594b0b2dcaebee60a6,
                0x27fb,
            ]),
            y3: BN254_Fq::from_limbs([
                0xf502b0d42a00b6724e4cbbb51604ce,
                0x30c5b912f8f0fbbaa71f0c1842d8cd,
                0x0a58,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xd1a72c7d8f0f452a0827cc6f5aadd2,
                0x30ac5f97e1e1c5b289b34389c7cf56,
                0x1d78,
            ]),
            x3: BN254_Fq::from_limbs([
                0x52536863f12f464b5b80da3cd8c02e,
                0xe6189c9ba5e9abfdd40fde8f0b50ed,
                0x2ec6,
            ]),
            y3: BN254_Fq::from_limbs([
                0x5004c7ca8e2816fb70f9dd4dc54b04,
                0x4c334905f74c3c203c350a43188352,
                0x21d4,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xacfe15c74cfa1ddb8b3433480e9594,
                0xba55a8660a473c800f773c78326681,
                0x271e,
            ]),
            x3: BN254_Fq::from_limbs([
                0x2a3cc275b113315bf4b597d89567bb,
                0x91ca7697da53ed4d160d38f74a19ec,
                0x1cc4,
            ]),
            y3: BN254_Fq::from_limbs([
                0x9f4b75b836743f94dc316309253db8,
                0xe07948621e81d6229dfa76fecfad5f,
                0x03a4,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x1a957097d560adb67755edebe336ff,
                0x408233c6273bc73c39ffe2b12eba4e,
                0x15b4,
            ]),
            x3: BN254_Fq::from_limbs([
                0x01a51e551beae141675f6fd539e24e,
                0x09ed70546054930bb06c5ee475ed37,
                0x11c8,
            ]),
            y3: BN254_Fq::from_limbs([
                0x2af1a2bece3010c9ecbdd21b60f1d5,
                0x85d6c6090fa4f19bd3dc451aac8d4e,
                0x039e,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x2367e04ea59223aef1a167c430761a,
                0xcc8bc21508bc261d1311575d8503db,
                0x0d76,
            ]),
            x3: BN254_Fq::from_limbs([
                0x5f13888a9f841fc043da1c87aa470d,
                0xbb50544c3b4190203456e448a801d6,
                0x0789,
            ]),
            y3: BN254_Fq::from_limbs([
                0xce4b8fcd3ce54da7ea49fbadd9ecf6,
                0x637ee440d687b5513bdb9ac876f003,
                0x1711,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xe2fa8896449c2179891e75700d7d63,
                0xe865ad1d3b3a47a97709bdad008571,
                0x75,
            ]),
            x3: BN254_Fq::from_limbs([
                0x76715f19812a07918543ab561c4fee,
                0xb5b79962f876d3ac8ccf1cf95086ee,
                0x2877,
            ]),
            y3: BN254_Fq::from_limbs([
                0x3aa80ef4659dad54619b06b26fc124,
                0xe4394fa3f20a78158b9045073b2175,
                0x2ae8,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x2684692d30e7c15b598fea6dbc994c,
                0x073fb9c22a6565a4fbbf8f546e1648,
                0x180f,
            ]),
            x3: BN254_Fq::from_limbs([
                0xded04f71500b2dbd9396ef0ce3ef23,
                0x79edee942fc959be80cb21d097bb0b,
                0x19ae,
            ]),
            y3: BN254_Fq::from_limbs([
                0xf50b7349aa197999479856ce7b2865,
                0xbfc1808b990afd19ddb1caa5b6f1fe,
                0x12d5,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xd5f6bd6263b6b98ec955f1f31513a5,
                0x9d373eefd9fcd4b0c18327ba5a8846,
                0x2c0f,
            ]),
            x3: BN254_Fq::from_limbs([
                0x100b5b0486311e52e7ab14f47c1f79,
                0xe2e8cd4fca6eea89c02b09d2b22154,
                0x0e14,
            ]),
            y3: BN254_Fq::from_limbs([
                0x4ef04f57a517aedd425caafe9c1153,
                0xce428f460feba26620222063f1e285,
                0x0d16,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x2333c95da65e7bec9d9c1b3a007fd8,
                0x979f4258342fa6c6e36490936f1b7c,
                0x2c3a,
            ]),
            x3: BN254_Fq::from_limbs([
                0xf53fb78cf32e14fe4488d9f5c83a67,
                0x74054d78234ea33287b789ce8ca3e6,
                0x1950,
            ]),
            y3: BN254_Fq::from_limbs([
                0x6ddae52b11bcb3b246f8d2ec66c28b,
                0x6e2e349b452841763b02998fb86191,
                0x1af7,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x474cf2975aa20de026f17de8fc2c55,
                0xc3d4dae59096b9606e8d6eac217ccb,
                0x1c00,
            ]),
            x3: BN254_Fq::from_limbs([
                0x637ed028a3f93bf5bc1e690946ddc9,
                0x3884d4b9bb3d1cb67d615570d3a32d,
                0x0b9d,
            ]),
            y3: BN254_Fq::from_limbs([
                0x0cd83c51866dcfb6c12627d988cde5,
                0x4f3f356f34a3d6c8cb08074846879a,
                0x136d,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x63bcaa8c1147eae3e2e77fdeed34eb,
                0x42a9e3e4678beedb091b95e2991bfc,
                0x1f1c,
            ]),
            x3: BN254_Fq::from_limbs([
                0x2219c8f53adc170d9a6685dbb0f244,
                0x6f1026f4ee31ba6f98eabf761f8652,
                0x0740,
            ]),
            y3: BN254_Fq::from_limbs([
                0x0c9a924477e0984ade7d841d50c5e1,
                0x520734dd37e150bfee6fc2e2960256,
                0x0e9d,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xff93b6ca2eb14aa71623a26e513e5d,
                0x8bb3cd66b8214b11b3e5d886ad2369,
                0x28df,
            ]),
            x3: BN254_Fq::from_limbs([
                0xc0fed8a44e9c970955dd3ac3226382,
                0xd0aca726875509adedca2a261be71a,
                0x1f8e,
            ]),
            y3: BN254_Fq::from_limbs([
                0x3e5091c265a2d3a7e5bbc163d1aafe,
                0x96f0e58def1bda09de140a83f2f786,
                0x20f7,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x6bd1c8e2c2ba2fa624b79d9dd18930,
                0x747a55e26c9120a2adf56fe2989765,
                0x052b,
            ]),
            x3: BN254_Fq::from_limbs([
                0x4cf8471dd88cd086a8e5e8b05eebc9,
                0x5a3780310f2be74a76e950526bb20f,
                0x09d1,
            ]),
            y3: BN254_Fq::from_limbs([
                0x315a161ad7265c700b454c3e5f2bf7,
                0x70c4a1b7725d18fa6f47a7c1820f25,
                0x2b5b,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x8a84b20eca4f9d1f7a5ef97b10ab88,
                0x5d0f9b1215d08dd7b5ad04ad7b0d70,
                0x2e6d,
            ]),
            x3: BN254_Fq::from_limbs([
                0x5d9bae918994d9441665314f887b6f,
                0x36092083f27782be03a20e74bdbe03,
                0x0880,
            ]),
            y3: BN254_Fq::from_limbs([
                0x6af03a33c5cb770fe78e4fb62fdbe7,
                0x2ca7abb2589221f50ac559ded4f211,
                0x04a6,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xc0dd9bd0a2aeec4015674ddb0b0313,
                0x440d90742c528b46c440a449f55b2e,
                0x2cbd,
            ]),
            x3: BN254_Fq::from_limbs([
                0x5f0bb44c535c1fedc914901962bf18,
                0x34e2445854761f4fa621c57f2a4400,
                0x059c,
            ]),
            y3: BN254_Fq::from_limbs([
                0xb24b26d3222a143c262f6233d8c1a5,
                0x6200400ff39a227dd25401aa463082,
                0x1330,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x039dd03416b899df911fc7befe6663,
                0xff5a41536a7a13d97ec7660bf5b7f8,
                0x2201,
            ]),
            x3: BN254_Fq::from_limbs([
                0xff3e113cc81326572d074347a6ea11,
                0xc5e35d76617226d3fa3aa80ac85eb4,
                0x1ed5,
            ]),
            y3: BN254_Fq::from_limbs([
                0xd097ecdf8f666dcc4ca68cc850f4be,
                0x0fd3cdcf0b55c048e9e7820a983fa0,
                0x1f3a,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xa17012e493f84f99c7a9abaf43f56e,
                0x1e1033a6a53600e2a7809390d8f07a,
                0x1d7f,
            ]),
            x3: BN254_Fq::from_limbs([
                0x5c214abf1c4134d66819dbbf063915,
                0x830dc09ec8677534935a4b5fb6b126,
                0x2d8a,
            ]),
            y3: BN254_Fq::from_limbs([
                0x597e557e62efdc72f29f973d8dff6c,
                0xf7f58c6bf1e9ad3b3ba6fcaa13ad42,
                0x0a60,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xfaf2ee18a921b87af5bd084f77d0cd,
                0xe06e643c6739bba9c1f8a2bb827d31,
                0x2f7e,
            ]),
            x3: BN254_Fq::from_limbs([
                0x4c62557d29d47735cf194fc6a10751,
                0xfa84e60e49ef8bdded0e60aa19d4cb,
                0x1603,
            ]),
            y3: BN254_Fq::from_limbs([
                0x2777fb97ba9c173f91f8ed21a9a06f,
                0xe399006569fad460faa24e3ee71655,
                0x1787,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x0aee59421dfdbaba9a7e66e04a3b86,
                0xe3154cd731d5dc795a299bbee5b35f,
                0x16ad,
            ]),
            x3: BN254_Fq::from_limbs([
                0x80dd53c5ec974da8a27421229d14a9,
                0xa8f672291de361889d070e375cb2bf,
                0x035a,
            ]),
            y3: BN254_Fq::from_limbs([
                0xcdb059c2c9ecb7f326d5eb230779b3,
                0x177e87cffdfccff95f21b33dc27f3f,
                0x0fc3,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x4325d3abae6a396ae456aaa13ca216,
                0xe48e31b904c56f342f02671bbe7b79,
                0x2226,
            ]),
            x3: BN254_Fq::from_limbs([
                0x1a2e568fb88dbb5897631f8d5472c8,
                0xdfb39f93644c0aa05d21d7ffb7f56f,
                0x1a77,
            ]),
            y3: BN254_Fq::from_limbs([
                0x8cba37dea1066fde3dc10f7908435e,
                0xb36c2ab2c8fec4f835f65a5eb8c99a,
                0x0b45,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xcbb8e269e5ac629ce9d2f3830a2735,
                0x1c08a3b4e2dc461600b239e79e4d69,
                0x0e77,
            ]),
            x3: BN254_Fq::from_limbs([
                0xaf3356b38e5dd6d5947bfb8f9a6114,
                0x7c988e1feae45d7700918f1eb493a9,
                0x173b,
            ]),
            y3: BN254_Fq::from_limbs([
                0x1bfdb29f2c57d3a5bc24890cf8b910,
                0xae704fd4df47448f7e42d4890961b2,
                0x2473,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x9555cd969c6fee8b7612b3c84a14e5,
                0x961f5fa1c3b93ef3befcb2a31fd679,
                0x2c06,
            ]),
            x3: BN254_Fq::from_limbs([
                0xa21bc56da194d06c40136f81f596b5,
                0xd93c950997145bc8ce16ffd2bdcc9d,
                0x26d6,
            ]),
            y3: BN254_Fq::from_limbs([
                0x40c160fc440cc7b07a5054f5787afa,
                0xf44440dd754c9058f49327b7447945,
                0x20eb,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x04be6f347916df324f63cc9a976f0d,
                0xcd6c3b2fcaa4ad3643898be7695d84,
                0x0abb,
            ]),
            x3: BN254_Fq::from_limbs([
                0x50de5e2c95b265c3642cf5089a801d,
                0x6424b1ebcda798af9904698bd7bddf,
                0x26e4,
            ]),
            y3: BN254_Fq::from_limbs([
                0x35af71bdc95f574445a338c7270a8d,
                0x5d44400f2040fbdcae02a4daad671b,
                0x0ca6,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x07ca8750c019b6f1a88e00fa408f54,
                0x2f574900b60fbff3dadd7d207f366e,
                0x1c73,
            ]),
            x3: BN254_Fq::from_limbs([
                0xe2c377ff6d08cc3f98fca46f90e1be,
                0xb45bff9d2007d323d68ecde640bf93,
                0x1347,
            ]),
            y3: BN254_Fq::from_limbs([
                0x76f11b5cc382a5133dc0c9102abe89,
                0xef7262d7a930a852f465b863b86a2c,
                0x1332,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xd6878278d72ac5fc94b66efa7ca386,
                0xd077f3f3d126f2dfc2621ed053b067,
                0x2765,
            ]),
            x3: BN254_Fq::from_limbs([
                0xa65d74ea362e325afc4f2b5166b44a,
                0xe2ce2e5909666d416914e51134e5cf,
                0x1c87,
            ]),
            y3: BN254_Fq::from_limbs([
                0xdc503a4739c126fcf9732a8e937cf3,
                0x5577d6810333600b7bac5eeb91355a,
                0x08f6,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x6900bb514ecc4631cfb0622a3320cb,
                0x64e1c1d71be6ff73e011c9f2d252cd,
                0x1819,
            ]),
            x3: BN254_Fq::from_limbs([
                0x404ddc964cf872163925ce2e70fe6f,
                0x1c7f696780c072140a24349ac4e083,
                0x0233,
            ]),
            y3: BN254_Fq::from_limbs([
                0x8a05fc36139b0b01ab105d4142bf4b,
                0x5d4dfec43eeba3adabecf8da16c413,
                0x0752,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xc5a2de7a12971ee8d40d45d3f90cd5,
                0xd6c47f0ba1dd8e574085eedaba7f35,
                0x3009,
            ]),
            x3: BN254_Fq::from_limbs([
                0xe5e720251e48366480325883551cdd,
                0xad57074e4b20b69622505a46ef55fa,
                0x27bb,
            ]),
            y3: BN254_Fq::from_limbs([
                0xf30d914bdd43909304591544713eb9,
                0xb25565335d0bbae655b967767f5921,
                0x0e79,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xe996d10c958909e399461ad62459a9,
                0xc97a76e1c65408edbe333415383f3b,
                0x1910,
            ]),
            x3: BN254_Fq::from_limbs([
                0xd96411c77ab3d4b073d37f0cba872b,
                0x8d44e1637e9c6167b96b75fe7fecf4,
                0x251c,
            ]),
            y3: BN254_Fq::from_limbs([
                0x49fe18ef51e4ebbd493651dc12acdf,
                0x401a4ec3a6cb5f6e9c692334d27660,
                0x110f,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xfd6e6494dbf16b5181bff7e80bccbd,
                0x0cc49a6b84ebe0e32ea81e1d6b612d,
                0x0378,
            ]),
            x3: BN254_Fq::from_limbs([
                0xf96258de351b54bce04498bdb390cf,
                0x4133186658ca480128c60345c6ea0a,
                0x1555,
            ]),
            y3: BN254_Fq::from_limbs([
                0xb1054d5116bdb865ad2c3eb63e0441,
                0xd23a00e9ca303a4e1349d1730c659f,
                0x09bd,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xa1225e567bfa407263e9cff887739b,
                0x41801fb04bb9de113ba782a27ec437,
                0x222c,
            ]),
            x3: BN254_Fq::from_limbs([
                0x0be02c977889034b3062c83287249c,
                0x2b3a438374ed10ec2d9ea9d2600b58,
                0x1481,
            ]),
            y3: BN254_Fq::from_limbs([
                0x1d04c2399218f435f622998fb371e6,
                0x5dbdfcc8c649d1662c2e9e10ac8413,
                0x0f08,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x164d99ae1a049821fa407d1c62e818,
                0x2d8185d974f8a24f1f8ba77f062cdc,
                0x2a31,
            ]),
            x3: BN254_Fq::from_limbs([
                0x4af92d0707d6249534484fe8e71de7,
                0xec191d4b94bfab5da7e8f815ef654f,
                0x2f7b,
            ]),
            y3: BN254_Fq::from_limbs([
                0x5a141ff4eadd00d735e95f7d1d2fb4,
                0x52fb48d9a375394569af7c20289884,
                0x2de8,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x9d1bc7bd45ffbbcda5b3c021c28184,
                0x7cf827b650b6992d30a62a463662cb,
                0x13a2,
            ]),
            x3: BN254_Fq::from_limbs([
                0xbd63482b2113389cb2b1ed9ca57d0f,
                0x4bd4afc32f9d9880292f56841329dc,
                0x0555,
            ]),
            y3: BN254_Fq::from_limbs([
                0xaa654f5c68d934eb7e6c789e6f2473,
                0x4459352fec3020ac528a0f07063a2f,
                0x05ed,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x2841c2c0f96f181730262888e0a7f7,
                0x5d342394ad2b01446a3aa09d1a9853,
                0x1167,
            ]),
            x3: BN254_Fq::from_limbs([
                0x59e7c38a3803d3736c727decca50ba,
                0x3fcc590dc5c6911f1681cfb94815c3,
                0x0f14,
            ]),
            y3: BN254_Fq::from_limbs([
                0x98dec3e6ef81fc8a2f722dc77bcfec,
                0x6390cad8388377b501e37acf2686bf,
                0x2ff3,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x799c94584dbfa146f3bcc6b12cca87,
                0xe8d10e15710d8cc69a62a00741a28a,
                0x01cd,
            ]),
            x3: BN254_Fq::from_limbs([
                0x05693b97f63ed4284aa95e544d5e86,
                0xc4941df215abdfdd023784f9fe6d5c,
                0x010b,
            ]),
            y3: BN254_Fq::from_limbs([
                0x7116c0af4d0c8c8057fb8b9a57955b,
                0x39a41e28907b687b766a4a87647ddc,
                0x1130,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x4e6623cca26609647871c3459f84fe,
                0x145fbe788b2106969f10092db00d72,
                0x2474,
            ]),
            x3: BN254_Fq::from_limbs([
                0xc6a122e7aa9eaedb1bb288af9f9b9d,
                0x31a2a03838c2d69caee7ea7a9122fc,
                0x1465,
            ]),
            y3: BN254_Fq::from_limbs([
                0x0ffc36ea1fe63b6899edf9693f5b8e,
                0xf5e0821d2cd5882bbfc5ffb7bcb6c1,
                0x2b40,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x098f7876628c56295d245a201e1ca3,
                0xf6dfa20914920dced4fff32d7bcbd0,
                0x1732,
            ]),
            x3: BN254_Fq::from_limbs([
                0xb3f5ba2a7fd7d09cad36c7ca75ca99,
                0x9e6d9cd779256edce423e637c35359,
                0x26ab,
            ]),
            y3: BN254_Fq::from_limbs([
                0x4612b18f033cfd90f699c957d1ce14,
                0xd9c1a342de502c38095b4e83c01c64,
                0x15be,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x374fccd6a8d52a233acb1cee467c45,
                0x7309030c39b28c9d9d4224bec8654a,
                0x0f65,
            ]),
            x3: BN254_Fq::from_limbs([
                0x5a39f62ab88a66f72175e1b8aedd40,
                0xb4e3e6e808238dfc9c26513aacf5e8,
                0x1d53,
            ]),
            y3: BN254_Fq::from_limbs([
                0xfabbca294309c2429ca31cd2060a0e,
                0xf626f820ba2ac815099ef8a64c9f27,
                0x2dfd,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x521d3bfb636e9c1a21bc2a2e7f9c2c,
                0x616a037c73f5aa3394a8311ab6ec9d,
                0x2081,
            ]),
            x3: BN254_Fq::from_limbs([
                0x329b4b1c3e5912c0c109af92d8974f,
                0x8fba0e122b4a23255ca126290190bc,
                0x0f2c,
            ]),
            y3: BN254_Fq::from_limbs([
                0x3d2f1b7a2bcc5571cc752abda76456,
                0xda876730a4b325e5351aadd930fd84,
                0xd9,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xb8d8b4335c9d21262345fcf31b61f0,
                0x05d4a3b1a06f6dcbb898d6f747e94c,
                0x2a66,
            ]),
            x3: BN254_Fq::from_limbs([
                0x7a3bbfe99bc5a2c2f017e4490567ad,
                0xcd1e76dfca3f1667f731979439953f,
                0x2d0c,
            ]),
            y3: BN254_Fq::from_limbs([
                0xa02c7cbfdb34796353037d63ecacae,
                0xa6082cf1adc267f1c902f3563d0d59,
                0x21ce,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x38d9ae6dee6b193a765dd586cc3d26,
                0x7d652ef8cc6bb2aac90efcd9763574,
                0x18d6,
            ]),
            x3: BN254_Fq::from_limbs([
                0x2d5e9d413aa920f93bac78c9a632b0,
                0x556230accb23ac7cd9f95716b20ae9,
                0x0f4c,
            ]),
            y3: BN254_Fq::from_limbs([
                0xa4ff247baa7a96c18f88575e601445,
                0xb8c4e70a89c78aaecf7c5f715b528c,
                0x21ec,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x9f7d4423825356d5cd89c01cc28d1a,
                0xf537a82df87df94a76c99587f4e0b8,
                0x2424,
            ]),
            x3: BN254_Fq::from_limbs([
                0x4f74724204065fb3d34466fe3673db,
                0x2a1fed1bcd5fdc578e0db50c215c56,
                0x0928,
            ]),
            y3: BN254_Fq::from_limbs([
                0x98662dda5edca6d1b2b56f41cc825f,
                0xae3b6197f6eb7a31cbe0e55e0587bc,
                0x1563,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xc85909e12b9d67be28c24f9dae7749,
                0x07565609bfef95ac0efff1ace769f4,
                0x289b,
            ]),
            x3: BN254_Fq::from_limbs([
                0x4037863bf05ae887f5d8294259afdd,
                0xb1a6be61a23471516d7e78a22d7134,
                0x29ae,
            ]),
            y3: BN254_Fq::from_limbs([
                0x427ae6e233da0c1d2334a943d0b6ce,
                0x0f375175bd6a24c0e2c76b420c4b90,
                0x0b98,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xc842a138ce511473cadabe9593ba3a,
                0x0fe962b80cdbf4076cf696e9adb2f9,
                0x1af5,
            ]),
            x3: BN254_Fq::from_limbs([
                0x4eb81603b39ae49faf4a0207e9cfe6,
                0xca9c670b85f7810db209d33255a141,
                0x1794,
            ]),
            y3: BN254_Fq::from_limbs([
                0xb8dfeb693a2779f583f4c8d98d6906,
                0xa50e13f4457ea653cb66d600477b15,
                0x60,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x6a5434d0bc30e34b1e6d9a03813576,
                0x6e50ebf01cc4d554e662d1189cf5e1,
                0x01f0,
            ]),
            x3: BN254_Fq::from_limbs([
                0xbcf8d983668aabd082f72279d4d467,
                0xf0614b1cd8af685b6790819c260a66,
                0x222f,
            ]),
            y3: BN254_Fq::from_limbs([
                0x2299c71767bc3378ccaa9f7239af6e,
                0xec7bb7ec87d7efb068a44aa111fd10,
                0x03ed,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xaab2f1d9322ec05561bd466bba6062,
                0xf01a1036db0bcc8e7c66c432689810,
                0x1aa4,
            ]),
            x3: BN254_Fq::from_limbs([
                0x132547e4566a77aa0f3549f48ca867,
                0x534a340650759b51beab36eb986fb6,
                0x2af2,
            ]),
            y3: BN254_Fq::from_limbs([
                0x5096cc6e4f0858a868585b0bf924af,
                0x79310f068f459b6e7dd49479b4026e,
                0x19ee,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xed2577babf3a6ed939346839a2a4,
                0xd5079ccb64a7465ff9c22e59e2312d,
                0x0535,
            ]),
            x3: BN254_Fq::from_limbs([
                0x13c6f72663763dd1bd1076b10eef10,
                0xb151377ca6c6c620db3bc6e1d5dc54,
                0x15d2,
            ]),
            y3: BN254_Fq::from_limbs([
                0xb10e6c3d808f5d961db2642503dcba,
                0x41a44c69e3cbe3a8eb248ab367b5c9,
                0x215c,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x285add24a46d6fae3682f24bc881eb,
                0x53c8603c7405b9975f4c5386282f02,
                0x26bd,
            ]),
            x3: BN254_Fq::from_limbs([
                0xcf9e282730cb96810abce7811708fd,
                0x5444d92162d7f083a9abf106fda207,
                0x3037,
            ]),
            y3: BN254_Fq::from_limbs([
                0xd8258d647f4087dcc237f16ea0fa9d,
                0x4036b1ac33a59c3c1bccd082c596fb,
                0x0470,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x3fd39a4ee7c2c570e020a9d03a9990,
                0x904e4b57ee668ccbc2863ca96c8a09,
                0x0ef7,
            ]),
            x3: BN254_Fq::from_limbs([
                0x50e882fa31130cd556d86a28772606,
                0xe08e9531b34eabe79ad69bc2ed99ff,
                0x0b89,
            ]),
            y3: BN254_Fq::from_limbs([
                0xd60f911953ccbf92fcc76dc40bc43c,
                0x9753f97496cef0f659f57cc5e2a862,
                0x0b2a,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x41416cae43f267fd3ebd5caee402a2,
                0x1241f47fee73d033ac4bbbbe6bf851,
                0x2873,
            ]),
            x3: BN254_Fq::from_limbs([
                0xcf8445ac1b7555a415d1f91aa60250,
                0x6f1fc4940caf22e61b7d54576c4d04,
                0x1b04,
            ]),
            y3: BN254_Fq::from_limbs([
                0x4616b1cb9ecc566860a80b9f0f260a,
                0x18d8b68f79d3d6af4890beca9cbd6e,
                0x1c80,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xbc7e8c4cb10c9db407d49a355063e2,
                0xe7e2e79709967b52c990fa92d9e2db,
                0x1aa9,
            ]),
            x3: BN254_Fq::from_limbs([
                0xc2a4ce15a2ee805a9998fe7ea891bc,
                0x0777e9bbde0824e944727836f33675,
                0x1f65,
            ]),
            y3: BN254_Fq::from_limbs([
                0x7cae919a5fb9b13e0751ea417d805b,
                0x4bcf73da2d79d090e5135dc2e1bb90,
                0x0ef8,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x600bfd1385d7b8e29e94628ed2da65,
                0x9e932f5c5678910c4dd29b9640a6a2,
                0x23ef,
            ]),
            x3: BN254_Fq::from_limbs([
                0x9bcfdcee2c5aa128795809c27f551a,
                0x3012f01316ec2b2b3f8162dc5d4089,
                0x01d7,
            ]),
            y3: BN254_Fq::from_limbs([
                0x04bf1e0ad5a22b9c382e7822772aa3,
                0x817c53b31c17fbcf1ff9e491a1bab4,
                0x11ec,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xd3c0192d37eb8206b57ed113f9977e,
                0x67b85361d459dfc52b2dd9b853767f,
                0x2670,
            ]),
            x3: BN254_Fq::from_limbs([
                0x31bcd7cacdb1dc5459f6d88b55300e,
                0x6bd80f88049739231dc33602922edc,
                0x4c,
            ]),
            y3: BN254_Fq::from_limbs([
                0x034481fab1edd3ff1dc96f1b7b0e12,
                0x28f63e0b8fcfb63ccf5d37cc833ace,
                0x0683,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x0bbb457b4dfc506f7f7bbdbace5341,
                0x4a1bd06dd28faf74ae43122a5942fa,
                0x305d,
            ]),
            x3: BN254_Fq::from_limbs([
                0x4bb2811b657434d5cd2a79f50cc9d0,
                0xe39a8a1895574f572a61014c9dc607,
                0x14fd,
            ]),
            y3: BN254_Fq::from_limbs([
                0x182bdaf77640c2f4b795932a47c97e,
                0x060475d8e32a6626e579185096be05,
                0x24af,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x60f9d18d4b6e760daa1b98da2abc3f,
                0xd53537eebe5fcfcff97da52a6d597a,
                0x0e36,
            ]),
            x3: BN254_Fq::from_limbs([
                0xc940ae730bb63be4b2622d415c1903,
                0x639a2d7cd9d2bc74fae778af4b8c1b,
                0x298e,
            ]),
            y3: BN254_Fq::from_limbs([
                0x62d7b450c379db5a725d9724194940,
                0x75cdf61c87bed9864af438a2585bda,
                0x087a,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x641908da1c21e841383187c43520e5,
                0x512e29c78d3dae3683a4879c1df8ba,
                0x0b9e,
            ]),
            x3: BN254_Fq::from_limbs([
                0x897e9c0da4b90bfc0895a48b3e38ed,
                0x5585a39fe035e63a182c69040d23a5,
                0x2f78,
            ]),
            y3: BN254_Fq::from_limbs([
                0xea8ebb0fc7d27ae7b93e8720de63ca,
                0xd6d081a080aa7836028a32f1f6470e,
                0x14f6,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x5e3b34a76ee9e3aa9d2e17bc1f07d1,
                0xc7ea619a4e61abb729844548e123b9,
                0x2bfa,
            ]),
            x3: BN254_Fq::from_limbs([
                0x39765c5a1a941f721ce0e00df0a6f2,
                0x1eaeb8e110f5d97d1ff482f4032686,
                0x0dd7,
            ]),
            y3: BN254_Fq::from_limbs([
                0x1f5e4642fd4acfbb96f56bb21fcb36,
                0x6fe92a19299220db2a67506e95b983,
                0x2fe1,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x32f114069e09fa9210d35e4dc8cb72,
                0x627008192f41e6dbbed99ba181a9ef,
                0x179f,
            ]),
            x3: BN254_Fq::from_limbs([
                0x8147ed30c3ef3f41b365385fef1c3b,
                0xcfa4b4c2c4202f497cc9eece354246,
                0x074b,
            ]),
            y3: BN254_Fq::from_limbs([
                0xddd957746876ad85ef0df95fa5c52b,
                0x65a9261270f0ea10b789783d2b6f27,
                0x0a70,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x965a178a78fd0de0ffc5ec9fa398bc,
                0xea1e7a22cb4ae6c8154e8702278463,
                0x2c16,
            ]),
            x3: BN254_Fq::from_limbs([
                0x83dadb035e872ff184696f08352f06,
                0x466c33421e8fb6b95f89661f851937,
                0x0b92,
            ]),
            y3: BN254_Fq::from_limbs([
                0xd62dee538584a8e195ba63226578e5,
                0xc6d30e287fcdd043848f5e228fbfdf,
                0x19bc,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xe6417aaf51ce863f0d75ea39b398d6,
                0x293a72cc3a6ecf13e72aae6d787f61,
                0x0cde,
            ]),
            x3: BN254_Fq::from_limbs([
                0xc4145c6bf8ee5533f0b009dab3b0a7,
                0x47292fa92e41e6e04417cffd3efa32,
                0x02ee,
            ]),
            y3: BN254_Fq::from_limbs([
                0x73f382943b59886d8ebdb36ca4775c,
                0xc712ec171a477c28b9756e9951c52b,
                0x167f,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x4fd6ee05c4068a164fb6626aac7186,
                0xfd66a3f986015cadade4c5c08ae1c8,
                0x08ab,
            ]),
            x3: BN254_Fq::from_limbs([
                0xdd744611d0d180358e86e422856883,
                0xb9dd41bde2179955601d0ce2d876fb,
                0x2047,
            ]),
            y3: BN254_Fq::from_limbs([
                0xbf6220d08930f776e46edcbd2e4433,
                0x7070487ad0905fb3939c697f137281,
                0x2641,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x307cd427545729f5f5d26760565a5b,
                0xcaae61f5a65714d6c28ae7b5e25030,
                0x163b,
            ]),
            x3: BN254_Fq::from_limbs([
                0x2bc1860c3c39b1dca9c3509170b9f7,
                0xd0dd722699ccb33bcfc44afc2db2e6,
                0x0d96,
            ]),
            y3: BN254_Fq::from_limbs([
                0xf98d2315ca22f13ee21fdf16643be3,
                0x66360e98e1538b90c483c65fc656fc,
                0x0fec,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xb9c3171081f5f6f2b1395cfdb38dcf,
                0xd6c5972505757428c80dd233c29755,
                0x200a,
            ]),
            x3: BN254_Fq::from_limbs([
                0x7bcab13e21fe8a9c93a3663372877b,
                0xc3d498672d36f7ffa6a7a19639fdc5,
                0x114a,
            ]),
            y3: BN254_Fq::from_limbs([
                0x0f3a52c52097798f55d05c9cd63b88,
                0x93290ddf7da4ec9382a409b1419afa,
                0x29c8,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x86d32b3aff96aa7679e3468f96d2a9,
                0x02627bf7486f9c9274f5849f296e0b,
                0x0a2d,
            ]),
            x3: BN254_Fq::from_limbs([
                0x0bc243297f1622c516655cba11ca01,
                0x2a7743d7c8dd6a5316fc0242396ac8,
                0x0128,
            ]),
            y3: BN254_Fq::from_limbs([
                0xf6396feb6160d78e08a2ce31c2e6b1,
                0x44bd60a9edad01cb264cc90ef527eb,
                0x293c,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x5e19d7330a7cee78def1dece909aa3,
                0x9ab638c5f5c229099a3253e6f7c75d,
                0x193b,
            ]),
            x3: BN254_Fq::from_limbs([
                0xeba7a0479c8ed66ef6adf461cba52b,
                0x99b15105a509befd91cb0d067a3954,
                0x07cf,
            ]),
            y3: BN254_Fq::from_limbs([
                0x647e75eb293b6f6034181429c74cdf,
                0x1019dddd15043046e383d4b3534006,
                0x2455,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x617db5198e21e4712716ae1a39ccb5,
                0x3e503563bd371865bc3593cdf1e464,
                0x0ba3,
            ]),
            x3: BN254_Fq::from_limbs([
                0x5aa42e3d39c27010a3ca7bcafe4b0d,
                0x6d241274c3f5a65a9e78f97c16e1ac,
                0x1b5c,
            ]),
            y3: BN254_Fq::from_limbs([
                0xd05d3ea46e8f737e8ac2bc97eb8c8d,
                0xf78987453b5109956e915aebd1472d,
                0x2441,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x7bb5092f3b2aaf9779a5599b699816,
                0x44f9cb4441846aa04e69372ef427b8,
                0x0662,
            ]),
            x3: BN254_Fq::from_limbs([
                0xbb49656144c44688ca05de9b665558,
                0xb10e1b0b90570c6993c0b6239a29a5,
                0x2178,
            ]),
            y3: BN254_Fq::from_limbs([
                0x74fd26e40af842ccf28fc16cd6022f,
                0x5a52ae76d8c11b0a4975fa45d402bd,
                0x2d7d,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xd5e232672067353c85cdc95729c4f9,
                0x1b21b66f0d34f2a7bd6c1987f96646,
                0x26ca,
            ]),
            x3: BN254_Fq::from_limbs([
                0xa86357aeb680f6a985ef2044b7f113,
                0x27311327e8c8be2393ed9beb1fd363,
                0x0cdc,
            ]),
            y3: BN254_Fq::from_limbs([
                0x627c615bc31456e6dccd2072c06813,
                0x94b5ad82bb79670433cc19bbc610af,
                0x2305,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x1b3eaf00c24db1b9d9ef06463862b8,
                0x31dd07b19985cd7aae40be611d5dc9,
                0x2017,
            ]),
            x3: BN254_Fq::from_limbs([
                0x8b2009cfa93377e769342786cba85f,
                0x43d0e39a0f249e3bfba21bd2a97cf0,
                0x0636,
            ]),
            y3: BN254_Fq::from_limbs([
                0x1caa5a60fca050bc0bf4b2ecde3f25,
                0xea4cb0b6a6c3cf719af98396144b94,
                0x14a8,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x03cdc9d1f35de23db436dda53660a8,
                0xb85c6283fd6a75e4ecadbe71d32e79,
                0x2d35,
            ]),
            x3: BN254_Fq::from_limbs([
                0x8685f6d3eb4bac51c85ef9e44ac24c,
                0xaa4d14bf7d5c932a980d2d8376315e,
                0x08d6,
            ]),
            y3: BN254_Fq::from_limbs([
                0x6407acc412d0e175d1aedb611fc5d1,
                0x8ac205f2f82247fb3d723bb2a87f69,
                0x14e2,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x92b2122c414f46ccabdd566dabbfa1,
                0x466a8e18e95e31af8c0aabcb80f98e,
                0x1af1,
            ]),
            x3: BN254_Fq::from_limbs([
                0xc5d01a52e26cd02f6f765bf4fcf5bd,
                0xa55f32595cc3d88d62f5b48cc210e1,
                0x1305,
            ]),
            y3: BN254_Fq::from_limbs([
                0x3feb59d7d19acc12d6eabf55fcc461,
                0xc782cc5a396b2dc041e03616550cb2,
                0x2125,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xef31132943e674a3036ea4d3c57d1d,
                0x7780f6c8bf420a98ee57b9dc93c154,
                0x2828,
            ]),
            x3: BN254_Fq::from_limbs([
                0x3f27ca25de18cadde84f327478c11a,
                0xcf6fff169763d2eee9abf8d0f8a5ae,
                0x53,
            ]),
            y3: BN254_Fq::from_limbs([
                0x1670d46ff7f7a936efac32b00c090e,
                0xab7a814b7b0bb00a03a66bfcbd086e,
                0x2081,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xd5bc659a4736f8e396057ba2026791,
                0xb7d22ae8a70fdb2073db93c384801d,
                0x25c4,
            ]),
            x3: BN254_Fq::from_limbs([
                0x787e7fa8a8670d3d9255f30091d51f,
                0xce9a7e4beacc3886eea2b66cd9e1b3,
                0x2baa,
            ]),
            y3: BN254_Fq::from_limbs([
                0xec31854b8058ec8fcb1175ad7aad38,
                0x4a5e48ec772b907ea369db303ebf92,
                0x131d,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x70e40856b69c4c4ed8f3e77f211a68,
                0x7cddd16e98d2c5440334f3836f18,
                0x0323,
            ]),
            x3: BN254_Fq::from_limbs([
                0x747cf09b5e062df6db308c9bc1f9eb,
                0x2db0609612b99c23b2d332db184dc1,
                0x096f,
            ]),
            y3: BN254_Fq::from_limbs([
                0x414ec74c8ea8374bba342544065cc5,
                0x59613c0b23225a3e1d77c0d36e24ae,
                0x1999,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x8380398d3ae0f2a060ff2ae5239c9c,
                0x1551c81affd474b7eadf8c21b97b77,
                0x1587,
            ]),
            x3: BN254_Fq::from_limbs([
                0xa4b858d86340fbd6af4e8febb74859,
                0x5e1786033e8663514dd51728f0c915,
                0x043b,
            ]),
            y3: BN254_Fq::from_limbs([
                0x1caf5700ff46de480f8f78c196d39c,
                0xd41908dc44fe995187b3c4429c3cff,
                0x11f3,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x81991892a90604e6bda13d2194ae64,
                0x3f7337673d4e80ac7129b7f31fcb7a,
                0x1db2,
            ]),
            x3: BN254_Fq::from_limbs([
                0x8626de0d45e086d967b3d81d4e0c6a,
                0xbae350744b55bc7a50295b1495e7b8,
                0x1878,
            ]),
            y3: BN254_Fq::from_limbs([
                0xa6d60e7c770c4ecd2a9ac1ad719a9e,
                0xe2549c1a37a69805d1bce7ba5981ae,
                0x20ba,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xc61b22d0f30fc3d2b0bf19d39501ae,
                0xe0806549ad1c9cac10d5e0b6a4652c,
                0x248b,
            ]),
            x3: BN254_Fq::from_limbs([
                0xda11681e24076776bb0c248242cafe,
                0xf7a3da67fe09a2fb30a95579341356,
                0x0d9a,
            ]),
            y3: BN254_Fq::from_limbs([
                0xbb5b244625c8066195ee1a283ecfe8,
                0x76465c5297530b6b6adca9e328e7e6,
                0x1df2,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xe02d49263209e053b37550b089e7ba,
                0x842060aa1db5d1725f6ea3e6104daf,
                0x06db,
            ]),
            x3: BN254_Fq::from_limbs([
                0x14ab23543e5fe8f1463be1dd82e12b,
                0xc7aeb6733d1eb15e187e2e97dda0fa,
                0x18d2,
            ]),
            y3: BN254_Fq::from_limbs([
                0xce53598ddd44d3408ae56d5d7c7c52,
                0x7d135fb3bb32e4c56a9197b2170b7a,
                0x1ab6,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x7bdb9c14f49a4544d443495eed575d,
                0xe037d449b8cca7cff11c71b9ebd925,
                0x2b9d,
            ]),
            x3: BN254_Fq::from_limbs([
                0xe2835f89dd93046f123d55fc4b7833,
                0x5b2ebf961efd0ed70d77079a7c8072,
                0x10ca,
            ]),
            y3: BN254_Fq::from_limbs([
                0xc070b8c9377ce6eea76dc63fcb4ca8,
                0x1c8133d7987ba374bc0d780965b76a,
                0x06fc,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x6e9fa02276da8bc4992b3521a96682,
                0x1d971245c530f5f420bcab4fe83f81,
                0x0ca9,
            ]),
            x3: BN254_Fq::from_limbs([
                0xcbe4ada2030d11f796a6f470472960,
                0x30a1ed94e7e66aa998c93141daa814,
                0x0917,
            ]),
            y3: BN254_Fq::from_limbs([
                0x5317099060f97413635e2de3732a24,
                0x922a503733b8374e6d1dfb4fd5cbbd,
                0x0aa9,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x7ea04ada733f452c693dbea090f115,
                0x7304c7740bd3fdd65af598b3405a9e,
                0x0d94,
            ]),
            x3: BN254_Fq::from_limbs([
                0xa9a8363f18c376985acc79ca848769,
                0xa36fd7539b7a420a7e8c9cbf6eca5b,
                0x8d,
            ]),
            y3: BN254_Fq::from_limbs([
                0x7ffb293fbbc1143045cce54e908a0f,
                0xc2c85df2e5ad0ae61c6eec8e8bb3b2,
                0x013f,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x44c44bed7722da6cf9e8179f564a16,
                0xf792b05165a03686bf0e792df44d59,
                0x03db,
            ]),
            x3: BN254_Fq::from_limbs([
                0x7bdd274996fa6f0672aed6623d205c,
                0xda7af1a5e5e2e7fdd939ef7538aa1e,
                0x0943,
            ]),
            y3: BN254_Fq::from_limbs([
                0x6934904f6645a101ecc0fade32c911,
                0xc8fdeafed61d305a19c973c0905061,
                0x22ab,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xe6b10203150b1abafdb9ff167c737a,
                0x6d38faefc8c83909346469a7927823,
                0x0e23,
            ]),
            x3: BN254_Fq::from_limbs([
                0x74f8ed794466fd7840389b25044cb8,
                0x9beef9e65940210fe5e649c68f9e98,
                0x05db,
            ]),
            y3: BN254_Fq::from_limbs([
                0x6e2c3394b2738a3ce6c1d37a6320b9,
                0x86d7450cb448c7d411c158be665453,
                0x2dfa,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x4f1c77070ccb1058e44bdcccd2f77d,
                0x48916fdfb1baaecaaacffa6355a55f,
                0x051f,
            ]),
            x3: BN254_Fq::from_limbs([
                0xd9f51d6478bb978cc57f95af93cb26,
                0x65548dc2326b06378f535f8214ffef,
                0x093b,
            ]),
            y3: BN254_Fq::from_limbs([
                0x828a00bc7bf3be9914d874add13553,
                0xabf949f1f1683d1a46a3df0f9e5dfc,
                0x03ef,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x7f602047769679a102cd10e2bea79f,
                0x38525c06eee9b784db78842699f7fc,
                0x0bc6,
            ]),
            x3: BN254_Fq::from_limbs([
                0xe818e91987452d2fbf2233bfa543a0,
                0x396f19ecab6c4dbdfb2b160ceab589,
                0x250d,
            ]),
            y3: BN254_Fq::from_limbs([
                0xd37db7af4c78e6060b7a8f9eb91383,
                0x0f1282590b6188b51be9bf3eef0fec,
                0x2ff0,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x86f2fbc3165b21b0612f361cd1c797,
                0x5ae1e553baa733df4f3e7e06ae22a1,
                0x0224,
            ]),
            x3: BN254_Fq::from_limbs([
                0x6d30d2779116d8e827e7d820ca1137,
                0xdff1bfef1448455e41a4c3d87b0db0,
                0x079e,
            ]),
            y3: BN254_Fq::from_limbs([
                0x80beaf144d94bba36c4165b7ffbc42,
                0x481bcc47fb337b26e9a282d393e72d,
                0x028b,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xc4ded9322be2760ef8854cc075192e,
                0x2475f9d186f58a530861733b271ff0,
                0x0131,
            ]),
            x3: BN254_Fq::from_limbs([
                0x80f0b25d0e883cb42cd298a42f2618,
                0x52e8300ff9aaef77861257e8cbe3d6,
                0x44,
            ]),
            y3: BN254_Fq::from_limbs([
                0x7dc48e3866caccc3c21a1672e64c40,
                0x25724bc3259ac0fe4779ff3355688c,
                0x22d7,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xa208ec2804574d3b06c6668eabda65,
                0xa35ac47dadd686eebda3d03a472ef1,
                0x28ea,
            ]),
            x3: BN254_Fq::from_limbs([
                0xe5cb0ce47715b427040a40da9cc876,
                0x7292f61156bfeab890160ba283b003,
                0x1f65,
            ]),
            y3: BN254_Fq::from_limbs([
                0x7c53b10c6bac43c79e69a8a136d988,
                0xab887bc06b92b90e3466be0d9aa8a7,
                0x050e,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x86f4cadad759240d0e78a9c32170ae,
                0x3cb1062848d197814d678a6a891690,
                0x05b1,
            ]),
            x3: BN254_Fq::from_limbs([
                0x320aef0839a46c7174c2e744df329f,
                0x31230faa648ba204633975dbda91e5,
                0x17de,
            ]),
            y3: BN254_Fq::from_limbs([
                0x2ebb87becae6ec31204eed549357e4,
                0x9b22366d3d617d1a711344be70ca97,
                0x0cc0,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x13ffc1146e353de7df784bdc8901e5,
                0x21e11b616ef71929b2749af4857915,
                0x1932,
            ]),
            x3: BN254_Fq::from_limbs([
                0x1dee6a4a7ad9b3d4d592afad714c1d,
                0x2baa923489d650ae7561cc51fe8136,
                0x1eef,
            ]),
            y3: BN254_Fq::from_limbs([
                0x8fef402263f5a64cdf2206f8ead544,
                0x7554a9890b5fd4f6962d25629ba73c,
                0x1835,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x26bed7dfd4116d25b4f0c23ccb845f,
                0x2ac7fb954bb7fb533674eb0eebb375,
                0x23fb,
            ]),
            x3: BN254_Fq::from_limbs([
                0x0583ba0fab1d5b5534d1cc3b86343a,
                0x5cd4a00cf76807790224f5700ac12f,
                0x043e,
            ]),
            y3: BN254_Fq::from_limbs([
                0x352b1aca15957161786164396989e7,
                0x87521dcd8220ff7762b9f883efbdb4,
                0x12de,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x30c0a3d5e8591afc460a12f7248e8f,
                0x73ad5454d1bc9099dac5575b555d8a,
                0x18c9,
            ]),
            x3: BN254_Fq::from_limbs([
                0xec0896d567f6a713645e9c6a97b519,
                0x75faa372c66192994807d268783fc4,
                0x0710,
            ]),
            y3: BN254_Fq::from_limbs([
                0x586666551714fa025d6683efe9028e,
                0xe85f2286a9a6feab9aaa4736ca22b3,
                0x10f7,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xea88350ee817752edc941ce5ccd487,
                0x9791c2b51b3b8b84a78d41d7d8054a,
                0x2525,
            ]),
            x3: BN254_Fq::from_limbs([
                0x984ba4fb5e5c1677a881543a1d233d,
                0x576d9ddcf9165314f3c09b4ac4d2e1,
                0x082c,
            ]),
            y3: BN254_Fq::from_limbs([
                0x8ebef3a199fda005bb3310e3817521,
                0xd7acfed086da949793095f3697f05b,
                0x1649,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x09148fa0092b9e319bdd8c784b5d68,
                0x62618a991c827f27b2efaa9c035849,
                0x23bd,
            ]),
            x3: BN254_Fq::from_limbs([
                0xe8e796fece752eb2fff517c431d367,
                0xb4566843bfb47a2377abb454294201,
                0x068d,
            ]),
            y3: BN254_Fq::from_limbs([
                0x8d10a258a1ef55bee846277f6ff672,
                0x28f30bae30d998e498f3c279762f34,
                0x1b07,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x9acb29c2a2d15ba01bebbd0ae75bc7,
                0x0440b8ae6c22e0df242b33f09e0c0b,
                0x1b24,
            ]),
            x3: BN254_Fq::from_limbs([
                0xf5a2908603db29cfa00b7878b2dfe9,
                0xe5dceeb1faded15ce8af21d4693f66,
                0x0c1d,
            ]),
            y3: BN254_Fq::from_limbs([
                0x903cd2c0e377cbd9c66f0b7ebacd14,
                0xf9cef43926687fe9d84bfbf3c47c3c,
                0x2184,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x5d5c094e11d40bb7b19013dc628bef,
                0xe82aa8b187e46d00b88de45449b751,
                0x0603,
            ]),
            x3: BN254_Fq::from_limbs([
                0x5a6b94a3871b926021c9aa713ce01f,
                0xf80d1df357c966f8c2dbea6d0e57b8,
                0x0204,
            ]),
            y3: BN254_Fq::from_limbs([
                0x3a3396aa0942ca89d9871859bb3355,
                0x98961d7e57f18fa632e42df52a44cb,
                0x01fa,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xb475f68526ce6ec162c3d7781ffd3d,
                0x41c5d441ddb87eb6d4058fa396ab7f,
                0x2e4a,
            ]),
            x3: BN254_Fq::from_limbs([
                0x9b8c24f98ca581c72fb17ec8058c4e,
                0x45f4073a80a63b46fd046882e05a4c,
                0x2a4a,
            ]),
            y3: BN254_Fq::from_limbs([
                0x048853f33bb1828e6c8af1dd544337,
                0xcc43c16d27f222403f57059b609e63,
                0x0592,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x2af3ddd453b15aeedbe8284009a3ef,
                0x7967049249133937b92bb369390a8d,
                0x19b0,
            ]),
            x3: BN254_Fq::from_limbs([
                0x8ffd9fe2382df5876c31bb07cae6ce,
                0x4edfc9a9d10214bd3c1989171870dc,
                0x179c,
            ]),
            y3: BN254_Fq::from_limbs([
                0xe885d554e1eb63dce7848793cdb084,
                0xa3abe1c994b6194a3b44dabe4fb2be,
                0x1117,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xf54deb34bdeeace7ab7ab6ffeb7df9,
                0xd7381ae27ae2e8fbed8344ad0e214d,
                0x264e,
            ]),
            x3: BN254_Fq::from_limbs([
                0x36b815ef19dd66b4d8703a9f3cb0ee,
                0x510091c9eff0449b51bfa1690fd994,
                0x0dac,
            ]),
            y3: BN254_Fq::from_limbs([
                0xc7b64768c8dabea79f10b428a3d1cc,
                0x06dcf986fa889288ef7ca0e0310df1,
                0x2e62,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xe78e93c10bb1d61a53fb51642f1981,
                0x86159d2d0f8b71f7e22ffc8db736be,
                0x2c02,
            ]),
            x3: BN254_Fq::from_limbs([
                0xba8393aaa7dbd19e861ff9b8fdcc28,
                0x319d3d3d7ee94034aa7804d92f548d,
                0x2a25,
            ]),
            y3: BN254_Fq::from_limbs([
                0xf994d94dae08b09e82c54187f4dd56,
                0x7f114c45ea1944e9457cb12eaa8553,
                0x2d07,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x9ee6cdc5688a3981429035e15ccdf6,
                0x65bc3dc94e51673322f829aef775c7,
                0x16af,
            ]),
            x3: BN254_Fq::from_limbs([
                0x9edf14e57645a368e6e2a4a9e156a0,
                0xa40ab54e1c1c5ff54e0705c7a502b3,
                0x3031,
            ]),
            y3: BN254_Fq::from_limbs([
                0xdb9f0226f7021f521e640d11130c37,
                0x6269b11249960aa68a03ba74ce6a33,
                0x1a9f,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x49ab4af37c6d81aff922230d08c6b0,
                0x133819d4a478e73d0292125632202e,
                0x06ff,
            ]),
            x3: BN254_Fq::from_limbs([
                0x5065cd0bd72980d8cf68e537773c98,
                0xb4a93be9782c6a56ec4a695a6016bf,
                0x04fe,
            ]),
            y3: BN254_Fq::from_limbs([
                0xc0376614e65c806e2d76a26d38e74b,
                0xa119950c467984d1a77c3de328f1f3,
                0x154e,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x97cb47d74b0ac7eef4e0c0aa32454e,
                0x56f5a13c699d9902ce2dd1c544cb66,
                0x1131,
            ]),
            x3: BN254_Fq::from_limbs([
                0x81eb7aab4b4c7084d059a045c21118,
                0xe0ca099b8cb2f352082fbc170f77c0,
                0x2c51,
            ]),
            y3: BN254_Fq::from_limbs([
                0xa4cc4a61891898f2923b39fd1019bf,
                0xd2833a6b21a8ef46667f90f4728718,
                0x16ef,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xb827ed45044151b737782e30ef89a2,
                0x6b20232a52921badec5269527fdc45,
                0x2a1a,
            ]),
            x3: BN254_Fq::from_limbs([
                0x227fd7d91820f0d53aab18444cea3a,
                0xa9f6db523a4ce7ebad72013cc264fe,
                0x1bd9,
            ]),
            y3: BN254_Fq::from_limbs([
                0x7577972b6a9040b2594fc7fc36d222,
                0xd9f610218b79315428399d79bb0bcd,
                0x04b6,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xbf90a1eb76665e6d5b4499e085542a,
                0x3b840d7bac97baf752e2628f6322d3,
                0x08f8,
            ]),
            x3: BN254_Fq::from_limbs([
                0x75243e67538864e43e3371b7e86fd3,
                0x0453074954089916d6e7d665f75928,
                0x2ac4,
            ]),
            y3: BN254_Fq::from_limbs([
                0xfa5ede0b6ed22afc3f61387265cd76,
                0xdabd7fc60af17d5a32454247ca3b4b,
                0x2c0b,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xd25dd8b7d50eb7f310bf8d2c2c51a3,
                0xc9adfb6bd4723855bd69d38bace4ac,
                0x0b6c,
            ]),
            x3: BN254_Fq::from_limbs([
                0x08a8e7192a3801474169a651906734,
                0xea0c3bc605be57942f0a60e0ea2aab,
                0x28c5,
            ]),
            y3: BN254_Fq::from_limbs([
                0x088c7683a72565f40e018d9cf931c2,
                0x92d5c62d8ef775b7b7e481651311e2,
                0x0206,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x83952290675c17dcd8cd068d3139c9,
                0xe7c286d74aec257385ee7b6888ff39,
                0x04e1,
            ]),
            x3: BN254_Fq::from_limbs([
                0x58461c3eaebc8b45ba3ca109343c45,
                0x3b1140c6d3b6a8ae3a8a4c549e24be,
                0x1e76,
            ]),
            y3: BN254_Fq::from_limbs([
                0xea5e9774e96ed4c6692c99d06f61d8,
                0x938802a9ba7126b346895efa92365a,
                0x1a34,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xbacf7554aa33385267a1cbb7bd396d,
                0xc642dcfeb248f842c3f453c0243185,
                0x0c20,
            ]),
            x3: BN254_Fq::from_limbs([
                0x8e567e5c06aa8c7df1bf72f20896c2,
                0xfb947ced0d1194ebde755f8946e76a,
                0x1b6f,
            ]),
            y3: BN254_Fq::from_limbs([
                0x58973c850ad71790127f3c4cca152e,
                0xfe8890c7105170a514d48c4eda5dd6,
                0x0afa,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x07e8a5f623967ff48c30e2ea7a2add,
                0xe657fd056d06ccc9255c9bd9c84893,
                0x126c,
            ]),
            x3: BN254_Fq::from_limbs([
                0xc53c6309b3591365c6571a3d4ec49d,
                0x365cb30f8268807da72d7fbd70ef70,
                0x0c27,
            ]),
            y3: BN254_Fq::from_limbs([
                0x5b3b90e444d863a2544d281ca89216,
                0x97a9a013b7575353a87a64ede5df9e,
                0x1d3a,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xad0d454609e67f4010ea39dab55bbc,
                0xc36d4aa3a6b43c2274954f4a8ff36c,
                0x2d49,
            ]),
            x3: BN254_Fq::from_limbs([
                0x62f17de8622477cfa440a7ad85559b,
                0x8c0dd2b5a4e523c4a3b15d153324ee,
                0x5f,
            ]),
            y3: BN254_Fq::from_limbs([
                0x13f670817f9deb97544a034040b3ca,
                0xd0c80977f648cb4d020eae014053cc,
                0x1384,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x489bf406f02e56d5d81d7f15fdb2,
                0xe7e9cb95a65d1b3b5f2997d49fbf1c,
                0x2584,
            ]),
            x3: BN254_Fq::from_limbs([
                0x2bdddce7b0fa6e64847f553c5c6a43,
                0xd1d72aaffc4e3aaf3c303f1fc03413,
                0x1957,
            ]),
            y3: BN254_Fq::from_limbs([
                0xa74871bd11130d5c5509ec1a7ac412,
                0x5bbc55b34515f16ce4525562c0f80f,
                0x0929,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xa2062d070f50cfa3a2a7942d0f7c31,
                0x4e51f1e0b12886cc98bc14c3943db9,
                0x2c6b,
            ]),
            x3: BN254_Fq::from_limbs([
                0xcc89337037d881befef33f82a5117b,
                0xe35d5c270744da58137803ee3e7cf0,
                0x2369,
            ]),
            y3: BN254_Fq::from_limbs([
                0xa75adc49460b1f64e0a5928d99666e,
                0xb8d5a59c24ab9ec0f02ec6c036ab01,
                0x1d94,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xa6fc4eee040cceb1c57f73a0e09491,
                0xe76e603b5dc5efe1053e0dec694bdc,
                0x18b1,
            ]),
            x3: BN254_Fq::from_limbs([
                0x25ec9a6c69f00c4b35b4dde503bc8a,
                0x8eba6151f4e9b1c2f9705eefe769a6,
                0x23c1,
            ]),
            y3: BN254_Fq::from_limbs([
                0x523c1de94d270d623025f50f0df238,
                0x208751e25f19ba05dbe2c98e342a4d,
                0x105c,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x4ac6b8073e82d422ecc340cd034907,
                0x54d7527a6ccbc9f3921e0367dd5286,
                0x1653,
            ]),
            x3: BN254_Fq::from_limbs([
                0xcf2daa402cb8b6e9c030d7f1b32140,
                0xfc78778165fb6a8ba896f3282ee16d,
                0x2297,
            ]),
            y3: BN254_Fq::from_limbs([
                0x309a31f42986d2225daf259556488e,
                0x08e8ec9e27e52a22f790903e02b669,
                0x2de1,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x0bb953327cbaac1228bf45a3eb4cf9,
                0xbbd9ca39dfd4adc825a0e3ec3155f9,
                0x0842,
            ]),
            x3: BN254_Fq::from_limbs([
                0xc3653766fa49e360969e92c3e772bf,
                0xf8dceed248e05894ca1e4f99b1ccf0,
                0x1556,
            ]),
            y3: BN254_Fq::from_limbs([
                0x0a646c2153e932252dc5078a8a8c25,
                0xcadb10bab38dd3e96c483169a935f1,
                0x2857,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x0eb174c6b511213915b1e770ced893,
                0x672fa7bcc8053d2e0155705a8449b6,
                0x1bf5,
            ]),
            x3: BN254_Fq::from_limbs([
                0xe3f4c71542d619919143c3f620599e,
                0x5d14dbb9b44fe6ee5df1d196e6e861,
                0x1f38,
            ]),
            y3: BN254_Fq::from_limbs([
                0x14705909bbb7ea7d950f7f1ca1b57d,
                0x0a88973ef544f32d41f0e52aa49a1f,
                0x206c,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xddfba355a0f16d5973399c965499c4,
                0x1cd8f35458d19612ce7d4bdb56b617,
                0x05a6,
            ]),
            x3: BN254_Fq::from_limbs([
                0xc077459ce03f67eaf19547b310836d,
                0x82b45b2f8645ee19e54bba62643904,
                0x1982,
            ]),
            y3: BN254_Fq::from_limbs([
                0xe3a995cce20d8b401c39fda2bd92b2,
                0x987b00bb2527093111b17d89cbc6fb,
                0x1bf8,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xd52f0a035862652af7e1e11831e446,
                0x4c14c6606832bb71756eea82d8a644,
                0x192d,
            ]),
            x3: BN254_Fq::from_limbs([
                0x945c6ecacb08f7547703fe1e7e135e,
                0x779079ce159414f3679446edd3697d,
                0x0da8,
            ]),
            y3: BN254_Fq::from_limbs([
                0x5f2cf0f380d230d657a53e2ec89ffb,
                0x7b3f145468583602bf8a5443ee357f,
                0x2eb6,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xd9af2920dc56b2d6998bdbd71478d4,
                0xaf02af2b4c2dc0f4fff03e8b2a0d37,
                0x1868,
            ]),
            x3: BN254_Fq::from_limbs([
                0xd729614d10a7965a32661b5c32e469,
                0xd3e059a4bb9d9c4f59b1734010ebfb,
                0x2a3e,
            ]),
            y3: BN254_Fq::from_limbs([
                0x3a581cddc57bf5d6c231b9cb1f1cb6,
                0x7554396e2fb8d7a92fca465a9ef1ea,
                0x2ace,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xdcd1f011b495179f4f0cef9f778fb7,
                0xde87128f7f6578ee015de1876b2741,
                0xc7,
            ]),
            x3: BN254_Fq::from_limbs([
                0xd4c5d946b21a184d4b2db4c9f3b508,
                0xc2b1aa1abbd5f637b6192286f2a3e2,
                0x05d2,
            ]),
            y3: BN254_Fq::from_limbs([
                0x23dd863b436a355bd47cdad8ae651a,
                0x2c0bc6ca0815999b6f376ce71a11e9,
                0x11d7,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x3d624506d6ae953061bcdb23d3a404,
                0x86e4235025531e707f02595baeeed9,
                0x0946,
            ]),
            x3: BN254_Fq::from_limbs([
                0xfc5ad9372d0e58922b37bec2c8bf20,
                0x7c95b38c1ca7242a1cf71846f219e2,
                0x0ff1,
            ]),
            y3: BN254_Fq::from_limbs([
                0x26de313a452107f2a66a56f717db21,
                0x07efa7d0b1680de270981320397ad7,
                0x0206,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x6db16e3a09c0148ce0a799226751e1,
                0x6403ea05c94d42b02086fc3b3f83d8,
                0x0d0a,
            ]),
            x3: BN254_Fq::from_limbs([
                0xeb2aa0bbb770e82d91364059618f9c,
                0x9b7e9948c651d4b0a94bc858e44f17,
                0x098c,
            ]),
            y3: BN254_Fq::from_limbs([
                0x6990047fa505dc49419b95459d598e,
                0xea27f9e04a2a1135aee8ced1e850d0,
                0x1c45,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xb5f6b9ae98e600a5418fd245084a8f,
                0xe5f3ecc74b3c87761dc5bd59f80642,
                0x0f5f,
            ]),
            x3: BN254_Fq::from_limbs([
                0x9e7913f3cde7a3c307c0e72395922b,
                0xeab9f2c7e751bfd8f1ae629969c3c7,
                0x0423,
            ]),
            y3: BN254_Fq::from_limbs([
                0x456f0f8de8a245853ebdf1d69300ab,
                0x1b272d13b099904de8c322db64ed2d,
                0x0c10,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x6454140fc676e25027006045fc7044,
                0x128928e5e678d45cb41ca68cc64fae,
                0x1fef,
            ]),
            x3: BN254_Fq::from_limbs([
                0xc73b0149778cacd3fb1d504ac628d3,
                0xc0bd78c6fd2ae4b40b41468a949d70,
                0x07fd,
            ]),
            y3: BN254_Fq::from_limbs([
                0x796f2135496090e58b2a79c21587d0,
                0x734071c1cec4291915736887cb2415,
                0x0be3,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x6854fea586de6c826249d48eb356ee,
                0x9e1468859b3dc59edf9ebc2043235a,
                0x0abf,
            ]),
            x3: BN254_Fq::from_limbs([
                0x0f02fc91d4bd1196d1c90a1b2c8fa2,
                0xfa58f532907b771edeb82fd36601c9,
                0x1d03,
            ]),
            y3: BN254_Fq::from_limbs([
                0x5ea9f5d082f4e8195c29e2a9e53664,
                0x7f45f2d060d28e44c854040efdbd76,
                0x2f93,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xf2bea0d8cb2f3448f58ff49acdb526,
                0xa24977be3aeed87b2f3d163f0bad96,
                0x2f2f,
            ]),
            x3: BN254_Fq::from_limbs([
                0x911b4ebd8ce2c3450a8d28ac017f21,
                0x7ee04902b4c28ccd9e1a0f064e208d,
                0x2a7b,
            ]),
            y3: BN254_Fq::from_limbs([
                0xbc238e5dc9aed250cadfbd071b6ed2,
                0x39d3b57fd337be502230cdfca94b59,
                0x15a6,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x098f0b00dc0ae4ee50fcd93158004d,
                0x334c5e46c60425758216670515f36e,
                0x239c,
            ]),
            x3: BN254_Fq::from_limbs([
                0x96ced71e15fb5d9e8aeb44deab0127,
                0xfc922e46d68baf4492ac542e4a041a,
                0x1de0,
            ]),
            y3: BN254_Fq::from_limbs([
                0x0da7e70dfc8c8b2d8bf13755991af7,
                0xb6bfe2929fcc4c816f72d5ba1a5a3d,
                0x1495,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xb431d0b624e0c1f8fe8939fa9e1d4f,
                0xfa06f2f4c0e2ec161490cfd864f4f6,
                0x13e0,
            ]),
            x3: BN254_Fq::from_limbs([
                0x2c658fbbbeeff4434516bdbb633397,
                0xb7282a2944fba4a9f24edc9c77f0f9,
                0x23f5,
            ]),
            y3: BN254_Fq::from_limbs([
                0x3fc12850b07d520cdf2540d71b2772,
                0xb76b0730fe5238ae779fede6604ccc,
                0x1145,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x1d1cdbbc2e066bd3ba39f075e83e8d,
                0xbaca2f27e058db133ca26d56abc891,
                0x216a,
            ]),
            x3: BN254_Fq::from_limbs([
                0x1f1b37fd3f060ba51b3489f7b082a8,
                0x1cf4ff10102a758384185a526a9283,
                0x0166,
            ]),
            y3: BN254_Fq::from_limbs([
                0xab0a5a9a276ac6481f83afbcd0fee6,
                0x6a7adc4c9a8aea133423dc9ea3f255,
                0x26ee,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x29e744e0430ab618cb5c0a34a0aa69,
                0xdee92e8b1c5dd76d6d7f8502cd1cd8,
                0x2a32,
            ]),
            x3: BN254_Fq::from_limbs([
                0x894fc6d2593cc07fb0df3d194cf0ee,
                0xd24fb8b1e1d155b651830299f14c94,
                0x0972,
            ]),
            y3: BN254_Fq::from_limbs([
                0xf6e6409d7ca755d9dca3b4bb2b9679,
                0x39d36ec4b540dc2c612afe4236dd3b,
                0x0276,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x3f09005c15980f2331821743871c32,
                0xfbebd336fecc21628c92525dda4fbc,
                0x04e3,
            ]),
            x3: BN254_Fq::from_limbs([
                0x50f6063f7712447d6da67fe615185c,
                0xbdb153269bb847132be261fe7efa45,
                0x0ded,
            ]),
            y3: BN254_Fq::from_limbs([
                0xfcde34efbdadf5ca8bb2f3c10d3d93,
                0x0836fe98e3d6953a9e7c2d162d4dbc,
                0x28d0,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x3db832b15b7318e4708125e263cb27,
                0x1accf7a1bc58648f0f6fd3967b5c2f,
                0x0ded,
            ]),
            x3: BN254_Fq::from_limbs([
                0x47b40275d0f01ae20f39530dac038a,
                0x820aa68c734a5083171d21863ab842,
                0x22ae,
            ]),
            y3: BN254_Fq::from_limbs([
                0xc22424541af3ae1a7c0977c4628dd4,
                0x80751c7da2ddea8163fe640c68fbfa,
                0x092d,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x7ed238bad895dedac922869ba74396,
                0x63a9d5d76a6ddf47575349f5e4cb3d,
                0x03ed,
            ]),
            x3: BN254_Fq::from_limbs([
                0x9756a10cf93d9416d2c1fbef1d6457,
                0x5405794640b7c445c3b9b039e7cdb8,
                0x11c8,
            ]),
            y3: BN254_Fq::from_limbs([
                0x3e91bd221347a2be8e7ad4b7605084,
                0xa89bf45bbc109552712b36bfc329a7,
                0x10e4,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x7027a5b95bf8f8fdc40ebaae817b94,
                0xf287aadf88d42438f6fb974cd0c0ed,
                0x1881,
            ]),
            x3: BN254_Fq::from_limbs([
                0x14d758961748ce33086246a9bbec83,
                0x9cd468f09b93a6cb0ec0ae76c555be,
                0x2d68,
            ]),
            y3: BN254_Fq::from_limbs([
                0x72d3d7c6b06301b8e1bbd5bd72f2fe,
                0xe941b5a9a39af5120bda37095b5040,
                0x1910,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xe88af3711d350bcf79338d20655190,
                0x1769895f1156a8681f114558755587,
                0x178c,
            ]),
            x3: BN254_Fq::from_limbs([
                0x8c74481274a25fbbd60818fee8960a,
                0x29ca83c2de9e1b1dbed36e138dffd0,
                0x2caf,
            ]),
            y3: BN254_Fq::from_limbs([
                0x2cd563cdd1627f307d730f3aba92bc,
                0xd2da24df0eea9f97563eb08f4cc872,
                0x13f0,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xd131d3fa95f2d518691f571416eb7e,
                0xbddaba58843098bf6c094ce473d4da,
                0x09f5,
            ]),
            x3: BN254_Fq::from_limbs([
                0x0dea26866f0d5965bb1652a5c7b1d3,
                0xcb4413883d9515c08230b1010c4235,
                0x01c3,
            ]),
            y3: BN254_Fq::from_limbs([
                0xdbdbdc674d200b1884e586a0b1e813,
                0x5b9403b2c2c1940d90e04540694a09,
                0x128c,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xaa90ea7242fddb51503ed0705125e1,
                0x59356db82ee27adf57c3222f8de848,
                0x15b0,
            ]),
            x3: BN254_Fq::from_limbs([
                0x80876c8ba22fe8408f26f0785b2da8,
                0xce1ae27a702184f4240469e1a33e73,
                0x0ace,
            ]),
            y3: BN254_Fq::from_limbs([
                0x60a05c13ce0230a66736fe1ef09b1b,
                0x33ce6977dd8a33a83eaadaa86ca4a7,
                0x0c47,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xba63a57905a60c2d229bd1e2584ced,
                0xac3f27d3a8ea892a46d700a2a69c74,
                0x075f,
            ]),
            x3: BN254_Fq::from_limbs([
                0xd4a24ffeecdd4ee76f579a82dbc9f4,
                0xf3e083048a215dc729567cad6b8456,
                0x223b,
            ]),
            y3: BN254_Fq::from_limbs([
                0x5935231d2c9cd06c44d64e6ca1f0f3,
                0xb3dfe97aa183ce791ade09e997d8b6,
                0x0c50,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xfb35e5b8a2c36572a82b181f83c64f,
                0xe052949dd0387c2284d32aeaca0052,
                0x18d2,
            ]),
            x3: BN254_Fq::from_limbs([
                0x4c6adce563eeac790156632eecd5f7,
                0xf612326f38e0ccdf174d3969d58aab,
                0x2e33,
            ]),
            y3: BN254_Fq::from_limbs([
                0xfb9dffab0cfc5610c81b9d7db191b3,
                0xa063f2e9096b2b87e3395db2b5b32f,
                0x20a1,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x85d23aee5761a13c200648b5c949ff,
                0xc3de0c74827220b08fb6351e31d3ff,
                0x0a20,
            ]),
            x3: BN254_Fq::from_limbs([
                0x60ad2b341365915a1d59f9ddbf0712,
                0xe102945c281db0e6656aff71796e15,
                0x2b79,
            ]),
            y3: BN254_Fq::from_limbs([
                0xa4a7018ea0ee242b5a34ae52a73d57,
                0xc94eebf9fea3c2872394651f278b25,
                0x034c,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x3db734ec1642870582a4c63609c648,
                0x7d2dce88eb4c6e65417f102f4e17d5,
                0x059c,
            ]),
            x3: BN254_Fq::from_limbs([
                0x196383e2aa2e691309f8635393858b,
                0x2add2dc22a7ab66f2f4518b18dbfed,
                0x145d,
            ]),
            y3: BN254_Fq::from_limbs([
                0x5eb0ecca0fae0244921df7223baa57,
                0xb45a805102e22ca7cfe02c3636b447,
                0x0289,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x94d0fedd8e176b959378b1dfc25ea2,
                0x34793408b0321d6b7e1bd4d953d0df,
                0x2454,
            ]),
            x3: BN254_Fq::from_limbs([
                0x42e48531116f15c9417d4068aeaf59,
                0x824eb7f3487fa0d6a1ddd269a7da0f,
                0x05bf,
            ]),
            y3: BN254_Fq::from_limbs([
                0x0a6d554417df350696425556963a3d,
                0x847c30bd58769b62aa97c703130845,
                0x202d,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x4e66cad33a760b83cd831324877a8c,
                0x8a17eb88407223e7616a30c5c5894f,
                0x23e1,
            ]),
            x3: BN254_Fq::from_limbs([
                0x94eddbf25ffbd424d9c463729b0663,
                0x05610689df4a4f0da89dc25fb6aacb,
                0x1e21,
            ]),
            y3: BN254_Fq::from_limbs([
                0x504787b1ce3c45fc571e556d29d3f2,
                0x63fba180c344df2d69d6ef45313e56,
                0x031c,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xec26450a2045bffd5e23ff03ad6b67,
                0x3e3eb4888ea833b58f30e4bbeaf018,
                0x1906,
            ]),
            x3: BN254_Fq::from_limbs([
                0x2697c5554cb9e26e31cc9c94ecd7fe,
                0x7ec383f2338d274dc944ec5bd2e3f2,
                0x0ce7,
            ]),
            y3: BN254_Fq::from_limbs([
                0x1ddbec3809f1fa442aba8b18674813,
                0xa267549450106abe9e9846a60a10c4,
                0x12b9,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xbaa449da2aa902a2dfeeb854fde76b,
                0x9963ddf4727b56e1006d9f5b44d031,
                0x0b7c,
            ]),
            x3: BN254_Fq::from_limbs([
                0x0664d8e98fe059457f5cda8f4e82b0,
                0x672e00f75920e5290f172ed9460873,
                0x0535,
            ]),
            y3: BN254_Fq::from_limbs([
                0xa21210d0588d5638661a6cf7da8431,
                0xc81a845a3f203ec24e871186449411,
                0x17a4,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x2bce4602cab64b401c1d152e3e246d,
                0xbc14f21899d1113978b87bfc41aaff,
                0x01c4,
            ]),
            x3: BN254_Fq::from_limbs([
                0x7b7af9990a0a8169d2dbc8fa96e968,
                0xbf55151a46325f455546143e053d56,
                0x1fa7,
            ]),
            y3: BN254_Fq::from_limbs([
                0xeca5585aa5263329d15f5e612c88ff,
                0xceb3046c349bc4604404eeb0c2002b,
                0x0290,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xe0511190ab7431f008f34e151d1d9f,
                0x41d04f87bcac8ff721345f61733fa3,
                0x2c6b,
            ]),
            x3: BN254_Fq::from_limbs([
                0x282615d00587ef877d1d26ac0334c2,
                0xb55a42f530a4ddee71274fb858c30a,
                0x0f35,
            ]),
            y3: BN254_Fq::from_limbs([
                0x93b8a1572851b08ad84138d8d054a7,
                0xf3ee55f50ac67fedca3d87358276e7,
                0x0890,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x5d327f2c8daade142f68f56e227f75,
                0xf27f436530e1874f8dea6e6886f106,
                0x2c48,
            ]),
            x3: BN254_Fq::from_limbs([
                0xaca4ad487941ba082a8ab4c305551d,
                0x5958c59b9568b5d1ca9d8c333fb2b6,
                0x1771,
            ]),
            y3: BN254_Fq::from_limbs([
                0x039a36eb2037f0b97e3dbab8e9444f,
                0x95566c19a3970cbc28b28d6301e925,
                0x2674,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x0a96784b4186c7a57cd443abbd4826,
                0xb7e8d9309f47ef63f5c6e2d02b4d29,
                0x2809,
            ]),
            x3: BN254_Fq::from_limbs([
                0xa0dfec28401e924fd3247c71a9e732,
                0x76085b94d95d37d19b83ac3f51ce40,
                0x09ba,
            ]),
            y3: BN254_Fq::from_limbs([
                0x9f90871683973da5077c837204770b,
                0xc1f27eea1c75df3de2717993ccf5e0,
                0x1c22,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x7dad4ee5e135ff68934b232f254b62,
                0xcc1584aad6201b784393cdcbd6fb99,
                0x077d,
            ]),
            x3: BN254_Fq::from_limbs([
                0xcca595cdef3fd0df159cd0383af0f0,
                0x2a59635cedeec5396987c5cc99d294,
                0x0c,
            ]),
            y3: BN254_Fq::from_limbs([
                0xb5ac4773f63ed4d730ac9a81ff2e,
                0x6b8e224f5c1795a1a273b997de94eb,
                0x0e3a,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x9f54b1ee0aed85556ee4e39e233070,
                0x6e6f5f46cd725d104029b292aa9835,
                0x0622,
            ]),
            x3: BN254_Fq::from_limbs([
                0xab2de3c93592369851e6eff41e7757,
                0x9c7485c7c33e90b769b95ce46baa2e,
                0x04fd,
            ]),
            y3: BN254_Fq::from_limbs([
                0x357e75b56e594e1245f337adec2ac1,
                0x60739dc55594f114a8dcb143698c89,
                0x2836,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xefa8f3e24f6a63fa4a926aee4bf119,
                0x6b6aab941d6e0b4e785ec12c21116b,
                0x0ed3,
            ]),
            x3: BN254_Fq::from_limbs([
                0x1b8de807663ba3cb60021a20d63df7,
                0xaa1da7d48cc2d8e7550d7f2d34d0a1,
                0x21e2,
            ]),
            y3: BN254_Fq::from_limbs([
                0x2f017df14e7b26aefbfcc4e2b9ad41,
                0xc761ce16951a9f228816961954317c,
                0x07e0,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xdd1df62b20a06b52e6c33b6c1adb1d,
                0xdaddc240059b9899a0c4fbc1cc24a6,
                0x0aeb,
            ]),
            x3: BN254_Fq::from_limbs([
                0x34ad4cdc2dc2ddf501037503e1bef0,
                0xfe9b774b0c153c8edeb9b89d90a2c6,
                0x275f,
            ]),
            y3: BN254_Fq::from_limbs([
                0x87b4a8ab8dea8675e9ae87c3b318a4,
                0xe1da164198176019875c9f68a4c79f,
                0x1047,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x7403c8424c510cec18254ded91ed28,
                0xd9587a90de58cf006fde4064ccd10d,
                0x0495,
            ]),
            x3: BN254_Fq::from_limbs([
                0x54c6ab65126d93575ebb346de3a03f,
                0x0552579ca692e31587dc29fb7c2a48,
                0x20ce,
            ]),
            y3: BN254_Fq::from_limbs([
                0x60c1db6d11126617539a61dd18d6bc,
                0x3e495baaf2cdbc3a60edfc2aae9d33,
                0x0e89,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x2eeac8c88097dad1c6977e091be6b3,
                0x2176b64b8c45fbf97c86e5ec7c0fc3,
                0x2155,
            ]),
            x3: BN254_Fq::from_limbs([
                0xbb544273adf3a2e4523f0ec7857876,
                0x77385cca659e3392be3d8b9441ab9b,
                0x286c,
            ]),
            y3: BN254_Fq::from_limbs([
                0x57a373842c3cac5c06e64364788456,
                0x298af8221b7820cb9c27af238de685,
                0x235d,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x4d875a23dca6dc4149c10969697927,
                0x7784074b2de25b2dd298569fedbf84,
                0x2070,
            ]),
            x3: BN254_Fq::from_limbs([
                0x5be7bc5ad986d27b2a038f52f981af,
                0xd4338b91ac300d8af0be5c30d3c0ab,
                0x1d36,
            ]),
            y3: BN254_Fq::from_limbs([
                0xb95d0666762e337ffdc7ebbc94ed67,
                0x39d07e3c048294c06b6d3199e550de,
                0x2fef,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xb6508565d36fae90ca344bbeee4ef9,
                0xbcd754d84038eaae6e0e552e11fd86,
                0x0cee,
            ]),
            x3: BN254_Fq::from_limbs([
                0x72cba6fc826643aceda49b21fc619f,
                0x0e034d94130695e9bc250959216412,
                0x0525,
            ]),
            y3: BN254_Fq::from_limbs([
                0xbe21c098d02a18ca39f5745f28bf54,
                0xfac41b329c2bbc462c883380dc224e,
                0x178d,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x34968233f5dd565b6c85276fe7f2e9,
                0x9ae511697731bb5e5d89bd63951667,
                0x219c,
            ]),
            x3: BN254_Fq::from_limbs([
                0xbe9b31ea4e19dddf8e00fb79f5faca,
                0xf362ed78e81c0370bd1f09e62d2c66,
                0x2483,
            ]),
            y3: BN254_Fq::from_limbs([
                0x71da8e65edcaab3d74d6ecbfa3ca5f,
                0x08f1f1157ec000ca52ed4307cbb6ff,
                0x0e71,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x04f2f31293d300e1f5ba75844958d6,
                0x48582db353c512cc4b2974faa0d140,
                0x16cb,
            ]),
            x3: BN254_Fq::from_limbs([
                0x4325302b1d5f4d8a4fb66908bb3645,
                0x95b1e7bd0fe93124f2fc885c0bd44b,
                0x0bef,
            ]),
            y3: BN254_Fq::from_limbs([
                0x983ecec3eef73b4d95a28208d2b4df,
                0x0fe3a816a03bd5c51cd12d285af8b9,
                0x2ded,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x3f4a26a94137badcf8f5d310c099a2,
                0xfce0a1049f512bcec70bef02ccd7f0,
                0x2b5b,
            ]),
            x3: BN254_Fq::from_limbs([
                0x57aa62bcdfa3059a3ee911741e7eee,
                0xefd24c21edfd225df0ea4f1aa050b9,
                0x1832,
            ]),
            y3: BN254_Fq::from_limbs([
                0x54f6aec5ee81e85218bf0dbb579ee7,
                0x131b647c2c9657cd4adcbae50bb2e5,
                0x2ca9,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x0604bb8c9af9476c266ffef01b5e46,
                0x249e01459196504a35325a62745e28,
                0x5d,
            ]),
            x3: BN254_Fq::from_limbs([
                0xb880ccbe6d91505e97af8420ec1cc9,
                0xb8a947930750261aba5bcc979a5c31,
                0x3052,
            ]),
            y3: BN254_Fq::from_limbs([
                0x5550bb3e9b5d4a67595e197f0564cf,
                0x52e07ab70a4b205d847ef6d9c2a9e6,
                0x2937,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xf111a72a802a85b7b3d801cb7ef0b5,
                0xfddc31a5d0e86230f6b8fe45c535ed,
                0x0dee,
            ]),
            x3: BN254_Fq::from_limbs([
                0xdd5f4fb2b1876cff8cd1ebde16aec7,
                0x6d69cf9217fd2f837a2736326fd8a0,
                0x0bd2,
            ]),
            y3: BN254_Fq::from_limbs([
                0x9cc5c009f62373182879f8295cd9fc,
                0x580decf3dcbfb928c548455d7e99d4,
                0x15c0,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x25689f2faf024e6e78e908999ddf79,
                0xc6fbdf8dd197f1578d6f6c8f0bd929,
                0x074f,
            ]),
            x3: BN254_Fq::from_limbs([
                0x386426a43d181343c460adf2192712,
                0x4acff91833b475eae2e6534f9b08d4,
                0x0e9a,
            ]),
            y3: BN254_Fq::from_limbs([
                0xa5c6ed8063ba2aedd68691110f0c6a,
                0x78e64d0815fb76312e5ce417b1147f,
                0x0df0,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x44912fc790eae441c7022abe50ab45,
                0x93348c5e97fa41d5657486a72dbafa,
                0x2ec0,
            ]),
            x3: BN254_Fq::from_limbs([
                0x9b7c00b181fd8958a6725c714c8972,
                0xa2728c5776e5a02f16eb7dac091a08,
                0x2caf,
            ]),
            y3: BN254_Fq::from_limbs([
                0x30a44e353e400fd992906257e249f7,
                0x469d9663308e91b97eb6e07ee0ab1d,
                0x20d9,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xec01b326784da8ae211fde9cc9c6fb,
                0xd0f728e53d5093c99d0f4b7d0b2fb7,
                0x18ee,
            ]),
            x3: BN254_Fq::from_limbs([
                0xaa1e858f4077db334b23e12971a4b0,
                0xf904a49f31ff4a7131e74464690d26,
                0x2391,
            ]),
            y3: BN254_Fq::from_limbs([
                0x1180f795f95fa0b083c5892792e407,
                0x7be16d05526a4b272c859cf0cfc2c0,
                0x169c,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x66c51f2f2515568adc5e766d89d54b,
                0x0e266c8d30638540821dc3404dc756,
                0x02fe,
            ]),
            x3: BN254_Fq::from_limbs([
                0xf832f0a2223f2e67d4e9ecf143c935,
                0x43625ff81ff5c8611bfe7c80aaae38,
                0x2b66,
            ]),
            y3: BN254_Fq::from_limbs([
                0xee9db6f5b5aabfb61620ac21b5d1b7,
                0x97e954c7bbd7fa4bbd90f4b0249e0a,
                0x2db4,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x4352d983e9e03314d4595c46094d4b,
                0x2203415fa0fea043d040e5b5674ef7,
                0x0b7d,
            ]),
            x3: BN254_Fq::from_limbs([
                0x6931d5c2ef80a8a33d89538c8ea4f2,
                0x17a8e33aa2948b4837d219ce93047d,
                0x0997,
            ]),
            y3: BN254_Fq::from_limbs([
                0x1cdc9ec0d223b6043111161bb56eee,
                0xa1491b712f42bc0d5d20a71ed619a0,
                0x01c0,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x3e1a21f9c0e48d23befd1fdb3a0156,
                0x1b7289d8e6cc25e2f3a5bdbce10c42,
                0x1787,
            ]),
            x3: BN254_Fq::from_limbs([
                0xbc5c749c6adc842db7c75f4519b92b,
                0x4a20da00235ddf2e4e47d85bb20dac,
                0x2be0,
            ]),
            y3: BN254_Fq::from_limbs([
                0xe7e141800491c552d9780ec6d07629,
                0x4af7132778ea2fe4f539bc0b0adacd,
                0x14f0,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x09cdf627f1d4d933019ca361baa60e,
                0x1bb548ac00338d7cf925120444ad98,
                0x1b88,
            ]),
            x3: BN254_Fq::from_limbs([
                0xbed8941ef0dd3a24b2f5a0f72ab547,
                0xb904f36027790d5972de9f5d74e5fe,
                0x1585,
            ]),
            y3: BN254_Fq::from_limbs([
                0xa292d97346baee2612da9d5f5a4cfe,
                0x5dfbf42f997d16a1599041e4aebd6d,
                0x2152,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x32f9bd656c820b225fdebc0295cfc1,
                0x536401ff5e50a834809a9fdb3b64c4,
                0x12f0,
            ]),
            x3: BN254_Fq::from_limbs([
                0x073ed31aa5bc351b288ca764c93ff1,
                0x48a7c21e33cde897526c0934613fe1,
                0x29bf,
            ]),
            y3: BN254_Fq::from_limbs([
                0x2f9e522abd5399822acc6ada048354,
                0xd0d4346213537bf1c73c9dc872be7a,
                0x2a5b,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x0ac321233a8f63589d3f1e6fb76a0e,
                0x3b17bbfab9720a36b69ea7e5d291ee,
                0x1267,
            ]),
            x3: BN254_Fq::from_limbs([
                0xefd61d532e2886284444493cb15c36,
                0x82c0742c0f62e89f5edfac3b8dfe87,
                0x11d1,
            ]),
            y3: BN254_Fq::from_limbs([
                0xd620f5a3312ddb7a664561a94f39b6,
                0x1509c16ae30958b5386ea327785220,
                0x1403,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x242856cfa691a0f24aa2992b39a279,
                0x2cd0b7c6b20c7ed9c42cd07c4428e6,
                0x0934,
            ]),
            x3: BN254_Fq::from_limbs([
                0x12fe2d76ef3af75f6bd1ed2970e6d1,
                0x571a4b21339e3d16ce6e509175be74,
                0x1832,
            ]),
            y3: BN254_Fq::from_limbs([
                0xa5ddf8529b20dd1b10c9ccc5761381,
                0x62060c840f438c4b52a5feee1c683c,
                0x25b8,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x89a69a297c2597104af9c55589b730,
                0x8eeb5134f05c9bbcdb991af50ccb86,
                0x0c59,
            ]),
            x3: BN254_Fq::from_limbs([
                0xe253316d0910150491dafd176424b8,
                0xca12016e191cbb113955fc113efcf6,
                0x2901,
            ]),
            y3: BN254_Fq::from_limbs([
                0x491dbf8777ec7ae972db24ffce3419,
                0x1e8d02a3fbc2015ec5d349d7e4b461,
                0x1c1e,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x37636c65be38e2ff611e125837be39,
                0xe6e1852ecce40c82510b5c7537591c,
                0x2e38,
            ]),
            x3: BN254_Fq::from_limbs([
                0x4cfa349f43d22997637f4be3092d10,
                0x893deedf7b01a4569000a9eb036ef2,
                0x2f90,
            ]),
            y3: BN254_Fq::from_limbs([
                0x38f767ad7360528442c361cf7aaaa6,
                0x80e185ee3cc8b5281d768a631a0643,
                0x115e,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xb11562d3da0b1afbdd10fbdd020b3b,
                0xb12ba864c3205b455559dc4e21bc7c,
                0x1843,
            ]),
            x3: BN254_Fq::from_limbs([
                0xacc816d694c93769503685de899f9e,
                0x55990f2842f5a874c6fc292bba9828,
                0x1284,
            ]),
            y3: BN254_Fq::from_limbs([
                0xb261a8420dfb4f0be28ce9b9d78e3a,
                0xee038d0fe42f41f0801a4151e23fa0,
                0x0712,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x83081ce1df56306b53e614cc2dd7a8,
                0xfa98dfbc98995264f3e600404a5428,
                0x05f3,
            ]),
            x3: BN254_Fq::from_limbs([
                0xc015b28b6c3dbcfaf2c9033381e5c3,
                0x47e87266fe1331edc315c4700e1856,
                0x201d,
            ]),
            y3: BN254_Fq::from_limbs([
                0x24e8c2b52038b7ec1434d676daa419,
                0xecf204b56f7d7a3f8ef9650d7fd7c7,
                0x16,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xb8a473b9e9ac58e126faae51a59fc8,
                0x60313c6d39ae06ab1734ed89b90440,
                0x20ec,
            ]),
            x3: BN254_Fq::from_limbs([
                0x7648b960e9ef26e97dfd94585da7ef,
                0xa3b05b2a1e10553cbbc5ff29be7462,
                0x0b64,
            ]),
            y3: BN254_Fq::from_limbs([
                0x21e75b735e95ab3052a63490e1797d,
                0xe466ee18d37724b77e4765fe41ed2c,
                0x0e29,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x9fa0726841b57435cf7d2dde7b9c25,
                0x07b0952e85a9b18f8b4ac1d2137605,
                0x2ca6,
            ]),
            x3: BN254_Fq::from_limbs([
                0xb08c2d7d89243753673e11dc506acd,
                0x689bcde996eae80945a49683a510bc,
                0x0ba9,
            ]),
            y3: BN254_Fq::from_limbs([
                0xf4f6bcea11ff947df2ddc265e7a3ae,
                0x4b30dfeb2b06567be0633267085551,
                0x04b2,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x453360b5d60c888891cc77f254c8b3,
                0x974270e7782177e07d546a0a3b0b9c,
                0x2bae,
            ]),
            x3: BN254_Fq::from_limbs([
                0x0126e62d21602e6fa56f35977d3aa5,
                0xa9ded0ec3047e0a9091448760a009e,
                0x2bf5,
            ]),
            y3: BN254_Fq::from_limbs([
                0xf9e2d6e5fb22651bdd838649322717,
                0x9a41b6546313ff3e0f3e176cb9ebad,
                0x1707,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x70f8d9013b18cec1b3dc56c7e6224c,
                0xde7aa3a03ffbbc5569bd0e5ec072b7,
                0x053c,
            ]),
            x3: BN254_Fq::from_limbs([
                0xe8530c812d89063fa65efe07b9873a,
                0x5f6061eddcb068a3070ae588820b3a,
                0x2add,
            ]),
            y3: BN254_Fq::from_limbs([
                0x7677a868f09f11ac72cf66f9a4465c,
                0xc0cf89245fea1e11da09d10ccdd4fb,
                0x2ec3,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x1d6404379712b67c7efbd0b16f63c5,
                0x43b6e3eed3d4128b61cf5009b65b04,
                0x144d,
            ]),
            x3: BN254_Fq::from_limbs([
                0xdc1d7ad862a20a8c0a24d255621ea5,
                0x1d554a62f90e2cbddd67c790b02ace,
                0x11fe,
            ]),
            y3: BN254_Fq::from_limbs([
                0x1a752c8ad31e6460ea242730e9fae0,
                0xf81f17d13487da1c667bab7f9f95d1,
                0x1a51,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x27d74bf20322be8ab2cc3118fce3e5,
                0x5db5733cd064c4d4713a8744e7d33e,
                0x04db,
            ]),
            x3: BN254_Fq::from_limbs([
                0xdb9413fc2a9a9684460196f84732d9,
                0x2cf31e245da9823be5375504616374,
                0x2d2f,
            ]),
            y3: BN254_Fq::from_limbs([
                0x694ab1472e533ff976492a7d7214c4,
                0x77e7af1cf1988634b509435fe345c1,
                0x276c,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x4e62083cebedfed947871899fe6955,
                0x354ab529002a1914b7559e821a2b9c,
                0x2060,
            ]),
            x3: BN254_Fq::from_limbs([
                0x9389a01331b6fd890e2094c6f7d525,
                0x54eb2fb94724a3bd561034745c2018,
                0x2e41,
            ]),
            y3: BN254_Fq::from_limbs([
                0x7c8bc986a11497885091de34ef6ae7,
                0x29b07ec9152ef61f4ae4faa3c2e75f,
                0x1766,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x630a4ea62471b6924d731db5bb372d,
                0x2abb811d62bd00670fcbbe26f6f096,
                0x1a38,
            ]),
            x3: BN254_Fq::from_limbs([
                0x8cb406c49b39ed029a15e7be657266,
                0x695703ec551cc69d3a12f25575f71c,
                0x06e9,
            ]),
            y3: BN254_Fq::from_limbs([
                0x9d7869bbd081741b6da6570798b0bd,
                0xee737e03b4e34f68b85b0a474ecd81,
                0x0a0a,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x63ff89296285b58a878bf8f35c40f8,
                0x982dd6c617563b87f891bda0820c09,
                0x1da1,
            ]),
            x3: BN254_Fq::from_limbs([
                0xe8d158c16457d37ef230ac2429055c,
                0xa273ab32f95975fdf37d172c1dc191,
                0x2a69,
            ]),
            y3: BN254_Fq::from_limbs([
                0xa693d133acc3deaa6d57bd9d9374ff,
                0x494816cf5d180ab04629f2d5ef2dc3,
                0x18c5,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x0b1214cdb302508b4dc3e1b9a8fe97,
                0x71d06fcb36d5a5dbf3545830dc9415,
                0x2ca7,
            ]),
            x3: BN254_Fq::from_limbs([
                0xdc8c221edfd070600883db38c4fa68,
                0x5d9e57f7ffdc8fef0e985ce3fb274e,
                0x1fec,
            ]),
            y3: BN254_Fq::from_limbs([
                0x1e16c11226b36a3ac42bfd4cb59d0d,
                0x8ee213c15897dca638ad20a3bbd0e0,
                0x0bd2,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xcebbd2ac2befc371d90a8b59e4cfe4,
                0x15ccac06c827ab0eadb0caa0c79ad4,
                0x0fa1,
            ]),
            x3: BN254_Fq::from_limbs([
                0xdbd9623947620af2cee30a69d82a26,
                0xf3ea47117686287e3afe440cca20e5,
                0x2ce0,
            ]),
            y3: BN254_Fq::from_limbs([
                0x9d60d841e965b537c4c36403892fc8,
                0x63cd64a32a1cdb9f8586b5f3f1e381,
                0x1aba,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x021073aba667182cba875a9f3a18e9,
                0x5414523b144686b4fc94c99c14aeff,
                0x0427,
            ]),
            x3: BN254_Fq::from_limbs([
                0xcc8c210fc0ee2c5f8ce64a213b5edb,
                0xcdf9f007ce0497e7528756c260438d,
                0x0425,
            ]),
            y3: BN254_Fq::from_limbs([
                0x8c19823fa5c9d4ceab6ba4686357a1,
                0x9e135d2830799530ffd3080fdde1cb,
                0x19c1,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xe9f38c03e2c6b42bb72f162ef60ba3,
                0x81f166b65cc89b1e4d0a3746729dc9,
                0x0405,
            ]),
            x3: BN254_Fq::from_limbs([
                0xc8c0d528cbf7a7adc6fdcd12cde416,
                0x5a43d50ff47226343e148c50fcf792,
                0x281c,
            ]),
            y3: BN254_Fq::from_limbs([
                0xb1578ac1ae623a30ac721e871aed87,
                0xa97a433b55b9b5234f5d2bf534099d,
                0x16c6,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x557f0d7fff910fdd851f82f8f9c259,
                0x86975758a0eb062084c5656cc03710,
                0x0336,
            ]),
            x3: BN254_Fq::from_limbs([
                0x56ffbcda62143d521ebbe919d9c208,
                0xcb801a206576ae19b214d29ce22b73,
                0x2f4a,
            ]),
            y3: BN254_Fq::from_limbs([
                0x885bd9eba42e69321ab63c6b21b795,
                0x7df254d41a6b242e9dff61d7cadbc7,
                0x0b42,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x0925ce1f707f899ec4a1e613405262,
                0x670fd964e78d0a8e59366d9d30e637,
                0x2b8f,
            ]),
            x3: BN254_Fq::from_limbs([
                0x95d3c159a30759500cf1c62646e1ec,
                0x551f77d9d051f0e783a1a253439c2d,
                0x083f,
            ]),
            y3: BN254_Fq::from_limbs([
                0x06b697735c527ac643d8b3057172a2,
                0x3c6faabd3e9f94c8130ebcd7fac2ad,
                0x25b6,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xa0667f6daa7a3f524806d101666c2f,
                0xacc1f92782c4f946b5e401b9c0dd6a,
                0x2c05,
            ]),
            x3: BN254_Fq::from_limbs([
                0xee7844f6173c8a453c9c60bacd9b59,
                0xd065f4546345bd8d53f927be0f4e84,
                0x08fb,
            ]),
            y3: BN254_Fq::from_limbs([
                0x9e711ee1d7f8f30f53ed320ded110d,
                0x1b9ffc6619d00d4ca3804e30598e4a,
                0x0552,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xf11973e5d26ccd08092f9c161459a4,
                0x42e68259d687451fdb767e0923be14,
                0x2220,
            ]),
            x3: BN254_Fq::from_limbs([
                0x32fec5af111d41cdc6f5d99644f675,
                0xe28c742eef21d517a8e1b417ede71e,
                0x2c7a,
            ]),
            y3: BN254_Fq::from_limbs([
                0x6fd90bc860691a64058502d244f3ae,
                0x7e7bc9c7a27d5251bafb1f08f9fcf2,
                0x21c3,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x4b4676f93dde9b41aeb77243a2bf72,
                0x4b3a3eb9b91f52fc6dc2429ba9b85c,
                0x0ffd,
            ]),
            x3: BN254_Fq::from_limbs([
                0xab96277dabd519e9444b62c7f7153b,
                0x8700ca50f2943c84d8659fba334b45,
                0x275d,
            ]),
            y3: BN254_Fq::from_limbs([
                0x29155bb77aadb77d494a44a95f3838,
                0xa9a5a29c655b7ef81e8638ed66c5b7,
                0x11cd,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xa143dad4a0cd3f2992d5dc83262447,
                0x5211e1585aec4c10f27a90319e6f09,
                0x286a,
            ]),
            x3: BN254_Fq::from_limbs([
                0xc3b92cac314652fb9551545340b424,
                0x22502c2245804d3ecaeae160101862,
                0x2f82,
            ]),
            y3: BN254_Fq::from_limbs([
                0x2437b835a4f769669879700a454693,
                0xa8d3daea14185a5d29fc443f4370d0,
                0x29ef,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x8b8f3fdec7db800b2afbb1a95bb7b9,
                0x01707a9573f5f0087caaa413e31590,
                0x220b,
            ]),
            x3: BN254_Fq::from_limbs([
                0x341dfd779b55cb89e145cd197829e3,
                0x3541c93737bc4e12ac967e16dc878e,
                0x2c9e,
            ]),
            y3: BN254_Fq::from_limbs([
                0x414bc66a35a73a41d1d1efb9594187,
                0xbd30e7222853419a7d5be980e2a1c3,
                0x2c62,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x273357f4772f6cd8049446fb32df5e,
                0xc5552c949da0f35a63c2935555105c,
                0x1c90,
            ]),
            x3: BN254_Fq::from_limbs([
                0x438a9448aac8df496c5d7507fc2316,
                0xc016c41515ca3f3c112ecbb70f212b,
                0x1962,
            ]),
            y3: BN254_Fq::from_limbs([
                0xdb675fce435bfa1ba8380a99cdd7fd,
                0x1da1c93275376b8c49923252eea0f3,
                0x2428,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xbe4d2a205ed66b73b7a1dc8d1a6f7e,
                0xfcfd86bb36295201d04ee2147028b8,
                0x13a4,
            ]),
            x3: BN254_Fq::from_limbs([
                0xe9d842294c17b353aa4252aa7d9501,
                0x672a93cfd8a2204c83b987e3446e90,
                0x1cc0,
            ]),
            y3: BN254_Fq::from_limbs([
                0x8f78b940c9b8cb0e328c9dc895354a,
                0xfff6b7f38b416af219f4ca854273a7,
                0x23e1,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x6c211c49d1c2630a0b8b9686d3ff56,
                0xd0932b16ef9d93f544bd4960ab272c,
                0x0933,
            ]),
            x3: BN254_Fq::from_limbs([
                0x1d3dd9f63b442194637bcd8eb33efc,
                0x5bebfbe41bf209b4678604143552bd,
                0x2846,
            ]),
            y3: BN254_Fq::from_limbs([
                0x056e9fb372fe0c18c94379bafa0baf,
                0xd4d950aedcf3d8189e5e4c30677c41,
                0x05dc,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x4e30b71c2198bc1895e9ff51d5e05d,
                0x5fe1a7f370f02c38462cdad3d71cbf,
                0x204a,
            ]),
            x3: BN254_Fq::from_limbs([
                0xb8c9a30e5ed2b5f387eb36a369d0c4,
                0xcc7644aad3a72a97fe77ac83bcd4fb,
                0x2768,
            ]),
            y3: BN254_Fq::from_limbs([
                0x29993fbe1b0b853563eedc8f3e8b6a,
                0x565222ae7fde5ea0b541ad19f67455,
                0x1969,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x1fbab709a5d9382c967f61d6900505,
                0x1ff203345365cd156d6033f1840e0c,
                0x0137,
            ]),
            x3: BN254_Fq::from_limbs([
                0x9bd8a5bb197206d524b5428880401a,
                0x8e0efec7a12394bb0d29a0ecc84dc8,
                0x0a90,
            ]),
            y3: BN254_Fq::from_limbs([
                0x2d581bbe312ce093ce12d10d880463,
                0x9d2eb19a4892948312bfc140432354,
                0x2424,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x50fd8b99b2a94c833bfeb627c0bea2,
                0xd97c8080e1b7ba07b1e18ca0b3ed70,
                0x2f2e,
            ]),
            x3: BN254_Fq::from_limbs([
                0xec8c43887b3b4cbcd88f35595a0ca6,
                0x24086d3f048ae12996d78a8a88f39d,
                0x92,
            ]),
            y3: BN254_Fq::from_limbs([
                0xa5b25556c9c0ec1491b3677f632103,
                0x9bfb3fe986794fd2b90080c763edd1,
                0x2340,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xac343efb02363626d3b3f85e065964,
                0x8d287f4463ba08aa912701bb57ac2f,
                0x2d82,
            ]),
            x3: BN254_Fq::from_limbs([
                0x4174fc98713800e5cb649c92054831,
                0x99b62e9e5df00a6c1f307b22402867,
                0x1957,
            ]),
            y3: BN254_Fq::from_limbs([
                0xe25cfe92d46d3cee97108df183918c,
                0xa95b13d1548686ab95b306a77f4142,
                0x2062,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x5d0e196d32574e150a034e2b4da41b,
                0x01b603c3a65b66ec1e93f41c3eddae,
                0x1893,
            ]),
            x3: BN254_Fq::from_limbs([
                0x2758de7773d68c22023d2b6f8a595d,
                0xbf8d36b61de06221b336d00a86db7d,
                0x1930,
            ]),
            y3: BN254_Fq::from_limbs([
                0xfad2237160cec806a4ea5bf8dac174,
                0x452650142e8675a38dca160bc569d1,
                0x1e70,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x791bc9188c166c5677e70041d31c53,
                0x1be5b50b1868efd76754626e5aa81f,
                0x1c12,
            ]),
            x3: BN254_Fq::from_limbs([
                0xb1dd90cedf8f621de39027a6b99d27,
                0xf84ba705206a12285da10937cf74c2,
                0x012e,
            ]),
            y3: BN254_Fq::from_limbs([
                0x85506df692c6edead1dfd402fecf47,
                0x0cfce3d29ffa49b22c4dcca0725998,
                0x159f,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x2c8e57120b7cd3c37058cd4df7a1de,
                0xcc6fd21db216e135e1aafcded389f9,
                0x1f7e,
            ]),
            x3: BN254_Fq::from_limbs([
                0x8f1e96b6196ad3111b64f5da39fc54,
                0x5efd57cd4903b6a68998e657fc1b33,
                0x13a6,
            ]),
            y3: BN254_Fq::from_limbs([
                0x3cde9322b34c89060fa79064ff22bb,
                0x8c7b966797e3dc471ad1198379620e,
                0x18b9,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xbd5211502c009e3b4526777ea47587,
                0xd983bf011e7f08c322b49bfb1f87ca,
                0x078e,
            ]),
            x3: BN254_Fq::from_limbs([
                0xb56426daabd93c6d5c19462e655bc3,
                0x4e541e0a3b22b7ed5920ce15eb7fc6,
                0x0f23,
            ]),
            y3: BN254_Fq::from_limbs([
                0x9fdda403a78e54964d4bf58c826f64,
                0x72bca68480904f5d844662999636f4,
                0x1b8d,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x60b230251567f71c6849d7d55d7986,
                0xcced163bd75e272e5aeb8884115e4b,
                0x01f1,
            ]),
            x3: BN254_Fq::from_limbs([
                0x5adf37da5c68e86525c12b88d9134d,
                0xf3c165deaead97b104ad044d4f31bf,
                0x2275,
            ]),
            y3: BN254_Fq::from_limbs([
                0xe5c36622181f8c21b800efc2fb5646,
                0x5b453f010608d5b9497ef1abee8d55,
                0x29a7,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x1355576ce407f0cda9b9f52b06d629,
                0x2889b5edaf55af98a366b559f780e8,
                0x17af,
            ]),
            x3: BN254_Fq::from_limbs([
                0x16939dc0e097cb27c2d6ab7d8c360a,
                0x60983036dcc34358a9880966e8f96d,
                0x1a92,
            ]),
            y3: BN254_Fq::from_limbs([
                0xcdfc75e3d1cc92b985e8dfaca0fe7e,
                0x65f83d8e31afffe6a9b5c9067eede8,
                0x2261,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x6fa1905af8b3d59af93093d60e1cce,
                0xcfb9d9d0942cd4b04b1b52910fbe17,
                0x301a,
            ]),
            x3: BN254_Fq::from_limbs([
                0x2141fac26255f332e9be050133e0fa,
                0x5b49fdee18be6f2c3c00278aa0b2dc,
                0x0136,
            ]),
            y3: BN254_Fq::from_limbs([
                0xf001e6c62cb63419d93916b85f5cf9,
                0xab55f55a222fcc53288921f70c0721,
                0x2751,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0xd18f5e9626c8bc04db6f968489b7ba,
                0x43b889d6f1c3ac5f2384f05e40ffdb,
                0x270b,
            ]),
            x3: BN254_Fq::from_limbs([
                0xa9857edae0468e8e4bee7dd33cfb2c,
                0x451060210f3baad93fe1631753751d,
                0x1c6a,
            ]),
            y3: BN254_Fq::from_limbs([
                0x7228881ce73fcc2ad555a37d4ab405,
                0xa64aa86c50d2d1e0237893ef7744a7,
                0x2331,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x8bf76072ce4b44620932512ac987ff,
                0x22bfd988cf9530635ca3ce5c3bc208,
                0x1538,
            ]),
            x3: BN254_Fq::from_limbs([
                0xda50d41b48937039ebdc2fdeeb9ef9,
                0xe46a775b8db969aa6a79cc8ca74339,
                0x1cf2,
            ]),
            y3: BN254_Fq::from_limbs([
                0x7bb40d8791c2d7fe451eb495b5f287,
                0x3cb7ee3a2da69d9edd26ab1c2d8af2,
                0x29b6,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([
                0x2f86578bc0f89888de5579a2c8ad7b,
                0xdc0be7d496a34185a65790683cc759,
                0x29e2,
            ]),
            x3: BN254_Fq::from_limbs([
                0x7816a916871ca8d3c208c16d87cfd3,
                0x44e72e131a029b85045b68181585d9,
                0x0306,
            ]),
            y3: BN254_Fq::from_limbs([
                0xdac647851e3ac53ce1cc9c7e645a83,
                0xdae6d3272396d0cbe61fced2bc532e,
                0x1a76,
            ]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([0x00, 0x00, 0x00]),
            x3: BN254_Fq::from_limbs([0x00, 0x00, 0x00]),
            y3: BN254_Fq::from_limbs([0x00, 0x00, 0x00]),
        },
        AffineTranscript {
            lambda: BN254_Fq::from_limbs([0x00, 0x00, 0x00]),
            x3: BN254_Fq::from_limbs([0x00, 0x00, 0x00]),
            y3: BN254_Fq::from_limbs([0x00, 0x00, 0x00]),
        },
    ]
}
