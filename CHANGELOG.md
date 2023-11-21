# Changelog

## [0.15.1](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.15.0...aztec-packages-v0.15.1) (2023-11-21)


### Features

* **bb:** Add ability to write pk to file or stdout ([#3335](https://github.com/AztecProtocol/aztec-packages/issues/3335)) ([c99862c](https://github.com/AztecProtocol/aztec-packages/commit/c99862c9602d7d37f7fef348e9f014fb137adab1))
* DataBus PoC (UltraHonk as extension of Ultra) ([#3181](https://github.com/AztecProtocol/aztec-packages/issues/3181)) ([dd9dd84](https://github.com/AztecProtocol/aztec-packages/commit/dd9dd84e9cfc93f8605f28aa25fa36b0004052cb))
* Deploy docs from CCI w/ netlify-cli ([#3348](https://github.com/AztecProtocol/aztec-packages/issues/3348)) ([624d733](https://github.com/AztecProtocol/aztec-packages/commit/624d7339d6bd9755156487a07c553b00f92c3b4b))
* Fold batching challenge (alpha) ([#3291](https://github.com/AztecProtocol/aztec-packages/issues/3291)) ([bc99a4f](https://github.com/AztecProtocol/aztec-packages/commit/bc99a4f644824727920b0b4a38ec5ba915d5c0ce))
* Open transcript polys as univariates in ECCVM ([#3331](https://github.com/AztecProtocol/aztec-packages/issues/3331)) ([436b22e](https://github.com/AztecProtocol/aztec-packages/commit/436b22e35bf8a41f78def237889f2afd2ca79830))
* Sandbox packages ([#3360](https://github.com/AztecProtocol/aztec-packages/issues/3360)) ([0dc2d58](https://github.com/AztecProtocol/aztec-packages/commit/0dc2d586c60587f62e50bb7af0862d1a3f828688))
* Slow updates experimentation ([#2732](https://github.com/AztecProtocol/aztec-packages/issues/2732)) ([193e6c8](https://github.com/AztecProtocol/aztec-packages/commit/193e6c8e0afd1646f3b90c30c250fc4c087a4dde))
* ZM updates for Translator concatenated polys ([#3343](https://github.com/AztecProtocol/aztec-packages/issues/3343)) ([0e425db](https://github.com/AztecProtocol/aztec-packages/commit/0e425dbfc99af9fc2598a957acd8b71f3fd45fe9))


### Bug Fixes

* Bootstrap bbjs. ([#3337](https://github.com/AztecProtocol/aztec-packages/issues/3337)) ([06aedcb](https://github.com/AztecProtocol/aztec-packages/commit/06aedcbfd601e243d3486763c1306e20c1ae3688))
* Noir-compiler breadth-first resolver ([#3307](https://github.com/AztecProtocol/aztec-packages/issues/3307)) ([02348cf](https://github.com/AztecProtocol/aztec-packages/commit/02348cf94ff21d585ca43c22be69433af9cd3b98))
* Update command looks at devDeps ([#3276](https://github.com/AztecProtocol/aztec-packages/issues/3276)) ([54ee38d](https://github.com/AztecProtocol/aztec-packages/commit/54ee38d94f904a94cec948b9db9ca833f097d9c1)), closes [#3275](https://github.com/AztecProtocol/aztec-packages/issues/3275)
* Updating pedersen benchmarks ([#3211](https://github.com/AztecProtocol/aztec-packages/issues/3211)) ([7e89ff3](https://github.com/AztecProtocol/aztec-packages/commit/7e89ff363521dd65e0c9f0c098b3bacea33c2764))
* Warn on circular imports. ([#3350](https://github.com/AztecProtocol/aztec-packages/issues/3350)) ([5bfbddb](https://github.com/AztecProtocol/aztec-packages/commit/5bfbddb21bc81dd47698f0c8796d0c8dc0a498e0))


### Miscellaneous

* All hashes in ts ([#3333](https://github.com/AztecProtocol/aztec-packages/issues/3333)) ([6307e12](https://github.com/AztecProtocol/aztec-packages/commit/6307e129770af7791dc5a477859b75ebb112a653))
* Compute function tree root in ts. ([#3326](https://github.com/AztecProtocol/aztec-packages/issues/3326)) ([48d8c7f](https://github.com/AztecProtocol/aztec-packages/commit/48d8c7fd53c11b2d84c8f8e9e137ce0bb0dc3604))
* **docs:** Suggest CLI install per project ([#3267](https://github.com/AztecProtocol/aztec-packages/issues/3267)) ([b4c967b](https://github.com/AztecProtocol/aztec-packages/commit/b4c967bcb222e410030fe6066b32aa1802ddb15b))
* Enforce bracing around blocks. Generally considered easier to read and less error prone. ([#3349](https://github.com/AztecProtocol/aztec-packages/issues/3349)) ([ee11dec](https://github.com/AztecProtocol/aztec-packages/commit/ee11decb8d3ba65d2a74aedf72396b57fccb1db6))
* Fix circulars in foundation. Also cleanup fields and optimise to be buffer underlying. ([#3351](https://github.com/AztecProtocol/aztec-packages/issues/3351)) ([c4bf8d3](https://github.com/AztecProtocol/aztec-packages/commit/c4bf8d371550e27ee8982ec3ea2a6848bd02a46f))
* Public kernel tests ([#3325](https://github.com/AztecProtocol/aztec-packages/issues/3325)) ([bace972](https://github.com/AztecProtocol/aztec-packages/commit/bace9722cbb5903ea28ebc8e32ddfa4cf784e62a))


### Documentation

* Fixed errors in Gas and Fees yellow paper ([#3363](https://github.com/AztecProtocol/aztec-packages/issues/3363)) ([d818206](https://github.com/AztecProtocol/aztec-packages/commit/d818206391801b69fff9ff63d4aeefa1bb3fb72a))
* Initial network section of yellow paper ([#3341](https://github.com/AztecProtocol/aztec-packages/issues/3341)) ([5a18615](https://github.com/AztecProtocol/aztec-packages/commit/5a18615fe68a25adf33f9d158c03cf9d68fbcfc6))
* Yellow paper section on Gas and Fees ([#3327](https://github.com/AztecProtocol/aztec-packages/issues/3327)) ([caa7e10](https://github.com/AztecProtocol/aztec-packages/commit/caa7e10565f2b9177085fca5fc3366ccea5f0d33))

## [0.15.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.14.2...aztec-packages-v0.15.0) (2023-11-16)


### ⚠ BREAKING CHANGES

* Replace computing hashes in circuits wasm, with computing them in ts via bb.js pedersen call. ([#3114](https://github.com/AztecProtocol/aztec-packages/issues/3114))

### Features

* **bb:** Add msan preset ([#3284](https://github.com/AztecProtocol/aztec-packages/issues/3284)) ([bcf025c](https://github.com/AztecProtocol/aztec-packages/commit/bcf025ceef07fb2bf5b07f96e7818425ae59e79a))
* Enable merge and root rollup circuits in noir ([#3248](https://github.com/AztecProtocol/aztec-packages/issues/3248)) ([68555fc](https://github.com/AztecProtocol/aztec-packages/commit/68555fca71746579c7551a78a13b965400d2c865))
* Protogalaxy combiner quotient ([#3245](https://github.com/AztecProtocol/aztec-packages/issues/3245)) ([db0f3ab](https://github.com/AztecProtocol/aztec-packages/commit/db0f3ab9b3d74e0527116a773bf11d26e6bf7736))
* Public kernel in noir  ([#3186](https://github.com/AztecProtocol/aztec-packages/issues/3186)) ([15a522b](https://github.com/AztecProtocol/aztec-packages/commit/15a522ba731820851f1bf505bc2663314e4efc30))
* Ultra honk arith from ultra ([#3274](https://github.com/AztecProtocol/aztec-packages/issues/3274)) ([ec2b805](https://github.com/AztecProtocol/aztec-packages/commit/ec2b805e5b35805e2c5e394ae2b6181865e22aa3))


### Bug Fixes

* Debug build ([#3283](https://github.com/AztecProtocol/aztec-packages/issues/3283)) ([aca2624](https://github.com/AztecProtocol/aztec-packages/commit/aca2624df2d07782f6879d32efc891318b985344))
* Fix block constraint key divergence bug. ([#3256](https://github.com/AztecProtocol/aztec-packages/issues/3256)) ([1c71a0c](https://github.com/AztecProtocol/aztec-packages/commit/1c71a0cf38cf463efe1964126a6a5741c27bd2eb))
* Main.md typo ([#3278](https://github.com/AztecProtocol/aztec-packages/issues/3278)) ([cb87c4d](https://github.com/AztecProtocol/aztec-packages/commit/cb87c4df5e37a689e8ea32a138f794bbe099f884))
* Typo fix roundup ([#3302](https://github.com/AztecProtocol/aztec-packages/issues/3302)) ([9dd778d](https://github.com/AztecProtocol/aztec-packages/commit/9dd778d6856b87107b88e4e8e38d0fc6fc6479fc))


### Miscellaneous

* **bb:** Remove -Wfatal-errors ([#3318](https://github.com/AztecProtocol/aztec-packages/issues/3318)) ([4229173](https://github.com/AztecProtocol/aztec-packages/commit/4229173e7d794ba7800b34dcc8565d7f3ea5525d))
* Clarify that barretenberg mirror should not take PRs ([#3303](https://github.com/AztecProtocol/aztec-packages/issues/3303)) ([13f1a1d](https://github.com/AztecProtocol/aztec-packages/commit/13f1a1d4f8cd12ac8f38e2d1a2c6715f2871f4c8))
* Clean up Plonk widgets ([#3305](https://github.com/AztecProtocol/aztec-packages/issues/3305)) ([4623d91](https://github.com/AztecProtocol/aztec-packages/commit/4623d916d5e8d048cf3c5e06f02d937cf91e6180))
* **docs:** Aztec.nr logging page ([#3281](https://github.com/AztecProtocol/aztec-packages/issues/3281)) ([11e6ca7](https://github.com/AztecProtocol/aztec-packages/commit/11e6ca732c90dc25eceda00f8ac30620a064ebf6))
* **docs:** Update netlify.toml and fix build ([#3304](https://github.com/AztecProtocol/aztec-packages/issues/3304)) ([df76636](https://github.com/AztecProtocol/aztec-packages/commit/df76636293091e2761721eff6f2bdf7243b642e1))
* Explicitly instantiate Goblin translator relations ([#3239](https://github.com/AztecProtocol/aztec-packages/issues/3239)) ([e3b5fb0](https://github.com/AztecProtocol/aztec-packages/commit/e3b5fb0681839bd003804a9e066118dd4693502d))
* Plain struct flavor entities ([#3277](https://github.com/AztecProtocol/aztec-packages/issues/3277)) ([f109512](https://github.com/AztecProtocol/aztec-packages/commit/f1095124af96d2d69522c8677e5e02cd55063c99))
* Remove bn254 instantiation of eccvm plus naming changes ([#3330](https://github.com/AztecProtocol/aztec-packages/issues/3330)) ([23d1e2d](https://github.com/AztecProtocol/aztec-packages/commit/23d1e2d307757c42f6a070afcb22f800fae94555))
* Replace computing hashes in circuits wasm, with computing them in ts via bb.js pedersen call. ([#3114](https://github.com/AztecProtocol/aztec-packages/issues/3114)) ([87eeb71](https://github.com/AztecProtocol/aztec-packages/commit/87eeb715014996ec329de969df85684083b18f83))
* Revert build-debug folder for debug preset ([#3324](https://github.com/AztecProtocol/aztec-packages/issues/3324)) ([43a2e6b](https://github.com/AztecProtocol/aztec-packages/commit/43a2e6b68853d5c22fac4563949c83baf443827c))
* Towards plain struct flavor entities ([#3216](https://github.com/AztecProtocol/aztec-packages/issues/3216)) ([3ba89cf](https://github.com/AztecProtocol/aztec-packages/commit/3ba89cf6fe3821b1149f482ee28c5e0716878b15))
* Typo fixes based on cspell ([#3319](https://github.com/AztecProtocol/aztec-packages/issues/3319)) ([8ae44dd](https://github.com/AztecProtocol/aztec-packages/commit/8ae44dd702987db524ab5e3edd6545881614f56b))

## [0.14.2](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.14.1...aztec-packages-v0.14.2) (2023-11-07)


### Features

* Load private tests and docs ([#3243](https://github.com/AztecProtocol/aztec-packages/issues/3243)) ([f3d8aae](https://github.com/AztecProtocol/aztec-packages/commit/f3d8aae1354f54090c7d61445bf54c3f3d974b09)), closes [#1285](https://github.com/AztecProtocol/aztec-packages/issues/1285)
* Run solidity tests for all acir artifacts ([#3161](https://github.com/AztecProtocol/aztec-packages/issues/3161)) ([d09f667](https://github.com/AztecProtocol/aztec-packages/commit/d09f66748fcbb7739b17940a36806abb72091ee1))


### Bug Fixes

* Wait for accounts to catch up with notes when deployed ([#2834](https://github.com/AztecProtocol/aztec-packages/issues/2834)) ([a8f3119](https://github.com/AztecProtocol/aztec-packages/commit/a8f31199a916f63111212be3973a398ccaf2089d))


### Miscellaneous

* Add noir-protocol-circuits to deploy_npm ([#3268](https://github.com/AztecProtocol/aztec-packages/issues/3268)) ([1a22cae](https://github.com/AztecProtocol/aztec-packages/commit/1a22cae3ffe2b9dc947aba96d631eea4ad403953))
* Aztec-cli better volume mounting strategy ([#3138](https://github.com/AztecProtocol/aztec-packages/issues/3138)) ([d40460e](https://github.com/AztecProtocol/aztec-packages/commit/d40460e261c916f5d4735716215452d5df3c12ea))
* Disable circuits tasks ([#3253](https://github.com/AztecProtocol/aztec-packages/issues/3253)) ([e8945f8](https://github.com/AztecProtocol/aztec-packages/commit/e8945f80260649f30beabdd6195e6e9ef554b36f))

## [0.14.1](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.14.0...aztec-packages-v0.14.1) (2023-11-07)


### Bug Fixes

* Remove aztec.nr version check from noir-compiler ([#3263](https://github.com/AztecProtocol/aztec-packages/issues/3263)) ([e2e4775](https://github.com/AztecProtocol/aztec-packages/commit/e2e477576eabb7006d7c9e74cc363c15306d9fde))

## [0.14.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.13.1...aztec-packages-v0.14.0) (2023-11-07)


### ⚠ BREAKING CHANGES

* make noir_wasm the default compiler ([#3090](https://github.com/AztecProtocol/aztec-packages/issues/3090))
* adding all the (note, nonce) pairs in `PXE.addNote` and hiding `PXE.getNoteNonces` ([#3196](https://github.com/AztecProtocol/aztec-packages/issues/3196))
* API inconsistency fix ([#3190](https://github.com/AztecProtocol/aztec-packages/issues/3190))
* tree leaf value as `Fr` everywhere in our public API ([#3173](https://github.com/AztecProtocol/aztec-packages/issues/3173))

### Features

* Add cli command update aztec dependencies ([#3128](https://github.com/AztecProtocol/aztec-packages/issues/3128)) ([0c05d8b](https://github.com/AztecProtocol/aztec-packages/commit/0c05d8bb5c5b9fc5e8d4490e7b748ea23821d4fd))
* Add root rollup circuit ([#3217](https://github.com/AztecProtocol/aztec-packages/issues/3217)) ([fb4f7af](https://github.com/AztecProtocol/aztec-packages/commit/fb4f7af0b37a9b291e1dd2729f46a3b7a92d208b))
* Adding all the (note, nonce) pairs in `PXE.addNote` and hiding `PXE.getNoteNonces` ([#3196](https://github.com/AztecProtocol/aztec-packages/issues/3196)) ([8c41664](https://github.com/AztecProtocol/aztec-packages/commit/8c41664f3aa1000f08ad36b9bc67dbbd2e8dd71f))
* API inconsistency fix ([#3190](https://github.com/AztecProtocol/aztec-packages/issues/3190)) ([272eda1](https://github.com/AztecProtocol/aztec-packages/commit/272eda153ab0db20969c7f186cc95e7a1bcd3a9b))
* **docs:** Aztec.nr errors in docs ([#3113](https://github.com/AztecProtocol/aztec-packages/issues/3113)) ([fb1e80b](https://github.com/AztecProtocol/aztec-packages/commit/fb1e80b4de9dcc7992d96c6e5e3b0456584fe65b))
* **docs:** New getting started flow  ([#2957](https://github.com/AztecProtocol/aztec-packages/issues/2957)) ([f23f868](https://github.com/AztecProtocol/aztec-packages/commit/f23f8687558f59de2813595342876cd3de3869de))
* Enable pkc in noir ([#3194](https://github.com/AztecProtocol/aztec-packages/issues/3194)) ([1ef892b](https://github.com/AztecProtocol/aztec-packages/commit/1ef892bac3b1ebb56cb78c819288bd7b87fa46ca))
* Extract types to a types crate ([#3203](https://github.com/AztecProtocol/aztec-packages/issues/3203)) ([4161be9](https://github.com/AztecProtocol/aztec-packages/commit/4161be99e46a07cd4b62aed79791e47865271406))
* Gperftools ([#3096](https://github.com/AztecProtocol/aztec-packages/issues/3096)) ([ea2f9a7](https://github.com/AztecProtocol/aztec-packages/commit/ea2f9a72674ae7fd3e810a12026bfc26c693e1c1))
* Initial storage slots docs ([#2842](https://github.com/AztecProtocol/aztec-packages/issues/2842)) ([e8bcd03](https://github.com/AztecProtocol/aztec-packages/commit/e8bcd037c04e822c4894c156ed9450a5e84d8f15))
* Make noir_wasm the default compiler ([#3090](https://github.com/AztecProtocol/aztec-packages/issues/3090)) ([ca52a3e](https://github.com/AztecProtocol/aztec-packages/commit/ca52a3e28d15725f8ca6050a9b3c224a9828df14))
* Migrate cpp private kernel tests to noir ([#3165](https://github.com/AztecProtocol/aztec-packages/issues/3165)) ([daee2f9](https://github.com/AztecProtocol/aztec-packages/commit/daee2f94dbadf02170a595aa6c14e286abbcd8a4))
* More test info in tx receipt ([#3221](https://github.com/AztecProtocol/aztec-packages/issues/3221)) ([a7354dc](https://github.com/AztecProtocol/aztec-packages/commit/a7354dc7e7642b4a4a9ea9ee015242a83ef00cbc)), closes [#3218](https://github.com/AztecProtocol/aztec-packages/issues/3218)
* Tag  artifacts with the compiler version ([#3220](https://github.com/AztecProtocol/aztec-packages/issues/3220)) ([c7490c5](https://github.com/AztecProtocol/aztec-packages/commit/c7490c58639ba70d6273e78f31dba5ad6eaaa654))
* Tree leaf value as `Fr` everywhere in our public API ([#3173](https://github.com/AztecProtocol/aztec-packages/issues/3173)) ([09464ca](https://github.com/AztecProtocol/aztec-packages/commit/09464cacb55ead3e2c5f7c111b0d8af65be7060b))


### Bug Fixes

* Attempt to fix spot request hangs. ([#3241](https://github.com/AztecProtocol/aztec-packages/issues/3241)) ([a062026](https://github.com/AztecProtocol/aztec-packages/commit/a062026db1993cbd1283c8db9fcb6a445a03b302))
* Better update steps for dockerized sandbox ([#3204](https://github.com/AztecProtocol/aztec-packages/issues/3204)) ([3ef0bee](https://github.com/AztecProtocol/aztec-packages/commit/3ef0bee4f09b6512a3a9cc48343deba63ab7fe36))
* Build cli image before releasing ([#3140](https://github.com/AztecProtocol/aztec-packages/issues/3140)) ([09c3b75](https://github.com/AztecProtocol/aztec-packages/commit/09c3b75154e688161c96e4c8bb72aee03a4b3c46))
* Cleanup gen_inner_proof_files.sh script. ([#3242](https://github.com/AztecProtocol/aztec-packages/issues/3242)) ([ee57e00](https://github.com/AztecProtocol/aztec-packages/commit/ee57e00da06a2daea571cac579a5f6ef9e039d5e))
* Corrects typo in repo readme ([#3236](https://github.com/AztecProtocol/aztec-packages/issues/3236)) ([0ed8c79](https://github.com/AztecProtocol/aztec-packages/commit/0ed8c79677c3679e19e7d90317b7bd3e12c4248f))
* Remove noirup from noir-contract's bootstrap ([#3252](https://github.com/AztecProtocol/aztec-packages/issues/3252)) ([d10342e](https://github.com/AztecProtocol/aztec-packages/commit/d10342eb6c7a04d40254a12418448c3cbf5a800d))
* Remove unused import ([#3200](https://github.com/AztecProtocol/aztec-packages/issues/3200)) ([520bba4](https://github.com/AztecProtocol/aztec-packages/commit/520bba4f163224adfd4ddcbc9cdadde752704b61))
* Temporary fix for bb prove w/ ram rom blocks ([#3215](https://github.com/AztecProtocol/aztec-packages/issues/3215)) ([af93a33](https://github.com/AztecProtocol/aztec-packages/commit/af93a33fdd5d73648d31b4e4f7347d29b8892405))
* Update noir-contracts path to types ([#3247](https://github.com/AztecProtocol/aztec-packages/issues/3247)) ([c5fc95d](https://github.com/AztecProtocol/aztec-packages/commit/c5fc95df4b111b15a74d97f2513746e0d29c02b9))
* Wasm-compiler `bin` package type ([#3254](https://github.com/AztecProtocol/aztec-packages/issues/3254)) ([2d50f11](https://github.com/AztecProtocol/aztec-packages/commit/2d50f11db873bc814a7caf4e0bce6d5694df7132))
* Yarn prepare ([#3251](https://github.com/AztecProtocol/aztec-packages/issues/3251)) ([d02726f](https://github.com/AztecProtocol/aztec-packages/commit/d02726fd412edab0c3fbc90e851513054d040f23))


### Miscellaneous

* Add initial skeleton code for root/merge/mase rollups for Noir ([#3178](https://github.com/AztecProtocol/aztec-packages/issues/3178)) ([7b0d076](https://github.com/AztecProtocol/aztec-packages/commit/7b0d07672cbe107d089bb7cb7c02fd6703d4b42d))
* Bump noir ([#3197](https://github.com/AztecProtocol/aztec-packages/issues/3197)) ([aa2042d](https://github.com/AztecProtocol/aztec-packages/commit/aa2042d3844844e68c111e330c2abf204db83f59))
* Clean up and refactor arithmetization ([#3164](https://github.com/AztecProtocol/aztec-packages/issues/3164)) ([0370b13](https://github.com/AztecProtocol/aztec-packages/commit/0370b135c723458852894363383bbe9275eb0e56))
* Continuation of note naming update ([#3137](https://github.com/AztecProtocol/aztec-packages/issues/3137)) ([582150f](https://github.com/AztecProtocol/aztec-packages/commit/582150f92fc0b5cf3114a07bd5761add5fbfdca4))
* Disable canary. ([#3244](https://github.com/AztecProtocol/aztec-packages/issues/3244)) ([1a56173](https://github.com/AztecProtocol/aztec-packages/commit/1a5617351bee036c8c01ded61fb994782cc6e240))
* Docs: fix broken link in functions.md ([#3183](https://github.com/AztecProtocol/aztec-packages/issues/3183)) ([fb53f7a](https://github.com/AztecProtocol/aztec-packages/commit/fb53f7a2ec6ca3e253fe909d180e758571dd2bfb))
* **docs:** Fix docs build ([#3249](https://github.com/AztecProtocol/aztec-packages/issues/3249)) ([ec2c0cf](https://github.com/AztecProtocol/aztec-packages/commit/ec2c0cff7d05a315b9b7d758329a0675f0489b34))
* Fix typo in aztec sandbox ([#3191](https://github.com/AztecProtocol/aztec-packages/issues/3191)) ([ed144b1](https://github.com/AztecProtocol/aztec-packages/commit/ed144b1942e040a685621db341f11f87eae9ca6c))
* More boiler plate code for merge rollup ([#3182](https://github.com/AztecProtocol/aztec-packages/issues/3182)) ([ffafcef](https://github.com/AztecProtocol/aztec-packages/commit/ffafcefa726c8b4340650b3c3230a0ee83599e93))
* Move flavors ([#3188](https://github.com/AztecProtocol/aztec-packages/issues/3188)) ([f1ff849](https://github.com/AztecProtocol/aztec-packages/commit/f1ff849d90b3914bf8c24bf54ded8d98b7ffa961))
* Move honk/pcs ([#3187](https://github.com/AztecProtocol/aztec-packages/issues/3187)) ([3870ff8](https://github.com/AztecProtocol/aztec-packages/commit/3870ff8f829c29556d633693875cf30ce8d724eb))
* Move log deriv lookup accum to library ([#3226](https://github.com/AztecProtocol/aztec-packages/issues/3226)) ([189d1bb](https://github.com/AztecProtocol/aztec-packages/commit/189d1bbd6691d0237d69acb012238e97589ee257))
* Move sumcheck ([#3189](https://github.com/AztecProtocol/aztec-packages/issues/3189)) ([410cae3](https://github.com/AztecProtocol/aztec-packages/commit/410cae39aba1387571308567a8022cc51b6d25d1))
* Move transcripts ([#3176](https://github.com/AztecProtocol/aztec-packages/issues/3176)) ([7372d19](https://github.com/AztecProtocol/aztec-packages/commit/7372d19f64737eabfa917f7368a5bf99068f48d5))
* Noir circuit tests ([#3229](https://github.com/AztecProtocol/aztec-packages/issues/3229)) ([dbfb086](https://github.com/AztecProtocol/aztec-packages/commit/dbfb0862a26944e240c84406c7d856c022b25f47))
* Private kernel circuits ([#3240](https://github.com/AztecProtocol/aztec-packages/issues/3240)) ([b7fbe19](https://github.com/AztecProtocol/aztec-packages/commit/b7fbe19a04a1097df7597ac8a32996994840f57c))
* Prune 0 values from L2Tx ([#3224](https://github.com/AztecProtocol/aztec-packages/issues/3224)) ([2de206d](https://github.com/AztecProtocol/aztec-packages/commit/2de206d7959078f5289441e35788d83661a2c9f6))
* Refactor e2e to not use @aztec/types ([#3175](https://github.com/AztecProtocol/aztec-packages/issues/3175)) ([006a07a](https://github.com/AztecProtocol/aztec-packages/commit/006a07a1dd89e4e4e792d7a3e8332351f8b32351)), closes [#3157](https://github.com/AztecProtocol/aztec-packages/issues/3157)
* Remove extra println in noir protoco circuit ([#3219](https://github.com/AztecProtocol/aztec-packages/issues/3219)) ([3295fdd](https://github.com/AztecProtocol/aztec-packages/commit/3295fdd99d92b215f2cbc2707980a7055557cb2a))
* Split out relations, PG, Honk variants ([#3238](https://github.com/AztecProtocol/aztec-packages/issues/3238)) ([8abd39f](https://github.com/AztecProtocol/aztec-packages/commit/8abd39f5f8a434d96fe259df9c5940787bd705f1))
* Update Noir version ([#3082](https://github.com/AztecProtocol/aztec-packages/issues/3082)) ([59eb6af](https://github.com/AztecProtocol/aztec-packages/commit/59eb6af2da9801fb6927f4b98615b2c3f8f3ec28))


### Documentation

* Fix bad shareable key crypto. better explanations ([#3228](https://github.com/AztecProtocol/aztec-packages/issues/3228)) ([e4a0c4a](https://github.com/AztecProtocol/aztec-packages/commit/e4a0c4ac04c6d50cee8742b025dc9f58e2fcac19))
* Fix in nullifier secrets doc ([#3167](https://github.com/AztecProtocol/aztec-packages/issues/3167)) ([8c70845](https://github.com/AztecProtocol/aztec-packages/commit/8c708450002b41f6fcd54c96aa2f91fb2e427978))
* Move Updating.md file, add aztec tag to nargo update instruction ([#3213](https://github.com/AztecProtocol/aztec-packages/issues/3213)) ([9f71c5d](https://github.com/AztecProtocol/aztec-packages/commit/9f71c5d79df8e8fadf3829b65b8d45fe3445b803))
* Update docs ([#3223](https://github.com/AztecProtocol/aztec-packages/issues/3223)) ([7977064](https://github.com/AztecProtocol/aztec-packages/commit/7977064106e49869888e4684f133ae024d7c3a13))
* Update storage doc ([#3212](https://github.com/AztecProtocol/aztec-packages/issues/3212)) ([d707d4e](https://github.com/AztecProtocol/aztec-packages/commit/d707d4e3fa85bb52c80a10582f2607850e05fc68))
* Updated stale tree docs ([#3166](https://github.com/AztecProtocol/aztec-packages/issues/3166)) ([3d5c98c](https://github.com/AztecProtocol/aztec-packages/commit/3d5c98c3eeb76103c331bfcbefc4127ae39836c7))

## [0.13.1](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.13.0...aztec-packages-v0.13.1) (2023-10-31)


### Bug Fixes

* Exposing `PXE.getBlock`, exporting `createAztecNodeClient` from `aztec.js` ([#3139](https://github.com/AztecProtocol/aztec-packages/issues/3139)) ([7af345e](https://github.com/AztecProtocol/aztec-packages/commit/7af345e9e96c81a05447a514dc7d27d113ba0948))
* Revert push cli docker image to docker hub ([#3142](https://github.com/AztecProtocol/aztec-packages/issues/3142)) ([7119382](https://github.com/AztecProtocol/aztec-packages/commit/7119382b4646b4bfe6fc43ba217dc62e2f089cd4))

## [0.13.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.12.0...aztec-packages-v0.13.0) (2023-10-31)


### ⚠ BREAKING CHANGES

* PXE.getNotes(...) + refactor of note types ([#3051](https://github.com/AztecProtocol/aztec-packages/issues/3051))

### Features

* `FieldNote` ([#3037](https://github.com/AztecProtocol/aztec-packages/issues/3037)) ([3d1ffd0](https://github.com/AztecProtocol/aztec-packages/commit/3d1ffd08938240405af7f02c12236486e0e9e0ba))
* Add Aztec Boxes page to docs ([#2569](https://github.com/AztecProtocol/aztec-packages/issues/2569)) ([997c15c](https://github.com/AztecProtocol/aztec-packages/commit/997c15c9438d629b9f1e9435b8ceaeb54264b092))
* Adding structure to Transcript ([#2937](https://github.com/AztecProtocol/aztec-packages/issues/2937)) ([db67aa1](https://github.com/AztecProtocol/aztec-packages/commit/db67aa1eb6ae9669d98301efbbb146d6265d58f4))
* Compile noir contracts with noir_wasm ([#2737](https://github.com/AztecProtocol/aztec-packages/issues/2737)) ([524cecf](https://github.com/AztecProtocol/aztec-packages/commit/524cecf40a6148515d92b193024d2ce587e3e5a8))
* Dockerize aztec-cli ([#3031](https://github.com/AztecProtocol/aztec-packages/issues/3031)) ([ec2e3c2](https://github.com/AztecProtocol/aztec-packages/commit/ec2e3c22d307d9c3c265cc97b0e5359e94669acc))
* Efficient ZM quotient computation ([#3016](https://github.com/AztecProtocol/aztec-packages/issues/3016)) ([ebda5fc](https://github.com/AztecProtocol/aztec-packages/commit/ebda5fcbc7321cb3f91b0c7a742b7cbd88a15179))
* **feature_branch:** Private Kernel Circuit ([#2740](https://github.com/AztecProtocol/aztec-packages/issues/2740)) ([f800a36](https://github.com/AztecProtocol/aztec-packages/commit/f800a36d351a18c1c06ee1acff90c6002a699a92))
* Measure plonk rounds ([#3065](https://github.com/AztecProtocol/aztec-packages/issues/3065)) ([c8e1d8b](https://github.com/AztecProtocol/aztec-packages/commit/c8e1d8b9244c3955f0fea6a34a3cc28a81a29d2c))
* Migrate the init kernel CPP tests to noir ([#3091](https://github.com/AztecProtocol/aztec-packages/issues/3091)) ([906429f](https://github.com/AztecProtocol/aztec-packages/commit/906429fa42628b1ccfc79f9d269301b3af133174))
* New script to output table of benchmarks for README pasting. ([#2780](https://github.com/AztecProtocol/aztec-packages/issues/2780)) ([6c20b45](https://github.com/AztecProtocol/aztec-packages/commit/6c20b45993ee9cbd319ab8351e2722e0c912f427))
* Pedersen in typescript. ([#3111](https://github.com/AztecProtocol/aztec-packages/issues/3111)) ([933f1b2](https://github.com/AztecProtocol/aztec-packages/commit/933f1b2c24a3a4bdaafd31e1158ba702ee9874c9))
* Protogalaxy folding of challenges ([#2935](https://github.com/AztecProtocol/aztec-packages/issues/2935)) ([7ed30e8](https://github.com/AztecProtocol/aztec-packages/commit/7ed30e83d2bea8399b7acd477c4dfc739417f96d))
* PXE.getNotes(...) + refactor of note types ([#3051](https://github.com/AztecProtocol/aztec-packages/issues/3051)) ([16abb5a](https://github.com/AztecProtocol/aztec-packages/commit/16abb5ae2e48ed7fcfe3dd2fbf9a111620f30b53))
* Zeromorph with concatenation (Goblin Translator part 10) ([#3006](https://github.com/AztecProtocol/aztec-packages/issues/3006)) ([70b0f17](https://github.com/AztecProtocol/aztec-packages/commit/70b0f17101f3b378df3e9a0247230b9ebf67239a))


### Bug Fixes

* Bad contract txs publishing contract data ([#2673](https://github.com/AztecProtocol/aztec-packages/issues/2673)) ([ccd4611](https://github.com/AztecProtocol/aztec-packages/commit/ccd4611be86c0d73e50c755739afa06dd123c809))
* Better error message for compute_note_hash_and_nullifier. ([#3097](https://github.com/AztecProtocol/aztec-packages/issues/3097)) ([57bec53](https://github.com/AztecProtocol/aztec-packages/commit/57bec53bd5960f5c2b8e78d944c2efd6d0722254))
* Broken `FieldNote` test ([#3135](https://github.com/AztecProtocol/aztec-packages/issues/3135)) ([fe78ecf](https://github.com/AztecProtocol/aztec-packages/commit/fe78ecf7eef1f4b6f92b792dab5aa3bc3dffa322))
* Docker-compose up, rather than run. ([#3081](https://github.com/AztecProtocol/aztec-packages/issues/3081)) ([242f780](https://github.com/AztecProtocol/aztec-packages/commit/242f7806a21a8706779545df15b40f33a7745695))
* Formatting ([#3070](https://github.com/AztecProtocol/aztec-packages/issues/3070)) ([e1633d3](https://github.com/AztecProtocol/aztec-packages/commit/e1633d349a00bd9bdc2bcd2bbcc820c4d26e9928))
* Minor stale naming fix ([#3117](https://github.com/AztecProtocol/aztec-packages/issues/3117)) ([a6786ae](https://github.com/AztecProtocol/aztec-packages/commit/a6786ae615071cfe5a74ca4fcec55ce1e735a902))
* Push cli docker image to docker hub ([#3120](https://github.com/AztecProtocol/aztec-packages/issues/3120)) ([ccad50f](https://github.com/AztecProtocol/aztec-packages/commit/ccad50f0c8761be7298a72770972b75895f5618b))
* Remove duplicate terraform resource definition ([#3066](https://github.com/AztecProtocol/aztec-packages/issues/3066)) ([d5abadb](https://github.com/AztecProtocol/aztec-packages/commit/d5abadb34f843d6f0e5831e905d1241d14df6237))
* Retry request spot ([#3116](https://github.com/AztecProtocol/aztec-packages/issues/3116)) ([82de5f1](https://github.com/AztecProtocol/aztec-packages/commit/82de5f1075e05cf92072e083d92f28feaba80c0a))


### Miscellaneous

* Add stdlib tests for pedersen commitment ([#3075](https://github.com/AztecProtocol/aztec-packages/issues/3075)) ([87fa621](https://github.com/AztecProtocol/aztec-packages/commit/87fa621347e55f82e36c70515c1824161eee5282))
* Automatic c_binds for commit should return a point instead of an Fr element ([#3072](https://github.com/AztecProtocol/aztec-packages/issues/3072)) ([2e289a5](https://github.com/AztecProtocol/aztec-packages/commit/2e289a5d11d28496ac47220bede03268065e0cb7))
* Cleanup remaining mentions of `compress` with pedersen in cpp and ts ([#3074](https://github.com/AztecProtocol/aztec-packages/issues/3074)) ([52cf383](https://github.com/AztecProtocol/aztec-packages/commit/52cf3831794a6ab497c9a40f85859f4cc8ac4700))
* E2e on spots [ci rebuild] ([#3068](https://github.com/AztecProtocol/aztec-packages/issues/3068)) ([15db6bf](https://github.com/AztecProtocol/aztec-packages/commit/15db6bf32a7c2c1f109392761cd2a16b51115ac9))
* Fix dapp_testing e2e race condition ([#3094](https://github.com/AztecProtocol/aztec-packages/issues/3094)) ([89e7c21](https://github.com/AztecProtocol/aztec-packages/commit/89e7c2172ee0db4929a9d2d64a570dae250f85da))
* Remove docs mirror ([#3122](https://github.com/AztecProtocol/aztec-packages/issues/3122)) ([3fa51e2](https://github.com/AztecProtocol/aztec-packages/commit/3fa51e28b480513887b18d0bf6538c178f4d9681))
* Remove endomorphism coefficient from ecc_add_gate ([#3115](https://github.com/AztecProtocol/aztec-packages/issues/3115)) ([d294987](https://github.com/AztecProtocol/aztec-packages/commit/d294987ad25fb69d2934dfade2bf7063ff64bef2))
* Remove unecessary calls to `pedersen__init` ([#3079](https://github.com/AztecProtocol/aztec-packages/issues/3079)) ([84f8db2](https://github.com/AztecProtocol/aztec-packages/commit/84f8db20f482242ac29a23eb4c8876f14f060b4c))
* Remove unused pedersen c_binds ([#3058](https://github.com/AztecProtocol/aztec-packages/issues/3058)) ([e71e5f9](https://github.com/AztecProtocol/aztec-packages/commit/e71e5f94ba920208e7cc9b2b1b9d62678b699812))
* Removes pedersen commit native pairs method ([#3073](https://github.com/AztecProtocol/aztec-packages/issues/3073)) ([69a34c7](https://github.com/AztecProtocol/aztec-packages/commit/69a34c72c9dccbd54072553ed1ecf0460b16db69))
* Rename private-kernel subpackage to protocol-circuits ([#3134](https://github.com/AztecProtocol/aztec-packages/issues/3134)) ([3e07104](https://github.com/AztecProtocol/aztec-packages/commit/3e071046d7b0f280cc3b5c426399902425aa1039))


### Documentation

* Initial keys spec ([#3035](https://github.com/AztecProtocol/aztec-packages/issues/3035)) ([4b24c58](https://github.com/AztecProtocol/aztec-packages/commit/4b24c580b8770a5926209ca4e29a4cf0644bb383))

## [0.12.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.11.1...aztec-packages-v0.12.0) (2023-10-26)


### ⚠ BREAKING CHANGES

* remove plookup pedersen methods from c_bind namespace ([#3033](https://github.com/AztecProtocol/aztec-packages/issues/3033))

### Features

* Add function selector to cli to make it easier for to call functions ([#3053](https://github.com/AztecProtocol/aztec-packages/issues/3053)) ([e0f0a8e](https://github.com/AztecProtocol/aztec-packages/commit/e0f0a8e4558a42a17d183515d5f2912d0cf8723c)), closes [#1996](https://github.com/AztecProtocol/aztec-packages/issues/1996)
* Added correctness tests for several small relations in Goblin Translator (Goblin Translator part 8) ([#2963](https://github.com/AztecProtocol/aztec-packages/issues/2963)) ([4c83250](https://github.com/AztecProtocol/aztec-packages/commit/4c8325093e7d76158a767dcf2854f1cfd274c5ff))
* AWS mainnet fork ([#2986](https://github.com/AztecProtocol/aztec-packages/issues/2986)) ([f491362](https://github.com/AztecProtocol/aztec-packages/commit/f491362329071983e5b16c3e7caa79342f2e93fa))
* Correctness tests for decomposition and non-native field relations (Goblin Translator Part 9) ([#2981](https://github.com/AztecProtocol/aztec-packages/issues/2981)) ([cdc830d](https://github.com/AztecProtocol/aztec-packages/commit/cdc830dd8731d9f8fed85bb46b3ed6771796f526))
* Enable sol verifier tests in ci ([#2997](https://github.com/AztecProtocol/aztec-packages/issues/2997)) ([058de1e](https://github.com/AztecProtocol/aztec-packages/commit/058de1ea92b1c19f76867b93769d8de4bb9a6f55))
* Goblin Translator flavor and permutation correctness (Goblin Translator part 7) ([#2961](https://github.com/AztecProtocol/aztec-packages/issues/2961)) ([737f17f](https://github.com/AztecProtocol/aztec-packages/commit/737f17fdff5a213dd1424c4e668bce41b95b349a))
* Linking errors ([#3004](https://github.com/AztecProtocol/aztec-packages/issues/3004)) ([388a47b](https://github.com/AztecProtocol/aztec-packages/commit/388a47ba402fac0a4b9832845d8b964e28aadb85)), closes [#2969](https://github.com/AztecProtocol/aztec-packages/issues/2969)


### Bug Fixes

* Fix clang-16 check ([#3030](https://github.com/AztecProtocol/aztec-packages/issues/3030)) ([7a5a8b3](https://github.com/AztecProtocol/aztec-packages/commit/7a5a8b3b79c18b45aa29eacc05e9bfb26090cc95))
* Fix docusaurus yellow paper build ([#3063](https://github.com/AztecProtocol/aztec-packages/issues/3063)) ([db54c1f](https://github.com/AztecProtocol/aztec-packages/commit/db54c1f1efc037e9cc73053a5832b764247c3bf5))
* Run deploy step for mainnet fork ([#3052](https://github.com/AztecProtocol/aztec-packages/issues/3052)) ([9b6be22](https://github.com/AztecProtocol/aztec-packages/commit/9b6be227169c9ee923744601ff3072b134e12f41))
* Try fix publish bb ([#3036](https://github.com/AztecProtocol/aztec-packages/issues/3036)) ([51248b5](https://github.com/AztecProtocol/aztec-packages/commit/51248b5af22a8d87b4d87a23444ccea5a3c3a982))
* Unboxing - nargo.toml injection of "-" for "_" ([#3018](https://github.com/AztecProtocol/aztec-packages/issues/3018)) ([83d6c51](https://github.com/AztecProtocol/aztec-packages/commit/83d6c511d3e717202e2eb665579bc70e53fd5370))


### Miscellaneous

* **acir_tests:** Add script to regenerate double_verify_proof inputs ([#3005](https://github.com/AztecProtocol/aztec-packages/issues/3005)) ([9c4eab2](https://github.com/AztecProtocol/aztec-packages/commit/9c4eab27d6a8a774d49f40ccea92faf305caf500))
* Add portal contract option to deploy subcommand of aztec-cli ([#3032](https://github.com/AztecProtocol/aztec-packages/issues/3032)) ([546b410](https://github.com/AztecProtocol/aztec-packages/commit/546b41045ee021239a8d7656c6703eab688f1a0d))
* Fix `pedersen_compress_with_hash_index` c_bind function ([#3054](https://github.com/AztecProtocol/aztec-packages/issues/3054)) ([a136f6e](https://github.com/AztecProtocol/aztec-packages/commit/a136f6e70725500739b518e1bfc96b680c3cb1b2))
* Msg sender is 0 when no entrypoint is called ([#3024](https://github.com/AztecProtocol/aztec-packages/issues/3024)) ([53c6680](https://github.com/AztecProtocol/aztec-packages/commit/53c6680a28672e2fbeea54e24b05abc3a9dc3fd1)), closes [#2949](https://github.com/AztecProtocol/aztec-packages/issues/2949)
* Optimize pedersen hash for the common usecase by not allocating when input fits in scratch space ([#3056](https://github.com/AztecProtocol/aztec-packages/issues/3056)) ([a0d290d](https://github.com/AztecProtocol/aztec-packages/commit/a0d290d3bab6c42809d57d86b5cd5e3948e35abd))
* Proxy redundant `hash` methods ([#3046](https://github.com/AztecProtocol/aztec-packages/issues/3046)) ([df389b5](https://github.com/AztecProtocol/aztec-packages/commit/df389b5f593a202bc644479a6c3dff884b7d3652))
* Remove "non-core artifact" nargo generated files ([#3026](https://github.com/AztecProtocol/aztec-packages/issues/3026)) ([03ebb8e](https://github.com/AztecProtocol/aztec-packages/commit/03ebb8e1d243507b4056b748af7c093f131eaf4d)), closes [#2977](https://github.com/AztecProtocol/aztec-packages/issues/2977)
* Remove `pedersen_buffer_to_field` from c_bind ([#3045](https://github.com/AztecProtocol/aztec-packages/issues/3045)) ([de7e63b](https://github.com/AztecProtocol/aztec-packages/commit/de7e63bf7e1184333c1eaadf2387fef6bf163871))
* Remove pedersen hash oracle ([#3023](https://github.com/AztecProtocol/aztec-packages/issues/3023)) ([0e6958c](https://github.com/AztecProtocol/aztec-packages/commit/0e6958c94e6d00d4132f08baa2cd63141ff8aae7))
* Remove plookup pedersen methods from c_bind namespace ([#3033](https://github.com/AztecProtocol/aztec-packages/issues/3033)) ([a8ea391](https://github.com/AztecProtocol/aztec-packages/commit/a8ea391c95a9fe4fa26a3fa987f52114a40c664a))
* Rename pedersen typescript methods to be called `hash` instead of compress ([#3047](https://github.com/AztecProtocol/aztec-packages/issues/3047)) ([2f7cc5f](https://github.com/AztecProtocol/aztec-packages/commit/2f7cc5fd3242b04fa996b71dbd7282444e82e903))
* Run check rebuild on boxes ([#3000](https://github.com/AztecProtocol/aztec-packages/issues/3000)) ([c503d91](https://github.com/AztecProtocol/aztec-packages/commit/c503d91aba42dc87acd50e9986a32bc93707fbc1))
* Same prettier in boxes and everywhere else ([#3025](https://github.com/AztecProtocol/aztec-packages/issues/3025)) ([0769d20](https://github.com/AztecProtocol/aztec-packages/commit/0769d2077bcc1f31ba36de2f8a9576427036cbed)), closes [#2978](https://github.com/AztecProtocol/aztec-packages/issues/2978)

## [0.11.1](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.11.0...aztec-packages-v0.11.1) (2023-10-24)


### Features

* ProverPlookupAuxiliaryWidget kernel bench ([#2924](https://github.com/AztecProtocol/aztec-packages/issues/2924)) ([faffc39](https://github.com/AztecProtocol/aztec-packages/commit/faffc39a379c9f215978e4867c3d24dbc638f0b4))


### Bug Fixes

* **ci:** Publish-bb, use clang 16.04 ([#3019](https://github.com/AztecProtocol/aztec-packages/issues/3019)) ([703a964](https://github.com/AztecProtocol/aztec-packages/commit/703a9646a18bf7a9817d4aa6f3fb185c912a6fe7))

## [0.11.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.10.1...aztec-packages-v0.11.0) (2023-10-24)


### ⚠ BREAKING CHANGES

* consistent `deploy` method params ([#2975](https://github.com/AztecProtocol/aztec-packages/issues/2975))

### Features

* Consistent `deploy` method params ([#2975](https://github.com/AztecProtocol/aztec-packages/issues/2975)) ([c50aefb](https://github.com/AztecProtocol/aztec-packages/commit/c50aefb63966e8ec3ae65d051d0b47b13de1d330))
* Pedersen hash in acir format ([#2990](https://github.com/AztecProtocol/aztec-packages/issues/2990)) ([2a4c548](https://github.com/AztecProtocol/aztec-packages/commit/2a4c548bc816a5f379ee841e26bb30411deef56b))


### Bug Fixes

* TokenBox ([#3003](https://github.com/AztecProtocol/aztec-packages/issues/3003)) ([1ad6647](https://github.com/AztecProtocol/aztec-packages/commit/1ad6647ac5ad3a13b52eb78db64d13d941d9718d))


### Miscellaneous

* Update acir_tests reference branch ([#2993](https://github.com/AztecProtocol/aztec-packages/issues/2993)) ([91813a5](https://github.com/AztecProtocol/aztec-packages/commit/91813a55b8503c279ccd38b1d83463b97b86d064))

## [0.10.1](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.10.0...aztec-packages-v0.10.1) (2023-10-24)


### Features

* Change nullifier tree height to 20 ([#2988](https://github.com/AztecProtocol/aztec-packages/issues/2988)) ([118f9d5](https://github.com/AztecProtocol/aztec-packages/commit/118f9d5eaf1b4339a7e3758d77dffc0b26735fad))


### Bug Fixes

* Aztec-sandbox docker-compose directory ([#2989](https://github.com/AztecProtocol/aztec-packages/issues/2989)) ([a9678d1](https://github.com/AztecProtocol/aztec-packages/commit/a9678d184f680306e5670a3f1b44047ea573d2b1))

## [0.10.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.9.0...aztec-packages-v0.10.0) (2023-10-24)


### ⚠ BREAKING CHANGES

* Emitting encrypted log by default ([#2926](https://github.com/AztecProtocol/aztec-packages/issues/2926))

### Features

* Added register-account command to cli ([#2980](https://github.com/AztecProtocol/aztec-packages/issues/2980)) ([0977a90](https://github.com/AztecProtocol/aztec-packages/commit/0977a90ca3bd8258bfbfb65e7bda92dd1cc7688e))
* **docs:** Fix portals tutorial formatting ([#2929](https://github.com/AztecProtocol/aztec-packages/issues/2929)) ([ab19b67](https://github.com/AztecProtocol/aztec-packages/commit/ab19b671ad5bcbeedc34550bdfdba4cb63bb32ad))
* Emitting encrypted log by default ([#2926](https://github.com/AztecProtocol/aztec-packages/issues/2926)) ([1ea2d4f](https://github.com/AztecProtocol/aztec-packages/commit/1ea2d4fd329b82cb69861431635d699596311a82)), closes [#2912](https://github.com/AztecProtocol/aztec-packages/issues/2912)
* Goblin translator non-native field relation (Goblin Translator part 6) ([#2871](https://github.com/AztecProtocol/aztec-packages/issues/2871)) ([c4d8d96](https://github.com/AztecProtocol/aztec-packages/commit/c4d8d963171cf936242e04639154fccc86a0942f))
* Honk profiling by pass, tsan preset ([#2982](https://github.com/AztecProtocol/aztec-packages/issues/2982)) ([a1592fd](https://github.com/AztecProtocol/aztec-packages/commit/a1592fdcde661e09826852fc28bb4aa4c5521863))
* Incorporate docs feedback and add "intermediate" level intros to some pages ([#2598](https://github.com/AztecProtocol/aztec-packages/issues/2598)) ([78f9f52](https://github.com/AztecProtocol/aztec-packages/commit/78f9f52af70ad630ce4ade8348a0766b0c1476ad))
* Nuking `Pokeable` contract ([#2939](https://github.com/AztecProtocol/aztec-packages/issues/2939)) ([583d6fb](https://github.com/AztecProtocol/aztec-packages/commit/583d6fbcdb44a2ffd5175c8bf6d87a87c5f4fa21))
* Protogalaxy Combiner ([#2436](https://github.com/AztecProtocol/aztec-packages/issues/2436)) ([a60c70d](https://github.com/AztecProtocol/aztec-packages/commit/a60c70dca1d920ad88511f77be3ad186afab7bdb))
* Protogalaxy perturbator! ([#2624](https://github.com/AztecProtocol/aztec-packages/issues/2624)) ([509dee6](https://github.com/AztecProtocol/aztec-packages/commit/509dee6108781f3dcd09b3c111be59f42798cac0))
* Refactor pedersen hash standard ([#2592](https://github.com/AztecProtocol/aztec-packages/issues/2592)) ([3085676](https://github.com/AztecProtocol/aztec-packages/commit/3085676dd8a68ac43abc3e5c7843ff437df91d7d))
* Widget benchmarking ([#2897](https://github.com/AztecProtocol/aztec-packages/issues/2897)) ([0e927e9](https://github.com/AztecProtocol/aztec-packages/commit/0e927e9233d7418b9fba4a0142f606e2f92a1f40))


### Bug Fixes

* Add @jest/types to box deps ([#2903](https://github.com/AztecProtocol/aztec-packages/issues/2903)) ([db3fa62](https://github.com/AztecProtocol/aztec-packages/commit/db3fa62e45ce21880c4bead293758c2efe70d4ba))
* Add lint rule for focused tests ([#2901](https://github.com/AztecProtocol/aztec-packages/issues/2901)) ([fd1a1a8](https://github.com/AztecProtocol/aztec-packages/commit/fd1a1a86f21986f16344d2dbd6296a28088a1188))
* Avoid tsc OOM by unignoring an old contract artifact ([#2932](https://github.com/AztecProtocol/aztec-packages/issues/2932)) ([7310600](https://github.com/AztecProtocol/aztec-packages/commit/73106008f464328935997028ca18698965b579a5))
* Bad it.only in tests ([#2900](https://github.com/AztecProtocol/aztec-packages/issues/2900)) ([a1f3af1](https://github.com/AztecProtocol/aztec-packages/commit/a1f3af152aaa37bca105f90581b032fb16f1f9d0))
* Boxes boostrap dont use ts-node directly and add .prettierignore ([#2890](https://github.com/AztecProtocol/aztec-packages/issues/2890)) ([a3b1804](https://github.com/AztecProtocol/aztec-packages/commit/a3b18048479ee3bed3931615e5eabd27efacd404))
* Confusing "Unknown complete address" error ([#2967](https://github.com/AztecProtocol/aztec-packages/issues/2967)) ([3a8f54a](https://github.com/AztecProtocol/aztec-packages/commit/3a8f54a8330620669380cbd1b06551aa10703ec3))
* Force jest to quit, otherwise CI can rack up to 3hrs of credits per job. ([#2899](https://github.com/AztecProtocol/aztec-packages/issues/2899)) ([ba2f671](https://github.com/AztecProtocol/aztec-packages/commit/ba2f671c79ac3c2aa19c769c3db56a27a7e0854f))
* Honk sumcheck performance ([#2925](https://github.com/AztecProtocol/aztec-packages/issues/2925)) ([5fbfe6e](https://github.com/AztecProtocol/aztec-packages/commit/5fbfe6eeccdb23f734fb36f30d1e33340f9fb07a))
* Pending commitments contract using the wrong number of arguments ([#2959](https://github.com/AztecProtocol/aztec-packages/issues/2959)) ([655c322](https://github.com/AztecProtocol/aztec-packages/commit/655c322ab0e71074b3f747c95bfafbd6b7008217))
* Prettierignore in boxes ([#2902](https://github.com/AztecProtocol/aztec-packages/issues/2902)) ([8f7a200](https://github.com/AztecProtocol/aztec-packages/commit/8f7a200e809a9dc6ac8e1beaf3bbf1fd83e5a1fb))
* Randomness in `AddressNote` ([#2965](https://github.com/AztecProtocol/aztec-packages/issues/2965)) ([4dc49a9](https://github.com/AztecProtocol/aztec-packages/commit/4dc49a92428216928d918d893c40745957e5b983))
* Yarn lock ([#2923](https://github.com/AztecProtocol/aztec-packages/issues/2923)) ([7042bc6](https://github.com/AztecProtocol/aztec-packages/commit/7042bc6130f8473b6c59bf9a0146ea8b2c3c7483))


### Miscellaneous

* `Private Data Tree` --&gt; `Note Hash Tree` ([#2945](https://github.com/AztecProtocol/aztec-packages/issues/2945)) ([abaec9c](https://github.com/AztecProtocol/aztec-packages/commit/abaec9c16b300c84fce82242a7a734a4bf0ac0db)), closes [#2906](https://github.com/AztecProtocol/aztec-packages/issues/2906)
* Apply hash abstraction over aztec-nr ([#2958](https://github.com/AztecProtocol/aztec-packages/issues/2958)) ([52f01ae](https://github.com/AztecProtocol/aztec-packages/commit/52f01aea277cb5a522043edc1066d0fda522f8f6))
* **docs:** Add Singleton and ImmutableSingleton `view_note` methods ([#2934](https://github.com/AztecProtocol/aztec-packages/issues/2934)) ([c1497f8](https://github.com/AztecProtocol/aztec-packages/commit/c1497f88f522cb9cbcb44fb6e69522854b604950))
* Fix box frontend styling ([#2919](https://github.com/AztecProtocol/aztec-packages/issues/2919)) ([7e9e8cc](https://github.com/AztecProtocol/aztec-packages/commit/7e9e8cced3cd5af9b99ce3719d9f969cbc61d383))
* Less noisy benchmark reports ([#2916](https://github.com/AztecProtocol/aztec-packages/issues/2916)) ([0df166c](https://github.com/AztecProtocol/aztec-packages/commit/0df166c891a00fa3b8a1c6b69e2c36a0fb45391f))
* Remove unused nix files ([#2933](https://github.com/AztecProtocol/aztec-packages/issues/2933)) ([3174f84](https://github.com/AztecProtocol/aztec-packages/commit/3174f84fe9d92b353d1b2c307ed5757ee941ce00))
* Run all e2e tests against sandbox ([#2891](https://github.com/AztecProtocol/aztec-packages/issues/2891)) ([6c4e26c](https://github.com/AztecProtocol/aztec-packages/commit/6c4e26cfcfbe4b3f3cfd26f549e585ad275373df))
* Token box copies noir source files from noir-contracts on bootstrap ([#2940](https://github.com/AztecProtocol/aztec-packages/issues/2940)) ([a467b96](https://github.com/AztecProtocol/aztec-packages/commit/a467b9601fabe3f6038d9231132f910079763a9b))


### Documentation

* Fix: update cheat codes to connect to ethRpcUrl ([#2922](https://github.com/AztecProtocol/aztec-packages/issues/2922)) ([4ffe9be](https://github.com/AztecProtocol/aztec-packages/commit/4ffe9befc06e9b322fe28a34ba4818c66459c6cd))

## [0.9.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.8.14...aztec-packages-v0.9.0) (2023-10-17)


### ⚠ BREAKING CHANGES

* nuking `PublicToken` and `PrivateAirdropToken` ([#2873](https://github.com/AztecProtocol/aztec-packages/issues/2873))
* Change blake3 to blake2 in private kernel ([#2861](https://github.com/AztecProtocol/aztec-packages/issues/2861))
* nuking private token ([#2822](https://github.com/AztecProtocol/aztec-packages/issues/2822))

### Features

* Add input support for chained transactions ("pending_read_requests" in private kernel circuit) ([#2869](https://github.com/AztecProtocol/aztec-packages/issues/2869)) ([c1dff38](https://github.com/AztecProtocol/aztec-packages/commit/c1dff38c2f878add4f0bcc41ef7d95ac1def19fb))
* Bump msgpack ([#2884](https://github.com/AztecProtocol/aztec-packages/issues/2884)) ([d7b7fb1](https://github.com/AztecProtocol/aztec-packages/commit/d7b7fb1d70cfb6a592d4cf24c0da92ed9acc7d38))
* Contract ts interface to use only aztec.js imports ([#2876](https://github.com/AztecProtocol/aztec-packages/issues/2876)) ([6952a1a](https://github.com/AztecProtocol/aztec-packages/commit/6952a1ab95b1febd0f1767e3560b2a8cc59622d2))
* Download msgpack ([#2885](https://github.com/AztecProtocol/aztec-packages/issues/2885)) ([8ac8beb](https://github.com/AztecProtocol/aztec-packages/commit/8ac8bebaa8dad39df6f3d6f622e215574062ac52))
* Faucet ([#2856](https://github.com/AztecProtocol/aztec-packages/issues/2856)) ([5bad35f](https://github.com/AztecProtocol/aztec-packages/commit/5bad35f3c0b5048511062f40cd5d45d69bf16355))
* Nuking `PublicToken` and `PrivateAirdropToken` ([#2873](https://github.com/AztecProtocol/aztec-packages/issues/2873)) ([c74311d](https://github.com/AztecProtocol/aztec-packages/commit/c74311d97ade2cac419e4a5999d1187b7a2c1473))
* Nuking private token ([#2822](https://github.com/AztecProtocol/aztec-packages/issues/2822)) ([5d93a47](https://github.com/AztecProtocol/aztec-packages/commit/5d93a470122aaddfcbd1e59e54568357df871098)), closes [#2350](https://github.com/AztecProtocol/aztec-packages/issues/2350)


### Bug Fixes

* Aztec node to save outbox adddress to config ([#2867](https://github.com/AztecProtocol/aztec-packages/issues/2867)) ([b6418a6](https://github.com/AztecProtocol/aztec-packages/commit/b6418a6bf225fcc53e250474172da3b047f5e511))
* Create data dir on node boot ([#2864](https://github.com/AztecProtocol/aztec-packages/issues/2864)) ([2d498b3](https://github.com/AztecProtocol/aztec-packages/commit/2d498b352364debf59af940f0a69c453651a4ad0))
* Don't repeatedly scan for missing messages ([#2886](https://github.com/AztecProtocol/aztec-packages/issues/2886)) ([3fe1cc8](https://github.com/AztecProtocol/aztec-packages/commit/3fe1cc857b83c20bdd5701f685334316db34dd85))
* Fix trailing pipe causing everything to rebuild. Sorry... ([d13ba75](https://github.com/AztecProtocol/aztec-packages/commit/d13ba75bf5bdc7c11b848ca9c8a281f9eec6b015))
* Pad L1 to L2 messages upon retrieval from L1 ([#2879](https://github.com/AztecProtocol/aztec-packages/issues/2879)) ([457669e](https://github.com/AztecProtocol/aztec-packages/commit/457669e81d654c0b77fcf2c7bf98eb335f0914ff))
* Sequencer aborts in-progress block ([#2883](https://github.com/AztecProtocol/aztec-packages/issues/2883)) ([b0915a8](https://github.com/AztecProtocol/aztec-packages/commit/b0915a8d618ac2e8d1401c41527af85648e0b2eb))


### Miscellaneous

* Change blake3 to blake2 in private kernel ([#2861](https://github.com/AztecProtocol/aztec-packages/issues/2861)) ([d629940](https://github.com/AztecProtocol/aztec-packages/commit/d62994073d0476bb62fab16c02fdc484da9edc44))
* Clean canary env & fixes ([#2880](https://github.com/AztecProtocol/aztec-packages/issues/2880)) ([20ad577](https://github.com/AztecProtocol/aztec-packages/commit/20ad57795ac3c66e88ac36af8ceca9235ad86e6b))
* Making anvil silent again ([#2866](https://github.com/AztecProtocol/aztec-packages/issues/2866)) ([90ae5dc](https://github.com/AztecProtocol/aztec-packages/commit/90ae5dc0efa93272950c734ad645b418de7a014c))
* Spell check on forbidden words. ([#2887](https://github.com/AztecProtocol/aztec-packages/issues/2887)) ([06bc4f9](https://github.com/AztecProtocol/aztec-packages/commit/06bc4f952e0e3ae853aaef7b2002eea67c1a1ee0))


### Documentation

* Initial 'protocol description' toc ([#2844](https://github.com/AztecProtocol/aztec-packages/issues/2844)) ([cb18f45](https://github.com/AztecProtocol/aztec-packages/commit/cb18f455d02b00b30da20c6afbeb806921b3a1cf))

## [0.8.14](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.8.13...aztec-packages-v0.8.14) (2023-10-13)


### Bug Fixes

* Deploy_defaults for canary-end ([#2854](https://github.com/AztecProtocol/aztec-packages/issues/2854)) ([7b189a8](https://github.com/AztecProtocol/aztec-packages/commit/7b189a83114a4206da425c375a77542af0b7df48))
* **docker:** Use entrypoint for mult line commands in docker ([#2853](https://github.com/AztecProtocol/aztec-packages/issues/2853)) ([ab99cd0](https://github.com/AztecProtocol/aztec-packages/commit/ab99cd0f0731b7951286ae2a1667a73f1d406a1a))

## [0.8.13](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.8.12...aztec-packages-v0.8.13) (2023-10-13)


### Features

* Add deployed contract to PXE from CLI ([#2850](https://github.com/AztecProtocol/aztec-packages/issues/2850)) ([5bad3e3](https://github.com/AztecProtocol/aztec-packages/commit/5bad3e344ee5842d86aebe443bb001e27d1e735b))
* **docs_tutorials:** Token Portal & Uniswap Tutorial ([#2726](https://github.com/AztecProtocol/aztec-packages/issues/2726)) ([dbef55f](https://github.com/AztecProtocol/aztec-packages/commit/dbef55fc63a296e720e270616b8ae7bd642b8a28))


### Bug Fixes

* Added registry contract address to node terraform ([#2851](https://github.com/AztecProtocol/aztec-packages/issues/2851)) ([bfc5feb](https://github.com/AztecProtocol/aztec-packages/commit/bfc5feb1bad76a5a1a4c7deb5ecd674f9ab42a9b))
* Create canary dockerhub manifest ([#2849](https://github.com/AztecProtocol/aztec-packages/issues/2849)) ([1d7bd26](https://github.com/AztecProtocol/aztec-packages/commit/1d7bd26874af4f3c608ce707c81b844e929cc742))
* Fix check_circuit in goblin translator (resulted in flimsy test) ([#2827](https://github.com/AztecProtocol/aztec-packages/issues/2827)) ([98b1679](https://github.com/AztecProtocol/aztec-packages/commit/98b16793b0e84360af8dc70934636d11d7bc7e29))

## [0.8.12](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.8.11...aztec-packages-v0.8.12) (2023-10-13)


### Features

* Private token box upgrade to new Token contract ([#2824](https://github.com/AztecProtocol/aztec-packages/issues/2824)) ([22794a5](https://github.com/AztecProtocol/aztec-packages/commit/22794a57bbf45cac72dd69bf9838c63b240e6e22))
* Use privacy consistently ([#2833](https://github.com/AztecProtocol/aztec-packages/issues/2833)) ([89b9b6a](https://github.com/AztecProtocol/aztec-packages/commit/89b9b6ac6eeed10484a4c0892d43d9374864ee1d))


### Bug Fixes

* Copied box nargo toml trailing slash ([#2819](https://github.com/AztecProtocol/aztec-packages/issues/2819)) ([ecd2a64](https://github.com/AztecProtocol/aztec-packages/commit/ecd2a64a517e34ada4770d26e6d7f9c578ee82aa))
* Fix rebuild pattern slashes. ([#2843](https://github.com/AztecProtocol/aztec-packages/issues/2843)) ([e32517e](https://github.com/AztecProtocol/aztec-packages/commit/e32517e9eae791b32f94b3816413392ccf0ba096))
* Trigger yarn-project rebuild for .sh files ([#2846](https://github.com/AztecProtocol/aztec-packages/issues/2846)) ([c956254](https://github.com/AztecProtocol/aztec-packages/commit/c95625439e3c779568d4ddf2f0d0ed93519fb4ac))

## [0.8.11](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.8.10...aztec-packages-v0.8.11) (2023-10-13)


### Features

* **archiver:** Use registry to fetch searchStartBlock ([#2830](https://github.com/AztecProtocol/aztec-packages/issues/2830)) ([e5bc067](https://github.com/AztecProtocol/aztec-packages/commit/e5bc0672b631f21debf96a85a206080e2d9a838c))
* Configure sandbox for network ([#2818](https://github.com/AztecProtocol/aztec-packages/issues/2818)) ([d393a59](https://github.com/AztecProtocol/aztec-packages/commit/d393a5954bb5d80dddf602d1828ab9c9f6e092cb))
* **docker-sandbox:** Allow forks in sandbox ([#2831](https://github.com/AztecProtocol/aztec-packages/issues/2831)) ([ed8431c](https://github.com/AztecProtocol/aztec-packages/commit/ed8431c736ab67dc825316b8ea35ca5c7f078563)), closes [#2726](https://github.com/AztecProtocol/aztec-packages/issues/2726)
* Goblin Translator Decomposition relation (Goblin Translator part 4) ([#2802](https://github.com/AztecProtocol/aztec-packages/issues/2802)) ([3c3cd9f](https://github.com/AztecProtocol/aztec-packages/commit/3c3cd9f62640b505b55916648df6ccddf524cdfc))
* Goblin Translator GenPermSort relation (Goblin Translator part 3) ([#2795](https://github.com/AztecProtocol/aztec-packages/issues/2795)) ([b36fdc4](https://github.com/AztecProtocol/aztec-packages/commit/b36fdc481d16e56fe244c5a10a5223199f9f2e6b))
* Goblin translator opcode constraint and accumulator transfer relations (Goblin Translator part 5) ([#2805](https://github.com/AztecProtocol/aztec-packages/issues/2805)) ([b3d1f28](https://github.com/AztecProtocol/aztec-packages/commit/b3d1f280913494322baee369e6ee4f04353891b3))
* Goblin Translator Permutation relation (Goblin Translator part 2) ([#2790](https://github.com/AztecProtocol/aztec-packages/issues/2790)) ([9a354c9](https://github.com/AztecProtocol/aztec-packages/commit/9a354c94c91f8f2927ca66d0de65b5b893066710))
* Integrate ZeroMorph into Honk ([#2774](https://github.com/AztecProtocol/aztec-packages/issues/2774)) ([ea86869](https://github.com/AztecProtocol/aztec-packages/commit/ea86869e92da3fbf921314fdbca31fdb85a6e274))
* NPM canary deployment ([#2731](https://github.com/AztecProtocol/aztec-packages/issues/2731)) ([7d48ed3](https://github.com/AztecProtocol/aztec-packages/commit/7d48ed3beb70f0ed183407e87dad0fb9310fcf13))
* Purge non native token + reorder params in token portal ([#2723](https://github.com/AztecProtocol/aztec-packages/issues/2723)) ([447dade](https://github.com/AztecProtocol/aztec-packages/commit/447dade3cc21bdd20a24b13fb5d958efea6fed08))
* Throw compile error if read/write public state from private ([#2804](https://github.com/AztecProtocol/aztec-packages/issues/2804)) ([a3649df](https://github.com/AztecProtocol/aztec-packages/commit/a3649df0691e76e108388aebd780748e844ee8c5))
* Unencrypted log filtering ([#2600](https://github.com/AztecProtocol/aztec-packages/issues/2600)) ([7ae554a](https://github.com/AztecProtocol/aztec-packages/commit/7ae554a7c4d725c1ae67b083a0286d15fb76ad0b)), closes [#1498](https://github.com/AztecProtocol/aztec-packages/issues/1498) [#1500](https://github.com/AztecProtocol/aztec-packages/issues/1500)
* Update goblin translator circuit builder (Goblin Translator part 1) ([#2764](https://github.com/AztecProtocol/aztec-packages/issues/2764)) ([32c69ae](https://github.com/AztecProtocol/aztec-packages/commit/32c69ae36ed431482d286e228fd830256e8bd1b5))


### Bug Fixes

* Outdated `noir:clean` ([#2821](https://github.com/AztecProtocol/aztec-packages/issues/2821)) ([2ea199f](https://github.com/AztecProtocol/aztec-packages/commit/2ea199fcd99db73ea2969af7ce0e99501d2cbb5d))


### Miscellaneous

* Benchmark tx sizes in p2p pool ([#2810](https://github.com/AztecProtocol/aztec-packages/issues/2810)) ([f63219c](https://github.com/AztecProtocol/aztec-packages/commit/f63219c91e076a96a49ed16a779a3124fef202c4))
* Change acir_tests branch to point to master ([#2815](https://github.com/AztecProtocol/aztec-packages/issues/2815)) ([73f229d](https://github.com/AztecProtocol/aztec-packages/commit/73f229d3123301818262439a2a98767146a1a58c))
* Fix typo ([#2839](https://github.com/AztecProtocol/aztec-packages/issues/2839)) ([5afdf91](https://github.com/AztecProtocol/aztec-packages/commit/5afdf9105f4980d3ed86ca5fb3a2d6b8e9c33f70))
* From &lt; genesis allowed in getBlocks ([#2816](https://github.com/AztecProtocol/aztec-packages/issues/2816)) ([5622b50](https://github.com/AztecProtocol/aztec-packages/commit/5622b506513f7f1fb491a6be011f90eca1ea96f3))
* Remove Ultra Grumpkin flavor ([#2825](https://github.com/AztecProtocol/aztec-packages/issues/2825)) ([bde77b8](https://github.com/AztecProtocol/aztec-packages/commit/bde77b8e6e91fa734e06453e67a50597480b2ec1))
* Remove work queue from honk ([#2814](https://github.com/AztecProtocol/aztec-packages/issues/2814)) ([bca7d12](https://github.com/AztecProtocol/aztec-packages/commit/bca7d126d2ec583977ee5bdf77a90263d059dc44))
* Spell check ([#2817](https://github.com/AztecProtocol/aztec-packages/issues/2817)) ([4777a11](https://github.com/AztecProtocol/aztec-packages/commit/4777a113491c4c9901b4589a9a6cb1e1148c0288))


### Documentation

* Slight changes to update portal page ([#2799](https://github.com/AztecProtocol/aztec-packages/issues/2799)) ([eb65819](https://github.com/AztecProtocol/aztec-packages/commit/eb65819957a0e5e5c2240ad4f299222133a27edd))
* Update aztec_connect_sunset.mdx ([#2808](https://github.com/AztecProtocol/aztec-packages/issues/2808)) ([5f659a7](https://github.com/AztecProtocol/aztec-packages/commit/5f659a708980c60d015d4292c05e5fd50e7c7f1f))

## [0.8.10](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.8.9...aztec-packages-v0.8.10) (2023-10-11)


### Features

* Adding Fr back as a BB export (ts) ([#2770](https://github.com/AztecProtocol/aztec-packages/issues/2770)) ([d9ac808](https://github.com/AztecProtocol/aztec-packages/commit/d9ac8080a5525b9792b7b3f10c40583536bb256c))
* Bb faster init ([#2776](https://github.com/AztecProtocol/aztec-packages/issues/2776)) ([c794533](https://github.com/AztecProtocol/aztec-packages/commit/c794533754a9706d362d0374209df9eb5b6bfdc7))
* Deploy l1 contracts npm pkg ([#2754](https://github.com/AztecProtocol/aztec-packages/issues/2754)) ([e317c47](https://github.com/AztecProtocol/aztec-packages/commit/e317c47471f0dc2ef9c95f917406dc1f85dd87e4))
* Docs: Add foundational concepts, ACIR and Sequencer pages ([#2716](https://github.com/AztecProtocol/aztec-packages/issues/2716)) ([9d10326](https://github.com/AztecProtocol/aztec-packages/commit/9d103265e8cde02add16c1a920add5b290a8fc92))
* Events in contract artifacts ([#2786](https://github.com/AztecProtocol/aztec-packages/issues/2786)) ([b8cb7df](https://github.com/AztecProtocol/aztec-packages/commit/b8cb7dfdb68784d60f29249fd49140bde1c8e581)), closes [#2324](https://github.com/AztecProtocol/aztec-packages/issues/2324)
* IAC for a prototype devnet ([#2720](https://github.com/AztecProtocol/aztec-packages/issues/2720)) ([b30839e](https://github.com/AztecProtocol/aztec-packages/commit/b30839e9e5b88124443d35140f84610bbc0a7855))
* **l1-contracts:** Remove remappings of [@aztec](https://github.com/aztec) ([#2797](https://github.com/AztecProtocol/aztec-packages/issues/2797)) ([aac8b37](https://github.com/AztecProtocol/aztec-packages/commit/aac8b37431d4e69db60388cf72c114297977248a))
* LLVM xray presets ([#2525](https://github.com/AztecProtocol/aztec-packages/issues/2525)) ([23a1ee9](https://github.com/AztecProtocol/aztec-packages/commit/23a1ee91da6003d1b5798640c8ccecbd226beef7))
* Separate aggregation protocol ([#2736](https://github.com/AztecProtocol/aztec-packages/issues/2736)) ([ad16937](https://github.com/AztecProtocol/aztec-packages/commit/ad169374943ef49c32eabc66483a7be28a711565))
* Simplify relation containers ([#2619](https://github.com/AztecProtocol/aztec-packages/issues/2619)) ([99c5127](https://github.com/AztecProtocol/aztec-packages/commit/99c5127ac5c10e6637534870a689a95238ae997c))
* ZeroMorph ([#2664](https://github.com/AztecProtocol/aztec-packages/issues/2664)) ([a006e5a](https://github.com/AztecProtocol/aztec-packages/commit/a006e5a0e0a30f8dfe992e3ac8a05f6c276f9300))


### Miscellaneous

* Acir format cleanup ([#2779](https://github.com/AztecProtocol/aztec-packages/issues/2779)) ([5ea373f](https://github.com/AztecProtocol/aztec-packages/commit/5ea373f7d653f7322a108297113a2deb379e1400))
* Add md to rebuild patterns ([#2798](https://github.com/AztecProtocol/aztec-packages/issues/2798)) ([3f4297d](https://github.com/AztecProtocol/aztec-packages/commit/3f4297dbc924ca76fdfba44975c64316f2236deb))
* Make canary uniswap test similar to e2e ([#2767](https://github.com/AztecProtocol/aztec-packages/issues/2767)) ([93d458b](https://github.com/AztecProtocol/aztec-packages/commit/93d458bbbf6c88861b72f00e8fe8beb753857765))
* Measure block building times, history processing times, and db sizes ([#2733](https://github.com/AztecProtocol/aztec-packages/issues/2733)) ([0cc553a](https://github.com/AztecProtocol/aztec-packages/commit/0cc553ab7740c0479582674fce2626a30f3093a9))
* Moved `AddressNote` to `aztec.nr` ([#2752](https://github.com/AztecProtocol/aztec-packages/issues/2752)) ([5f99066](https://github.com/AztecProtocol/aztec-packages/commit/5f99066113480292c8bc56247eca1adb4d49ad5c))
* No calls to pedersen from TS ([#2724](https://github.com/AztecProtocol/aztec-packages/issues/2724)) ([78e44c3](https://github.com/AztecProtocol/aztec-packages/commit/78e44c33bb98fa405f104aafa74b44ce791f239f))
* Remove stale comments ([#2788](https://github.com/AztecProtocol/aztec-packages/issues/2788)) ([d9c458d](https://github.com/AztecProtocol/aztec-packages/commit/d9c458d233d4c4a2ade50cdb6c1fc713e654cb55))
* Renaming abi as artifact ([#2756](https://github.com/AztecProtocol/aztec-packages/issues/2756)) ([c0abcfd](https://github.com/AztecProtocol/aztec-packages/commit/c0abcfd9dfcceb4a2c81561bd89beb9381d20461))
* Rewrite benchmark scripts in ts ([#2765](https://github.com/AztecProtocol/aztec-packages/issues/2765)) ([8efa374](https://github.com/AztecProtocol/aztec-packages/commit/8efa3741ca7503cd38a7de75d5768f1b4d1be287))
* Stop whinging about this ownership stuff. ([#2775](https://github.com/AztecProtocol/aztec-packages/issues/2775)) ([3dd6900](https://github.com/AztecProtocol/aztec-packages/commit/3dd6900f96a7dc855643be0e4aba0cfe9fa8a16e))
* Update ACIR serialisation format ([#2771](https://github.com/AztecProtocol/aztec-packages/issues/2771)) ([6d85527](https://github.com/AztecProtocol/aztec-packages/commit/6d855270f8c069edac62536ccc391a0cab764323))
* Use global crs in more places. Less pain. ([#2772](https://github.com/AztecProtocol/aztec-packages/issues/2772)) ([b819980](https://github.com/AztecProtocol/aztec-packages/commit/b8199802bad3c05ebe4d1ded5338a09a04e0ed7e))


### Documentation

* Add yellow-paper directory ([#2773](https://github.com/AztecProtocol/aztec-packages/issues/2773)) ([03de545](https://github.com/AztecProtocol/aztec-packages/commit/03de545b62ab8d6755fae27b6f2e2bce3575e40e))
* Adding some authwit docs ([#2711](https://github.com/AztecProtocol/aztec-packages/issues/2711)) ([afc23f4](https://github.com/AztecProtocol/aztec-packages/commit/afc23f4652c478298e86f8895f41b21e727a89a6))
* Update overview.mdx ([#2746](https://github.com/AztecProtocol/aztec-packages/issues/2746)) ([082ab56](https://github.com/AztecProtocol/aztec-packages/commit/082ab56d4735a8f08922e36a9897a17fb4fd2c3c))
* Update site title and tagline ([#2769](https://github.com/AztecProtocol/aztec-packages/issues/2769)) ([bbb0b60](https://github.com/AztecProtocol/aztec-packages/commit/bbb0b60d07bc2efa6754b1ad3839735272eeb896))

## [0.8.9](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.8.8...aztec-packages-v0.8.9) (2023-10-10)


### Features

* Auto-recompile the boxes and fix broken frontend CompleteAddress import ([#2727](https://github.com/AztecProtocol/aztec-packages/issues/2727)) ([4ec4ea0](https://github.com/AztecProtocol/aztec-packages/commit/4ec4ea061e2d003da905d6c2026608b41cdca044))


### Bug Fixes

* Default export in noir-version ([#2757](https://github.com/AztecProtocol/aztec-packages/issues/2757)) ([6ff7bed](https://github.com/AztecProtocol/aztec-packages/commit/6ff7bed1722f8e7afa4b4c495216ca20ea47f42a))


### Documentation

* Add preview image ([#2759](https://github.com/AztecProtocol/aztec-packages/issues/2759)) ([45597af](https://github.com/AztecProtocol/aztec-packages/commit/45597af2a75ffeb8ecd91028f30f159910821673))

## [0.8.8](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.8.7...aztec-packages-v0.8.8) (2023-10-09)


### Features

* Actually compute selectors ([#2686](https://github.com/AztecProtocol/aztec-packages/issues/2686)) ([dcb65e1](https://github.com/AztecProtocol/aztec-packages/commit/dcb65e1286f8ac4c09e03f65bb3837e02b44ace2))
* Add otterscan to sandbox ([#2648](https://github.com/AztecProtocol/aztec-packages/issues/2648)) ([6986649](https://github.com/AztecProtocol/aztec-packages/commit/69866498c77ba1b38ca88b766172d5dc46acc4f7))
* **aztec.js:** Remove attach method ([#2715](https://github.com/AztecProtocol/aztec-packages/issues/2715)) ([c03c654](https://github.com/AztecProtocol/aztec-packages/commit/c03c654631d6e70bb3f2c6abcd9fa046ce8554b8))
* Create .gitattributes in aztec-nr ([#2661](https://github.com/AztecProtocol/aztec-packages/issues/2661)) ([8084fc3](https://github.com/AztecProtocol/aztec-packages/commit/8084fc3a6a880517284d4aac78a355b9882e88a8))
* GCC 13 preset ([#2623](https://github.com/AztecProtocol/aztec-packages/issues/2623)) ([4881414](https://github.com/AztecProtocol/aztec-packages/commit/4881414ceb30590674c244ef9bc4c8416eacd6bc))
* Update noir to v0.16 ([#2718](https://github.com/AztecProtocol/aztec-packages/issues/2718)) ([e8d0675](https://github.com/AztecProtocol/aztec-packages/commit/e8d0675bfb99369ce488943e127ed03d8ecbe9dc))


### Bug Fixes

* Avoid ambiguity on blank and blank-react (prefix issue) ([#2729](https://github.com/AztecProtocol/aztec-packages/issues/2729)) ([68cdb3f](https://github.com/AztecProtocol/aztec-packages/commit/68cdb3f82cad9b7274c7c4902c2f5919b0acb96b))
* Block encoding ([#2719](https://github.com/AztecProtocol/aztec-packages/issues/2719)) ([c4796ac](https://github.com/AztecProtocol/aztec-packages/commit/c4796ac4ca6b1150cc1ac08fc44fba5a02e1bcf4))
* Canary tests to use a fork ([#2739](https://github.com/AztecProtocol/aztec-packages/issues/2739)) ([4906142](https://github.com/AztecProtocol/aztec-packages/commit/4906142ec611ea82296bcccd7aeefcd929a8d006))
* Challenge generation update ([#2628](https://github.com/AztecProtocol/aztec-packages/issues/2628)) ([68c1fab](https://github.com/AztecProtocol/aztec-packages/commit/68c1fab51e3a339032b719ce966ed34787f33dab))
* Docs: Sandbox version numbers ([#2708](https://github.com/AztecProtocol/aztec-packages/issues/2708)) ([34b0209](https://github.com/AztecProtocol/aztec-packages/commit/34b020974f63f2486c55b821c3c48d583a5e54d0))
* Docs: Update Sandbox page to use #include_aztec_version ([#2703](https://github.com/AztecProtocol/aztec-packages/issues/2703)) ([d5b78af](https://github.com/AztecProtocol/aztec-packages/commit/d5b78af731e4838ecd03a9267dab639681b06512))
* Remove npx from extract_tag_version ([#2697](https://github.com/AztecProtocol/aztec-packages/issues/2697)) ([fe4484a](https://github.com/AztecProtocol/aztec-packages/commit/fe4484a8b9eeb3c997650e94794b0db3b4f4e404))
* Version in sandbox deployment ([#2730](https://github.com/AztecProtocol/aztec-packages/issues/2730)) ([b1d8efd](https://github.com/AztecProtocol/aztec-packages/commit/b1d8efd62e31a49498870cab4c447ace7d5cc1a1))


### Miscellaneous

* `foundation/src/serialization` tech debt ([#2722](https://github.com/AztecProtocol/aztec-packages/issues/2722)) ([e92154b](https://github.com/AztecProtocol/aztec-packages/commit/e92154b891ef6362cec511e1371f8d9ff3007e89))
* Add node10 entrypoint to Foundation ([#2706](https://github.com/AztecProtocol/aztec-packages/issues/2706)) ([30c7935](https://github.com/AztecProtocol/aztec-packages/commit/30c793504951d4eb4f0a192a023fa42fc5d827d1))
* Add storage slot to docs ([#2601](https://github.com/AztecProtocol/aztec-packages/issues/2601)) ([a7710f0](https://github.com/AztecProtocol/aztec-packages/commit/a7710f0849801a85e6907ac0072dd65140ae086a))
* Add visibility modifiers ([#2728](https://github.com/AztecProtocol/aztec-packages/issues/2728)) ([d9ae189](https://github.com/AztecProtocol/aztec-packages/commit/d9ae189bcee43a193d262d2e819c55966494cce7))
* **benchmark:** Measure time to decrypt notes in pxe ([#2714](https://github.com/AztecProtocol/aztec-packages/issues/2714)) ([33a230a](https://github.com/AztecProtocol/aztec-packages/commit/33a230a77488baedb7e93528e296ec47631803c7))
* Build boxes as part of workspace ([#2725](https://github.com/AztecProtocol/aztec-packages/issues/2725)) ([d18349f](https://github.com/AztecProtocol/aztec-packages/commit/d18349f3435677200734a1db625ed80de35c469a))
* Bump ACIR deserializer ([#2675](https://github.com/AztecProtocol/aztec-packages/issues/2675)) ([502ee87](https://github.com/AztecProtocol/aztec-packages/commit/502ee872d6360bf4bc5b83c672eeb64c58944073))
* **circuits:** Delete old code that set a different generator index per vector entry in pedersen commitment ([#2700](https://github.com/AztecProtocol/aztec-packages/issues/2700)) ([4eabfd1](https://github.com/AztecProtocol/aztec-packages/commit/4eabfd1241cce2b2a0c230f600bda3af88f511dd))
* **log:** Show log level in debug logs ([#2717](https://github.com/AztecProtocol/aztec-packages/issues/2717)) ([2b87381](https://github.com/AztecProtocol/aztec-packages/commit/2b873819ad5bade5104813c4ca2624727090ea9e))
* Move { Fr } imports to foundation/fields ([#2712](https://github.com/AztecProtocol/aztec-packages/issues/2712)) ([f6fc7f2](https://github.com/AztecProtocol/aztec-packages/commit/f6fc7f20dfe94c7be9d791d369750234b94c1bbd))
* **uniswap_tests:** Test edge cases around uniswap flow ([#2620](https://github.com/AztecProtocol/aztec-packages/issues/2620)) ([7a58fe9](https://github.com/AztecProtocol/aztec-packages/commit/7a58fe928b658f92afc6914672d64f8742db35bc))
* Use `serialize` functions in `getInitialWitness` ([#2713](https://github.com/AztecProtocol/aztec-packages/issues/2713)) ([93cc668](https://github.com/AztecProtocol/aztec-packages/commit/93cc668d360ae1c599af5e347df7cd8341c59cda))

## [0.8.7](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.8.6...aztec-packages-v0.8.7) (2023-10-04)


### Bug Fixes

* Copy over wasm in yarn-project ([#2693](https://github.com/AztecProtocol/aztec-packages/issues/2693)) ([033e234](https://github.com/AztecProtocol/aztec-packages/commit/033e2340d53c425b2c76563d2bfda814b4c9cc06))

## [0.8.6](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.8.5...aztec-packages-v0.8.6) (2023-10-04)


### Bug Fixes

* Do not fail if npm package has not yet been deployed ([#2690](https://github.com/AztecProtocol/aztec-packages/issues/2690)) ([4a52888](https://github.com/AztecProtocol/aztec-packages/commit/4a52888273610134db63c208ed9ea66e58f55585))

## [0.8.5](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.8.4...aztec-packages-v0.8.5) (2023-10-04)


### Bug Fixes

* Ensure resources ignition directory exists ([#2684](https://github.com/AztecProtocol/aztec-packages/issues/2684)) ([f4f2cd0](https://github.com/AztecProtocol/aztec-packages/commit/f4f2cd04523381824c4e930af81cec79cc50eef9))
* Include resources folder in circuits.js package.json ([#2689](https://github.com/AztecProtocol/aztec-packages/issues/2689)) ([34ed2c2](https://github.com/AztecProtocol/aztec-packages/commit/34ed2c2d4a8e12b649f428dd655a840a1282b69a))
* Npm publish order ([#2687](https://github.com/AztecProtocol/aztec-packages/issues/2687)) ([876c0b1](https://github.com/AztecProtocol/aztec-packages/commit/876c0b1cccbe69d97964d9e90201ffd26adaca3d))

## [0.8.4](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.8.3...aztec-packages-v0.8.4) (2023-10-04)


### Bug Fixes

* `deploy_dockerhub.sh` permissions ([#2682](https://github.com/AztecProtocol/aztec-packages/issues/2682)) ([628127d](https://github.com/AztecProtocol/aztec-packages/commit/628127dec9a8903e6d03672d65dab3a195079d9c))
* Deploy npm fixes ([#2685](https://github.com/AztecProtocol/aztec-packages/issues/2685)) ([0b788c6](https://github.com/AztecProtocol/aztec-packages/commit/0b788c615d037754244803c57c1d59dbf8559b88))
* Foundation package is not private ([71d6cda](https://github.com/AztecProtocol/aztec-packages/commit/71d6cda350242c5f0228653111adee09619eafe3))

## [0.8.3](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.8.2...aztec-packages-v0.8.3) (2023-10-04)


### Bug Fixes

* Do not depend on npx for check rebuild script ([#2681](https://github.com/AztecProtocol/aztec-packages/issues/2681)) ([20ffbbc](https://github.com/AztecProtocol/aztec-packages/commit/20ffbbc2d906f92f345fae1d6c62954b49fb1c90))
* Remove package json properties whitelist ([#2680](https://github.com/AztecProtocol/aztec-packages/issues/2680)) ([ef499a0](https://github.com/AztecProtocol/aztec-packages/commit/ef499a06f5fcf545e4c8bad6fd59d5f9376c863c))


### Miscellaneous

* Update authwit computation ([#2651](https://github.com/AztecProtocol/aztec-packages/issues/2651)) ([fdbe2b2](https://github.com/AztecProtocol/aztec-packages/commit/fdbe2b2c6a3fc9918921bde5dadbe4d37a64ce11)), closes [#2448](https://github.com/AztecProtocol/aztec-packages/issues/2448)

## [0.8.2](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.8.1...aztec-packages-v0.8.2) (2023-10-04)


### Features

* Constrain return notes from oracle call. ([#2639](https://github.com/AztecProtocol/aztec-packages/issues/2639)) ([248be1b](https://github.com/AztecProtocol/aztec-packages/commit/248be1bd44a801808117abd29ba4538aca294af0))
* Multiple pixies 1 Sandbox ([#2492](https://github.com/AztecProtocol/aztec-packages/issues/2492)) ([572d572](https://github.com/AztecProtocol/aztec-packages/commit/572d5721248885a31ef470e1ead2d66907fc39ad))
* Take an optional owner to create the initialization nullifier ([#2647](https://github.com/AztecProtocol/aztec-packages/issues/2647)) ([fefc443](https://github.com/AztecProtocol/aztec-packages/commit/fefc4437f6bf1cda2ec48c6897df4d433eff0816))


### Bug Fixes

* Add missing properties to deployed packages ([#2678](https://github.com/AztecProtocol/aztec-packages/issues/2678)) ([343df30](https://github.com/AztecProtocol/aztec-packages/commit/343df30eb2482ba37e5aa1a264e5d38437b380ec))
* Include ignition data in package or save after 1st download ([#2591](https://github.com/AztecProtocol/aztec-packages/issues/2591)) ([d5e9f8b](https://github.com/AztecProtocol/aztec-packages/commit/d5e9f8be6bbcb8a88dfdec8fee8fe7cf439f6b19)), closes [#2445](https://github.com/AztecProtocol/aztec-packages/issues/2445)
* Make target architecture configurable, target westmere in GA. ([#2660](https://github.com/AztecProtocol/aztec-packages/issues/2660)) ([3cb9639](https://github.com/AztecProtocol/aztec-packages/commit/3cb9639ed1158e70b377aa49832eb650e5cd2930))
* Removal of setting private data root in kernel prover ([#2671](https://github.com/AztecProtocol/aztec-packages/issues/2671)) ([6a2cc28](https://github.com/AztecProtocol/aztec-packages/commit/6a2cc28c6230fedb24d8377a43cfe5d75c53ac8f)), closes [#778](https://github.com/AztecProtocol/aztec-packages/issues/778)


### Miscellaneous

* 1 deploy_dockerhub CI task ([#2670](https://github.com/AztecProtocol/aztec-packages/issues/2670)) ([dff396c](https://github.com/AztecProtocol/aztec-packages/commit/dff396ca03febf80ade82cf4683aaaab20192eb9))
* Check that portal address is saved ([#2641](https://github.com/AztecProtocol/aztec-packages/issues/2641)) ([9ebef6e](https://github.com/AztecProtocol/aztec-packages/commit/9ebef6e04d8ddd25649a325f5b3692b42699629e))
* Fixes in deploy scripts ([#2659](https://github.com/AztecProtocol/aztec-packages/issues/2659)) ([f44568b](https://github.com/AztecProtocol/aztec-packages/commit/f44568b8557aac15b4accf901b1ff72efaf2a1da))
* Measure circuit simulation times and input/output sizes ([#2663](https://github.com/AztecProtocol/aztec-packages/issues/2663)) ([027f7ec](https://github.com/AztecProtocol/aztec-packages/commit/027f7ec95f9d761189166936a7c42d08dacf55b7))
* Remove sandbox base image and force_deploy_build. Generalize in check_rebuild. ([#2645](https://github.com/AztecProtocol/aztec-packages/issues/2645)) ([805fe18](https://github.com/AztecProtocol/aztec-packages/commit/805fe18ec1bd207a713cf3438f6d241bf22317fa))

## [0.8.1](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.8.0...aztec-packages-v0.8.1) (2023-10-03)


### Bug Fixes

* Add missing ecc doubling gate into ultra plonk and ultra honk  ([#2610](https://github.com/AztecProtocol/aztec-packages/issues/2610)) ([7cb7c58](https://github.com/AztecProtocol/aztec-packages/commit/7cb7c58444a087d81684afc6d5c2fc254357035e))
* Benchmark script fixes for master branch ([#2638](https://github.com/AztecProtocol/aztec-packages/issues/2638)) ([0a161a4](https://github.com/AztecProtocol/aztec-packages/commit/0a161a4fc8a248865602e6729388bb610c2d2200))
* Redirect sunset instructions ([#2646](https://github.com/AztecProtocol/aztec-packages/issues/2646)) ([9253442](https://github.com/AztecProtocol/aztec-packages/commit/9253442144d7814005bcdea886f5d96faa4b1bc9))
* Remove -u from build_wasm script so that we can skip the build when SKIP_CPP_BUILD is unset ([#2649](https://github.com/AztecProtocol/aztec-packages/issues/2649)) ([84b8ff4](https://github.com/AztecProtocol/aztec-packages/commit/84b8ff4b46e1f542209c1f35a33b7cffdc083f04))


### Miscellaneous

* **benchmark:** Measure block sync time ([#2637](https://github.com/AztecProtocol/aztec-packages/issues/2637)) ([d11343f](https://github.com/AztecProtocol/aztec-packages/commit/d11343fb87653a8fc834e5afada2682309b75093))
* Update acir_tests script to point to master ([#2650](https://github.com/AztecProtocol/aztec-packages/issues/2650)) ([51d1e79](https://github.com/AztecProtocol/aztec-packages/commit/51d1e79c3463461864878d4d8f2e84d7e74b9c86))

## [0.8.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.7.10...aztec-packages-v0.8.0) (2023-10-03)


### ⚠ BREAKING CHANGES

* Gates command should always return 8 bytes ([#2631](https://github.com/AztecProtocol/aztec-packages/issues/2631))

### Features

* **1090:** Validate that some arrays are zero-padded on the right ([#2519](https://github.com/AztecProtocol/aztec-packages/issues/2519)) ([0327b54](https://github.com/AztecProtocol/aztec-packages/commit/0327b544f3763b0188981b8ad491770980e26bb9))
* Add --wait/--no-wait flags to certain cli commands ([#2378](https://github.com/AztecProtocol/aztec-packages/issues/2378)) ([57a2f10](https://github.com/AztecProtocol/aztec-packages/commit/57a2f104623da41a708d0b2f25c20b14a71c3d3c))
* Add boxes to CI ([#2456](https://github.com/AztecProtocol/aztec-packages/issues/2456)) ([a90a185](https://github.com/AztecProtocol/aztec-packages/commit/a90a185bb1d72658c7910366e593303607edf873))
* Add selector to call_context ([#2626](https://github.com/AztecProtocol/aztec-packages/issues/2626)) ([8e317be](https://github.com/AztecProtocol/aztec-packages/commit/8e317be9fafb1daa7bc0bdd08d603ce95d3be2f9))
* AddNote api ([#2535](https://github.com/AztecProtocol/aztec-packages/issues/2535)) ([bb004f4](https://github.com/AztecProtocol/aztec-packages/commit/bb004f4419ca9dba9d8216eaba2e65d3a4a994f8))
* **aztec_noir:** Abstract storage initialization ([#2406](https://github.com/AztecProtocol/aztec-packages/issues/2406)) ([974b037](https://github.com/AztecProtocol/aztec-packages/commit/974b037650e7fac6fbc3721359daf5f1891b5a2a))
* **aztec.js:** Support AddressLike parameters ([#2430](https://github.com/AztecProtocol/aztec-packages/issues/2430)) ([5b5f139](https://github.com/AztecProtocol/aztec-packages/commit/5b5f139af2eb8ceb71e807c49be6c2b54e6e435b))
* Barretenberg/crypto/blake3s supports compile-time hashing ([#2556](https://github.com/AztecProtocol/aztec-packages/issues/2556)) ([da05dd7](https://github.com/AztecProtocol/aztec-packages/commit/da05dd7ea41208aea42efe0aeb838e4d76e2d34a))
* **bb:** Add `bb --version` command ([#2482](https://github.com/AztecProtocol/aztec-packages/issues/2482)) ([530676f](https://github.com/AztecProtocol/aztec-packages/commit/530676f8ec53e63ba24f6fabc9097ae8f5db5fc6))
* **bb:** Avoid initializing CRS for `bb info` command ([#2425](https://github.com/AztecProtocol/aztec-packages/issues/2425)) ([d22c7b1](https://github.com/AztecProtocol/aztec-packages/commit/d22c7b1f69ea936c532fac68d19c6362f8a34be5))
* Benchmarks ([#2605](https://github.com/AztecProtocol/aztec-packages/issues/2605)) ([37d9f9c](https://github.com/AztecProtocol/aztec-packages/commit/37d9f9cc782d5923bf963c7e6b4cbc56f9f923ef))
* Bootstrap_docker skips build it can pull from ecr. ([#2545](https://github.com/AztecProtocol/aztec-packages/issues/2545)) ([466a517](https://github.com/AztecProtocol/aztec-packages/commit/466a517f5dfdd4eafd077d5bdd4dcce2339834ef))
* **cli:** Reenable CLI version check ([#2441](https://github.com/AztecProtocol/aztec-packages/issues/2441)) ([c6ddd23](https://github.com/AztecProtocol/aztec-packages/commit/c6ddd23747e38ea5f248951ed40b0224d167f5c7))
* Collapse interfaces for single implementation ([#2599](https://github.com/AztecProtocol/aztec-packages/issues/2599)) ([860f340](https://github.com/AztecProtocol/aztec-packages/commit/860f3403980f872d6361acc8f6cc31d95d26a635))
* Consistent pedersen hash (work in progress) ([#1945](https://github.com/AztecProtocol/aztec-packages/issues/1945)) ([b4ad8f3](https://github.com/AztecProtocol/aztec-packages/commit/b4ad8f38250d82531439d6db33c8f81387c42496))
* Deprecate assert_contains_and_remove ([#2594](https://github.com/AztecProtocol/aztec-packages/issues/2594)) ([d225d56](https://github.com/AztecProtocol/aztec-packages/commit/d225d56d2e48a84c0c8854fc033b6aad48a1f66e))
* **docs:** Allow raw code interpolation ([#2447](https://github.com/AztecProtocol/aztec-packages/issues/2447)) ([e078ff4](https://github.com/AztecProtocol/aztec-packages/commit/e078ff436b254d802d4ef9a2443fc29f0143dd1b))
* **docs:** Load current aztec version for aztec.nr dependencies in docs ([#2440](https://github.com/AztecProtocol/aztec-packages/issues/2440)) ([63cf415](https://github.com/AztecProtocol/aztec-packages/commit/63cf41586fe7d893329ec4c37483b5219508838b))
* **docs:** Reenable typedoc for aztec-rpc and aztec.js ([#2452](https://github.com/AztecProtocol/aztec-packages/issues/2452)) ([85e504c](https://github.com/AztecProtocol/aztec-packages/commit/85e504c95953cc8ebbb32e2c4ea2f66c7da7a889)), closes [#2045](https://github.com/AztecProtocol/aztec-packages/issues/2045) [#2415](https://github.com/AztecProtocol/aztec-packages/issues/2415)
* **docs:** Use preprocessor syntax for including versions ([#2462](https://github.com/AztecProtocol/aztec-packages/issues/2462)) ([7d315cd](https://github.com/AztecProtocol/aztec-packages/commit/7d315cdb32a8cef809e7622718f2ea72456cec97))
* **docs:** Use released version of code snippets in docs ([#2439](https://github.com/AztecProtocol/aztec-packages/issues/2439)) ([76fc2cf](https://github.com/AztecProtocol/aztec-packages/commit/76fc2cf175da41ca5531a37e65e8afea19a48ed6))
* **docs:** Warn if snippet is grabbed from master ([#2544](https://github.com/AztecProtocol/aztec-packages/issues/2544)) ([36896e7](https://github.com/AztecProtocol/aztec-packages/commit/36896e71960999445e2cf0b67123f5dad8a3721a))
* **e2e:** Public flow for uniswap ([#2596](https://github.com/AztecProtocol/aztec-packages/issues/2596)) ([2f871ee](https://github.com/AztecProtocol/aztec-packages/commit/2f871ee9f385dec026cdb965b3dbe374b291f4e6))
* Enforce that 0th nullifier is non-zero in private kernel circuit ([#2576](https://github.com/AztecProtocol/aztec-packages/issues/2576)) ([458a4fe](https://github.com/AztecProtocol/aztec-packages/commit/458a4fe852a70a1d6c55a0059eb5b6e1e54614a7)), closes [#1329](https://github.com/AztecProtocol/aztec-packages/issues/1329)
* Expose registry address in `getNodeInfo` ([#2478](https://github.com/AztecProtocol/aztec-packages/issues/2478)) ([652bb04](https://github.com/AztecProtocol/aztec-packages/commit/652bb0444deddfb72c323a07b5e88979a18c4f82))
* Expose transaction data from AztecRPC ([#2469](https://github.com/AztecProtocol/aztec-packages/issues/2469)) ([fc00553](https://github.com/AztecProtocol/aztec-packages/commit/fc00553dde3f792928d85094207271f78f5465ba))
* Extend function documentation ([#2408](https://github.com/AztecProtocol/aztec-packages/issues/2408)) ([6a75fd0](https://github.com/AztecProtocol/aztec-packages/commit/6a75fd050dc6d2482bd13b03edb1756c03e14f19))
* Goblin op queue transcript aggregation ([#2257](https://github.com/AztecProtocol/aztec-packages/issues/2257)) ([b7f627a](https://github.com/AztecProtocol/aztec-packages/commit/b7f627a5e472d3dc691b799a5e3df508b685a272))
* Json type by default in `JsonRpcServer` ([#2504](https://github.com/AztecProtocol/aztec-packages/issues/2504)) ([be38fcc](https://github.com/AztecProtocol/aztec-packages/commit/be38fcc9262bfd6fa91c82ab133c71a011b9dd73)), closes [#2479](https://github.com/AztecProtocol/aztec-packages/issues/2479)
* Listing expected args in CLI ([#2423](https://github.com/AztecProtocol/aztec-packages/issues/2423)) ([b2243ad](https://github.com/AztecProtocol/aztec-packages/commit/b2243ad1e46f6fdc961f0002e87842f7600f5bae))
* Log topic and contract address in unencrypted logs ([#2595](https://github.com/AztecProtocol/aztec-packages/issues/2595)) ([a5b763f](https://github.com/AztecProtocol/aztec-packages/commit/a5b763fb077b967f592ad4de9e391acf2790a094)), closes [#2580](https://github.com/AztecProtocol/aztec-packages/issues/2580) [#2581](https://github.com/AztecProtocol/aztec-packages/issues/2581) [#2586](https://github.com/AztecProtocol/aztec-packages/issues/2586) [#2587](https://github.com/AztecProtocol/aztec-packages/issues/2587)
* Parallelization update for polynomials ([#2311](https://github.com/AztecProtocol/aztec-packages/issues/2311)) ([922fc99](https://github.com/AztecProtocol/aztec-packages/commit/922fc9912a4a88a41eef42fe64ca2b59d859b5b1))
* Restore latest block number ([#2474](https://github.com/AztecProtocol/aztec-packages/issues/2474)) ([6dc2da7](https://github.com/AztecProtocol/aztec-packages/commit/6dc2da70584ed1f1f0f00b3dfeca11610e80cc5a))
* Serialize L2Block to JSON ([#2496](https://github.com/AztecProtocol/aztec-packages/issues/2496)) ([714c727](https://github.com/AztecProtocol/aztec-packages/commit/714c727a88d4c07b76e456e462ab1cf43bcaea75))
* Standalone Aztec Node and RPC Server ([#2522](https://github.com/AztecProtocol/aztec-packages/issues/2522)) ([8e355bc](https://github.com/AztecProtocol/aztec-packages/commit/8e355bc8c905d2992678d4a2a3b49d354dfa5bf6))
* Unbox empty box ([#2387](https://github.com/AztecProtocol/aztec-packages/issues/2387)) ([3e3930c](https://github.com/AztecProtocol/aztec-packages/commit/3e3930c6487c3b2a264c7a93bccb25473baf0b22))
* Uniswap private flow ([#2559](https://github.com/AztecProtocol/aztec-packages/issues/2559)) ([39f3a91](https://github.com/AztecProtocol/aztec-packages/commit/39f3a917a3bb88f29d8d17ee6c9e1b2294a45937))
* Update to protogalaxy interfaces ([#2498](https://github.com/AztecProtocol/aztec-packages/issues/2498)) ([9a3d265](https://github.com/AztecProtocol/aztec-packages/commit/9a3d2652d2614439017a6f47152efb9a177b7127))
* YML manifest. Simplify YBP. ([#2353](https://github.com/AztecProtocol/aztec-packages/issues/2353)) ([bf73bc3](https://github.com/AztecProtocol/aztec-packages/commit/bf73bc3e8fd0fd13193f9301073905682044a6c5))


### Bug Fixes

* Add aztec/overview redirect ([#2424](https://github.com/AztecProtocol/aztec-packages/issues/2424)) ([4e30dcd](https://github.com/AztecProtocol/aztec-packages/commit/4e30dcd579cff7bc202f82b710252dc5a61a3315))
* Add redirects from old docs site urls to new site urls ([#2429](https://github.com/AztecProtocol/aztec-packages/issues/2429)) ([18fe88a](https://github.com/AztecProtocol/aztec-packages/commit/18fe88aa63e9a93f4f62789e94047edf33620bfa))
* **barretenberg:** Brittle headers caused error compiling for clang-16 on mainframe ([#2547](https://github.com/AztecProtocol/aztec-packages/issues/2547)) ([cc909da](https://github.com/AztecProtocol/aztec-packages/commit/cc909da0464003aee6d2ff4036ba59c321a5b617))
* Bb rebuild patterns ([#2499](https://github.com/AztecProtocol/aztec-packages/issues/2499)) ([868cceb](https://github.com/AztecProtocol/aztec-packages/commit/868cceb98c7fd6a8edd6710eba4d76ef58a68664))
* Bootstrap.sh ([#2524](https://github.com/AztecProtocol/aztec-packages/issues/2524)) ([bb1fb90](https://github.com/AztecProtocol/aztec-packages/commit/bb1fb907c74894b2a4ed571fd60ea043020a79be))
* Box injected sandbox tag ([#2555](https://github.com/AztecProtocol/aztec-packages/issues/2555)) ([069bdc7](https://github.com/AztecProtocol/aztec-packages/commit/069bdc76775d75f958fd54b466425fdf03653499))
* **build-system:** Don't wait 30s+ always ([#2494](https://github.com/AztecProtocol/aztec-packages/issues/2494)) ([89d700d](https://github.com/AztecProtocol/aztec-packages/commit/89d700d3e161a02549e6eaabf5e11523fc7931f1))
* **build:** CI fixes from previous merges ([#2579](https://github.com/AztecProtocol/aztec-packages/issues/2579)) ([a9e5d05](https://github.com/AztecProtocol/aztec-packages/commit/a9e5d05e702acbc351bea183ac7a077a4e2dec85))
* Bump foundry version ([#2553](https://github.com/AztecProtocol/aztec-packages/issues/2553)) ([0dde3d5](https://github.com/AztecProtocol/aztec-packages/commit/0dde3d5dd0560fbd45e6663a28b68655784a1a6e))
* Call public fn in contract constructor ([#2549](https://github.com/AztecProtocol/aztec-packages/issues/2549)) ([14ab6d6](https://github.com/AztecProtocol/aztec-packages/commit/14ab6d6664c769132d4fedffb9bdd33e364505e8))
* Canary image build ([#2480](https://github.com/AztecProtocol/aztec-packages/issues/2480)) ([6366be5](https://github.com/AztecProtocol/aztec-packages/commit/6366be596f659e1ca4364bc3f0f95c104c8f5717))
* Cli type check arguments and options ([#2571](https://github.com/AztecProtocol/aztec-packages/issues/2571)) ([ecffc36](https://github.com/AztecProtocol/aztec-packages/commit/ecffc366e81cb945ebcde2529a62c627e9f60596))
* **cli:** Typos in cli output ([#2428](https://github.com/AztecProtocol/aztec-packages/issues/2428)) ([08acf90](https://github.com/AztecProtocol/aztec-packages/commit/08acf9090f039112fcf1c9ee0b3c4fb6f4025aba))
* Docs: Token tutorial, update links and add note on imports ([#2604](https://github.com/AztecProtocol/aztec-packages/issues/2604)) ([003d801](https://github.com/AztecProtocol/aztec-packages/commit/003d80117d145a67f7f32bd44ac126b981db6251))
* **docs:** 'command not found: export' ([#2443](https://github.com/AztecProtocol/aztec-packages/issues/2443)) ([f56aa02](https://github.com/AztecProtocol/aztec-packages/commit/f56aa02cea814d00bc39b9b49cefdc5519eb1575))
* **docs:** Docs correction ([#2437](https://github.com/AztecProtocol/aztec-packages/issues/2437)) ([6499248](https://github.com/AztecProtocol/aztec-packages/commit/64992486a3f902462311e7e36f3d9472ac147fe0))
* **docs:** Fix imports in token contract tutorial ([#2432](https://github.com/AztecProtocol/aztec-packages/issues/2432)) ([34ed663](https://github.com/AztecProtocol/aztec-packages/commit/34ed66360c93ba4cc61ff0d19aa37a13373b361d))
* Drop txs with duplicate nullifiers from the same block ([#2511](https://github.com/AztecProtocol/aztec-packages/issues/2511)) ([d9ca1d8](https://github.com/AztecProtocol/aztec-packages/commit/d9ca1d8bebf35659e8fb9cccbdc3c4fec7349514)), closes [#2502](https://github.com/AztecProtocol/aztec-packages/issues/2502)
* E2e browser tests ([#2531](https://github.com/AztecProtocol/aztec-packages/issues/2531)) ([adf2b1e](https://github.com/AztecProtocol/aztec-packages/commit/adf2b1e9f8dd27e463fbe34417fb995900e835f3)), closes [#2527](https://github.com/AztecProtocol/aztec-packages/issues/2527)
* Fix working dir bug causing stdlib-tests to not run. ([#2495](https://github.com/AztecProtocol/aztec-packages/issues/2495)) ([6b3402c](https://github.com/AztecProtocol/aztec-packages/commit/6b3402c552292068dcdf74a920c65b2aad635441))
* Foundry ([#2611](https://github.com/AztecProtocol/aztec-packages/issues/2611)) ([9830fbf](https://github.com/AztecProtocol/aztec-packages/commit/9830fbf7ab41070349c16dce53fa1487e65fb05d))
* Gates command should always return 8 bytes ([#2631](https://github.com/AztecProtocol/aztec-packages/issues/2631)) ([9668165](https://github.com/AztecProtocol/aztec-packages/commit/9668165372c4f5170aa7c4f161e031da0c845649))
* JSON-RPC server returns spec-compliant errors ([#2590](https://github.com/AztecProtocol/aztec-packages/issues/2590)) ([5eafa3d](https://github.com/AztecProtocol/aztec-packages/commit/5eafa3ddbe41e60486422225878d4e6f59021ab9))
* Loading salt into buffer in the cli ([#2467](https://github.com/AztecProtocol/aztec-packages/issues/2467)) ([753ac49](https://github.com/AztecProtocol/aztec-packages/commit/753ac4927ec08485d6673806fcd959b90bf46a3d))
* **master:** Remove secret_hash ref ([#2617](https://github.com/AztecProtocol/aztec-packages/issues/2617)) ([1073bcd](https://github.com/AztecProtocol/aztec-packages/commit/1073bcd742dda8be92f86a46bbab77df19704277))
* Nightly subrepo mirror ([#2520](https://github.com/AztecProtocol/aztec-packages/issues/2520)) ([bedc8c8](https://github.com/AztecProtocol/aztec-packages/commit/bedc8c88cfc24a51806690f225a128f973c5845f))
* Prevent race conditions around data pulled from L1 ([#2577](https://github.com/AztecProtocol/aztec-packages/issues/2577)) ([defea83](https://github.com/AztecProtocol/aztec-packages/commit/defea83088619a8d36cbc1e19f7cade5d45c76c3))
* Readd docs after ci refactor. ([#2514](https://github.com/AztecProtocol/aztec-packages/issues/2514)) ([1eb1a3c](https://github.com/AztecProtocol/aztec-packages/commit/1eb1a3ce45d229cc9ccca9681e5ff61515ad4434))
* Remove "standard" from references to token contracts ([#2533](https://github.com/AztecProtocol/aztec-packages/issues/2533)) ([f931d56](https://github.com/AztecProtocol/aztec-packages/commit/f931d56106cb8520318b02679292f8b29fe06f6a))
* Try fix boxes-blank ([#2539](https://github.com/AztecProtocol/aztec-packages/issues/2539)) ([87b8080](https://github.com/AztecProtocol/aztec-packages/commit/87b8080f5e61b357be96164f5b8d6948584f83c1))
* Try to fix publish bb ([#2529](https://github.com/AztecProtocol/aztec-packages/issues/2529)) ([7c623c4](https://github.com/AztecProtocol/aztec-packages/commit/7c623c44f5e46f41d6fd289fc985edaee721e793))
* Try to fix publish-bb.yml ([#2523](https://github.com/AztecProtocol/aztec-packages/issues/2523)) ([2f6e9bd](https://github.com/AztecProtocol/aztec-packages/commit/2f6e9bde6c9132cc1bc82d2e9df1515f5a3f44f8))
* Use #import_code in Token contract tutorial ([#2438](https://github.com/AztecProtocol/aztec-packages/issues/2438)) ([b58cfb5](https://github.com/AztecProtocol/aztec-packages/commit/b58cfb55c192d3942c3eacecb74d6db28326055d))


### Miscellaneous

* `computeContractAddress` as `computeCompleteAddress` ([#1876](https://github.com/AztecProtocol/aztec-packages/issues/1876)) ([4d95b44](https://github.com/AztecProtocol/aztec-packages/commit/4d95b4420e5a2bf9b5af121a3029d9b3e8a41fa0)), closes [#1873](https://github.com/AztecProtocol/aztec-packages/issues/1873)
* Add instructions on circleci session for debugging ([#2503](https://github.com/AztecProtocol/aztec-packages/issues/2503)) ([a4197e7](https://github.com/AztecProtocol/aztec-packages/commit/a4197e751e14dfe88f5791f1e213336751b9b32e))
* Add output saying how to get the right noir version ([#2622](https://github.com/AztecProtocol/aztec-packages/issues/2622)) ([10b30e0](https://github.com/AztecProtocol/aztec-packages/commit/10b30e061fccd974432f082347715dea6f052f5e))
* Aztec-node json-rpc ([#2444](https://github.com/AztecProtocol/aztec-packages/issues/2444)) ([04efee1](https://github.com/AztecProtocol/aztec-packages/commit/04efee1f5db83eebe5e4e9139ad8fc1a16a74c40))
* BI build tweaks ([#2487](https://github.com/AztecProtocol/aztec-packages/issues/2487)) ([f8b6548](https://github.com/AztecProtocol/aztec-packages/commit/f8b65481eec99876007e521beecd671b9a18f19a))
* Check tree roots in world state sync ([#2543](https://github.com/AztecProtocol/aztec-packages/issues/2543)) ([314e8a0](https://github.com/AztecProtocol/aztec-packages/commit/314e8a0030f93b6b94a17dfa2235e177066e6153))
* **circuits:** 2612 - add validation in native private kernel circuit of arrays in accumulated data ([#2614](https://github.com/AztecProtocol/aztec-packages/issues/2614)) ([f1fe059](https://github.com/AztecProtocol/aztec-packages/commit/f1fe05910ca70224f7334f45cb5b5df7de826b9b))
* **circuits:** Remove obsolete comments in native private kernel circuit ([#2570](https://github.com/AztecProtocol/aztec-packages/issues/2570)) ([a6b6c7b](https://github.com/AztecProtocol/aztec-packages/commit/a6b6c7b0e7b156b72462259b7ea8ead7f42f428b))
* **contract_deployment.md:** Don't require main edit ([#2449](https://github.com/AztecProtocol/aztec-packages/issues/2449)) ([16a3d9c](https://github.com/AztecProtocol/aztec-packages/commit/16a3d9cfb858527c4b59da71a457add1b7dd6d65))
* **deps:** Bump get-func-name from 2.0.0 to 2.0.2 in /yarn-project ([#2630](https://github.com/AztecProtocol/aztec-packages/issues/2630)) ([5cebf18](https://github.com/AztecProtocol/aztec-packages/commit/5cebf18527aec8cb1a41845d20869f2b339b54e2))
* **deps:** Bump ua-parser-js from 0.7.32 to 0.7.36 in /docs ([#2629](https://github.com/AztecProtocol/aztec-packages/issues/2629)) ([b2c87c2](https://github.com/AztecProtocol/aztec-packages/commit/b2c87c26158dea0677ce49ee3c4d5e2045e0d27f))
* Disable pushing/pulling for layer caching in build. ([#2517](https://github.com/AztecProtocol/aztec-packages/issues/2517)) ([51352ae](https://github.com/AztecProtocol/aztec-packages/commit/51352ae3973c937bbb6a4baee401aff52b54246d))
* **docs:** Fix tutorial in dapp development ([#2421](https://github.com/AztecProtocol/aztec-packages/issues/2421)) ([027530f](https://github.com/AztecProtocol/aztec-packages/commit/027530f1518232a372a7d78551fee6a2d2ee96b0))
* **docs:** Incorporate docs feedback ([#2434](https://github.com/AztecProtocol/aztec-packages/issues/2434)) ([4992d5b](https://github.com/AztecProtocol/aztec-packages/commit/4992d5b59bb73e8f14fc14963a89c9c97268f773))
* Embed yq in repo to avoid network hiccups. ([#2560](https://github.com/AztecProtocol/aztec-packages/issues/2560)) ([84f207f](https://github.com/AztecProtocol/aztec-packages/commit/84f207f629b2b0d5312c8d73e7b620ff255332e8))
* Fix box noir versioning ([#2578](https://github.com/AztecProtocol/aztec-packages/issues/2578)) ([6eaf0c7](https://github.com/AztecProtocol/aztec-packages/commit/6eaf0c7d32a394c36759853ba8d63dde90122f0a))
* Fixing foundry version ([#2528](https://github.com/AztecProtocol/aztec-packages/issues/2528)) ([3af0753](https://github.com/AztecProtocol/aztec-packages/commit/3af0753dfb932ec4a8ba68e55843149daa570268))
* Kill Turbo ([#2442](https://github.com/AztecProtocol/aztec-packages/issues/2442)) ([c832825](https://github.com/AztecProtocol/aztec-packages/commit/c83282582536421ae67bbd936b3059597d908253))
* Move hash utils to aztec-nr ([#2583](https://github.com/AztecProtocol/aztec-packages/issues/2583)) ([78bd1a3](https://github.com/AztecProtocol/aztec-packages/commit/78bd1a36805bd6508155a62bef06cf223bc67948))
* No private key account state ([#2491](https://github.com/AztecProtocol/aztec-packages/issues/2491)) ([5813fb3](https://github.com/AztecProtocol/aztec-packages/commit/5813fb365f63d4921dcfd53b205a15f14065e213))
* Provide cross compile to cjs. ([#2566](https://github.com/AztecProtocol/aztec-packages/issues/2566)) ([47d0d37](https://github.com/AztecProtocol/aztec-packages/commit/47d0d376727dfcb798af4ea019dfc23a9a57b6ca))
* Recursion todos ([#2516](https://github.com/AztecProtocol/aztec-packages/issues/2516)) ([2df107b](https://github.com/AztecProtocol/aztec-packages/commit/2df107b2da73217eb96d39c8ed880f76a2b3e4cd))
* Reenable some ultra honk composer tests ([#2417](https://github.com/AztecProtocol/aztec-packages/issues/2417)) ([31f4c32](https://github.com/AztecProtocol/aztec-packages/commit/31f4c32e2c4a3a91879e842ea2366eb167fdd510))
* Refactor e2e test teardown ([#2513](https://github.com/AztecProtocol/aztec-packages/issues/2513)) ([2e43248](https://github.com/AztecProtocol/aztec-packages/commit/2e432483170d873f15aa1a17ed105699f484add1))
* Remove `BarretenbergBinderSync` import from typescript bindgen file ([#2607](https://github.com/AztecProtocol/aztec-packages/issues/2607)) ([43af1a3](https://github.com/AztecProtocol/aztec-packages/commit/43af1a35c1bbe55cab102bef21375dd9986202ea))
* Remove build system tainting now we have ci cmds in comments. ([#2589](https://github.com/AztecProtocol/aztec-packages/issues/2589)) ([2040335](https://github.com/AztecProtocol/aztec-packages/commit/204033598f09c218aec5c9cc64ebf1c0f6dfbcd3))
* Remove composer keyword from stdlib ([#2418](https://github.com/AztecProtocol/aztec-packages/issues/2418)) ([f3e7d91](https://github.com/AztecProtocol/aztec-packages/commit/f3e7d914e3b8b7f98eacde0dff12a51a04dde93e))
* Remove debug log in world state sync ([#2613](https://github.com/AztecProtocol/aztec-packages/issues/2613)) ([177f468](https://github.com/AztecProtocol/aztec-packages/commit/177f468a8f68ec03bb297ea1fb70002fe58ba22c))
* Remove Standard Honk ([#2435](https://github.com/AztecProtocol/aztec-packages/issues/2435)) ([9b3ee45](https://github.com/AztecProtocol/aztec-packages/commit/9b3ee4579c0a13378eb27b5c24bf9b99a07de350))
* Remove unneeded dockerfiles. ([#2588](https://github.com/AztecProtocol/aztec-packages/issues/2588)) ([d6f903d](https://github.com/AztecProtocol/aztec-packages/commit/d6f903dfd7e7cf5b878d4f25686a1a01b24505ab))
* Rename all the occurrences of `Aztec RPC` ([#2552](https://github.com/AztecProtocol/aztec-packages/issues/2552)) ([8cc4f69](https://github.com/AztecProtocol/aztec-packages/commit/8cc4f694f93499e91026bd6c144a3f646d987588)), closes [#2451](https://github.com/AztecProtocol/aztec-packages/issues/2451)
* Renaming `@aztec/aztec-rpc` package as `@aztec/pxe` ([#2538](https://github.com/AztecProtocol/aztec-packages/issues/2538)) ([0dd70aa](https://github.com/AztecProtocol/aztec-packages/commit/0dd70aa6df929317c350cf1a3731fdd3cd3446d4))
* Resuscitate private kernel tests related to call stack item check ([#2558](https://github.com/AztecProtocol/aztec-packages/issues/2558)) ([9e938fc](https://github.com/AztecProtocol/aztec-packages/commit/9e938fca9654dc4997790806853551f1c5ffbf04))
* Run formatting:fix for box lint ([#2479](https://github.com/AztecProtocol/aztec-packages/issues/2479)) ([3995de9](https://github.com/AztecProtocol/aztec-packages/commit/3995de91ebfed185714b0b2045c1e1243386e778))
* Run quick-start guide in CI ([#2413](https://github.com/AztecProtocol/aztec-packages/issues/2413)) ([5f43715](https://github.com/AztecProtocol/aztec-packages/commit/5f437157fe26d8f2913d0c9199c149dcb2ad9a4f))
* Simulator ([#2534](https://github.com/AztecProtocol/aztec-packages/issues/2534)) ([a26198e](https://github.com/AztecProtocol/aztec-packages/commit/a26198efc5c7f1ae3678eb165173c52ee4cb1e60))
* Switch to upstream docusaurus-plugin-typedoc ([#2557](https://github.com/AztecProtocol/aztec-packages/issues/2557)) ([fdf5fce](https://github.com/AztecProtocol/aztec-packages/commit/fdf5fce49ebdc2013a924fb71d648578cd43806e))
* Token contract storage cleanup ([#2536](https://github.com/AztecProtocol/aztec-packages/issues/2536)) ([0b62207](https://github.com/AztecProtocol/aztec-packages/commit/0b62207aa9969849625a112668298fc294d60fb0))
* Typo ([#2546](https://github.com/AztecProtocol/aztec-packages/issues/2546)) ([8656a3b](https://github.com/AztecProtocol/aztec-packages/commit/8656a3b1f4fce63c3acaed6e81ae77632df05ef5))
* Unskip test and fix params ([#2454](https://github.com/AztecProtocol/aztec-packages/issues/2454)) ([e484c5f](https://github.com/AztecProtocol/aztec-packages/commit/e484c5f656fc1b10b9795727ffcb016d586aaf38))
* Update private token box ([#2385](https://github.com/AztecProtocol/aztec-packages/issues/2385)) ([b730196](https://github.com/AztecProtocol/aztec-packages/commit/b730196305597385e01e8d07c2173af8bf323624))
* Use US spelling ([#2475](https://github.com/AztecProtocol/aztec-packages/issues/2475)) ([2fe8f5e](https://github.com/AztecProtocol/aztec-packages/commit/2fe8f5e41879cc72bd208eb77fb5a2e3261d1cf8)), closes [#1934](https://github.com/AztecProtocol/aztec-packages/issues/1934)


### Documentation

* Capitalizing x in pxe ([#2564](https://github.com/AztecProtocol/aztec-packages/issues/2564)) ([2927cf1](https://github.com/AztecProtocol/aztec-packages/commit/2927cf14e9035d05a39627d46af5063771bc5e0e))
* Common contract errors ([#2471](https://github.com/AztecProtocol/aztec-packages/issues/2471)) ([a8aec70](https://github.com/AztecProtocol/aztec-packages/commit/a8aec70dac829c42874b89119767e4eb5689d4aa)), closes [#2468](https://github.com/AztecProtocol/aztec-packages/issues/2468)
* Fixed original minus underflow test ([#2472](https://github.com/AztecProtocol/aztec-packages/issues/2472)) ([0cf4bdc](https://github.com/AztecProtocol/aztec-packages/commit/0cf4bdc853d864fd4cf73d5af7e261ee2515c0d0))
* Including sandbox diagrams in the sandbox section ([#2573](https://github.com/AztecProtocol/aztec-packages/issues/2573)) ([2fa143e](https://github.com/AztecProtocol/aztec-packages/commit/2fa143e4d88b3089ebbe2a9e53645edf66157dc8))
* Initial storage cleanup ([#2433](https://github.com/AztecProtocol/aztec-packages/issues/2433)) ([d833483](https://github.com/AztecProtocol/aztec-packages/commit/d833483ac51296c3bbb7eedfb6a1f1435a725903))
* Misc docs changes ([#2416](https://github.com/AztecProtocol/aztec-packages/issues/2416)) ([0e789c7](https://github.com/AztecProtocol/aztec-packages/commit/0e789c7c31a6272ec5b063f4583fb2d59e6ba73f))
* More `RPC Server` --&gt; `PXE` naming fixes ([#2574](https://github.com/AztecProtocol/aztec-packages/issues/2574)) ([b33eea5](https://github.com/AztecProtocol/aztec-packages/commit/b33eea595ff9c01d993fd9727e6924e403517d6e))
* Portal messaging ([#2419](https://github.com/AztecProtocol/aztec-packages/issues/2419)) ([7979bb9](https://github.com/AztecProtocol/aztec-packages/commit/7979bb9c356b9e3dd8796eb964d2fd2490fa4295))
* Update instructions ([#2297](https://github.com/AztecProtocol/aztec-packages/issues/2297)) ([ab612df](https://github.com/AztecProtocol/aztec-packages/commit/ab612dff85aa2dec28aefd680764a8477efd86e6)), closes [#1827](https://github.com/AztecProtocol/aztec-packages/issues/1827)
* Update sidebar + embed youtube video ([#2470](https://github.com/AztecProtocol/aztec-packages/issues/2470)) ([a779d11](https://github.com/AztecProtocol/aztec-packages/commit/a779d114584742e41e5489ce36821d8554772ea0))

## [0.7.10](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.7.9...aztec-packages-v0.7.10) (2023-09-20)


### Features

* Aztec-cli unbox "really empty box" ([#2388](https://github.com/AztecProtocol/aztec-packages/issues/2388)) ([b57182d](https://github.com/AztecProtocol/aztec-packages/commit/b57182d6dff9fc27d5fb555a4c4cb948d9e5cc55))
* **docs:** Document noir macros  ([#2016](https://github.com/AztecProtocol/aztec-packages/issues/2016)) ([1f1a17f](https://github.com/AztecProtocol/aztec-packages/commit/1f1a17fe056d8898c4c065fb6244e53da04800cb))
* **docs:** Include aztec rpc interface typedoc output in docs ([#2255](https://github.com/AztecProtocol/aztec-packages/issues/2255)) ([62c9e9b](https://github.com/AztecProtocol/aztec-packages/commit/62c9e9bfdc9535ccfc6bd76782971e22478a7784))
* **token portal standard:** Create a token portal standard ([#2351](https://github.com/AztecProtocol/aztec-packages/issues/2351)) ([426a3ea](https://github.com/AztecProtocol/aztec-packages/commit/426a3ea6a5c3529b4edaea94affaece97d39a35b))


### Bug Fixes

* **build:** Fix build system post deployment tests ([#2420](https://github.com/AztecProtocol/aztec-packages/issues/2420)) ([d509dc3](https://github.com/AztecProtocol/aztec-packages/commit/d509dc359c4cd9dc37492a434a1eb3813c002839))
* CLI encoding for arrays and structs ([#2407](https://github.com/AztecProtocol/aztec-packages/issues/2407)) ([85283bd](https://github.com/AztecProtocol/aztec-packages/commit/85283bdd5b0916c207dca11ad17338f524ae18f6))
* Correct sandbox addresses in up-quick-start test ([#2412](https://github.com/AztecProtocol/aztec-packages/issues/2412)) ([974d859](https://github.com/AztecProtocol/aztec-packages/commit/974d85922fc11734c543e7ce9fe7edaad527bd69))
* **docs:** Revert include aztec rpc interface typedoc output in docs ([#2255](https://github.com/AztecProtocol/aztec-packages/issues/2255)) ([f852432](https://github.com/AztecProtocol/aztec-packages/commit/f85243298ef2a5c01764e592c6f6ea50d835bf07))
* Handle falsy bigints in json-rpc ([#2403](https://github.com/AztecProtocol/aztec-packages/issues/2403)) ([d100650](https://github.com/AztecProtocol/aztec-packages/commit/d100650d107b6685e17fcdbbf68363505c5ed0ed)), closes [#2402](https://github.com/AztecProtocol/aztec-packages/issues/2402)
* **nargo_check.sh:** UNIX standard grep ([#2396](https://github.com/AztecProtocol/aztec-packages/issues/2396)) ([02e788a](https://github.com/AztecProtocol/aztec-packages/commit/02e788a8e39c7fcb5c75a6aaf4ceb705a8ebaa4a))


### Miscellaneous

* **docs:** Note getter options ([#2411](https://github.com/AztecProtocol/aztec-packages/issues/2411)) ([8a95d8c](https://github.com/AztecProtocol/aztec-packages/commit/8a95d8cb6287689b90149b44968cab4ba3e13e28))
* Update docs url in config  ([#2386](https://github.com/AztecProtocol/aztec-packages/issues/2386)) ([e44066d](https://github.com/AztecProtocol/aztec-packages/commit/e44066da3cca70a8494c6822b3bc231679acaf16))

## [0.7.9](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.7.8...aztec-packages-v0.7.9) (2023-09-19)


### Bug Fixes

* Don't cache contract witnesses ([#2398](https://github.com/AztecProtocol/aztec-packages/issues/2398)) ([1092060](https://github.com/AztecProtocol/aztec-packages/commit/1092060ec88e4d9d48b9bbaf1345cf058003cc82)), closes [#2397](https://github.com/AztecProtocol/aztec-packages/issues/2397)

## [0.7.8](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.7.7...aztec-packages-v0.7.8) (2023-09-19)


### Features

* `NodeInfo` cleanup ([#2370](https://github.com/AztecProtocol/aztec-packages/issues/2370)) ([89fe978](https://github.com/AztecProtocol/aztec-packages/commit/89fe978b12919b7b4838b95438635f8489d27229))
* Allow custom ports in sandbox ([#2393](https://github.com/AztecProtocol/aztec-packages/issues/2393)) ([41ef378](https://github.com/AztecProtocol/aztec-packages/commit/41ef378a01db6a87a8620d7fb676784222a3b7f4))
* Allow tracing build system with [debug ci] ([#2389](https://github.com/AztecProtocol/aztec-packages/issues/2389)) ([ce311a9](https://github.com/AztecProtocol/aztec-packages/commit/ce311a9b44a8f0327235ccd3bb8f9a8fca97443e))
* **docs:** Show current noir version for aztec in docs ([#2379](https://github.com/AztecProtocol/aztec-packages/issues/2379)) ([5c7b2ab](https://github.com/AztecProtocol/aztec-packages/commit/5c7b2ab566fc6ce870c7d6f121f86b721bf3e660))


### Bug Fixes

* Build script exiting on failed grep ([#2384](https://github.com/AztecProtocol/aztec-packages/issues/2384)) ([e70a781](https://github.com/AztecProtocol/aztec-packages/commit/e70a781765a83cbe45e78e3a560bd6191fd9211e))
* Bump e2e_sandbox_example.test.ts timeout ([#2391](https://github.com/AztecProtocol/aztec-packages/issues/2391)) ([9a1bb62](https://github.com/AztecProtocol/aztec-packages/commit/9a1bb6282b8df4d4b1eb7d2df8e4197e29032ba2))
* Compile script for the unboxed project ([#2380](https://github.com/AztecProtocol/aztec-packages/issues/2380)) ([2801da2](https://github.com/AztecProtocol/aztec-packages/commit/2801da2c5a307f8bc5691f73f9273391345acf59))
* **Docs:** Nargo.toml docs fix ([#2334](https://github.com/AztecProtocol/aztec-packages/issues/2334)) ([af24b5a](https://github.com/AztecProtocol/aztec-packages/commit/af24b5a12f04ff97333a7631fe634f1440c9df35))
* Force_deploy_build error ([#2375](https://github.com/AztecProtocol/aztec-packages/issues/2375)) ([4d1cbf9](https://github.com/AztecProtocol/aztec-packages/commit/4d1cbf9742cb2a39e936a971e2f954d362f8f08b))
* Propagate [debug ci] thru spot ([#2395](https://github.com/AztecProtocol/aztec-packages/issues/2395)) ([fe5eedd](https://github.com/AztecProtocol/aztec-packages/commit/fe5eedd202ab26d3e27a195f482ea3e75df74d9b))
* Remove non-npm packages from end-to-end during canary flow ([#2394](https://github.com/AztecProtocol/aztec-packages/issues/2394)) ([e3f97f2](https://github.com/AztecProtocol/aztec-packages/commit/e3f97f26f016025353851327e24adbb8e752301f))
* Update aztec sandbox getting started markdown ([#2374](https://github.com/AztecProtocol/aztec-packages/issues/2374)) ([a3c6bcf](https://github.com/AztecProtocol/aztec-packages/commit/a3c6bcf88ea1003b3f134cbd29ae1a39680f5b9f))


### Miscellaneous

* Adds on-brand design to private token project ([#2355](https://github.com/AztecProtocol/aztec-packages/issues/2355)) ([072e313](https://github.com/AztecProtocol/aztec-packages/commit/072e313515871b54473ee7662f5bdd4bfa21e3e7))
* Docs restructure ([#2322](https://github.com/AztecProtocol/aztec-packages/issues/2322)) ([1368b55](https://github.com/AztecProtocol/aztec-packages/commit/1368b55d0a9bc9ea61e29bb095ca62aa6902645f))


### Documentation

* Updated noirup command ([#2339](https://github.com/AztecProtocol/aztec-packages/issues/2339)) ([5308c21](https://github.com/AztecProtocol/aztec-packages/commit/5308c21d4dc225233af8ae584c471e7bed5d9381))

## [0.7.7](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.7.6...aztec-packages-v0.7.7) (2023-09-18)


### Bug Fixes

* Deploy_npm script variable ([#2372](https://github.com/AztecProtocol/aztec-packages/issues/2372)) ([b46e06d](https://github.com/AztecProtocol/aztec-packages/commit/b46e06d4e3caedb0584b1e7e28ac035ed264f682))

## [0.7.6](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.7.5...aztec-packages-v0.7.6) (2023-09-18)


### Features

* New api to get note nonces ([#2327](https://github.com/AztecProtocol/aztec-packages/issues/2327)) ([8f5eb28](https://github.com/AztecProtocol/aztec-packages/commit/8f5eb28fae2cdcd549241a85b8b2343c7b661aac))
* Replace private token in testing ([#2304](https://github.com/AztecProtocol/aztec-packages/issues/2304)) ([934ba96](https://github.com/AztecProtocol/aztec-packages/commit/934ba96ad6a6843edfed81aef179d826ce6c4cea))


### Bug Fixes

* Exit with error log when COMMIT_TAG is not set properly on canary ([#2371](https://github.com/AztecProtocol/aztec-packages/issues/2371)) ([68fe053](https://github.com/AztecProtocol/aztec-packages/commit/68fe053f8bf7830659a98a9aae8a7c3fbdfe664c))
* Preserve public function call ordering in account entrypoint ([#2348](https://github.com/AztecProtocol/aztec-packages/issues/2348)) ([5b2cf75](https://github.com/AztecProtocol/aztec-packages/commit/5b2cf758b54a810693cb296bb5a2985c5d882dee))
* Return output-debug flag ([#2364](https://github.com/AztecProtocol/aztec-packages/issues/2364)) ([af86580](https://github.com/AztecProtocol/aztec-packages/commit/af86580814d6f63f15a9ae2476f91c58c835bf82))
* Revert "fix: strip leading 'v' from dockerhub tags" ([#2367](https://github.com/AztecProtocol/aztec-packages/issues/2367)) ([53bc041](https://github.com/AztecProtocol/aztec-packages/commit/53bc041af5d7f7ad66baf5076130cf627f8f65d5))
* Stale CLI docs ([#2336](https://github.com/AztecProtocol/aztec-packages/issues/2336)) ([f38873b](https://github.com/AztecProtocol/aztec-packages/commit/f38873b1751a7604cba3aed888323c7cd106b689))
* Strip leading 'v' from dockerhub tags ([#2360](https://github.com/AztecProtocol/aztec-packages/issues/2360)) ([a4bb05c](https://github.com/AztecProtocol/aztec-packages/commit/a4bb05ca2bda0f4e5ccd15c01bf1faadaa664354))


### Miscellaneous

* Added docs for artifact files ([#2362](https://github.com/AztecProtocol/aztec-packages/issues/2362)) ([6d3ba3f](https://github.com/AztecProtocol/aztec-packages/commit/6d3ba3fc833aa4f103c6b84065bb2dd0bea0f6b4)), closes [#2190](https://github.com/AztecProtocol/aztec-packages/issues/2190)
* **aztec_noir:** Remove inputs from consume l1 to l2 message  ([#2354](https://github.com/AztecProtocol/aztec-packages/issues/2354)) ([2235f7c](https://github.com/AztecProtocol/aztec-packages/commit/2235f7cd0cdf5dfdd3188d3f606673e94e25c47d))
* Remove "as unknown" casts for ABIs where possible ([#2331](https://github.com/AztecProtocol/aztec-packages/issues/2331)) ([bf2651e](https://github.com/AztecProtocol/aztec-packages/commit/bf2651e714e148cdd0a625a435fe1ee64d762ffb))
* Script to extract tag version ([#2368](https://github.com/AztecProtocol/aztec-packages/issues/2368)) ([4b686b0](https://github.com/AztecProtocol/aztec-packages/commit/4b686b0d17f5a0811bfeef6bbe50d29b44cd7753))
* Share e2e code with canary ([#2299](https://github.com/AztecProtocol/aztec-packages/issues/2299)) ([21224de](https://github.com/AztecProtocol/aztec-packages/commit/21224dea64318a5956a705d0b413dd0e7bcf795c))

## [0.7.5](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.7.4...aztec-packages-v0.7.5) (2023-09-15)


### Features

* Protogalaxy interfaces ([#2125](https://github.com/AztecProtocol/aztec-packages/issues/2125)) ([b45dd26](https://github.com/AztecProtocol/aztec-packages/commit/b45dd26214119f0c52c2c4f48ff11f650912fef9))
* Renamed `nargoVersion` as `compatibleNargoVersion` ([#2338](https://github.com/AztecProtocol/aztec-packages/issues/2338)) ([6f9e0f1](https://github.com/AztecProtocol/aztec-packages/commit/6f9e0f1bbb721f72b9951caed64921f311a4a30b))


### Bug Fixes

* Add retry around docker login and revive spot_run_test_script ([#2346](https://github.com/AztecProtocol/aztec-packages/issues/2346)) ([79e5f05](https://github.com/AztecProtocol/aztec-packages/commit/79e5f05c70cdc4bfb1bd6635d900b593dc8ada6b))
* Unbox command. ([#2337](https://github.com/AztecProtocol/aztec-packages/issues/2337)) ([e9bc9c6](https://github.com/AztecProtocol/aztec-packages/commit/e9bc9c60fd1f79592ffe828a59618320ff26327b))


### Miscellaneous

* Increase guides-dapp-testing test timeout ([#2343](https://github.com/AztecProtocol/aztec-packages/issues/2343)) ([1cebe2c](https://github.com/AztecProtocol/aztec-packages/commit/1cebe2c22a93686f36c952a912540bb129768ee4))
* Use retries by default on rpc client fetch ([#2342](https://github.com/AztecProtocol/aztec-packages/issues/2342)) ([f4ffd68](https://github.com/AztecProtocol/aztec-packages/commit/f4ffd68f1c4fe75a53caa1bec32f246aa5f0c818))

## [0.7.4](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.7.3...aztec-packages-v0.7.4) (2023-09-15)


### Features

* Elliptic Curve Virtual Machine Circuit ([#1268](https://github.com/AztecProtocol/aztec-packages/issues/1268)) ([f85ecd9](https://github.com/AztecProtocol/aztec-packages/commit/f85ecd921271ec94b551992bcfe16c2b56f72d2e))
* Exposing nargo version via `NodeInfo` ([#2333](https://github.com/AztecProtocol/aztec-packages/issues/2333)) ([1c2669c](https://github.com/AztecProtocol/aztec-packages/commit/1c2669c4b442c022f9f501f0b8caf102a08e0b0c)), closes [#2332](https://github.com/AztecProtocol/aztec-packages/issues/2332)
* Migrate accounts to auth witness ([#2281](https://github.com/AztecProtocol/aztec-packages/issues/2281)) ([91152af](https://github.com/AztecProtocol/aztec-packages/commit/91152afbdde0313972007d265230276c6160eb2c)), closes [#2043](https://github.com/AztecProtocol/aztec-packages/issues/2043)


### Bug Fixes

* Aztec-nr mirror url ([#2321](https://github.com/AztecProtocol/aztec-packages/issues/2321)) ([aaf7f67](https://github.com/AztecProtocol/aztec-packages/commit/aaf7f67fcb0e226f9094feeff6795957dfd9d67e))
* **build:** Fixed paths on s3 deployments ([#2335](https://github.com/AztecProtocol/aztec-packages/issues/2335)) ([38c7979](https://github.com/AztecProtocol/aztec-packages/commit/38c7979c03f7e1c5ffbaf8537cd91ed1574e0c95))


### Miscellaneous

* Do not format boxes with global format ([#2326](https://github.com/AztecProtocol/aztec-packages/issues/2326)) ([2fe845f](https://github.com/AztecProtocol/aztec-packages/commit/2fe845f2f0cb46c8940826045a703de333b8b0f5))
* Remove native token ([#2280](https://github.com/AztecProtocol/aztec-packages/issues/2280)) ([4032d01](https://github.com/AztecProtocol/aztec-packages/commit/4032d014c29a2a1eddb13881d6e469b35177f207))
* Rename getAccounts to getRegisteredAccounts ([#2330](https://github.com/AztecProtocol/aztec-packages/issues/2330)) ([c7f3776](https://github.com/AztecProtocol/aztec-packages/commit/c7f37769df6584a8c3f0a970d8694a2b455f00d3))

## [0.7.3](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.7.2...aztec-packages-v0.7.3) (2023-09-15)


### Features

* Constraining note owner ([#1896](https://github.com/AztecProtocol/aztec-packages/issues/1896)) ([cb25bc9](https://github.com/AztecProtocol/aztec-packages/commit/cb25bc9b679e7d559357a7ed9be5c8cf4ebc69d3)), closes [#1817](https://github.com/AztecProtocol/aztec-packages/issues/1817)


### Bug Fixes

* **build:** Navigate to correct directory for publishing ([#2318](https://github.com/AztecProtocol/aztec-packages/issues/2318)) ([f555356](https://github.com/AztecProtocol/aztec-packages/commit/f555356a78c68660b0a324c45a6dce29fb8df518))
* Use bool for set_minter ([#2313](https://github.com/AztecProtocol/aztec-packages/issues/2313)) ([5b18f9e](https://github.com/AztecProtocol/aztec-packages/commit/5b18f9e697404a5ad7d2dbe4f8f3875edcf8c58c))

## [0.7.2](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.7.1...aztec-packages-v0.7.2) (2023-09-14)


### Features

* ASAN build ([#2307](https://github.com/AztecProtocol/aztec-packages/issues/2307)) ([274c89f](https://github.com/AztecProtocol/aztec-packages/commit/274c89f1916d8af2054d9773dc632f87bb3bf2fc))


### Bug Fixes

* **build:** Attempt to fix deployments ([#2309](https://github.com/AztecProtocol/aztec-packages/issues/2309)) ([39f16f9](https://github.com/AztecProtocol/aztec-packages/commit/39f16f9f642ff348920e1cd4511df9d0f72bacf9))

## [0.7.1](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.7.0...aztec-packages-v0.7.1) (2023-09-14)


### Features

* Build system handles dynamic deps first class. ([#2283](https://github.com/AztecProtocol/aztec-packages/issues/2283)) ([f66077a](https://github.com/AztecProtocol/aztec-packages/commit/f66077a6f7bfd446eec81dd4f09723322fc0c980))
* Build_manifest default tweaks. ([#2287](https://github.com/AztecProtocol/aztec-packages/issues/2287)) ([c8a5cfb](https://github.com/AztecProtocol/aztec-packages/commit/c8a5cfb375b498475503c12cc83fcdba39f2ec5f))
* **build:** Build multi-architecture docker images for aztec-sandbox ([#2305](https://github.com/AztecProtocol/aztec-packages/issues/2305)) ([8ee61b8](https://github.com/AztecProtocol/aztec-packages/commit/8ee61b85f682fec0c03eb831f417ba2938658310))
* Cli "unbox" command ([#2029](https://github.com/AztecProtocol/aztec-packages/issues/2029)) ([26ab88f](https://github.com/AztecProtocol/aztec-packages/commit/26ab88fd5b8d5be7f20cd6f6e4335d344f2219c7))
* Creating an SMT verification module ([#1932](https://github.com/AztecProtocol/aztec-packages/issues/1932)) ([4642b61](https://github.com/AztecProtocol/aztec-packages/commit/4642b61a60534daeec8edd9541f283058d0d66bd))
* Token standard ([#2069](https://github.com/AztecProtocol/aztec-packages/issues/2069)) ([5e8fbf2](https://github.com/AztecProtocol/aztec-packages/commit/5e8fbf2d387aeb0ae0cb1432525c39f82eb7baa1))


### Bug Fixes

* Ensure_note_hash_exists ([#2256](https://github.com/AztecProtocol/aztec-packages/issues/2256)) ([271b060](https://github.com/AztecProtocol/aztec-packages/commit/271b060f2642570f58e38881cbb3477745b84ddf))
* Msgpack stack blowups on schema gen ([#2259](https://github.com/AztecProtocol/aztec-packages/issues/2259)) ([1afc566](https://github.com/AztecProtocol/aztec-packages/commit/1afc566df942e82f70d2e82e33c0e39539714ad5))
* Noir bootstrap ([#2274](https://github.com/AztecProtocol/aztec-packages/issues/2274)) ([f85db49](https://github.com/AztecProtocol/aztec-packages/commit/f85db4972411c863585e968fe2535e68c467b028))
* Workaround sequencer timeout ([#2269](https://github.com/AztecProtocol/aztec-packages/issues/2269)) ([9fc3f3d](https://github.com/AztecProtocol/aztec-packages/commit/9fc3f3d6652e592d674a9f5f2a55bd1994b7060d))


### Miscellaneous

* Bump nargo to 0.11.1-aztec.0 ([#2298](https://github.com/AztecProtocol/aztec-packages/issues/2298)) ([8b76a12](https://github.com/AztecProtocol/aztec-packages/commit/8b76a124390102574efcc8078bc9bc47c8e7ba35))
* **ci:** Mirror Aztec-nr ([#2270](https://github.com/AztecProtocol/aztec-packages/issues/2270)) ([c57f027](https://github.com/AztecProtocol/aztec-packages/commit/c57f027af9a9796ddef970db24e56be954215760))
* **circuits:** Base rollup cbind msgpack ([#2263](https://github.com/AztecProtocol/aztec-packages/issues/2263)) ([0d4c707](https://github.com/AztecProtocol/aztec-packages/commit/0d4c707079ff1ff4212fc3345066b0deded98449))
* **circuits:** Clean up of some superfluous header includes ([#2302](https://github.com/AztecProtocol/aztec-packages/issues/2302)) ([5e53345](https://github.com/AztecProtocol/aztec-packages/commit/5e53345270873a3af2b47f6f078e3b4f1cc973d0))
* **circuits:** Removing assertMemberLength on Tuple objects ([#2296](https://github.com/AztecProtocol/aztec-packages/issues/2296)) ([0247b85](https://github.com/AztecProtocol/aztec-packages/commit/0247b859d88781740fa990801a24881c09c5ca3c))
* Consolidate mirror repos on a nightly schedule ([#1994](https://github.com/AztecProtocol/aztec-packages/issues/1994)) ([1a586c4](https://github.com/AztecProtocol/aztec-packages/commit/1a586c4197f2e093521e921e7ef21599be71e5b5))
* **docs:** Rename to aztec.nr ([#1943](https://github.com/AztecProtocol/aztec-packages/issues/1943)) ([a91db48](https://github.com/AztecProtocol/aztec-packages/commit/a91db48d1943fdc2e39535a153216b7aaca40de4))
* Move barretenberg to top of repo. Make circuits build off barretenberg build. ([#2221](https://github.com/AztecProtocol/aztec-packages/issues/2221)) ([404ec34](https://github.com/AztecProtocol/aztec-packages/commit/404ec34d38e1a9c3fbe7a3cdb6e88c28f62f72e4))
* Replace native token in lending contract ([#2276](https://github.com/AztecProtocol/aztec-packages/issues/2276)) ([c46b3c8](https://github.com/AztecProtocol/aztec-packages/commit/c46b3c8f848e7ff240eb466fa2f3f8aad96dc328))
* **subrepo:** Push aztec-nr, update default branches  ([#2300](https://github.com/AztecProtocol/aztec-packages/issues/2300)) ([80c9b77](https://github.com/AztecProtocol/aztec-packages/commit/80c9b77c3e6adc755ec80f02a7f8261a7e8581c4))
* Updated `acvm_js` ([#2272](https://github.com/AztecProtocol/aztec-packages/issues/2272)) ([9f1a3a5](https://github.com/AztecProtocol/aztec-packages/commit/9f1a3a5e4b72506489645f8be8c8aa5129a2e179))

## [0.7.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.6.7...aztec-packages-v0.7.0) (2023-09-13)


### ⚠ BREAKING CHANGES

* **aztec-noir:** rename noir-aztec to aztec-noir ([#2071](https://github.com/AztecProtocol/aztec-packages/issues/2071))

### Features

* **build:** Use LTS version of ubuntu ([#2239](https://github.com/AztecProtocol/aztec-packages/issues/2239)) ([ce6671e](https://github.com/AztecProtocol/aztec-packages/commit/ce6671e6ab72fcdc8114df5b6a45f81c0086b19d))
* **ci:** Run nargo test in ci on all packages  ([#2197](https://github.com/AztecProtocol/aztec-packages/issues/2197)) ([cca55f2](https://github.com/AztecProtocol/aztec-packages/commit/cca55f225f7277cfb44b44e4d1f50d5527afdb8b))
* **cli:** Add commands for generating ts and nr interfaces ([#2241](https://github.com/AztecProtocol/aztec-packages/issues/2241)) ([c11b70d](https://github.com/AztecProtocol/aztec-packages/commit/c11b70d8186ef7ab9a9d4ab1a09589e7c47e91bb)), closes [#2183](https://github.com/AztecProtocol/aztec-packages/issues/2183)
* **cli:** Inspect contract command ([#2248](https://github.com/AztecProtocol/aztec-packages/issues/2248)) ([381706e](https://github.com/AztecProtocol/aztec-packages/commit/381706eaaad7054d620855f7b986e2df3cf62a91)), closes [#2180](https://github.com/AztecProtocol/aztec-packages/issues/2180)
* Define specific Sandbox version when running docker-compose up ([#2238](https://github.com/AztecProtocol/aztec-packages/issues/2238)) ([71da236](https://github.com/AztecProtocol/aztec-packages/commit/71da2360986e5b57f211ca095b95ade2617f4eb8))
* **docs:** Updated docs explaining Sandbox accounts ([#2235](https://github.com/AztecProtocol/aztec-packages/issues/2235)) ([f560066](https://github.com/AztecProtocol/aztec-packages/commit/f560066394c3fc9725be18f320597794e29dc077))
* Optimize sandbox startup time by only initializing the BB solver once. ([#2240](https://github.com/AztecProtocol/aztec-packages/issues/2240)) ([e9cac9c](https://github.com/AztecProtocol/aztec-packages/commit/e9cac9ced3604fdef1d6b298091639fc510cb4fb))
* Remove entrypoint collection ([#2148](https://github.com/AztecProtocol/aztec-packages/issues/2148)) ([e97c94d](https://github.com/AztecProtocol/aztec-packages/commit/e97c94d8bc0659a95f457ba63369fca0dfba47c8))
* Validate nargo version against expected one ([#2254](https://github.com/AztecProtocol/aztec-packages/issues/2254)) ([011c0b7](https://github.com/AztecProtocol/aztec-packages/commit/011c0b7c070f004fcc1c6f9ce8936830c9f496f6))


### Bug Fixes

* Add cjs-entry to bbjs package files ([#2237](https://github.com/AztecProtocol/aztec-packages/issues/2237)) ([ae16193](https://github.com/AztecProtocol/aztec-packages/commit/ae16193b3cdb2da3d57a1c74f7e71f139ced54d1))
* Add link to example contracts in the monorepo ([#2219](https://github.com/AztecProtocol/aztec-packages/issues/2219)) ([8aede54](https://github.com/AztecProtocol/aztec-packages/commit/8aede5470d8e7d88227bf807c3c6cb5dec77a93d))
* **build:** Update ubuntu version used in Docker builds ([#2236](https://github.com/AztecProtocol/aztec-packages/issues/2236)) ([dbe80b7](https://github.com/AztecProtocol/aztec-packages/commit/dbe80b739e97474b29e6a4125ac0d2f16e248b32))
* **docs:** Use code snippet macros in bridge docs ([#2205](https://github.com/AztecProtocol/aztec-packages/issues/2205)) ([0c3a627](https://github.com/AztecProtocol/aztec-packages/commit/0c3a6271a1d90fa95a0163606e49f432573e66da))
* Format barretenberg ([#2209](https://github.com/AztecProtocol/aztec-packages/issues/2209)) ([0801372](https://github.com/AztecProtocol/aztec-packages/commit/08013725091c7e80c1e83145ffbf3983cf1e7fe3))
* Msgpack blowup with bigger objects ([#2207](https://github.com/AztecProtocol/aztec-packages/issues/2207)) ([b909937](https://github.com/AztecProtocol/aztec-packages/commit/b909937ba53b896e11e6b65db08b8f2bb83218d5))
* Refactor constraints in scalar mul to use the high limb ([#2161](https://github.com/AztecProtocol/aztec-packages/issues/2161)) ([1d0e25d](https://github.com/AztecProtocol/aztec-packages/commit/1d0e25d9fad69aebccacf9f646e3291ea89716ca))
* Reinstate v stripping in build ([#2220](https://github.com/AztecProtocol/aztec-packages/issues/2220)) ([13d34f5](https://github.com/AztecProtocol/aztec-packages/commit/13d34f56855bf5c86f04eec15c70b06ded7c955e))
* Return partial witnesses based on the content of read requests. ([#2164](https://github.com/AztecProtocol/aztec-packages/issues/2164)) ([a2125f7](https://github.com/AztecProtocol/aztec-packages/commit/a2125f7611ad9ab3f479b806cbcc7ff1f97db57e))
* Try e2e cli timeout bump ([#2210](https://github.com/AztecProtocol/aztec-packages/issues/2210)) ([a039fdd](https://github.com/AztecProtocol/aztec-packages/commit/a039fdd5d39a57eb25119e990acf309e3447b244))
* Try workaround sample dapp ci timeout ([#2208](https://github.com/AztecProtocol/aztec-packages/issues/2208)) ([e39f6bf](https://github.com/AztecProtocol/aztec-packages/commit/e39f6bf3be2e577e9dffa2d4815b11eb442b5152))


### Miscellaneous

* Add a Nargo workspace in `noir-contracts` ([#2083](https://github.com/AztecProtocol/aztec-packages/issues/2083)) ([728a79c](https://github.com/AztecProtocol/aztec-packages/commit/728a79ca16c962462090b25959d1eab0f1e9f47f))
* Add debugging to run_tests ([#2212](https://github.com/AztecProtocol/aztec-packages/issues/2212)) ([1c5e78a](https://github.com/AztecProtocol/aztec-packages/commit/1c5e78a4ac01bee4b785857447efdb02d8d9cb35))
* **aztec-noir:** Rename noir-aztec to aztec-noir ([#2071](https://github.com/AztecProtocol/aztec-packages/issues/2071)) ([e1e14d2](https://github.com/AztecProtocol/aztec-packages/commit/e1e14d2c7fb44d56b9a10a645676d3551830bb10))
* **circuits:** Merge and root rollup cbind msgpack ([#2192](https://github.com/AztecProtocol/aztec-packages/issues/2192)) ([4f3ecee](https://github.com/AztecProtocol/aztec-packages/commit/4f3eceefe1914dcd1ae3a9c7ae2d91861c25f1d3))
* **noir-contracts:** 1655 - rename functions to make hack clearer for publicly created notes ([#2230](https://github.com/AztecProtocol/aztec-packages/issues/2230)) ([707bc09](https://github.com/AztecProtocol/aztec-packages/commit/707bc09a3c4b5a6460154931db55ee48842ee041))
* Run the test for zero division with mul div up ([#2206](https://github.com/AztecProtocol/aztec-packages/issues/2206)) ([747de6a](https://github.com/AztecProtocol/aztec-packages/commit/747de6aa4b7da488d0f4bc7c545c7e0f4eed4ca9))
* Update url for acir artifacts ([#2231](https://github.com/AztecProtocol/aztec-packages/issues/2231)) ([5e0abd3](https://github.com/AztecProtocol/aztec-packages/commit/5e0abd35dec449a665760e5ee51eeff89c76532c))
* Use workspace build with `nargo compile --workspace` ([#2266](https://github.com/AztecProtocol/aztec-packages/issues/2266)) ([9ab66a0](https://github.com/AztecProtocol/aztec-packages/commit/9ab66a05993cebfd7e126fad4b3cdc6bb1e37faa))


### Documentation

* Dapp tutorial ([#2109](https://github.com/AztecProtocol/aztec-packages/issues/2109)) ([573dbc2](https://github.com/AztecProtocol/aztec-packages/commit/573dbc20a2b5ebae0e967e320da75febd5361eaf)), closes [#2051](https://github.com/AztecProtocol/aztec-packages/issues/2051)
* Minor fixes to dapp tutorial ([#2203](https://github.com/AztecProtocol/aztec-packages/issues/2203)) ([dcc927c](https://github.com/AztecProtocol/aztec-packages/commit/dcc927c9aa347cd305cecd260cfedfb5cda0454f))

## [0.6.7](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.6.6...aztec-packages-v0.6.7) (2023-09-11)


### Features

* Testing commands in CLI docs ([#2119](https://github.com/AztecProtocol/aztec-packages/issues/2119)) ([73328db](https://github.com/AztecProtocol/aztec-packages/commit/73328dbe4e509235329e32ff88f823d849a2b673))


### Bug Fixes

* Add homepage url to aztec.js package.json ([#2196](https://github.com/AztecProtocol/aztec-packages/issues/2196)) ([7361302](https://github.com/AztecProtocol/aztec-packages/commit/7361302b0b06bc218d287da56cabd7f567cd6aa3))
* **ci:** Add install backend step in noir rebuild ([#2182](https://github.com/AztecProtocol/aztec-packages/issues/2182)) ([27b8bed](https://github.com/AztecProtocol/aztec-packages/commit/27b8bed05fea4f44f36894739613b07cdb8089ac))
* Use Github Bot token for dispatch workflow ([#2171](https://github.com/AztecProtocol/aztec-packages/issues/2171)) ([e6af616](https://github.com/AztecProtocol/aztec-packages/commit/e6af6164095a706109a6f61ef7e1196de67716dc))

## [0.6.6](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.6.5...aztec-packages-v0.6.6) (2023-09-11)


### Features

* **noir:** Introduce context union to simplify storage declarations ([#2143](https://github.com/AztecProtocol/aztec-packages/issues/2143)) ([2288e44](https://github.com/AztecProtocol/aztec-packages/commit/2288e44a5b817076c9d51db5f99905deeeffc418)), closes [#2012](https://github.com/AztecProtocol/aztec-packages/issues/2012)


### Bug Fixes

* **test:** Fix regex in canary test ([#2165](https://github.com/AztecProtocol/aztec-packages/issues/2165)) ([e5f50df](https://github.com/AztecProtocol/aztec-packages/commit/e5f50df55e68f6c94b602fc16b33abbcea15674e))

## [0.6.5](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.6.4...aztec-packages-v0.6.5) (2023-09-08)


### Bug Fixes

* Revert "fix: commit tags and rebuilds" ([#2159](https://github.com/AztecProtocol/aztec-packages/issues/2159)) ([50396a0](https://github.com/AztecProtocol/aztec-packages/commit/50396a068f11216947eac0137baa198424da9b81))

## [0.6.4](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.6.3...aztec-packages-v0.6.4) (2023-09-08)


### Bug Fixes

* Commit tags and rebuilds ([#2156](https://github.com/AztecProtocol/aztec-packages/issues/2156)) ([7669b43](https://github.com/AztecProtocol/aztec-packages/commit/7669b43253f8c2633e96f483ec12c75478dcf539))

## [0.6.3](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.6.2...aztec-packages-v0.6.3) (2023-09-08)


### Bug Fixes

* Revert bad spot-ification ([#2153](https://github.com/AztecProtocol/aztec-packages/issues/2153)) ([d993d47](https://github.com/AztecProtocol/aztec-packages/commit/d993d47b4df93544c9d0128460eefea286212d77))

## [0.6.2](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.6.1...aztec-packages-v0.6.2) (2023-09-08)


### Bug Fixes

* Setup_env commit check ([#2149](https://github.com/AztecProtocol/aztec-packages/issues/2149)) ([08ade47](https://github.com/AztecProtocol/aztec-packages/commit/08ade4706e250945be3764587b6863b824092fdd))

## [0.6.1](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.5.2...aztec-packages-v0.6.1) (2023-09-08)


### Features

* Example card game ([#2135](https://github.com/AztecProtocol/aztec-packages/issues/2135)) ([9084b89](https://github.com/AztecProtocol/aztec-packages/commit/9084b89da80953cb781913ba526f77a9a3b12714))


### Bug Fixes

* Retry with git checkout ([#2147](https://github.com/AztecProtocol/aztec-packages/issues/2147)) ([9df0431](https://github.com/AztecProtocol/aztec-packages/commit/9df04312d4d5b4d824725bebd5739e56243c0dce))
* **tests:** Increase test timeout ([#2144](https://github.com/AztecProtocol/aztec-packages/issues/2144)) ([7da9615](https://github.com/AztecProtocol/aztec-packages/commit/7da96152ccc65594e4d7cf80e1931fe5eadfd684))
* Work around intermittent wasm webkit issue ([#2140](https://github.com/AztecProtocol/aztec-packages/issues/2140)) ([a9b0934](https://github.com/AztecProtocol/aztec-packages/commit/a9b09344c80d8628f95f859d4e2d455d61f9e7c6))


### Miscellaneous

* **build:** Updated release please config ([#2142](https://github.com/AztecProtocol/aztec-packages/issues/2142)) ([e119c4f](https://github.com/AztecProtocol/aztec-packages/commit/e119c4f7af0b0f8007abf43c0cad9c0ac6f4e6ac))
* **build:** Updated version check ([#2145](https://github.com/AztecProtocol/aztec-packages/issues/2145)) ([4ed5f05](https://github.com/AztecProtocol/aztec-packages/commit/4ed5f0548cf7e8a9c65f176f469103363a42bc5f))
* **master:** Release 0.5.2 ([#2141](https://github.com/AztecProtocol/aztec-packages/issues/2141)) ([451aad6](https://github.com/AztecProtocol/aztec-packages/commit/451aad6ea92ebced9839ca14baae10cee327be35))
* Release 0.5.2 ([f76b53c](https://github.com/AztecProtocol/aztec-packages/commit/f76b53c985116ac131a9b11b2a255feb7d0f8f13))
* Release 0.6.1 ([1bd1a79](https://github.com/AztecProtocol/aztec-packages/commit/1bd1a79b0cefcd90306133aab141d992e8ea5fc3))

## [0.5.2](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.5.2...aztec-packages-v0.5.2) (2023-09-08)


### Features

* Example card game ([#2135](https://github.com/AztecProtocol/aztec-packages/issues/2135)) ([9084b89](https://github.com/AztecProtocol/aztec-packages/commit/9084b89da80953cb781913ba526f77a9a3b12714))


### Bug Fixes

* **tests:** Increase test timeout ([#2144](https://github.com/AztecProtocol/aztec-packages/issues/2144)) ([7da9615](https://github.com/AztecProtocol/aztec-packages/commit/7da96152ccc65594e4d7cf80e1931fe5eadfd684))
* Work around intermittent wasm webkit issue ([#2140](https://github.com/AztecProtocol/aztec-packages/issues/2140)) ([a9b0934](https://github.com/AztecProtocol/aztec-packages/commit/a9b09344c80d8628f95f859d4e2d455d61f9e7c6))


### Miscellaneous

* **build:** Updated release please config ([#2142](https://github.com/AztecProtocol/aztec-packages/issues/2142)) ([e119c4f](https://github.com/AztecProtocol/aztec-packages/commit/e119c4f7af0b0f8007abf43c0cad9c0ac6f4e6ac))
* **build:** Updated version check ([#2145](https://github.com/AztecProtocol/aztec-packages/issues/2145)) ([4ed5f05](https://github.com/AztecProtocol/aztec-packages/commit/4ed5f0548cf7e8a9c65f176f469103363a42bc5f))
* Release 0.5.2 ([f76b53c](https://github.com/AztecProtocol/aztec-packages/commit/f76b53c985116ac131a9b11b2a255feb7d0f8f13))

## [0.5.2](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.5.1...aztec-packages-v0.5.2) (2023-09-08)


### Bug Fixes

* **build:** Config fixes for release please ([#2123](https://github.com/AztecProtocol/aztec-packages/issues/2123)) ([7b4f30d](https://github.com/AztecProtocol/aztec-packages/commit/7b4f30dbdf29a907b7474e5f308849ca068f056e))
* **build:** Don't include component in tag ([#2128](https://github.com/AztecProtocol/aztec-packages/issues/2128)) ([b588e3a](https://github.com/AztecProtocol/aztec-packages/commit/b588e3aad944c7a7f555718794609a9b2559e18a))
* **build:** Updated version file ([#2131](https://github.com/AztecProtocol/aztec-packages/issues/2131)) ([30f9935](https://github.com/AztecProtocol/aztec-packages/commit/30f993502eb6b312fa57f0e995d359ed55b037f5))
* Canary browser test transfer method ([#2126](https://github.com/AztecProtocol/aztec-packages/issues/2126)) ([a23b037](https://github.com/AztecProtocol/aztec-packages/commit/a23b0370ae9395ca51ed8f94a1d71b57d35916a0))
* File reference to canary docker-compose file ([#2124](https://github.com/AztecProtocol/aztec-packages/issues/2124)) ([13d3f16](https://github.com/AztecProtocol/aztec-packages/commit/13d3f161cc2ee6b49e4448ae9e8d33dd7f6ce7d2))
* Retry with -eu was suspect in retrospect ([#2110](https://github.com/AztecProtocol/aztec-packages/issues/2110)) ([7265c2a](https://github.com/AztecProtocol/aztec-packages/commit/7265c2adc64445ae635779351683e479d345fcaf))


### Miscellaneous

* **build:** Enabled components in tags ([#2139](https://github.com/AztecProtocol/aztec-packages/issues/2139)) ([ccb38fb](https://github.com/AztecProtocol/aztec-packages/commit/ccb38fbab252f1a6ed4fb5b974e0255b2b7556b2))
* **build:** Fixed manifest ([#2122](https://github.com/AztecProtocol/aztec-packages/issues/2122)) ([91faa66](https://github.com/AztecProtocol/aztec-packages/commit/91faa668650b98306813e64e9ebe3064bd7a221e))
* **build:** Force a rebuild ([#2136](https://github.com/AztecProtocol/aztec-packages/issues/2136)) ([f26c9a0](https://github.com/AztecProtocol/aztec-packages/commit/f26c9a0df2889c1e1bfbc706199abed67ed3efc4))
* **build:** Reset version back ([#2132](https://github.com/AztecProtocol/aztec-packages/issues/2132)) ([750a757](https://github.com/AztecProtocol/aztec-packages/commit/750a7570c91262e3320bc786fc2944c097427d94))
* **build:** Unify barretenberg releases with aztec-packages ([#2120](https://github.com/AztecProtocol/aztec-packages/issues/2120)) ([82823d8](https://github.com/AztecProtocol/aztec-packages/commit/82823d8cd6882b191a7b363aa40344f66dfd7af7))
* Delete broken bb Dockerfile.arm64-linux-gcc ([#2138](https://github.com/AztecProtocol/aztec-packages/issues/2138)) ([0f988b7](https://github.com/AztecProtocol/aztec-packages/commit/0f988b77ed4c1d0b01916763433344b54765e65a))
* **documentation:** Document noteCommitment vs noteHash ([#2127](https://github.com/AztecProtocol/aztec-packages/issues/2127)) ([73b484f](https://github.com/AztecProtocol/aztec-packages/commit/73b484f474a16b53920fa1dc4f71cbe1ff2bf9ce)), closes [#1679](https://github.com/AztecProtocol/aztec-packages/issues/1679)
* **master:** Release 0.6.0 ([#2121](https://github.com/AztecProtocol/aztec-packages/issues/2121)) ([9bc8e11](https://github.com/AztecProtocol/aztec-packages/commit/9bc8e11ec4598c54d2c8f37c9f1a38ad90148f12))

## [0.6.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.5.1...aztec-packages-v0.6.0) (2023-09-08)


### ⚠ BREAKING CHANGES

* update to acvm 0.24.0 ([#1925](https://github.com/AztecProtocol/aztec-packages/issues/1925))
* Barretenberg binaries now take in the encoded circuit instead of a json file ([#1618](https://github.com/AztecProtocol/aztec-packages/issues/1618))

### Features

* `CompleteAddress` type and overall AztecRPC refactor ([#1524](https://github.com/AztecProtocol/aztec-packages/issues/1524)) ([aa2c74c](https://github.com/AztecProtocol/aztec-packages/commit/aa2c74c8503469630611b7004c4052b80b5fe815))
* `FunctionSelector` type ([#1518](https://github.com/AztecProtocol/aztec-packages/issues/1518)) ([942f705](https://github.com/AztecProtocol/aztec-packages/commit/942f7058adc706924ff26d2490bec7f7d57d7149)), closes [#1424](https://github.com/AztecProtocol/aztec-packages/issues/1424)
* `GrumpkinScalar` type ([#1919](https://github.com/AztecProtocol/aztec-packages/issues/1919)) ([3a9238a](https://github.com/AztecProtocol/aztec-packages/commit/3a9238a99a32259d8d6b85df6335a002c7bab354))
* **892:** Add hints for matching transient read requests with correspondi… ([#1995](https://github.com/AztecProtocol/aztec-packages/issues/1995)) ([0955bb7](https://github.com/AztecProtocol/aztec-packages/commit/0955bb7b0903b12c4f041096d51a1dbb48f6359d))
* Add `info` command to bb ([#2010](https://github.com/AztecProtocol/aztec-packages/issues/2010)) ([1fd8196](https://github.com/AztecProtocol/aztec-packages/commit/1fd8196f302ee49f540dea54ce5df4c450592d05))
* Add ARM build for Mac + cleanup artifacts ([#1837](https://github.com/AztecProtocol/aztec-packages/issues/1837)) ([270a4ae](https://github.com/AztecProtocol/aztec-packages/commit/270a4ae4d1998149735251e2c3c1be73a9029f61))
* Add msgpack defs to remaining circuit types ([#1538](https://github.com/AztecProtocol/aztec-packages/issues/1538)) ([22037d8](https://github.com/AztecProtocol/aztec-packages/commit/22037d89cc45c718bb0dc1a49e76d78cd6ba90dd))
* Add support for assert messages & runtime call stacks  ([#1997](https://github.com/AztecProtocol/aztec-packages/issues/1997)) ([ac68837](https://github.com/AztecProtocol/aztec-packages/commit/ac68837677a80897538d7a0790af8d04410c4446))
* Add workflow to output to dev-bb.js ([#1299](https://github.com/AztecProtocol/aztec-packages/issues/1299)) ([624ffaf](https://github.com/AztecProtocol/aztec-packages/commit/624ffaf1c920d29a12458eb045c8fec7ce978a1a))
* **aztec-js:** Account class ([#1429](https://github.com/AztecProtocol/aztec-packages/issues/1429)) ([e788745](https://github.com/AztecProtocol/aztec-packages/commit/e788745b73a5b7632a3e346e2a698dbbb2314ed7))
* **aztec-js:** Remove sender from execution request and add batching ([#1415](https://github.com/AztecProtocol/aztec-packages/issues/1415)) ([05b6e86](https://github.com/AztecProtocol/aztec-packages/commit/05b6e869d89e9313f6e60580a3eef21f88f55446))
* **aztec-js:** Return contract instance when awaiting deploy tx ([#1360](https://github.com/AztecProtocol/aztec-packages/issues/1360)) ([e9c945c](https://github.com/AztecProtocol/aztec-packages/commit/e9c945cc680974383023737d299bc35645771e85))
* **aztec-js:** Tx.wait waits for rpc to be synced ([#1381](https://github.com/AztecProtocol/aztec-packages/issues/1381)) ([261032e](https://github.com/AztecProtocol/aztec-packages/commit/261032ee3d8244a12850add3e75e9aeddd68456b)), closes [#1340](https://github.com/AztecProtocol/aztec-packages/issues/1340)
* **aztec-noir:** Align public and private execution patterns ([#1515](https://github.com/AztecProtocol/aztec-packages/issues/1515)) ([35a81c3](https://github.com/AztecProtocol/aztec-packages/commit/35a81c38f0738d2121b57e2dbfc1c4a85c20d6b8))
* **Aztec.nr:** Kernel return types abstraction ([#1924](https://github.com/AztecProtocol/aztec-packages/issues/1924)) ([3a8e702](https://github.com/AztecProtocol/aztec-packages/commit/3a8e7026ea10aa8564bdcc127efd4213ebd526de))
* **bb:** Use an environment variable to set the transcript URL ([#1750](https://github.com/AztecProtocol/aztec-packages/issues/1750)) ([31488c1](https://github.com/AztecProtocol/aztec-packages/commit/31488c19acfdfd5ff0c3e7f242f94dc0aa049158))
* **blocks_tree:** Compute block hashes within root rollup circuit ([#1214](https://github.com/AztecProtocol/aztec-packages/issues/1214)) ([71dc039](https://github.com/AztecProtocol/aztec-packages/commit/71dc03973455c320ad4edb1a21d059bdf417445a))
* Broadcasting 'public key' and 'partial address' as L1 calldata ([#1801](https://github.com/AztecProtocol/aztec-packages/issues/1801)) ([78d6444](https://github.com/AztecProtocol/aztec-packages/commit/78d6444e82903fe3d0d17318cd38b1b262e81391)), closes [#1778](https://github.com/AztecProtocol/aztec-packages/issues/1778)
* CDP/Lending example contract ([#1554](https://github.com/AztecProtocol/aztec-packages/issues/1554)) ([ecf6df2](https://github.com/AztecProtocol/aztec-packages/commit/ecf6df201047dcaa61c270cdb512cdc62086b356))
* Celer benchmark ([#1369](https://github.com/AztecProtocol/aztec-packages/issues/1369)) ([7ec6b32](https://github.com/AztecProtocol/aztec-packages/commit/7ec6b32620c851d73e133e939f888047474ebc71))
* Check sandbox version matches CLI's ([#1849](https://github.com/AztecProtocol/aztec-packages/issues/1849)) ([7279730](https://github.com/AztecProtocol/aztec-packages/commit/72797305ac9ce8639abb09334cf2471f0932ca88))
* Checking if origin is registered ([#1393](https://github.com/AztecProtocol/aztec-packages/issues/1393)) ([8b3a064](https://github.com/AztecProtocol/aztec-packages/commit/8b3a0641a5fc78c5906d88267d3c8f0e2753025d)), closes [#1230](https://github.com/AztecProtocol/aztec-packages/issues/1230)
* **ci:** Initial release please config ([#1769](https://github.com/AztecProtocol/aztec-packages/issues/1769)) ([4207559](https://github.com/AztecProtocol/aztec-packages/commit/42075590058b21f38b5e745af54b2062371f9ebe))
* **circuits:** Hints nullifier transient commitments ([#2056](https://github.com/AztecProtocol/aztec-packages/issues/2056)) ([725b550](https://github.com/AztecProtocol/aztec-packages/commit/725b550a368494abd15a38e95b15b1379bc926bc))
* **ci:** Use content hash in build system, restrict docs build to *.ts or *.cpp ([#1953](https://github.com/AztecProtocol/aztec-packages/issues/1953)) ([0036e07](https://github.com/AztecProtocol/aztec-packages/commit/0036e0742a67dfa8aa1fcdb498b89caca6441508))
* **cli:** Noir contract compiler CLI ([#1561](https://github.com/AztecProtocol/aztec-packages/issues/1561)) ([4af4845](https://github.com/AztecProtocol/aztec-packages/commit/4af4845f80b1be548efa1ca79f5588bb1c7f1423)), closes [#1457](https://github.com/AztecProtocol/aztec-packages/issues/1457)
* **cli:** Retry on http errors ([#1606](https://github.com/AztecProtocol/aztec-packages/issues/1606)) ([7af5994](https://github.com/AztecProtocol/aztec-packages/commit/7af59942e8691fa49b834f036b58f5de26821171))
* **cli:** Use options instead of args in get-logs ([#1559](https://github.com/AztecProtocol/aztec-packages/issues/1559)) ([9f40ef8](https://github.com/AztecProtocol/aztec-packages/commit/9f40ef80d7180bab42685453d51cfce8d770dfb0))
* Compress debug symbols ([#1760](https://github.com/AztecProtocol/aztec-packages/issues/1760)) ([9464b25](https://github.com/AztecProtocol/aztec-packages/commit/9464b25c1a2a809db559ddc4e2d4ee5ade1fa65a))
* Do not allow slot 0 in `noir-libs` ([#1884](https://github.com/AztecProtocol/aztec-packages/issues/1884)) ([54094b4](https://github.com/AztecProtocol/aztec-packages/commit/54094b464a4dc7aebf157ca54145cffce822bc6f)), closes [#1692](https://github.com/AztecProtocol/aztec-packages/issues/1692)
* **docs:** Add tabs for deploying contract with cli and aztec.js ([#1703](https://github.com/AztecProtocol/aztec-packages/issues/1703)) ([d2a284d](https://github.com/AztecProtocol/aztec-packages/commit/d2a284dabd30e05ec771e719f9d0c9963438d4af))
* **docs:** Adding some nitpick suggestions before sandbox release ([#1859](https://github.com/AztecProtocol/aztec-packages/issues/1859)) ([c1144f7](https://github.com/AztecProtocol/aztec-packages/commit/c1144f7bcfe8ebe222b840b0edd3d901ca30bdaf))
* **docs:** Cheatcode docs ([#1585](https://github.com/AztecProtocol/aztec-packages/issues/1585)) ([b1a2f8f](https://github.com/AztecProtocol/aztec-packages/commit/b1a2f8fa6b38a1c03a62c25428932c8d2a9a4fdb))
* **docs:** Set up noir contracts in getting-started ([#1770](https://github.com/AztecProtocol/aztec-packages/issues/1770)) ([33eb99d](https://github.com/AztecProtocol/aztec-packages/commit/33eb99d4a00831f340b1b0de0352fc272cb66d14))
* **docs:** Testing guide and getPrivateStorage method ([#1992](https://github.com/AztecProtocol/aztec-packages/issues/1992)) ([5a8c571](https://github.com/AztecProtocol/aztec-packages/commit/5a8c5719753549f71ceeec9114d69b8d1d640376))
* Generate public context contract interfaces ([#1860](https://github.com/AztecProtocol/aztec-packages/issues/1860)) ([2f4045e](https://github.com/AztecProtocol/aztec-packages/commit/2f4045e22dbea0e316103da20c6ba8a667826777)), closes [#1782](https://github.com/AztecProtocol/aztec-packages/issues/1782)
* Goblin recursive verifier ([#1822](https://github.com/AztecProtocol/aztec-packages/issues/1822)) ([f962cb6](https://github.com/AztecProtocol/aztec-packages/commit/f962cb68f46d25047bf67a1ad2e7407a176ffc53))
* Honk recursive verifier Pt. 1 ([#1488](https://github.com/AztecProtocol/aztec-packages/issues/1488)) ([4669555](https://github.com/AztecProtocol/aztec-packages/commit/466955559750bce4b4d81149ca81c02742b9246c))
* Initial `is_valid` eip1271 style wallet + minimal test changes ([#1935](https://github.com/AztecProtocol/aztec-packages/issues/1935)) ([f264c54](https://github.com/AztecProtocol/aztec-packages/commit/f264c5421424bf58d983fe104aaf7c7126259e01))
* Initial cheatcode `loadPublic` ([#1353](https://github.com/AztecProtocol/aztec-packages/issues/1353)) ([75c35a7](https://github.com/AztecProtocol/aztec-packages/commit/75c35a7506bcc5a9ae1afee90c70cfb95b08b347))
* Initial portal docs + minor cleanups ([#1469](https://github.com/AztecProtocol/aztec-packages/issues/1469)) ([37316f4](https://github.com/AztecProtocol/aztec-packages/commit/37316f4fb484c7c03bd44e9a14cd576714f092c5))
* Initial trazability of ACIR ([#1701](https://github.com/AztecProtocol/aztec-packages/issues/1701)) ([89e4e1a](https://github.com/AztecProtocol/aztec-packages/commit/89e4e1ac5e90905aa475ba2f8b6afb7b77dc772a))
* Minimal barretenberg .circleci ([#1352](https://github.com/AztecProtocol/aztec-packages/issues/1352)) ([36e4239](https://github.com/AztecProtocol/aztec-packages/commit/36e4239eccf00bc009e42ec218d0922b5d1138da))
* More reliable getTxReceipt api. ([#1793](https://github.com/AztecProtocol/aztec-packages/issues/1793)) ([ad16b22](https://github.com/AztecProtocol/aztec-packages/commit/ad16b2219bff44dfbc3482b81c86e29bf0d60fc5))
* New NoteProcessor works through all blocks ([#1404](https://github.com/AztecProtocol/aztec-packages/issues/1404)) ([c8e7d53](https://github.com/AztecProtocol/aztec-packages/commit/c8e7d539b7a3f4d7b4eee7e4eef1499715711109))
* New stdlib Transcript  ([#1219](https://github.com/AztecProtocol/aztec-packages/issues/1219)) ([2f66de1](https://github.com/AztecProtocol/aztec-packages/commit/2f66de15212a5b6eb398e0919ae3ad4ec572fde0))
* No unencrypted logs in private functions ([#1780](https://github.com/AztecProtocol/aztec-packages/issues/1780)) ([4d8002e](https://github.com/AztecProtocol/aztec-packages/commit/4d8002e0d101a14c465929d92ea05d0be6e8d99a)), closes [#1689](https://github.com/AztecProtocol/aztec-packages/issues/1689)
* No unlimited retries by default in aztec.js ([#1723](https://github.com/AztecProtocol/aztec-packages/issues/1723)) ([95d1350](https://github.com/AztecProtocol/aztec-packages/commit/95d1350b23b6205ff2a7d3de41a37e0bc9ee7640))
* **noir-contracts:** `Option&lt;T&gt;` for get_notes ([#1272](https://github.com/AztecProtocol/aztec-packages/issues/1272)) ([584b70f](https://github.com/AztecProtocol/aztec-packages/commit/584b70f11d9cfd95201462f61b154ed2abdb685c))
* **noir:** Autogenerate contract interface for calling from external contracts ([#1487](https://github.com/AztecProtocol/aztec-packages/issues/1487)) ([e9d0e6b](https://github.com/AztecProtocol/aztec-packages/commit/e9d0e6bbe6645c6f9a303f99c9952fc2ce7bcb03))
* **noir:** Better NoteGetterOptions. ([#1695](https://github.com/AztecProtocol/aztec-packages/issues/1695)) ([2f78293](https://github.com/AztecProtocol/aztec-packages/commit/2f78293643186232d4f2013acdf56b263b89bf56))
* **noir:** Use `#[aztec(private)]` and `#[aztec(public)` attributes ([#1735](https://github.com/AztecProtocol/aztec-packages/issues/1735)) ([89756fa](https://github.com/AztecProtocol/aztec-packages/commit/89756fae7d562274a84c60024beff5fae032f297))
* Not retrying unrecoverable errors ([#1752](https://github.com/AztecProtocol/aztec-packages/issues/1752)) ([c0f2820](https://github.com/AztecProtocol/aztec-packages/commit/c0f28204f53152c941704ece66287eddfe13c047))
* **oracle:** Add oracle to get portal contract address ([#1474](https://github.com/AztecProtocol/aztec-packages/issues/1474)) ([5cce848](https://github.com/AztecProtocol/aztec-packages/commit/5cce848fc776abe4fcf54fb39e1b1ed740fd3583))
* Pin noir commit to aztec tag ([#1461](https://github.com/AztecProtocol/aztec-packages/issues/1461)) ([afe601a](https://github.com/AztecProtocol/aztec-packages/commit/afe601afa0f58c09c421a6d559645472d4b42ed3))
* Public view functions (unconstrained can read public storage) ([#1421](https://github.com/AztecProtocol/aztec-packages/issues/1421)) ([912c1b4](https://github.com/AztecProtocol/aztec-packages/commit/912c1b44b83a87ce6da7e9c5a99b9d5d3ba8aaf4))
* Recursive fn calls to spend more notes. ([#1779](https://github.com/AztecProtocol/aztec-packages/issues/1779)) ([94053e4](https://github.com/AztecProtocol/aztec-packages/commit/94053e44f4d2a702fe9066bfff3cdd35e6d1b645))
* Register-public-key & CLI update to use options instead of args ([#1397](https://github.com/AztecProtocol/aztec-packages/issues/1397)) ([d142181](https://github.com/AztecProtocol/aztec-packages/commit/d14218184478a22cca1a011763801d2f82a40f65))
* Simulate enqueued public functions and locate failing constraints on them ([#1853](https://github.com/AztecProtocol/aztec-packages/issues/1853)) ([a065fd5](https://github.com/AztecProtocol/aztec-packages/commit/a065fd53dde48a1f28616ebe130222dd39d07b11))
* Throw when creating an instance of non-existent contract ([#1300](https://github.com/AztecProtocol/aztec-packages/issues/1300)) ([5353ed0](https://github.com/AztecProtocol/aztec-packages/commit/5353ed0ae5ecfd227fac36b8f2305c3d91d1c855)), closes [#1225](https://github.com/AztecProtocol/aztec-packages/issues/1225)
* Throwing when submitting a duplicate tx of a settled one ([#1880](https://github.com/AztecProtocol/aztec-packages/issues/1880)) ([9ad768f](https://github.com/AztecProtocol/aztec-packages/commit/9ad768f1af5344dc079a74e80ec601e062558fd5)), closes [#1810](https://github.com/AztecProtocol/aztec-packages/issues/1810)
* Timing in build system ([#1411](https://github.com/AztecProtocol/aztec-packages/issues/1411)) ([b30f43f](https://github.com/AztecProtocol/aztec-packages/commit/b30f43fa9ffd5d62b20ffd843c0deeef5e132e4f))
* Typos, using Tx.clone functionality, better naming ([#1976](https://github.com/AztecProtocol/aztec-packages/issues/1976)) ([00bca67](https://github.com/AztecProtocol/aztec-packages/commit/00bca675cf7984052c960c3d1797c5b017f07f57))
* Update safe_math and move to libraries ([#1803](https://github.com/AztecProtocol/aztec-packages/issues/1803)) ([b10656d](https://github.com/AztecProtocol/aztec-packages/commit/b10656d30622366dcbbe5adb5b3948b0702a06e7))
* Updated noir version ([#1581](https://github.com/AztecProtocol/aztec-packages/issues/1581)) ([91f9047](https://github.com/AztecProtocol/aztec-packages/commit/91f9047da8489404718441ba498b9424c9d7000e))
* Write debug-level log to local file in Sandbox ([#1846](https://github.com/AztecProtocol/aztec-packages/issues/1846)) ([0317e93](https://github.com/AztecProtocol/aztec-packages/commit/0317e93d3dffb3b66a926863e7fe8b8c15f61536)), closes [#1605](https://github.com/AztecProtocol/aztec-packages/issues/1605)
* **yarn:** Run workspace commands in parallel ([#1543](https://github.com/AztecProtocol/aztec-packages/issues/1543)) ([791f1cc](https://github.com/AztecProtocol/aztec-packages/commit/791f1ccecc4fa20eb48d0069061483c6a68b6d28))


### Bug Fixes

* Accidental git marker ([#2039](https://github.com/AztecProtocol/aztec-packages/issues/2039)) ([2be9908](https://github.com/AztecProtocol/aztec-packages/commit/2be990861ca25ec206f6bd02b604b73b30710ca8))
* **acir:** When retrying failed ACIR tests it should not use the default CLI argument ([#1673](https://github.com/AztecProtocol/aztec-packages/issues/1673)) ([910b103](https://github.com/AztecProtocol/aztec-packages/commit/910b10392a9bb7472948bec5cc634eebea137288))
* Add noir clean command & clean noir artifacts when building ([#1482](https://github.com/AztecProtocol/aztec-packages/issues/1482)) ([8e722c3](https://github.com/AztecProtocol/aztec-packages/commit/8e722c3a4deaab2794506092dae7dff4f977db04))
* Add retry to tag and docker actions ([#2099](https://github.com/AztecProtocol/aztec-packages/issues/2099)) ([9f741f4](https://github.com/AztecProtocol/aztec-packages/commit/9f741f4e181120edcb63c28fa6c50b5b5e2e26c9))
* Add retry_10 around ensure_repo ([#1963](https://github.com/AztecProtocol/aztec-packages/issues/1963)) ([0afde39](https://github.com/AztecProtocol/aztec-packages/commit/0afde390ac63d132b0ba85440500da3375fd2e22))
* Adds Mac cross compile flags into barretenberg ([#1954](https://github.com/AztecProtocol/aztec-packages/issues/1954)) ([3aaf91e](https://github.com/AztecProtocol/aztec-packages/commit/3aaf91e03fc01f0cb12249f22dbcb007023f69d4))
* Align bbmalloc implementations ([#1513](https://github.com/AztecProtocol/aztec-packages/issues/1513)) ([c512fcd](https://github.com/AztecProtocol/aztec-packages/commit/c512fcd23b43090f5e01819a2ead29747e7517ad))
* Barretenberg binaries now take in the encoded circuit instead of a json file ([#1618](https://github.com/AztecProtocol/aztec-packages/issues/1618)) ([4bc551e](https://github.com/AztecProtocol/aztec-packages/commit/4bc551ef086c1e3d966f8ece5f5930405d8f5b11))
* Bb meta-data ([#1960](https://github.com/AztecProtocol/aztec-packages/issues/1960)) ([712e0a0](https://github.com/AztecProtocol/aztec-packages/commit/712e0a088bff9ae2f49489901fab2a3fe0fb6d4b))
* Bb sync take 2 ([#1669](https://github.com/AztecProtocol/aztec-packages/issues/1669)) ([fd09bc2](https://github.com/AztecProtocol/aztec-packages/commit/fd09bc26780dc08214d0ceca3d04ed10db23fead))
* **bb.js:** (breaking change) bundles bb.js properly so that it works in the browser and in node ([#1855](https://github.com/AztecProtocol/aztec-packages/issues/1855)) ([1aa6f59](https://github.com/AztecProtocol/aztec-packages/commit/1aa6f5934cd97dd32d81e490013f8ef7d1e14ec7))
* **bb:** Fix Typo ([#1709](https://github.com/AztecProtocol/aztec-packages/issues/1709)) ([287f5ae](https://github.com/AztecProtocol/aztec-packages/commit/287f5ae2cc556c1664d4240928baecadf92627e5))
* Benchmark git repo ([#2041](https://github.com/AztecProtocol/aztec-packages/issues/2041)) ([3c696bb](https://github.com/AztecProtocol/aztec-packages/commit/3c696bba1ca4bd69c8e3f5bc004d1a07adb23cf1))
* Benchmark preset uses clang16 ([#1902](https://github.com/AztecProtocol/aztec-packages/issues/1902)) ([4f7eeea](https://github.com/AztecProtocol/aztec-packages/commit/4f7eeea6c79604aea88433790dfc542a356aa898))
* **breaking change:** Change embedded curve scalar mul to use two limbs to properly encode the scalar field ([#2105](https://github.com/AztecProtocol/aztec-packages/issues/2105)) ([070cc4c](https://github.com/AztecProtocol/aztec-packages/commit/070cc4cb31ada29e42846e16df1ec191100214a5))
* Broken bootstrap.sh after renaming `aztec-cli` dir as `cli` ([#2097](https://github.com/AztecProtocol/aztec-packages/issues/2097)) ([2386781](https://github.com/AztecProtocol/aztec-packages/commit/2386781fd1fed9f552559961b4e9f60406095067))
* Browser test in canary flow ([#2102](https://github.com/AztecProtocol/aztec-packages/issues/2102)) ([d52af6c](https://github.com/AztecProtocol/aztec-packages/commit/d52af6c0e2c5ed268747237e65603368645c9966)), closes [#2086](https://github.com/AztecProtocol/aztec-packages/issues/2086)
* Build ([#1906](https://github.com/AztecProtocol/aztec-packages/issues/1906)) ([8223be1](https://github.com/AztecProtocol/aztec-packages/commit/8223be18d98ebb4edb7700310b2fda5201bd04b9))
* Build script ([#2017](https://github.com/AztecProtocol/aztec-packages/issues/2017)) ([23fce27](https://github.com/AztecProtocol/aztec-packages/commit/23fce277c44a06777ea168085ac498d62016b36e))
* Build-system spot request cancellation ([#1339](https://github.com/AztecProtocol/aztec-packages/issues/1339)) ([0c8ce7d](https://github.com/AztecProtocol/aztec-packages/commit/0c8ce7d33483b6df5f747c7ad0aa8376b4f392a1))
* **build-system:** Undefined IMAGE_TAG and ARG_TAG ([#2030](https://github.com/AztecProtocol/aztec-packages/issues/2030)) ([dfdba4b](https://github.com/AztecProtocol/aztec-packages/commit/dfdba4b5c6fb0c75f7f463e0b5eb71e6e7d1b667))
* **build:** Config fixes for release please ([#2123](https://github.com/AztecProtocol/aztec-packages/issues/2123)) ([7b4f30d](https://github.com/AztecProtocol/aztec-packages/commit/7b4f30dbdf29a907b7474e5f308849ca068f056e))
* **build:** Use semver version in docker version tag ([#2065](https://github.com/AztecProtocol/aztec-packages/issues/2065)) ([b3db0d0](https://github.com/AztecProtocol/aztec-packages/commit/b3db0d0ae6d6b7d8a6d7338a556e2b9507e2631a))
* Canary browser test transfer method ([#2126](https://github.com/AztecProtocol/aztec-packages/issues/2126)) ([a23b037](https://github.com/AztecProtocol/aztec-packages/commit/a23b0370ae9395ca51ed8f94a1d71b57d35916a0))
* Check a note is read before nullifying it. ([#2076](https://github.com/AztecProtocol/aztec-packages/issues/2076)) ([aabfb13](https://github.com/AztecProtocol/aztec-packages/commit/aabfb1383033364df9c045573098a4f13ca3a452)), closes [#1899](https://github.com/AztecProtocol/aztec-packages/issues/1899)
* **ci:** Incorrect content hash in some build targets ([#1973](https://github.com/AztecProtocol/aztec-packages/issues/1973)) ([0a2a515](https://github.com/AztecProtocol/aztec-packages/commit/0a2a515ecf52849cce1e45a7b39f44d420b43f34))
* **ci:** Publish missing sandbox dependency ([#1599](https://github.com/AztecProtocol/aztec-packages/issues/1599)) ([52c7966](https://github.com/AztecProtocol/aztec-packages/commit/52c7966a118fdbe90bc739c006b9a116bc4c4dc0))
* Circuits issues when building with gcc ([#2107](https://github.com/AztecProtocol/aztec-packages/issues/2107)) ([4f5c4fe](https://github.com/AztecProtocol/aztec-packages/commit/4f5c4fe24f012988169d8a0a3d8ae5245e24d3ee))
* Circuits should not link openmp with -DMULTITHREADING ([#1929](https://github.com/AztecProtocol/aztec-packages/issues/1929)) ([cd1a685](https://github.com/AztecProtocol/aztec-packages/commit/cd1a685a3ecdd571d83cd2ad0844bd1d143fd9af))
* Clang version in README and subrepo edge case ([#1730](https://github.com/AztecProtocol/aztec-packages/issues/1730)) ([26d836d](https://github.com/AztecProtocol/aztec-packages/commit/26d836d6453c2bc7fd9a1a091bdd63aefc4ed1dd))
* Cli canary & deployment ([#2053](https://github.com/AztecProtocol/aztec-packages/issues/2053)) ([1ddd24a](https://github.com/AztecProtocol/aztec-packages/commit/1ddd24ad2f8702fd3d3c48ed015a652b3326bfd9))
* **cli:** Fixes in get-logs and deploy commands ([#1572](https://github.com/AztecProtocol/aztec-packages/issues/1572)) ([493405b](https://github.com/AztecProtocol/aztec-packages/commit/493405b3d882706c592bf42142e1072aba650dbd))
* COMMIT_TAG arg value in canary Dockerfile ([#2118](https://github.com/AztecProtocol/aztec-packages/issues/2118)) ([a3d6459](https://github.com/AztecProtocol/aztec-packages/commit/a3d645978a6ccef279870498979733682f63e206))
* Compilation on homebrew clang 16.06 ([#1937](https://github.com/AztecProtocol/aztec-packages/issues/1937)) ([c611582](https://github.com/AztecProtocol/aztec-packages/commit/c611582239a057717410f0a6c0fd8202844a564e))
* Complete JS call stacks across ACVM wasm boundaries ([#2013](https://github.com/AztecProtocol/aztec-packages/issues/2013)) ([8e84e46](https://github.com/AztecProtocol/aztec-packages/commit/8e84e460899f11eaf7f383863e20dc5395e45c6e))
* Conditionally compile base64 command for bb binary ([#1851](https://github.com/AztecProtocol/aztec-packages/issues/1851)) ([be97185](https://github.com/AztecProtocol/aztec-packages/commit/be9718505c7e387bb46183299c9db855e6d7f91c))
* Default color to light mode ([#1847](https://github.com/AztecProtocol/aztec-packages/issues/1847)) ([4fc8d39](https://github.com/AztecProtocol/aztec-packages/commit/4fc8d39041d437940bb18815e14f506b2ebe259e))
* Deploy_ecr calculating CONTENT_HASH ([#2024](https://github.com/AztecProtocol/aztec-packages/issues/2024)) ([edee198](https://github.com/AztecProtocol/aztec-packages/commit/edee1981d8d795aef64bd6de738f09ea9a1a2547))
* Disable uniswap until [#1367](https://github.com/AztecProtocol/aztec-packages/issues/1367) ([#1368](https://github.com/AztecProtocol/aztec-packages/issues/1368)) ([7a1c4f7](https://github.com/AztecProtocol/aztec-packages/commit/7a1c4f7901788f127e903d275d4efa2316eab848))
* Disallow unregistered classes in JSON RPC interface and match by name ([#1820](https://github.com/AztecProtocol/aztec-packages/issues/1820)) ([35b8170](https://github.com/AztecProtocol/aztec-packages/commit/35b817055e1fe848e6d87d445a7881c5c128ad35))
* Do not warn on mismatched cli/sandbox version ([#1894](https://github.com/AztecProtocol/aztec-packages/issues/1894)) ([a44a0f6](https://github.com/AztecProtocol/aztec-packages/commit/a44a0f6489b8ea7d648d1b9babf49fae8d593b7b))
* Docs preprocessor line numbers and errors ([#1883](https://github.com/AztecProtocol/aztec-packages/issues/1883)) ([4e7e290](https://github.com/AztecProtocol/aztec-packages/commit/4e7e290478ae4ca9c128c0b6b4b26529965cc2a2))
* **docs:** Fix code snippet preprocessor ([#1485](https://github.com/AztecProtocol/aztec-packages/issues/1485)) ([db0cc14](https://github.com/AztecProtocol/aztec-packages/commit/db0cc1414978b04518218c85e04cba424b64b942))
* Don't include SRS in sandbox docker img ([#1704](https://github.com/AztecProtocol/aztec-packages/issues/1704)) ([aa7f662](https://github.com/AztecProtocol/aztec-packages/commit/aa7f662d3fe3a3c3833c594947c637790442477d))
* Dont assume safety of nvm ([#2079](https://github.com/AztecProtocol/aztec-packages/issues/2079)) ([a4167e7](https://github.com/AztecProtocol/aztec-packages/commit/a4167e7e5ef55c9780c786959d078fe854093656))
* Download SRS using one canonical URL across the codebase ([#1748](https://github.com/AztecProtocol/aztec-packages/issues/1748)) ([899b055](https://github.com/AztecProtocol/aztec-packages/commit/899b05557365a5bf97e64793dd563a1b4bfa0f3f))
* End-to-end aztec cli dependency issue ([#2092](https://github.com/AztecProtocol/aztec-packages/issues/2092)) ([16ee3e5](https://github.com/AztecProtocol/aztec-packages/commit/16ee3e530bd99c2a47b8bcda53f0a13f67df2ac6))
* Ensure CLI command doesn't fail due to missing client version ([#1895](https://github.com/AztecProtocol/aztec-packages/issues/1895)) ([88086e4](https://github.com/AztecProtocol/aztec-packages/commit/88086e4a80d7841d28188366a469800afa281693))
* Ensure noir clean doesnt error ([#1613](https://github.com/AztecProtocol/aztec-packages/issues/1613)) ([ee00df5](https://github.com/AztecProtocol/aztec-packages/commit/ee00df5794b1d8e0ec4776fab8ec7d957d692fa5))
* Ensure_repo undefined-safe ([#2025](https://github.com/AztecProtocol/aztec-packages/issues/2025)) ([e36fb6b](https://github.com/AztecProtocol/aztec-packages/commit/e36fb6bb8a1ee9a3d405c3e5340ffa4e589656e2))
* Error handling in acir simulator ([#1907](https://github.com/AztecProtocol/aztec-packages/issues/1907)) ([165008e](https://github.com/AztecProtocol/aztec-packages/commit/165008ec3027d8f2f76256c37f63e5d7a669b5dd))
* File reference to canary docker-compose file ([#2124](https://github.com/AztecProtocol/aztec-packages/issues/2124)) ([13d3f16](https://github.com/AztecProtocol/aztec-packages/commit/13d3f161cc2ee6b49e4448ae9e8d33dd7f6ce7d2))
* Fix off by one in circuits.js when fetching points from transcript ([#1993](https://github.com/AztecProtocol/aztec-packages/issues/1993)) ([cec901f](https://github.com/AztecProtocol/aztec-packages/commit/cec901f3df440ebc0e3bdcfb2567b70fd9bde9dd))
* Fix paths in `barretenberg` bootstrap.sh script ([#1662](https://github.com/AztecProtocol/aztec-packages/issues/1662)) ([24bbfd4](https://github.com/AztecProtocol/aztec-packages/commit/24bbfd446bf1f2b7fec8313dc010cd5094df0e71))
* Fix race condition between RPC Server and Aztec Node ([#1700](https://github.com/AztecProtocol/aztec-packages/issues/1700)) ([4c89941](https://github.com/AztecProtocol/aztec-packages/commit/4c89941d0c3803ce72b86e76eead95a23d80d810))
* Fixed a failing test and added a small fuzzer ([#1384](https://github.com/AztecProtocol/aztec-packages/issues/1384)) ([f258e08](https://github.com/AztecProtocol/aztec-packages/commit/f258e08aaa2e02c7a39d8d6b83a7037c0a5d36ea))
* Fixing fuzzing build after composer splitting ([#1317](https://github.com/AztecProtocol/aztec-packages/issues/1317)) ([6b2e759](https://github.com/AztecProtocol/aztec-packages/commit/6b2e75940026e0133f9fa56080a4c424172172f0))
* Format.sh issues ([#1946](https://github.com/AztecProtocol/aztec-packages/issues/1946)) ([f24814b](https://github.com/AztecProtocol/aztec-packages/commit/f24814b328c45316fa584cad1d9aa4784b6a0b2e))
* Hack an ordering index for enqueued public calls ([#1639](https://github.com/AztecProtocol/aztec-packages/issues/1639)) ([87712e8](https://github.com/AztecProtocol/aztec-packages/commit/87712e82a504d8c09d2df5f8b8f57a03d88fae93)), closes [#1624](https://github.com/AztecProtocol/aztec-packages/issues/1624)
* Increment time by 1 for previous rollup was warped ([#1594](https://github.com/AztecProtocol/aztec-packages/issues/1594)) ([2a52107](https://github.com/AztecProtocol/aztec-packages/commit/2a521070397b6d1915e55b4ec702d4778563e683))
* Master ([#1981](https://github.com/AztecProtocol/aztec-packages/issues/1981)) ([6bfb053](https://github.com/AztecProtocol/aztec-packages/commit/6bfb053fb2c4053a72a8daa18a241261380ee311))
* Minor annoyances ([#2115](https://github.com/AztecProtocol/aztec-packages/issues/2115)) ([a147582](https://github.com/AztecProtocol/aztec-packages/commit/a1475822b20c360d19a88f6205a4a35d987fc2f5))
* Mirror after direct bb merge ([#1651](https://github.com/AztecProtocol/aztec-packages/issues/1651)) ([5f08fff](https://github.com/AztecProtocol/aztec-packages/commit/5f08fff8355671e883bef0380bf06313429d3e1d))
* More accurate c++ build pattern ([#1962](https://github.com/AztecProtocol/aztec-packages/issues/1962)) ([21c2f8e](https://github.com/AztecProtocol/aztec-packages/commit/21c2f8edd110da8749a0039c900c25aff8baa7a4))
* Noir contract artifacts generation in CI ([#1366](https://github.com/AztecProtocol/aztec-packages/issues/1366)) ([f715a55](https://github.com/AztecProtocol/aztec-packages/commit/f715a55c8b66ddd6133e6cec70b82c4083575233))
* **noir-ci:** Reinstate artifact builds ([#1396](https://github.com/AztecProtocol/aztec-packages/issues/1396)) ([2c43878](https://github.com/AztecProtocol/aztec-packages/commit/2c43878a72d9ce43e212416c1901bad40a0a763a))
* Noir-contracts build ([#1362](https://github.com/AztecProtocol/aztec-packages/issues/1362)) ([71384b0](https://github.com/AztecProtocol/aztec-packages/commit/71384b098b0f81190329d6a685ddfc6c34536473))
* **noir:** Add workaround for latest noir in account contracts ([#1781](https://github.com/AztecProtocol/aztec-packages/issues/1781)) ([eb8a052](https://github.com/AztecProtocol/aztec-packages/commit/eb8a052ad4e19394f096cc3a0f533c2560a7f5cc))
* Option to fail silently when retrying ([#2015](https://github.com/AztecProtocol/aztec-packages/issues/2015)) ([453c9c1](https://github.com/AztecProtocol/aztec-packages/commit/453c9c1b234213fff4d63e117f2bc6c827040125))
* Padded printing for e2e-cli ([#2106](https://github.com/AztecProtocol/aztec-packages/issues/2106)) ([5988014](https://github.com/AztecProtocol/aztec-packages/commit/5988014330c929e1fcb52c4fbba5a755fa013c16))
* Polyfill by bundling fileURLToPath ([#1949](https://github.com/AztecProtocol/aztec-packages/issues/1949)) ([1b2de01](https://github.com/AztecProtocol/aztec-packages/commit/1b2de01df69a16f442c348cc302ade1392e74519))
* Post bb merge sync ([#1697](https://github.com/AztecProtocol/aztec-packages/issues/1697)) ([d27a026](https://github.com/AztecProtocol/aztec-packages/commit/d27a026cdab57dbba12b162e2df75aab142130c9))
* Proving fails when circuit has size &gt; ~500K ([#1739](https://github.com/AztecProtocol/aztec-packages/issues/1739)) ([708b05c](https://github.com/AztecProtocol/aztec-packages/commit/708b05ca6638dc0d6ca7cb34fb8de76665a43b58))
* Race condition ([#1427](https://github.com/AztecProtocol/aztec-packages/issues/1427)) ([cd78ec9](https://github.com/AztecProtocol/aztec-packages/commit/cd78ec9afa887b1e9ac0b446b110603fad29e7e2))
* Remaining refs to clang15 ([#2077](https://github.com/AztecProtocol/aztec-packages/issues/2077)) ([2c16547](https://github.com/AztecProtocol/aztec-packages/commit/2c16547c450ac7591d5be7c734962be86be4310e))
* Remove automatic update to `AztecProtocol/dev-bb.js` ([#1712](https://github.com/AztecProtocol/aztec-packages/issues/1712)) ([6969f6d](https://github.com/AztecProtocol/aztec-packages/commit/6969f6d41febcda0c884d9ea19fb0875f788f425))
* Remove extra transfer arg in CLI Guide ([#1887](https://github.com/AztecProtocol/aztec-packages/issues/1887)) ([55728b8](https://github.com/AztecProtocol/aztec-packages/commit/55728b850c19403ba8b2aaefe89181640acbd9fd))
* Reset keccak var inputs to 0 ([#1881](https://github.com/AztecProtocol/aztec-packages/issues/1881)) ([382f07e](https://github.com/AztecProtocol/aztec-packages/commit/382f07e3032c5ad3cf15e62e38bb5f0583ab46dd))
* Retry git submodule fetch ([#1371](https://github.com/AztecProtocol/aztec-packages/issues/1371)) ([5cf9c20](https://github.com/AztecProtocol/aztec-packages/commit/5cf9c203e126b7613bf80960063d86cb9ee97954))
* Return DecodedReturn instead of any[] ([#1540](https://github.com/AztecProtocol/aztec-packages/issues/1540)) ([2e344e1](https://github.com/AztecProtocol/aztec-packages/commit/2e344e13eaf628e3f380de625da6a526af4a6b0f))
* Revert clang check bootstrap.sh ([#1734](https://github.com/AztecProtocol/aztec-packages/issues/1734)) ([a931e07](https://github.com/AztecProtocol/aztec-packages/commit/a931e077f2efac2aaa50c5336ead87a0e87a813e))
* **rpc:** Fix bigint serialisation in API responses ([#1644](https://github.com/AztecProtocol/aztec-packages/issues/1644)) ([d1ce814](https://github.com/AztecProtocol/aztec-packages/commit/d1ce81478e8993e68257722df1fce6c9e8e0f9e8))
* **rpc:** Fixes getNodeInfo serialisation ([#1991](https://github.com/AztecProtocol/aztec-packages/issues/1991)) ([0a29fa8](https://github.com/AztecProtocol/aztec-packages/commit/0a29fa8dd95b37e490c18df2db90a7324ebe762c))
* **rpc:** Validate accounts registered in the rpc server are sound ([#1431](https://github.com/AztecProtocol/aztec-packages/issues/1431)) ([77b096b](https://github.com/AztecProtocol/aztec-packages/commit/77b096b716fa5454d23c0acbb51cc84640a464ff))
* Run e2e tests without spot ([#2081](https://github.com/AztecProtocol/aztec-packages/issues/2081)) ([f0aa3ca](https://github.com/AztecProtocol/aztec-packages/commit/f0aa3ca0de995f58ea5a18e64c18ee437b520675))
* **sandbox:** Build script for tagged commits ([#2057](https://github.com/AztecProtocol/aztec-packages/issues/2057)) ([c9d9722](https://github.com/AztecProtocol/aztec-packages/commit/c9d9722151de1e6f9a49a4cc6310e5646593ec01))
* Selector name regression ([#1800](https://github.com/AztecProtocol/aztec-packages/issues/1800)) ([a5be8bb](https://github.com/AztecProtocol/aztec-packages/commit/a5be8bb92f858d266cf96671c46343b6e1ff400a))
* Set correct version of RPC & Sandbox when deploying tagged commit ([#1914](https://github.com/AztecProtocol/aztec-packages/issues/1914)) ([898c50d](https://github.com/AztecProtocol/aztec-packages/commit/898c50d594b7515f6ca3b904d31ccf724b683ade))
* Set side effect counter on contract reads ([#1870](https://github.com/AztecProtocol/aztec-packages/issues/1870)) ([1d8881e](https://github.com/AztecProtocol/aztec-packages/commit/1d8881e4872b39195ace523432c0e34bc9081f8d)), closes [#1588](https://github.com/AztecProtocol/aztec-packages/issues/1588)
* **simulator:** Use nullifier.value in client's `pendingNullifier` set so `set.has()` works ([#1534](https://github.com/AztecProtocol/aztec-packages/issues/1534)) ([a78daf7](https://github.com/AztecProtocol/aztec-packages/commit/a78daf75e3171d9cfafecba5507d5ae215fdd0ef))
* **synchronizer:** Store most recent globals hash in the synchronizer, rather than fetching from the latest block ([#1539](https://github.com/AztecProtocol/aztec-packages/issues/1539)) ([1dd6225](https://github.com/AztecProtocol/aztec-packages/commit/1dd62256cc323831418808689496f0506d402fc4))
* **sync:** Sync latest globals within merkle tree ops ([#1612](https://github.com/AztecProtocol/aztec-packages/issues/1612)) ([03b4cf6](https://github.com/AztecProtocol/aztec-packages/commit/03b4cf67cbd4c1629c2937dfae1ea714248d6d3b))
* Truncate SRS size to the amount of points that we have downloaded ([#1862](https://github.com/AztecProtocol/aztec-packages/issues/1862)) ([0a7058c](https://github.com/AztecProtocol/aztec-packages/commit/0a7058cbda228c9baf378d69c906596e204d804f))
* Try to catch last undefined safety issues ([#2027](https://github.com/AztecProtocol/aztec-packages/issues/2027)) ([12e7486](https://github.com/AztecProtocol/aztec-packages/commit/12e7486c0750f648f51d2b43317df843a3c52bec))
* Typescript lookup of aztec.js types ([#1948](https://github.com/AztecProtocol/aztec-packages/issues/1948)) ([22901ae](https://github.com/AztecProtocol/aztec-packages/commit/22901ae8fa63b61ba1fbf4885f3940dc839b555c))
* Undefined safety in master part 5 ([#2034](https://github.com/AztecProtocol/aztec-packages/issues/2034)) ([41eccaa](https://github.com/AztecProtocol/aztec-packages/commit/41eccaa516200bd65847e1b7b736c2f2cf858960))
* Unify base64 interface between mac and linux (cherry-picked) ([#1968](https://github.com/AztecProtocol/aztec-packages/issues/1968)) ([ee24b52](https://github.com/AztecProtocol/aztec-packages/commit/ee24b52234956744d2b35b0eb0d3b5c2dcf7ed82))
* Update barretenberg bootstrap.sh for mac ([#1732](https://github.com/AztecProtocol/aztec-packages/issues/1732)) ([83a212a](https://github.com/AztecProtocol/aztec-packages/commit/83a212a6f64cca5281411bdd3c0a844b1aca38aa))
* Update bootstrap compilation order ([#1398](https://github.com/AztecProtocol/aztec-packages/issues/1398)) ([c03a6fa](https://github.com/AztecProtocol/aztec-packages/commit/c03a6faaa255b73ebe6f1a3e744df4804ad9d475))
* Update decoder block specification comment ([#1690](https://github.com/AztecProtocol/aztec-packages/issues/1690)) ([5a0a4c4](https://github.com/AztecProtocol/aztec-packages/commit/5a0a4c4cc9dcfb7d8df93746f068b36c4a4db6ae))
* Update docs search config ([#1920](https://github.com/AztecProtocol/aztec-packages/issues/1920)) ([c8764e6](https://github.com/AztecProtocol/aztec-packages/commit/c8764e6150b7d372c34ddc008be9925e5f5f6dfb))
* Update docs search keys ([#1931](https://github.com/AztecProtocol/aztec-packages/issues/1931)) ([03b200c](https://github.com/AztecProtocol/aztec-packages/commit/03b200c10da71bd4b6fa3902edb254f9f625bf8b))
* Updated CLI readme ([#2098](https://github.com/AztecProtocol/aztec-packages/issues/2098)) ([2226091](https://github.com/AztecProtocol/aztec-packages/commit/2226091e21d0aa0dbfa3bea4f95a0ea2a31a4c43)), closes [#1784](https://github.com/AztecProtocol/aztec-packages/issues/1784)
* Use COMMIT_TAG_VERSION properly in deploy_dockerhub ([#2033](https://github.com/AztecProtocol/aztec-packages/issues/2033)) ([064ddc3](https://github.com/AztecProtocol/aztec-packages/commit/064ddc3b345ac445fc9fe2385c8aee78b8fb6e47))
* Use exit, not return in retry_10 ([#1468](https://github.com/AztecProtocol/aztec-packages/issues/1468)) ([a65727a](https://github.com/AztecProtocol/aztec-packages/commit/a65727a4e67ecf2ec61b4b5370d359c114ec55ef))
* Use WARN or ERROR "tags" for warnings and errors ([#1589](https://github.com/AztecProtocol/aztec-packages/issues/1589)) ([fb80522](https://github.com/AztecProtocol/aztec-packages/commit/fb80522c45e49112797d53e3b475a58101cca131)), closes [#1607](https://github.com/AztecProtocol/aztec-packages/issues/1607)
* Used dumped state instead of fork ([#1399](https://github.com/AztecProtocol/aztec-packages/issues/1399)) ([c265e73](https://github.com/AztecProtocol/aztec-packages/commit/c265e73db0539919df6b3124ea03fef566bcc606))
* Yarn install in canary ([#1454](https://github.com/AztecProtocol/aztec-packages/issues/1454)) ([9bbe79e](https://github.com/AztecProtocol/aztec-packages/commit/9bbe79e2a4d8d7f60a3eba46bbd2e287ee568d17))


### Miscellaneous

* `AztecRPC` API using sandbox ([#1568](https://github.com/AztecProtocol/aztec-packages/issues/1568)) ([b2662db](https://github.com/AztecProtocol/aztec-packages/commit/b2662dbc45b0149b380ae3c88d058b70174266cb))
* **1074:** Remove read request data from final private kernel circuit public inputs ([#1840](https://github.com/AztecProtocol/aztec-packages/issues/1840)) ([c61557a](https://github.com/AztecProtocol/aztec-packages/commit/c61557ae926f89cead7306368197fdbe8f23dd6d))
* **1407:** Remove forwarding witnesses ([#1930](https://github.com/AztecProtocol/aztec-packages/issues/1930)) ([cc8bc8f](https://github.com/AztecProtocol/aztec-packages/commit/cc8bc8f48b175479e1c4dfbcf9b92159f096c2cf)), closes [#1407](https://github.com/AztecProtocol/aztec-packages/issues/1407)
* **1879:** Add use of PrivateKernelPublicInputs in TS whenever relevant ([#1911](https://github.com/AztecProtocol/aztec-packages/issues/1911)) ([8d5f548](https://github.com/AztecProtocol/aztec-packages/commit/8d5f548e42d627da1685820f99fc28ff5f47abbe))
* Acir tests are no longer base64 encoded ([#1854](https://github.com/AztecProtocol/aztec-packages/issues/1854)) ([7fffd16](https://github.com/AztecProtocol/aztec-packages/commit/7fffd1680d6246f64ee4d4ca965b9764c6c0ebb3))
* Add back double verify proof to test suite ([#1986](https://github.com/AztecProtocol/aztec-packages/issues/1986)) ([f8688d7](https://github.com/AztecProtocol/aztec-packages/commit/f8688d7df05abcb6c650aafb130dedb707931950))
* Add browser test to canary flow ([#1808](https://github.com/AztecProtocol/aztec-packages/issues/1808)) ([7f4fa43](https://github.com/AztecProtocol/aztec-packages/commit/7f4fa438bf2f4966338e3e53ece7c1d01e8dd054))
* Add CLI test to canary flow ([#1918](https://github.com/AztecProtocol/aztec-packages/issues/1918)) ([cc68958](https://github.com/AztecProtocol/aztec-packages/commit/cc689585a845ce3c20ea9714ca744f4aa8837462)), closes [#1903](https://github.com/AztecProtocol/aztec-packages/issues/1903)
* Add FunctionData.fromAbi for QoL  ([#1333](https://github.com/AztecProtocol/aztec-packages/issues/1333)) ([6f5fc3b](https://github.com/AztecProtocol/aztec-packages/commit/6f5fc3bbd54f633582a69d8104327bd405b1e3c4))
* Add rebuild pattern for bb-bin-tests to rebuild when ts folder is changed and add target folder for bb-bin-test ([#1640](https://github.com/AztecProtocol/aztec-packages/issues/1640)) ([b3ee3d9](https://github.com/AztecProtocol/aztec-packages/commit/b3ee3d979172c9d4eae3f9090d0fbbc05fc5a613))
* Add safemath noir testing ([#1967](https://github.com/AztecProtocol/aztec-packages/issues/1967)) ([cb1f1ec](https://github.com/AztecProtocol/aztec-packages/commit/cb1f1ece1fd050b00ad8cbe9086e76383f9e6377))
* Add tests that check ordering of public state updates ([#1661](https://github.com/AztecProtocol/aztec-packages/issues/1661)) ([5b9aedd](https://github.com/AztecProtocol/aztec-packages/commit/5b9aeddd4a1bffcf9015786819dd3f6c1ff66fb4))
* Add todo for using generator indices in note commitment and nullifier computation. ([#1762](https://github.com/AztecProtocol/aztec-packages/issues/1762)) ([2db6728](https://github.com/AztecProtocol/aztec-packages/commit/2db6728fcaf75ce8c98d821b65695543bb0c82a2))
* Another pedantic change to public state naming ([#1359](https://github.com/AztecProtocol/aztec-packages/issues/1359)) ([cb77440](https://github.com/AztecProtocol/aztec-packages/commit/cb774405e89c71a622e32b51032aa761cd767959))
* Aztec RPC interface cleanup ([#1423](https://github.com/AztecProtocol/aztec-packages/issues/1423)) ([1a6168a](https://github.com/AztecProtocol/aztec-packages/commit/1a6168abc9cdc092cf7c9843191194c9b90adae7))
* **Aztec.nr:** Remove implicit imports ([#1901](https://github.com/AztecProtocol/aztec-packages/issues/1901)) ([c7d5190](https://github.com/AztecProtocol/aztec-packages/commit/c7d5190e48771c334bfa7062c361bcd623faa318))
* **Aztec.nr:** Remove the open keyword from public functions ([#1917](https://github.com/AztecProtocol/aztec-packages/issues/1917)) ([4db8603](https://github.com/AztecProtocol/aztec-packages/commit/4db8603a4ee293c64a67be5ba74072bd654c7ec5))
* **bb:** Refactor bb CLI interface ([#1672](https://github.com/AztecProtocol/aztec-packages/issues/1672)) ([a5bf6e0](https://github.com/AztecProtocol/aztec-packages/commit/a5bf6e008b19127bf15c8b12a5a699182b7ff4e7)), closes [#1671](https://github.com/AztecProtocol/aztec-packages/issues/1671)
* **bb:** Upgrade to clang16 for Linux builds ([#1705](https://github.com/AztecProtocol/aztec-packages/issues/1705)) ([feb53aa](https://github.com/AztecProtocol/aztec-packages/commit/feb53aa396f03e49c95f07b9e9635498a89d5807))
* **blocks tree:** Remove historic roots trees ([#1355](https://github.com/AztecProtocol/aztec-packages/issues/1355)) ([ac935e1](https://github.com/AztecProtocol/aztec-packages/commit/ac935e1ea17f89c1dc6ca7d11a332a82bdc85d97))
* Build-system submodule=&gt;subrepo ([#1378](https://github.com/AztecProtocol/aztec-packages/issues/1378)) ([29ab491](https://github.com/AztecProtocol/aztec-packages/commit/29ab49130812918c51852b32b207f3e7cf633d66))
* **build:** Fixed manifest ([#2122](https://github.com/AztecProtocol/aztec-packages/issues/2122)) ([91faa66](https://github.com/AztecProtocol/aztec-packages/commit/91faa668650b98306813e64e9ebe3064bd7a221e))
* **build:** Unify barretenberg releases with aztec-packages ([#2120](https://github.com/AztecProtocol/aztec-packages/issues/2120)) ([82823d8](https://github.com/AztecProtocol/aztec-packages/commit/82823d8cd6882b191a7b363aa40344f66dfd7af7))
* **ci:** Build docs on every pr ([#1955](https://github.com/AztecProtocol/aztec-packages/issues/1955)) ([c200bc5](https://github.com/AztecProtocol/aztec-packages/commit/c200bc5337da9d6122a2545fceeada98a28d7077))
* **ci:** Clean up stale image tags ([#1818](https://github.com/AztecProtocol/aztec-packages/issues/1818)) ([3c8b7b8](https://github.com/AztecProtocol/aztec-packages/commit/3c8b7b84efe938e32c938bbcd744a335ffc50f49))
* **ci:** Deploy sandbox dependencies to npm ([#1593](https://github.com/AztecProtocol/aztec-packages/issues/1593)) ([d90c460](https://github.com/AztecProtocol/aztec-packages/commit/d90c460d898724d742dbbf8a98def8de9db10ace)), closes [#1536](https://github.com/AztecProtocol/aztec-packages/issues/1536)
* **ci:** Fix output name in release please workflow ([#1858](https://github.com/AztecProtocol/aztec-packages/issues/1858)) ([857821f](https://github.com/AztecProtocol/aztec-packages/commit/857821fa1923aa013fe9470f12067208d5c494d1))
* **circuits:** - remove dead code from cbind of private kernel circuit ([#2088](https://github.com/AztecProtocol/aztec-packages/issues/2088)) ([43dc9d7](https://github.com/AztecProtocol/aztec-packages/commit/43dc9d7500fa3d11a0b557b8fc82da4495c4e605))
* **circuits:** - use msgpack for cbind routines of native private kernel circuits ([#1938](https://github.com/AztecProtocol/aztec-packages/issues/1938)) ([3dc5c07](https://github.com/AztecProtocol/aztec-packages/commit/3dc5c07358d99786df8809f46638fdb04b33a6c2))
* **circuits:** Remove dead code in cbind.cpp for public kernel ([#2094](https://github.com/AztecProtocol/aztec-packages/issues/2094)) ([861f960](https://github.com/AztecProtocol/aztec-packages/commit/861f960524436796263d9f79fa06a38d0e62ae84))
* **circuits:** Rename function to validate private call hash in PKC (it pops too) ([#1418](https://github.com/AztecProtocol/aztec-packages/issues/1418)) ([a76496f](https://github.com/AztecProtocol/aztec-packages/commit/a76496facb87d62f5032759cf930c885df1d5cc7))
* **ci:** Set up nightly barretenberg releases ([#1761](https://github.com/AztecProtocol/aztec-packages/issues/1761)) ([e0078da](https://github.com/AztecProtocol/aztec-packages/commit/e0078dabfcd9e006c2a489c7142ab141d5d81b80))
* **ci:** Update acir tests to reflect compilation based off of package name ([#1405](https://github.com/AztecProtocol/aztec-packages/issues/1405)) ([bb38c7a](https://github.com/AztecProtocol/aztec-packages/commit/bb38c7aef6f630aa34d3abb81c6fd1dc8e4f9884))
* **ci:** Update build artifacts for recursion bin-test and enable bin-test ([#1326](https://github.com/AztecProtocol/aztec-packages/issues/1326)) ([48aa541](https://github.com/AztecProtocol/aztec-packages/commit/48aa5414c9b2c99175b304f4258d0d08ffbd8c7c))
* **ci:** Updated release please config ([#1775](https://github.com/AztecProtocol/aztec-packages/issues/1775)) ([0085e8b](https://github.com/AztecProtocol/aztec-packages/commit/0085e8b17efc36256974f82525530c39ed182639))
* **ci:** Updated release please configuration ([#1787](https://github.com/AztecProtocol/aztec-packages/issues/1787)) ([6eb2f7a](https://github.com/AztecProtocol/aztec-packages/commit/6eb2f7abc40bae88ebeec546ad9f8f2c7d810a24))
* CLI tests ([#1786](https://github.com/AztecProtocol/aztec-packages/issues/1786)) ([2987065](https://github.com/AztecProtocol/aztec-packages/commit/298706557a8f2b73a87dfb10c81626ebf127cadb)), closes [#1450](https://github.com/AztecProtocol/aztec-packages/issues/1450)
* Compile minimal WASM binary needed for blackbox functions ([#1824](https://github.com/AztecProtocol/aztec-packages/issues/1824)) ([76a30b8](https://github.com/AztecProtocol/aztec-packages/commit/76a30b8b5b5e765a14fe7d896d8890897cad7756))
* **compiler:** Remove wasm option from noir compiler ([#1628](https://github.com/AztecProtocol/aztec-packages/issues/1628)) ([c552322](https://github.com/AztecProtocol/aztec-packages/commit/c552322c1669b53016bea66beab02aded9c7c29c))
* Conservatively raise the minimum supported clang version in CMakeList ([#2023](https://github.com/AztecProtocol/aztec-packages/issues/2023)) ([f49c416](https://github.com/AztecProtocol/aztec-packages/commit/f49c4164387d307f8a86e93faff3eb96d7c99e36))
* Consistent block number method naming ([#1751](https://github.com/AztecProtocol/aztec-packages/issues/1751)) ([df1afe2](https://github.com/AztecProtocol/aztec-packages/commit/df1afe255d3095a9b2851b47480801c06d116eed))
* **constants:** Bump number of private reads and writes ([#2062](https://github.com/AztecProtocol/aztec-packages/issues/2062)) ([ab6c6b1](https://github.com/AztecProtocol/aztec-packages/commit/ab6c6b1cefdc1dd1da6e1198f99a211b31e73d85))
* **contracts:** Rename Schnorr multi key account to just Schnorr account ([#1447](https://github.com/AztecProtocol/aztec-packages/issues/1447)) ([3afd853](https://github.com/AztecProtocol/aztec-packages/commit/3afd853074be02ebf0a8d1f6187e49505513017e))
* **contracts:** Use autogenerated Noir interfaces where possible ([#2073](https://github.com/AztecProtocol/aztec-packages/issues/2073)) ([bd6368b](https://github.com/AztecProtocol/aztec-packages/commit/bd6368bd16159aad88906496cb9d6270e483a26e)), closes [#1604](https://github.com/AztecProtocol/aztec-packages/issues/1604)
* Create fixtures folder in E2E ([#1419](https://github.com/AztecProtocol/aztec-packages/issues/1419)) ([b8972b4](https://github.com/AztecProtocol/aztec-packages/commit/b8972b4838df02004e8c2b40da446a484e1c0df4))
* **deps:** Remove deprecated multiaddr dependency ([#1631](https://github.com/AztecProtocol/aztec-packages/issues/1631)) ([e72d226](https://github.com/AztecProtocol/aztec-packages/commit/e72d2261a5cbea536c591304d7e3feeed33c5612))
* Disable fft functions for polynomials instantiated on Grumpkin ([#1471](https://github.com/AztecProtocol/aztec-packages/issues/1471)) ([f09909a](https://github.com/AztecProtocol/aztec-packages/commit/f09909ad13d77b21654d90894c018e1b39896105))
* **docs:** API docs stucture ([#2014](https://github.com/AztecProtocol/aztec-packages/issues/2014)) ([9aab9dd](https://github.com/AztecProtocol/aztec-packages/commit/9aab9ddefac63d35ebc356afed573af268896b35))
* **e2e:** Initial e2e test for CLI ([#1576](https://github.com/AztecProtocol/aztec-packages/issues/1576)) ([c2c30da](https://github.com/AztecProtocol/aztec-packages/commit/c2c30da82233a9e8eaae364d19711e4f3596d7d2))
* **e2e:** Trigger public call stack ordering error ([#1637](https://github.com/AztecProtocol/aztec-packages/issues/1637)) ([5ef2a83](https://github.com/AztecProtocol/aztec-packages/commit/5ef2a830b33875bacebe7b4edb269cd15522879f)), closes [#1615](https://github.com/AztecProtocol/aztec-packages/issues/1615)
* Enable project-specific releases for dockerhub too ([#1721](https://github.com/AztecProtocol/aztec-packages/issues/1721)) ([5d2c082](https://github.com/AztecProtocol/aztec-packages/commit/5d2c0824eedb748ca3e2beaa8589410a21ba6e57))
* Enable project-specific tagged releases ([#1425](https://github.com/AztecProtocol/aztec-packages/issues/1425)) ([28cbe7b](https://github.com/AztecProtocol/aztec-packages/commit/28cbe7b30cd5654b2e03d3288f70cfb8a4935fc3))
* Enforce PR titles follow conventional commit specification ([#1706](https://github.com/AztecProtocol/aztec-packages/issues/1706)) ([eeb38ac](https://github.com/AztecProtocol/aztec-packages/commit/eeb38ac700048b9e760e02ca17d8963d2828944c))
* Fix acir-tests ([#1435](https://github.com/AztecProtocol/aztec-packages/issues/1435)) ([4b9b3fe](https://github.com/AztecProtocol/aztec-packages/commit/4b9b3fea10671fee38a55852d283d8489d7965a6))
* Fix dirty merge ([#1574](https://github.com/AztecProtocol/aztec-packages/issues/1574)) ([58dc9bf](https://github.com/AztecProtocol/aztec-packages/commit/58dc9bffa6c8f225640b7f2a2e7c18105cac8592))
* Fix typo ([#1681](https://github.com/AztecProtocol/aztec-packages/issues/1681)) ([7ac25ea](https://github.com/AztecProtocol/aztec-packages/commit/7ac25ea060bdbf7b04ab5ff9defd4f24835f11df))
* Fixed linter errors for `ecc`, `numeric` and `common` modules ([#1714](https://github.com/AztecProtocol/aztec-packages/issues/1714)) ([026273b](https://github.com/AztecProtocol/aztec-packages/commit/026273b42d8c41de9bc4a86f898162cbbb3ad35f))
* Make stdlib bn254 naming match native version ([#1560](https://github.com/AztecProtocol/aztec-packages/issues/1560)) ([347a38a](https://github.com/AztecProtocol/aztec-packages/commit/347a38a54e0ea7f6da1b45a8640b8506c3712bb1))
* Manually resolves barretenberg conflicts ([#1455](https://github.com/AztecProtocol/aztec-packages/issues/1455)) ([b137f85](https://github.com/AztecProtocol/aztec-packages/commit/b137f85689ee941d8efe04c1d9e596d8465fc7e1))
* **master:** Release 0.1.0-alpha45 ([#1774](https://github.com/AztecProtocol/aztec-packages/issues/1774)) ([e910929](https://github.com/AztecProtocol/aztec-packages/commit/e9109297eb801d5e0bb1ee5ca8251af01988ce44))
* **master:** Release 0.1.0-alpha46 ([#1777](https://github.com/AztecProtocol/aztec-packages/issues/1777)) ([13ab91d](https://github.com/AztecProtocol/aztec-packages/commit/13ab91d82214646ff8acee6c0ac8ab83ea5a219b))
* **master:** Release 0.1.0-alpha47 ([#1788](https://github.com/AztecProtocol/aztec-packages/issues/1788)) ([1970651](https://github.com/AztecProtocol/aztec-packages/commit/1970651e641a323c1747d0dc64a81f5ac677c840))
* **master:** Release 0.1.0-alpha48 ([#1804](https://github.com/AztecProtocol/aztec-packages/issues/1804)) ([e89cd26](https://github.com/AztecProtocol/aztec-packages/commit/e89cd267d2cf2c0919a602ec4dc5d5456f95d5d4))
* **master:** Release 0.1.0-alpha49 ([#1882](https://github.com/AztecProtocol/aztec-packages/issues/1882)) ([685e3a9](https://github.com/AztecProtocol/aztec-packages/commit/685e3a95fc1054c76342119d7ec27053edf038d1))
* **master:** Release 0.1.0-alpha50 ([#1900](https://github.com/AztecProtocol/aztec-packages/issues/1900)) ([8135fee](https://github.com/AztecProtocol/aztec-packages/commit/8135feef4ed2f394ec56461f8e2bd2ee77f97cc0))
* **master:** Release 0.1.0-alpha51 ([#2018](https://github.com/AztecProtocol/aztec-packages/issues/2018)) ([c5d95c8](https://github.com/AztecProtocol/aztec-packages/commit/c5d95c8ee5b5fb1f0d5b2c88ea8fcf24fdb466b8))
* **master:** Release 0.1.0-alpha52 ([#2020](https://github.com/AztecProtocol/aztec-packages/issues/2020)) ([0c6dd60](https://github.com/AztecProtocol/aztec-packages/commit/0c6dd60f62f0ebc425c36af5631a6905aeeeaf47))
* **master:** Release 0.1.0-alpha53 ([#2026](https://github.com/AztecProtocol/aztec-packages/issues/2026)) ([1990779](https://github.com/AztecProtocol/aztec-packages/commit/1990779a7ea30b7f90569fcb7b00a4a7b5a1d088))
* **master:** Release 0.1.0-alpha54 ([#2028](https://github.com/AztecProtocol/aztec-packages/issues/2028)) ([a0ccd4a](https://github.com/AztecProtocol/aztec-packages/commit/a0ccd4a1cec87121ff24e3b4e50c15030fedd5ff))
* **master:** Release 0.1.0-alpha55 ([#2031](https://github.com/AztecProtocol/aztec-packages/issues/2031)) ([4c9a438](https://github.com/AztecProtocol/aztec-packages/commit/4c9a438f5a062a32198bad3a008a1ea03555b1a8))
* **master:** Release 0.1.0-alpha56 ([#2032](https://github.com/AztecProtocol/aztec-packages/issues/2032)) ([7cac648](https://github.com/AztecProtocol/aztec-packages/commit/7cac64887994d7873704e2cf27e098a013884014))
* **master:** Release 0.1.0-alpha57 ([#2035](https://github.com/AztecProtocol/aztec-packages/issues/2035)) ([6b93483](https://github.com/AztecProtocol/aztec-packages/commit/6b93483312a1a65ddc941579c9322732c2774175))
* **master:** Release 0.1.0-alpha58 ([#2037](https://github.com/AztecProtocol/aztec-packages/issues/2037)) ([b652ca4](https://github.com/AztecProtocol/aztec-packages/commit/b652ca48f5438546ead9c7f5c9f612574e922fe3))
* **master:** Release 0.1.0-alpha59 ([#2038](https://github.com/AztecProtocol/aztec-packages/issues/2038)) ([3f833c7](https://github.com/AztecProtocol/aztec-packages/commit/3f833c7e2bbb1c121d05d56ba4aebc3e700fc291))
* **master:** Release 0.1.0-alpha60 ([#2040](https://github.com/AztecProtocol/aztec-packages/issues/2040)) ([fbd8b67](https://github.com/AztecProtocol/aztec-packages/commit/fbd8b672dbbdb46c5c484e5d06f2ac955b5db97f))
* **master:** Release 0.1.0-alpha61 ([#2059](https://github.com/AztecProtocol/aztec-packages/issues/2059)) ([5324750](https://github.com/AztecProtocol/aztec-packages/commit/5324750404cf4fc37fd656009577ae80f75d58bb))
* **master:** Release 0.1.0-alpha62 ([#2060](https://github.com/AztecProtocol/aztec-packages/issues/2060)) ([28a877b](https://github.com/AztecProtocol/aztec-packages/commit/28a877bc31012a748a0ab923fa6367271f5b6a75))
* **master:** Release 0.1.0-alpha63 ([#2078](https://github.com/AztecProtocol/aztec-packages/issues/2078)) ([a5f2852](https://github.com/AztecProtocol/aztec-packages/commit/a5f2852966457b9e11012118f9772118682b12e1))
* Merge bb release-please ([#2080](https://github.com/AztecProtocol/aztec-packages/issues/2080)) ([e89b043](https://github.com/AztecProtocol/aztec-packages/commit/e89b04358acbf6f43b72c346406cd97c0fa26af2))
* Move jsdocs to interfaces ([#1356](https://github.com/AztecProtocol/aztec-packages/issues/1356)) ([7f7519d](https://github.com/AztecProtocol/aztec-packages/commit/7f7519d131409d87dfc8fce55a73e882bcf5f015))
* Move storage into main.nr. ([#2068](https://github.com/AztecProtocol/aztec-packages/issues/2068)) ([2c2d72b](https://github.com/AztecProtocol/aztec-packages/commit/2c2d72b7799b24273e498805ecf4c36d69f08d7d))
* **noir-lib:** Add unit tests for context utility functions ([#1481](https://github.com/AztecProtocol/aztec-packages/issues/1481)) ([1d2c5d4](https://github.com/AztecProtocol/aztec-packages/commit/1d2c5d46174548bac715298e26598f126d1a02c2))
* **noir-libs:** TransparentNote rework ([#1412](https://github.com/AztecProtocol/aztec-packages/issues/1412)) ([22fb8fe](https://github.com/AztecProtocol/aztec-packages/commit/22fb8fe0281379bf23836e1be33766b4f38a1813))
* **noir:** Silence warnings ([#1544](https://github.com/AztecProtocol/aztec-packages/issues/1544)) ([ac1dc4b](https://github.com/AztecProtocol/aztec-packages/commit/ac1dc4b6ca39c15a1846fb011116810b39e4fa4a))
* Not breaking note processing on missing hash and nullifier func ([#1364](https://github.com/AztecProtocol/aztec-packages/issues/1364)) ([861db2a](https://github.com/AztecProtocol/aztec-packages/commit/861db2a6bdb0b94d8722539b1159bb8b903b7d97))
* **p2p:** Updated libp2p dependencies ([#1792](https://github.com/AztecProtocol/aztec-packages/issues/1792)) ([79df831](https://github.com/AztecProtocol/aztec-packages/commit/79df83134e15655dc3a5ed9dae00dc52a3d40681))
* Protogalaxy relations ([#1897](https://github.com/AztecProtocol/aztec-packages/issues/1897)) ([35407e2](https://github.com/AztecProtocol/aztec-packages/commit/35407e25081744702ec35efe3f95aa0137fe0ebb))
* Re-enabling pubkey check ([#1720](https://github.com/AztecProtocol/aztec-packages/issues/1720)) ([5385b18](https://github.com/AztecProtocol/aztec-packages/commit/5385b1894aed030448a8d6d3e317072bf9924538))
* Reduce max circuit size in bb binary ([#1942](https://github.com/AztecProtocol/aztec-packages/issues/1942)) ([c61439b](https://github.com/AztecProtocol/aztec-packages/commit/c61439b316829563c93bbfcb78b799bdc105ff71))
* Reenable and refactor nested calls e2e tests ([#1868](https://github.com/AztecProtocol/aztec-packages/issues/1868)) ([570de80](https://github.com/AztecProtocol/aztec-packages/commit/570de803376de4af6a1824b7a3c95129c98e2fa0)), closes [#1587](https://github.com/AztecProtocol/aztec-packages/issues/1587)
* Refactor Cli interface to be more unix-like ([#1833](https://github.com/AztecProtocol/aztec-packages/issues/1833)) ([28d722e](https://github.com/AztecProtocol/aztec-packages/commit/28d722ef965d907b7b7820ccdd7ee0afc97c88fa))
* Refactor hash.hpp to use const& ([#1578](https://github.com/AztecProtocol/aztec-packages/issues/1578)) ([4c329af](https://github.com/AztecProtocol/aztec-packages/commit/4c329af59e5665ce15d8e0465165c3993c4801bc))
* Reference noir master for acir tests ([#1969](https://github.com/AztecProtocol/aztec-packages/issues/1969)) ([86b72e1](https://github.com/AztecProtocol/aztec-packages/commit/86b72e1e8da29a0335e40c6de4c46538d8138f2f))
* Remove debug output from `run_acir_tests` script ([#1970](https://github.com/AztecProtocol/aztec-packages/issues/1970)) ([74c83c5](https://github.com/AztecProtocol/aztec-packages/commit/74c83c5e1436f391eef435926c2da1d508d67713))
* Remove individual historic roots from privateCircuitPublicInputs ([#1571](https://github.com/AztecProtocol/aztec-packages/issues/1571)) ([088cbe5](https://github.com/AztecProtocol/aztec-packages/commit/088cbe5190d3f1a547844a12d4492c901c7b1116))
* Remove Params concept ([#1541](https://github.com/AztecProtocol/aztec-packages/issues/1541)) ([f4bd85e](https://github.com/AztecProtocol/aztec-packages/commit/f4bd85efc286825b6d39b140630ded408e7b1eda))
* Removed `getPreimagesAt` ([#1517](https://github.com/AztecProtocol/aztec-packages/issues/1517)) ([7e14e7b](https://github.com/AztecProtocol/aztec-packages/commit/7e14e7bbea7d092242ac2e6ae03086fe5b9a9ebf)), closes [#1502](https://github.com/AztecProtocol/aztec-packages/issues/1502)
* Rename public state serialisation interface structs for clarity ([#1338](https://github.com/AztecProtocol/aztec-packages/issues/1338)) ([cb2d210](https://github.com/AztecProtocol/aztec-packages/commit/cb2d210b6b8d065b2468cf678bb4fb53f883f14d))
* Renamed take to limit ([#1361](https://github.com/AztecProtocol/aztec-packages/issues/1361)) ([ba9d00b](https://github.com/AztecProtocol/aztec-packages/commit/ba9d00b12f231722b5053b5641a949a825f0a4a8)), closes [#1231](https://github.com/AztecProtocol/aztec-packages/issues/1231)
* Renaming storage getters ([#1348](https://github.com/AztecProtocol/aztec-packages/issues/1348)) ([cb5ce9e](https://github.com/AztecProtocol/aztec-packages/commit/cb5ce9e1295e7d7b6572a052f4fe39f0b5d29631))
* Required option in aztec-cli ([#1584](https://github.com/AztecProtocol/aztec-packages/issues/1584)) ([f287416](https://github.com/AztecProtocol/aztec-packages/commit/f2874165d0748e4c78e5057482907e483bb13cad))
* Restructure documentation ([#1437](https://github.com/AztecProtocol/aztec-packages/issues/1437)) ([da74f58](https://github.com/AztecProtocol/aztec-packages/commit/da74f580e83e7b220573354203e93d756175353d))
* Rework nonces ([#1210](https://github.com/AztecProtocol/aztec-packages/issues/1210)) ([#1331](https://github.com/AztecProtocol/aztec-packages/issues/1331)) ([665cb75](https://github.com/AztecProtocol/aztec-packages/commit/665cb753f50f003ccd21935755aa1f08bfb78deb))
* Sandbox logging tweaks ([#1797](https://github.com/AztecProtocol/aztec-packages/issues/1797)) ([0e3914e](https://github.com/AztecProtocol/aztec-packages/commit/0e3914ed6ad63062add1cc08f6ea85646c068f8a))
* **scripts:** Convenience script to update local generated artifacts ([#1349](https://github.com/AztecProtocol/aztec-packages/issues/1349)) ([317981a](https://github.com/AztecProtocol/aztec-packages/commit/317981a13c9faf791a2760a07e9808a8474ecae2))
* Simplified AztecRpc.registerAccount function ([#1729](https://github.com/AztecProtocol/aztec-packages/issues/1729)) ([8e5f828](https://github.com/AztecProtocol/aztec-packages/commit/8e5f828c0aff0602c49575139883c8abc3cb6e91))
* **simulator:** Initialize ACVM's SimulatedBackend separately (setup pedersen init only happens once) ([#1596](https://github.com/AztecProtocol/aztec-packages/issues/1596)) ([1a260ed](https://github.com/AztecProtocol/aztec-packages/commit/1a260ede0729b1f70b90e06c2e6588bcb5eb9fc3))
* Split out yarn-project bootstrap.sh ([#1790](https://github.com/AztecProtocol/aztec-packages/issues/1790)) ([1788fe6](https://github.com/AztecProtocol/aztec-packages/commit/1788fe6259f5e7fd191929b27996a7342e3f13e5))
* Split SumcheckRound into Prover/Verifier classes ([#1373](https://github.com/AztecProtocol/aztec-packages/issues/1373)) ([8b1d48a](https://github.com/AztecProtocol/aztec-packages/commit/8b1d48a52c41f4f6cf436b481823f59582611b81))
* Start sandbox as a bin from npm package ([#1595](https://github.com/AztecProtocol/aztec-packages/issues/1595)) ([3f793b9](https://github.com/AztecProtocol/aztec-packages/commit/3f793b96674a677472241259d92d352d00f8a6ef))
* Storing `&mut context` in state vars ([#1926](https://github.com/AztecProtocol/aztec-packages/issues/1926)) ([89a7a3f](https://github.com/AztecProtocol/aztec-packages/commit/89a7a3ff22ebc469fe1b58d929af5ef162514c17)), closes [#1805](https://github.com/AztecProtocol/aztec-packages/issues/1805)
* Sync bb master ([#1710](https://github.com/AztecProtocol/aztec-packages/issues/1710)) ([0039c4f](https://github.com/AztecProtocol/aztec-packages/commit/0039c4fdf7c713d9f375d6abda15353325e38d56))
* Sync bb master ([#1713](https://github.com/AztecProtocol/aztec-packages/issues/1713)) ([ec5241c](https://github.com/AztecProtocol/aztec-packages/commit/ec5241c34a9c1214ff66a20133ad6cc5e4081d77))
* Sync bb master ([#1776](https://github.com/AztecProtocol/aztec-packages/issues/1776)) ([7c6fb15](https://github.com/AztecProtocol/aztec-packages/commit/7c6fb15979b48d4d4d5eb5a1ea83d3c0d0ee3b5e))
* Sync bb master ([#1842](https://github.com/AztecProtocol/aztec-packages/issues/1842)) ([2c1ff72](https://github.com/AztecProtocol/aztec-packages/commit/2c1ff729fd1994270644a96da5a954ce2ec72382))
* Sync bb master ([#1852](https://github.com/AztecProtocol/aztec-packages/issues/1852)) ([f979878](https://github.com/AztecProtocol/aztec-packages/commit/f979878cb84dd1b0506cedd59e9df1bb65a99b0a))
* Sync bb master ([#1866](https://github.com/AztecProtocol/aztec-packages/issues/1866)) ([e681a49](https://github.com/AztecProtocol/aztec-packages/commit/e681a4901ee51cdd133c126d299881be6fad3680))
* Sync bb master ([#1947](https://github.com/AztecProtocol/aztec-packages/issues/1947)) ([eed58e1](https://github.com/AztecProtocol/aztec-packages/commit/eed58e157c2740043ad6f53c76b13ba9924c5d93))
* **tests:** Use account class for e2e browser tests ([#1446](https://github.com/AztecProtocol/aztec-packages/issues/1446)) ([ff7ad30](https://github.com/AztecProtocol/aztec-packages/commit/ff7ad3030cc786ceb8525fec488555d42343a02f))
* **tests:** Use new account class in e2e tests ([#1433](https://github.com/AztecProtocol/aztec-packages/issues/1433)) ([fe41757](https://github.com/AztecProtocol/aztec-packages/commit/fe4175759b4c311982026cd4c22ecce699f385a5))
* Typescript script names should be consistent ([#1843](https://github.com/AztecProtocol/aztec-packages/issues/1843)) ([eff8fe7](https://github.com/AztecProtocol/aztec-packages/commit/eff8fe7ea9f2674383b7b8ea1232be49626fc595))
* Update bootstrap.sh in Barretenberg to check for clang 16 ([#1717](https://github.com/AztecProtocol/aztec-packages/issues/1717)) ([87815d7](https://github.com/AztecProtocol/aztec-packages/commit/87815d7e0c6182973d98155c23d2f60b7c66314c))
* Update formatting ([#1874](https://github.com/AztecProtocol/aztec-packages/issues/1874)) ([fb973ca](https://github.com/AztecProtocol/aztec-packages/commit/fb973caeabc2d10daaf052046987e54f563b7e4b))
* Update function selector computation ([#2001](https://github.com/AztecProtocol/aztec-packages/issues/2001)) ([e07ea1a](https://github.com/AztecProtocol/aztec-packages/commit/e07ea1a887484f3a1a2ba8b5328af5abf6ccc6a2))
* Update noir readme alter noir bootstrap to always install tagged version ([#1563](https://github.com/AztecProtocol/aztec-packages/issues/1563)) ([bfc79c2](https://github.com/AztecProtocol/aztec-packages/commit/bfc79c268ff26fec20997e6f7227625b60dc12bd))
* Update pull request template ([#1379](https://github.com/AztecProtocol/aztec-packages/issues/1379)) ([a463dff](https://github.com/AztecProtocol/aztec-packages/commit/a463dffbc2df23dbdbeacc14a47f839906d4b29b))
* Update to acvm 0.24.0 ([#1925](https://github.com/AztecProtocol/aztec-packages/issues/1925)) ([e728304](https://github.com/AztecProtocol/aztec-packages/commit/e72830468362f2ea26b3f830b7e056b096f56d6a))
* Update to acvm 0.24.1 ([#1978](https://github.com/AztecProtocol/aztec-packages/issues/1978)) ([31c0a02](https://github.com/AztecProtocol/aztec-packages/commit/31c0a0219330bce94a16dea9833fd900e61d93b4))
* Updating docs to clang16 ([#1875](https://github.com/AztecProtocol/aztec-packages/issues/1875)) ([a248dae](https://github.com/AztecProtocol/aztec-packages/commit/a248dae54af9cb7ca64b2a7780a4b90e3848a69b))
* Use 2^19 as `MAX_CIRCUIT_SIZE` for NodeJS CLI ([#1834](https://github.com/AztecProtocol/aztec-packages/issues/1834)) ([c573282](https://github.com/AztecProtocol/aztec-packages/commit/c573282fd59e44df70ae125f68281ebb67b7453d))
* Use context instead of custom oracles for public functions ([#1754](https://github.com/AztecProtocol/aztec-packages/issues/1754)) ([46de77a](https://github.com/AztecProtocol/aztec-packages/commit/46de77ad3e5e91b9276146410381c69ccba1ae2b))


### Documentation

* Account contract tutorial ([#1772](https://github.com/AztecProtocol/aztec-packages/issues/1772)) ([0faefba](https://github.com/AztecProtocol/aztec-packages/commit/0faefba283a7c654c0771ba8f15d5bb6346282ab))
* Compile guide ([#1575](https://github.com/AztecProtocol/aztec-packages/issues/1575)) ([d93fa96](https://github.com/AztecProtocol/aztec-packages/commit/d93fa96e6c1229a7c1f3dbb583f49d27378d8603)), closes [#1569](https://github.com/AztecProtocol/aztec-packages/issues/1569)
* Convert quick start guides into e2e tests ([#1726](https://github.com/AztecProtocol/aztec-packages/issues/1726)) ([802a678](https://github.com/AztecProtocol/aztec-packages/commit/802a678e3dd19339cd88b105a0ce341026b58054)), closes [#1564](https://github.com/AztecProtocol/aztec-packages/issues/1564)
* Deploy command fix ([#1634](https://github.com/AztecProtocol/aztec-packages/issues/1634)) ([a0a43d6](https://github.com/AztecProtocol/aztec-packages/commit/a0a43d68189896b8d05ca92f1cecc77adc5ad6be))
* Deploying contracs fixes ([#1633](https://github.com/AztecProtocol/aztec-packages/issues/1633)) ([5036b31](https://github.com/AztecProtocol/aztec-packages/commit/5036b3140bb9d2dc5cc130c3760049ff40bb987f))
* Deploying contracts using `aztec-cli` ([#1592](https://github.com/AztecProtocol/aztec-packages/issues/1592)) ([b43d7a0](https://github.com/AztecProtocol/aztec-packages/commit/b43d7a008dd6672df67090390432893b597bcd62))
* Derivation is not yet implemented for keys ([#1632](https://github.com/AztecProtocol/aztec-packages/issues/1632)) ([881bc71](https://github.com/AztecProtocol/aztec-packages/commit/881bc715d3d69de03bb6413d671f8a4e1cc7a5d6))
* Developer/wallet-providers/keys ([#1271](https://github.com/AztecProtocol/aztec-packages/issues/1271)) ([d70c45b](https://github.com/AztecProtocol/aztec-packages/commit/d70c45b9a27189258daf767f2860bfc3894783a1))
* Events ([#1768](https://github.com/AztecProtocol/aztec-packages/issues/1768)) ([5a38cea](https://github.com/AztecProtocol/aztec-packages/commit/5a38cea3f7c1567a8eea3d6c2c58cad6f79b05f2)), closes [#1756](https://github.com/AztecProtocol/aztec-packages/issues/1756)
* Including "real" code in keys docs ([#1767](https://github.com/AztecProtocol/aztec-packages/issues/1767)) ([cd9cadb](https://github.com/AztecProtocol/aztec-packages/commit/cd9cadbfb6b0311c381586799588a5f64df98f29))
* **keys:** Complete addresses are now broadcast ([#1975](https://github.com/AztecProtocol/aztec-packages/issues/1975)) ([92068ad](https://github.com/AztecProtocol/aztec-packages/commit/92068ad4249b2a20a4c83d82b82517ccdcbfe7f9)), closes [#1936](https://github.com/AztecProtocol/aztec-packages/issues/1936)
* Limitations, privacy, roadmap ([#1759](https://github.com/AztecProtocol/aztec-packages/issues/1759)) ([0cdb27a](https://github.com/AztecProtocol/aztec-packages/commit/0cdb27af8359b61b4a1f51a829ddfc4995ec1d30))
* **limitations:** Limitations on ordering and logs of chopped notes ([#2085](https://github.com/AztecProtocol/aztec-packages/issues/2085)) ([315ad3d](https://github.com/AztecProtocol/aztec-packages/commit/315ad3d58eeb467361848a1e70fd32f3074b35d5)), closes [#1652](https://github.com/AztecProtocol/aztec-packages/issues/1652)
* Link to local ethereum nodes in testing guide ([#2061](https://github.com/AztecProtocol/aztec-packages/issues/2061)) ([e29148b](https://github.com/AztecProtocol/aztec-packages/commit/e29148b379a435a9fefd846cc5fe78af6be7021d))
* Lists of questions to be addressed ([#1414](https://github.com/AztecProtocol/aztec-packages/issues/1414)) ([64bf57b](https://github.com/AztecProtocol/aztec-packages/commit/64bf57b0788f5db78f74b1aa1fb93c50ff72271b))
* Put dev docs before spec ([#1944](https://github.com/AztecProtocol/aztec-packages/issues/1944)) ([f1b29cd](https://github.com/AztecProtocol/aztec-packages/commit/f1b29cd7c7bc0ace2cef55d54f647077e94facad))
* Quick start guide for up page ([#1573](https://github.com/AztecProtocol/aztec-packages/issues/1573)) ([b102517](https://github.com/AztecProtocol/aztec-packages/commit/b102517c24cb4ed5fa05d0078a3eddd2bcc7cb77))
* Some initial noir contract docs ([#1449](https://github.com/AztecProtocol/aztec-packages/issues/1449)) ([a3514c3](https://github.com/AztecProtocol/aztec-packages/commit/a3514c30438c7ef5c1aa9eb4640d228649ee4410))
* Storage and state variables ([#1725](https://github.com/AztecProtocol/aztec-packages/issues/1725)) ([fc72f84](https://github.com/AztecProtocol/aztec-packages/commit/fc72f84a5bf21f083eddf3b8c59a00321dce26fd))
* Use the pre-processor code snippet import method ([#1719](https://github.com/AztecProtocol/aztec-packages/issues/1719)) ([54f6410](https://github.com/AztecProtocol/aztec-packages/commit/54f641081c141e035097a39935952de6be3090fc))
* Wallet dev docs ([#1746](https://github.com/AztecProtocol/aztec-packages/issues/1746)) ([9b4281d](https://github.com/AztecProtocol/aztec-packages/commit/9b4281dab16868cdda86a8f59d6d62aaaa8a90d6)), closes [#1744](https://github.com/AztecProtocol/aztec-packages/issues/1744)

## [0.1.0-alpha63](https://github.com/AztecProtocol/aztec-packages/compare/v0.1.0-alpha62...v0.1.0-alpha63) (2023-09-08)


### Features

* `GrumpkinScalar` type ([#1919](https://github.com/AztecProtocol/aztec-packages/issues/1919)) ([3a9238a](https://github.com/AztecProtocol/aztec-packages/commit/3a9238a99a32259d8d6b85df6335a002c7bab354))


### Bug Fixes

* add retry to tag and docker actions ([#2099](https://github.com/AztecProtocol/aztec-packages/issues/2099)) ([9f741f4](https://github.com/AztecProtocol/aztec-packages/commit/9f741f4e181120edcb63c28fa6c50b5b5e2e26c9))
* **breaking change:** change embedded curve scalar mul to use two limbs to properly encode the scalar field ([#2105](https://github.com/AztecProtocol/aztec-packages/issues/2105)) ([070cc4c](https://github.com/AztecProtocol/aztec-packages/commit/070cc4cb31ada29e42846e16df1ec191100214a5))
* broken bootstrap.sh after renaming `aztec-cli` dir as `cli` ([#2097](https://github.com/AztecProtocol/aztec-packages/issues/2097)) ([2386781](https://github.com/AztecProtocol/aztec-packages/commit/2386781fd1fed9f552559961b4e9f60406095067))
* browser test in canary flow ([#2102](https://github.com/AztecProtocol/aztec-packages/issues/2102)) ([d52af6c](https://github.com/AztecProtocol/aztec-packages/commit/d52af6c0e2c5ed268747237e65603368645c9966)), closes [#2086](https://github.com/AztecProtocol/aztec-packages/issues/2086)
* check a note is read before nullifying it. ([#2076](https://github.com/AztecProtocol/aztec-packages/issues/2076)) ([aabfb13](https://github.com/AztecProtocol/aztec-packages/commit/aabfb1383033364df9c045573098a4f13ca3a452)), closes [#1899](https://github.com/AztecProtocol/aztec-packages/issues/1899)
* circuits issues when building with gcc ([#2107](https://github.com/AztecProtocol/aztec-packages/issues/2107)) ([4f5c4fe](https://github.com/AztecProtocol/aztec-packages/commit/4f5c4fe24f012988169d8a0a3d8ae5245e24d3ee))
* COMMIT_TAG arg value in canary Dockerfile ([#2118](https://github.com/AztecProtocol/aztec-packages/issues/2118)) ([a3d6459](https://github.com/AztecProtocol/aztec-packages/commit/a3d645978a6ccef279870498979733682f63e206))
* dont assume safety of nvm ([#2079](https://github.com/AztecProtocol/aztec-packages/issues/2079)) ([a4167e7](https://github.com/AztecProtocol/aztec-packages/commit/a4167e7e5ef55c9780c786959d078fe854093656))
* end-to-end aztec cli dependency issue ([#2092](https://github.com/AztecProtocol/aztec-packages/issues/2092)) ([16ee3e5](https://github.com/AztecProtocol/aztec-packages/commit/16ee3e530bd99c2a47b8bcda53f0a13f67df2ac6))
* minor annoyances ([#2115](https://github.com/AztecProtocol/aztec-packages/issues/2115)) ([a147582](https://github.com/AztecProtocol/aztec-packages/commit/a1475822b20c360d19a88f6205a4a35d987fc2f5))
* padded printing for e2e-cli ([#2106](https://github.com/AztecProtocol/aztec-packages/issues/2106)) ([5988014](https://github.com/AztecProtocol/aztec-packages/commit/5988014330c929e1fcb52c4fbba5a755fa013c16))
* remaining refs to clang15 ([#2077](https://github.com/AztecProtocol/aztec-packages/issues/2077)) ([2c16547](https://github.com/AztecProtocol/aztec-packages/commit/2c16547c450ac7591d5be7c734962be86be4310e))
* run e2e tests without spot ([#2081](https://github.com/AztecProtocol/aztec-packages/issues/2081)) ([f0aa3ca](https://github.com/AztecProtocol/aztec-packages/commit/f0aa3ca0de995f58ea5a18e64c18ee437b520675))
* updated CLI readme ([#2098](https://github.com/AztecProtocol/aztec-packages/issues/2098)) ([2226091](https://github.com/AztecProtocol/aztec-packages/commit/2226091e21d0aa0dbfa3bea4f95a0ea2a31a4c43)), closes [#1784](https://github.com/AztecProtocol/aztec-packages/issues/1784)


### Miscellaneous

* **circuits:** - remove dead code from cbind of private kernel circuit ([#2088](https://github.com/AztecProtocol/aztec-packages/issues/2088)) ([43dc9d7](https://github.com/AztecProtocol/aztec-packages/commit/43dc9d7500fa3d11a0b557b8fc82da4495c4e605))
* **circuits:** remove dead code in cbind.cpp for public kernel ([#2094](https://github.com/AztecProtocol/aztec-packages/issues/2094)) ([861f960](https://github.com/AztecProtocol/aztec-packages/commit/861f960524436796263d9f79fa06a38d0e62ae84))
* Conservatively raise the minimum supported clang version in CMakeList ([#2023](https://github.com/AztecProtocol/aztec-packages/issues/2023)) ([f49c416](https://github.com/AztecProtocol/aztec-packages/commit/f49c4164387d307f8a86e93faff3eb96d7c99e36))
* **constants:** bump number of private reads and writes ([#2062](https://github.com/AztecProtocol/aztec-packages/issues/2062)) ([ab6c6b1](https://github.com/AztecProtocol/aztec-packages/commit/ab6c6b1cefdc1dd1da6e1198f99a211b31e73d85))
* **contracts:** Use autogenerated Noir interfaces where possible ([#2073](https://github.com/AztecProtocol/aztec-packages/issues/2073)) ([bd6368b](https://github.com/AztecProtocol/aztec-packages/commit/bd6368bd16159aad88906496cb9d6270e483a26e)), closes [#1604](https://github.com/AztecProtocol/aztec-packages/issues/1604)
* merge bb release-please ([#2080](https://github.com/AztecProtocol/aztec-packages/issues/2080)) ([e89b043](https://github.com/AztecProtocol/aztec-packages/commit/e89b04358acbf6f43b72c346406cd97c0fa26af2))
* move storage into main.nr. ([#2068](https://github.com/AztecProtocol/aztec-packages/issues/2068)) ([2c2d72b](https://github.com/AztecProtocol/aztec-packages/commit/2c2d72b7799b24273e498805ecf4c36d69f08d7d))
* protogalaxy relations ([#1897](https://github.com/AztecProtocol/aztec-packages/issues/1897)) ([35407e2](https://github.com/AztecProtocol/aztec-packages/commit/35407e25081744702ec35efe3f95aa0137fe0ebb))


### Documentation

* **limitations:** limitations on ordering and logs of chopped notes ([#2085](https://github.com/AztecProtocol/aztec-packages/issues/2085)) ([315ad3d](https://github.com/AztecProtocol/aztec-packages/commit/315ad3d58eeb467361848a1e70fd32f3074b35d5)), closes [#1652](https://github.com/AztecProtocol/aztec-packages/issues/1652)

## [0.1.0-alpha62](https://github.com/AztecProtocol/aztec-packages/compare/v0.1.0-alpha61...v0.1.0-alpha62) (2023-09-06)


### Features

* **circuits:** hints nullifier transient commitments ([#2056](https://github.com/AztecProtocol/aztec-packages/issues/2056)) ([725b550](https://github.com/AztecProtocol/aztec-packages/commit/725b550a368494abd15a38e95b15b1379bc926bc))
* **docs:** Testing guide and getPrivateStorage method ([#1992](https://github.com/AztecProtocol/aztec-packages/issues/1992)) ([5a8c571](https://github.com/AztecProtocol/aztec-packages/commit/5a8c5719753549f71ceeec9114d69b8d1d640376))


### Bug Fixes

* **build:** Use semver version in docker version tag ([#2065](https://github.com/AztecProtocol/aztec-packages/issues/2065)) ([b3db0d0](https://github.com/AztecProtocol/aztec-packages/commit/b3db0d0ae6d6b7d8a6d7338a556e2b9507e2631a))


### Documentation

* Link to local ethereum nodes in testing guide ([#2061](https://github.com/AztecProtocol/aztec-packages/issues/2061)) ([e29148b](https://github.com/AztecProtocol/aztec-packages/commit/e29148b379a435a9fefd846cc5fe78af6be7021d))

## [0.1.0-alpha61](https://github.com/AztecProtocol/aztec-packages/compare/v0.1.0-alpha60...v0.1.0-alpha61) (2023-09-06)


### Bug Fixes

* **sandbox:** build script for tagged commits ([#2057](https://github.com/AztecProtocol/aztec-packages/issues/2057)) ([c9d9722](https://github.com/AztecProtocol/aztec-packages/commit/c9d9722151de1e6f9a49a4cc6310e5646593ec01))

## [0.1.0-alpha60](https://github.com/AztecProtocol/aztec-packages/compare/v0.1.0-alpha59...v0.1.0-alpha60) (2023-09-06)


### Features

* Goblin recursive verifier ([#1822](https://github.com/AztecProtocol/aztec-packages/issues/1822)) ([f962cb6](https://github.com/AztecProtocol/aztec-packages/commit/f962cb68f46d25047bf67a1ad2e7407a176ffc53))
* initial `is_valid` eip1271 style wallet + minimal test changes ([#1935](https://github.com/AztecProtocol/aztec-packages/issues/1935)) ([f264c54](https://github.com/AztecProtocol/aztec-packages/commit/f264c5421424bf58d983fe104aaf7c7126259e01))


### Bug Fixes

* benchmark git repo ([#2041](https://github.com/AztecProtocol/aztec-packages/issues/2041)) ([3c696bb](https://github.com/AztecProtocol/aztec-packages/commit/3c696bba1ca4bd69c8e3f5bc004d1a07adb23cf1))
* cli canary & deployment ([#2053](https://github.com/AztecProtocol/aztec-packages/issues/2053)) ([1ddd24a](https://github.com/AztecProtocol/aztec-packages/commit/1ddd24ad2f8702fd3d3c48ed015a652b3326bfd9))
* **rpc:** Fixes getNodeInfo serialisation ([#1991](https://github.com/AztecProtocol/aztec-packages/issues/1991)) ([0a29fa8](https://github.com/AztecProtocol/aztec-packages/commit/0a29fa8dd95b37e490c18df2db90a7324ebe762c))


### Miscellaneous

* **circuits:** - use msgpack for cbind routines of native private kernel circuits ([#1938](https://github.com/AztecProtocol/aztec-packages/issues/1938)) ([3dc5c07](https://github.com/AztecProtocol/aztec-packages/commit/3dc5c07358d99786df8809f46638fdb04b33a6c2))
* **docs:** API docs stucture ([#2014](https://github.com/AztecProtocol/aztec-packages/issues/2014)) ([9aab9dd](https://github.com/AztecProtocol/aztec-packages/commit/9aab9ddefac63d35ebc356afed573af268896b35))
* Update function selector computation ([#2001](https://github.com/AztecProtocol/aztec-packages/issues/2001)) ([e07ea1a](https://github.com/AztecProtocol/aztec-packages/commit/e07ea1a887484f3a1a2ba8b5328af5abf6ccc6a2))

## [0.1.0-alpha59](https://github.com/AztecProtocol/aztec-packages/compare/v0.1.0-alpha58...v0.1.0-alpha59) (2023-09-05)


### Features

* Add `info` command to bb ([#2010](https://github.com/AztecProtocol/aztec-packages/issues/2010)) ([1fd8196](https://github.com/AztecProtocol/aztec-packages/commit/1fd8196f302ee49f540dea54ce5df4c450592d05))


### Bug Fixes

* accidental git marker ([#2039](https://github.com/AztecProtocol/aztec-packages/issues/2039)) ([2be9908](https://github.com/AztecProtocol/aztec-packages/commit/2be990861ca25ec206f6bd02b604b73b30710ca8))

## [0.1.0-alpha58](https://github.com/AztecProtocol/aztec-packages/compare/v0.1.0-alpha57...v0.1.0-alpha58) (2023-09-05)


### Miscellaneous

* **ci:** Clean up stale image tags ([#1818](https://github.com/AztecProtocol/aztec-packages/issues/1818)) ([3c8b7b8](https://github.com/AztecProtocol/aztec-packages/commit/3c8b7b84efe938e32c938bbcd744a335ffc50f49))

## [0.1.0-alpha57](https://github.com/AztecProtocol/aztec-packages/compare/v0.1.0-alpha56...v0.1.0-alpha57) (2023-09-05)


### Bug Fixes

* undefined safety in master part 5 ([#2034](https://github.com/AztecProtocol/aztec-packages/issues/2034)) ([41eccaa](https://github.com/AztecProtocol/aztec-packages/commit/41eccaa516200bd65847e1b7b736c2f2cf858960))

## [0.1.0-alpha56](https://github.com/AztecProtocol/aztec-packages/compare/v0.1.0-alpha55...v0.1.0-alpha56) (2023-09-05)


### Bug Fixes

* use COMMIT_TAG_VERSION properly in deploy_dockerhub ([#2033](https://github.com/AztecProtocol/aztec-packages/issues/2033)) ([064ddc3](https://github.com/AztecProtocol/aztec-packages/commit/064ddc3b345ac445fc9fe2385c8aee78b8fb6e47))

## [0.1.0-alpha55](https://github.com/AztecProtocol/aztec-packages/compare/v0.1.0-alpha54...v0.1.0-alpha55) (2023-09-05)


### Bug Fixes

* **build-system:** undefined IMAGE_TAG and ARG_TAG ([#2030](https://github.com/AztecProtocol/aztec-packages/issues/2030)) ([dfdba4b](https://github.com/AztecProtocol/aztec-packages/commit/dfdba4b5c6fb0c75f7f463e0b5eb71e6e7d1b667))

## [0.1.0-alpha54](https://github.com/AztecProtocol/aztec-packages/compare/v0.1.0-alpha53...v0.1.0-alpha54) (2023-09-05)


### Bug Fixes

* try to catch last undefined safety issues ([#2027](https://github.com/AztecProtocol/aztec-packages/issues/2027)) ([12e7486](https://github.com/AztecProtocol/aztec-packages/commit/12e7486c0750f648f51d2b43317df843a3c52bec))

## [0.1.0-alpha53](https://github.com/AztecProtocol/aztec-packages/compare/v0.1.0-alpha52...v0.1.0-alpha53) (2023-09-05)


### Bug Fixes

* ensure_repo undefined-safe ([#2025](https://github.com/AztecProtocol/aztec-packages/issues/2025)) ([e36fb6b](https://github.com/AztecProtocol/aztec-packages/commit/e36fb6bb8a1ee9a3d405c3e5340ffa4e589656e2))

## [0.1.0-alpha52](https://github.com/AztecProtocol/aztec-packages/compare/v0.1.0-alpha51...v0.1.0-alpha52) (2023-09-05)


### Features

* **docs:** set up noir contracts in getting-started ([#1770](https://github.com/AztecProtocol/aztec-packages/issues/1770)) ([33eb99d](https://github.com/AztecProtocol/aztec-packages/commit/33eb99d4a00831f340b1b0de0352fc272cb66d14))


### Bug Fixes

* Complete JS call stacks across ACVM wasm boundaries ([#2013](https://github.com/AztecProtocol/aztec-packages/issues/2013)) ([8e84e46](https://github.com/AztecProtocol/aztec-packages/commit/8e84e460899f11eaf7f383863e20dc5395e45c6e))
* deploy_ecr calculating CONTENT_HASH ([#2024](https://github.com/AztecProtocol/aztec-packages/issues/2024)) ([edee198](https://github.com/AztecProtocol/aztec-packages/commit/edee1981d8d795aef64bd6de738f09ea9a1a2547))
* Option to fail silently when retrying ([#2015](https://github.com/AztecProtocol/aztec-packages/issues/2015)) ([453c9c1](https://github.com/AztecProtocol/aztec-packages/commit/453c9c1b234213fff4d63e117f2bc6c827040125))

## [0.1.0-alpha51](https://github.com/AztecProtocol/aztec-packages/compare/v0.1.0-alpha50...v0.1.0-alpha51) (2023-09-05)


### Bug Fixes

* build script ([#2017](https://github.com/AztecProtocol/aztec-packages/issues/2017)) ([23fce27](https://github.com/AztecProtocol/aztec-packages/commit/23fce277c44a06777ea168085ac498d62016b36e))

## [0.1.0-alpha50](https://github.com/AztecProtocol/aztec-packages/compare/v0.1.0-alpha49...v0.1.0-alpha50) (2023-09-05)


### ⚠ BREAKING CHANGES

* update to acvm 0.24.0 ([#1925](https://github.com/AztecProtocol/aztec-packages/issues/1925))

### Features

* **892:** add hints for matching transient read requests with correspondi… ([#1995](https://github.com/AztecProtocol/aztec-packages/issues/1995)) ([0955bb7](https://github.com/AztecProtocol/aztec-packages/commit/0955bb7b0903b12c4f041096d51a1dbb48f6359d))
* Add support for assert messages & runtime call stacks  ([#1997](https://github.com/AztecProtocol/aztec-packages/issues/1997)) ([ac68837](https://github.com/AztecProtocol/aztec-packages/commit/ac68837677a80897538d7a0790af8d04410c4446))
* **Aztec.nr:** Kernel return types abstraction ([#1924](https://github.com/AztecProtocol/aztec-packages/issues/1924)) ([3a8e702](https://github.com/AztecProtocol/aztec-packages/commit/3a8e7026ea10aa8564bdcc127efd4213ebd526de))
* **ci:** use content hash in build system, restrict docs build to *.ts or *.cpp ([#1953](https://github.com/AztecProtocol/aztec-packages/issues/1953)) ([0036e07](https://github.com/AztecProtocol/aztec-packages/commit/0036e0742a67dfa8aa1fcdb498b89caca6441508))
* do not allow slot 0 in `noir-libs` ([#1884](https://github.com/AztecProtocol/aztec-packages/issues/1884)) ([54094b4](https://github.com/AztecProtocol/aztec-packages/commit/54094b464a4dc7aebf157ca54145cffce822bc6f)), closes [#1692](https://github.com/AztecProtocol/aztec-packages/issues/1692)
* throwing when submitting a duplicate tx of a settled one ([#1880](https://github.com/AztecProtocol/aztec-packages/issues/1880)) ([9ad768f](https://github.com/AztecProtocol/aztec-packages/commit/9ad768f1af5344dc079a74e80ec601e062558fd5)), closes [#1810](https://github.com/AztecProtocol/aztec-packages/issues/1810)
* typos, using Tx.clone functionality, better naming ([#1976](https://github.com/AztecProtocol/aztec-packages/issues/1976)) ([00bca67](https://github.com/AztecProtocol/aztec-packages/commit/00bca675cf7984052c960c3d1797c5b017f07f57))


### Bug Fixes

* add retry_10 around ensure_repo ([#1963](https://github.com/AztecProtocol/aztec-packages/issues/1963)) ([0afde39](https://github.com/AztecProtocol/aztec-packages/commit/0afde390ac63d132b0ba85440500da3375fd2e22))
* Adds Mac cross compile flags into barretenberg ([#1954](https://github.com/AztecProtocol/aztec-packages/issues/1954)) ([3aaf91e](https://github.com/AztecProtocol/aztec-packages/commit/3aaf91e03fc01f0cb12249f22dbcb007023f69d4))
* bb meta-data ([#1960](https://github.com/AztecProtocol/aztec-packages/issues/1960)) ([712e0a0](https://github.com/AztecProtocol/aztec-packages/commit/712e0a088bff9ae2f49489901fab2a3fe0fb6d4b))
* **bb.js:** (breaking change) bundles bb.js properly so that it works in the browser and in node ([#1855](https://github.com/AztecProtocol/aztec-packages/issues/1855)) ([1aa6f59](https://github.com/AztecProtocol/aztec-packages/commit/1aa6f5934cd97dd32d81e490013f8ef7d1e14ec7))
* Benchmark preset uses clang16 ([#1902](https://github.com/AztecProtocol/aztec-packages/issues/1902)) ([4f7eeea](https://github.com/AztecProtocol/aztec-packages/commit/4f7eeea6c79604aea88433790dfc542a356aa898))
* build ([#1906](https://github.com/AztecProtocol/aztec-packages/issues/1906)) ([8223be1](https://github.com/AztecProtocol/aztec-packages/commit/8223be18d98ebb4edb7700310b2fda5201bd04b9))
* **ci:** Incorrect content hash in some build targets ([#1973](https://github.com/AztecProtocol/aztec-packages/issues/1973)) ([0a2a515](https://github.com/AztecProtocol/aztec-packages/commit/0a2a515ecf52849cce1e45a7b39f44d420b43f34))
* circuits should not link openmp with -DMULTITHREADING ([#1929](https://github.com/AztecProtocol/aztec-packages/issues/1929)) ([cd1a685](https://github.com/AztecProtocol/aztec-packages/commit/cd1a685a3ecdd571d83cd2ad0844bd1d143fd9af))
* compilation on homebrew clang 16.06 ([#1937](https://github.com/AztecProtocol/aztec-packages/issues/1937)) ([c611582](https://github.com/AztecProtocol/aztec-packages/commit/c611582239a057717410f0a6c0fd8202844a564e))
* docs preprocessor line numbers and errors ([#1883](https://github.com/AztecProtocol/aztec-packages/issues/1883)) ([4e7e290](https://github.com/AztecProtocol/aztec-packages/commit/4e7e290478ae4ca9c128c0b6b4b26529965cc2a2))
* ensure CLI command doesn't fail due to missing client version ([#1895](https://github.com/AztecProtocol/aztec-packages/issues/1895)) ([88086e4](https://github.com/AztecProtocol/aztec-packages/commit/88086e4a80d7841d28188366a469800afa281693))
* error handling in acir simulator ([#1907](https://github.com/AztecProtocol/aztec-packages/issues/1907)) ([165008e](https://github.com/AztecProtocol/aztec-packages/commit/165008ec3027d8f2f76256c37f63e5d7a669b5dd))
* Fix off by one in circuits.js when fetching points from transcript ([#1993](https://github.com/AztecProtocol/aztec-packages/issues/1993)) ([cec901f](https://github.com/AztecProtocol/aztec-packages/commit/cec901f3df440ebc0e3bdcfb2567b70fd9bde9dd))
* format.sh issues ([#1946](https://github.com/AztecProtocol/aztec-packages/issues/1946)) ([f24814b](https://github.com/AztecProtocol/aztec-packages/commit/f24814b328c45316fa584cad1d9aa4784b6a0b2e))
* master ([#1981](https://github.com/AztecProtocol/aztec-packages/issues/1981)) ([6bfb053](https://github.com/AztecProtocol/aztec-packages/commit/6bfb053fb2c4053a72a8daa18a241261380ee311))
* More accurate c++ build pattern ([#1962](https://github.com/AztecProtocol/aztec-packages/issues/1962)) ([21c2f8e](https://github.com/AztecProtocol/aztec-packages/commit/21c2f8edd110da8749a0039c900c25aff8baa7a4))
* polyfill by bundling fileURLToPath ([#1949](https://github.com/AztecProtocol/aztec-packages/issues/1949)) ([1b2de01](https://github.com/AztecProtocol/aztec-packages/commit/1b2de01df69a16f442c348cc302ade1392e74519))
* Set correct version of RPC & Sandbox when deploying tagged commit ([#1914](https://github.com/AztecProtocol/aztec-packages/issues/1914)) ([898c50d](https://github.com/AztecProtocol/aztec-packages/commit/898c50d594b7515f6ca3b904d31ccf724b683ade))
* typescript lookup of aztec.js types ([#1948](https://github.com/AztecProtocol/aztec-packages/issues/1948)) ([22901ae](https://github.com/AztecProtocol/aztec-packages/commit/22901ae8fa63b61ba1fbf4885f3940dc839b555c))
* unify base64 interface between mac and linux (cherry-picked) ([#1968](https://github.com/AztecProtocol/aztec-packages/issues/1968)) ([ee24b52](https://github.com/AztecProtocol/aztec-packages/commit/ee24b52234956744d2b35b0eb0d3b5c2dcf7ed82))
* Update docs search config ([#1920](https://github.com/AztecProtocol/aztec-packages/issues/1920)) ([c8764e6](https://github.com/AztecProtocol/aztec-packages/commit/c8764e6150b7d372c34ddc008be9925e5f5f6dfb))
* update docs search keys ([#1931](https://github.com/AztecProtocol/aztec-packages/issues/1931)) ([03b200c](https://github.com/AztecProtocol/aztec-packages/commit/03b200c10da71bd4b6fa3902edb254f9f625bf8b))


### Miscellaneous

* **1407:** remove forwarding witnesses ([#1930](https://github.com/AztecProtocol/aztec-packages/issues/1930)) ([cc8bc8f](https://github.com/AztecProtocol/aztec-packages/commit/cc8bc8f48b175479e1c4dfbcf9b92159f096c2cf)), closes [#1407](https://github.com/AztecProtocol/aztec-packages/issues/1407)
* **1879:** add use of PrivateKernelPublicInputs in TS whenever relevant ([#1911](https://github.com/AztecProtocol/aztec-packages/issues/1911)) ([8d5f548](https://github.com/AztecProtocol/aztec-packages/commit/8d5f548e42d627da1685820f99fc28ff5f47abbe))
* acir tests are no longer base64 encoded ([#1854](https://github.com/AztecProtocol/aztec-packages/issues/1854)) ([7fffd16](https://github.com/AztecProtocol/aztec-packages/commit/7fffd1680d6246f64ee4d4ca965b9764c6c0ebb3))
* Add back double verify proof to test suite ([#1986](https://github.com/AztecProtocol/aztec-packages/issues/1986)) ([f8688d7](https://github.com/AztecProtocol/aztec-packages/commit/f8688d7df05abcb6c650aafb130dedb707931950))
* add CLI test to canary flow ([#1918](https://github.com/AztecProtocol/aztec-packages/issues/1918)) ([cc68958](https://github.com/AztecProtocol/aztec-packages/commit/cc689585a845ce3c20ea9714ca744f4aa8837462)), closes [#1903](https://github.com/AztecProtocol/aztec-packages/issues/1903)
* Add safemath noir testing ([#1967](https://github.com/AztecProtocol/aztec-packages/issues/1967)) ([cb1f1ec](https://github.com/AztecProtocol/aztec-packages/commit/cb1f1ece1fd050b00ad8cbe9086e76383f9e6377))
* **Aztec.nr:** remove implicit imports ([#1901](https://github.com/AztecProtocol/aztec-packages/issues/1901)) ([c7d5190](https://github.com/AztecProtocol/aztec-packages/commit/c7d5190e48771c334bfa7062c361bcd623faa318))
* **Aztec.nr:** Remove the open keyword from public functions ([#1917](https://github.com/AztecProtocol/aztec-packages/issues/1917)) ([4db8603](https://github.com/AztecProtocol/aztec-packages/commit/4db8603a4ee293c64a67be5ba74072bd654c7ec5))
* **ci:** build docs on every pr ([#1955](https://github.com/AztecProtocol/aztec-packages/issues/1955)) ([c200bc5](https://github.com/AztecProtocol/aztec-packages/commit/c200bc5337da9d6122a2545fceeada98a28d7077))
* Enable project-specific releases for dockerhub too ([#1721](https://github.com/AztecProtocol/aztec-packages/issues/1721)) ([5d2c082](https://github.com/AztecProtocol/aztec-packages/commit/5d2c0824eedb748ca3e2beaa8589410a21ba6e57))
* reduce max circuit size in bb binary ([#1942](https://github.com/AztecProtocol/aztec-packages/issues/1942)) ([c61439b](https://github.com/AztecProtocol/aztec-packages/commit/c61439b316829563c93bbfcb78b799bdc105ff71))
* Reference noir master for acir tests ([#1969](https://github.com/AztecProtocol/aztec-packages/issues/1969)) ([86b72e1](https://github.com/AztecProtocol/aztec-packages/commit/86b72e1e8da29a0335e40c6de4c46538d8138f2f))
* remove debug output from `run_acir_tests` script ([#1970](https://github.com/AztecProtocol/aztec-packages/issues/1970)) ([74c83c5](https://github.com/AztecProtocol/aztec-packages/commit/74c83c5e1436f391eef435926c2da1d508d67713))
* storing `&mut context` in state vars ([#1926](https://github.com/AztecProtocol/aztec-packages/issues/1926)) ([89a7a3f](https://github.com/AztecProtocol/aztec-packages/commit/89a7a3ff22ebc469fe1b58d929af5ef162514c17)), closes [#1805](https://github.com/AztecProtocol/aztec-packages/issues/1805)
* sync bb master ([#1947](https://github.com/AztecProtocol/aztec-packages/issues/1947)) ([eed58e1](https://github.com/AztecProtocol/aztec-packages/commit/eed58e157c2740043ad6f53c76b13ba9924c5d93))
* update to acvm 0.24.0 ([#1925](https://github.com/AztecProtocol/aztec-packages/issues/1925)) ([e728304](https://github.com/AztecProtocol/aztec-packages/commit/e72830468362f2ea26b3f830b7e056b096f56d6a))
* Update to acvm 0.24.1 ([#1978](https://github.com/AztecProtocol/aztec-packages/issues/1978)) ([31c0a02](https://github.com/AztecProtocol/aztec-packages/commit/31c0a0219330bce94a16dea9833fd900e61d93b4))
* updating docs to clang16 ([#1875](https://github.com/AztecProtocol/aztec-packages/issues/1875)) ([a248dae](https://github.com/AztecProtocol/aztec-packages/commit/a248dae54af9cb7ca64b2a7780a4b90e3848a69b))


### Documentation

* **keys:** Complete addresses are now broadcast ([#1975](https://github.com/AztecProtocol/aztec-packages/issues/1975)) ([92068ad](https://github.com/AztecProtocol/aztec-packages/commit/92068ad4249b2a20a4c83d82b82517ccdcbfe7f9)), closes [#1936](https://github.com/AztecProtocol/aztec-packages/issues/1936)
* limitations, privacy, roadmap ([#1759](https://github.com/AztecProtocol/aztec-packages/issues/1759)) ([0cdb27a](https://github.com/AztecProtocol/aztec-packages/commit/0cdb27af8359b61b4a1f51a829ddfc4995ec1d30))
* put dev docs before spec ([#1944](https://github.com/AztecProtocol/aztec-packages/issues/1944)) ([f1b29cd](https://github.com/AztecProtocol/aztec-packages/commit/f1b29cd7c7bc0ace2cef55d54f647077e94facad))
* storage and state variables ([#1725](https://github.com/AztecProtocol/aztec-packages/issues/1725)) ([fc72f84](https://github.com/AztecProtocol/aztec-packages/commit/fc72f84a5bf21f083eddf3b8c59a00321dce26fd))

## [0.1.0-alpha49](https://github.com/AztecProtocol/aztec-packages/compare/v0.1.0-alpha48...v0.1.0-alpha49) (2023-08-30)


### Features

* Generate public context contract interfaces ([#1860](https://github.com/AztecProtocol/aztec-packages/issues/1860)) ([2f4045e](https://github.com/AztecProtocol/aztec-packages/commit/2f4045e22dbea0e316103da20c6ba8a667826777)), closes [#1782](https://github.com/AztecProtocol/aztec-packages/issues/1782)


### Bug Fixes

* Do not warn on mismatched cli/sandbox version ([#1894](https://github.com/AztecProtocol/aztec-packages/issues/1894)) ([a44a0f6](https://github.com/AztecProtocol/aztec-packages/commit/a44a0f6489b8ea7d648d1b9babf49fae8d593b7b))
* remove extra transfer arg in CLI Guide ([#1887](https://github.com/AztecProtocol/aztec-packages/issues/1887)) ([55728b8](https://github.com/AztecProtocol/aztec-packages/commit/55728b850c19403ba8b2aaefe89181640acbd9fd))
* Reset keccak var inputs to 0 ([#1881](https://github.com/AztecProtocol/aztec-packages/issues/1881)) ([382f07e](https://github.com/AztecProtocol/aztec-packages/commit/382f07e3032c5ad3cf15e62e38bb5f0583ab46dd))


### Miscellaneous

* **1074:** remove read request data from final private kernel circuit public inputs ([#1840](https://github.com/AztecProtocol/aztec-packages/issues/1840)) ([c61557a](https://github.com/AztecProtocol/aztec-packages/commit/c61557ae926f89cead7306368197fdbe8f23dd6d))
* Reenable and refactor nested calls e2e tests ([#1868](https://github.com/AztecProtocol/aztec-packages/issues/1868)) ([570de80](https://github.com/AztecProtocol/aztec-packages/commit/570de803376de4af6a1824b7a3c95129c98e2fa0)), closes [#1587](https://github.com/AztecProtocol/aztec-packages/issues/1587)
* Update formatting ([#1874](https://github.com/AztecProtocol/aztec-packages/issues/1874)) ([fb973ca](https://github.com/AztecProtocol/aztec-packages/commit/fb973caeabc2d10daaf052046987e54f563b7e4b))

## [0.1.0-alpha48](https://github.com/AztecProtocol/aztec-packages/compare/v0.1.0-alpha47...v0.1.0-alpha48) (2023-08-30)


### Features

* Add ARM build for Mac + cleanup artifacts ([#1837](https://github.com/AztecProtocol/aztec-packages/issues/1837)) ([270a4ae](https://github.com/AztecProtocol/aztec-packages/commit/270a4ae4d1998149735251e2c3c1be73a9029f61))
* broadcasting 'public key' and 'partial address' as L1 calldata ([#1801](https://github.com/AztecProtocol/aztec-packages/issues/1801)) ([78d6444](https://github.com/AztecProtocol/aztec-packages/commit/78d6444e82903fe3d0d17318cd38b1b262e81391)), closes [#1778](https://github.com/AztecProtocol/aztec-packages/issues/1778)
* Check sandbox version matches CLI's ([#1849](https://github.com/AztecProtocol/aztec-packages/issues/1849)) ([7279730](https://github.com/AztecProtocol/aztec-packages/commit/72797305ac9ce8639abb09334cf2471f0932ca88))
* **docs:** adding some nitpick suggestions before sandbox release ([#1859](https://github.com/AztecProtocol/aztec-packages/issues/1859)) ([c1144f7](https://github.com/AztecProtocol/aztec-packages/commit/c1144f7bcfe8ebe222b840b0edd3d901ca30bdaf))
* More reliable getTxReceipt api. ([#1793](https://github.com/AztecProtocol/aztec-packages/issues/1793)) ([ad16b22](https://github.com/AztecProtocol/aztec-packages/commit/ad16b2219bff44dfbc3482b81c86e29bf0d60fc5))
* **noir:** use `#[aztec(private)]` and `#[aztec(public)` attributes ([#1735](https://github.com/AztecProtocol/aztec-packages/issues/1735)) ([89756fa](https://github.com/AztecProtocol/aztec-packages/commit/89756fae7d562274a84c60024beff5fae032f297))
* Recursive fn calls to spend more notes. ([#1779](https://github.com/AztecProtocol/aztec-packages/issues/1779)) ([94053e4](https://github.com/AztecProtocol/aztec-packages/commit/94053e44f4d2a702fe9066bfff3cdd35e6d1b645))
* Simulate enqueued public functions and locate failing constraints on them ([#1853](https://github.com/AztecProtocol/aztec-packages/issues/1853)) ([a065fd5](https://github.com/AztecProtocol/aztec-packages/commit/a065fd53dde48a1f28616ebe130222dd39d07b11))
* Update safe_math and move to libraries ([#1803](https://github.com/AztecProtocol/aztec-packages/issues/1803)) ([b10656d](https://github.com/AztecProtocol/aztec-packages/commit/b10656d30622366dcbbe5adb5b3948b0702a06e7))
* Write debug-level log to local file in Sandbox ([#1846](https://github.com/AztecProtocol/aztec-packages/issues/1846)) ([0317e93](https://github.com/AztecProtocol/aztec-packages/commit/0317e93d3dffb3b66a926863e7fe8b8c15f61536)), closes [#1605](https://github.com/AztecProtocol/aztec-packages/issues/1605)


### Bug Fixes

* Conditionally compile base64 command for bb binary ([#1851](https://github.com/AztecProtocol/aztec-packages/issues/1851)) ([be97185](https://github.com/AztecProtocol/aztec-packages/commit/be9718505c7e387bb46183299c9db855e6d7f91c))
* default color to light mode ([#1847](https://github.com/AztecProtocol/aztec-packages/issues/1847)) ([4fc8d39](https://github.com/AztecProtocol/aztec-packages/commit/4fc8d39041d437940bb18815e14f506b2ebe259e))
* Disallow unregistered classes in JSON RPC interface and match by name ([#1820](https://github.com/AztecProtocol/aztec-packages/issues/1820)) ([35b8170](https://github.com/AztecProtocol/aztec-packages/commit/35b817055e1fe848e6d87d445a7881c5c128ad35))
* Set side effect counter on contract reads ([#1870](https://github.com/AztecProtocol/aztec-packages/issues/1870)) ([1d8881e](https://github.com/AztecProtocol/aztec-packages/commit/1d8881e4872b39195ace523432c0e34bc9081f8d)), closes [#1588](https://github.com/AztecProtocol/aztec-packages/issues/1588)
* Truncate SRS size to the amount of points that we have downloaded ([#1862](https://github.com/AztecProtocol/aztec-packages/issues/1862)) ([0a7058c](https://github.com/AztecProtocol/aztec-packages/commit/0a7058cbda228c9baf378d69c906596e204d804f))


### Miscellaneous

* add browser test to canary flow ([#1808](https://github.com/AztecProtocol/aztec-packages/issues/1808)) ([7f4fa43](https://github.com/AztecProtocol/aztec-packages/commit/7f4fa438bf2f4966338e3e53ece7c1d01e8dd054))
* **ci:** fix output name in release please workflow ([#1858](https://github.com/AztecProtocol/aztec-packages/issues/1858)) ([857821f](https://github.com/AztecProtocol/aztec-packages/commit/857821fa1923aa013fe9470f12067208d5c494d1))
* CLI tests ([#1786](https://github.com/AztecProtocol/aztec-packages/issues/1786)) ([2987065](https://github.com/AztecProtocol/aztec-packages/commit/298706557a8f2b73a87dfb10c81626ebf127cadb)), closes [#1450](https://github.com/AztecProtocol/aztec-packages/issues/1450)
* compile minimal WASM binary needed for blackbox functions ([#1824](https://github.com/AztecProtocol/aztec-packages/issues/1824)) ([76a30b8](https://github.com/AztecProtocol/aztec-packages/commit/76a30b8b5b5e765a14fe7d896d8890897cad7756))
* fixed linter errors for `ecc`, `numeric` and `common` modules ([#1714](https://github.com/AztecProtocol/aztec-packages/issues/1714)) ([026273b](https://github.com/AztecProtocol/aztec-packages/commit/026273b42d8c41de9bc4a86f898162cbbb3ad35f))
* Refactor Cli interface to be more unix-like ([#1833](https://github.com/AztecProtocol/aztec-packages/issues/1833)) ([28d722e](https://github.com/AztecProtocol/aztec-packages/commit/28d722ef965d907b7b7820ccdd7ee0afc97c88fa))
* sync bb master ([#1842](https://github.com/AztecProtocol/aztec-packages/issues/1842)) ([2c1ff72](https://github.com/AztecProtocol/aztec-packages/commit/2c1ff729fd1994270644a96da5a954ce2ec72382))
* sync bb master ([#1852](https://github.com/AztecProtocol/aztec-packages/issues/1852)) ([f979878](https://github.com/AztecProtocol/aztec-packages/commit/f979878cb84dd1b0506cedd59e9df1bb65a99b0a))
* sync bb master ([#1866](https://github.com/AztecProtocol/aztec-packages/issues/1866)) ([e681a49](https://github.com/AztecProtocol/aztec-packages/commit/e681a4901ee51cdd133c126d299881be6fad3680))
* typescript script names should be consistent ([#1843](https://github.com/AztecProtocol/aztec-packages/issues/1843)) ([eff8fe7](https://github.com/AztecProtocol/aztec-packages/commit/eff8fe7ea9f2674383b7b8ea1232be49626fc595))
* use 2^19 as `MAX_CIRCUIT_SIZE` for NodeJS CLI ([#1834](https://github.com/AztecProtocol/aztec-packages/issues/1834)) ([c573282](https://github.com/AztecProtocol/aztec-packages/commit/c573282fd59e44df70ae125f68281ebb67b7453d))


### Documentation

* Account contract tutorial ([#1772](https://github.com/AztecProtocol/aztec-packages/issues/1772)) ([0faefba](https://github.com/AztecProtocol/aztec-packages/commit/0faefba283a7c654c0771ba8f15d5bb6346282ab))
* Wallet dev docs ([#1746](https://github.com/AztecProtocol/aztec-packages/issues/1746)) ([9b4281d](https://github.com/AztecProtocol/aztec-packages/commit/9b4281dab16868cdda86a8f59d6d62aaaa8a90d6)), closes [#1744](https://github.com/AztecProtocol/aztec-packages/issues/1744)

## [0.1.0-alpha47](https://github.com/AztecProtocol/aztec-packages/compare/v0.1.0-alpha46...v0.1.0-alpha47) (2023-08-25)


### Features

* `FunctionSelector` type ([#1518](https://github.com/AztecProtocol/aztec-packages/issues/1518)) ([942f705](https://github.com/AztecProtocol/aztec-packages/commit/942f7058adc706924ff26d2490bec7f7d57d7149)), closes [#1424](https://github.com/AztecProtocol/aztec-packages/issues/1424)


### Bug Fixes

* increment time by 1 for previous rollup was warped ([#1594](https://github.com/AztecProtocol/aztec-packages/issues/1594)) ([2a52107](https://github.com/AztecProtocol/aztec-packages/commit/2a521070397b6d1915e55b4ec702d4778563e683))
* **noir:** Add workaround for latest noir in account contracts ([#1781](https://github.com/AztecProtocol/aztec-packages/issues/1781)) ([eb8a052](https://github.com/AztecProtocol/aztec-packages/commit/eb8a052ad4e19394f096cc3a0f533c2560a7f5cc))
* selector name regression ([#1800](https://github.com/AztecProtocol/aztec-packages/issues/1800)) ([a5be8bb](https://github.com/AztecProtocol/aztec-packages/commit/a5be8bb92f858d266cf96671c46343b6e1ff400a))


### Miscellaneous

* Add todo for using generator indices in note commitment and nullifier computation. ([#1762](https://github.com/AztecProtocol/aztec-packages/issues/1762)) ([2db6728](https://github.com/AztecProtocol/aztec-packages/commit/2db6728fcaf75ce8c98d821b65695543bb0c82a2))
* **p2p:** Updated libp2p dependencies ([#1792](https://github.com/AztecProtocol/aztec-packages/issues/1792)) ([79df831](https://github.com/AztecProtocol/aztec-packages/commit/79df83134e15655dc3a5ed9dae00dc52a3d40681))
* Sandbox logging tweaks ([#1797](https://github.com/AztecProtocol/aztec-packages/issues/1797)) ([0e3914e](https://github.com/AztecProtocol/aztec-packages/commit/0e3914ed6ad63062add1cc08f6ea85646c068f8a))
* split out yarn-project bootstrap.sh ([#1790](https://github.com/AztecProtocol/aztec-packages/issues/1790)) ([1788fe6](https://github.com/AztecProtocol/aztec-packages/commit/1788fe6259f5e7fd191929b27996a7342e3f13e5))

## [0.1.0-alpha46](https://github.com/AztecProtocol/aztec-packages/compare/v0.1.0-alpha45...v0.1.0-alpha46) (2023-08-24)


### Features

* CDP/Lending example contract ([#1554](https://github.com/AztecProtocol/aztec-packages/issues/1554)) ([ecf6df2](https://github.com/AztecProtocol/aztec-packages/commit/ecf6df201047dcaa61c270cdb512cdc62086b356))
* no unencrypted logs in private functions ([#1780](https://github.com/AztecProtocol/aztec-packages/issues/1780)) ([4d8002e](https://github.com/AztecProtocol/aztec-packages/commit/4d8002e0d101a14c465929d92ea05d0be6e8d99a)), closes [#1689](https://github.com/AztecProtocol/aztec-packages/issues/1689)


### Miscellaneous

* **ci:** Updated release please configuration ([#1787](https://github.com/AztecProtocol/aztec-packages/issues/1787)) ([6eb2f7a](https://github.com/AztecProtocol/aztec-packages/commit/6eb2f7abc40bae88ebeec546ad9f8f2c7d810a24))
* sync bb master ([#1776](https://github.com/AztecProtocol/aztec-packages/issues/1776)) ([7c6fb15](https://github.com/AztecProtocol/aztec-packages/commit/7c6fb15979b48d4d4d5eb5a1ea83d3c0d0ee3b5e))


### Documentation

* events ([#1768](https://github.com/AztecProtocol/aztec-packages/issues/1768)) ([5a38cea](https://github.com/AztecProtocol/aztec-packages/commit/5a38cea3f7c1567a8eea3d6c2c58cad6f79b05f2)), closes [#1756](https://github.com/AztecProtocol/aztec-packages/issues/1756)

## [0.1.0-alpha45](https://github.com/AztecProtocol/aztec-packages/compare/v0.1.0-alpha44...v0.1.0-alpha45) (2023-08-23)


### Features

* **bb:** Use an environment variable to set the transcript URL ([#1750](https://github.com/AztecProtocol/aztec-packages/issues/1750)) ([31488c1](https://github.com/AztecProtocol/aztec-packages/commit/31488c19acfdfd5ff0c3e7f242f94dc0aa049158))
* **ci:** Initial release please config ([#1769](https://github.com/AztecProtocol/aztec-packages/issues/1769)) ([4207559](https://github.com/AztecProtocol/aztec-packages/commit/42075590058b21f38b5e745af54b2062371f9ebe))
* compress debug symbols ([#1760](https://github.com/AztecProtocol/aztec-packages/issues/1760)) ([9464b25](https://github.com/AztecProtocol/aztec-packages/commit/9464b25c1a2a809db559ddc4e2d4ee5ade1fa65a))
* not retrying unrecoverable errors ([#1752](https://github.com/AztecProtocol/aztec-packages/issues/1752)) ([c0f2820](https://github.com/AztecProtocol/aztec-packages/commit/c0f28204f53152c941704ece66287eddfe13c047))


### Bug Fixes

* Download SRS using one canonical URL across the codebase ([#1748](https://github.com/AztecProtocol/aztec-packages/issues/1748)) ([899b055](https://github.com/AztecProtocol/aztec-packages/commit/899b05557365a5bf97e64793dd563a1b4bfa0f3f))
* proving fails when circuit has size &gt; ~500K ([#1739](https://github.com/AztecProtocol/aztec-packages/issues/1739)) ([708b05c](https://github.com/AztecProtocol/aztec-packages/commit/708b05ca6638dc0d6ca7cb34fb8de76665a43b58))


### Miscellaneous

* **ci:** set up nightly barretenberg releases ([#1761](https://github.com/AztecProtocol/aztec-packages/issues/1761)) ([e0078da](https://github.com/AztecProtocol/aztec-packages/commit/e0078dabfcd9e006c2a489c7142ab141d5d81b80))
* **ci:** Updated release please config ([#1775](https://github.com/AztecProtocol/aztec-packages/issues/1775)) ([0085e8b](https://github.com/AztecProtocol/aztec-packages/commit/0085e8b17efc36256974f82525530c39ed182639))
* consistent block number method naming ([#1751](https://github.com/AztecProtocol/aztec-packages/issues/1751)) ([df1afe2](https://github.com/AztecProtocol/aztec-packages/commit/df1afe255d3095a9b2851b47480801c06d116eed))
* Use context instead of custom oracles for public functions ([#1754](https://github.com/AztecProtocol/aztec-packages/issues/1754)) ([46de77a](https://github.com/AztecProtocol/aztec-packages/commit/46de77ad3e5e91b9276146410381c69ccba1ae2b))


### Documentation

* convert quick start guides into e2e tests ([#1726](https://github.com/AztecProtocol/aztec-packages/issues/1726)) ([802a678](https://github.com/AztecProtocol/aztec-packages/commit/802a678e3dd19339cd88b105a0ce341026b58054)), closes [#1564](https://github.com/AztecProtocol/aztec-packages/issues/1564)
* including "real" code in keys docs ([#1767](https://github.com/AztecProtocol/aztec-packages/issues/1767)) ([cd9cadb](https://github.com/AztecProtocol/aztec-packages/commit/cd9cadbfb6b0311c381586799588a5f64df98f29))
