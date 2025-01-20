# Changelog

## [0.71.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.70.0...barretenberg-v0.71.0) (2025-01-17)

### Bug Fixes

- Reallocate commitment key to avoid pippenger error ([#11249](https://github.com/AztecProtocol/aztec-packages/issues/11249)) ([8fc2011](https://github.com/AztecProtocol/aztec-packages/commit/8fc2011fbe0e3545924898a53e851279b8cc0084))
- Resolve misc bugs handling phases in avm witgen ([#11218](https://github.com/AztecProtocol/aztec-packages/issues/11218)) ([29bc4bd](https://github.com/AztecProtocol/aztec-packages/commit/29bc4bdd5b59ee1050951e0c143654ef3cdd25b0))

### Miscellaneous

- **avm:** Calldata, returndata slices out of range padded with zeros ([#11265](https://github.com/AztecProtocol/aztec-packages/issues/11265)) ([a469c94](https://github.com/AztecProtocol/aztec-packages/commit/a469c94ccfa37723aa79f132e55c31ae7c4c6693)), closes [#10933](https://github.com/AztecProtocol/aztec-packages/issues/10933)
- Move shared pcs functionality to internal library in solidity and small refactorings in sumcheck ([#11230](https://github.com/AztecProtocol/aztec-packages/issues/11230)) ([507ae9d](https://github.com/AztecProtocol/aztec-packages/commit/507ae9df9c369603da20f25ccc228729ee2733cd))

## [0.70.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.69.1...barretenberg-v0.70.0) (2025-01-15)

### Features

- Allow concurrent world state access ([#11216](https://github.com/AztecProtocol/aztec-packages/issues/11216)) ([17aa4b4](https://github.com/AztecProtocol/aztec-packages/commit/17aa4b4cf2164d29d24d4da29d4b55d273802747))
- **avm2:** Avm redesign init ([#10906](https://github.com/AztecProtocol/aztec-packages/issues/10906)) ([231f017](https://github.com/AztecProtocol/aztec-packages/commit/231f017d14c3d261b28ab19dcbdf368c561d0cc7))
- Permutation argument optimizations ([#10960](https://github.com/AztecProtocol/aztec-packages/issues/10960)) ([de99603](https://github.com/AztecProtocol/aztec-packages/commit/de9960345da17e97464d2c36c35e3eada4fa3680))
- Use tail public inputs as transaction hash ([#11100](https://github.com/AztecProtocol/aztec-packages/issues/11100)) ([34be2c3](https://github.com/AztecProtocol/aztec-packages/commit/34be2c3800c2d99c11fe3448e01c77abf60c726d))

### Bug Fixes

- **avm:** AVM circuit fixes related calldata, returndata and call_ptr ([#11207](https://github.com/AztecProtocol/aztec-packages/issues/11207)) ([2f05dc0](https://github.com/AztecProtocol/aztec-packages/commit/2f05dc02fe7b147c7cd6fc235134279dbf332c08))
- **avm:** Mac build ([#11195](https://github.com/AztecProtocol/aztec-packages/issues/11195)) ([c4f4452](https://github.com/AztecProtocol/aztec-packages/commit/c4f44520a8cc234219f7e9e021b0574a894aa06e))
- **avm:** Mac build (retry) ([#11197](https://github.com/AztecProtocol/aztec-packages/issues/11197)) ([0a4b763](https://github.com/AztecProtocol/aztec-packages/commit/0a4b763a39fde0f37ac5baa3bd1e3052c01ca946))
- **bootstrap:** Don't download bad cache if unstaged changes ([#11198](https://github.com/AztecProtocol/aztec-packages/issues/11198)) ([2bd895b](https://github.com/AztecProtocol/aztec-packages/commit/2bd895bb0887fddc45433224b3ebef04660f744c))
- Remove max lookup table size constant (for now) ([#11095](https://github.com/AztecProtocol/aztec-packages/issues/11095)) ([7e9e268](https://github.com/AztecProtocol/aztec-packages/commit/7e9e2681e314145237f95f79ffdc95ad25a0e319))

### Miscellaneous

- **avm:** Fix mac build ([#11147](https://github.com/AztecProtocol/aztec-packages/issues/11147)) ([1775e53](https://github.com/AztecProtocol/aztec-packages/commit/1775e53025f9946ba26b8b624a0f15f4ccdabd2f))
- **avm:** Improve column stats ([#11135](https://github.com/AztecProtocol/aztec-packages/issues/11135)) ([535a14c](https://github.com/AztecProtocol/aztec-packages/commit/535a14c8c59399ce7579c69f6aec862f71981699))
- **avm:** Re-enable bb-prover tests in CI, change some to check-circuit-only, enable multi-enqueued call tests ([#11180](https://github.com/AztecProtocol/aztec-packages/issues/11180)) ([3092212](https://github.com/AztecProtocol/aztec-packages/commit/3092212d61cb1359d10b1741b48627518e5437d7))
- **avm:** Vm2 followup cleanup ([#11186](https://github.com/AztecProtocol/aztec-packages/issues/11186)) ([6de4013](https://github.com/AztecProtocol/aztec-packages/commit/6de4013c1204b3478b6d444c0cff5ca9c5c6cd03))
- **docs:** Update tx concepts page ([#10947](https://github.com/AztecProtocol/aztec-packages/issues/10947)) ([d9d9798](https://github.com/AztecProtocol/aztec-packages/commit/d9d9798f90cce34ff03cc89d8aa18bb9db0414f1))
- Move witness computation into class plus some other cleanup ([#11140](https://github.com/AztecProtocol/aztec-packages/issues/11140)) ([d41e9ab](https://github.com/AztecProtocol/aztec-packages/commit/d41e9abc8c2428be224400ec43f4844adfd954c3))
- Redo typo PR by longxiangqiao ([#11109](https://github.com/AztecProtocol/aztec-packages/issues/11109)) ([b8ef30e](https://github.com/AztecProtocol/aztec-packages/commit/b8ef30e2a147b5318b70ff2146186dfbae70af42))
- Refactor Solidity Transcript and improve error handling in sol_honk flow ([#11158](https://github.com/AztecProtocol/aztec-packages/issues/11158)) ([58fdf87](https://github.com/AztecProtocol/aztec-packages/commit/58fdf87560fc2c43255675c83dbc36eb370ca5b0))
- SmallSubgroupIPA tests ([#11106](https://github.com/AztecProtocol/aztec-packages/issues/11106)) ([f034e2a](https://github.com/AztecProtocol/aztec-packages/commit/f034e2af6f372e393b63ff19ca6d118d03506e1f))

## [0.69.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.69.0...barretenberg-v0.69.1) (2025-01-08)

### Features

- Acir formal proofs ([#10973](https://github.com/AztecProtocol/aztec-packages/issues/10973)) ([1cb7cd7](https://github.com/AztecProtocol/aztec-packages/commit/1cb7cd78d089fd1e2706d9d5993b6115bcdd6a84))
- Derive transcript structure between non-zk and zk flavors and between Ultra and UltraKeccak ([#11086](https://github.com/AztecProtocol/aztec-packages/issues/11086)) ([48286c6](https://github.com/AztecProtocol/aztec-packages/commit/48286c671a61dbe18e5f8e0c44e71ab6c3fd109a))
- Fix commitments and openings of masking polynomials used in zk sumcheck ([#10773](https://github.com/AztecProtocol/aztec-packages/issues/10773)) ([fc48dcc](https://github.com/AztecProtocol/aztec-packages/commit/fc48dcca537fa790ed6866ad4e184cb89c2617a2))
- Improve witness generation for cycle_group::batch_mul ([#9563](https://github.com/AztecProtocol/aztec-packages/issues/9563)) ([7da7f2b](https://github.com/AztecProtocol/aztec-packages/commit/7da7f2bb6c26a7c55a5869d21c3a5f546880a001))

### Bug Fixes

- Add bytecode instances in reverse ([#11064](https://github.com/AztecProtocol/aztec-packages/issues/11064)) ([036496c](https://github.com/AztecProtocol/aztec-packages/commit/036496ce7496132b7376c9a6708a9a6ed460771d))
- Reset pc to 0 for next enqueued call in avm witgen ([#11043](https://github.com/AztecProtocol/aztec-packages/issues/11043)) ([44e4816](https://github.com/AztecProtocol/aztec-packages/commit/44e481650e99de0bcae6e5299413e12cb15227b9))
- Update requests per call should be less than per tx ([#11072](https://github.com/AztecProtocol/aztec-packages/issues/11072)) ([da5e95f](https://github.com/AztecProtocol/aztec-packages/commit/da5e95ffab1694bad22817edd9abdf8e48c992ca))

### Miscellaneous

- **avm:** Handle specific MSM errors ([#11068](https://github.com/AztecProtocol/aztec-packages/issues/11068)) ([a5097a9](https://github.com/AztecProtocol/aztec-packages/commit/a5097a994e7ecc0be2b6c7d7b320bd7bad5a27a0)), closes [#10854](https://github.com/AztecProtocol/aztec-packages/issues/10854)
- **avm:** More column information in permutations ([#11070](https://github.com/AztecProtocol/aztec-packages/issues/11070)) ([8829f24](https://github.com/AztecProtocol/aztec-packages/commit/8829f2421238945f042338bac0c9e7342517248b))
- Clean up proof lengths and IPA ([#11020](https://github.com/AztecProtocol/aztec-packages/issues/11020)) ([800c834](https://github.com/AztecProtocol/aztec-packages/commit/800c83475c2b23ac6cf501c998f7c57b3803ad8f))
- Fix write_recursion_inputs flow in bootstrap ([#11080](https://github.com/AztecProtocol/aztec-packages/issues/11080)) ([cd5a615](https://github.com/AztecProtocol/aztec-packages/commit/cd5a615f154446878cb8681d70b9e55c14511690))
- Restore `prove_then_verify` test on `verify_rollup_honk_proof` ([#11018](https://github.com/AztecProtocol/aztec-packages/issues/11018)) ([79e289d](https://github.com/AztecProtocol/aztec-packages/commit/79e289d4c77c36e847851ec2a910ed0bc122d307))
- Unify honk verifier contracts ([#11067](https://github.com/AztecProtocol/aztec-packages/issues/11067)) ([9968849](https://github.com/AztecProtocol/aztec-packages/commit/9968849f1e3680ad26edb174d81693f0ced0edd4))

## [0.69.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.68.2...barretenberg-v0.69.0) (2025-01-03)

### Features

- Encapsulated UltraHonk Vanilla IVC ([#10900](https://github.com/AztecProtocol/aztec-packages/issues/10900)) ([fd5f611](https://github.com/AztecProtocol/aztec-packages/commit/fd5f611aca60c9c906a6440fdb5683794a183d53))
- Use full IPA recursive verifier in root rollup ([#10962](https://github.com/AztecProtocol/aztec-packages/issues/10962)) ([37095ce](https://github.com/AztecProtocol/aztec-packages/commit/37095ceba560ad66516467387d186b5afd19a6e0))

### Bug Fixes

- Bigint builtins are foreigns (https://github.com/noir-lang/noir/pull/6892) ([2d3805a](https://github.com/AztecProtocol/aztec-packages/commit/2d3805a3b682b27bf6275c547b4b3d68d214eebe))
- **ci:** Acir bench ([#11021](https://github.com/AztecProtocol/aztec-packages/issues/11021)) ([9eaa109](https://github.com/AztecProtocol/aztec-packages/commit/9eaa10983b26616876099896accb0e3093ae8d20))
- Consistent file_id across installation paths (https://github.com/noir-lang/noir/pull/6912) ([2d3805a](https://github.com/AztecProtocol/aztec-packages/commit/2d3805a3b682b27bf6275c547b4b3d68d214eebe))
- Remove unnecessary cast in bit-shift (https://github.com/noir-lang/noir/pull/6890) ([2d3805a](https://github.com/AztecProtocol/aztec-packages/commit/2d3805a3b682b27bf6275c547b4b3d68d214eebe))

### Miscellaneous

- Add `Instruction::Noop` (https://github.com/noir-lang/noir/pull/6899) ([2d3805a](https://github.com/AztecProtocol/aztec-packages/commit/2d3805a3b682b27bf6275c547b4b3d68d214eebe))
- Add `rollup_root` and `rollup_block_merge` to tracked protocol circuits (https://github.com/noir-lang/noir/pull/6903) ([2d3805a](https://github.com/AztecProtocol/aztec-packages/commit/2d3805a3b682b27bf6275c547b4b3d68d214eebe))
- Cl/ci3.2 ([#10919](https://github.com/AztecProtocol/aztec-packages/issues/10919)) ([49dacc3](https://github.com/AztecProtocol/aztec-packages/commit/49dacc3378a339f8cc36971b630c52952249f60c))
- Clean up translator circuit builder function definitions ([#10944](https://github.com/AztecProtocol/aztec-packages/issues/10944)) ([f6fef05](https://github.com/AztecProtocol/aztec-packages/commit/f6fef05119af7714d60f00c52455e52bdfa98288))
- Disable broken honk test ([#11010](https://github.com/AztecProtocol/aztec-packages/issues/11010)) ([8ad239a](https://github.com/AztecProtocol/aztec-packages/commit/8ad239a7cddcde8df610e9c0287681fc12cca306))
- Fix mac build ([#10963](https://github.com/AztecProtocol/aztec-packages/issues/10963)) ([158afc4](https://github.com/AztecProtocol/aztec-packages/commit/158afc4cd34a9fc9cb41bcb083b5197eae1ce442))
- Redo typo PR by Anon-im ([#11009](https://github.com/AztecProtocol/aztec-packages/issues/11009)) ([2044c58](https://github.com/AztecProtocol/aztec-packages/commit/2044c58387b5687658f190cf1b4a078a036eabc0))
- Redo typo PR by Hack666r ([#10992](https://github.com/AztecProtocol/aztec-packages/issues/10992)) ([018f11e](https://github.com/AztecProtocol/aztec-packages/commit/018f11e39266423376b3a56afbc8aaf54b4de31d))
- Redo typo PR by MonkeyKing44 ([#10996](https://github.com/AztecProtocol/aztec-packages/issues/10996)) ([faca458](https://github.com/AztecProtocol/aztec-packages/commit/faca458adda3139e92dcb2709f2c087c85842dd8))
- Redo typo PR by petryshkaCODE ([#10993](https://github.com/AztecProtocol/aztec-packages/issues/10993)) ([0c6a4be](https://github.com/AztecProtocol/aztec-packages/commit/0c6a4bee82c62a522f69756f0d233ec637cd1a7a))
- Redo typo PR by VitalikBerashvili ([#10994](https://github.com/AztecProtocol/aztec-packages/issues/10994)) ([da36da4](https://github.com/AztecProtocol/aztec-packages/commit/da36da48560d3610b2d9abf1a56c47d1b28cf9a1))
- Release Noir(1.0.0-beta.1) (https://github.com/noir-lang/noir/pull/6622) ([2d3805a](https://github.com/AztecProtocol/aztec-packages/commit/2d3805a3b682b27bf6275c547b4b3d68d214eebe))

## [0.68.2](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.68.1...barretenberg-v0.68.2) (2024-12-24)

### Features

- Use UltraRollupHonk in rollup ([#10342](https://github.com/AztecProtocol/aztec-packages/issues/10342)) ([82bc146](https://github.com/AztecProtocol/aztec-packages/commit/82bc146989f1375bb36b7d2ab47e3068af513f71))

## [0.68.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.68.0...barretenberg-v0.68.1) (2024-12-23)

### Features

- Add limit to unique contract call ([#10640](https://github.com/AztecProtocol/aztec-packages/issues/10640)) ([d340f0b](https://github.com/AztecProtocol/aztec-packages/commit/d340f0b0c2c97b59d2a8830bdae452d85945322c))

### Miscellaneous

- **avm:** Check that slice read/write are not out of memory range ([#10879](https://github.com/AztecProtocol/aztec-packages/issues/10879)) ([ab3f318](https://github.com/AztecProtocol/aztec-packages/commit/ab3f31858b09cb6c8afcc3d2f8f361814cbe531c)), closes [#7385](https://github.com/AztecProtocol/aztec-packages/issues/7385)
- Reorganise translator proving key construction ([#10853](https://github.com/AztecProtocol/aztec-packages/issues/10853)) ([5da4d1b](https://github.com/AztecProtocol/aztec-packages/commit/5da4d1b661cb27b81c657adacf928a74f98c264c))

## [0.68.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.67.1...barretenberg-v0.68.0) (2024-12-20)

### ⚠ BREAKING CHANGES

- lower public tx gas limit to 6M ([#10635](https://github.com/AztecProtocol/aztec-packages/issues/10635))
- l2 gas maximum is per-TX-public-portion. AVM startup gas is now 20k. ([#10214](https://github.com/AztecProtocol/aztec-packages/issues/10214))
- rename Header to BlockHeader ([#10372](https://github.com/AztecProtocol/aztec-packages/issues/10372))
- remove SchnorrVerify opcode ([#9897](https://github.com/AztecProtocol/aztec-packages/issues/9897))

### Features

- Add gate count tracking for ivc constraints ([#10772](https://github.com/AztecProtocol/aztec-packages/issues/10772)) ([ebd6aba](https://github.com/AztecProtocol/aztec-packages/commit/ebd6aba915b822711166b4424cc4c81f226ddcfb))
- Add priority fees to gas settings ([#10763](https://github.com/AztecProtocol/aztec-packages/issues/10763)) ([263eaad](https://github.com/AztecProtocol/aztec-packages/commit/263eaad065d607d7af2d2c163c5090b8d73216c1))
- Add total mana used to header ([#9868](https://github.com/AztecProtocol/aztec-packages/issues/9868)) ([2478d19](https://github.com/AztecProtocol/aztec-packages/commit/2478d1909db2d79cc0cdd3063dc2ac4e1eaedce3))
- Add tree equality assertions ([#10756](https://github.com/AztecProtocol/aztec-packages/issues/10756)) ([923826a](https://github.com/AztecProtocol/aztec-packages/commit/923826a9d1bbed6739527a82b34d5610600eca1b))
- Add verify proof calls to private kernels ([#10533](https://github.com/AztecProtocol/aztec-packages/issues/10533)) ([ce0eee0](https://github.com/AztecProtocol/aztec-packages/commit/ce0eee0ef4a2084ec74b6dae0a75d18af5877ef8))
- Added a UnivariateMonomial representation to reduce field ops in protogalaxy+sumcheck ([#10401](https://github.com/AztecProtocol/aztec-packages/issues/10401)) ([15475f4](https://github.com/AztecProtocol/aztec-packages/commit/15475f47bdc2ac02ea5157bdc9d1f5172ff6ed09))
- Adding fuzzer for ultra bigfield and relaxing ultra circuit checker ([#10433](https://github.com/AztecProtocol/aztec-packages/issues/10433)) ([da4c47c](https://github.com/AztecProtocol/aztec-packages/commit/da4c47c5dc8caea3e860ac15a58b9ff7f011e4f6))
- Allow querying block number for tree indices ([#10332](https://github.com/AztecProtocol/aztec-packages/issues/10332)) ([cf05a7a](https://github.com/AztecProtocol/aztec-packages/commit/cf05a7a346ea11853e940d5e9ac105ef0d629d35))
- AVM inserts fee write on txs with public calls ([#10394](https://github.com/AztecProtocol/aztec-packages/issues/10394)) ([98ba747](https://github.com/AztecProtocol/aztec-packages/commit/98ba7475ac0130dac4424a2f5cabdbe37eba5cc8))
- **avm:** Error handling for address resolution ([#9994](https://github.com/AztecProtocol/aztec-packages/issues/9994)) ([ceaeda5](https://github.com/AztecProtocol/aztec-packages/commit/ceaeda50d2fd391edda3ee8186b86558b7f092e2)), closes [#9131](https://github.com/AztecProtocol/aztec-packages/issues/9131)
- **avm:** New public inputs witgen ([#10179](https://github.com/AztecProtocol/aztec-packages/issues/10179)) ([ac8f13e](https://github.com/AztecProtocol/aztec-packages/commit/ac8f13e4cd9a3f6b23d53ce5b06cc436324d5f7b))
- Avoid inserting an empty leaf in indexed trees on update ([#10281](https://github.com/AztecProtocol/aztec-packages/issues/10281)) ([5a04ca8](https://github.com/AztecProtocol/aztec-packages/commit/5a04ca880ae2a0f285b6a5a110286ba10bc4a6c3))
- Avoid inserting an empty leaf in indexed trees on update ([#10334](https://github.com/AztecProtocol/aztec-packages/issues/10334)) ([80fad45](https://github.com/AztecProtocol/aztec-packages/commit/80fad4544a4d8c1b488f8b4b4f86fe508ed1f4cc))
- **bb:** Define std::hash for field ([#10312](https://github.com/AztecProtocol/aztec-packages/issues/10312)) ([752bc59](https://github.com/AztecProtocol/aztec-packages/commit/752bc59c579710c21acf6cc97164e377f72c256c))
- Better initialization for permutation mapping components ([#10750](https://github.com/AztecProtocol/aztec-packages/issues/10750)) ([1516d7f](https://github.com/AztecProtocol/aztec-packages/commit/1516d7f7bd6a2adbb650bd7cdd572b33db98dbfc))
- CIVC browser proveThenVerify ([#10431](https://github.com/AztecProtocol/aztec-packages/issues/10431)) ([8c064d4](https://github.com/AztecProtocol/aztec-packages/commit/8c064d484c686fdf00a100f65f1f740be4ef13cb))
- Client IVC API ([#10217](https://github.com/AztecProtocol/aztec-packages/issues/10217)) ([cc54a1e](https://github.com/AztecProtocol/aztec-packages/commit/cc54a1e1ef75b29d160a02d03cf9b29e28d3e4ca))
- Configure world state block history ([#10216](https://github.com/AztecProtocol/aztec-packages/issues/10216)) ([01eb392](https://github.com/AztecProtocol/aztec-packages/commit/01eb392f15995f344e40aa8f8e41a28f6f5b825d))
- Don't store every block number in block indices DB ([#10658](https://github.com/AztecProtocol/aztec-packages/issues/10658)) ([a3fba84](https://github.com/AztecProtocol/aztec-packages/commit/a3fba8442fdd62f429054c3367984fd4206bbbeb))
- Full IPA Recursive Verifier ([#10189](https://github.com/AztecProtocol/aztec-packages/issues/10189)) ([b5783d3](https://github.com/AztecProtocol/aztec-packages/commit/b5783d3945959056d24aa3d988e9ca9efd3ec224))
- GETCONTRACTINSTANCE and bytecode retrieval perform nullifier membership checks ([#10445](https://github.com/AztecProtocol/aztec-packages/issues/10445)) ([9301253](https://github.com/AztecProtocol/aztec-packages/commit/9301253f0488e6d96ed12a8c9bde72a653aa7d36)), closes [#10377](https://github.com/AztecProtocol/aztec-packages/issues/10377) [#10379](https://github.com/AztecProtocol/aztec-packages/issues/10379)
- Handle nested calls in witgen ([#10384](https://github.com/AztecProtocol/aztec-packages/issues/10384)) ([1e21f31](https://github.com/AztecProtocol/aztec-packages/commit/1e21f31d430947f48dc9f5e52d0deb1af70ee705))
- Improved data storage metrics ([#10020](https://github.com/AztecProtocol/aztec-packages/issues/10020)) ([c6ab0c9](https://github.com/AztecProtocol/aztec-packages/commit/c6ab0c9c7a270104fb3e9f6160be50a90ce5e77d))
- Integrate verify_proof calls in mock protocol circuits ([#9253](https://github.com/AztecProtocol/aztec-packages/issues/9253)) ([7ed89aa](https://github.com/AztecProtocol/aztec-packages/commit/7ed89aaa9d0968af6334c1c8abf6c06a42754c52))
- Keccak honk proving in bb.js ([#10489](https://github.com/AztecProtocol/aztec-packages/issues/10489)) ([e0d7431](https://github.com/AztecProtocol/aztec-packages/commit/e0d743121674bcfdd73f84836c17645a5bc2df92))
- Leaf index requests to the native world state can now be performed as a batch query ([#10649](https://github.com/AztecProtocol/aztec-packages/issues/10649)) ([a437e73](https://github.com/AztecProtocol/aztec-packages/commit/a437e73558a936981f3eb3ba022b0770b75d9060))
- Manage enqueued calls & phases in AVM witgen ([#10310](https://github.com/AztecProtocol/aztec-packages/issues/10310)) ([e7ebef8](https://github.com/AztecProtocol/aztec-packages/commit/e7ebef8d09744fdc24a79cb0bf74638b0a8f5dc8))
- Mock IVC state from arbitrary acir IVC recursion constraints ([#10314](https://github.com/AztecProtocol/aztec-packages/issues/10314)) ([ac7c0da](https://github.com/AztecProtocol/aztec-packages/commit/ac7c0da38ff05d6f11c4d6a6244c4526ac00232e))
- Modify HonkRecursionConstraint to handle IPA claims ([#10469](https://github.com/AztecProtocol/aztec-packages/issues/10469)) ([a204d1b](https://github.com/AztecProtocol/aztec-packages/commit/a204d1b60514d6321c2db5063375cc2bbd507fe8))
- Move busread and lookup block construction at the top of the trace ([#10707](https://github.com/AztecProtocol/aztec-packages/issues/10707)) ([e8480cb](https://github.com/AztecProtocol/aztec-packages/commit/e8480cbf1ecdee5d7228b08d1c9608308acdd624))
- New 17 in 20 IVC bench added to actions ([#10777](https://github.com/AztecProtocol/aztec-packages/issues/10777)) ([9fbcff6](https://github.com/AztecProtocol/aztec-packages/commit/9fbcff60a63e0eca14c4e28677aed1fc5e6f2c14))
- Note hash management in the AVM ([#10666](https://github.com/AztecProtocol/aztec-packages/issues/10666)) ([e077980](https://github.com/AztecProtocol/aztec-packages/commit/e077980f8cce1fc7922c27d368b6dbced956aad2))
- Origin tags implemented in biggroup ([#10002](https://github.com/AztecProtocol/aztec-packages/issues/10002)) ([c8696b1](https://github.com/AztecProtocol/aztec-packages/commit/c8696b165425ee6dd7a2398f4b90b29f24d762f4))
- Remove auto verify mode from ClientIVC ([#10599](https://github.com/AztecProtocol/aztec-packages/issues/10599)) ([b1d8b97](https://github.com/AztecProtocol/aztec-packages/commit/b1d8b978871948fbba639476465f4de6fb471292))
- Rename Header to BlockHeader ([#10372](https://github.com/AztecProtocol/aztec-packages/issues/10372)) ([0803964](https://github.com/AztecProtocol/aztec-packages/commit/0803964015492db81001c17252aa4b724e43797b))
- Sayonara old hints ([#10547](https://github.com/AztecProtocol/aztec-packages/issues/10547)) ([dede16e](https://github.com/AztecProtocol/aztec-packages/commit/dede16e035115e1c6971079d12f62e3046407b36))
- Sequential insertion in indexed trees ([#10111](https://github.com/AztecProtocol/aztec-packages/issues/10111)) ([bfd9fa6](https://github.com/AztecProtocol/aztec-packages/commit/bfd9fa68be4147acb3e3feeaf83ed3c9247761be))
- Several Updates in SMT verification module (part 1) ([#10437](https://github.com/AztecProtocol/aztec-packages/issues/10437)) ([0c37672](https://github.com/AztecProtocol/aztec-packages/commit/0c376725a29ec18e25a7c9a89c0df8f5a1e06ff4))
- Speed up transaction execution ([#10172](https://github.com/AztecProtocol/aztec-packages/issues/10172)) ([da265b6](https://github.com/AztecProtocol/aztec-packages/commit/da265b6b7d61a0d991fa23bd044f711513a0e86c))
- Sumcheck with disabled rows ([#10068](https://github.com/AztecProtocol/aztec-packages/issues/10068)) ([abd2226](https://github.com/AztecProtocol/aztec-packages/commit/abd2226da3a159e7efb7cbef099e41739f665ef1))
- Swap polys to facilitate dynamic trace overflow ([#9976](https://github.com/AztecProtocol/aztec-packages/issues/9976)) ([b7b282c](https://github.com/AztecProtocol/aztec-packages/commit/b7b282cd0fb306abbe3951a55a1a4f4d42ed7f8e))
- Ultra rollup flows ([#10162](https://github.com/AztecProtocol/aztec-packages/issues/10162)) ([c53f4cf](https://github.com/AztecProtocol/aztec-packages/commit/c53f4cf84c60b8d81cc62d5827ec4408da88cc4e))
- UltraRollupRecursiveFlavor ([#10088](https://github.com/AztecProtocol/aztec-packages/issues/10088)) ([4418ef2](https://github.com/AztecProtocol/aztec-packages/commit/4418ef2a5768e0f627160b86e8dc8735d4bf00e7))
- Unified create circuit from acir ([#10440](https://github.com/AztecProtocol/aztec-packages/issues/10440)) ([a4dfe13](https://github.com/AztecProtocol/aztec-packages/commit/a4dfe13c1c0af3d527f5c9b2fcc38fe059e9bc38))

### Bug Fixes

- Avm gas and non-member ([#10709](https://github.com/AztecProtocol/aztec-packages/issues/10709)) ([dd8cc7b](https://github.com/AztecProtocol/aztec-packages/commit/dd8cc7b93119c0376873a366a8310d2ebd2641de))
- AVM witgen track gas for nested calls and external halts ([#10731](https://github.com/AztecProtocol/aztec-packages/issues/10731)) ([b8bdb52](https://github.com/AztecProtocol/aztec-packages/commit/b8bdb529719c1f72244e904ea667462458a43317))
- **avm:** Execution test ordering ([#10226](https://github.com/AztecProtocol/aztec-packages/issues/10226)) ([49b4a6c](https://github.com/AztecProtocol/aztec-packages/commit/49b4a6c07f39711ad2a0477e1fad11e11b8ee23c))
- Bbup cleanup and fix ([#10067](https://github.com/AztecProtocol/aztec-packages/issues/10067)) ([0ff8177](https://github.com/AztecProtocol/aztec-packages/commit/0ff81773da58f7c28621d4e5711ce130afd3e51b))
- Cl/ci3.1 ([#10888](https://github.com/AztecProtocol/aztec-packages/issues/10888)) ([2454a26](https://github.com/AztecProtocol/aztec-packages/commit/2454a262cce5d804420ad8e11c3e0b8f10a6e218))
- Don't store indices of zero leaves. ([#10270](https://github.com/AztecProtocol/aztec-packages/issues/10270)) ([c22be8b](https://github.com/AztecProtocol/aztec-packages/commit/c22be8b23e6d16cf4a60509494b979c3edfdba9b))
- Handle calls to non-existent contracts in AVM witgen ([#10862](https://github.com/AztecProtocol/aztec-packages/issues/10862)) ([8820bd5](https://github.com/AztecProtocol/aztec-packages/commit/8820bd5f3004fedd6c286e2dbf5f8b24fc767fd2))
- Remove auto verify in cbind ivc prove ([#10627](https://github.com/AztecProtocol/aztec-packages/issues/10627)) ([d773423](https://github.com/AztecProtocol/aztec-packages/commit/d773423fb4c701d830ac2a732ab9bbc205396a63))
- Remove table shifts ([#10814](https://github.com/AztecProtocol/aztec-packages/issues/10814)) ([469476b](https://github.com/AztecProtocol/aztec-packages/commit/469476bc73606659da58d492b2640dea4ac924c2))
- Revert "feat: Avoid inserting an empty leaf in indexed trees on update" ([#10319](https://github.com/AztecProtocol/aztec-packages/issues/10319)) ([887c011](https://github.com/AztecProtocol/aztec-packages/commit/887c01103255ea4cbbb6cb33c8771d47123b3bff))
- Small fixes to avm witgen ([#10749](https://github.com/AztecProtocol/aztec-packages/issues/10749)) ([96887b6](https://github.com/AztecProtocol/aztec-packages/commit/96887b60c3a6a1aaf4fa5b7623e664917e7a68bc))
- Strip wasm debug ([#9987](https://github.com/AztecProtocol/aztec-packages/issues/9987)) ([62a6b66](https://github.com/AztecProtocol/aztec-packages/commit/62a6b662f1ef20a603177c55c199de4a79b65b5c))
- Url in bbup install ([#10456](https://github.com/AztecProtocol/aztec-packages/issues/10456)) ([1b0dfb7](https://github.com/AztecProtocol/aztec-packages/commit/1b0dfb77612cae9fa026da1d453bdf0d89442200))
- Use correct size for databus_id ([#10673](https://github.com/AztecProtocol/aztec-packages/issues/10673)) ([95eb658](https://github.com/AztecProtocol/aztec-packages/commit/95eb658f90687c75589b345f95a904d96e2a8e62))
- Use e2e structure in cbind ([#10585](https://github.com/AztecProtocol/aztec-packages/issues/10585)) ([985aef1](https://github.com/AztecProtocol/aztec-packages/commit/985aef16ce612a9d3d7ff27b87b871a01911002e))
- Witness changes in file sponge.hpp ([#10345](https://github.com/AztecProtocol/aztec-packages/issues/10345)) ([4a38edf](https://github.com/AztecProtocol/aztec-packages/commit/4a38edfc1580aa1cb5113993ff8a2e5574076226))
- Zero index is not always 0 ([#10135](https://github.com/AztecProtocol/aztec-packages/issues/10135)) ([bbac3d9](https://github.com/AztecProtocol/aztec-packages/commit/bbac3d9db1a4cd133c4949c3c25a17a7e39d14a2))

### Miscellaneous

- **avm:** Conditionally enable avm recursion unit tests based on an env variable ([#10873](https://github.com/AztecProtocol/aztec-packages/issues/10873)) ([7a9506c](https://github.com/AztecProtocol/aztec-packages/commit/7a9506c6f400a88cbdbc9fad75d7b2bd35bea2cf))
- **avm:** Extra column information in lookups ([#10905](https://github.com/AztecProtocol/aztec-packages/issues/10905)) ([ef247d4](https://github.com/AztecProtocol/aztec-packages/commit/ef247d4d68ce4aadb4c45b1f75d71a411e7102b6))
- **avm:** Fake verification routine for avm recursion in public base rollup ([#10382](https://github.com/AztecProtocol/aztec-packages/issues/10382)) ([a1e5966](https://github.com/AztecProtocol/aztec-packages/commit/a1e5966ffe98351d848bfa47608a2f22c381acfb)), closes [#10243](https://github.com/AztecProtocol/aztec-packages/issues/10243)
- **avm:** Gas constants adjustment based on trace rows accounting ([#10614](https://github.com/AztecProtocol/aztec-packages/issues/10614)) ([fc729ef](https://github.com/AztecProtocol/aztec-packages/commit/fc729ef3af7ec33f48dbb9fae3820a59a4a26479)), closes [#10368](https://github.com/AztecProtocol/aztec-packages/issues/10368)
- **avm:** Handle parsing error ([#10203](https://github.com/AztecProtocol/aztec-packages/issues/10203)) ([3c623fc](https://github.com/AztecProtocol/aztec-packages/commit/3c623fc2d857d6792b557dc7d1ccb929274046bb)), closes [#9770](https://github.com/AztecProtocol/aztec-packages/issues/9770)
- **avm:** More pilcom compat changes ([#10569](https://github.com/AztecProtocol/aztec-packages/issues/10569)) ([f18d701](https://github.com/AztecProtocol/aztec-packages/commit/f18d701aa527c68a1adcc4b8acbb9c7bd239468a))
- **avm:** Operands reordering ([#10182](https://github.com/AztecProtocol/aztec-packages/issues/10182)) ([69bdf4f](https://github.com/AztecProtocol/aztec-packages/commit/69bdf4f0341cbd95908e5e632b71a57da5df1433)), closes [#10136](https://github.com/AztecProtocol/aztec-packages/issues/10136)
- **avm:** Pilcom compatibility changes ([#10544](https://github.com/AztecProtocol/aztec-packages/issues/10544)) ([fbc8c0e](https://github.com/AztecProtocol/aztec-packages/commit/fbc8c0e864b10d2265373688457a33d61517bbb4))
- **avm:** Radix opcode - remove immediates ([#10696](https://github.com/AztecProtocol/aztec-packages/issues/10696)) ([4ac13e6](https://github.com/AztecProtocol/aztec-packages/commit/4ac13e642c958392ce5606684c044ea014325e26)), closes [#10371](https://github.com/AztecProtocol/aztec-packages/issues/10371)
- **avm:** Remove function selector type of getenv opcode ([#10406](https://github.com/AztecProtocol/aztec-packages/issues/10406)) ([38c0c14](https://github.com/AztecProtocol/aztec-packages/commit/38c0c14fe90a1a920818f2f99a7d3204f0211091)), closes [#9396](https://github.com/AztecProtocol/aztec-packages/issues/9396)
- **avm:** Remove initialization for non-derived polynomials ([#10103](https://github.com/AztecProtocol/aztec-packages/issues/10103)) ([c6fdf4b](https://github.com/AztecProtocol/aztec-packages/commit/c6fdf4bda5c9ef32ca355cda9a5a0c7ed3d1a100)), closes [#10096](https://github.com/AztecProtocol/aztec-packages/issues/10096)
- **avm:** Zero initialization in avm public inputs and execution test fixes ([#10238](https://github.com/AztecProtocol/aztec-packages/issues/10238)) ([0c7c4c9](https://github.com/AztecProtocol/aztec-packages/commit/0c7c4c9bb0c01067abe57ccd06962d71c7279aa0))
- Ci3 phase 1 ([#10042](https://github.com/AztecProtocol/aztec-packages/issues/10042)) ([641da4b](https://github.com/AztecProtocol/aztec-packages/commit/641da4bbd7f12d5a66e5763c18f5fa8f7c627c76))
- CIVC VK ([#10223](https://github.com/AztecProtocol/aztec-packages/issues/10223)) ([089c34c](https://github.com/AztecProtocol/aztec-packages/commit/089c34cc3e9fb5cb493096246525c2205e646204))
- Don't generate proofs of verifier circuits in test ([#10405](https://github.com/AztecProtocol/aztec-packages/issues/10405)) ([c00ebdd](https://github.com/AztecProtocol/aztec-packages/commit/c00ebdd60373aa579587b03eeb4b44ada0bb1155))
- L2 gas maximum is per-TX-public-portion. AVM startup gas is now 20k. ([#10214](https://github.com/AztecProtocol/aztec-packages/issues/10214)) ([1365401](https://github.com/AztecProtocol/aztec-packages/commit/1365401cb379d7206e268dc01a33110cecae7293))
- Lower public tx gas limit to 6M ([#10635](https://github.com/AztecProtocol/aztec-packages/issues/10635)) ([9836036](https://github.com/AztecProtocol/aztec-packages/commit/9836036053f1b5f3e57bf4e19bf0eb1a692306bd))
- Making bbup a shell script ([#10426](https://github.com/AztecProtocol/aztec-packages/issues/10426)) ([1c29554](https://github.com/AztecProtocol/aztec-packages/commit/1c29554929268fe9f53961325ae6af3f9b799b1c))
- **master:** Release 0.64.0 ([#10043](https://github.com/AztecProtocol/aztec-packages/issues/10043)) ([12b1daa](https://github.com/AztecProtocol/aztec-packages/commit/12b1daafa121452a1ba2d17228be335b1a45b818))
- **master:** Release 0.65.0 ([#10181](https://github.com/AztecProtocol/aztec-packages/issues/10181)) ([903bcb0](https://github.com/AztecProtocol/aztec-packages/commit/903bcb0a42f7fd83fb7da97a13b763cf761336bd))
- **master:** Release 0.65.1 ([#10219](https://github.com/AztecProtocol/aztec-packages/issues/10219)) ([62fc917](https://github.com/AztecProtocol/aztec-packages/commit/62fc9175019cb5f3fabca1a5f5ff9e04d708695e))
- **master:** Release 0.65.2 ([#10258](https://github.com/AztecProtocol/aztec-packages/issues/10258)) ([10754db](https://github.com/AztecProtocol/aztec-packages/commit/10754db0e6626047d4fc59cd0d7bbb320606152a))
- **master:** Release 0.66.0 ([#10282](https://github.com/AztecProtocol/aztec-packages/issues/10282)) ([fc61b27](https://github.com/AztecProtocol/aztec-packages/commit/fc61b27dde7c8d30712bf4910d45081caaf0bb53))
- **master:** Release 0.67.0 ([#10472](https://github.com/AztecProtocol/aztec-packages/issues/10472)) ([19a500f](https://github.com/AztecProtocol/aztec-packages/commit/19a500ffc09ab8bc367a78599dd73a07a04b426e))
- **master:** Release 0.67.1 ([#10684](https://github.com/AztecProtocol/aztec-packages/issues/10684)) ([c90bb16](https://github.com/AztecProtocol/aztec-packages/commit/c90bb16a5880c42752809f383f517181e6f8a53a))
- Move decider PK allocation to methods ([#10670](https://github.com/AztecProtocol/aztec-packages/issues/10670)) ([1ab9e30](https://github.com/AztecProtocol/aztec-packages/commit/1ab9e30d339cfd7a80f333e408c367c1f8bf49f8))
- Optimise grand product computation round based on active ranges ([#10460](https://github.com/AztecProtocol/aztec-packages/issues/10460)) ([7fa8f84](https://github.com/AztecProtocol/aztec-packages/commit/7fa8f844d9e389f8636118f1d3c3ecce707e771e))
- Parallelise construction of perturbator coefficients at each level ([#10304](https://github.com/AztecProtocol/aztec-packages/issues/10304)) ([ba335bd](https://github.com/AztecProtocol/aztec-packages/commit/ba335bdff645398d20241ce7baab02f63b20f55c))
- Parallelise inverse polynomial construction for lookup relations ([#10413](https://github.com/AztecProtocol/aztec-packages/issues/10413)) ([427cf59](https://github.com/AztecProtocol/aztec-packages/commit/427cf594ec9ca4b472ec5d4a249c7b49805c78e2))
- Public inputs in unit tests with proving were incorrectly set ([#10300](https://github.com/AztecProtocol/aztec-packages/issues/10300)) ([0311bf3](https://github.com/AztecProtocol/aztec-packages/commit/0311bf333acb2def3be1373b36514b99b132623a))
- Pull out some sync changes ([#10245](https://github.com/AztecProtocol/aztec-packages/issues/10245)) ([1bfc15e](https://github.com/AztecProtocol/aztec-packages/commit/1bfc15e08873a1f0f3743e259f418b70426b3f25))
- Pull value merger code from sync ([#10080](https://github.com/AztecProtocol/aztec-packages/issues/10080)) ([3392629](https://github.com/AztecProtocol/aztec-packages/commit/3392629818e6d51c01ca4c75c1ad916bb4b4fdb1))
- Redo typo PR by Dimitrolito ([#10364](https://github.com/AztecProtocol/aztec-packages/issues/10364)) ([da809c5](https://github.com/AztecProtocol/aztec-packages/commit/da809c58290f9590836f45ec59376cbf04d3c4ce))
- Redo typo PR by leopardracer ([#10363](https://github.com/AztecProtocol/aztec-packages/issues/10363)) ([0d1b722](https://github.com/AztecProtocol/aztec-packages/commit/0d1b722ef7fdc501ca78cfca8f46009a29504c8f))
- Remove handling of duplicates from the note hash tree ([#10016](https://github.com/AztecProtocol/aztec-packages/issues/10016)) ([ece1d45](https://github.com/AztecProtocol/aztec-packages/commit/ece1d455548bccd80a3c9660cc32149bcb129562))
- Remove SchnorrVerify opcode ([#9897](https://github.com/AztecProtocol/aztec-packages/issues/9897)) ([93cd323](https://github.com/AztecProtocol/aztec-packages/commit/93cd323e493118ce91097934216a364855a991db))
- Replace bbup.dev link ([#10908](https://github.com/AztecProtocol/aztec-packages/issues/10908)) ([6cdcdb3](https://github.com/AztecProtocol/aztec-packages/commit/6cdcdb32ae51b316b2bd454772026292f1979411))

## [0.67.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.67.0...barretenberg-v0.67.1) (2024-12-17)

### Features

- Add tree equality assertions ([#10756](https://github.com/AztecProtocol/aztec-packages/issues/10756)) ([923826a](https://github.com/AztecProtocol/aztec-packages/commit/923826a9d1bbed6739527a82b34d5610600eca1b))
- Better initialization for permutation mapping components ([#10750](https://github.com/AztecProtocol/aztec-packages/issues/10750)) ([1516d7f](https://github.com/AztecProtocol/aztec-packages/commit/1516d7f7bd6a2adbb650bd7cdd572b33db98dbfc))
- Don't store every block number in block indices DB ([#10658](https://github.com/AztecProtocol/aztec-packages/issues/10658)) ([a3fba84](https://github.com/AztecProtocol/aztec-packages/commit/a3fba8442fdd62f429054c3367984fd4206bbbeb))
- Leaf index requests to the native world state can now be performed as a batch query ([#10649](https://github.com/AztecProtocol/aztec-packages/issues/10649)) ([a437e73](https://github.com/AztecProtocol/aztec-packages/commit/a437e73558a936981f3eb3ba022b0770b75d9060))
- New 17 in 20 IVC bench added to actions ([#10777](https://github.com/AztecProtocol/aztec-packages/issues/10777)) ([9fbcff6](https://github.com/AztecProtocol/aztec-packages/commit/9fbcff60a63e0eca14c4e28677aed1fc5e6f2c14))
- Note hash management in the AVM ([#10666](https://github.com/AztecProtocol/aztec-packages/issues/10666)) ([e077980](https://github.com/AztecProtocol/aztec-packages/commit/e077980f8cce1fc7922c27d368b6dbced956aad2))
- Sumcheck with disabled rows ([#10068](https://github.com/AztecProtocol/aztec-packages/issues/10068)) ([abd2226](https://github.com/AztecProtocol/aztec-packages/commit/abd2226da3a159e7efb7cbef099e41739f665ef1))

### Bug Fixes

- Avm gas and non-member ([#10709](https://github.com/AztecProtocol/aztec-packages/issues/10709)) ([dd8cc7b](https://github.com/AztecProtocol/aztec-packages/commit/dd8cc7b93119c0376873a366a8310d2ebd2641de))
- AVM witgen track gas for nested calls and external halts ([#10731](https://github.com/AztecProtocol/aztec-packages/issues/10731)) ([b8bdb52](https://github.com/AztecProtocol/aztec-packages/commit/b8bdb529719c1f72244e904ea667462458a43317))
- Use correct size for databus_id ([#10673](https://github.com/AztecProtocol/aztec-packages/issues/10673)) ([95eb658](https://github.com/AztecProtocol/aztec-packages/commit/95eb658f90687c75589b345f95a904d96e2a8e62))

### Miscellaneous

- **avm:** Radix opcode - remove immediates ([#10696](https://github.com/AztecProtocol/aztec-packages/issues/10696)) ([4ac13e6](https://github.com/AztecProtocol/aztec-packages/commit/4ac13e642c958392ce5606684c044ea014325e26)), closes [#10371](https://github.com/AztecProtocol/aztec-packages/issues/10371)
- Move decider PK allocation to methods ([#10670](https://github.com/AztecProtocol/aztec-packages/issues/10670)) ([1ab9e30](https://github.com/AztecProtocol/aztec-packages/commit/1ab9e30d339cfd7a80f333e408c367c1f8bf49f8))

## [0.67.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.66.0...barretenberg-v0.67.0) (2024-12-13)

### ⚠ BREAKING CHANGES

- lower public tx gas limit to 6M ([#10635](https://github.com/AztecProtocol/aztec-packages/issues/10635))
- l2 gas maximum is per-TX-public-portion. AVM startup gas is now 20k. ([#10214](https://github.com/AztecProtocol/aztec-packages/issues/10214))
- rename Header to BlockHeader ([#10372](https://github.com/AztecProtocol/aztec-packages/issues/10372))

### Features

- Add verify proof calls to private kernels ([#10533](https://github.com/AztecProtocol/aztec-packages/issues/10533)) ([ce0eee0](https://github.com/AztecProtocol/aztec-packages/commit/ce0eee0ef4a2084ec74b6dae0a75d18af5877ef8))
- Adding fuzzer for ultra bigfield and relaxing ultra circuit checker ([#10433](https://github.com/AztecProtocol/aztec-packages/issues/10433)) ([da4c47c](https://github.com/AztecProtocol/aztec-packages/commit/da4c47c5dc8caea3e860ac15a58b9ff7f011e4f6))
- AVM inserts fee write on txs with public calls ([#10394](https://github.com/AztecProtocol/aztec-packages/issues/10394)) ([98ba747](https://github.com/AztecProtocol/aztec-packages/commit/98ba7475ac0130dac4424a2f5cabdbe37eba5cc8))
- CIVC browser proveThenVerify ([#10431](https://github.com/AztecProtocol/aztec-packages/issues/10431)) ([8c064d4](https://github.com/AztecProtocol/aztec-packages/commit/8c064d484c686fdf00a100f65f1f740be4ef13cb))
- GETCONTRACTINSTANCE and bytecode retrieval perform nullifier membership checks ([#10445](https://github.com/AztecProtocol/aztec-packages/issues/10445)) ([9301253](https://github.com/AztecProtocol/aztec-packages/commit/9301253f0488e6d96ed12a8c9bde72a653aa7d36)), closes [#10377](https://github.com/AztecProtocol/aztec-packages/issues/10377) [#10379](https://github.com/AztecProtocol/aztec-packages/issues/10379)
- Handle nested calls in witgen ([#10384](https://github.com/AztecProtocol/aztec-packages/issues/10384)) ([1e21f31](https://github.com/AztecProtocol/aztec-packages/commit/1e21f31d430947f48dc9f5e52d0deb1af70ee705))
- Keccak honk proving in bb.js ([#10489](https://github.com/AztecProtocol/aztec-packages/issues/10489)) ([e0d7431](https://github.com/AztecProtocol/aztec-packages/commit/e0d743121674bcfdd73f84836c17645a5bc2df92))
- Modify HonkRecursionConstraint to handle IPA claims ([#10469](https://github.com/AztecProtocol/aztec-packages/issues/10469)) ([a204d1b](https://github.com/AztecProtocol/aztec-packages/commit/a204d1b60514d6321c2db5063375cc2bbd507fe8))
- Remove auto verify mode from ClientIVC ([#10599](https://github.com/AztecProtocol/aztec-packages/issues/10599)) ([b1d8b97](https://github.com/AztecProtocol/aztec-packages/commit/b1d8b978871948fbba639476465f4de6fb471292))
- Rename Header to BlockHeader ([#10372](https://github.com/AztecProtocol/aztec-packages/issues/10372)) ([0803964](https://github.com/AztecProtocol/aztec-packages/commit/0803964015492db81001c17252aa4b724e43797b))
- Sayonara old hints ([#10547](https://github.com/AztecProtocol/aztec-packages/issues/10547)) ([dede16e](https://github.com/AztecProtocol/aztec-packages/commit/dede16e035115e1c6971079d12f62e3046407b36))
- Several Updates in SMT verification module (part 1) ([#10437](https://github.com/AztecProtocol/aztec-packages/issues/10437)) ([0c37672](https://github.com/AztecProtocol/aztec-packages/commit/0c376725a29ec18e25a7c9a89c0df8f5a1e06ff4))
- Unified create circuit from acir ([#10440](https://github.com/AztecProtocol/aztec-packages/issues/10440)) ([a4dfe13](https://github.com/AztecProtocol/aztec-packages/commit/a4dfe13c1c0af3d527f5c9b2fcc38fe059e9bc38))

### Bug Fixes

- Remove auto verify in cbind ivc prove ([#10627](https://github.com/AztecProtocol/aztec-packages/issues/10627)) ([d773423](https://github.com/AztecProtocol/aztec-packages/commit/d773423fb4c701d830ac2a732ab9bbc205396a63))
- Use e2e structure in cbind ([#10585](https://github.com/AztecProtocol/aztec-packages/issues/10585)) ([985aef1](https://github.com/AztecProtocol/aztec-packages/commit/985aef16ce612a9d3d7ff27b87b871a01911002e))

### Miscellaneous

- **avm:** Gas constants adjustment based on trace rows accounting ([#10614](https://github.com/AztecProtocol/aztec-packages/issues/10614)) ([fc729ef](https://github.com/AztecProtocol/aztec-packages/commit/fc729ef3af7ec33f48dbb9fae3820a59a4a26479)), closes [#10368](https://github.com/AztecProtocol/aztec-packages/issues/10368)
- **avm:** More pilcom compat changes ([#10569](https://github.com/AztecProtocol/aztec-packages/issues/10569)) ([f18d701](https://github.com/AztecProtocol/aztec-packages/commit/f18d701aa527c68a1adcc4b8acbb9c7bd239468a))
- **avm:** Pilcom compatibility changes ([#10544](https://github.com/AztecProtocol/aztec-packages/issues/10544)) ([fbc8c0e](https://github.com/AztecProtocol/aztec-packages/commit/fbc8c0e864b10d2265373688457a33d61517bbb4))
- L2 gas maximum is per-TX-public-portion. AVM startup gas is now 20k. ([#10214](https://github.com/AztecProtocol/aztec-packages/issues/10214)) ([1365401](https://github.com/AztecProtocol/aztec-packages/commit/1365401cb379d7206e268dc01a33110cecae7293))
- Lower public tx gas limit to 6M ([#10635](https://github.com/AztecProtocol/aztec-packages/issues/10635)) ([9836036](https://github.com/AztecProtocol/aztec-packages/commit/9836036053f1b5f3e57bf4e19bf0eb1a692306bd))
- Optimise grand product computation round based on active ranges ([#10460](https://github.com/AztecProtocol/aztec-packages/issues/10460)) ([7fa8f84](https://github.com/AztecProtocol/aztec-packages/commit/7fa8f844d9e389f8636118f1d3c3ecce707e771e))

## [0.66.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.65.2...barretenberg-v0.66.0) (2024-12-06)

### ⚠ BREAKING CHANGES

- remove SchnorrVerify opcode ([#9897](https://github.com/AztecProtocol/aztec-packages/issues/9897))

### Features

- Allow querying block number for tree indices ([#10332](https://github.com/AztecProtocol/aztec-packages/issues/10332)) ([cf05a7a](https://github.com/AztecProtocol/aztec-packages/commit/cf05a7a346ea11853e940d5e9ac105ef0d629d35))
- Avoid inserting an empty leaf in indexed trees on update ([#10281](https://github.com/AztecProtocol/aztec-packages/issues/10281)) ([5a04ca8](https://github.com/AztecProtocol/aztec-packages/commit/5a04ca880ae2a0f285b6a5a110286ba10bc4a6c3))
- Avoid inserting an empty leaf in indexed trees on update ([#10334](https://github.com/AztecProtocol/aztec-packages/issues/10334)) ([80fad45](https://github.com/AztecProtocol/aztec-packages/commit/80fad4544a4d8c1b488f8b4b4f86fe508ed1f4cc))
- **bb:** Define std::hash for field ([#10312](https://github.com/AztecProtocol/aztec-packages/issues/10312)) ([752bc59](https://github.com/AztecProtocol/aztec-packages/commit/752bc59c579710c21acf6cc97164e377f72c256c))
- Client IVC API ([#10217](https://github.com/AztecProtocol/aztec-packages/issues/10217)) ([cc54a1e](https://github.com/AztecProtocol/aztec-packages/commit/cc54a1e1ef75b29d160a02d03cf9b29e28d3e4ca))
- Integrate verify_proof calls in mock protocol circuits ([#9253](https://github.com/AztecProtocol/aztec-packages/issues/9253)) ([7ed89aa](https://github.com/AztecProtocol/aztec-packages/commit/7ed89aaa9d0968af6334c1c8abf6c06a42754c52))
- Manage enqueued calls & phases in AVM witgen ([#10310](https://github.com/AztecProtocol/aztec-packages/issues/10310)) ([e7ebef8](https://github.com/AztecProtocol/aztec-packages/commit/e7ebef8d09744fdc24a79cb0bf74638b0a8f5dc8))
- Mock IVC state from arbitrary acir IVC recursion constraints ([#10314](https://github.com/AztecProtocol/aztec-packages/issues/10314)) ([ac7c0da](https://github.com/AztecProtocol/aztec-packages/commit/ac7c0da38ff05d6f11c4d6a6244c4526ac00232e))
- Ultra rollup flows ([#10162](https://github.com/AztecProtocol/aztec-packages/issues/10162)) ([c53f4cf](https://github.com/AztecProtocol/aztec-packages/commit/c53f4cf84c60b8d81cc62d5827ec4408da88cc4e))

### Bug Fixes

- Bbup cleanup and fix ([#10067](https://github.com/AztecProtocol/aztec-packages/issues/10067)) ([0ff8177](https://github.com/AztecProtocol/aztec-packages/commit/0ff81773da58f7c28621d4e5711ce130afd3e51b))
- Revert "feat: Avoid inserting an empty leaf in indexed trees on update" ([#10319](https://github.com/AztecProtocol/aztec-packages/issues/10319)) ([887c011](https://github.com/AztecProtocol/aztec-packages/commit/887c01103255ea4cbbb6cb33c8771d47123b3bff))
- Url in bbup install ([#10456](https://github.com/AztecProtocol/aztec-packages/issues/10456)) ([1b0dfb7](https://github.com/AztecProtocol/aztec-packages/commit/1b0dfb77612cae9fa026da1d453bdf0d89442200))
- Witness changes in file sponge.hpp ([#10345](https://github.com/AztecProtocol/aztec-packages/issues/10345)) ([4a38edf](https://github.com/AztecProtocol/aztec-packages/commit/4a38edfc1580aa1cb5113993ff8a2e5574076226))

### Miscellaneous

- **avm:** Fake verification routine for avm recursion in public base rollup ([#10382](https://github.com/AztecProtocol/aztec-packages/issues/10382)) ([a1e5966](https://github.com/AztecProtocol/aztec-packages/commit/a1e5966ffe98351d848bfa47608a2f22c381acfb)), closes [#10243](https://github.com/AztecProtocol/aztec-packages/issues/10243)
- **avm:** Remove function selector type of getenv opcode ([#10406](https://github.com/AztecProtocol/aztec-packages/issues/10406)) ([38c0c14](https://github.com/AztecProtocol/aztec-packages/commit/38c0c14fe90a1a920818f2f99a7d3204f0211091)), closes [#9396](https://github.com/AztecProtocol/aztec-packages/issues/9396)
- Don't generate proofs of verifier circuits in test ([#10405](https://github.com/AztecProtocol/aztec-packages/issues/10405)) ([c00ebdd](https://github.com/AztecProtocol/aztec-packages/commit/c00ebdd60373aa579587b03eeb4b44ada0bb1155))
- Making bbup a shell script ([#10426](https://github.com/AztecProtocol/aztec-packages/issues/10426)) ([1c29554](https://github.com/AztecProtocol/aztec-packages/commit/1c29554929268fe9f53961325ae6af3f9b799b1c))
- Parallelise construction of perturbator coefficients at each level ([#10304](https://github.com/AztecProtocol/aztec-packages/issues/10304)) ([ba335bd](https://github.com/AztecProtocol/aztec-packages/commit/ba335bdff645398d20241ce7baab02f63b20f55c))
- Parallelise inverse polynomial construction for lookup relations ([#10413](https://github.com/AztecProtocol/aztec-packages/issues/10413)) ([427cf59](https://github.com/AztecProtocol/aztec-packages/commit/427cf594ec9ca4b472ec5d4a249c7b49805c78e2))
- Public inputs in unit tests with proving were incorrectly set ([#10300](https://github.com/AztecProtocol/aztec-packages/issues/10300)) ([0311bf3](https://github.com/AztecProtocol/aztec-packages/commit/0311bf333acb2def3be1373b36514b99b132623a))
- Redo typo PR by Dimitrolito ([#10364](https://github.com/AztecProtocol/aztec-packages/issues/10364)) ([da809c5](https://github.com/AztecProtocol/aztec-packages/commit/da809c58290f9590836f45ec59376cbf04d3c4ce))
- Redo typo PR by leopardracer ([#10363](https://github.com/AztecProtocol/aztec-packages/issues/10363)) ([0d1b722](https://github.com/AztecProtocol/aztec-packages/commit/0d1b722ef7fdc501ca78cfca8f46009a29504c8f))
- Remove SchnorrVerify opcode ([#9897](https://github.com/AztecProtocol/aztec-packages/issues/9897)) ([93cd323](https://github.com/AztecProtocol/aztec-packages/commit/93cd323e493118ce91097934216a364855a991db))

## [0.65.2](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.65.1...barretenberg-v0.65.2) (2024-11-28)

### Features

- Sequential insertion in indexed trees ([#10111](https://github.com/AztecProtocol/aztec-packages/issues/10111)) ([bfd9fa6](https://github.com/AztecProtocol/aztec-packages/commit/bfd9fa68be4147acb3e3feeaf83ed3c9247761be))
- Swap polys to facilitate dynamic trace overflow ([#9976](https://github.com/AztecProtocol/aztec-packages/issues/9976)) ([b7b282c](https://github.com/AztecProtocol/aztec-packages/commit/b7b282cd0fb306abbe3951a55a1a4f4d42ed7f8e))

### Bug Fixes

- Don't store indices of zero leaves. ([#10270](https://github.com/AztecProtocol/aztec-packages/issues/10270)) ([c22be8b](https://github.com/AztecProtocol/aztec-packages/commit/c22be8b23e6d16cf4a60509494b979c3edfdba9b))

### Miscellaneous

- Pull value merger code from sync ([#10080](https://github.com/AztecProtocol/aztec-packages/issues/10080)) ([3392629](https://github.com/AztecProtocol/aztec-packages/commit/3392629818e6d51c01ca4c75c1ad916bb4b4fdb1))

## [0.65.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.65.0...barretenberg-v0.65.1) (2024-11-27)

### Features

- Add total mana used to header ([#9868](https://github.com/AztecProtocol/aztec-packages/issues/9868)) ([2478d19](https://github.com/AztecProtocol/aztec-packages/commit/2478d1909db2d79cc0cdd3063dc2ac4e1eaedce3))
- Configure world state block history ([#10216](https://github.com/AztecProtocol/aztec-packages/issues/10216)) ([01eb392](https://github.com/AztecProtocol/aztec-packages/commit/01eb392f15995f344e40aa8f8e41a28f6f5b825d))
- Full IPA Recursive Verifier ([#10189](https://github.com/AztecProtocol/aztec-packages/issues/10189)) ([b5783d3](https://github.com/AztecProtocol/aztec-packages/commit/b5783d3945959056d24aa3d988e9ca9efd3ec224))
- Speed up transaction execution ([#10172](https://github.com/AztecProtocol/aztec-packages/issues/10172)) ([da265b6](https://github.com/AztecProtocol/aztec-packages/commit/da265b6b7d61a0d991fa23bd044f711513a0e86c))

### Bug Fixes

- **avm:** Execution test ordering ([#10226](https://github.com/AztecProtocol/aztec-packages/issues/10226)) ([49b4a6c](https://github.com/AztecProtocol/aztec-packages/commit/49b4a6c07f39711ad2a0477e1fad11e11b8ee23c))

### Miscellaneous

- **avm:** Handle parsing error ([#10203](https://github.com/AztecProtocol/aztec-packages/issues/10203)) ([3c623fc](https://github.com/AztecProtocol/aztec-packages/commit/3c623fc2d857d6792b557dc7d1ccb929274046bb)), closes [#9770](https://github.com/AztecProtocol/aztec-packages/issues/9770)
- **avm:** Zero initialization in avm public inputs and execution test fixes ([#10238](https://github.com/AztecProtocol/aztec-packages/issues/10238)) ([0c7c4c9](https://github.com/AztecProtocol/aztec-packages/commit/0c7c4c9bb0c01067abe57ccd06962d71c7279aa0))
- CIVC VK ([#10223](https://github.com/AztecProtocol/aztec-packages/issues/10223)) ([089c34c](https://github.com/AztecProtocol/aztec-packages/commit/089c34cc3e9fb5cb493096246525c2205e646204))
- Pull out some sync changes ([#10245](https://github.com/AztecProtocol/aztec-packages/issues/10245)) ([1bfc15e](https://github.com/AztecProtocol/aztec-packages/commit/1bfc15e08873a1f0f3743e259f418b70426b3f25))

## [0.65.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.64.0...barretenberg-v0.65.0) (2024-11-26)

### Features

- **avm:** New public inputs witgen ([#10179](https://github.com/AztecProtocol/aztec-packages/issues/10179)) ([ac8f13e](https://github.com/AztecProtocol/aztec-packages/commit/ac8f13e4cd9a3f6b23d53ce5b06cc436324d5f7b))
- Origin tags implemented in biggroup ([#10002](https://github.com/AztecProtocol/aztec-packages/issues/10002)) ([c8696b1](https://github.com/AztecProtocol/aztec-packages/commit/c8696b165425ee6dd7a2398f4b90b29f24d762f4))
- UltraRollupRecursiveFlavor ([#10088](https://github.com/AztecProtocol/aztec-packages/issues/10088)) ([4418ef2](https://github.com/AztecProtocol/aztec-packages/commit/4418ef2a5768e0f627160b86e8dc8735d4bf00e7))

### Miscellaneous

- **avm:** Operands reordering ([#10182](https://github.com/AztecProtocol/aztec-packages/issues/10182)) ([69bdf4f](https://github.com/AztecProtocol/aztec-packages/commit/69bdf4f0341cbd95908e5e632b71a57da5df1433)), closes [#10136](https://github.com/AztecProtocol/aztec-packages/issues/10136)

## [0.64.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.63.1...barretenberg-v0.64.0) (2024-11-25)

### Features

- **avm:** Error handling for address resolution ([#9994](https://github.com/AztecProtocol/aztec-packages/issues/9994)) ([ceaeda5](https://github.com/AztecProtocol/aztec-packages/commit/ceaeda50d2fd391edda3ee8186b86558b7f092e2)), closes [#9131](https://github.com/AztecProtocol/aztec-packages/issues/9131)
- Improve trace utilization tracking ([#10008](https://github.com/AztecProtocol/aztec-packages/issues/10008)) ([4c560ab](https://github.com/AztecProtocol/aztec-packages/commit/4c560abebcf390ec3ba8ebdc18b287b29f148450))
- Improved data storage metrics ([#10020](https://github.com/AztecProtocol/aztec-packages/issues/10020)) ([c6ab0c9](https://github.com/AztecProtocol/aztec-packages/commit/c6ab0c9c7a270104fb3e9f6160be50a90ce5e77d))
- Insert public data tree leaves one by one ([#9989](https://github.com/AztecProtocol/aztec-packages/issues/9989)) ([a2c0701](https://github.com/AztecProtocol/aztec-packages/commit/a2c070161d8466c6da61f68b4d97107927f45129))
- IPA accumulators setup for Rollup ([#10040](https://github.com/AztecProtocol/aztec-packages/issues/10040)) ([4129e27](https://github.com/AztecProtocol/aztec-packages/commit/4129e27e5ed202786ea79da801d5e308d14a5f7d))
- Single commitment key allocation in CIVC ([#9974](https://github.com/AztecProtocol/aztec-packages/issues/9974)) ([a0551ee](https://github.com/AztecProtocol/aztec-packages/commit/a0551ee9fca242a02774fd07bf8156a3a74dae3a))

### Bug Fixes

- Strip wasm debug ([#9987](https://github.com/AztecProtocol/aztec-packages/issues/9987)) ([62a6b66](https://github.com/AztecProtocol/aztec-packages/commit/62a6b662f1ef20a603177c55c199de4a79b65b5c))
- Zero index is not always 0 ([#10135](https://github.com/AztecProtocol/aztec-packages/issues/10135)) ([bbac3d9](https://github.com/AztecProtocol/aztec-packages/commit/bbac3d9db1a4cd133c4949c3c25a17a7e39d14a2))

### Miscellaneous

- **avm:** Remove initialization for non-derived polynomials ([#10103](https://github.com/AztecProtocol/aztec-packages/issues/10103)) ([c6fdf4b](https://github.com/AztecProtocol/aztec-packages/commit/c6fdf4bda5c9ef32ca355cda9a5a0c7ed3d1a100)), closes [#10096](https://github.com/AztecProtocol/aztec-packages/issues/10096)
- Delete stray todos ([#10112](https://github.com/AztecProtocol/aztec-packages/issues/10112)) ([cc4139a](https://github.com/AztecProtocol/aztec-packages/commit/cc4139a83347b9a726b03bd167bf7e70e6dadda7))
- Optimise polynomial initialisation ([#10073](https://github.com/AztecProtocol/aztec-packages/issues/10073)) ([e608742](https://github.com/AztecProtocol/aztec-packages/commit/e60874245439a47082db9fd0ca82d3798bee092d))
- Remove handling of duplicates from the note hash tree ([#10016](https://github.com/AztecProtocol/aztec-packages/issues/10016)) ([ece1d45](https://github.com/AztecProtocol/aztec-packages/commit/ece1d455548bccd80a3c9660cc32149bcb129562))

## [0.63.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.63.0...barretenberg-v0.63.1) (2024-11-19)

### Miscellaneous

- Revert "feat: IPA Accumulator in Builder" ([#10036](https://github.com/AztecProtocol/aztec-packages/issues/10036)) ([9b10f7f](https://github.com/AztecProtocol/aztec-packages/commit/9b10f7f46755814cb8633cf55621faa8e9b37344))

## [0.63.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.62.0...barretenberg-v0.63.0) (2024-11-19)

### ⚠ BREAKING CHANGES

- **avm:** byte indexed PC ([#9582](https://github.com/AztecProtocol/aztec-packages/issues/9582))
- Remove `recursive` from ACIR format; add them to API and CLI ([#9479](https://github.com/AztecProtocol/aztec-packages/issues/9479))

### Features

- Add miscellaneous block to handle structure trace overflow ([#9733](https://github.com/AztecProtocol/aztec-packages/issues/9733)) ([80f9cc4](https://github.com/AztecProtocol/aztec-packages/commit/80f9cc47a12ba3cd8ca2a8d1fb516fed3f4372ed))
- Add Origin Tags to cycle group ([#9879](https://github.com/AztecProtocol/aztec-packages/issues/9879)) ([de6564e](https://github.com/AztecProtocol/aztec-packages/commit/de6564e8374d6d546e0fccbb0429d6c12e828ab3))
- **avm:** Byte indexed PC ([#9582](https://github.com/AztecProtocol/aztec-packages/issues/9582)) ([29724f3](https://github.com/AztecProtocol/aztec-packages/commit/29724f3f2db5a3b6e399e54a9a84af8686807fb6))
- **avm:** Gas specific range check ([#9874](https://github.com/AztecProtocol/aztec-packages/issues/9874)) ([1a9c5ce](https://github.com/AztecProtocol/aztec-packages/commit/1a9c5ce385c7db2e488831dcd7dc3bedfc02f74a))
- **avm:** Hinting merkle trees ([#9658](https://github.com/AztecProtocol/aztec-packages/issues/9658)) ([8d49e59](https://github.com/AztecProtocol/aztec-packages/commit/8d49e5963092548d31a901a693a1653d3151d114))
- **avm:** Mem specific range check ([#9828](https://github.com/AztecProtocol/aztec-packages/issues/9828)) ([ada3e3a](https://github.com/AztecProtocol/aztec-packages/commit/ada3e3aba6141411a8ca931f45cc2b9b7027585e))
- **avm:** Non-field sized cmp circuit ops ([#9895](https://github.com/AztecProtocol/aztec-packages/issues/9895)) ([59376d4](https://github.com/AztecProtocol/aztec-packages/commit/59376d499278eec3ddf4ee9fbb64ba2c83f9b8df))
- **avm:** Tag checking, raising errors and stop execution ([#9831](https://github.com/AztecProtocol/aztec-packages/issues/9831)) ([eac5fb5](https://github.com/AztecProtocol/aztec-packages/commit/eac5fb5f30997364bf45262f898cfeedb97b1a71)), closes [#9745](https://github.com/AztecProtocol/aztec-packages/issues/9745)
- Bb.js tests of ClientIVC ([#9412](https://github.com/AztecProtocol/aztec-packages/issues/9412)) ([90696cd](https://github.com/AztecProtocol/aztec-packages/commit/90696cd0e126d7db3c4ef396ada4bddd3ac0de73))
- Change definition of lagrange last ([#9916](https://github.com/AztecProtocol/aztec-packages/issues/9916)) ([f566503](https://github.com/AztecProtocol/aztec-packages/commit/f566503377298681ce8f1d9d9b8c3c026825e2a2))
- Constify eccvm and translator ([#9661](https://github.com/AztecProtocol/aztec-packages/issues/9661)) ([c95e5fd](https://github.com/AztecProtocol/aztec-packages/commit/c95e5fd5606b7f14b1e2e43ecc770d5f22d294a0))
- Constrain App function VKs ([#9756](https://github.com/AztecProtocol/aztec-packages/issues/9756)) ([ae7cfe7](https://github.com/AztecProtocol/aztec-packages/commit/ae7cfe72b5c528fb533040c6da62c9b21f542f8b))
- Encode static error strings in the ABI ([#9552](https://github.com/AztecProtocol/aztec-packages/issues/9552)) ([1a41d42](https://github.com/AztecProtocol/aztec-packages/commit/1a41d42852ea2d7cdcb9f75387342783e1632b11))
- Faster random sampling ([#9655](https://github.com/AztecProtocol/aztec-packages/issues/9655)) ([969a3f0](https://github.com/AztecProtocol/aztec-packages/commit/969a3f0b2d5bbce95126685b1a056f378a4c4d78))
- Faster randomness sampling for field elements ([#9627](https://github.com/AztecProtocol/aztec-packages/issues/9627)) ([b98e93f](https://github.com/AztecProtocol/aztec-packages/commit/b98e93f4befb985c72e8768f378face2dcc79810))
- Graph methods for circuit analysis (part 1) ([#7948](https://github.com/AztecProtocol/aztec-packages/issues/7948)) ([eeea55a](https://github.com/AztecProtocol/aztec-packages/commit/eeea55a39e9e1a417ddf79e44575420e5efcdfcf))
- Introduce avm circuit public inputs ([#9759](https://github.com/AztecProtocol/aztec-packages/issues/9759)) ([4660381](https://github.com/AztecProtocol/aztec-packages/commit/46603810b149ef7f03c220d11d6dfd395cf550e0))
- IPA Accumulation implementation ([#9494](https://github.com/AztecProtocol/aztec-packages/issues/9494)) ([1a935d0](https://github.com/AztecProtocol/aztec-packages/commit/1a935d091cfad0e4861ec840a59372fdf177518d))
- IPA Accumulator in Builder ([#9846](https://github.com/AztecProtocol/aztec-packages/issues/9846)) ([8e74cd0](https://github.com/AztecProtocol/aztec-packages/commit/8e74cd09a8b65c3903c91197d599e722518ab315))
- Mega memory benchmarks ([#9858](https://github.com/AztecProtocol/aztec-packages/issues/9858)) ([7e587d6](https://github.com/AztecProtocol/aztec-packages/commit/7e587d6d43cc28174d807c255f5270212a0b1c98))
- Mega zk features ([#9774](https://github.com/AztecProtocol/aztec-packages/issues/9774)) ([2096dc2](https://github.com/AztecProtocol/aztec-packages/commit/2096dc236c627cfd802ca05e0c9cb0ea6c441458))
- Mock data for IVC ([#9893](https://github.com/AztecProtocol/aztec-packages/issues/9893)) ([9325f6f](https://github.com/AztecProtocol/aztec-packages/commit/9325f6ff987022da1a4dabb771781cdc999af18e))
- Naive attempt to bind the honk solidity verifier function to the ts interface ([#9432](https://github.com/AztecProtocol/aztec-packages/issues/9432)) ([fc27eaf](https://github.com/AztecProtocol/aztec-packages/commit/fc27eafaaa471e888805c785066f361f0da15298))
- Origin Tags part 3 (Memory) ([#9758](https://github.com/AztecProtocol/aztec-packages/issues/9758)) ([d77e473](https://github.com/AztecProtocol/aztec-packages/commit/d77e473219d1628b2045100a55c4073f9fa32c25))
- Prove openings of masking polynomials in ECCVM and Translator ([#9726](https://github.com/AztecProtocol/aztec-packages/issues/9726)) ([f1cdc2d](https://github.com/AztecProtocol/aztec-packages/commit/f1cdc2d981ef01fda9b14c6803e014e546b71b66))
- Recursive verifier for decider and last folding proof ([#9626](https://github.com/AztecProtocol/aztec-packages/issues/9626)) ([d7ee6e5](https://github.com/AztecProtocol/aztec-packages/commit/d7ee6e5cffba32ef141e717aeaf83f56a9af92b5))
- Removed redundant scalar muls from the verifiers using shplemini ([#9392](https://github.com/AztecProtocol/aztec-packages/issues/9392)) ([e07cac7](https://github.com/AztecProtocol/aztec-packages/commit/e07cac7fee501a752d98ebf749f6cf31a3ff74af))
- Send G_0 in proof to reduce tube size ([#9766](https://github.com/AztecProtocol/aztec-packages/issues/9766)) ([9bc5a2f](https://github.com/AztecProtocol/aztec-packages/commit/9bc5a2f02852d6187a597612e8459ee305f3e198))
- Split up eccvm proof into two proofs ([#9914](https://github.com/AztecProtocol/aztec-packages/issues/9914)) ([37d7cd7](https://github.com/AztecProtocol/aztec-packages/commit/37d7cd784bc6dfe366d1eabc2b7be8cca4359f7b))
- Stop with HeapVector ([#9810](https://github.com/AztecProtocol/aztec-packages/issues/9810)) ([52ae4e1](https://github.com/AztecProtocol/aztec-packages/commit/52ae4e1710d07aca497de723294f7b7c0100b479))
- Track active accumulator rows and leverage in IVC folding ([#9599](https://github.com/AztecProtocol/aztec-packages/issues/9599)) ([76328eb](https://github.com/AztecProtocol/aztec-packages/commit/76328ebe88fd1d9dbb041be8cc1692516ed7d2d2))
- Zk shplemini ([#9830](https://github.com/AztecProtocol/aztec-packages/issues/9830)) ([23ff518](https://github.com/AztecProtocol/aztec-packages/commit/23ff5186a4c8905bd35753c1e6536d3b5504a5f0))

### Bug Fixes

- **avm:** Derive unencrypted log in test ([#9813](https://github.com/AztecProtocol/aztec-packages/issues/9813)) ([abdd912](https://github.com/AztecProtocol/aztec-packages/commit/abdd912bd0d3cf9a8e09339a3766c61eea712ede))
- Fix bad merge ([#9892](https://github.com/AztecProtocol/aztec-packages/issues/9892)) ([b621603](https://github.com/AztecProtocol/aztec-packages/commit/b6216033b567e0d743e17c37754a20f9c893aa0e))
- Fix inclusion path ([#10034](https://github.com/AztecProtocol/aztec-packages/issues/10034)) ([29a9ae3](https://github.com/AztecProtocol/aztec-packages/commit/29a9ae3573fe1da63a2d6494a21266e20bbe22e4))
- Fix mac build by calling `count` on durations ([#9855](https://github.com/AztecProtocol/aztec-packages/issues/9855)) ([9978c97](https://github.com/AztecProtocol/aztec-packages/commit/9978c9742c7b2b27c9ba813ddb66125a0ca57e6b))
- Fix random for Mac users ([#9670](https://github.com/AztecProtocol/aztec-packages/issues/9670)) ([bf5d62d](https://github.com/AztecProtocol/aztec-packages/commit/bf5d62d4332548ac7798085eb98cedea88131d9d))
- Tree heights that last past 3 days ([#9760](https://github.com/AztecProtocol/aztec-packages/issues/9760)) ([23c122d](https://github.com/AztecProtocol/aztec-packages/commit/23c122d36091b3b756084584ecba59b800196d58))

### Miscellaneous

- Add end_gas_used to avm public inputs ([#9910](https://github.com/AztecProtocol/aztec-packages/issues/9910)) ([3889def](https://github.com/AztecProtocol/aztec-packages/commit/3889deffe372c94b2a38e465e89f6babbee18fec))
- **avm:** Bugfixing witness generation for add, sub, mul for FF ([#9938](https://github.com/AztecProtocol/aztec-packages/issues/9938)) ([d8db656](https://github.com/AztecProtocol/aztec-packages/commit/d8db656980c09ad219c375e831443bd523100d4b))
- **docs:** Authwit note, not simulating simulations ([#9438](https://github.com/AztecProtocol/aztec-packages/issues/9438)) ([1779c42](https://github.com/AztecProtocol/aztec-packages/commit/1779c42c3dfed9a1d433cd0c6f8400a14612e404))
- Redo typo PR by dsarfed ([#9667](https://github.com/AztecProtocol/aztec-packages/issues/9667)) ([4fc6f8b](https://github.com/AztecProtocol/aztec-packages/commit/4fc6f8b44b7e58d982151732fa6d9691e73635bc))
- Redo typo PR by leopardracer ([#9705](https://github.com/AztecProtocol/aztec-packages/issues/9705)) ([dedbe40](https://github.com/AztecProtocol/aztec-packages/commit/dedbe402640c13cfa1ec4198f35caaeb4d27e929))
- Remove `recursive` from ACIR format; add them to API and CLI ([#9479](https://github.com/AztecProtocol/aztec-packages/issues/9479)) ([d2a84c4](https://github.com/AztecProtocol/aztec-packages/commit/d2a84c405291b5a04576c133b0e74327d9092db1))
- Remove duplicate and unused flavor related concepts ([#10035](https://github.com/AztecProtocol/aztec-packages/issues/10035)) ([30ca68c](https://github.com/AztecProtocol/aztec-packages/commit/30ca68c8435d7edf227206c61dd1ab4551514857))
- Remove public kernels ([#10027](https://github.com/AztecProtocol/aztec-packages/issues/10027)) ([1acf4cf](https://github.com/AztecProtocol/aztec-packages/commit/1acf4cfc28c72550f299d97493c7a4b33b4c5d7c))
- Rename aggregation object to pairing point accumulator ([#9817](https://github.com/AztecProtocol/aztec-packages/issues/9817)) ([0ebd52e](https://github.com/AztecProtocol/aztec-packages/commit/0ebd52e5dd326fcbebe38869908dfcb4c2ba2c03))
- Replace `to_radix` directive with brillig ([#9970](https://github.com/AztecProtocol/aztec-packages/issues/9970)) ([6fec1dc](https://github.com/AztecProtocol/aztec-packages/commit/6fec1dcaf40f2d73843a12e544bae9d8028f9eed))
- Revert TBB default and ivc matching regression mac build ([#9901](https://github.com/AztecProtocol/aztec-packages/issues/9901)) ([3b70bf0](https://github.com/AztecProtocol/aztec-packages/commit/3b70bf035112a77701aaa08d0230e1699be7b1fc))
- Switch to installing published binaries of foundry ([#9731](https://github.com/AztecProtocol/aztec-packages/issues/9731)) ([5cf3a2a](https://github.com/AztecProtocol/aztec-packages/commit/5cf3a2aa71af0f98a1f492b4474126ae3487c39f))
- Trace structure is an object ([#10003](https://github.com/AztecProtocol/aztec-packages/issues/10003)) ([5f83755](https://github.com/AztecProtocol/aztec-packages/commit/5f837552449d1d3283c3cfd528a7ac69825cc1aa))
- Update Barretenberg README with matching nargo versions ([#9908](https://github.com/AztecProtocol/aztec-packages/issues/9908)) ([e305f48](https://github.com/AztecProtocol/aztec-packages/commit/e305f488b1502630f299bb03cf169770f2f6af09))
- Use stack based recursion instead of function recursion ([#9947](https://github.com/AztecProtocol/aztec-packages/issues/9947)) ([ca050b8](https://github.com/AztecProtocol/aztec-packages/commit/ca050b837a46aa870fb8850ed0d8aaaad4e758ee))
- World state tech debt cleanup 1 ([#9561](https://github.com/AztecProtocol/aztec-packages/issues/9561)) ([05e4b27](https://github.com/AztecProtocol/aztec-packages/commit/05e4b2774665e744dcec169bc698cb110c749c1b))

## [0.62.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.61.0...barretenberg-v0.62.0) (2024-11-01)

### ⚠ BREAKING CHANGES

- **avm:** use 32 bit locations ([#9596](https://github.com/AztecProtocol/aztec-packages/issues/9596))

### Features

- **avm:** Use 32 bit locations ([#9596](https://github.com/AztecProtocol/aztec-packages/issues/9596)) ([5f38696](https://github.com/AztecProtocol/aztec-packages/commit/5f386963b06752087c2600949cbb4bb2910b25ef))
- Biggroup_goblin handles points at infinity + 1.8x reduction in ECCVM size ([#9366](https://github.com/AztecProtocol/aztec-packages/issues/9366)) ([9211d8a](https://github.com/AztecProtocol/aztec-packages/commit/9211d8afbd0fe31043ea593675ce5a72c1dc7e4e))
- Faster square roots ([#2694](https://github.com/AztecProtocol/aztec-packages/issues/2694)) ([722ec5c](https://github.com/AztecProtocol/aztec-packages/commit/722ec5c3dfdc2a5e467528ed94a25677f8800087))
- Spartan proving ([#9584](https://github.com/AztecProtocol/aztec-packages/issues/9584)) ([392114a](https://github.com/AztecProtocol/aztec-packages/commit/392114a0a66bd580175ff7a07b0c6d899d69be8f))

### Bug Fixes

- Ensuring translator range constraint polynomials are zeroes outside of minicircuit ([#9251](https://github.com/AztecProtocol/aztec-packages/issues/9251)) ([04dd2c4](https://github.com/AztecProtocol/aztec-packages/commit/04dd2c4c959d5d80e527be9c71504c051e3c5929))
- Resolution of bugs from bigfield audits ([#9547](https://github.com/AztecProtocol/aztec-packages/issues/9547)) ([feace70](https://github.com/AztecProtocol/aztec-packages/commit/feace70727f9e5a971809955030a8ea88ce84f4a))

### Miscellaneous

- Bb sanitizers on master ([#9564](https://github.com/AztecProtocol/aztec-packages/issues/9564)) ([747bff1](https://github.com/AztecProtocol/aztec-packages/commit/747bff1acbca3d263a765db82baa6ef9ca58c372))
- Pass on docker_fast.sh ([#9615](https://github.com/AztecProtocol/aztec-packages/issues/9615)) ([1c53459](https://github.com/AztecProtocol/aztec-packages/commit/1c53459ff31b50ba808e204c532885c9b0f69e39))

## [0.61.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.60.0...barretenberg-v0.61.0) (2024-10-30)

### ⚠ BREAKING CHANGES

- **avm:** cleanup CALL ([#9551](https://github.com/AztecProtocol/aztec-packages/issues/9551))
- **avm:** returndatasize + returndatacopy ([#9475](https://github.com/AztecProtocol/aztec-packages/issues/9475))
- getcontractinstance instruction returns only a specified member ([#9300](https://github.com/AztecProtocol/aztec-packages/issues/9300))
- **avm/brillig:** revert/rethrow oracle ([#9408](https://github.com/AztecProtocol/aztec-packages/issues/9408))

### Features

- 20-30% cost reduction in recursive ipa algorithm ([#9420](https://github.com/AztecProtocol/aztec-packages/issues/9420)) ([a4bd3e1](https://github.com/AztecProtocol/aztec-packages/commit/a4bd3e14f6cde05f4d59bc48142e9ef4bc78f0ae))
- **avm/brillig:** Revert/rethrow oracle ([#9408](https://github.com/AztecProtocol/aztec-packages/issues/9408)) ([1bbd724](https://github.com/AztecProtocol/aztec-packages/commit/1bbd724eab39c193c1db1d89570eab9358563fe2))
- **avm:** Avm replace zeromorph pcs by shplemini ([#9389](https://github.com/AztecProtocol/aztec-packages/issues/9389)) ([07d6dc2](https://github.com/AztecProtocol/aztec-packages/commit/07d6dc29db2eb04154b8f0c66bd1efa74c0e8b9d))
- **avm:** Cleanup CALL ([#9551](https://github.com/AztecProtocol/aztec-packages/issues/9551)) ([26adc55](https://github.com/AztecProtocol/aztec-packages/commit/26adc55771a204f96e8594f6defde2a4872c88d2))
- **avm:** Merkle tree gadget ([#9205](https://github.com/AztecProtocol/aztec-packages/issues/9205)) ([d52b616](https://github.com/AztecProtocol/aztec-packages/commit/d52b616a91224c25f24a00b76b984f059c103dcb))
- **avm:** Returndatasize + returndatacopy ([#9475](https://github.com/AztecProtocol/aztec-packages/issues/9475)) ([8f71006](https://github.com/AztecProtocol/aztec-packages/commit/8f710068a10e09fad9c159306c19c555bb3b5bb6))
- **avm:** Trace contract class and contract instance ([#8840](https://github.com/AztecProtocol/aztec-packages/issues/8840)) ([84205d8](https://github.com/AztecProtocol/aztec-packages/commit/84205d872067345239913914a84b708d05d8364c))
- Bytecode hashing init ([#8535](https://github.com/AztecProtocol/aztec-packages/issues/8535)) ([2bb09e5](https://github.com/AztecProtocol/aztec-packages/commit/2bb09e59f648e6182f1097d283451afd3c488d27))
- Derive address and class id in avm ([#8897](https://github.com/AztecProtocol/aztec-packages/issues/8897)) ([2ebe361](https://github.com/AztecProtocol/aztec-packages/commit/2ebe3611ad3826443b31e5626a4e08cdd90f0f2a))
- Fixed number of pub inputs for databus commitment propagation ([#9336](https://github.com/AztecProtocol/aztec-packages/issues/9336)) ([8658abd](https://github.com/AztecProtocol/aztec-packages/commit/8658abd46612d3fdf8c8b54902c201c790a52345))
- Getcontractinstance instruction returns only a specified member ([#9300](https://github.com/AztecProtocol/aztec-packages/issues/9300)) ([29b692f](https://github.com/AztecProtocol/aztec-packages/commit/29b692f9e81e1ee809e37274cf6ac2ab0ca526ce))
- Print finalized size and log dyadic size during Ultra proof construction ([#9411](https://github.com/AztecProtocol/aztec-packages/issues/9411)) ([84fdc52](https://github.com/AztecProtocol/aztec-packages/commit/84fdc526f73027a3450bcdcc78b826fc9da8df88))
- Reorder blocks for efficiency ([#9560](https://github.com/AztecProtocol/aztec-packages/issues/9560)) ([10874f4](https://github.com/AztecProtocol/aztec-packages/commit/10874f402c48c0721491f0db8bc0266653193d9b))
- Sol shplemini in acir tests + contract_gen ([#8874](https://github.com/AztecProtocol/aztec-packages/issues/8874)) ([1c0275d](https://github.com/AztecProtocol/aztec-packages/commit/1c0275db18510fd7d55b400e4a910447859f4acc))

### Bug Fixes

- Add native verification test to honk keccak ([#9501](https://github.com/AztecProtocol/aztec-packages/issues/9501)) ([59810e0](https://github.com/AztecProtocol/aztec-packages/commit/59810e070e57fa8e250928608b39c66eaae39a84))
- **avm:** Address bytecode hashing comments ([#9436](https://github.com/AztecProtocol/aztec-packages/issues/9436)) ([a85f92a](https://github.com/AztecProtocol/aztec-packages/commit/a85f92a24f4ec988a4d472651a0e2827bf9381b2))
- **avm:** Re-enable sha256 in bulk test, fix bug in AVM SHL/SHR ([#9496](https://github.com/AztecProtocol/aztec-packages/issues/9496)) ([0fe64df](https://github.com/AztecProtocol/aztec-packages/commit/0fe64dfabe6b4413943204ec17a5d0dca3c2d011))
- Honk shplemini acir artifacts ([#9550](https://github.com/AztecProtocol/aztec-packages/issues/9550)) ([468c100](https://github.com/AztecProtocol/aztec-packages/commit/468c100558f181408ad59b528ad4e43aaa7e7f3a))
- Revert "feat: sol shplemini in acir tests + contract_gen" ([#9505](https://github.com/AztecProtocol/aztec-packages/issues/9505)) ([3351217](https://github.com/AztecProtocol/aztec-packages/commit/3351217a7e7f1848c43e14d19427e1cd789c78fc))

### Miscellaneous

- Align debug logging between AVM sim & witgen ([#9498](https://github.com/AztecProtocol/aztec-packages/issues/9498)) ([7c2d67a](https://github.com/AztecProtocol/aztec-packages/commit/7c2d67a7c63a2b05d8f8d48b1690c87e8bacfc49))
- **avm::** Fix execution tests in proving mode ([#9466](https://github.com/AztecProtocol/aztec-packages/issues/9466)) ([8e07de8](https://github.com/AztecProtocol/aztec-packages/commit/8e07de8233929d40a433a80064ceec30a69c1360))
- **avm:** Allocate memory for unshifted polynomials according to their trace col size ([#9345](https://github.com/AztecProtocol/aztec-packages/issues/9345)) ([a67d0e2](https://github.com/AztecProtocol/aztec-packages/commit/a67d0e2122945998119a8643a4fb4e74fccc7f34))
- Bumping L2 gas and public reads constants ([#9431](https://github.com/AztecProtocol/aztec-packages/issues/9431)) ([91c50dd](https://github.com/AztecProtocol/aztec-packages/commit/91c50dd6c52bc95aab4748d022516fc1b5fd5fe6))
- Use big endian in sha ([#9471](https://github.com/AztecProtocol/aztec-packages/issues/9471)) ([bc9828e](https://github.com/AztecProtocol/aztec-packages/commit/bc9828e03ba0924c2cfdaffb4b7455c8eebf01e9))

## [0.60.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.59.0...barretenberg-v0.60.0) (2024-10-24)

### ⚠ BREAKING CHANGES

- replace usage of vector in keccakf1600 input with array ([#9350](https://github.com/AztecProtocol/aztec-packages/issues/9350))
- remove hash opcodes from AVM ([#9209](https://github.com/AztecProtocol/aztec-packages/issues/9209))
- remove delegate call and storage address ([#9330](https://github.com/AztecProtocol/aztec-packages/issues/9330))

### Features

- **avm:** Full poseidon2 ([#9141](https://github.com/AztecProtocol/aztec-packages/issues/9141)) ([eae7587](https://github.com/AztecProtocol/aztec-packages/commit/eae75872fdd813ed07f70c1e5d41c7b9f399ab72))
- Eccvm translator zk sumcheck ([#9199](https://github.com/AztecProtocol/aztec-packages/issues/9199)) ([c7d4572](https://github.com/AztecProtocol/aztec-packages/commit/c7d4572b49b33ee309f9238f3cec245878e6c295))
- Remove hash opcodes from AVM ([#9209](https://github.com/AztecProtocol/aztec-packages/issues/9209)) ([e6db535](https://github.com/AztecProtocol/aztec-packages/commit/e6db535b69e6769fa3f2c85a0685640c92ac147b)), closes [#9208](https://github.com/AztecProtocol/aztec-packages/issues/9208)
- Translator on Shplemini ([#9329](https://github.com/AztecProtocol/aztec-packages/issues/9329)) ([21fa3cf](https://github.com/AztecProtocol/aztec-packages/commit/21fa3cf054cf1a3652c8a27ddf042c1c48b47039))

### Bug Fixes

- **avm:** Public dispatch in proving tests ([#9331](https://github.com/AztecProtocol/aztec-packages/issues/9331)) ([42e5221](https://github.com/AztecProtocol/aztec-packages/commit/42e5221dda3fc28dc7fcce3607af756132b4e314))
- Barretenberg readme scare warning ([#9313](https://github.com/AztecProtocol/aztec-packages/issues/9313)) ([f759d55](https://github.com/AztecProtocol/aztec-packages/commit/f759d55d956fc0133ddec0db284de12b552b4c89))

### Miscellaneous

- **avm:** Some cleaning in avm prover ([#9311](https://github.com/AztecProtocol/aztec-packages/issues/9311)) ([523aa23](https://github.com/AztecProtocol/aztec-packages/commit/523aa231acd22228fa6414fc8241cebdfa21eafa))
- Copying world state binary to yarn project is on generate ([#9194](https://github.com/AztecProtocol/aztec-packages/issues/9194)) ([8d75dd4](https://github.com/AztecProtocol/aztec-packages/commit/8d75dd4a6730c1af27b23bc786ed9db8eb199e6f))
- Remove delegate call and storage address ([#9330](https://github.com/AztecProtocol/aztec-packages/issues/9330)) ([465f88e](https://github.com/AztecProtocol/aztec-packages/commit/465f88e9e89ac7af2ec8d4b061722dc3b776301e))
- Remove noir_js_backend_barretenberg ([#9338](https://github.com/AztecProtocol/aztec-packages/issues/9338)) ([cefe3d9](https://github.com/AztecProtocol/aztec-packages/commit/cefe3d901731d3b05de503ce93c97a3badf91363))
- Replace usage of vector in keccakf1600 input with array ([#9350](https://github.com/AztecProtocol/aztec-packages/issues/9350)) ([cb58490](https://github.com/AztecProtocol/aztec-packages/commit/cb58490eed9cc46a7b2039d93645a9456ee9c834))

## [0.59.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.58.0...barretenberg-v0.59.0) (2024-10-21)

### Miscellaneous

- **barretenberg:** Synchronize aztec-packages versions

## [0.58.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.57.0...barretenberg-v0.58.0) (2024-10-18)

### ⚠ BREAKING CHANGES

- remove pedersen commitment ([#9107](https://github.com/AztecProtocol/aztec-packages/issues/9107))
- remove pedersen hash opcode ([#9245](https://github.com/AztecProtocol/aztec-packages/issues/9245))
- Brillig and AVM default all uninitialized memory cells to Field 0 ([#9057](https://github.com/AztecProtocol/aztec-packages/issues/9057))
- **avm:** remove tags from wire format ([#9198](https://github.com/AztecProtocol/aztec-packages/issues/9198))
- remove keccak256 opcode from ACIR/Brillig ([#9104](https://github.com/AztecProtocol/aztec-packages/issues/9104))
- **avm:** more instr wire format takes u16 ([#9174](https://github.com/AztecProtocol/aztec-packages/issues/9174))
- Brillig with a stack and conditional inlining ([#8989](https://github.com/AztecProtocol/aztec-packages/issues/8989))
- unrevert "feat: new per-enqueued-call gas limit" ([#9140](https://github.com/AztecProtocol/aztec-packages/issues/9140))

### Features

- **avm:** Codegen recursive_verifier.cpp ([#9204](https://github.com/AztecProtocol/aztec-packages/issues/9204)) ([2592e50](https://github.com/AztecProtocol/aztec-packages/commit/2592e50b2bd9e76d35a3c9caac4d7042fe26b9b6)), closes [#8849](https://github.com/AztecProtocol/aztec-packages/issues/8849)
- **avm:** Constrain start and end l2/da gas ([#9031](https://github.com/AztecProtocol/aztec-packages/issues/9031)) ([308c03b](https://github.com/AztecProtocol/aztec-packages/commit/308c03b9ad45001570e6232f88403de8cc7d3cfb)), closes [#9001](https://github.com/AztecProtocol/aztec-packages/issues/9001)
- **avm:** More instr wire format takes u16 ([#9174](https://github.com/AztecProtocol/aztec-packages/issues/9174)) ([3a01ad9](https://github.com/AztecProtocol/aztec-packages/commit/3a01ad93e21e9e6cd27b7a2a4c1e2c9f24d6363e))
- **avm:** Remove tags from wire format ([#9198](https://github.com/AztecProtocol/aztec-packages/issues/9198)) ([68a7326](https://github.com/AztecProtocol/aztec-packages/commit/68a7326d9f2d4bd891acac12950289d6e9fbe617))
- Brillig and AVM default all uninitialized memory cells to Field 0 ([#9057](https://github.com/AztecProtocol/aztec-packages/issues/9057)) ([5861d4e](https://github.com/AztecProtocol/aztec-packages/commit/5861d4e5e8a72161dac910e0bc8e635e0d332793))
- Brillig with a stack and conditional inlining ([#8989](https://github.com/AztecProtocol/aztec-packages/issues/8989)) ([409b7b8](https://github.com/AztecProtocol/aztec-packages/commit/409b7b8c6b43a91fc1b5be48aee0174d56d914d9))
- Browser tests for UltraHonk ([#9047](https://github.com/AztecProtocol/aztec-packages/issues/9047)) ([f0d45dd](https://github.com/AztecProtocol/aztec-packages/commit/f0d45dd8d0c00707cd18989c3a45ff0c3cbc92a6))
- Integrate databus in the private kernels ([#9028](https://github.com/AztecProtocol/aztec-packages/issues/9028)) ([1798b1c](https://github.com/AztecProtocol/aztec-packages/commit/1798b1cc701824dd268ed0e49e592febf01a1687))
- Modify contract instance to include public keys ([#9153](https://github.com/AztecProtocol/aztec-packages/issues/9153)) ([17c6127](https://github.com/AztecProtocol/aztec-packages/commit/17c612740dc3563321bf69c1760de1ef88b22124))
- New per-enqueued-call gas limit ([#9033](https://github.com/AztecProtocol/aztec-packages/issues/9033)) ([6ef0895](https://github.com/AztecProtocol/aztec-packages/commit/6ef0895ed9788c533b0caf2d2c30839552dabbcc))
- New world state ([#8776](https://github.com/AztecProtocol/aztec-packages/issues/8776)) ([41f3934](https://github.com/AztecProtocol/aztec-packages/commit/41f393443396cae77e09a09df07d42e6d5ff5618))
- Replace Zeromorph with Shplemini in ECCVM ([#9102](https://github.com/AztecProtocol/aztec-packages/issues/9102)) ([c857cd9](https://github.com/AztecProtocol/aztec-packages/commit/c857cd9167f696fc237b64ff579952001eba7d40))
- Structured commit ([#9027](https://github.com/AztecProtocol/aztec-packages/issues/9027)) ([26f406b](https://github.com/AztecProtocol/aztec-packages/commit/26f406b0591b3f88cb37c5e8f7cb3cbfc625315e))
- Tracy time with instrumentation ([#9170](https://github.com/AztecProtocol/aztec-packages/issues/9170)) ([1c008d9](https://github.com/AztecProtocol/aztec-packages/commit/1c008d9a2fad747142e8ca356d6c00cee1663f2c))
- Unrevert "feat: new per-enqueued-call gas limit" ([#9140](https://github.com/AztecProtocol/aztec-packages/issues/9140)) ([1323a34](https://github.com/AztecProtocol/aztec-packages/commit/1323a34c50e7727435129aa31a05ae7bdfb0ca09))
- Use s3 cache in bootstrap fast ([#9111](https://github.com/AztecProtocol/aztec-packages/issues/9111)) ([349f938](https://github.com/AztecProtocol/aztec-packages/commit/349f938601f7a4fdbdf83aea62c7b8c244bbe434))
- World State Re-orgs ([#9035](https://github.com/AztecProtocol/aztec-packages/issues/9035)) ([04f4a7b](https://github.com/AztecProtocol/aztec-packages/commit/04f4a7b2ae141b7eee4464e8d2cc91460d0c650a))

### Bug Fixes

- Bb bootstrap_cache.sh ([#9254](https://github.com/AztecProtocol/aztec-packages/issues/9254)) ([df37104](https://github.com/AztecProtocol/aztec-packages/commit/df3710477fc7d2e7c44e62b116bea74d4e14f930))
- Limit number of bb.js threads to 32 ([#9070](https://github.com/AztecProtocol/aztec-packages/issues/9070)) ([97e4b9b](https://github.com/AztecProtocol/aztec-packages/commit/97e4b9b2e0d37575b6b5e4c7a22f85b60d1f418b))
- Mac-build ([#9216](https://github.com/AztecProtocol/aztec-packages/issues/9216)) ([80ea32c](https://github.com/AztecProtocol/aztec-packages/commit/80ea32cfda8c149980938382518c47a6da123e72))
- Make gate counting functions less confusing and avoid estimations ([#9046](https://github.com/AztecProtocol/aztec-packages/issues/9046)) ([0bda0a4](https://github.com/AztecProtocol/aztec-packages/commit/0bda0a4d71ae0fb4352de0746f7d96b63b787888))
- Reduce SRS size back to normal ([#9098](https://github.com/AztecProtocol/aztec-packages/issues/9098)) ([a306ea5](https://github.com/AztecProtocol/aztec-packages/commit/a306ea5ffeb13019427a96d8152e5642b717c5f6))
- Revert "feat: new per-enqueued-call gas limit" ([#9139](https://github.com/AztecProtocol/aztec-packages/issues/9139)) ([7677ca5](https://github.com/AztecProtocol/aztec-packages/commit/7677ca5d9280ac9615a92be36d1958960dbd7353))
- Revert "feat: use s3 cache in bootstrap fast" ([#9181](https://github.com/AztecProtocol/aztec-packages/issues/9181)) ([7872d09](https://github.com/AztecProtocol/aztec-packages/commit/7872d092c359298273d7ab1fc23fa61ae1973f8b))
- Revert "fix: Revert "feat: use s3 cache in bootstrap fast"" ([#9182](https://github.com/AztecProtocol/aztec-packages/issues/9182)) ([ce3d08a](https://github.com/AztecProtocol/aztec-packages/commit/ce3d08a18684da9f5b1289a2b9bdf60a66342590))
- **s3-cache:** Link extracted preset-release-world-state ([#9252](https://github.com/AztecProtocol/aztec-packages/issues/9252)) ([8b2d7d9](https://github.com/AztecProtocol/aztec-packages/commit/8b2d7d9c962c975592e17424f4d0b70f9ca7acd4))

### Miscellaneous

- Add world_state_napi to bootstrap fast ([#9079](https://github.com/AztecProtocol/aztec-packages/issues/9079)) ([e827056](https://github.com/AztecProtocol/aztec-packages/commit/e827056e652a4789c91a617587945d57163fa7ff))
- **avm:** Revert 9080 - re-introducing start/end gas constraining ([#9109](https://github.com/AztecProtocol/aztec-packages/issues/9109)) ([763e9b8](https://github.com/AztecProtocol/aztec-packages/commit/763e9b8a98981545b68f96e5b49a0726fc3c80b3))
- **avm:** Type aliasing for VmPublicInputs ([#8884](https://github.com/AztecProtocol/aztec-packages/issues/8884)) ([f3ed39b](https://github.com/AztecProtocol/aztec-packages/commit/f3ed39bf7be6f08bcfcabf6c04eb570f4d06ed27))
- **ci:** Parallelise CI for acir-test flows ([#9238](https://github.com/AztecProtocol/aztec-packages/issues/9238)) ([73a7c23](https://github.com/AztecProtocol/aztec-packages/commit/73a7c231193d56fdbf2e1160be5ea8d58f5596bb))
- Configure trees instead of duplicating constants ([#9088](https://github.com/AztecProtocol/aztec-packages/issues/9088)) ([c1150c9](https://github.com/AztecProtocol/aztec-packages/commit/c1150c9b28581985686b13ba97eb7f0066736652))
- **docs:** Rewriting bbup script, refactoring bb readme for clarity ([#9073](https://github.com/AztecProtocol/aztec-packages/issues/9073)) ([662b61e](https://github.com/AztecProtocol/aztec-packages/commit/662b61e4c20a2d4217980922d4578f4dfeacae6b))
- Eccvm transcript builder ([#9026](https://github.com/AztecProtocol/aztec-packages/issues/9026)) ([d2c9ae2](https://github.com/AztecProtocol/aztec-packages/commit/d2c9ae2853bb75cd736583406a57e96645bd2e88))
- Pass by const reference ([#9083](https://github.com/AztecProtocol/aztec-packages/issues/9083)) ([764bba4](https://github.com/AztecProtocol/aztec-packages/commit/764bba4dd8a016d45b201562ec82f9a12de65c2d))
- Remove keccak256 opcode from ACIR/Brillig ([#9104](https://github.com/AztecProtocol/aztec-packages/issues/9104)) ([4c1163a](https://github.com/AztecProtocol/aztec-packages/commit/4c1163a9e9516d298e55421f1cf0ed81081151dd))
- Remove pedersen commitment ([#9107](https://github.com/AztecProtocol/aztec-packages/issues/9107)) ([1823bde](https://github.com/AztecProtocol/aztec-packages/commit/1823bde2b486827f33a87899074594f811cfbef4))
- Remove pedersen hash opcode ([#9245](https://github.com/AztecProtocol/aztec-packages/issues/9245)) ([1f0538f](https://github.com/AztecProtocol/aztec-packages/commit/1f0538f00cadcf4325d2aa17bdb098d11ca3840f))
- Revert "feat(avm): constrain start and end l2/da gas ([#9031](https://github.com/AztecProtocol/aztec-packages/issues/9031))" ([#9080](https://github.com/AztecProtocol/aztec-packages/issues/9080)) ([07e4c95](https://github.com/AztecProtocol/aztec-packages/commit/07e4c956494154685970849bc4dda60c25af31bc))
- Revert deletion of the old bbup ([#9146](https://github.com/AztecProtocol/aztec-packages/issues/9146)) ([3138078](https://github.com/AztecProtocol/aztec-packages/commit/3138078f0062d8426b3c45ac47646169317ab795))

## [0.57.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.56.0...barretenberg-v0.57.0) (2024-10-07)

### ⚠ BREAKING CHANGES

- **avm:** remove CMOV opcode ([#9030](https://github.com/AztecProtocol/aztec-packages/issues/9030))
- **avm:** make indirects big enough for relative addressing ([#9000](https://github.com/AztecProtocol/aztec-packages/issues/9000))
- keccak_ultra -> ultra_keccak ([#8878](https://github.com/AztecProtocol/aztec-packages/issues/8878))

### Features

- Add support for unlimited width in ACIR ([#8960](https://github.com/AztecProtocol/aztec-packages/issues/8960)) ([3e05e22](https://github.com/AztecProtocol/aztec-packages/commit/3e05e22d8d9fc73c1225570342392dda5661403f))
- **avm:** Integrate public inputs in AVM recursive verifier ([#8846](https://github.com/AztecProtocol/aztec-packages/issues/8846)) ([4354ae0](https://github.com/AztecProtocol/aztec-packages/commit/4354ae030b5b7e365ff0361e88cd74cd95d71e04)), closes [#8714](https://github.com/AztecProtocol/aztec-packages/issues/8714)
- **avm:** Skip gas accounting for fake rows ([#8944](https://github.com/AztecProtocol/aztec-packages/issues/8944)) ([818325a](https://github.com/AztecProtocol/aztec-packages/commit/818325ae35ce0260d88e097261d173f4dc326cbe)), closes [#8903](https://github.com/AztecProtocol/aztec-packages/issues/8903)
- CI/local S3 build cache ([#8802](https://github.com/AztecProtocol/aztec-packages/issues/8802)) ([06be26e](https://github.com/AztecProtocol/aztec-packages/commit/06be26e2b5dfd4b1fa35f57231e15ebffbe410a7))
- Connect the public inputs but not the proof in ivc recursion constraints ([#8973](https://github.com/AztecProtocol/aztec-packages/issues/8973)) ([4f1af9a](https://github.com/AztecProtocol/aztec-packages/commit/4f1af9a0baf9e342d0de41ebd58fed24a0c4f615))
- Faster CIV benching with mocked VKs ([#8843](https://github.com/AztecProtocol/aztec-packages/issues/8843)) ([fad3d6e](https://github.com/AztecProtocol/aztec-packages/commit/fad3d6e41765c774696ecc98d45a27851c7c4442))
- Handle consecutive kernels in IVC ([#8924](https://github.com/AztecProtocol/aztec-packages/issues/8924)) ([0be9f25](https://github.com/AztecProtocol/aztec-packages/commit/0be9f253238cc1453d07385ece565f946d4212a3))
- Lazy commitment key allocation for better memory ([#9017](https://github.com/AztecProtocol/aztec-packages/issues/9017)) ([527d820](https://github.com/AztecProtocol/aztec-packages/commit/527d820fcadc24105e43b819da1ad9d848b755ca))
- Make shplemini proof constant ([#8826](https://github.com/AztecProtocol/aztec-packages/issues/8826)) ([c8cbc33](https://github.com/AztecProtocol/aztec-packages/commit/c8cbc3388c2bbe9a0ba8a95717e1b71c602d58e3))
- New Tracy Time preset and more efficient univariate extension ([#8789](https://github.com/AztecProtocol/aztec-packages/issues/8789)) ([ead4649](https://github.com/AztecProtocol/aztec-packages/commit/ead4649b0c21a98534c36e7755edac68052b3c26))
- Origin Tags part 1 ([#8787](https://github.com/AztecProtocol/aztec-packages/issues/8787)) ([ed1e23e](https://github.com/AztecProtocol/aztec-packages/commit/ed1e23edff04ea026a94ffc22b29b6ef520cdf55))
- Origin Tags Part 2 ([#8936](https://github.com/AztecProtocol/aztec-packages/issues/8936)) ([77c05f5](https://github.com/AztecProtocol/aztec-packages/commit/77c05f5469bad85e1394c05e1878791bac084559))
- **sol:** Add shplemini transcript ([#8865](https://github.com/AztecProtocol/aztec-packages/issues/8865)) ([089dbad](https://github.com/AztecProtocol/aztec-packages/commit/089dbadd9e9ca304004c38e01d3703d923b257ec))
- **sol:** Shplemini verification ([#8866](https://github.com/AztecProtocol/aztec-packages/issues/8866)) ([989eb08](https://github.com/AztecProtocol/aztec-packages/commit/989eb08256db49e65e2d5e8a91790f941761d08f))
- Ultra honk on Shplemini ([#8886](https://github.com/AztecProtocol/aztec-packages/issues/8886)) ([d8d04f6](https://github.com/AztecProtocol/aztec-packages/commit/d8d04f6f0b9ca0aa36008dc53dde2562dc3afa63))
- Use structured polys to reduce prover memory ([#8587](https://github.com/AztecProtocol/aztec-packages/issues/8587)) ([59e3dd9](https://github.com/AztecProtocol/aztec-packages/commit/59e3dd93a70398e828269dbf13d8c4b9b38227ea))

### Bug Fixes

- Assign one_idx in the same place as zero_idx in `UltraCircuitBuilder` ([#9029](https://github.com/AztecProtocol/aztec-packages/issues/9029)) ([fe11d9a](https://github.com/AztecProtocol/aztec-packages/commit/fe11d9a3a1b96454999ae627c902d8b362805172))
- **avm:** Kernel out full proving fix ([#8873](https://github.com/AztecProtocol/aztec-packages/issues/8873)) ([784d483](https://github.com/AztecProtocol/aztec-packages/commit/784d483b592cb80da143634c07d330ba2f2c9ab7))
- Bb.js acir tests ([#8862](https://github.com/AztecProtocol/aztec-packages/issues/8862)) ([d8d0541](https://github.com/AztecProtocol/aztec-packages/commit/d8d0541bde1d98d6b7ae3c3bb2a38068383f802b))

### Miscellaneous

- **avm:** Make indirects big enough for relative addressing ([#9000](https://github.com/AztecProtocol/aztec-packages/issues/9000)) ([39b9e78](https://github.com/AztecProtocol/aztec-packages/commit/39b9e78d008b0a3d8be89f4bc6837ac4e3c28b4f))
- **avm:** Remove CMOV opcode ([#9030](https://github.com/AztecProtocol/aztec-packages/issues/9030)) ([ec9dfdf](https://github.com/AztecProtocol/aztec-packages/commit/ec9dfdf9ba36d9bb2e3829a8cdd5b0ed94cbc3fb))
- **bb.js:** Strip wasm-threads again ([#8833](https://github.com/AztecProtocol/aztec-packages/issues/8833)) ([68ba5d4](https://github.com/AztecProtocol/aztec-packages/commit/68ba5d443a79c06d972019abe39faaf851bb3247))
- Bump foundry ([#8868](https://github.com/AztecProtocol/aztec-packages/issues/8868)) ([bfd0b8e](https://github.com/AztecProtocol/aztec-packages/commit/bfd0b8e6932c2b2fdf6e1c35c3c324edec92118a))
- **ci:** Finally isolate bb-native-tests ([#9039](https://github.com/AztecProtocol/aztec-packages/issues/9039)) ([9c9c385](https://github.com/AztecProtocol/aztec-packages/commit/9c9c385b2d8d3d8284d981a7393500a04fd78d38))
- Keccak_ultra -&gt; ultra_keccak ([#8878](https://github.com/AztecProtocol/aztec-packages/issues/8878)) ([670af8a](https://github.com/AztecProtocol/aztec-packages/commit/670af8a158633d106a3f1df82dbd28ef9a9e4ceb))
- Protogalaxy only instantiated with Mega ([#8949](https://github.com/AztecProtocol/aztec-packages/issues/8949)) ([b8d87f1](https://github.com/AztecProtocol/aztec-packages/commit/b8d87f12224ac7e1c4e0bf0e353ddc902bf82fd4))
- Prove_then_verify_ultra_honk on all existing acir tests ([#9042](https://github.com/AztecProtocol/aztec-packages/issues/9042)) ([62f6b8a](https://github.com/AztecProtocol/aztec-packages/commit/62f6b8aeb92bfb266a0df647a0dd33cfdb021f5f))
- Reduce number of gates in stdlib/sha256 hash function ([#8905](https://github.com/AztecProtocol/aztec-packages/issues/8905)) ([dd3a27e](https://github.com/AztecProtocol/aztec-packages/commit/dd3a27e5dc66fc47c34c077ca8124efe6fbea900))
- Remove copy from `compute_row_evaluations` ([#8875](https://github.com/AztecProtocol/aztec-packages/issues/8875)) ([9cd450e](https://github.com/AztecProtocol/aztec-packages/commit/9cd450e79870e00fb7c4c574a1e7f55de2e7b8ff))
- Remove unused methods and small state cleanup ([#8968](https://github.com/AztecProtocol/aztec-packages/issues/8968)) ([9b66a3e](https://github.com/AztecProtocol/aztec-packages/commit/9b66a3e3d1a38b31cdad29f9fd9aee05738b066c))
- Removing hack commitment from eccvm ([#8825](https://github.com/AztecProtocol/aztec-packages/issues/8825)) ([5e4cfa7](https://github.com/AztecProtocol/aztec-packages/commit/5e4cfa7b0159f66e59365f14c02fe8bbf4a73935))
- Revert "fix: assign one_idx in the same place as zero_idx in `UltraCircuitBuilder`" ([#9049](https://github.com/AztecProtocol/aztec-packages/issues/9049)) ([ebb6a2d](https://github.com/AztecProtocol/aztec-packages/commit/ebb6a2da62c9d99f448b0da9cf1d14fd64a59b9f))

## [0.56.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.55.1...barretenberg-v0.56.0) (2024-09-25)

### ⚠ BREAKING CHANGES

- change ec_add to unsafe implementation (but much better perf) ([#8374](https://github.com/AztecProtocol/aztec-packages/issues/8374))
- **avm:** GETENVVAR + ISSTATICCALL ([#8692](https://github.com/AztecProtocol/aztec-packages/issues/8692))
- remove sha256 opcode ([#4571](https://github.com/AztecProtocol/aztec-packages/issues/4571))
- add support for u1 in the avm, ToRadix's radix arg is a memory addr ([#8570](https://github.com/AztecProtocol/aztec-packages/issues/8570))
- **avm:** remove tag in NOT ([#8606](https://github.com/AztecProtocol/aztec-packages/issues/8606))

### Features

- (LSP) suggest $vars inside `quote { ... }` (https://github.com/noir-lang/noir/pull/6114) ([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))
- Add initial integration of databus ([#8710](https://github.com/AztecProtocol/aztec-packages/issues/8710)) ([779e104](https://github.com/AztecProtocol/aztec-packages/commit/779e10499cfe668506ba8a199342cf86fae258a7))
- Add support for u1 in the avm, ToRadix's radix arg is a memory addr ([#8570](https://github.com/AztecProtocol/aztec-packages/issues/8570)) ([1785737](https://github.com/AztecProtocol/aztec-packages/commit/178573738731e2e74e4119a035f913da39675d85))
- Aggregate honk and avm recursion constraints together ([#8696](https://github.com/AztecProtocol/aztec-packages/issues/8696)) ([3fa9e83](https://github.com/AztecProtocol/aztec-packages/commit/3fa9e83c0fac460f586572fe2866823fe7f740d2))
- **avm:** Avm recursive TS/Noir integration ([#8531](https://github.com/AztecProtocol/aztec-packages/issues/8531)) ([dd09f05](https://github.com/AztecProtocol/aztec-packages/commit/dd09f057e97ac1bba7b3fbf29b50737ebe5ca76f)), closes [#7791](https://github.com/AztecProtocol/aztec-packages/issues/7791)
- **avm:** Avm recursive TS/Noir integration ([#8611](https://github.com/AztecProtocol/aztec-packages/issues/8611)) ([e417231](https://github.com/AztecProtocol/aztec-packages/commit/e4172318af81ac2ac8535c89d3e5afc72d33ba29))
- **avm:** Bounded mle implementation ([#8668](https://github.com/AztecProtocol/aztec-packages/issues/8668)) ([aa85f2a](https://github.com/AztecProtocol/aztec-packages/commit/aa85f2a781223f067291b5702f2e47baced865fd)), closes [#8651](https://github.com/AztecProtocol/aztec-packages/issues/8651)
- **avm:** GETENVVAR + ISSTATICCALL ([#8692](https://github.com/AztecProtocol/aztec-packages/issues/8692)) ([02cff0b](https://github.com/AztecProtocol/aztec-packages/commit/02cff0b525d9d6b1c854219f06713a8b94a8e9f5))
- **avm:** Opcode STATICCALL - stubbed ([#8601](https://github.com/AztecProtocol/aztec-packages/issues/8601)) ([facff7f](https://github.com/AztecProtocol/aztec-packages/commit/facff7fd0b6ea57e91f7d3e3863435655d8b48ea)), closes [#8596](https://github.com/AztecProtocol/aztec-packages/issues/8596)
- **avm:** Remove tag in NOT ([#8606](https://github.com/AztecProtocol/aztec-packages/issues/8606)) ([d5695fc](https://github.com/AztecProtocol/aztec-packages/commit/d5695fcde93cbfda3e45bfa03988a9e72f2dcb59))
- **avm:** Set avm circuit subgroup size ([#8537](https://github.com/AztecProtocol/aztec-packages/issues/8537)) ([3b78058](https://github.com/AztecProtocol/aztec-packages/commit/3b78058288edbbe18a2eb8c81de5576c8a9478ab))
- Benchmark compute_row_evaluations and update analysis script ([#8673](https://github.com/AztecProtocol/aztec-packages/issues/8673)) ([c738c47](https://github.com/AztecProtocol/aztec-packages/commit/c738c47bd13875ba1649d808e7abd2908fa29e07))
- Constant sized PG proofs and const sized PG rec verifier ([#8605](https://github.com/AztecProtocol/aztec-packages/issues/8605)) ([09e2f44](https://github.com/AztecProtocol/aztec-packages/commit/09e2f447b003ed4c77b12069893785851a2c6258))
- LSP autocompletion for `TypePath` (https://github.com/noir-lang/noir/pull/6117) ([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))
- Make UltraKeccak work with Shplemini at bb-level ([#8646](https://github.com/AztecProtocol/aztec-packages/issues/8646)) ([82b60eb](https://github.com/AztecProtocol/aztec-packages/commit/82b60ebbdb18400363248b80986c993df1b7e4af))
- More robust recursion input generator ([#8634](https://github.com/AztecProtocol/aztec-packages/issues/8634)) ([020d4fd](https://github.com/AztecProtocol/aztec-packages/commit/020d4fd0cf4137e21f55b1c41e9e381a27191d84))
- **perf:** Allow array set last uses optimization in return block of Brillig functions (https://github.com/noir-lang/noir/pull/6119) ([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))
- Pretty print Quoted token stream (https://github.com/noir-lang/noir/pull/6111) ([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))
- Public kernel handles enqueued calls ([#8523](https://github.com/AztecProtocol/aztec-packages/issues/8523)) ([6303b4a](https://github.com/AztecProtocol/aztec-packages/commit/6303b4afbc39715e92d5ca7ae5100c60f6398686))
- Reduce max memory in translator by freeing accumulator and eccvm ([#8253](https://github.com/AztecProtocol/aztec-packages/issues/8253)) ([7247ddb](https://github.com/AztecProtocol/aztec-packages/commit/7247ddba274e691a7c5220848caf1fa9d6aa911e))
- Remove sha256 opcode ([#4571](https://github.com/AztecProtocol/aztec-packages/issues/4571)) ([4b4a0bf](https://github.com/AztecProtocol/aztec-packages/commit/4b4a0bf17050893f913b3db10bc70a584b7aaa5e))
- Represent assertions more similarly to function calls (https://github.com/noir-lang/noir/pull/6103) ([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))
- Use new IVC scheme ([#8480](https://github.com/AztecProtocol/aztec-packages/issues/8480)) ([1c7b06d](https://github.com/AztecProtocol/aztec-packages/commit/1c7b06d6621d9873f84147b2b7f1f22bf21bbacb))

### Bug Fixes

- **avm:** Fix tests under proving ([#8640](https://github.com/AztecProtocol/aztec-packages/issues/8640)) ([8bfc769](https://github.com/AztecProtocol/aztec-packages/commit/8bfc769d7cbd6f88bfa7926c051a329ee0fd3468))
- Boomerang variable in sha256 hash function ([#8581](https://github.com/AztecProtocol/aztec-packages/issues/8581)) ([f2a1330](https://github.com/AztecProtocol/aztec-packages/commit/f2a13309f544bbd83b593e6a6207d49d9ef48b74))
- Decode databus return values (https://github.com/noir-lang/noir/pull/6095) ([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))
- Disambiguate field or int static trait method call (https://github.com/noir-lang/noir/pull/6112) ([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))
- **mem2reg:** Remove possibility of underflow (https://github.com/noir-lang/noir/pull/6107) ([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))
- New commit_sparse bug and new tests ([#8649](https://github.com/AztecProtocol/aztec-packages/issues/8649)) ([5818018](https://github.com/AztecProtocol/aztec-packages/commit/581801863529cd2b437cb51b041ada17a96949e0))
- **revert:** "chore!: change ec_add to unsafe implementation (but much better perf)" ([#8722](https://github.com/AztecProtocol/aztec-packages/issues/8722)) ([9a1b5b5](https://github.com/AztecProtocol/aztec-packages/commit/9a1b5b5fdd3194f4e7833aacbca4f48aadafbd74))
- Unencryptedlogs witgen ([#8669](https://github.com/AztecProtocol/aztec-packages/issues/8669)) ([aee4c2d](https://github.com/AztecProtocol/aztec-packages/commit/aee4c2dde7576fad1c47e407ee0dca43dac2b1b4))
- **world_state:** Fix race conditions in WorldState and IndexedTree ([#8612](https://github.com/AztecProtocol/aztec-packages/issues/8612)) ([6797525](https://github.com/AztecProtocol/aztec-packages/commit/679752542edf1667d58e8839aca05d2b9fcc7da6))

### Miscellaneous

- Add more cases for assert_equal conversion ([#8446](https://github.com/AztecProtocol/aztec-packages/issues/8446)) ([e3ea298](https://github.com/AztecProtocol/aztec-packages/commit/e3ea298fd1f7326199e6e35b3523aadb2b12a925))
- **avm:** Simplify bb-prover and other AVM tests ([#8627](https://github.com/AztecProtocol/aztec-packages/issues/8627)) ([0d75363](https://github.com/AztecProtocol/aztec-packages/commit/0d7536395f2406a22a76f15d01114730c84edc18))
- **avm:** Smaller skippable test ([#8664](https://github.com/AztecProtocol/aztec-packages/issues/8664)) ([2418977](https://github.com/AztecProtocol/aztec-packages/commit/241897733fe0a5e2ccdf322449debd367f458086))
- **bb readme:** Document how to Honk Noir programs ([#7638](https://github.com/AztecProtocol/aztec-packages/issues/7638)) ([cd46ddd](https://github.com/AztecProtocol/aztec-packages/commit/cd46ddd96539f2db466d1116dabdb838d2a807e7))
- Bye bye Zeromorph in Solidity ([#8678](https://github.com/AztecProtocol/aztec-packages/issues/8678)) ([74182c4](https://github.com/AztecProtocol/aztec-packages/commit/74182c40e152e988ee8590f39c51d00150ef01ca))
- Change ec_add to unsafe implementation (but much better perf) ([#8374](https://github.com/AztecProtocol/aztec-packages/issues/8374)) ([aabd2d8](https://github.com/AztecProtocol/aztec-packages/commit/aabd2d85d4f3f35d67d53421b47214aa8904c505))
- Create a Gemini prover ([#8622](https://github.com/AztecProtocol/aztec-packages/issues/8622)) ([94339fb](https://github.com/AztecProtocol/aztec-packages/commit/94339fbfc7c0c822dc1497c113d48f74a89f1bad))
- Delete duplicated test (https://github.com/noir-lang/noir/pull/6113) ([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))
- **docs:** Removing old versions (https://github.com/noir-lang/noir/pull/6075) ([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))
- Ec addition for non-zero points (https://github.com/noir-lang/noir/pull/5858) ([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))
- Fixing MacOS build - static_cast from field issue ([#8642](https://github.com/AztecProtocol/aztec-packages/issues/8642)) ([14ff3cf](https://github.com/AztecProtocol/aztec-packages/commit/14ff3cfb4291c288113695a3f2245340587fc8e9))
- Gas premiums for AVM side effects, DA gas in AVM ([#8632](https://github.com/AztecProtocol/aztec-packages/issues/8632)) ([d5f16cc](https://github.com/AztecProtocol/aztec-packages/commit/d5f16cc41bc077f24947fc92af2767630e928ed8))
- Migrate higher-level APIs for barretenberg to bb.js ([#8677](https://github.com/AztecProtocol/aztec-packages/issues/8677)) ([0237a20](https://github.com/AztecProtocol/aztec-packages/commit/0237a20c989f2b37a64ee18b41c1da361363a81f))
- Protogalaxy recursive verifier matches native verifier ([#8568](https://github.com/AztecProtocol/aztec-packages/issues/8568)) ([a4f61b3](https://github.com/AztecProtocol/aztec-packages/commit/a4f61b39c39bf01a1071b52bbf042408f29d5564))
- Reinstate skipped tests ([#8743](https://github.com/AztecProtocol/aztec-packages/issues/8743)) ([18e2697](https://github.com/AztecProtocol/aztec-packages/commit/18e2697d8791b4533e042ec04526e32922b608bc))
- Remove creation of extra toml file in recursion inputs flow ([#8700](https://github.com/AztecProtocol/aztec-packages/issues/8700)) ([014bacc](https://github.com/AztecProtocol/aztec-packages/commit/014bacc0b2f1d56f416a3ab939b8aa5ad90656dd))
- Skip some tests in CI ([#8738](https://github.com/AztecProtocol/aztec-packages/issues/8738)) ([251db7b](https://github.com/AztecProtocol/aztec-packages/commit/251db7be2d7541852de314a13a85205b4b3a0418))

## [0.55.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.55.0...barretenberg-v0.55.1) (2024-09-17)

### Bug Fixes

- Native world state test issues ([#8546](https://github.com/AztecProtocol/aztec-packages/issues/8546)) ([aab8773](https://github.com/AztecProtocol/aztec-packages/commit/aab87733b4381d8d64b85f5e5a6bff4e31ee1abd))

### Miscellaneous

- 7791: Disable world_state test suite ([#8594](https://github.com/AztecProtocol/aztec-packages/issues/8594)) ([ee21583](https://github.com/AztecProtocol/aztec-packages/commit/ee21583aea137eea31cb1b4e6e0643061ef0d59f))
- Moves add gate out of aux ([#8541](https://github.com/AztecProtocol/aztec-packages/issues/8541)) ([c3ad163](https://github.com/AztecProtocol/aztec-packages/commit/c3ad163dbcf79067b49553f1c139c49a6aa066cb))
- Protogalaxy verifier matches prover 2 ([#8477](https://github.com/AztecProtocol/aztec-packages/issues/8477)) ([58882b1](https://github.com/AztecProtocol/aztec-packages/commit/58882b199081b18e33fb65f8d05cfce7fe458f1e))

## [0.55.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.54.0...barretenberg-v0.55.0) (2024-09-13)

### ⚠ BREAKING CHANGES

- Add Not instruction in brillig ([#8488](https://github.com/AztecProtocol/aztec-packages/issues/8488))
- **avm:** variants for CAST/NOT opcode ([#8497](https://github.com/AztecProtocol/aztec-packages/issues/8497))
- **avm:** variants for REVERT opcode ([#8487](https://github.com/AztecProtocol/aztec-packages/issues/8487))

### Features

- (bb) remove redundant constraints on field/group elements when using goblin plonk ([#8409](https://github.com/AztecProtocol/aztec-packages/issues/8409)) ([12a093d](https://github.com/AztecProtocol/aztec-packages/commit/12a093d25e0c32fed5eceee424b24111ad2f14a4))
- Add Not instruction in brillig ([#8488](https://github.com/AztecProtocol/aztec-packages/issues/8488)) ([ceda361](https://github.com/AztecProtocol/aztec-packages/commit/ceda3612f0d12d43bffde9c9b992a432d1a13d75))
- **avm:** Parallelize polynomial alloc and set ([#8520](https://github.com/AztecProtocol/aztec-packages/issues/8520)) ([7e73531](https://github.com/AztecProtocol/aztec-packages/commit/7e7353195592d503a92c7222788c739006fa81fc))
- **avm:** Variants for CAST/NOT opcode ([#8497](https://github.com/AztecProtocol/aztec-packages/issues/8497)) ([bc609fa](https://github.com/AztecProtocol/aztec-packages/commit/bc609fa457b029dee0dc19818e3709a6ea9564ab))
- **avm:** Variants for REVERT opcode ([#8487](https://github.com/AztecProtocol/aztec-packages/issues/8487)) ([a0c8915](https://github.com/AztecProtocol/aztec-packages/commit/a0c8915ccf00fe1c329bf87760d28b3c42725cf1))
- **bb:** Iterative constexpr_for ([#8502](https://github.com/AztecProtocol/aztec-packages/issues/8502)) ([02c3330](https://github.com/AztecProtocol/aztec-packages/commit/02c333028bf186f0472738f4a5c39d36f4980941))
- Checking finalized sizes + a test of two folding verifiers ([#8503](https://github.com/AztecProtocol/aztec-packages/issues/8503)) ([d9e3f4d](https://github.com/AztecProtocol/aztec-packages/commit/d9e3f4d42118d16b343b818a0649e6cfbc14ea31))
- Native world state ([#7516](https://github.com/AztecProtocol/aztec-packages/issues/7516)) ([c1aa6f7](https://github.com/AztecProtocol/aztec-packages/commit/c1aa6f73d13e860d5fcee07e82347a7633f8b334))
- New test programs for wasm benchmarking ([#8389](https://github.com/AztecProtocol/aztec-packages/issues/8389)) ([0b46e96](https://github.com/AztecProtocol/aztec-packages/commit/0b46e96e8e5d05876a3700b9e50d29d6f349ea6e))
- Verification key stuff ([#8431](https://github.com/AztecProtocol/aztec-packages/issues/8431)) ([11dc8ff](https://github.com/AztecProtocol/aztec-packages/commit/11dc8ff185d74e6e5bc51e85d6bcd6577ac83161))

### Miscellaneous

- **bb:** Fix mac build ([#8505](https://github.com/AztecProtocol/aztec-packages/issues/8505)) ([32fd347](https://github.com/AztecProtocol/aztec-packages/commit/32fd347f887af57456767bcb7a38070f8c4b2b28)), closes [#8499](https://github.com/AztecProtocol/aztec-packages/issues/8499)
- **bb:** Fix mac build ([#8522](https://github.com/AztecProtocol/aztec-packages/issues/8522)) ([986e703](https://github.com/AztecProtocol/aztec-packages/commit/986e70353d28eab48cc0028bf31a2c8d67ffb29d))
- Protogalaxy verifier matches prover 1 ([#8414](https://github.com/AztecProtocol/aztec-packages/issues/8414)) ([5a76ec6](https://github.com/AztecProtocol/aztec-packages/commit/5a76ec61fb9dee976cdee8bba8198854d9249bf3))
- Use uint32_t instead of size_t for databus data ([#8479](https://github.com/AztecProtocol/aztec-packages/issues/8479)) ([79995c8](https://github.com/AztecProtocol/aztec-packages/commit/79995c84e0f88c1ee72876fd21c50c33830597fc))

## [0.54.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.53.0...barretenberg-v0.54.0) (2024-09-10)

### ⚠ BREAKING CHANGES

- **avm:** variants for binary operations ([#8473](https://github.com/AztecProtocol/aztec-packages/issues/8473))
- **avm:** make JUMP(I) 16-bit ([#8443](https://github.com/AztecProtocol/aztec-packages/issues/8443))
- **avm:** variants for SET opcode ([#8441](https://github.com/AztecProtocol/aztec-packages/issues/8441))
- **avm:** variants for MOV opcode ([#8440](https://github.com/AztecProtocol/aztec-packages/issues/8440))

### Features

- (bb) 128-bit challenges ([#8406](https://github.com/AztecProtocol/aztec-packages/issues/8406)) ([d5b2397](https://github.com/AztecProtocol/aztec-packages/commit/d5b239745178d1ce4eb8b8d32fa4b366c13c3c94))
- **avm:** DSL integration of AVM recursive verifier ([#8405](https://github.com/AztecProtocol/aztec-packages/issues/8405)) ([467120e](https://github.com/AztecProtocol/aztec-packages/commit/467120e5a95de267910c2f95b65dcb62c60f995d)), closes [#8285](https://github.com/AztecProtocol/aztec-packages/issues/8285)
- **avm:** Make JUMP(I) 16-bit ([#8443](https://github.com/AztecProtocol/aztec-packages/issues/8443)) ([5bb38b1](https://github.com/AztecProtocol/aztec-packages/commit/5bb38b1692469520f29a1c85bc381c1ca9eb4032))
- **avm:** Variants for binary operations ([#8473](https://github.com/AztecProtocol/aztec-packages/issues/8473)) ([8de1f2a](https://github.com/AztecProtocol/aztec-packages/commit/8de1f2a942024aad955ea0f318cb044e3692b7fc))
- **avm:** Variants for MOV opcode ([#8440](https://github.com/AztecProtocol/aztec-packages/issues/8440)) ([5b27fbc](https://github.com/AztecProtocol/aztec-packages/commit/5b27fbca982442251a350d6571bdd007b715d575))
- **avm:** Variants for SET opcode ([#8441](https://github.com/AztecProtocol/aztec-packages/issues/8441)) ([dc43306](https://github.com/AztecProtocol/aztec-packages/commit/dc433064391b2ac93bca6b838adac271fbd28991))
- **bb:** Towards reduced polynomial memory usage ([#7990](https://github.com/AztecProtocol/aztec-packages/issues/7990)) ([372f23c](https://github.com/AztecProtocol/aztec-packages/commit/372f23ce0aa44a3aa6e1ef2f864df303a3229e6b))

### Bug Fixes

- **avm:** Full proving kernel fix ([#8468](https://github.com/AztecProtocol/aztec-packages/issues/8468)) ([684d962](https://github.com/AztecProtocol/aztec-packages/commit/684d96271669116380facfa48db6cba3a5d945de))
- **bb:** Mac release ([#8450](https://github.com/AztecProtocol/aztec-packages/issues/8450)) ([1b3f914](https://github.com/AztecProtocol/aztec-packages/commit/1b3f914fc069ec84fbd93621eb369128c3ba0dc5))

### Miscellaneous

- **bb:** Remove poly downsizing, other fast-follow from structured polys ([#8475](https://github.com/AztecProtocol/aztec-packages/issues/8475)) ([ac88f30](https://github.com/AztecProtocol/aztec-packages/commit/ac88f30808199c2625f889671f2767c3667becb5))
- Rename files relating to what were "instances" ([#8383](https://github.com/AztecProtocol/aztec-packages/issues/8383)) ([a934e85](https://github.com/AztecProtocol/aztec-packages/commit/a934e85b416a029ae057e0e70277401fb7cfe4b9))

## [0.53.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.52.0...barretenberg-v0.53.0) (2024-09-09)

### ⚠ BREAKING CHANGES

- **avm/brillig:** take addresses in calldatacopy ([#8388](https://github.com/AztecProtocol/aztec-packages/issues/8388))
- remove coinbase and unimplemented block gas limit opcodes from AVM ([#8408](https://github.com/AztecProtocol/aztec-packages/issues/8408))

### Features

- Add poseidon relations to UltraKeccak flavor and Solidity verifier ([#8243](https://github.com/AztecProtocol/aztec-packages/issues/8243)) ([f7e4bfb](https://github.com/AztecProtocol/aztec-packages/commit/f7e4bfb0fc8070b7b79366241f3d37357dfaee27))
- **avm/brillig:** Take addresses in calldatacopy ([#8388](https://github.com/AztecProtocol/aztec-packages/issues/8388)) ([eab944c](https://github.com/AztecProtocol/aztec-packages/commit/eab944cbb77eb613e61a879312b58c415f8a0c13))
- **ci:** Tracy gate counter preset ([#8382](https://github.com/AztecProtocol/aztec-packages/issues/8382)) ([882af1e](https://github.com/AztecProtocol/aztec-packages/commit/882af1ed821c135b68a5d693a81b7fc580ad97c2))
- Replace arithmetic equalities with assert equal ([#8386](https://github.com/AztecProtocol/aztec-packages/issues/8386)) ([0d8e835](https://github.com/AztecProtocol/aztec-packages/commit/0d8e835dd6cd6cd545edda20f652ab6f10c530da))
- Ultra keccak honk verifier ([#8261](https://github.com/AztecProtocol/aztec-packages/issues/8261)) ([7f02900](https://github.com/AztecProtocol/aztec-packages/commit/7f029007365b57c06699914f97b93d0891d2a6f1))
- Update AztecIvc interface to facilitate acir-ivc ([#8230](https://github.com/AztecProtocol/aztec-packages/issues/8230)) ([665750a](https://github.com/AztecProtocol/aztec-packages/commit/665750a8d7f20ea4e3f7cded052b88eb6bb28600))
- Verify public validation requests ([#8150](https://github.com/AztecProtocol/aztec-packages/issues/8150)) ([2be1415](https://github.com/AztecProtocol/aztec-packages/commit/2be14157abe3b277c58780ecc03bb1eff8dec20e))

### Bug Fixes

- Broken build ([#8395](https://github.com/AztecProtocol/aztec-packages/issues/8395)) ([d0ea6eb](https://github.com/AztecProtocol/aztec-packages/commit/d0ea6ebbe8b4bb918acc2aa5a4c09863a93b7c08))
- Revert "feat: ultra keccak honk verifier ([#8427](https://github.com/AztecProtocol/aztec-packages/issues/8427)) ([31df5ea](https://github.com/AztecProtocol/aztec-packages/commit/31df5ead9e182bcf57588438f1b73eba4c052fa5))
- Revert "feat: ultra keccak honk verifier" ([#8391](https://github.com/AztecProtocol/aztec-packages/issues/8391)) ([3228e75](https://github.com/AztecProtocol/aztec-packages/commit/3228e7526aa30b514375c62264cbde578754cd79))

### Miscellaneous

- **avm:** Move proving key to avm files ([#8318](https://github.com/AztecProtocol/aztec-packages/issues/8318)) ([32d67bd](https://github.com/AztecProtocol/aztec-packages/commit/32d67bd72244bfc3ea28aef7358c467a5b238b6b))
- **avm:** Remove some unused deps ([#8366](https://github.com/AztecProtocol/aztec-packages/issues/8366)) ([e2150a7](https://github.com/AztecProtocol/aztec-packages/commit/e2150a7e5fc84932b65af07025514fc3c57f1cbc))
- **bb:** Reinstate "chore: uncomment asserts in oink rec verifier"" ([#8356](https://github.com/AztecProtocol/aztec-packages/issues/8356)) ([4dbad01](https://github.com/AztecProtocol/aztec-packages/commit/4dbad01c866b28f7d440d7b4e17631ed6a0469f3))
- **bb:** Use std::span for srs ([#8371](https://github.com/AztecProtocol/aztec-packages/issues/8371)) ([f174699](https://github.com/AztecProtocol/aztec-packages/commit/f1746999ea12cc8117efd5a0c3b2ec5d80196343))
- Improve ec addition ([#8291](https://github.com/AztecProtocol/aztec-packages/issues/8291)) ([e8a097c](https://github.com/AztecProtocol/aztec-packages/commit/e8a097cf338bae2445006b3f20a2f54fc8f5e7f5))
- More efficient verification with shplonk and gemini ([#8351](https://github.com/AztecProtocol/aztec-packages/issues/8351)) ([e51d157](https://github.com/AztecProtocol/aztec-packages/commit/e51d157fc7ae9a8ffeba8e6f89dbe87034d36db4))
- Remove coinbase and unimplemented block gas limit opcodes from AVM ([#8408](https://github.com/AztecProtocol/aztec-packages/issues/8408)) ([dd09b76](https://github.com/AztecProtocol/aztec-packages/commit/dd09b76f70420a3824bf406bb2044481f68cd741))
- Remove unimplemented headermember opcode from avm ([#8407](https://github.com/AztecProtocol/aztec-packages/issues/8407)) ([cfea06e](https://github.com/AztecProtocol/aztec-packages/commit/cfea06ed72449a62e21ba4b0f1b0d77200f91635))
- Renaming `Instance`'s ([#8362](https://github.com/AztecProtocol/aztec-packages/issues/8362)) ([4789440](https://github.com/AztecProtocol/aztec-packages/commit/478944010ca8f28eabba733d04a9a8e9a43c29a9))
- Uncomment asserts in oink rec verifier ([#8316](https://github.com/AztecProtocol/aztec-packages/issues/8316)) ([a7f3144](https://github.com/AztecProtocol/aztec-packages/commit/a7f314448215950f6f1a7d4f282359df040be502))

## [0.52.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.51.1...barretenberg-v0.52.0) (2024-09-01)

### Features

- Clarify state in Protogalaxy 3 ([#8181](https://github.com/AztecProtocol/aztec-packages/issues/8181)) ([4a9bb9d](https://github.com/AztecProtocol/aztec-packages/commit/4a9bb9d47e6b1838875c9ce16fa80a2133b05920))

### Bug Fixes

- Prevent honk proof from getting stale inputs on syncs ([#8293](https://github.com/AztecProtocol/aztec-packages/issues/8293)) ([2598108](https://github.com/AztecProtocol/aztec-packages/commit/2598108e038a9fe791d3fc6e0c0ee064a1511a09))

### Miscellaneous

- **bb:** Make compile on stock mac clang ([#8278](https://github.com/AztecProtocol/aztec-packages/issues/8278)) ([7af80ff](https://github.com/AztecProtocol/aztec-packages/commit/7af80ff98313a20ed18dc15fd5e4c22c82828a98))
- **bb:** More graceful pippenger on non-powers-of-2 ([#8279](https://github.com/AztecProtocol/aztec-packages/issues/8279)) ([104ea85](https://github.com/AztecProtocol/aztec-packages/commit/104ea85667b4be03dd52cd20812907e0b85bcdd8))
- Renaming around Protogalaxy Prover ([#8272](https://github.com/AztecProtocol/aztec-packages/issues/8272)) ([be2169d](https://github.com/AztecProtocol/aztec-packages/commit/be2169da8057a06c0cc5c503ec523e62647775e1))
- **revert:** Earthfile accidental change ([#8309](https://github.com/AztecProtocol/aztec-packages/issues/8309)) ([2d3e0b6](https://github.com/AztecProtocol/aztec-packages/commit/2d3e0b672c11eddf0e4e50f00a42a662bdd67c0c))

### Documentation

- **bb:** Transcript spec ([#8301](https://github.com/AztecProtocol/aztec-packages/issues/8301)) ([18abf37](https://github.com/AztecProtocol/aztec-packages/commit/18abf3785e0826b81417b9f99ffe9776a0213fb1))

## [0.51.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.51.0...barretenberg-v0.51.1) (2024-08-29)

### Features

- **avm:** 1-slot sload/sstore (nr, ts) ([#8264](https://github.com/AztecProtocol/aztec-packages/issues/8264)) ([bdd9b06](https://github.com/AztecProtocol/aztec-packages/commit/bdd9b0677089bc54c461beddafc60db95e2456c2))
- **avm:** Avm recursive verifier cpp ([#8162](https://github.com/AztecProtocol/aztec-packages/issues/8162)) ([6a5587c](https://github.com/AztecProtocol/aztec-packages/commit/6a5587c7cd85a11eafd8c9a1b39d34274e076396))
- **avm:** Integrate new range and cmp gadgets ([#8165](https://github.com/AztecProtocol/aztec-packages/issues/8165)) ([2e1be18](https://github.com/AztecProtocol/aztec-packages/commit/2e1be18fac9e671923119883f27af4226cec9c44))
- **avm:** Range check gadget ([#7967](https://github.com/AztecProtocol/aztec-packages/issues/7967)) ([0dd954e](https://github.com/AztecProtocol/aztec-packages/commit/0dd954e5be1536ca30b43f883ef5b20f1add1408))
- Proof surgery class ([#8236](https://github.com/AztecProtocol/aztec-packages/issues/8236)) ([10d7edd](https://github.com/AztecProtocol/aztec-packages/commit/10d7edd3f1ba6d0e113efd2e2bf2d01809ef43d4))

### Bug Fixes

- **bb-prover:** Create structure for AVM vk ([#8233](https://github.com/AztecProtocol/aztec-packages/issues/8233)) ([55b6ba2](https://github.com/AztecProtocol/aztec-packages/commit/55b6ba28938a8d89a4255607a61243cf13391665))
- **bb:** Mac build ([#8255](https://github.com/AztecProtocol/aztec-packages/issues/8255)) ([ac54f5c](https://github.com/AztecProtocol/aztec-packages/commit/ac54f5ce82ac9ca51e35390b782c7da26d3b00da))
- Handle constant output for sha256 ([#8251](https://github.com/AztecProtocol/aztec-packages/issues/8251)) ([0653ba5](https://github.com/AztecProtocol/aztec-packages/commit/0653ba5cc8283fade1c9f8fd534717833cc18e0a))

### Miscellaneous

- **avm:** Replace range and cmp with gadgets ([#8164](https://github.com/AztecProtocol/aztec-packages/issues/8164)) ([cc12558](https://github.com/AztecProtocol/aztec-packages/commit/cc12558c8683b67ebfaf37d2018fd87ff52ab974))
- **bb:** Use std::span in pippenger for scalars ([#8269](https://github.com/AztecProtocol/aztec-packages/issues/8269)) ([2323cd5](https://github.com/AztecProtocol/aztec-packages/commit/2323cd53486d3a8a063685094ad51aa98412c4a5))

## [0.51.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.50.1...barretenberg-v0.51.0) (2024-08-27)

### Features

- Added indirect const instruction ([#8065](https://github.com/AztecProtocol/aztec-packages/issues/8065)) ([0263b4c](https://github.com/AztecProtocol/aztec-packages/commit/0263b4c8961a751961b0b9ec98b441e598d1ca4e))
- Optimize to_radix ([#8073](https://github.com/AztecProtocol/aztec-packages/issues/8073)) ([8baeffd](https://github.com/AztecProtocol/aztec-packages/commit/8baeffd1239a20ca3cbc4071f7d7da974eff709d))
- Use oink in IVC ([#8161](https://github.com/AztecProtocol/aztec-packages/issues/8161)) ([3540f8e](https://github.com/AztecProtocol/aztec-packages/commit/3540f8ea961b0001ec9f497e2ff4d00c894ce6e4))

### Bug Fixes

- **bb:** Eliminate recursion in accumulate\* ([#8205](https://github.com/AztecProtocol/aztec-packages/issues/8205)) ([47e83fa](https://github.com/AztecProtocol/aztec-packages/commit/47e83fa680f46b12cd65c26475908987f97fff4d))

### Miscellaneous

- Oink takes directly populates an instance ([#8170](https://github.com/AztecProtocol/aztec-packages/issues/8170)) ([6e46b45](https://github.com/AztecProtocol/aztec-packages/commit/6e46b459e67c090a4ffe496880e47c05855f9df4))
- **Protogalaxy:** Isolate some state and clarify skipped zero computation ([#8173](https://github.com/AztecProtocol/aztec-packages/issues/8173)) ([7395b95](https://github.com/AztecProtocol/aztec-packages/commit/7395b95672e94318de695dc0fc71863ef31b2e30))
- **Protogalaxy:** Move state out of Instances ([#8177](https://github.com/AztecProtocol/aztec-packages/issues/8177)) ([cd5d2df](https://github.com/AztecProtocol/aztec-packages/commit/cd5d2dfe7150fa9bd64945aa6c1a66dfa4be1536))

## [0.50.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.50.0...barretenberg-v0.50.1) (2024-08-23)

### Features

- Free instances and circuits earlier to reduce max memory usage ([#8118](https://github.com/AztecProtocol/aztec-packages/issues/8118)) ([32a04c1](https://github.com/AztecProtocol/aztec-packages/commit/32a04c1e14564192df1581829d8f0ccb4a072769))
- Share the commitment key between instances to reduce mem ([#8154](https://github.com/AztecProtocol/aztec-packages/issues/8154)) ([c3dddf8](https://github.com/AztecProtocol/aztec-packages/commit/c3dddf83941fd7411f2faefff43552aa174e1401))

## [0.50.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.49.2...barretenberg-v0.50.0) (2024-08-22)

### Features

- Add a prover-node to the proving e2e tests ([#7952](https://github.com/AztecProtocol/aztec-packages/issues/7952)) ([ec5a5fb](https://github.com/AztecProtocol/aztec-packages/commit/ec5a5fb8fd9c344bcb0d33a4e9f07300d3317bf2))
- Automate verify_honk_proof input generation ([#8092](https://github.com/AztecProtocol/aztec-packages/issues/8092)) ([bf38d61](https://github.com/AztecProtocol/aztec-packages/commit/bf38d61364a0fb55ae79ef09b05df2533f3a6f17))
- **avm:** Enable zeromorph in AVM verification ([#8111](https://github.com/AztecProtocol/aztec-packages/issues/8111)) ([b1f9fb6](https://github.com/AztecProtocol/aztec-packages/commit/b1f9fb6a4986fdfa10207ec89f8b23e14d466073)), closes [#4944](https://github.com/AztecProtocol/aztec-packages/issues/4944)
- Native Merkle Trees ([#7037](https://github.com/AztecProtocol/aztec-packages/issues/7037)) ([8a1032e](https://github.com/AztecProtocol/aztec-packages/commit/8a1032ec4738e9b592b45500c1cf47c0e1820ad3))
- Oink recursive verifier ([#8121](https://github.com/AztecProtocol/aztec-packages/issues/8121)) ([580708a](https://github.com/AztecProtocol/aztec-packages/commit/580708a1f7c18338888d83e749a0740a322c86e0))
- Passes copy_cycles by const reference to avoid copying ([#8051](https://github.com/AztecProtocol/aztec-packages/issues/8051)) ([495d363](https://github.com/AztecProtocol/aztec-packages/commit/495d363fdf0b89dfeb228c200824fc5f9af7bb19))
- PG recursive verifier constructors based on stdlib inputs ([#8052](https://github.com/AztecProtocol/aztec-packages/issues/8052)) ([4c568b0](https://github.com/AztecProtocol/aztec-packages/commit/4c568b0545b022a536a6eb4199be817593e6b317))
- Poseidon2 gates for Ultra arithmetisation ([#7494](https://github.com/AztecProtocol/aztec-packages/issues/7494)) ([d86577c](https://github.com/AztecProtocol/aztec-packages/commit/d86577c2e36c5a077a859058602f455421ed93e1))
- Some fixes and cleanup in PG recursive verifier ([#8053](https://github.com/AztecProtocol/aztec-packages/issues/8053)) ([5f2a9bd](https://github.com/AztecProtocol/aztec-packages/commit/5f2a9bd3d968be491a12c63f812aa8d7e3bb585e))
- Unify all acir recursion constraints based on RecursionConstraint and proof_type ([#7993](https://github.com/AztecProtocol/aztec-packages/issues/7993)) ([7cb39bc](https://github.com/AztecProtocol/aztec-packages/commit/7cb39bceddcb9ec4142b86087a7af58d547ddfaa))
- Zk sumcheck ([#7517](https://github.com/AztecProtocol/aztec-packages/issues/7517)) ([0e9a530](https://github.com/AztecProtocol/aztec-packages/commit/0e9a530cfd83f375f6b3a1bb9fb67cf562847f9b))

### Bug Fixes

- **avm:** Real bytes finalization ([#8041](https://github.com/AztecProtocol/aztec-packages/issues/8041)) ([047461a](https://github.com/AztecProtocol/aztec-packages/commit/047461ae6bc5d6a7a4d05bba18cce0682ee75705))
- **ci:** Correctly run bb tests with asserts ([#7607](https://github.com/AztecProtocol/aztec-packages/issues/7607)) ([7b73f69](https://github.com/AztecProtocol/aztec-packages/commit/7b73f69126b8ae70aa7ade96e775cabce581358f))

### Miscellaneous

- **avm:** Kernel trace and finalization ([#8049](https://github.com/AztecProtocol/aztec-packages/issues/8049)) ([d7edd24](https://github.com/AztecProtocol/aztec-packages/commit/d7edd24e76a2ab87ac490c8c97f0c344190f646b))
- **avm:** Separate alu finalization ([#8069](https://github.com/AztecProtocol/aztec-packages/issues/8069)) ([e8a9eb4](https://github.com/AztecProtocol/aztec-packages/commit/e8a9eb4b809f582c0fa185a2193e0493fc579d98))
- **bb:** IPA parallelization cleanup ([#8088](https://github.com/AztecProtocol/aztec-packages/issues/8088)) ([9227fa9](https://github.com/AztecProtocol/aztec-packages/commit/9227fa9f25b1ef8342dbf694c5bb9d37a1b0226d))
- **bb:** Simplify parallel_for_if_effective ([#8079](https://github.com/AztecProtocol/aztec-packages/issues/8079)) ([5bff26b](https://github.com/AztecProtocol/aztec-packages/commit/5bff26b2f9aecb8298225d5abe72740fedd1f4e8))
- **bb:** Small cleanup in protogalaxy prover ([#8072](https://github.com/AztecProtocol/aztec-packages/issues/8072)) ([4cb5c83](https://github.com/AztecProtocol/aztec-packages/commit/4cb5c83174f55f046d7d37e4e6a4667556ac5907))
- Deduplication in Protogalaxy ([#8067](https://github.com/AztecProtocol/aztec-packages/issues/8067)) ([a5cc3ba](https://github.com/AztecProtocol/aztec-packages/commit/a5cc3bab86711062d180993cf4a7412d1013aa48))
- Handle constant output for ec add opcode ([#8108](https://github.com/AztecProtocol/aztec-packages/issues/8108)) ([2ee79d2](https://github.com/AztecProtocol/aztec-packages/commit/2ee79d28affa66ef3c9f73782182b6221e2e9d98))
- Merge devnet fixes back to master ([#8149](https://github.com/AztecProtocol/aztec-packages/issues/8149)) ([6be2183](https://github.com/AztecProtocol/aztec-packages/commit/6be21831764243ea42ef932aac3b79f20b483a40))
- Split up stdlib/recursion ([#8054](https://github.com/AztecProtocol/aztec-packages/issues/8054)) ([ec03e40](https://github.com/AztecProtocol/aztec-packages/commit/ec03e403cc8bfa1f40fb05fe93eadf9ed63b9b2f))
- Use decider verifier in ultra verifier ([#8115](https://github.com/AztecProtocol/aztec-packages/issues/8115)) ([6c5ab2b](https://github.com/AztecProtocol/aztec-packages/commit/6c5ab2b373086cb2842ee848329e282b463b3272))

### Documentation

- Update installation info for bb and noir ([#8119](https://github.com/AztecProtocol/aztec-packages/issues/8119)) ([a744321](https://github.com/AztecProtocol/aztec-packages/commit/a7443216dfaa7b2731911e2320b2c1c1a720e8e8))

## [0.49.2](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.49.1...barretenberg-v0.49.2) (2024-08-15)

### Miscellaneous

- **barretenberg:** Synchronize aztec-packages versions

## [0.49.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.49.0...barretenberg-v0.49.1) (2024-08-15)

### Features

- **avm:** Base and dynamic gas in TS and CPP (part 2) ([#8016](https://github.com/AztecProtocol/aztec-packages/issues/8016)) ([5801732](https://github.com/AztecProtocol/aztec-packages/commit/58017328a409357b56eabdd6cac365ebbac776b9))

### Miscellaneous

- **avm:** Separate binary and bytes finalization ([#8010](https://github.com/AztecProtocol/aztec-packages/issues/8010)) ([3ad6dd9](https://github.com/AztecProtocol/aztec-packages/commit/3ad6dd91c5bd30ca3b8b522855e9c04106e0ec9f))

## [0.49.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.48.0...barretenberg-v0.49.0) (2024-08-15)

### Features

- **avm:** More no fake rows + virtual dyn gas (part 1) ([#7942](https://github.com/AztecProtocol/aztec-packages/issues/7942)) ([9e8ba96](https://github.com/AztecProtocol/aztec-packages/commit/9e8ba96cc1a5eed9a4d4cf764a7c3d3a2d975617))
- IVC integration tests using new accumulate model ([#7946](https://github.com/AztecProtocol/aztec-packages/issues/7946)) ([c527ae9](https://github.com/AztecProtocol/aztec-packages/commit/c527ae94521c4d76153224b7e10cf176038df76b))
- Update honk ultra_recursive_verifier to do aggregation ([#7582](https://github.com/AztecProtocol/aztec-packages/issues/7582)) ([a96a5ad](https://github.com/AztecProtocol/aztec-packages/commit/a96a5ad2b153cbe995de753cb7db1da0d0072e0c))

### Miscellaneous

- **avm:** Fewer errors unless testing ([#7943](https://github.com/AztecProtocol/aztec-packages/issues/7943)) ([33b65a9](https://github.com/AztecProtocol/aztec-packages/commit/33b65a9e6a5072df8ba45991545b6e5386c99622))
- **bb:** Constexpr simplifications ([#7906](https://github.com/AztecProtocol/aztec-packages/issues/7906)) ([65d3b7f](https://github.com/AztecProtocol/aztec-packages/commit/65d3b7f68fe921d7cf7495a92863c555783636d9))
- **bb:** Prereq work for polynomial mem optimization ([#7949](https://github.com/AztecProtocol/aztec-packages/issues/7949)) ([5ca5138](https://github.com/AztecProtocol/aztec-packages/commit/5ca513881409880e8581a3fc6c9f3b3452087957))

## [0.48.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.47.1...barretenberg-v0.48.0) (2024-08-12)

### Features

- **avm:** Poseidon2 constraints ([#7269](https://github.com/AztecProtocol/aztec-packages/issues/7269)) ([bd5a26e](https://github.com/AztecProtocol/aztec-packages/commit/bd5a26eed42a8e23e2c9ea158419836a2b0b3333))
- **avm:** Support aliases in bb-pilcom ([#7904](https://github.com/AztecProtocol/aztec-packages/issues/7904)) ([09e317d](https://github.com/AztecProtocol/aztec-packages/commit/09e317dee9625f61ef9eb7cc488bdb5ff1d62612))
- **avm:** Support skippable relations ([#7750](https://github.com/AztecProtocol/aztec-packages/issues/7750)) ([89d7b37](https://github.com/AztecProtocol/aztec-packages/commit/89d7b3707dcbe4cc684be7dcfdd8c356519067b0))
- **avm:** Update flavor codegen ([#7917](https://github.com/AztecProtocol/aztec-packages/issues/7917)) ([7f1fa2c](https://github.com/AztecProtocol/aztec-packages/commit/7f1fa2cbb52637c1f7471ca1d20bd62b16b51c7a))
- AztecIvc benchmark suite ([#7864](https://github.com/AztecProtocol/aztec-packages/issues/7864)) ([b7276ab](https://github.com/AztecProtocol/aztec-packages/commit/b7276ab7fc1f7abe26cc082eaac901c371217b2a))
- **bb:** Integrate tracy memory/cpu profiler ([#7718](https://github.com/AztecProtocol/aztec-packages/issues/7718)) ([67efb8b](https://github.com/AztecProtocol/aztec-packages/commit/67efb8b13f8009b55d540b85b849a2172c28edd8))
- **bb:** Optimize tuple creation ([#7770](https://github.com/AztecProtocol/aztec-packages/issues/7770)) ([a09636c](https://github.com/AztecProtocol/aztec-packages/commit/a09636c88dc1db8038e3c9fa68cc7c7d2ddf8894))
- CLI wallet initial version ([#7651](https://github.com/AztecProtocol/aztec-packages/issues/7651)) ([83f8d9c](https://github.com/AztecProtocol/aztec-packages/commit/83f8d9c5e4f53b3691d5a1168c69a160ab657139))
- Consistent handling of point at infinity in transcript ([#7709](https://github.com/AztecProtocol/aztec-packages/issues/7709)) ([7a763c0](https://github.com/AztecProtocol/aztec-packages/commit/7a763c07a29229ba1b1c4f8667e797c2a160022f))
- Extend SMT Utils ([#7126](https://github.com/AztecProtocol/aztec-packages/issues/7126)) ([cfb4aa8](https://github.com/AztecProtocol/aztec-packages/commit/cfb4aa8602c316003d018bf3192e2a13e36cacad))
- Hook up secondary calldata column in dsl ([#7759](https://github.com/AztecProtocol/aztec-packages/issues/7759)) ([f0f28fc](https://github.com/AztecProtocol/aztec-packages/commit/f0f28fc24cfeba18f5c16c77a4505d16dc1e02df))
- Linking circuits with the databus ([#7707](https://github.com/AztecProtocol/aztec-packages/issues/7707)) ([1c596ed](https://github.com/AztecProtocol/aztec-packages/commit/1c596eda3f09bea03467662fd98c6c222c97f182))
- New IVC class that better reflects the aztec architecture ([#7695](https://github.com/AztecProtocol/aztec-packages/issues/7695)) ([f8a76c1](https://github.com/AztecProtocol/aztec-packages/commit/f8a76c1a65c7c25f49bf2d7b4ef5302a0d0fbd58))
- Pass calldata ids to the backend ([#7875](https://github.com/AztecProtocol/aztec-packages/issues/7875)) ([274858f](https://github.com/AztecProtocol/aztec-packages/commit/274858f6385b26ea935dcdcf7b2295562caae0f8))
- Plumbing for slot numbers ([#7663](https://github.com/AztecProtocol/aztec-packages/issues/7663)) ([e7c1dc3](https://github.com/AztecProtocol/aztec-packages/commit/e7c1dc343eaaa9d126d18b7456c207ac50c43d39))
- Report gates and VKs of private protocol circuits with megahonk ([#7722](https://github.com/AztecProtocol/aztec-packages/issues/7722)) ([2c03259](https://github.com/AztecProtocol/aztec-packages/commit/2c03259653c45d7f17086320a9ea76225d1595ed))
- Split merge into recursive verification and proving ([#7801](https://github.com/AztecProtocol/aztec-packages/issues/7801)) ([25c49bc](https://github.com/AztecProtocol/aztec-packages/commit/25c49bce2ad880d1ad9a3678f68431b0cce01dbe))
- Ts pedersen commit with offset ([#7699](https://github.com/AztecProtocol/aztec-packages/issues/7699)) ([b2224b4](https://github.com/AztecProtocol/aztec-packages/commit/b2224b48190d33af5e78efa3a470503331b0371f))
- Use poseidon for merkle tree hashing ([#7356](https://github.com/AztecProtocol/aztec-packages/issues/7356)) ([2daf2ab](https://github.com/AztecProtocol/aztec-packages/commit/2daf2ab2ad6815588c2a62d8b7d540e0dcbff892))

### Bug Fixes

- **avm:** Correctly build spike vm ([#7726](https://github.com/AztecProtocol/aztec-packages/issues/7726)) ([0c1d98f](https://github.com/AztecProtocol/aztec-packages/commit/0c1d98ff53ff0d39956d9837ce7b32cd75e860c3))
- Avoid initializing wires and selectors redundantly in trace ([#7895](https://github.com/AztecProtocol/aztec-packages/issues/7895)) ([4be1833](https://github.com/AztecProtocol/aztec-packages/commit/4be18337082aa076d0cc88d5e11a5ebb2cb83631))
- **bb.js:** Account for extra gates in the c bind circuit size estimate ([#7800](https://github.com/AztecProtocol/aztec-packages/issues/7800)) ([7b90699](https://github.com/AztecProtocol/aztec-packages/commit/7b90699fdbebcb00a06f396e8263a9ffe156fbc2))
- **bb:** Univariate-ff subtraction ([#7905](https://github.com/AztecProtocol/aztec-packages/issues/7905)) ([e29f042](https://github.com/AztecProtocol/aztec-packages/commit/e29f042ccfb02f22ef63b3b82f43be2e4388902d))
- **ci:** Fix circle-ci issue ([#7734](https://github.com/AztecProtocol/aztec-packages/issues/7734)) ([76acff9](https://github.com/AztecProtocol/aztec-packages/commit/76acff9a51190fd2faddd3913d625509d545702a))
- Commonly occurring typo ([#7807](https://github.com/AztecProtocol/aztec-packages/issues/7807)) ([e3cc7d0](https://github.com/AztecProtocol/aztec-packages/commit/e3cc7d0fa0d842edcd24f1981b687cbdf057ce1a))
- Ensure dummy values are on the curve for MSM ([#7653](https://github.com/AztecProtocol/aztec-packages/issues/7653)) ([11f3885](https://github.com/AztecProtocol/aztec-packages/commit/11f3885d11237dbd3e203d07bf4cdb7df316e07a))
- Handle properly invalid witness assignment in ec add ([#7690](https://github.com/AztecProtocol/aztec-packages/issues/7690)) ([6c19c7e](https://github.com/AztecProtocol/aztec-packages/commit/6c19c7eb91acc47106549fa7943f59d2dca3e0ce))
- Increase srs ([#7754](https://github.com/AztecProtocol/aztec-packages/issues/7754)) ([79613a7](https://github.com/AztecProtocol/aztec-packages/commit/79613a7dfa4d2fbd07e9738d35082dc7b097a396))
- Use correct PG degree adjustment in log deriv lookup relation ([#7863](https://github.com/AztecProtocol/aztec-packages/issues/7863)) ([87c940d](https://github.com/AztecProtocol/aztec-packages/commit/87c940d4b92f2ed658ba96fc7c9d603e8e37c67c))

### Miscellaneous

- Adjusted flavors and relation types to zk sumcheck ([#7500](https://github.com/AztecProtocol/aztec-packages/issues/7500)) ([b7efd07](https://github.com/AztecProtocol/aztec-packages/commit/b7efd079a679c492596bb455136661aca4cf582d))
- **avm:** Codegen improvements ([#7703](https://github.com/AztecProtocol/aztec-packages/issues/7703)) ([f26bb32](https://github.com/AztecProtocol/aztec-packages/commit/f26bb32abcdcea4450f4867d2d88efbbcd468c01))
- **avm:** Do not generate subtrace row ([#7894](https://github.com/AztecProtocol/aztec-packages/issues/7894)) ([0d95d9e](https://github.com/AztecProtocol/aztec-packages/commit/0d95d9eee85cdc0cd0a7cdf60cb8a349b8af27da))
- **avm:** Make fixed tables use constant polys ([#7744](https://github.com/AztecProtocol/aztec-packages/issues/7744)) ([4b793b0](https://github.com/AztecProtocol/aztec-packages/commit/4b793b014b31382c10ea0ff7c35bd324b834410a))
- **avm:** No fake rows in main trace ([#7823](https://github.com/AztecProtocol/aztec-packages/issues/7823)) ([5ff3554](https://github.com/AztecProtocol/aztec-packages/commit/5ff3554ace81831d0a561b6a4e186b48edb12e5e))
- **avm:** Rearrange files ([#7723](https://github.com/AztecProtocol/aztec-packages/issues/7723)) ([3270662](https://github.com/AztecProtocol/aztec-packages/commit/3270662882bf98d81cf4a897957fb65cbbaa2464))
- **avm:** Tweak check-circuit settings ([#7872](https://github.com/AztecProtocol/aztec-packages/issues/7872)) ([ff4bb4f](https://github.com/AztecProtocol/aztec-packages/commit/ff4bb4f7ba2b63f8e460b1bacbdf0410f161f7c6))
- **avm:** Update stats ([#7701](https://github.com/AztecProtocol/aztec-packages/issues/7701)) ([1b7d27e](https://github.com/AztecProtocol/aztec-packages/commit/1b7d27e310c70a211f30816b42a879118378a049))
- **avm:** Vm compilation metrics ([#7704](https://github.com/AztecProtocol/aztec-packages/issues/7704)) ([0d83cde](https://github.com/AztecProtocol/aztec-packages/commit/0d83cde126789016cc15087b7ff0cfb26eb31818))
- **bb:** Define missing univ-fr operators ([#7859](https://github.com/AztecProtocol/aztec-packages/issues/7859)) ([30d226e](https://github.com/AztecProtocol/aztec-packages/commit/30d226e9db291b6daaa30462d184aece445a7d9f))
- Lldb bb debugging helper script ([#7627](https://github.com/AztecProtocol/aztec-packages/issues/7627)) ([f35786a](https://github.com/AztecProtocol/aztec-packages/commit/f35786a34659a2691d9810517fa4e4e89b99111a))
- Trim client IVC block sizes to fit e2e test ([#7783](https://github.com/AztecProtocol/aztec-packages/issues/7783)) ([641229e](https://github.com/AztecProtocol/aztec-packages/commit/641229ec6b87ed7db47ef54a810accc4e9b66615))

## [0.47.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.47.0...barretenberg-v0.47.1) (2024-07-30)

### Features

- Add recursive aggregation object to proving/verification keys ([#6770](https://github.com/AztecProtocol/aztec-packages/issues/6770)) ([f48b069](https://github.com/AztecProtocol/aztec-packages/commit/f48b069181e316cb2a9d81f0acf6c00ee90e3db3))
- Adding aggregation to honk and rollup ([#7466](https://github.com/AztecProtocol/aztec-packages/issues/7466)) ([2633aa9](https://github.com/AztecProtocol/aztec-packages/commit/2633aa91a97684f481a861aee0be8756c956135a))
- **avm:** Pedersen commit in avm ([#7634](https://github.com/AztecProtocol/aztec-packages/issues/7634)) ([45e7867](https://github.com/AztecProtocol/aztec-packages/commit/45e7867f4b42a3392b4b95767621284ebc7378fe))
- **avm:** Pedersen commitment sim ([#7632](https://github.com/AztecProtocol/aztec-packages/issues/7632)) ([cc420a0](https://github.com/AztecProtocol/aztec-packages/commit/cc420a081e23558b9441cbf563625002e1d45f18))
- **sol-honk:** Integrate solidity honk verifier with bb and acir tests ([#7573](https://github.com/AztecProtocol/aztec-packages/issues/7573)) ([344ca6f](https://github.com/AztecProtocol/aztec-packages/commit/344ca6f413263a3c2c516b388f85a11fada2840f))
- **sol-honk:** Test verifying recursive proof ([#7576](https://github.com/AztecProtocol/aztec-packages/issues/7576)) ([26408c1](https://github.com/AztecProtocol/aztec-packages/commit/26408c197f5c6e8a300d24e441f4a4860210b5f0))

### Bug Fixes

- Bb mac build ([#7619](https://github.com/AztecProtocol/aztec-packages/issues/7619)) ([e3c5602](https://github.com/AztecProtocol/aztec-packages/commit/e3c560216e1bce7d22e30ef18d428f1ab7335a09))

### Miscellaneous

- **bb readme:** Add installation instructions and TODOs ([#7601](https://github.com/AztecProtocol/aztec-packages/issues/7601)) ([1a97698](https://github.com/AztecProtocol/aztec-packages/commit/1a97698071a667cd56510c7b7201373a9ac9c646))
- **bb readme:** Update versioning instructions and add Honk Solidity verifier commands ([#7608](https://github.com/AztecProtocol/aztec-packages/issues/7608)) ([9dd9195](https://github.com/AztecProtocol/aztec-packages/commit/9dd9195d8da2d7e2bc85d39e53b33cc82597da1f))
- Call requests ([#7483](https://github.com/AztecProtocol/aztec-packages/issues/7483)) ([ffedf39](https://github.com/AztecProtocol/aztec-packages/commit/ffedf39d98aee4c4149e55e4a133e878553e1e25))
- Constant inputs for most blackboxes ([#7613](https://github.com/AztecProtocol/aztec-packages/issues/7613)) ([3247058](https://github.com/AztecProtocol/aztec-packages/commit/3247058d2e54e1fb84680ad9fcf9ece611235e96))
- Merge Devnet back to Master ([#7611](https://github.com/AztecProtocol/aztec-packages/issues/7611)) ([112961c](https://github.com/AztecProtocol/aztec-packages/commit/112961cd9c9276e2cd95b41b6de31d27bb43bb41))

## [0.47.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.46.7...barretenberg-v0.47.0) (2024-07-24)

### Features

- **avm:** Concurrency improvements ([#7495](https://github.com/AztecProtocol/aztec-packages/issues/7495)) ([0d5c066](https://github.com/AztecProtocol/aztec-packages/commit/0d5c066382a326fbc2c5f5c6844a9c6cc3a54738))
- Bus updates ([#7522](https://github.com/AztecProtocol/aztec-packages/issues/7522)) ([bf774c2](https://github.com/AztecProtocol/aztec-packages/commit/bf774c2fbe660401812380b9c1360a33e0274a51))
- Make Brillig do integer arithmetic operations using u128 instead of Bigint ([#7518](https://github.com/AztecProtocol/aztec-packages/issues/7518)) ([4a2011e](https://github.com/AztecProtocol/aztec-packages/commit/4a2011e771450f0e7efd49f14cf4515fc602f764))
- Simple sparse commitment ([#7488](https://github.com/AztecProtocol/aztec-packages/issues/7488)) ([df08874](https://github.com/AztecProtocol/aztec-packages/commit/df08874fce805f0f1e8488108e5006fc08fbb6ee))
- Solidity honk verifier ([#5485](https://github.com/AztecProtocol/aztec-packages/issues/5485)) ([8dfebe4](https://github.com/AztecProtocol/aztec-packages/commit/8dfebe4990195224dc162c9d98137040b30cfab2))

### Bug Fixes

- **avm:** One too many range check rows ([#7499](https://github.com/AztecProtocol/aztec-packages/issues/7499)) ([deb6918](https://github.com/AztecProtocol/aztec-packages/commit/deb69180f3a3670c7a512d4c401c3ad8b5da0e17))
- Do not load the BN254 CRS for verifying client ivc proofs ([#7556](https://github.com/AztecProtocol/aztec-packages/issues/7556)) ([e515b71](https://github.com/AztecProtocol/aztec-packages/commit/e515b71af89d6d725c6355bc852432a6a5dbeb94))

### Miscellaneous

- **avm:** Bump SRS to 1 &lt;< 20 ([#7575](https://github.com/AztecProtocol/aztec-packages/issues/7575)) ([fad37a7](https://github.com/AztecProtocol/aztec-packages/commit/fad37a739b4c50db4036600d62df332f3c7d7cfc))
- **avm:** Count non-zero elems and others ([#7498](https://github.com/AztecProtocol/aztec-packages/issues/7498)) ([7d97c0f](https://github.com/AztecProtocol/aztec-packages/commit/7d97c0f1076146013444ee0a23ea1a56bf98cb38))
- **avm:** Nuke declare_views ([#7507](https://github.com/AztecProtocol/aztec-packages/issues/7507)) ([7e07ba9](https://github.com/AztecProtocol/aztec-packages/commit/7e07ba9f707b95409ea1cab71f123db44c188994))
- **avm:** Use commit_sparse ([#7581](https://github.com/AztecProtocol/aztec-packages/issues/7581)) ([6812f2b](https://github.com/AztecProtocol/aztec-packages/commit/6812f2b3012b91df09239420cd82c053855a3850))

## [0.46.7](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.46.6...barretenberg-v0.46.7) (2024-07-16)

### Features

- Point::fromXandSign(...) ([#7455](https://github.com/AztecProtocol/aztec-packages/issues/7455)) ([225c6f6](https://github.com/AztecProtocol/aztec-packages/commit/225c6f623be22a598cf8aeab900e7c72011a6e19))

### Bug Fixes

- **avm:** Update generated verifier ([#7492](https://github.com/AztecProtocol/aztec-packages/issues/7492)) ([f1216a7](https://github.com/AztecProtocol/aztec-packages/commit/f1216a7fb8221e0e7311d4e868ca7f9b3b29f2d4))

### Miscellaneous

- **avm:** More stats and codegen cleanup ([#7475](https://github.com/AztecProtocol/aztec-packages/issues/7475)) ([1a6c7f2](https://github.com/AztecProtocol/aztec-packages/commit/1a6c7f2521a5955acce290da96b1c233a5c9551a))
- Included subrelation witness degrees in the relations relevant to zk-sumcheck ([#7479](https://github.com/AztecProtocol/aztec-packages/issues/7479)) ([457a115](https://github.com/AztecProtocol/aztec-packages/commit/457a115ef5adce885a5456359c27db5d179eff34))

## [0.46.6](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.46.5...barretenberg-v0.46.6) (2024-07-15)

### Features

- Modular CLI + `aztec test` ([#7426](https://github.com/AztecProtocol/aztec-packages/issues/7426)) ([cca2a9b](https://github.com/AztecProtocol/aztec-packages/commit/cca2a9b393f781a2518e7fb6cbb376e4ae6fbd4e))

### Miscellaneous

- **ci:** Recover from earthly bug with --no-cache, build images from registry ([#7462](https://github.com/AztecProtocol/aztec-packages/issues/7462)) ([09299e3](https://github.com/AztecProtocol/aztec-packages/commit/09299e34082047ec0e84ee3229381ff25e3b85e5))

## [0.46.5](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.46.4...barretenberg-v0.46.5) (2024-07-14)

### Features

- Added barrett_reduction implementation into uintx ([#6768](https://github.com/AztecProtocol/aztec-packages/issues/6768)) ([abced57](https://github.com/AztecProtocol/aztec-packages/commit/abced575d43d062ed936445e7e60f017efb1de4e))
- Databus allows arbitrarily many reads per index ([#6524](https://github.com/AztecProtocol/aztec-packages/issues/6524)) ([f07200c](https://github.com/AztecProtocol/aztec-packages/commit/f07200c110a9cce1a2bb4a7892063acd928e86cf))
- Multiple trace structuring configurations ([#7408](https://github.com/AztecProtocol/aztec-packages/issues/7408)) ([e4abe1d](https://github.com/AztecProtocol/aztec-packages/commit/e4abe1d9cd577304d56efff5969cdaa7542dccfd))
- Verify ClientIVC proofs through Bb binary ([#7407](https://github.com/AztecProtocol/aztec-packages/issues/7407)) ([3760c64](https://github.com/AztecProtocol/aztec-packages/commit/3760c64532dd8b55a46a75e0d98896b7131e754f))

### Bug Fixes

- Lagrange interpolation ([#7440](https://github.com/AztecProtocol/aztec-packages/issues/7440)) ([76bcd72](https://github.com/AztecProtocol/aztec-packages/commit/76bcd726d4e5b0c1a2a2bf44b51081142e4ae30a))

## [0.46.4](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.46.3...barretenberg-v0.46.4) (2024-07-11)

### Miscellaneous

- **avm:** Codegen cleanup ([#7439](https://github.com/AztecProtocol/aztec-packages/issues/7439)) ([e31887e](https://github.com/AztecProtocol/aztec-packages/commit/e31887e0091e31fcec59b8c792ec6af36d835f04))
- **proving:** Post honk branch fixes ([#7435](https://github.com/AztecProtocol/aztec-packages/issues/7435)) ([86eafa0](https://github.com/AztecProtocol/aztec-packages/commit/86eafa0ca43645252852d1aa4def33de86156ff6))

## [0.46.3](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.46.2...barretenberg-v0.46.3) (2024-07-11)

### Features

- **avm:** Calldatacopy and return gadget ([#7415](https://github.com/AztecProtocol/aztec-packages/issues/7415)) ([ec39e4e](https://github.com/AztecProtocol/aztec-packages/commit/ec39e4e2ffecb6d6e355eb3963008b710cc11d2c)), closes [#7381](https://github.com/AztecProtocol/aztec-packages/issues/7381) [#7211](https://github.com/AztecProtocol/aztec-packages/issues/7211)
- **avm:** Make ProverPolynomials::get_row return references ([#7419](https://github.com/AztecProtocol/aztec-packages/issues/7419)) ([108fc5f](https://github.com/AztecProtocol/aztec-packages/commit/108fc5f92e44b027b38fa31614e14f2b7a9f650a))
- Integrate new proving systems in e2e ([#6971](https://github.com/AztecProtocol/aztec-packages/issues/6971)) ([723a0c1](https://github.com/AztecProtocol/aztec-packages/commit/723a0c10c9010f3869f103c77f71950efbf7106c))
- MSM sorting ([#7351](https://github.com/AztecProtocol/aztec-packages/issues/7351)) ([5cbdc54](https://github.com/AztecProtocol/aztec-packages/commit/5cbdc549f0ab137ab4fa601e20d80699871faaf4))

### Bug Fixes

- **avm:** Fixes AVM full tests and decrease timeout to 35 minutes ([#7438](https://github.com/AztecProtocol/aztec-packages/issues/7438)) ([2a7494b](https://github.com/AztecProtocol/aztec-packages/commit/2a7494baec4396b9fa62f0a9c240b4b02f23fb1d))
- Memory init with no other ops gate counting ([#7427](https://github.com/AztecProtocol/aztec-packages/issues/7427)) ([e7177ba](https://github.com/AztecProtocol/aztec-packages/commit/e7177ba0f96c1da3edbcdffdaaf88c128bbdd719))

### Miscellaneous

- **bb:** Fix double increment ([#7428](https://github.com/AztecProtocol/aztec-packages/issues/7428)) ([7870a58](https://github.com/AztecProtocol/aztec-packages/commit/7870a5815dc759aed7097dc9eb5ab8e10b3a1865))
- Minimize usage of get_row in inverse computation ([#7431](https://github.com/AztecProtocol/aztec-packages/issues/7431)) ([f177887](https://github.com/AztecProtocol/aztec-packages/commit/f1778876eac8ef65edd06c49d1ddf2429d6583e5))

## [0.46.2](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.46.1...barretenberg-v0.46.2) (2024-07-10)

### Miscellaneous

- **barretenberg:** Synchronize aztec-packages versions

## [0.46.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.46.0...barretenberg-v0.46.1) (2024-07-10)

### Miscellaneous

- **barretenberg:** Synchronize aztec-packages versions

## [0.46.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.45.1...barretenberg-v0.46.0) (2024-07-09)

### ⚠ BREAKING CHANGES

- constant inputs for blackbox ([#7222](https://github.com/AztecProtocol/aztec-packages/issues/7222))

### Features

- Constant inputs for blackbox ([#7222](https://github.com/AztecProtocol/aztec-packages/issues/7222)) ([9f9ded2](https://github.com/AztecProtocol/aztec-packages/commit/9f9ded2b99980b3b40fce9b55e72c91df1dc3d72))

### Miscellaneous

- **avm:** Avoid including flavor where possible ([#7361](https://github.com/AztecProtocol/aztec-packages/issues/7361)) ([dbdffd6](https://github.com/AztecProtocol/aztec-packages/commit/dbdffd60b12aa5152fbd2da7d20abc8550d33cef))
- **avm:** Better log_derivative_inverse_round ([#7360](https://github.com/AztecProtocol/aztec-packages/issues/7360)) ([6329833](https://github.com/AztecProtocol/aztec-packages/commit/63298337162b80c8d9b82c94760a0fb7be0fe940))
- **avm:** Make stats thread safe ([#7393](https://github.com/AztecProtocol/aztec-packages/issues/7393)) ([894ac3b](https://github.com/AztecProtocol/aztec-packages/commit/894ac3b904b8753f2820c7170d70e491201e8ede))
- **avm:** Smaller prover ([#7359](https://github.com/AztecProtocol/aztec-packages/issues/7359)) ([7d8c833](https://github.com/AztecProtocol/aztec-packages/commit/7d8c833f94f5c796cb146e6fb5a961e471163ec0))
- **avm:** Smaller transcript ([#7357](https://github.com/AztecProtocol/aztec-packages/issues/7357)) ([3952a44](https://github.com/AztecProtocol/aztec-packages/commit/3952a444629fc03616089c27d0e037240db7b4e9))
- **bb:** Do not instantiate Relation ([#7389](https://github.com/AztecProtocol/aztec-packages/issues/7389)) ([d9cbf4c](https://github.com/AztecProtocol/aztec-packages/commit/d9cbf4c289d3b3952f84540dadf35e0b410eef2a))
- Counters ([#7342](https://github.com/AztecProtocol/aztec-packages/issues/7342)) ([819f370](https://github.com/AztecProtocol/aztec-packages/commit/819f37002a253cdba8c46daac5d68f64fa11f19c))

## [0.45.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.45.0...barretenberg-v0.45.1) (2024-07-04)

### Features

- **avm:** Use template engine for codegen ([#7299](https://github.com/AztecProtocol/aztec-packages/issues/7299)) ([d4359a3](https://github.com/AztecProtocol/aztec-packages/commit/d4359a34668fc389a8a5c5a8b8493f0dc8a5d4ae))

### Miscellaneous

- **avm:** Basic stat collection ([#7283](https://github.com/AztecProtocol/aztec-packages/issues/7283)) ([adf2331](https://github.com/AztecProtocol/aztec-packages/commit/adf233153d02ea5d4dcaa20357138bd2e91dc8d8))
- **avm:** Less code in prover and verifier ([#7302](https://github.com/AztecProtocol/aztec-packages/issues/7302)) ([f401a9a](https://github.com/AztecProtocol/aztec-packages/commit/f401a9afc21af84105123393a77d87587a9a34dc))
- **avm:** Migrate lookups and permutations ([#7335](https://github.com/AztecProtocol/aztec-packages/issues/7335)) ([56fe4fe](https://github.com/AztecProtocol/aztec-packages/commit/56fe4febc179aa6b329f2a2f3a2d8675d039909f))
- **avm:** Migrate to template engine ([#7316](https://github.com/AztecProtocol/aztec-packages/issues/7316)) ([0fbfe11](https://github.com/AztecProtocol/aztec-packages/commit/0fbfe111329640b27684e6c55a45d08bb17e8e5a))
- **avm:** Re-ordering routines by opcode order ([#7298](https://github.com/AztecProtocol/aztec-packages/issues/7298)) ([4bb512d](https://github.com/AztecProtocol/aztec-packages/commit/4bb512d6935ac03338a920ec1dbc810d77e0c58c))
- **avm:** Remove shifts from full row ([#7327](https://github.com/AztecProtocol/aztec-packages/issues/7327)) ([4d641ee](https://github.com/AztecProtocol/aztec-packages/commit/4d641ee74a109030f63119ab9c0a71b5d2e2e7a6))
- Nuking "new" from names ([#7273](https://github.com/AztecProtocol/aztec-packages/issues/7273)) ([b12c6cb](https://github.com/AztecProtocol/aztec-packages/commit/b12c6cb54ec6b39baed6e6bb06ecf4ace3eeede5))

## [0.45.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.44.0...barretenberg-v0.45.0) (2024-07-02)

### Features

- **avm:** Calldata gadget preliminaries ([#7227](https://github.com/AztecProtocol/aztec-packages/issues/7227)) ([79e8588](https://github.com/AztecProtocol/aztec-packages/commit/79e85883c90465cf2ff6e1a2d7af0e5d4d3e111c))
- Constant Honk proof sizes ([#6954](https://github.com/AztecProtocol/aztec-packages/issues/6954)) ([17c8d3a](https://github.com/AztecProtocol/aztec-packages/commit/17c8d3a00f3a2e500d5caa1fb438504bcd357e8a))
- Function selector opcode in AVM ([#7244](https://github.com/AztecProtocol/aztec-packages/issues/7244)) ([dde47e9](https://github.com/AztecProtocol/aztec-packages/commit/dde47e927ebe5606a272a35dd8c4f4876369b244))
- Update rebuild script ([#7225](https://github.com/AztecProtocol/aztec-packages/issues/7225)) ([af59247](https://github.com/AztecProtocol/aztec-packages/commit/af592474c1d57c9d7886763d04afeb793f98efe3))

### Bug Fixes

- Benchmark prover e2e test with proving ([#7175](https://github.com/AztecProtocol/aztec-packages/issues/7175)) ([431c14c](https://github.com/AztecProtocol/aztec-packages/commit/431c14ccca8bcbdeba51061cad6f6e01f054dd86))
- Reran pil-&gt;cpp codegen & encode_and_encrypt_event_with_randomness fix ([#7247](https://github.com/AztecProtocol/aztec-packages/issues/7247)) ([fa15a45](https://github.com/AztecProtocol/aztec-packages/commit/fa15a450408181ffc50946ee56c4ae0fd8c5a61f))

### Miscellaneous

- **avm:** Remove trailing minus zero in codegen ([#7185](https://github.com/AztecProtocol/aztec-packages/issues/7185)) ([f3c8166](https://github.com/AztecProtocol/aztec-packages/commit/f3c81661688cc04b64a389d8fd72484ca8580a05))
- Fix negative tests in AVM circuit for context input lookups ([#7261](https://github.com/AztecProtocol/aztec-packages/issues/7261)) ([ad2f654](https://github.com/AztecProtocol/aztec-packages/commit/ad2f654eb2589dff118c3e104c4f91825ee7f739))
- Generate PIL constants from via constants gen ([#7258](https://github.com/AztecProtocol/aztec-packages/issues/7258)) ([244ef7e](https://github.com/AztecProtocol/aztec-packages/commit/244ef7e5a6871443444df88c28a1c2a7430d6db1))
- Reduce note and nullifier constants ([#7255](https://github.com/AztecProtocol/aztec-packages/issues/7255)) ([4637304](https://github.com/AztecProtocol/aztec-packages/commit/463730458de2397d66ec90fedfeee61700c426a4))
- Use prefix op\_ for every instruction in avm_trace.hpp ([#7214](https://github.com/AztecProtocol/aztec-packages/issues/7214)) ([7ed7558](https://github.com/AztecProtocol/aztec-packages/commit/7ed75586cd5deb8aff3730a80cb29c642495bbff))

## [0.44.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.43.0...barretenberg-v0.44.0) (2024-06-26)

### Features

- Added prove_output_all flow for honk ([#6869](https://github.com/AztecProtocol/aztec-packages/issues/6869)) ([7bd7c66](https://github.com/AztecProtocol/aztec-packages/commit/7bd7c66de6adb1f703509e9a8e8911ff0ec2025c))
- **avm:** Add ECC ops to avm_proving_test ([#7058](https://github.com/AztecProtocol/aztec-packages/issues/7058)) ([7f62a90](https://github.com/AztecProtocol/aztec-packages/commit/7f62a901c848020058a58f6e772d495566416e0b))
- **avm:** Cpp msm changes ([#7056](https://github.com/AztecProtocol/aztec-packages/issues/7056)) ([f9c8f20](https://github.com/AztecProtocol/aztec-packages/commit/f9c8f20f1bd6af0003960b19f61b737e3bad5f1e))
- **avm:** Include bb-pilcom in monorepo ([#7098](https://github.com/AztecProtocol/aztec-packages/issues/7098)) ([0442158](https://github.com/AztecProtocol/aztec-packages/commit/044215814ac75df37c1d3ce3a6852b4ac49e6065))
- Conventional lookups using log-deriv ([#7020](https://github.com/AztecProtocol/aztec-packages/issues/7020)) ([6f1212f](https://github.com/AztecProtocol/aztec-packages/commit/6f1212ff0d6bb7a326e571da2d49cfac75a8e5de))
- Enable merge recursive verifier in Goblin recursive verifier ([#7182](https://github.com/AztecProtocol/aztec-packages/issues/7182)) ([9b4f56c](https://github.com/AztecProtocol/aztec-packages/commit/9b4f56c89fb17eb3497987e6f9198441a4e89c56))
- Several updates in SMT verification module ([#7105](https://github.com/AztecProtocol/aztec-packages/issues/7105)) ([41b21f1](https://github.com/AztecProtocol/aztec-packages/commit/41b21f179ead617203c6d77b080e4f8b0065e06c))
- Shplonk revival in ECCVM ([#7164](https://github.com/AztecProtocol/aztec-packages/issues/7164)) ([34eb5a0](https://github.com/AztecProtocol/aztec-packages/commit/34eb5a01d34e5ff5d1414fff53ca0623d83bde5d))

### Bug Fixes

- **avm:** Fix unencryptedlog c++ deser ([#7194](https://github.com/AztecProtocol/aztec-packages/issues/7194)) ([89a99af](https://github.com/AztecProtocol/aztec-packages/commit/89a99af4ff2ea79c276ff379a3cdd1b8cae18d15))
- **avm:** Re-enable ext call test ([#7147](https://github.com/AztecProtocol/aztec-packages/issues/7147)) ([33ccf1b](https://github.com/AztecProtocol/aztec-packages/commit/33ccf1b61260868e6bb027b7838ef530717bff01))
- **avm:** Reenable tag error sload ([#7153](https://github.com/AztecProtocol/aztec-packages/issues/7153)) ([fd92d46](https://github.com/AztecProtocol/aztec-packages/commit/fd92d467eee51638b896852b789c8fae17e0689c))
- **avm:** Update codegen ([#7178](https://github.com/AztecProtocol/aztec-packages/issues/7178)) ([1d29708](https://github.com/AztecProtocol/aztec-packages/commit/1d29708bb6136184c27c1dc4f632b277cf3e4e64))
- Bug fixing bench prover test ([#7135](https://github.com/AztecProtocol/aztec-packages/issues/7135)) ([13678be](https://github.com/AztecProtocol/aztec-packages/commit/13678be4e1c76d20a804a04b0fa82f68aeca38ae)), closes [#7080](https://github.com/AztecProtocol/aztec-packages/issues/7080)
- Fix bug for a unit test in full proving mode repated to MSM ([#7104](https://github.com/AztecProtocol/aztec-packages/issues/7104)) ([e37809b](https://github.com/AztecProtocol/aztec-packages/commit/e37809bdcdcf76f89f68403ee75aaf6d32c79a94))

### Miscellaneous

- **avm:** Remove avm prefix from pil and executor ([#7099](https://github.com/AztecProtocol/aztec-packages/issues/7099)) ([b502fcd](https://github.com/AztecProtocol/aztec-packages/commit/b502fcd500dcb10945b29d00f86e290bec63cce3))
- **avm:** Renamings and comments ([#7128](https://github.com/AztecProtocol/aztec-packages/issues/7128)) ([ed2f98e](https://github.com/AztecProtocol/aztec-packages/commit/ed2f98ee9d7f540fbdfae09a0117bf22aaf6ebc7))
- **avm:** Separate some fixed tables ([#7163](https://github.com/AztecProtocol/aztec-packages/issues/7163)) ([1d4a9a2](https://github.com/AztecProtocol/aztec-packages/commit/1d4a9a29ad37543aa0058bd43fa533f19a91e019))
- Create workflow for full AVM tests ([#7051](https://github.com/AztecProtocol/aztec-packages/issues/7051)) ([a0b9c4b](https://github.com/AztecProtocol/aztec-packages/commit/a0b9c4b4383f448549c04567cd9c9264ce4240dc)), closes [#6643](https://github.com/AztecProtocol/aztec-packages/issues/6643)
- Indirects and read/write slices ([#7082](https://github.com/AztecProtocol/aztec-packages/issues/7082)) ([d5e80ee](https://github.com/AztecProtocol/aztec-packages/commit/d5e80ee9b6298f7edf39b99ff51ae7cc26b8cbd8))
- Reads the return data ([#6669](https://github.com/AztecProtocol/aztec-packages/issues/6669)) ([ef85542](https://github.com/AztecProtocol/aztec-packages/commit/ef8554268c175e6349474883c6072e3979fe45c0))
- Remove unneeded public input folding ([#7094](https://github.com/AztecProtocol/aztec-packages/issues/7094)) ([c30dc38](https://github.com/AztecProtocol/aztec-packages/commit/c30dc3856cec038d8c53af34cf82e08b0cb456aa))
- Take the PCS out of Zeromorph and refactor tests ([#7078](https://github.com/AztecProtocol/aztec-packages/issues/7078)) ([e192678](https://github.com/AztecProtocol/aztec-packages/commit/e19267872bae6fa2df258a1e363f1ba2f2f47922))
- Ultra flavor cleanup ([#7070](https://github.com/AztecProtocol/aztec-packages/issues/7070)) ([77761c6](https://github.com/AztecProtocol/aztec-packages/commit/77761c670f2d516ab486de0f7bde036ff00ebd99))

## [0.43.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.42.0...barretenberg-v0.43.0) (2024-06-18)

### Features

- Add gate profiler for noir circuits ([#7004](https://github.com/AztecProtocol/aztec-packages/issues/7004)) ([a2f6876](https://github.com/AztecProtocol/aztec-packages/commit/a2f687687559d15fde52abce54838f6e144a0aa4))
- Add standard form function to biggroup ([#6899](https://github.com/AztecProtocol/aztec-packages/issues/6899)) ([3e44be5](https://github.com/AztecProtocol/aztec-packages/commit/3e44be538e5c7f0e7269c1e5c0820f7bc6e83734))
- Affine_element read/write with proper handling of point at infinity ([#6963](https://github.com/AztecProtocol/aztec-packages/issues/6963)) ([c6cbe39](https://github.com/AztecProtocol/aztec-packages/commit/c6cbe39eed23dc845aef898e937e99de43f71675))
- Avm e2e nested call + alu fix + cast fix ([#6974](https://github.com/AztecProtocol/aztec-packages/issues/6974)) ([b150b61](https://github.com/AztecProtocol/aztec-packages/commit/b150b610153e380a93240914c95887f88b56fa94))
- **avm-simulator:** Msm blackbox ([#7048](https://github.com/AztecProtocol/aztec-packages/issues/7048)) ([0ce27e0](https://github.com/AztecProtocol/aztec-packages/commit/0ce27e05c4c099167d0d98300f6d73ced22639ad))
- **avm:** Add get_contract_instance ([#6871](https://github.com/AztecProtocol/aztec-packages/issues/6871)) ([b3a86bf](https://github.com/AztecProtocol/aztec-packages/commit/b3a86bf72343d1060ce58a11f139e05ba2a75754))
- **avm:** Deserialise execution hints in bb main ([#6848](https://github.com/AztecProtocol/aztec-packages/issues/6848)) ([d3be85f](https://github.com/AztecProtocol/aztec-packages/commit/d3be85f57c34aa88e732ea115239f3bed1e7aa16))
- **avm:** E2e proving of storage ([#6967](https://github.com/AztecProtocol/aztec-packages/issues/6967)) ([6a7be0c](https://github.com/AztecProtocol/aztec-packages/commit/6a7be0c434934175bb6da1f3525c025b3f743824))
- **avm:** E2e send l1 msg ([#6880](https://github.com/AztecProtocol/aztec-packages/issues/6880)) ([deb972d](https://github.com/AztecProtocol/aztec-packages/commit/deb972d3f13a92d34a6f91074b072fb66d247f64))
- **avm:** Gas remaining range check and handling of out of gas ([#6944](https://github.com/AztecProtocol/aztec-packages/issues/6944)) ([5647571](https://github.com/AztecProtocol/aztec-packages/commit/56475716e05973e6b493de427f32eee71c0f8f6a)), closes [#6902](https://github.com/AztecProtocol/aztec-packages/issues/6902)
- **avm:** Get contract instance now works e2e with avm proving ([#6911](https://github.com/AztecProtocol/aztec-packages/issues/6911)) ([662187d](https://github.com/AztecProtocol/aztec-packages/commit/662187d1d6960b734a71aaf365e7f20d471dc4c9))
- **avm:** Indirect support for kernel output opcodes ([#6962](https://github.com/AztecProtocol/aztec-packages/issues/6962)) ([f330bff](https://github.com/AztecProtocol/aztec-packages/commit/f330bffa80b6da5f037cea3cf469ef1c7b6d9d03))
- **avm:** Indirect support for kernel read opcodes ([#6940](https://github.com/AztecProtocol/aztec-packages/issues/6940)) ([ccc474d](https://github.com/AztecProtocol/aztec-packages/commit/ccc474d9d0cd10faf857bc1ec6571dc25306a531))
- **avm:** L2gasleft and dagasleft opcodes ([#6884](https://github.com/AztecProtocol/aztec-packages/issues/6884)) ([fbab612](https://github.com/AztecProtocol/aztec-packages/commit/fbab612b17dfe0e95ead1a592b7bc9fe6ca5415d))
- **avm:** Nullifier non exist ([#6877](https://github.com/AztecProtocol/aztec-packages/issues/6877)) ([05697f2](https://github.com/AztecProtocol/aztec-packages/commit/05697f289d3b97def74f45cd839a58a8a077c3fa))
- **avm:** Plumb externalcall hints ([#6890](https://github.com/AztecProtocol/aztec-packages/issues/6890)) ([3a97f08](https://github.com/AztecProtocol/aztec-packages/commit/3a97f08c457472bd701200adfa45d61554fd3867))
- **avm:** Plumb start side effect counter in circuit ([#7007](https://github.com/AztecProtocol/aztec-packages/issues/7007)) ([fa8f12f](https://github.com/AztecProtocol/aztec-packages/commit/fa8f12f93a8d94604a4382de444501fac310dbb8))
- **avm:** Revert opcode ([#6909](https://github.com/AztecProtocol/aztec-packages/issues/6909)) ([620d3da](https://github.com/AztecProtocol/aztec-packages/commit/620d3dacc853c71e808ef58001eb4c8584fa59d9))
- **avm:** Use hints in gas accounting (circuit) ([#6895](https://github.com/AztecProtocol/aztec-packages/issues/6895)) ([c3746f5](https://github.com/AztecProtocol/aztec-packages/commit/c3746f5d6ae38bc448d00834d91a7ddd7b901e64))
- **bb:** Stack traces for check_circuit ([#6851](https://github.com/AztecProtocol/aztec-packages/issues/6851)) ([eb35e62](https://github.com/AztecProtocol/aztec-packages/commit/eb35e627445c72ee07fafb3652076349302e7fa1))
- Contract storage reads serialize with side effect counter ([#6961](https://github.com/AztecProtocol/aztec-packages/issues/6961)) ([db49ed5](https://github.com/AztecProtocol/aztec-packages/commit/db49ed57d1d4165ce47e6af01b6fd67239121aa4))
- Ecadd op code ([#6906](https://github.com/AztecProtocol/aztec-packages/issues/6906)) ([03a9064](https://github.com/AztecProtocol/aztec-packages/commit/03a9064b308fbf5541f4f763e1ad1e05f60e1fff))
- Flows and tests for the tube component ([#6934](https://github.com/AztecProtocol/aztec-packages/issues/6934)) ([4b45438](https://github.com/AztecProtocol/aztec-packages/commit/4b454386a35f4b0cd4c6a9b8003c55e55e50b592))
- Place return value witnesses directly after function arguments (https://github.com/noir-lang/noir/pull/5142) ([a44b8c8](https://github.com/AztecProtocol/aztec-packages/commit/a44b8c81458eb789e54624e020b6c93d0e9963cc))
- Separate runtimes of SSA functions before inlining (https://github.com/noir-lang/noir/pull/5121) ([a44b8c8](https://github.com/AztecProtocol/aztec-packages/commit/a44b8c81458eb789e54624e020b6c93d0e9963cc))
- SMT Standard Circuit separation ([#6904](https://github.com/AztecProtocol/aztec-packages/issues/6904)) ([f970732](https://github.com/AztecProtocol/aztec-packages/commit/f9707321bdd107e3c7116cafd89fd570224e89ef))
- SMT Verification Module Update ([#6849](https://github.com/AztecProtocol/aztec-packages/issues/6849)) ([6c98529](https://github.com/AztecProtocol/aztec-packages/commit/6c985299d796b8c711794395518c3b3a0f41e775))
- SMT Verifier for Ultra Arithmetization ([#7067](https://github.com/AztecProtocol/aztec-packages/issues/7067)) ([6692ac8](https://github.com/AztecProtocol/aztec-packages/commit/6692ac831ab980d9623442236c21b499a7238966))
- Standard form for cycle_group ([#6915](https://github.com/AztecProtocol/aztec-packages/issues/6915)) ([e6cba16](https://github.com/AztecProtocol/aztec-packages/commit/e6cba16ef82428b115d527eabe237122e269aa32))
- Support disabling aztec vm in non-wasm builds ([#6965](https://github.com/AztecProtocol/aztec-packages/issues/6965)) ([f7a46c0](https://github.com/AztecProtocol/aztec-packages/commit/f7a46c0d8de2e58b7e76576a76eb85f52b266966))

### Bug Fixes

- ALU pil relation TWO_LINE_OP_NO_OVERLAP ([#6968](https://github.com/AztecProtocol/aztec-packages/issues/6968)) ([4ba553b](https://github.com/AztecProtocol/aztec-packages/commit/4ba553ba3170838de3b6c4cf47b609b0198443d0))
- **avm:** Bugfix related to pc increment in calldatacopy of avm circuit ([#6891](https://github.com/AztecProtocol/aztec-packages/issues/6891)) ([5fe59d2](https://github.com/AztecProtocol/aztec-packages/commit/5fe59d2ed96a5b966efc9e3619c87b4a23c502f4))
- **avm:** Correctly generate public inputs in verifier ([#7018](https://github.com/AztecProtocol/aztec-packages/issues/7018)) ([4c4c17f](https://github.com/AztecProtocol/aztec-packages/commit/4c4c17f804b8735dc017bbae171117ca15df25cc))
- Biggroup batch mul handles collisions ([#6780](https://github.com/AztecProtocol/aztec-packages/issues/6780)) ([e61c40e](https://github.com/AztecProtocol/aztec-packages/commit/e61c40e9c3e71f50c2d6a6c8a1688b6a8ddd4ba8))
- Bugfix for Keccak opcode related to reading bytes from input ([#6989](https://github.com/AztecProtocol/aztec-packages/issues/6989)) ([5713f4e](https://github.com/AztecProtocol/aztec-packages/commit/5713f4e25ef8bf09cb91632bd210cd46bb7a77c3))
- Dirty merge 6880 ([#6905](https://github.com/AztecProtocol/aztec-packages/issues/6905)) ([fc6ec3f](https://github.com/AztecProtocol/aztec-packages/commit/fc6ec3fc7371b2506e7409a7d24ce37f25803fac))
- **experimental elaborator:** Clear generics after elaborating type aliases (https://github.com/noir-lang/noir/pull/5136) ([a44b8c8](https://github.com/AztecProtocol/aztec-packages/commit/a44b8c81458eb789e54624e020b6c93d0e9963cc))
- **experimental elaborator:** Fix `impl Trait` when `--use-elaborator` is selected (https://github.com/noir-lang/noir/pull/5138) ([a44b8c8](https://github.com/AztecProtocol/aztec-packages/commit/a44b8c81458eb789e54624e020b6c93d0e9963cc))
- **experimental elaborator:** Fix definition kind of globals and tuple patterns with `--use-elaborator` flag (https://github.com/noir-lang/noir/pull/5139) ([a44b8c8](https://github.com/AztecProtocol/aztec-packages/commit/a44b8c81458eb789e54624e020b6c93d0e9963cc))
- **experimental elaborator:** Fix frontend tests when `--use-elaborator` flag is specified (https://github.com/noir-lang/noir/pull/5145) ([a44b8c8](https://github.com/AztecProtocol/aztec-packages/commit/a44b8c81458eb789e54624e020b6c93d0e9963cc))
- **experimental elaborator:** Fix global values used in the elaborator (https://github.com/noir-lang/noir/pull/5135) ([a44b8c8](https://github.com/AztecProtocol/aztec-packages/commit/a44b8c81458eb789e54624e020b6c93d0e9963cc))
- Fix avm unit test with proving by passing the public_inputs ([#7062](https://github.com/AztecProtocol/aztec-packages/issues/7062)) ([2d7c097](https://github.com/AztecProtocol/aztec-packages/commit/2d7c097d7a6606101354736d69bd0bbbe6f005bf))
- Fix client ivc incorrect srs size issue and parallelise srs generation for grumpkin ([#6913](https://github.com/AztecProtocol/aztec-packages/issues/6913)) ([f015736](https://github.com/AztecProtocol/aztec-packages/commit/f01573641728d6cc62da36189a22fa813713fd82))
- Fix for the flaky issue (I hope) ([#6923](https://github.com/AztecProtocol/aztec-packages/issues/6923)) ([39747b9](https://github.com/AztecProtocol/aztec-packages/commit/39747b933a13aa08f25c5074207f9d92489d5e3d))
- Fixing 0 naf ([#6950](https://github.com/AztecProtocol/aztec-packages/issues/6950)) ([d35ee2e](https://github.com/AztecProtocol/aztec-packages/commit/d35ee2ed87967a5161ef52d892856900a55de0b9))
- **frontend:** Resolve object types from method calls a single time (https://github.com/noir-lang/noir/pull/5131) ([a44b8c8](https://github.com/AztecProtocol/aztec-packages/commit/a44b8c81458eb789e54624e020b6c93d0e9963cc))
- Initialize side_effect_counter based on the initial value passed to builder ([#7017](https://github.com/AztecProtocol/aztec-packages/issues/7017)) ([46d166b](https://github.com/AztecProtocol/aztec-packages/commit/46d166b0f1d16d801e056d3195546970cddda1a8))
- Stop squashing storage accesses in avm simulator - all need to be validated in kernel ([#7036](https://github.com/AztecProtocol/aztec-packages/issues/7036)) ([6ffc4b4](https://github.com/AztecProtocol/aztec-packages/commit/6ffc4b4455a0613c933de0ec7528774186f53bee))
- Use predicate for curve operations (https://github.com/noir-lang/noir/pull/5076) ([a44b8c8](https://github.com/AztecProtocol/aztec-packages/commit/a44b8c81458eb789e54624e020b6c93d0e9963cc))
- Wrapping in signed division (https://github.com/noir-lang/noir/pull/5134) ([a44b8c8](https://github.com/AztecProtocol/aztec-packages/commit/a44b8c81458eb789e54624e020b6c93d0e9963cc))

### Miscellaneous

- Add negative tests for cast and U128 multiplication related to TWO_LINE_OP_NO_OVERLAP ([#7041](https://github.com/AztecProtocol/aztec-packages/issues/7041)) ([7f14ca1](https://github.com/AztecProtocol/aztec-packages/commit/7f14ca122032a56eb322e34ee0290845e75a925a)), closes [#6969](https://github.com/AztecProtocol/aztec-packages/issues/6969)
- **avm:** Add debugging info and trace dump ([#6979](https://github.com/AztecProtocol/aztec-packages/issues/6979)) ([e11f880](https://github.com/AztecProtocol/aztec-packages/commit/e11f88004e2c31cb2b2ae376095513e94584a4dc))
- **avm:** Fix proving for kernel tests ([#7033](https://github.com/AztecProtocol/aztec-packages/issues/7033)) ([f5e1106](https://github.com/AztecProtocol/aztec-packages/commit/f5e1106bcaa9558ac0a953de06d4fafd09fb1fe8))
- **avm:** Gas alignments with simulator ([#6873](https://github.com/AztecProtocol/aztec-packages/issues/6873)) ([54339d4](https://github.com/AztecProtocol/aztec-packages/commit/54339d48861a91429e996177713f46952ffbd808)), closes [#6860](https://github.com/AztecProtocol/aztec-packages/issues/6860)
- **avm:** Modify unit test to have a calldatacopy over 4 elements ([#6893](https://github.com/AztecProtocol/aztec-packages/issues/6893)) ([9f5b113](https://github.com/AztecProtocol/aztec-packages/commit/9f5b11345dc5dd055442eaf7673227fe7cbaf262))
- Bb repo warning ([#7023](https://github.com/AztecProtocol/aztec-packages/issues/7023)) ([c3d7053](https://github.com/AztecProtocol/aztec-packages/commit/c3d70537c5558ba451a43e403bab067940aa48b6))
- **bb:** Hide `debug()` logs under `--debug` flag ([#7008](https://github.com/AztecProtocol/aztec-packages/issues/7008)) ([a8c3c3f](https://github.com/AztecProtocol/aztec-packages/commit/a8c3c3fcf35b7c464006c481230afcb11b9952dc))
- **ci:** Don't raise MSRV issue if workflow cancelled (https://github.com/noir-lang/noir/pull/5143) ([a44b8c8](https://github.com/AztecProtocol/aztec-packages/commit/a44b8c81458eb789e54624e020b6c93d0e9963cc))
- Default to using bn254 in `noirc_frontend` (https://github.com/noir-lang/noir/pull/5144) ([a44b8c8](https://github.com/AztecProtocol/aztec-packages/commit/a44b8c81458eb789e54624e020b6c93d0e9963cc))
- Fix issue [#6929](https://github.com/AztecProtocol/aztec-packages/issues/6929) (off-by-one error in `UltraCircuitBuilder::create_range_constraint`) ([#6931](https://github.com/AztecProtocol/aztec-packages/issues/6931)) ([16deef6](https://github.com/AztecProtocol/aztec-packages/commit/16deef6a83a9fe41e1f865e79e17c2f671604bb0))
- Lookups cleanup/documentation ([#7002](https://github.com/AztecProtocol/aztec-packages/issues/7002)) ([92b1349](https://github.com/AztecProtocol/aztec-packages/commit/92b1349ba671e87e948bf9248c5133accde9091f))
- Opcodes l2gasleft and dagasleft return value with tag ff ([#6896](https://github.com/AztecProtocol/aztec-packages/issues/6896)) ([5890845](https://github.com/AztecProtocol/aztec-packages/commit/5890845e8f9b278b2a5c5c930eb28ec0aba74ebc))
- Remove hir to ast pass (https://github.com/noir-lang/noir/pull/5147) ([a44b8c8](https://github.com/AztecProtocol/aztec-packages/commit/a44b8c81458eb789e54624e020b6c93d0e9963cc))
- Remove unused `new_variables` argument from `resolve_type_inner` (https://github.com/noir-lang/noir/pull/5148) ([a44b8c8](https://github.com/AztecProtocol/aztec-packages/commit/a44b8c81458eb789e54624e020b6c93d0e9963cc))
- Run all test programs in brillig as well as ACIR (https://github.com/noir-lang/noir/pull/5128) ([a44b8c8](https://github.com/AztecProtocol/aztec-packages/commit/a44b8c81458eb789e54624e020b6c93d0e9963cc))
- Small fixes for the tube flows ([#7014](https://github.com/AztecProtocol/aztec-packages/issues/7014)) ([838ceed](https://github.com/AztecProtocol/aztec-packages/commit/838ceed3b6ccf1bb7d89552a147db92c3514f0c1))

### Documentation

- **avm:** Comments in pil file related to range checks of addresses ([#6837](https://github.com/AztecProtocol/aztec-packages/issues/6837)) ([66f1c87](https://github.com/AztecProtocol/aztec-packages/commit/66f1c876578b05838698377f2ede12b52671e4ca))

## [0.42.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.41.0...barretenberg-v0.42.0) (2024-06-04)

### ⚠ BREAKING CHANGES

- integrate AVM proving ([#6775](https://github.com/AztecProtocol/aztec-packages/issues/6775))

### Features

- ACIR integration tests in Bb ([#6607](https://github.com/AztecProtocol/aztec-packages/issues/6607)) ([ca89670](https://github.com/AztecProtocol/aztec-packages/commit/ca896707dd5c3da077fa8797e348aad7a6f05637))
- Add code-workspace and update build dirs ([#6723](https://github.com/AztecProtocol/aztec-packages/issues/6723)) ([c373d15](https://github.com/AztecProtocol/aztec-packages/commit/c373d15fc49f8f4c91c5f6a4ef424b268f8e2e44))
- Add goblin recursive verifier to ClientIVC recursive verifier ([#6811](https://github.com/AztecProtocol/aztec-packages/issues/6811)) ([bd795c7](https://github.com/AztecProtocol/aztec-packages/commit/bd795c70874662674ebc580c1496d3ccec93e93a))
- **avm executor:** Kernel outputs & execution hints in executor ([#6769](https://github.com/AztecProtocol/aztec-packages/issues/6769)) ([6ab7360](https://github.com/AztecProtocol/aztec-packages/commit/6ab73606d3424aa5f286a63e5a91d57963132126))
- Avm unconstrained external call ([#6846](https://github.com/AztecProtocol/aztec-packages/issues/6846)) ([5a65ffc](https://github.com/AztecProtocol/aztec-packages/commit/5a65ffca0d7514a609fae71ecff4744027a4ff51))
- **avm:** Add storage address kernel opcode ([#6863](https://github.com/AztecProtocol/aztec-packages/issues/6863)) ([19aba3e](https://github.com/AztecProtocol/aztec-packages/commit/19aba3e10391b0031e1dedd47eb556ef44a95282))
- **avm:** Add temporary sha256 execution ([#6604](https://github.com/AztecProtocol/aztec-packages/issues/6604)) ([34088b4](https://github.com/AztecProtocol/aztec-packages/commit/34088b48acdfc40df3144509a3effd348167ee58))
- **avm:** Avm keccak permutation ([#6596](https://github.com/AztecProtocol/aztec-packages/issues/6596)) ([c0917e4](https://github.com/AztecProtocol/aztec-packages/commit/c0917e4a4febe895d911e0bfff7ddd2a4d965fc6))
- **avm:** Handle debuglog ([#6630](https://github.com/AztecProtocol/aztec-packages/issues/6630)) ([eba345b](https://github.com/AztecProtocol/aztec-packages/commit/eba345ba253fc5ff7a6a2cd5bc7ec4f69ada8b56))
- **avm:** In vm static gas accounting ([#6542](https://github.com/AztecProtocol/aztec-packages/issues/6542)) ([6b88ae0](https://github.com/AztecProtocol/aztec-packages/commit/6b88ae0a4b8aa1b738f930a8af564ac43be76f5b))
- **avm:** Internal call stack dedicated memory ([#6503](https://github.com/AztecProtocol/aztec-packages/issues/6503)) ([d3c3d4a](https://github.com/AztecProtocol/aztec-packages/commit/d3c3d4a565568329ca55f24e7f5e8d3e293e1366)), closes [#6245](https://github.com/AztecProtocol/aztec-packages/issues/6245)
- **avm:** JUMPI opcode in AVM circuit ([#6800](https://github.com/AztecProtocol/aztec-packages/issues/6800)) ([64d4ba9](https://github.com/AztecProtocol/aztec-packages/commit/64d4ba9e57dabf7786dfb6369afbe17545a0bc2b)), closes [#6795](https://github.com/AztecProtocol/aztec-packages/issues/6795)
- **avm:** Kernel output opcodes ([#6416](https://github.com/AztecProtocol/aztec-packages/issues/6416)) ([0281b8f](https://github.com/AztecProtocol/aztec-packages/commit/0281b8f91f3e8178b9f3c2413d8833c5129fb5c4))
- **avm:** Pedersen ops ([#6765](https://github.com/AztecProtocol/aztec-packages/issues/6765)) ([7b3a72c](https://github.com/AztecProtocol/aztec-packages/commit/7b3a72c8c9fcf8e2dabbf6d0bee658188450bbe4))
- **avm:** Plumb execution hints from TS to AVM prover ([#6806](https://github.com/AztecProtocol/aztec-packages/issues/6806)) ([f3234f1](https://github.com/AztecProtocol/aztec-packages/commit/f3234f1bf037b68237bd6a8b2bce8b016bb170d0))
- **avm:** Poseidon2 gadget ([#6504](https://github.com/AztecProtocol/aztec-packages/issues/6504)) ([9e8cba1](https://github.com/AztecProtocol/aztec-packages/commit/9e8cba1f585834f2960cd821c0fbde3c893c6daf))
- **avm:** Sha256_compression ([#6452](https://github.com/AztecProtocol/aztec-packages/issues/6452)) ([5596bb3](https://github.com/AztecProtocol/aztec-packages/commit/5596bb3a19fce545b6276231d938464948f08f79))
- Bench uploading ([#5787](https://github.com/AztecProtocol/aztec-packages/issues/5787)) ([bd64ceb](https://github.com/AztecProtocol/aztec-packages/commit/bd64cebcbb2d66a328cce2aebf9ea5b8fb1f8793))
- Biggroup handles points at infinity ([#6391](https://github.com/AztecProtocol/aztec-packages/issues/6391)) ([bd72db5](https://github.com/AztecProtocol/aztec-packages/commit/bd72db5c02245b758b34f867734af4c19045fe33))
- Changing finite field arithmetic in wasm to 29 bits for multiplications (second try, disabled AVM build in wasm) ([#6027](https://github.com/AztecProtocol/aztec-packages/issues/6027)) ([c3fa366](https://github.com/AztecProtocol/aztec-packages/commit/c3fa36616e398603d8ec995fc50488d72099e007))
- ClientIvc recursive verifier ([#6721](https://github.com/AztecProtocol/aztec-packages/issues/6721)) ([ceec7e2](https://github.com/AztecProtocol/aztec-packages/commit/ceec7e2c4e56f16cd5e6c2eb70804656f7d606f1))
- Complete ECCVM recursive verifier ([#6720](https://github.com/AztecProtocol/aztec-packages/issues/6720)) ([a98d30b](https://github.com/AztecProtocol/aztec-packages/commit/a98d30b9c678b87c17cba21653fc5107705be45a))
- Cycle scalar &lt;&gt; bigfield interactions ([#6744](https://github.com/AztecProtocol/aztec-packages/issues/6744)) ([6e363ec](https://github.com/AztecProtocol/aztec-packages/commit/6e363ec51164af8118d8676cdf153a3699909314))
- Enable honk_recursion through acir ([#6719](https://github.com/AztecProtocol/aztec-packages/issues/6719)) ([7ce4cbe](https://github.com/AztecProtocol/aztec-packages/commit/7ce4cbef78ac0da590fbbad184219038ffa5afd9))
- Fold acir programs ([#6563](https://github.com/AztecProtocol/aztec-packages/issues/6563)) ([f7d6541](https://github.com/AztecProtocol/aztec-packages/commit/f7d65416c741790ce5b5cda8cba08d869a659670))
- Folding acir programs ([#6685](https://github.com/AztecProtocol/aztec-packages/issues/6685)) ([8d1788d](https://github.com/AztecProtocol/aztec-packages/commit/8d1788de43c41929ce131c3dbd4687ce555e48bc))
- Goblin Recursive Verifier ([#6778](https://github.com/AztecProtocol/aztec-packages/issues/6778)) ([53d0d55](https://github.com/AztecProtocol/aztec-packages/commit/53d0d55594cc4a71894394455308472f90b434be))
- Increasing MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL, removing hack ([#6739](https://github.com/AztecProtocol/aztec-packages/issues/6739)) ([d5550c6](https://github.com/AztecProtocol/aztec-packages/commit/d5550c66f601ca9e7a6f3ffe3d552b0ce309f293))
- Instantiate ECCVM relations on bigfield ([#6647](https://github.com/AztecProtocol/aztec-packages/issues/6647)) ([0ee6ef9](https://github.com/AztecProtocol/aztec-packages/commit/0ee6ef9abae584a5d137ba007c44bdfde0a01f8a))
- Integrate AVM proving ([#6775](https://github.com/AztecProtocol/aztec-packages/issues/6775)) ([f1512a2](https://github.com/AztecProtocol/aztec-packages/commit/f1512a21f48c724f1c0e373bef20f5b7fdd0bbf7))
- New test program for verifying honk ([#6781](https://github.com/AztecProtocol/aztec-packages/issues/6781)) ([1324d58](https://github.com/AztecProtocol/aztec-packages/commit/1324d5880e416586e47045d90efca55959773e18))
- Pow method for bigfield ([#6725](https://github.com/AztecProtocol/aztec-packages/issues/6725)) ([e4feb80](https://github.com/AztecProtocol/aztec-packages/commit/e4feb8027548cd0a7da56c68ad1af0a0be16bdc5))
- Prototype for using the databus with ACIR opcode ([#6366](https://github.com/AztecProtocol/aztec-packages/issues/6366)) ([9f746d9](https://github.com/AztecProtocol/aztec-packages/commit/9f746d9f0cd24cecdb86c0fb9af555bc2d1f0bf6))
- Representation of a grumpkin verifier commitment key inside a bn254 circuit ([#6593](https://github.com/AztecProtocol/aztec-packages/issues/6593)) ([1d84975](https://github.com/AztecProtocol/aztec-packages/commit/1d84975d1093e601b4c9ad9d68855b39898ef79a))
- Sumcheck part of ECCVM recursive verifier instantiated as an UltraCircuit ([#6413](https://github.com/AztecProtocol/aztec-packages/issues/6413)) ([afe84a2](https://github.com/AztecProtocol/aztec-packages/commit/afe84a201cb8462c0e9f538b4518085f68bbdab5))
- Support AVM in bb-prover-exec ([#6666](https://github.com/AztecProtocol/aztec-packages/issues/6666)) ([a64a921](https://github.com/AztecProtocol/aztec-packages/commit/a64a921f227451e9a0e1d00569a69a281ff0a8c7))
- Update honk recursion constraint ([#6545](https://github.com/AztecProtocol/aztec-packages/issues/6545)) ([6f86352](https://github.com/AztecProtocol/aztec-packages/commit/6f86352fafa7d22f9b0f64ec67199efe6346d82f))

### Bug Fixes

- Add cbind declarations for new methods to fix autogen ([#6622](https://github.com/AztecProtocol/aztec-packages/issues/6622)) ([2429cd8](https://github.com/AztecProtocol/aztec-packages/commit/2429cd87a980eca62d2ff4543e6887f5ee9dd600))
- Add missing initializers ([#6591](https://github.com/AztecProtocol/aztec-packages/issues/6591)) ([a575708](https://github.com/AztecProtocol/aztec-packages/commit/a575708cecc47a73bce82b67b3964e21bce77cdf))
- Disable redundant failing acir tests ([#6700](https://github.com/AztecProtocol/aztec-packages/issues/6700)) ([00eed94](https://github.com/AztecProtocol/aztec-packages/commit/00eed9458bdca47d4c4f3f69bba4ed1d19913601))
- ECCVM correctly handles points at infinity and group operation edge cases ([#6388](https://github.com/AztecProtocol/aztec-packages/issues/6388)) ([a022220](https://github.com/AztecProtocol/aztec-packages/commit/a022220d1eaae3e8a0650899d4c05643c9bc9005))
- Refreshing constants ([#6786](https://github.com/AztecProtocol/aztec-packages/issues/6786)) ([49a3b1d](https://github.com/AztecProtocol/aztec-packages/commit/49a3b1de6274644a1e9e0e9f91f0f657665919c3))
- Remove finalize from acir create circuit ([#6585](https://github.com/AztecProtocol/aztec-packages/issues/6585)) ([f45d20d](https://github.com/AztecProtocol/aztec-packages/commit/f45d20d9340d40efadebcc13b27dd8f1c43f0540))
- Run more Bb CI ([#6812](https://github.com/AztecProtocol/aztec-packages/issues/6812)) ([67a8f8a](https://github.com/AztecProtocol/aztec-packages/commit/67a8f8a5e20e28aab2af82b8404a20af1e38906c))

### Miscellaneous

- Acir tests in bb ([#6620](https://github.com/AztecProtocol/aztec-packages/issues/6620)) ([a4e001e](https://github.com/AztecProtocol/aztec-packages/commit/a4e001e44562bd0b9cd1f3e5c213f051927b712e))
- Add bench programs ([#6566](https://github.com/AztecProtocol/aztec-packages/issues/6566)) ([edb6db6](https://github.com/AztecProtocol/aztec-packages/commit/edb6db67f6e2b2b369b5d279f1996c7216dc9c69))
- Add l1 to l2 msg read requests to public circuit public inputs ([#6762](https://github.com/AztecProtocol/aztec-packages/issues/6762)) ([69d90c4](https://github.com/AztecProtocol/aztec-packages/commit/69d90c409fc10020cd65e5078a3777545ecc1c85))
- Add simple `bb` installer script ([#6376](https://github.com/AztecProtocol/aztec-packages/issues/6376)) ([51bc682](https://github.com/AztecProtocol/aztec-packages/commit/51bc6823db025432b495b5b08a796942a87d1302))
- **avm:** AVM Minimial lookup table for testing ([#6641](https://github.com/AztecProtocol/aztec-packages/issues/6641)) ([79beef1](https://github.com/AztecProtocol/aztec-packages/commit/79beef1fdcd40bf0906275bd615441b05d7b9bae))
- **avm:** Better error msgs and some cpp nits ([#6796](https://github.com/AztecProtocol/aztec-packages/issues/6796)) ([f8a9452](https://github.com/AztecProtocol/aztec-packages/commit/f8a9452103c154062748e5ef3351c2cb8825c886))
- **avm:** Remove portal opcode from avm circuit ([#6706](https://github.com/AztecProtocol/aztec-packages/issues/6706)) ([a790d24](https://github.com/AztecProtocol/aztec-packages/commit/a790d248b1460ab7850ca17e3b5688d6fee83c7e))
- **bb:** -30% compile time ([#6610](https://github.com/AztecProtocol/aztec-packages/issues/6610)) ([d6838a1](https://github.com/AztecProtocol/aztec-packages/commit/d6838a1fa27f57ab4ab60c286b703314c1103ab5))
- **bb:** Better AVM disable in WASM ([#6683](https://github.com/AztecProtocol/aztec-packages/issues/6683)) ([d3cfc4c](https://github.com/AztecProtocol/aztec-packages/commit/d3cfc4cb5eae3a65a394af48c75c3ba271939baa))
- **bb:** Reduce and smooth compile time ([#6688](https://github.com/AztecProtocol/aztec-packages/issues/6688)) ([1253330](https://github.com/AztecProtocol/aztec-packages/commit/125333019df7bde50e4269cd5f05190507d49c17))
- **bb:** Small compile improvements ([#6665](https://github.com/AztecProtocol/aztec-packages/issues/6665)) ([61f27b7](https://github.com/AztecProtocol/aztec-packages/commit/61f27b793258764536892058ad9a80751837739c))
- **ci:** Ensure ad-hoc apt doesnt time out ([#6755](https://github.com/AztecProtocol/aztec-packages/issues/6755)) ([12921d4](https://github.com/AztecProtocol/aztec-packages/commit/12921d4ed3b7ba7ff8e5909cc5da762b76e7ecaf))
- Delete spike vm ([#6818](https://github.com/AztecProtocol/aztec-packages/issues/6818)) ([5633ee9](https://github.com/AztecProtocol/aztec-packages/commit/5633ee935f8255564526e72c9cbaf1f5f789e3a1))
- Evaluate expressions in constant gen ([#6813](https://github.com/AztecProtocol/aztec-packages/issues/6813)) ([c2a50f4](https://github.com/AztecProtocol/aztec-packages/commit/c2a50f4d83c7816d589ef08aad71929b612c0f84))
- Fix compilation error due to missing import ([#6815](https://github.com/AztecProtocol/aztec-packages/issues/6815)) ([98ba899](https://github.com/AztecProtocol/aztec-packages/commit/98ba89950ceed41a09758a2b4d0dbc4d995f3793))
- Goblin cleanup ([#6722](https://github.com/AztecProtocol/aztec-packages/issues/6722)) ([8e9ab3d](https://github.com/AztecProtocol/aztec-packages/commit/8e9ab3d84cc9430352512da13089afc43a212566))
- Reduce compilation by breaking up acir types.hpp ([#6816](https://github.com/AztecProtocol/aztec-packages/issues/6816)) ([d9f7da3](https://github.com/AztecProtocol/aztec-packages/commit/d9f7da39b02c41641fbf15a13882f39905b7a583))
- Remove acir goblin flow ([#6724](https://github.com/AztecProtocol/aztec-packages/issues/6724)) ([f035231](https://github.com/AztecProtocol/aztec-packages/commit/f035231ca5cde4592be599a2e7b4ce706cdee27d))
- Stop building/publishing `acvm_backend.wasm` ([#6584](https://github.com/AztecProtocol/aztec-packages/issues/6584)) ([7a3a491](https://github.com/AztecProtocol/aztec-packages/commit/7a3a491c85092e0a6cd21948e0fe4e9c736be27a))
- Tool to analyze C++ compilation time ([#6823](https://github.com/AztecProtocol/aztec-packages/issues/6823)) ([101e966](https://github.com/AztecProtocol/aztec-packages/commit/101e9664f290ee601f2a8587ddf931d2e27e1d0f))
- Ultra goblin --&gt; mega ([#6674](https://github.com/AztecProtocol/aztec-packages/issues/6674)) ([d272abd](https://github.com/AztecProtocol/aztec-packages/commit/d272abd1b332aae8d062b2340afd5cabf61e31d9))

## [0.41.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.40.1...barretenberg-v0.41.0) (2024-05-21)

### ⚠ BREAKING CHANGES

- add is_infinite to curve addition opcode ([#6384](https://github.com/AztecProtocol/aztec-packages/issues/6384))

### Features

- Add is_infinite to curve addition opcode ([#6384](https://github.com/AztecProtocol/aztec-packages/issues/6384)) ([75d81c5](https://github.com/AztecProtocol/aztec-packages/commit/75d81c5fccf52d270239261bab79dd1fde41c19a))
- **avm-simulator:** Cap gas for external calls ([#6479](https://github.com/AztecProtocol/aztec-packages/issues/6479)) ([c8771ba](https://github.com/AztecProtocol/aztec-packages/commit/c8771ba7c75fc2395ed0b12a117a2d3eb5ab6983))
- **avm:** Gzip avm bytecode ([#6475](https://github.com/AztecProtocol/aztec-packages/issues/6475)) ([29559bd](https://github.com/AztecProtocol/aztec-packages/commit/29559bd3ef28d7f208ebd7052fd85a8a4cd23436))
- **avm:** To_radix gadget ([#6368](https://github.com/AztecProtocol/aztec-packages/issues/6368)) ([89dd25f](https://github.com/AztecProtocol/aztec-packages/commit/89dd25f2b25f720def6cac003ce204e92de66c47))
- Full encryption and decryption of log in ts ([#6348](https://github.com/AztecProtocol/aztec-packages/issues/6348)) ([0ac83dc](https://github.com/AztecProtocol/aztec-packages/commit/0ac83dc8e65b87652a4bc3f4f931bfc23c7f41aa))
- Improved ClientIvc ([#6429](https://github.com/AztecProtocol/aztec-packages/issues/6429)) ([f360b3f](https://github.com/AztecProtocol/aztec-packages/commit/f360b3fd30b9dd1e80e5f1a3d42c325c0f54f8ed))
- Laying out a new recursion constraint for honk ([#6489](https://github.com/AztecProtocol/aztec-packages/issues/6489)) ([af9fea4](https://github.com/AztecProtocol/aztec-packages/commit/af9fea4bbafe1a41b09d9351a34a896db2c8ab7d))
- Remove total logs len from pre tail kernels + add to L1 ([#6466](https://github.com/AztecProtocol/aztec-packages/issues/6466)) ([66a2d43](https://github.com/AztecProtocol/aztec-packages/commit/66a2d43432607ec43eaac5b0ee7ac69f44d18d92))
- Run benchmarks for ACIR proving ([#6155](https://github.com/AztecProtocol/aztec-packages/issues/6155)) ([ebf6fc2](https://github.com/AztecProtocol/aztec-packages/commit/ebf6fc2313c82b97d9ccd8c36caee42fb7a1c901))
- Squash transient note logs ([#6268](https://github.com/AztecProtocol/aztec-packages/issues/6268)) ([4574877](https://github.com/AztecProtocol/aztec-packages/commit/457487795c6bce1db336b2ba80060ad016dd1265))
- Sum transaction fees and pay on l1 ([#6522](https://github.com/AztecProtocol/aztec-packages/issues/6522)) ([bf441da](https://github.com/AztecProtocol/aztec-packages/commit/bf441da243405744caa9d5422e1b8a2676efba8b))
- Translator recursive verifier ([#6327](https://github.com/AztecProtocol/aztec-packages/issues/6327)) ([9321aef](https://github.com/AztecProtocol/aztec-packages/commit/9321aef1a49eb33ea388838ba7b0c00dddd9c898))
- View functions with static context enforcing ([#6338](https://github.com/AztecProtocol/aztec-packages/issues/6338)) ([22ad5a5](https://github.com/AztecProtocol/aztec-packages/commit/22ad5a5728afce5dcf32c8e6d8025691081e0de1))
- Vk_as_fields, proof_as_fields flows for honk ([#6406](https://github.com/AztecProtocol/aztec-packages/issues/6406)) ([a6100ad](https://github.com/AztecProtocol/aztec-packages/commit/a6100ad3d5126321d457b5c336ab4a3521ff1fb2))

### Bug Fixes

- Disable buggy ClientIVC tests ([#6546](https://github.com/AztecProtocol/aztec-packages/issues/6546)) ([b61dea3](https://github.com/AztecProtocol/aztec-packages/commit/b61dea36947a203457b6f9fe0943f3d28e8aab01))
- Increase N_max in Zeromorph ([#6415](https://github.com/AztecProtocol/aztec-packages/issues/6415)) ([9e643b4](https://github.com/AztecProtocol/aztec-packages/commit/9e643b429b22a1b8905ede07ab2e9561f42a1a89))

### Miscellaneous

- Add c++ tests for generator derivation ([#6528](https://github.com/AztecProtocol/aztec-packages/issues/6528)) ([72931bd](https://github.com/AztecProtocol/aztec-packages/commit/72931bdb8202c34042cdfb8cee2ef44b75939879))
- Bump maximum nullifier read requests (necessary for e2e tests in AVM) ([#6462](https://github.com/AztecProtocol/aztec-packages/issues/6462)) ([26eac62](https://github.com/AztecProtocol/aztec-packages/commit/26eac620b22e3e4b19491884fe46ea3950ff5802))
- Bump maximum nullifier read requests (necessary for e2e tests in AVM) ([#6495](https://github.com/AztecProtocol/aztec-packages/issues/6495)) ([90d8092](https://github.com/AztecProtocol/aztec-packages/commit/90d80926cb6f8f7ae3c5f791e0386f4f313c7d90))
- Copy subset of constants to cpp ([#6544](https://github.com/AztecProtocol/aztec-packages/issues/6544)) ([21dc72a](https://github.com/AztecProtocol/aztec-packages/commit/21dc72aaf29ada2c1a12682d3763370c76eff524))
- Lower max public bytecode to 20k ([#6477](https://github.com/AztecProtocol/aztec-packages/issues/6477)) ([ce192f0](https://github.com/AztecProtocol/aztec-packages/commit/ce192f0804d1d00ecf800198a4a5fda5a364a502))
- Parameterise cycle_group by `Builder` rather than `Composer` ([#6565](https://github.com/AztecProtocol/aztec-packages/issues/6565)) ([ea36bf9](https://github.com/AztecProtocol/aztec-packages/commit/ea36bf9bbd5e22ba4c566b08a4c8410e46175c70))
- Private call validation ([#6510](https://github.com/AztecProtocol/aztec-packages/issues/6510)) ([07dc072](https://github.com/AztecProtocol/aztec-packages/commit/07dc0726501bc78d691e1d2360dda84d1a93b9c5))
- Share decider with ultra_prover ([#5467](https://github.com/AztecProtocol/aztec-packages/issues/5467)) ([b3b7376](https://github.com/AztecProtocol/aztec-packages/commit/b3b7376161f353a273bf26d42e435667b41cc5e2))

### Documentation

- Sumcheck documentation ([#5841](https://github.com/AztecProtocol/aztec-packages/issues/5841)) ([116eef0](https://github.com/AztecProtocol/aztec-packages/commit/116eef06be3991fa03482425780715e6f78791ea))

## [0.40.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.40.0...barretenberg-v0.40.1) (2024-05-14)

### Miscellaneous

- **barretenberg:** Synchronize aztec-packages versions

## [0.40.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.39.0...barretenberg-v0.40.0) (2024-05-14)

### ⚠ BREAKING CHANGES

- debug logs for all ([#6392](https://github.com/AztecProtocol/aztec-packages/issues/6392))

### Features

- Debug logs for all ([#6392](https://github.com/AztecProtocol/aztec-packages/issues/6392)) ([10afa13](https://github.com/AztecProtocol/aztec-packages/commit/10afa13dfc85b02ace4c38e1fb347539d8041c21))

### Miscellaneous

- Add more serialisation traits to protocol circuits ([#6385](https://github.com/AztecProtocol/aztec-packages/issues/6385)) ([97d5422](https://github.com/AztecProtocol/aztec-packages/commit/97d54220791a6069ffde0c53ca0f304e1624ae4e))

## [0.39.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.38.0...barretenberg-v0.39.0) (2024-05-14)

### ⚠ BREAKING CHANGES

- switch `bb` over to read ACIR from nargo artifacts ([#6283](https://github.com/AztecProtocol/aztec-packages/issues/6283))
- specify databus arrays for BB ([#6239](https://github.com/AztecProtocol/aztec-packages/issues/6239))

### Features

- Avm support for public input columns ([#5700](https://github.com/AztecProtocol/aztec-packages/issues/5700)) ([8cf9168](https://github.com/AztecProtocol/aztec-packages/commit/8cf9168c61d8f2bdee5cc29763df6c888422a0bc))
- **avm-simulator:** Add to_radix_le instruction ([#6308](https://github.com/AztecProtocol/aztec-packages/issues/6308)) ([6374a32](https://github.com/AztecProtocol/aztec-packages/commit/6374a328859eefed0346a3c12b3500dd960e0884))
- Div opcode ([#6053](https://github.com/AztecProtocol/aztec-packages/issues/6053)) ([8e111f8](https://github.com/AztecProtocol/aztec-packages/commit/8e111f8bab5a0348fe8c7185f89e979541f91a67))
- Move to_radix to a blackbox ([#6294](https://github.com/AztecProtocol/aztec-packages/issues/6294)) ([ac27376](https://github.com/AztecProtocol/aztec-packages/commit/ac27376b9a0cdf0624a02d36c64ec25886b44b4a))
- Small translator optimisations ([#6354](https://github.com/AztecProtocol/aztec-packages/issues/6354)) ([ba6c42e](https://github.com/AztecProtocol/aztec-packages/commit/ba6c42e24bbb0b3876699c979b36638b15560764))
- Specify databus arrays for BB ([#6239](https://github.com/AztecProtocol/aztec-packages/issues/6239)) ([01d9f24](https://github.com/AztecProtocol/aztec-packages/commit/01d9f24d2f089f7ce6e522e31e77c1e70177d8ef))
- Structured trace in client ivc ([#6132](https://github.com/AztecProtocol/aztec-packages/issues/6132)) ([92c1478](https://github.com/AztecProtocol/aztec-packages/commit/92c14780a7cdec87173d1ec9a22675ca13bf1ae7))
- Switch `bb` over to read ACIR from nargo artifacts ([#6283](https://github.com/AztecProtocol/aztec-packages/issues/6283)) ([78adcc0](https://github.com/AztecProtocol/aztec-packages/commit/78adcc0f6bd74d7ead6de58099dda1a3f88eefb0))
- ToRadix BB + avm transpiler support ([#6330](https://github.com/AztecProtocol/aztec-packages/issues/6330)) ([c3c602f](https://github.com/AztecProtocol/aztec-packages/commit/c3c602f75ce2224489dfd2490ee7e991aca9d48f))
- **vm:** Reading kernel state opcodes ([#5739](https://github.com/AztecProtocol/aztec-packages/issues/5739)) ([3250a8a](https://github.com/AztecProtocol/aztec-packages/commit/3250a8a217646fd369f491100c644f73a8fe99e4))

### Bug Fixes

- Temporarily revert to_radix blackbox ([#6304](https://github.com/AztecProtocol/aztec-packages/issues/6304)) ([044d0fe](https://github.com/AztecProtocol/aztec-packages/commit/044d0fef3bbecf673c579bd63d2640dc81b35ba3))

### Miscellaneous

- **dsl:** Update backend gateCount command to query a Program in a single request ([#6228](https://github.com/AztecProtocol/aztec-packages/issues/6228)) ([8079f60](https://github.com/AztecProtocol/aztec-packages/commit/8079f601a23219ddd96f01064d0c31c6e8109471))
- Make MSM builder more explicit ([#6110](https://github.com/AztecProtocol/aztec-packages/issues/6110)) ([40306b6](https://github.com/AztecProtocol/aztec-packages/commit/40306b6d5ea01bf191288b0a3bca6fdbeae9912f))
- Remove `bb info` command ([#6276](https://github.com/AztecProtocol/aztec-packages/issues/6276)) ([f0a1c89](https://github.com/AztecProtocol/aztec-packages/commit/f0a1c89a064c1e170db4751be46874f089dd1385))
- Update serialisation ([#6378](https://github.com/AztecProtocol/aztec-packages/issues/6378)) ([527129d](https://github.com/AztecProtocol/aztec-packages/commit/527129d6f9e624716642a78b0744c3f99ed8e1a1))

## [0.38.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.37.0...barretenberg-v0.38.0) (2024-05-07)

### ⚠ BREAKING CHANGES

- AES blackbox ([#6016](https://github.com/AztecProtocol/aztec-packages/issues/6016))

### Features

- `multi_scalar_mul` blackbox func ([#6097](https://github.com/AztecProtocol/aztec-packages/issues/6097)) ([f6b1ba6](https://github.com/AztecProtocol/aztec-packages/commit/f6b1ba60daf37a5a6466ca1e5ee7be70354af485))
- AES blackbox ([#6016](https://github.com/AztecProtocol/aztec-packages/issues/6016)) ([e4b97a8](https://github.com/AztecProtocol/aztec-packages/commit/e4b97a8cd7574a828c2a54b4a93b5ced79df6abf))
- **avm:** Add TransactionFee opcode to simulator ([#6210](https://github.com/AztecProtocol/aztec-packages/issues/6210)) ([fcac844](https://github.com/AztecProtocol/aztec-packages/commit/fcac84451f657bb4a70c496538b443dda5bc961e))
- Honk flows exposed through wasm ([#6096](https://github.com/AztecProtocol/aztec-packages/issues/6096)) ([c9b3206](https://github.com/AztecProtocol/aztec-packages/commit/c9b32061b2849442516ff0395b69d9a230191234))
- Osxcross ([#6099](https://github.com/AztecProtocol/aztec-packages/issues/6099)) ([6cc924d](https://github.com/AztecProtocol/aztec-packages/commit/6cc924dc44a36d9ef2aeda05ea69a120898fc272))
- Recursive folding verifier and decider as ultra circuits and circuit simulator ([#6150](https://github.com/AztecProtocol/aztec-packages/issues/6150)) ([acc8641](https://github.com/AztecProtocol/aztec-packages/commit/acc86416668ccfd6425ee3af4a898f2e8513168b))
- Reproducible ClientIVC proofs ([#6227](https://github.com/AztecProtocol/aztec-packages/issues/6227)) ([c145757](https://github.com/AztecProtocol/aztec-packages/commit/c145757a13ba4ff881c4bb05c4caaee7351053b3))

### Bug Fixes

- Correct circuit size estimation for UltraHonk ([#6164](https://github.com/AztecProtocol/aztec-packages/issues/6164)) ([ed84fe3](https://github.com/AztecProtocol/aztec-packages/commit/ed84fe3bcc29c69b1e9d9caafd2c2c2134a67dce))
- Sporadic failure of GoblinRecursionTests.Vanilla ([#6218](https://github.com/AztecProtocol/aztec-packages/issues/6218)) ([f4ecea5](https://github.com/AztecProtocol/aztec-packages/commit/f4ecea5a83bcc88fd11698ac5c8e174c2461a74b))

### Miscellaneous

- **ci:** Fix restarts with fresh spot, acir test fixes, non-mandatory benches ([#6226](https://github.com/AztecProtocol/aztec-packages/issues/6226)) ([adb7f37](https://github.com/AztecProtocol/aztec-packages/commit/adb7f37a4ad01acf1ef197189a1e78323cae8f0b))
- Migrate acir tests to earthly ([#6142](https://github.com/AztecProtocol/aztec-packages/issues/6142)) ([18c8ea8](https://github.com/AztecProtocol/aztec-packages/commit/18c8ea8eb5f9fd1cb51c116d6d1976c774d51bc1))

## [0.37.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.36.0...barretenberg-v0.37.0) (2024-05-02)

### ⚠ BREAKING CHANGES

- use `distinct` return value witnesses by default (https://github.com/noir-lang/noir/pull/4951)

### Features

- Count Bb lines weighted by complexity ([#6090](https://github.com/AztecProtocol/aztec-packages/issues/6090)) ([705177f](https://github.com/AztecProtocol/aztec-packages/commit/705177f2caf4c11f31a22a1ea01b8d0fcd1b4158))
- Devbox ([#5772](https://github.com/AztecProtocol/aztec-packages/issues/5772)) ([72321f9](https://github.com/AztecProtocol/aztec-packages/commit/72321f9d3af27f85c92564754d444ac3df1fcad2))
- Handle `no_predicates` attribute (https://github.com/noir-lang/noir/pull/4942) ([4dc5efb](https://github.com/AztecProtocol/aztec-packages/commit/4dc5efb2299b488e0c7f3a79493350f812bb25ce))
- Pippenger benchmarks compatible with wasmtime ([#6095](https://github.com/AztecProtocol/aztec-packages/issues/6095)) ([5297b5b](https://github.com/AztecProtocol/aztec-packages/commit/5297b5bb2de63003fdb97b9ad75e06c485327b1c))
- Use `distinct` return value witnesses by default (https://github.com/noir-lang/noir/pull/4951) ([4dc5efb](https://github.com/AztecProtocol/aztec-packages/commit/4dc5efb2299b488e0c7f3a79493350f812bb25ce))

### Bug Fixes

- Ensure where clauses propagated to trait default definitions (https://github.com/noir-lang/noir/pull/4894) ([4dc5efb](https://github.com/AztecProtocol/aztec-packages/commit/4dc5efb2299b488e0c7f3a79493350f812bb25ce))
- Require for all foldable functions to use distinct return (https://github.com/noir-lang/noir/pull/4949) ([4dc5efb](https://github.com/AztecProtocol/aztec-packages/commit/4dc5efb2299b488e0c7f3a79493350f812bb25ce))

### Miscellaneous

- Add test for recursing a foldable function (https://github.com/noir-lang/noir/pull/4948) ([4dc5efb](https://github.com/AztecProtocol/aztec-packages/commit/4dc5efb2299b488e0c7f3a79493350f812bb25ce))
- **docs:** Adding matomo tracking (https://github.com/noir-lang/noir/pull/4898) ([4dc5efb](https://github.com/AztecProtocol/aztec-packages/commit/4dc5efb2299b488e0c7f3a79493350f812bb25ce))
- Fix typo in `ResolverError::AbiAttributeOutsideContract` (https://github.com/noir-lang/noir/pull/4933) ([4dc5efb](https://github.com/AztecProtocol/aztec-packages/commit/4dc5efb2299b488e0c7f3a79493350f812bb25ce))
- Redo typo PR by stayweek ([#6080](https://github.com/AztecProtocol/aztec-packages/issues/6080)) ([0869452](https://github.com/AztecProtocol/aztec-packages/commit/086945223602f5d909fc79b56420046c0808f35c))
- Remove unnecessary `pub(super)` in interpreter (https://github.com/noir-lang/noir/pull/4939) ([4dc5efb](https://github.com/AztecProtocol/aztec-packages/commit/4dc5efb2299b488e0c7f3a79493350f812bb25ce))

## [0.36.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.35.1...barretenberg-v0.36.0) (2024-04-30)

### ⚠ BREAKING CHANGES

- remove `Opcode::Brillig` from ACIR ([#5995](https://github.com/AztecProtocol/aztec-packages/issues/5995))
- change backend width to 4 ([#5374](https://github.com/AztecProtocol/aztec-packages/issues/5374))

### Features

- `variable_base_scalar_mul` blackbox func ([#6039](https://github.com/AztecProtocol/aztec-packages/issues/6039)) ([81142fe](https://github.com/AztecProtocol/aztec-packages/commit/81142fe799338e6ed73b30eeac4468c1345f6fab))
- Avm mem trace validation ([#6025](https://github.com/AztecProtocol/aztec-packages/issues/6025)) ([3a3afb5](https://github.com/AztecProtocol/aztec-packages/commit/3a3afb57ab8b6b3f11b7a7799d557436638c8cd3)), closes [#5950](https://github.com/AztecProtocol/aztec-packages/issues/5950)
- **avm:** Avm circuit FDIV opcode ([#5958](https://github.com/AztecProtocol/aztec-packages/issues/5958)) ([fed5b6d](https://github.com/AztecProtocol/aztec-packages/commit/fed5b6dd1ee310fc90404a3e5ec9eb02ad7dbc10)), closes [#5953](https://github.com/AztecProtocol/aztec-packages/issues/5953)
- **avm:** CAST opcode implementation ([#5477](https://github.com/AztecProtocol/aztec-packages/issues/5477)) ([a821bcc](https://github.com/AztecProtocol/aztec-packages/commit/a821bccef7b1894140f0495510d7c6b4eefde821)), closes [#5466](https://github.com/AztecProtocol/aztec-packages/issues/5466)
- **avm:** Negative tests ([#5919](https://github.com/AztecProtocol/aztec-packages/issues/5919)) ([8a5ece7](https://github.com/AztecProtocol/aztec-packages/commit/8a5ece7548a86d099ac6a166f04882624b8d95fd))
- **avm:** Shift relations ([#5716](https://github.com/AztecProtocol/aztec-packages/issues/5716)) ([a516637](https://github.com/AztecProtocol/aztec-packages/commit/a51663707b96914b0a300440611748ce44fbe933))
- Avoiding redundant computation in PG ([#5844](https://github.com/AztecProtocol/aztec-packages/issues/5844)) ([9f57733](https://github.com/AztecProtocol/aztec-packages/commit/9f5773353aa0261fa07a81704bcadcee513d42c5))
- Change backend width to 4 ([#5374](https://github.com/AztecProtocol/aztec-packages/issues/5374)) ([3f24fc2](https://github.com/AztecProtocol/aztec-packages/commit/3f24fc2cdb56eff6da6e47062d2a2a3dc0fa4bd2))
- Circuit simulator for Ultra and Mega verifiers ([#1195](https://github.com/AztecProtocol/aztec-packages/issues/1195)) ([0032a3a](https://github.com/AztecProtocol/aztec-packages/commit/0032a3a55dea5e4c9051dbc36607288f8ca1be4a))
- Dynamic assertion payloads v2 ([#5949](https://github.com/AztecProtocol/aztec-packages/issues/5949)) ([405bdf6](https://github.com/AztecProtocol/aztec-packages/commit/405bdf6a297b81e0c3fda303cf2b1480eaea69f1))
- Implement recursive verification in the parity circuits ([#6006](https://github.com/AztecProtocol/aztec-packages/issues/6006)) ([a5b6dac](https://github.com/AztecProtocol/aztec-packages/commit/a5b6dacd5512d7a035655845381b2c720b1e550a))
- Keshas skipping plus conditions for grand prod relations ([#5766](https://github.com/AztecProtocol/aztec-packages/issues/5766)) ([d8fcfb5](https://github.com/AztecProtocol/aztec-packages/commit/d8fcfb590f788b911111010e20458797d76f5779))
- Naive structured execution trace ([#5853](https://github.com/AztecProtocol/aztec-packages/issues/5853)) ([23aab17](https://github.com/AztecProtocol/aztec-packages/commit/23aab171b17d0dfb840621a74266496ac270b3e8))
- Prove then verify flow for honk ([#5957](https://github.com/AztecProtocol/aztec-packages/issues/5957)) ([099346e](https://github.com/AztecProtocol/aztec-packages/commit/099346ebbab9428f57bfffdc03e8bede5c2e2bed))

### Bug Fixes

- **avm:** Comments and assert ([#5956](https://github.com/AztecProtocol/aztec-packages/issues/5956)) ([ae50219](https://github.com/AztecProtocol/aztec-packages/commit/ae502199b84999418d461ed5d0d6fca0c60494c5))
- Fix relation skipping for sumcheck ([#6092](https://github.com/AztecProtocol/aztec-packages/issues/6092)) ([1449c33](https://github.com/AztecProtocol/aztec-packages/commit/1449c338ca79f8d72b71484546aa46ddebb21779))
- Remove tx.origin ([#5765](https://github.com/AztecProtocol/aztec-packages/issues/5765)) ([c8784d7](https://github.com/AztecProtocol/aztec-packages/commit/c8784d7994937bfae9d23f5d17eb914bae92d8dc)), closes [#5756](https://github.com/AztecProtocol/aztec-packages/issues/5756)

### Miscellaneous

- `create_fixed_base_constraint` cleanup ([#6047](https://github.com/AztecProtocol/aztec-packages/issues/6047)) ([e1d6526](https://github.com/AztecProtocol/aztec-packages/commit/e1d6526b34f03458f258c0f0fa6967b5f20035f4))
- **avm:** Negative unit tests for AVM CAST opcode ([#5907](https://github.com/AztecProtocol/aztec-packages/issues/5907)) ([4465e3b](https://github.com/AztecProtocol/aztec-packages/commit/4465e3be870963ea435d9a0cd063397020442f0b)), closes [#5908](https://github.com/AztecProtocol/aztec-packages/issues/5908)
- **avm:** Re-enable proof in some unit tests ([#6056](https://github.com/AztecProtocol/aztec-packages/issues/6056)) ([0ebee28](https://github.com/AztecProtocol/aztec-packages/commit/0ebee28b14042417956a02a3247af68f4f13dcf5)), closes [#6019](https://github.com/AztecProtocol/aztec-packages/issues/6019)
- Clean up and clarify some translator flavor logic ([#5965](https://github.com/AztecProtocol/aztec-packages/issues/5965)) ([242b364](https://github.com/AztecProtocol/aztec-packages/commit/242b364aacdf662cd6dab6254562ab5f61a58731))
- Do not bootstrap cache if working copy is dirty ([#6033](https://github.com/AztecProtocol/aztec-packages/issues/6033)) ([3671932](https://github.com/AztecProtocol/aztec-packages/commit/367193253670a1d61ffa440d94dad4b9d068e72f))
- ProvingKey has ProverPolynomials ([#5940](https://github.com/AztecProtocol/aztec-packages/issues/5940)) ([0a64279](https://github.com/AztecProtocol/aztec-packages/commit/0a64279ba1b2b3bb6627c675b8a0b116be17f579))
- Purging portal addresses ([#5842](https://github.com/AztecProtocol/aztec-packages/issues/5842)) ([4faccad](https://github.com/AztecProtocol/aztec-packages/commit/4faccad569e39228b0f3fbf741fc95e3a189e276))
- Refactor recursive verifier tests ([#6063](https://github.com/AztecProtocol/aztec-packages/issues/6063)) ([94a2d61](https://github.com/AztecProtocol/aztec-packages/commit/94a2d61d10d8e21d0080b7ea3a8b283f8dd0162f))
- Remove `Opcode::Brillig` from ACIR ([#5995](https://github.com/AztecProtocol/aztec-packages/issues/5995)) ([ffd5f46](https://github.com/AztecProtocol/aztec-packages/commit/ffd5f460fce8b1f12265730f97c8cfcd3a4774ca))
- Remove l1 gas ([#6069](https://github.com/AztecProtocol/aztec-packages/issues/6069)) ([0e3705f](https://github.com/AztecProtocol/aztec-packages/commit/0e3705f2591c1da36778c316d8b7ab914f5d6757))
- Simplify computation of pow for each sumcheck round ([#5903](https://github.com/AztecProtocol/aztec-packages/issues/5903)) ([74a9d5d](https://github.com/AztecProtocol/aztec-packages/commit/74a9d5d6736a4376e40e501765974b9686ca738e))

## [0.35.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.35.0...barretenberg-v0.35.1) (2024-04-16)

### Miscellaneous

- **barretenberg:** Synchronize aztec-packages versions

## [0.35.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.34.0...barretenberg-v0.35.0) (2024-04-16)

### ⚠ BREAKING CHANGES

- Use fixed size arrays in black box functions where sizes are known ([#5620](https://github.com/AztecProtocol/aztec-packages/issues/5620))
- trap with revert data ([#5732](https://github.com/AztecProtocol/aztec-packages/issues/5732))
- **acir:** BrilligCall opcode ([#5709](https://github.com/AztecProtocol/aztec-packages/issues/5709))

### Features

- **acir:** BrilligCall opcode ([#5709](https://github.com/AztecProtocol/aztec-packages/issues/5709)) ([f06f64c](https://github.com/AztecProtocol/aztec-packages/commit/f06f64c451333d36eb05951202d69ee85cca8851))
- **avm:** CMOV opcode ([#5575](https://github.com/AztecProtocol/aztec-packages/issues/5575)) ([19dbe46](https://github.com/AztecProtocol/aztec-packages/commit/19dbe46bce95221bf2e68c9361618998a6bdc64f)), closes [#5557](https://github.com/AztecProtocol/aztec-packages/issues/5557)
- **avm:** Enable contract testing with bb binary ([#5584](https://github.com/AztecProtocol/aztec-packages/issues/5584)) ([d007d79](https://github.com/AztecProtocol/aztec-packages/commit/d007d79c7014261d9c663e28c948600d92e85759))
- **avm:** Enable range check on the ALU registers ([#5696](https://github.com/AztecProtocol/aztec-packages/issues/5696)) ([202fc1b](https://github.com/AztecProtocol/aztec-packages/commit/202fc1b750e83f91c32b128b981db1c5c92ef3f2))
- Changing finite field arithmetic in wasm to 29 bits for multiplications ([#5435](https://github.com/AztecProtocol/aztec-packages/issues/5435)) ([b2d9b9d](https://github.com/AztecProtocol/aztec-packages/commit/b2d9b9d5f1764b159e081b3cc9806ee83fdf341f))
- **ci:** Turn on new CI as mandatory ([#5761](https://github.com/AztecProtocol/aztec-packages/issues/5761)) ([bebed32](https://github.com/AztecProtocol/aztec-packages/commit/bebed32272e0974de21b5c7d21344d3cf1597a24))
- Export poseidon2_permutation and add to foundation/crypto ([#5706](https://github.com/AztecProtocol/aztec-packages/issues/5706)) ([6b91e27](https://github.com/AztecProtocol/aztec-packages/commit/6b91e2776de8fd5b1f489b5cfeee83c7e0996c2e))
- LT/LTE for AVM ([#5559](https://github.com/AztecProtocol/aztec-packages/issues/5559)) ([350abeb](https://github.com/AztecProtocol/aztec-packages/commit/350abeb4c88d7e7878abc32e9263c558633f0df9))
- Trap with revert data ([#5732](https://github.com/AztecProtocol/aztec-packages/issues/5732)) ([f849575](https://github.com/AztecProtocol/aztec-packages/commit/f84957584ff76c22c069903f7648735a0be91d7f))
- Use fixed size arrays in black box functions where sizes are known ([#5620](https://github.com/AztecProtocol/aztec-packages/issues/5620)) ([f50b180](https://github.com/AztecProtocol/aztec-packages/commit/f50b180379ac90d782aba3472708f8cef122c25b))

### Bug Fixes

- "feat: Changing finite field arithmetic in wasm to 29 bits for multiplications" ([#5779](https://github.com/AztecProtocol/aztec-packages/issues/5779)) ([bcfee97](https://github.com/AztecProtocol/aztec-packages/commit/bcfee97da99c654f8641ab8099bbbe5d58e2a5c7))
- Avoid get row in databus ([#5742](https://github.com/AztecProtocol/aztec-packages/issues/5742)) ([d67b6c8](https://github.com/AztecProtocol/aztec-packages/commit/d67b6c8bb703d856c0d95d4d47cc6de93467e9ab))
- **ci:** Bigger cache disk, cache+prune docker images, disable ClientIvcTests.Full ([#5729](https://github.com/AztecProtocol/aztec-packages/issues/5729)) ([5dcbd75](https://github.com/AztecProtocol/aztec-packages/commit/5dcbd75c0795640d48592efbd750cd22b5e5ddd5))
- Disable flakey vanilla recursion test ([#5672](https://github.com/AztecProtocol/aztec-packages/issues/5672)) ([f84f7b6](https://github.com/AztecProtocol/aztec-packages/commit/f84f7b68f6c8072480127a065def1c4453e55877))
- Less earthly cache ([#5690](https://github.com/AztecProtocol/aztec-packages/issues/5690)) ([8190dc7](https://github.com/AztecProtocol/aztec-packages/commit/8190dc7826d480f44107456984f7f192358ba8da))
- Make earthly more parallel ([#5747](https://github.com/AztecProtocol/aztec-packages/issues/5747)) ([9734455](https://github.com/AztecProtocol/aztec-packages/commit/9734455acd0d6e0cba44477f889ec8165e7f3003))
- Simplify ECCVM prover constructor and add a TODO ([#5681](https://github.com/AztecProtocol/aztec-packages/issues/5681)) ([8c151ea](https://github.com/AztecProtocol/aztec-packages/commit/8c151eab1492dda901a1d6b691c9ca68960fd9e6))

### Miscellaneous

- **avm:** Add a boolean to toggle proving in AVM unit tests ([#5667](https://github.com/AztecProtocol/aztec-packages/issues/5667)) ([ec122c9](https://github.com/AztecProtocol/aztec-packages/commit/ec122c9b9c1c63c72158c6956d8fdb2398faf96b)), closes [#5663](https://github.com/AztecProtocol/aztec-packages/issues/5663)
- **avm:** Range checks negative tests ([#5770](https://github.com/AztecProtocol/aztec-packages/issues/5770)) ([2907142](https://github.com/AztecProtocol/aztec-packages/commit/29071423ba65774039e4e5c1f7ca67123a18f738))
- **avm:** Split the negative test on range check for high 16-bit registers ([#5785](https://github.com/AztecProtocol/aztec-packages/issues/5785)) ([8ebbe57](https://github.com/AztecProtocol/aztec-packages/commit/8ebbe57953e35f81ca010cdd686fb43ddf0f20b2))
- **ci:** Use 128 cores for x86 and add timeouts ([#5665](https://github.com/AztecProtocol/aztec-packages/issues/5665)) ([0c5dc0a](https://github.com/AztecProtocol/aztec-packages/commit/0c5dc0a8d90c52c46f9802ec5fb93561d0551b6a))
- Don't strip bb wasm ([#5743](https://github.com/AztecProtocol/aztec-packages/issues/5743)) ([d4cb410](https://github.com/AztecProtocol/aztec-packages/commit/d4cb4108900f1fb6307de17be9ee3516d6023609))
- Fix master after merge issue related to validate_trace renaming ([#5676](https://github.com/AztecProtocol/aztec-packages/issues/5676)) ([44e0d8a](https://github.com/AztecProtocol/aztec-packages/commit/44e0d8abd2104a9969d5750736e77fe9a8d4d621))
- Op queue ([#5648](https://github.com/AztecProtocol/aztec-packages/issues/5648)) ([822c7e6](https://github.com/AztecProtocol/aztec-packages/commit/822c7e63e91cb30219a79513c05d84ee4f03d8fe))

## [0.34.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.33.0...barretenberg-v0.34.0) (2024-04-10)

### ⚠ BREAKING CHANGES

- remove fixed-length keccak256 ([#5617](https://github.com/AztecProtocol/aztec-packages/issues/5617))

### Features

- Generalize protogalaxy to multiple instances ([#5510](https://github.com/AztecProtocol/aztec-packages/issues/5510)) ([f038b70](https://github.com/AztecProtocol/aztec-packages/commit/f038b704c638604b26fe8752792c878cf897327f))
- Stdlib databus ([#5598](https://github.com/AztecProtocol/aztec-packages/issues/5598)) ([633a711](https://github.com/AztecProtocol/aztec-packages/commit/633a711f1b4aecd20131075fa1066c3f24b8d78c))

### Miscellaneous

- Remove fixed-length keccak256 ([#5617](https://github.com/AztecProtocol/aztec-packages/issues/5617)) ([40480b3](https://github.com/AztecProtocol/aztec-packages/commit/40480b3b73cc2c7c296a7361a42ad3511e3b2a16))

## [0.33.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.32.1...barretenberg-v0.33.0) (2024-04-09)

### ⚠ BREAKING CHANGES

- **acir:** Add predicate to call opcode ([#5616](https://github.com/AztecProtocol/aztec-packages/issues/5616))

### Features

- **acir:** Add predicate to call opcode ([#5616](https://github.com/AztecProtocol/aztec-packages/issues/5616)) ([e8cec0a](https://github.com/AztecProtocol/aztec-packages/commit/e8cec0a81da29a1b4df8bc6c70b04e37902f7609))
- Avm logup ([#5577](https://github.com/AztecProtocol/aztec-packages/issues/5577)) ([7e4e9b9](https://github.com/AztecProtocol/aztec-packages/commit/7e4e9b9830c3beb6396ccd3110dda09d3f4e2d59))
- **avm:** Contract instance opcode ([#5487](https://github.com/AztecProtocol/aztec-packages/issues/5487)) ([ceacba6](https://github.com/AztecProtocol/aztec-packages/commit/ceacba6cbb6d070ec3e5e42673b9ab11dab79566))
- **avm:** Indirect memory for set opcode ([#5546](https://github.com/AztecProtocol/aztec-packages/issues/5546)) ([e0e7200](https://github.com/AztecProtocol/aztec-packages/commit/e0e7200819d30170d3d84d42540015d24d7cb1e8)), closes [#5542](https://github.com/AztecProtocol/aztec-packages/issues/5542)
- DataBus notion with calldata/return data ([#5504](https://github.com/AztecProtocol/aztec-packages/issues/5504)) ([95a1d8a](https://github.com/AztecProtocol/aztec-packages/commit/95a1d8ac45e0db8ec21ba1cb2e3f47bb68909b71))
- Optimise relations ([#5552](https://github.com/AztecProtocol/aztec-packages/issues/5552)) ([a581e80](https://github.com/AztecProtocol/aztec-packages/commit/a581e80dedfd0398d4f8a831b4e0031e8460dff7))
- Optimize auxiliary relations slightly ([#5517](https://github.com/AztecProtocol/aztec-packages/issues/5517)) ([30be431](https://github.com/AztecProtocol/aztec-packages/commit/30be43186980672a271fc568344f0341055c7b57))

### Miscellaneous

- ECCVM flavor depends on builder ([#5323](https://github.com/AztecProtocol/aztec-packages/issues/5323)) ([a594683](https://github.com/AztecProtocol/aztec-packages/commit/a5946836eb52f8d836a05de31725d1e0f741a6db))
- Get rid of ECCVM composer ([#5562](https://github.com/AztecProtocol/aztec-packages/issues/5562)) ([43ed901](https://github.com/AztecProtocol/aztec-packages/commit/43ed901838dc2f8d59c665bd667ceec81d31bbdc))

## [0.32.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.32.0...barretenberg-v0.32.1) (2024-04-02)

### Features

- **acvm:** Execute multiple circuits ([#5380](https://github.com/AztecProtocol/aztec-packages/issues/5380)) ([bb71920](https://github.com/AztecProtocol/aztec-packages/commit/bb719200034e3bc6db09fb56538dadca4203abf4))
- Earthly split runners, structure reverts ([#5524](https://github.com/AztecProtocol/aztec-packages/issues/5524)) ([fcb8787](https://github.com/AztecProtocol/aztec-packages/commit/fcb8787f4623eccbc6189f9399d444a4cb863684))
- Parallel gtest ([#5498](https://github.com/AztecProtocol/aztec-packages/issues/5498)) ([349ea59](https://github.com/AztecProtocol/aztec-packages/commit/349ea59e58c7209358e9e1680e42775fd7d39d01))

### Bug Fixes

- **ci:** Turn on earthly for everyone ([#5423](https://github.com/AztecProtocol/aztec-packages/issues/5423)) ([bea3fcb](https://github.com/AztecProtocol/aztec-packages/commit/bea3fcbde91d08f13cb7c2ceeff8be33b3edcdfd))
- Cpp cache and add other e2e ([#5512](https://github.com/AztecProtocol/aztec-packages/issues/5512)) ([4118bcd](https://github.com/AztecProtocol/aztec-packages/commit/4118bcd278524b3ba72f8f656285beb1c284f8f2))
- Univariate evals not set in ECCVM prover ([#5529](https://github.com/AztecProtocol/aztec-packages/issues/5529)) ([f9a2b7c](https://github.com/AztecProtocol/aztec-packages/commit/f9a2b7c927a35efae1d45ab47eab5d8495862bcd))

### Miscellaneous

- Add goblin ops in add_gates_to_ensure_all_polys_are_non_zero ([#5468](https://github.com/AztecProtocol/aztec-packages/issues/5468)) ([b9041e4](https://github.com/AztecProtocol/aztec-packages/commit/b9041e4dea9dba035481d8656886f1c70c671fac))
- **avm:** Add 15 additional 16-bit registers in ALU trace of AVM circuit ([#5503](https://github.com/AztecProtocol/aztec-packages/issues/5503)) ([8725c39](https://github.com/AztecProtocol/aztec-packages/commit/8725c393ef7efead6e6e19c341decaef56f6d035))
- **avm:** Migrate memory data structure in AVM circuit to unordered map ([#5506](https://github.com/AztecProtocol/aztec-packages/issues/5506)) ([ccd09aa](https://github.com/AztecProtocol/aztec-packages/commit/ccd09aae6b80f263b5d40c76adf98c29b3b50093))
- Bye bye shared ptrs for ultra/goblin ultra proving_keys :) ([#5407](https://github.com/AztecProtocol/aztec-packages/issues/5407)) ([b94d0db](https://github.com/AztecProtocol/aztec-packages/commit/b94d0db920f5194d3ebb9697cce6b1c9d194596b))
- Clean up compute_next_accumulator ([#5516](https://github.com/AztecProtocol/aztec-packages/issues/5516)) ([f9be2f2](https://github.com/AztecProtocol/aztec-packages/commit/f9be2f2f708cef5b375facbfd1dfb19710c5ab65))
- Move alphas generation to oink ([#5515](https://github.com/AztecProtocol/aztec-packages/issues/5515)) ([3b964f3](https://github.com/AztecProtocol/aztec-packages/commit/3b964f39fd4a1128f8db534ec00577a8833344a8))

## [0.32.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.31.0...barretenberg-v0.32.0) (2024-03-27)

### ⚠ BREAKING CHANGES

- Brillig typed memory ([#5395](https://github.com/AztecProtocol/aztec-packages/issues/5395))

### Features

- **avm:** EQ opcode output u8 and execution ([#5402](https://github.com/AztecProtocol/aztec-packages/issues/5402)) ([3450e24](https://github.com/AztecProtocol/aztec-packages/commit/3450e24fd025296ebe9cc2c7025f0e4fe811f997)), closes [#5290](https://github.com/AztecProtocol/aztec-packages/issues/5290)
- Brillig typed memory ([#5395](https://github.com/AztecProtocol/aztec-packages/issues/5395)) ([16b0bdd](https://github.com/AztecProtocol/aztec-packages/commit/16b0bdd7fbca6ce296906dc9d3affa308571cbfe))

### Bug Fixes

- **ci:** Fix earthly ctest ([#5424](https://github.com/AztecProtocol/aztec-packages/issues/5424)) ([9cac8a4](https://github.com/AztecProtocol/aztec-packages/commit/9cac8a43778ef7ab2cf62852bc427a7f6ed2391b))
- Serial bb builds for mac ([#5462](https://github.com/AztecProtocol/aztec-packages/issues/5462)) ([4317819](https://github.com/AztecProtocol/aztec-packages/commit/43178199bf9e9e1e6131917e9da30118d4bbc8ab))

### Miscellaneous

- **avm:** Deterministic codegen from pil and some renaming ([#5476](https://github.com/AztecProtocol/aztec-packages/issues/5476)) ([ba834a4](https://github.com/AztecProtocol/aztec-packages/commit/ba834a445dbc23c715bba45bfd77b236361f5e24))
- Fallback to building barretenberg targets sequentially when RAM constrained ([#5426](https://github.com/AztecProtocol/aztec-packages/issues/5426)) ([29588e0](https://github.com/AztecProtocol/aztec-packages/commit/29588e05ea6ceb865c402260662742bcf053a6f1))
- Introduce selectors to enable range checks of 8-bit and 16-bit sizes ([#5465](https://github.com/AztecProtocol/aztec-packages/issues/5465)) ([ef44674](https://github.com/AztecProtocol/aztec-packages/commit/ef4467476785a8df99f88bc21d64d0189a742136))

## [0.31.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.30.1...barretenberg-v0.31.0) (2024-03-26)

### Features

- Avm lookup and/or/xor ([#5338](https://github.com/AztecProtocol/aztec-packages/issues/5338)) ([489bc2c](https://github.com/AztecProtocol/aztec-packages/commit/489bc2cbe9758064924462e65b5ec676f1a0d0c4))
- Earthly bb tests + arm + satellites ([#5268](https://github.com/AztecProtocol/aztec-packages/issues/5268)) ([eca12b3](https://github.com/AztecProtocol/aztec-packages/commit/eca12b3a173f9ef1880e3b703ab778beb036a23b))
- Fold proving key polys instead of prover polys ([#5436](https://github.com/AztecProtocol/aztec-packages/issues/5436)) ([239ebfb](https://github.com/AztecProtocol/aztec-packages/commit/239ebfb5cadee7b38fdc1e0f44d8b54533e44eb2))
- Less earthly runners + e2e GA runners, bb bench ([#5356](https://github.com/AztecProtocol/aztec-packages/issues/5356)) ([2136a66](https://github.com/AztecProtocol/aztec-packages/commit/2136a66cc1fa2249b3ef47b787cfa1de9576dc38))
- Read_calldata ([#5409](https://github.com/AztecProtocol/aztec-packages/issues/5409)) ([034fbf0](https://github.com/AztecProtocol/aztec-packages/commit/034fbf01e957a0e9f33a6a3b078c8acd33b8f3d8))
- Simplified bb Honk interface ([#5319](https://github.com/AztecProtocol/aztec-packages/issues/5319)) ([a2d138f](https://github.com/AztecProtocol/aztec-packages/commit/a2d138fa8c0ecf90bea843d38d2d693d6a38b2cc))
- Simplify offsets and sizing using new block structure ([#5404](https://github.com/AztecProtocol/aztec-packages/issues/5404)) ([efa0842](https://github.com/AztecProtocol/aztec-packages/commit/efa08429f98933ed06bac4049921b0c08a5070f6))
- Unified CircuitChecker interface ([#5343](https://github.com/AztecProtocol/aztec-packages/issues/5343)) ([13cef1f](https://github.com/AztecProtocol/aztec-packages/commit/13cef1f7c4f50a1a1941a92f070daf975c2f25f5))
- ZeroMorph working with IPA and integration with ECCVM ([#5246](https://github.com/AztecProtocol/aztec-packages/issues/5246)) ([c4dce94](https://github.com/AztecProtocol/aztec-packages/commit/c4dce948eba0daac3f6ba7812bd2e0d2d61fab24))

### Bug Fixes

- Revert cbind breakage ([#5348](https://github.com/AztecProtocol/aztec-packages/issues/5348)) ([c237193](https://github.com/AztecProtocol/aztec-packages/commit/c2371936d90fc58d643ae0a870c7ad60fa65adf5))

### Miscellaneous

- **bb:** Removed powers of eta in lookup and auxiliary relations ([#4695](https://github.com/AztecProtocol/aztec-packages/issues/4695)) ([f4e62ae](https://github.com/AztecProtocol/aztec-packages/commit/f4e62ae5bcc7a0ef7baccc61e6e3e959196c891a))
- **ci:** Create a dedicated job for the AVM unit tests ([#5369](https://github.com/AztecProtocol/aztec-packages/issues/5369)) ([59ca2ac](https://github.com/AztecProtocol/aztec-packages/commit/59ca2ac213d9e5c8ec0d0e8890bae7cd4731c5ac)), closes [#5366](https://github.com/AztecProtocol/aztec-packages/issues/5366)
- Clean out prover instance and remove instance from oink ([#5314](https://github.com/AztecProtocol/aztec-packages/issues/5314)) ([a83368c](https://github.com/AztecProtocol/aztec-packages/commit/a83368c8da55fde6ea4a1135fbab47a5b5298e28))
- Meld flavor and and circuit builder modules ([#5406](https://github.com/AztecProtocol/aztec-packages/issues/5406)) ([f0d9d1b](https://github.com/AztecProtocol/aztec-packages/commit/f0d9d1ba7340d294426c05d36ef36831ca3e7705))
- Moving public inputs back to instance ([#5315](https://github.com/AztecProtocol/aztec-packages/issues/5315)) ([9cbe368](https://github.com/AztecProtocol/aztec-packages/commit/9cbe368f8804d7d0dc49db3d555fbe1e2d3dd016))
- Name change: gen perm sort to delta range constraint ([#5378](https://github.com/AztecProtocol/aztec-packages/issues/5378)) ([841855f](https://github.com/AztecProtocol/aztec-packages/commit/841855fc069b89a5937e63194452f1a3cfd76f5c))
- Remove mocking function in `EccOpQueue` again ([#5413](https://github.com/AztecProtocol/aztec-packages/issues/5413)) ([6fb4a75](https://github.com/AztecProtocol/aztec-packages/commit/6fb4a755bcac78803bd2c709ca661c4ab0ca5b9e))

## [0.30.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.30.0...barretenberg-v0.30.1) (2024-03-20)

### Features

- Add CMOV instruction to brillig and brillig gen ([#5308](https://github.com/AztecProtocol/aztec-packages/issues/5308)) ([208abbb](https://github.com/AztecProtocol/aztec-packages/commit/208abbb63af4c9a3f25d723fe1c49e82aa461061))
- **avm:** Indirect memory support for arithmetic/bitwise opcodes ([#5328](https://github.com/AztecProtocol/aztec-packages/issues/5328)) ([d5ffa17](https://github.com/AztecProtocol/aztec-packages/commit/d5ffa17f19d2887ddc98c3c90d323c5351de6570)), closes [#5273](https://github.com/AztecProtocol/aztec-packages/issues/5273)
- **avm:** Indirect memory support for MOV ([#5257](https://github.com/AztecProtocol/aztec-packages/issues/5257)) ([10ef970](https://github.com/AztecProtocol/aztec-packages/commit/10ef9702c43d36afd334a78df26fe0301c2ac001)), closes [#5205](https://github.com/AztecProtocol/aztec-packages/issues/5205)
- Merge SMT Terms in one class ([#5254](https://github.com/AztecProtocol/aztec-packages/issues/5254)) ([f5c9b0f](https://github.com/AztecProtocol/aztec-packages/commit/f5c9b0fdd095070f48ba38600b9bf53354b731f7))
- Sorted execution trace ([#5252](https://github.com/AztecProtocol/aztec-packages/issues/5252)) ([a216759](https://github.com/AztecProtocol/aztec-packages/commit/a216759d47b8a7c0b6d68c8cf8cfffab76f7e02d))

### Bug Fixes

- Fix recursion tests and reinstate in CI ([#5300](https://github.com/AztecProtocol/aztec-packages/issues/5300)) ([96c6f21](https://github.com/AztecProtocol/aztec-packages/commit/96c6f21b7f01be61af61ecc1a54ae7d6e23fd5af))
- Update smt_verification README.md ([#5332](https://github.com/AztecProtocol/aztec-packages/issues/5332)) ([46b15e3](https://github.com/AztecProtocol/aztec-packages/commit/46b15e3d7c851f8f6312fe76c1ad675d564694ab))

### Miscellaneous

- No Translator composer ([#5202](https://github.com/AztecProtocol/aztec-packages/issues/5202)) ([c8897ca](https://github.com/AztecProtocol/aztec-packages/commit/c8897ca7e551d988df0e23c7b4e9587569685052))
- Remove toy vm files ([#5326](https://github.com/AztecProtocol/aztec-packages/issues/5326)) ([d940356](https://github.com/AztecProtocol/aztec-packages/commit/d940356ca5584b7328d9d398529ee23b21a1748d))

## [0.30.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.29.0...barretenberg-v0.30.0) (2024-03-19)

### ⚠ BREAKING CHANGES

- **acir:** Program and witness stack structure ([#5149](https://github.com/AztecProtocol/aztec-packages/issues/5149))

### Features

- **acir:** Program and witness stack structure ([#5149](https://github.com/AztecProtocol/aztec-packages/issues/5149)) ([ccc5016](https://github.com/AztecProtocol/aztec-packages/commit/ccc5016eaeedbfb3f6be6763979e30e12485188b))
- ECCVM witness generation optimisation ([#5211](https://github.com/AztecProtocol/aztec-packages/issues/5211)) ([85ac726](https://github.com/AztecProtocol/aztec-packages/commit/85ac72604e443ae2d50edfd9ef74b745d4d5d169))

### Bug Fixes

- **bb:** Cvc5 linking ([#5302](https://github.com/AztecProtocol/aztec-packages/issues/5302)) ([5e9cf41](https://github.com/AztecProtocol/aztec-packages/commit/5e9cf418e14eee8b5a694d792c034a5745e2d25b))
- Set denominator to 1 during verification of dsl/big-field division ([#5188](https://github.com/AztecProtocol/aztec-packages/issues/5188)) ([253d002](https://github.com/AztecProtocol/aztec-packages/commit/253d0022aa051fe1ac6a53a88f67d084cfa98516))

### Miscellaneous

- Share verifier rounds ([#4849](https://github.com/AztecProtocol/aztec-packages/issues/4849)) ([1139308](https://github.com/AztecProtocol/aztec-packages/commit/1139308d6d90ade1868278915901f86b08daedda))

## [0.29.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.28.1...barretenberg-v0.29.0) (2024-03-18)

### ⚠ BREAKING CHANGES

- Acir call opcode ([#4773](https://github.com/AztecProtocol/aztec-packages/issues/4773))

### Features

- Acir call opcode ([#4773](https://github.com/AztecProtocol/aztec-packages/issues/4773)) ([0b15db2](https://github.com/AztecProtocol/aztec-packages/commit/0b15db2bea70696597911e82b60f0def595c1150))
- Add RelWithAssert build ([#4997](https://github.com/AztecProtocol/aztec-packages/issues/4997)) ([4f337c7](https://github.com/AztecProtocol/aztec-packages/commit/4f337c7c09539dcc4b11ef44d6728f9ed5248417))
- **avm:** Mov opcode with direct memory ([#5204](https://github.com/AztecProtocol/aztec-packages/issues/5204)) ([08f9038](https://github.com/AztecProtocol/aztec-packages/commit/08f903817f93028551f69b42ff02f0c3c10e8737)), closes [#5159](https://github.com/AztecProtocol/aztec-packages/issues/5159)
- Extended IPA tests and fuzzing ([#5140](https://github.com/AztecProtocol/aztec-packages/issues/5140)) ([0ae5ace](https://github.com/AztecProtocol/aztec-packages/commit/0ae5ace4874676eb3739c556702bf39d1c799e8e))
- Initial Earthly CI ([#5069](https://github.com/AztecProtocol/aztec-packages/issues/5069)) ([8e75fe5](https://github.com/AztecProtocol/aztec-packages/commit/8e75fe5c47250e860a4eae4dbf0973c503221720))
- Remove unnecessary `mulmod`s from verifier contract ([#5269](https://github.com/AztecProtocol/aztec-packages/issues/5269)) ([20d9c0c](https://github.com/AztecProtocol/aztec-packages/commit/20d9c0c6c3591975b9195810a334d4708e45690d))
- Signed integer division and modulus in brillig gen ([#5279](https://github.com/AztecProtocol/aztec-packages/issues/5279)) ([82f8cf5](https://github.com/AztecProtocol/aztec-packages/commit/82f8cf5eba9deacdab43ad4ef95dbf27dd1c11c7))

### Bug Fixes

- **bb:** Mac build ([#5253](https://github.com/AztecProtocol/aztec-packages/issues/5253)) ([ae021c0](https://github.com/AztecProtocol/aztec-packages/commit/ae021c04ebdba07f94f1f5deeb2a142aedb78c1f))
- CVC5 api update ([#5203](https://github.com/AztecProtocol/aztec-packages/issues/5203)) ([9cc32cb](https://github.com/AztecProtocol/aztec-packages/commit/9cc32cb5e4aaf03ea3457a8fcf3b38c1e39d3d04))

### Miscellaneous

- Template Zeromorph by PCS ([#5215](https://github.com/AztecProtocol/aztec-packages/issues/5215)) ([03feab2](https://github.com/AztecProtocol/aztec-packages/commit/03feab2f155f312ba63980a94d3cc4141916ad4d))

## [0.28.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.28.0...barretenberg-v0.28.1) (2024-03-14)

### Miscellaneous

- **barretenberg:** Synchronize aztec-packages versions

## [0.28.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.27.2...barretenberg-v0.28.0) (2024-03-14)

### Features

- **avm-simulator:** Euclidean and field div ([#5181](https://github.com/AztecProtocol/aztec-packages/issues/5181)) ([037a38f](https://github.com/AztecProtocol/aztec-packages/commit/037a38f498ee7f9d9c530a4b3b236e9c377b377d))
- Isolate Plonk dependencies ([#5068](https://github.com/AztecProtocol/aztec-packages/issues/5068)) ([5cbbd7d](https://github.com/AztecProtocol/aztec-packages/commit/5cbbd7da89488f6f662f96d0a3532921534755b4))
- New brillig field operations and refactor of binary operations ([#5208](https://github.com/AztecProtocol/aztec-packages/issues/5208)) ([eb69504](https://github.com/AztecProtocol/aztec-packages/commit/eb6950462b1ab2a0c8f50722791c7b0b9f1daf83))
- Parallelize linearly dependent contribution in PG ([#4742](https://github.com/AztecProtocol/aztec-packages/issues/4742)) ([d1799ae](https://github.com/AztecProtocol/aztec-packages/commit/d1799aeccb328582fabed25811e756bf0453216c))
- Update SMT Circuit class and add gate relaxation functionality ([#5176](https://github.com/AztecProtocol/aztec-packages/issues/5176)) ([5948996](https://github.com/AztecProtocol/aztec-packages/commit/5948996c0bab8ee99c4686352b8475da38604f28))

### Bug Fixes

- Barretenberg-acir-tests-bb.js thru version bump ([#5216](https://github.com/AztecProtocol/aztec-packages/issues/5216)) ([9298f93](https://github.com/AztecProtocol/aztec-packages/commit/9298f932b2d22aa5a4c87dab90d5e72614f222da))
- Intermittent invert 0 in Goblin ([#5189](https://github.com/AztecProtocol/aztec-packages/issues/5189)) ([6c70624](https://github.com/AztecProtocol/aztec-packages/commit/6c7062443ae23cc75ac06b7ac1492d12f803d0e5))
- Remove embedded srs ([#5173](https://github.com/AztecProtocol/aztec-packages/issues/5173)) ([cfd673d](https://github.com/AztecProtocol/aztec-packages/commit/cfd673d6224e95a7b09eaa51e1f6535b277b2827))

### Miscellaneous

- Add dependency instructions to bberg README ([#5187](https://github.com/AztecProtocol/aztec-packages/issues/5187)) ([850febc](https://github.com/AztecProtocol/aztec-packages/commit/850febc31400b0f5ca2064d91833a847adc5df31))
- Moving wit comms and witness and comm labels from instance to oink ([#5199](https://github.com/AztecProtocol/aztec-packages/issues/5199)) ([19eb7f9](https://github.com/AztecProtocol/aztec-packages/commit/19eb7f9bd48f1f5fb8d9e9a2e172c8f0c2c9445b))
- Oink ([#5210](https://github.com/AztecProtocol/aztec-packages/issues/5210)) ([321f149](https://github.com/AztecProtocol/aztec-packages/commit/321f149dd720f2e74d3b4118bf75c910b466d0ed))

## [0.27.2](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.27.1...barretenberg-v0.27.2) (2024-03-13)

### Features

- Multithreaded prover folding ([#5147](https://github.com/AztecProtocol/aztec-packages/issues/5147)) ([94922fc](https://github.com/AztecProtocol/aztec-packages/commit/94922fc24e728100b456ed5f0203974964fd9f83))

### Bug Fixes

- Intermittent invert 0 in Goblin ([#5174](https://github.com/AztecProtocol/aztec-packages/issues/5174)) ([3e68b49](https://github.com/AztecProtocol/aztec-packages/commit/3e68b49f717aa643eb616976f6cc7ed0ac07686d))

### Miscellaneous

- Interaction for a mock first circuit handled inside the `EccOpQueue` ([#4854](https://github.com/AztecProtocol/aztec-packages/issues/4854)) ([d9cbdc8](https://github.com/AztecProtocol/aztec-packages/commit/d9cbdc888d467ade8add5c3c03a1759dddbb398a))

## [0.27.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.27.0...barretenberg-v0.27.1) (2024-03-12)

### Features

- Further ClientIVC breakdown ([#5146](https://github.com/AztecProtocol/aztec-packages/issues/5146)) ([c8e1cb8](https://github.com/AztecProtocol/aztec-packages/commit/c8e1cb8c6bc07bda2cf4aec3b5d2b2120bfafd01))

### Bug Fixes

- Move timers for ClientIVC breakdown ([#5145](https://github.com/AztecProtocol/aztec-packages/issues/5145)) ([5457edb](https://github.com/AztecProtocol/aztec-packages/commit/5457edb3ddd29df96906f98fb05469a26a644654))

### Miscellaneous

- Share code between provers ([#4655](https://github.com/AztecProtocol/aztec-packages/issues/4655)) ([ef10d65](https://github.com/AztecProtocol/aztec-packages/commit/ef10d6576aa9e89eece5a40669c425ae7987ee8a))

## [0.27.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.26.6...barretenberg-v0.27.0) (2024-03-12)

### Features

- **avm:** Equivalence check between Main trace and Mem trace ([#5032](https://github.com/AztecProtocol/aztec-packages/issues/5032)) ([7f216eb](https://github.com/AztecProtocol/aztec-packages/commit/7f216eb064fc95791de1286c7695e89575e02b40)), closes [#4955](https://github.com/AztecProtocol/aztec-packages/issues/4955)
- Initial integration avm prover ([#4878](https://github.com/AztecProtocol/aztec-packages/issues/4878)) ([2e2554e](https://github.com/AztecProtocol/aztec-packages/commit/2e2554e6a055ff7124e18d1566371d5d108c5d5d))
- Update the core of SMT Circuit class ([#5096](https://github.com/AztecProtocol/aztec-packages/issues/5096)) ([1519d3b](https://github.com/AztecProtocol/aztec-packages/commit/1519d3b07664f471a43d3f6bbb3dbe2d387289fc))

### Miscellaneous

- **AVM:** Negative unit tests for inter table relations ([#5143](https://github.com/AztecProtocol/aztec-packages/issues/5143)) ([a74dccb](https://github.com/AztecProtocol/aztec-packages/commit/a74dccbdef0939b77978ddec3875b1afc2d0b530)), closes [#5033](https://github.com/AztecProtocol/aztec-packages/issues/5033)
- Extract bb binary in bs fast ([#5128](https://github.com/AztecProtocol/aztec-packages/issues/5128)) ([9ca41ef](https://github.com/AztecProtocol/aztec-packages/commit/9ca41ef6951566622ab9e68924958dbb66b160df))
- Join-split example Part 2 ([#5016](https://github.com/AztecProtocol/aztec-packages/issues/5016)) ([0718320](https://github.com/AztecProtocol/aztec-packages/commit/07183200b136ec39087c2b35e5799686319d561b))
- Move alpine containers to ubuntu ([#5026](https://github.com/AztecProtocol/aztec-packages/issues/5026)) ([d483e67](https://github.com/AztecProtocol/aztec-packages/commit/d483e678e4b2558f74c3b79083cf2257d6eafe0c)), closes [#4708](https://github.com/AztecProtocol/aztec-packages/issues/4708)
- Pin foundry ([#5151](https://github.com/AztecProtocol/aztec-packages/issues/5151)) ([69bd7dd](https://github.com/AztecProtocol/aztec-packages/commit/69bd7dd45af6b197b23c25dc883a1a5485955203))

## [0.26.6](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.26.5...barretenberg-v0.26.6) (2024-03-08)

### Features

- IPA documentation ([#4924](https://github.com/AztecProtocol/aztec-packages/issues/4924)) ([48bd22e](https://github.com/AztecProtocol/aztec-packages/commit/48bd22eaab6d9df38d856db943f35292a42ea928))
- Updating an SMT solver class ([#4981](https://github.com/AztecProtocol/aztec-packages/issues/4981)) ([4b94d58](https://github.com/AztecProtocol/aztec-packages/commit/4b94d580a7add893a305e453e0f9005694759dc4))

### Bug Fixes

- Storage v2 ([#5027](https://github.com/AztecProtocol/aztec-packages/issues/5027)) ([fe3190e](https://github.com/AztecProtocol/aztec-packages/commit/fe3190ee66d5c340b6ef6a6fe53772e8e08c9463))
- Update protogalaxy cmake dependencies ([#5066](https://github.com/AztecProtocol/aztec-packages/issues/5066)) ([507c374](https://github.com/AztecProtocol/aztec-packages/commit/507c374b65c7947f4562fe736c28dc6500ad95b3))

### Miscellaneous

- **ci:** Re-enable certain bb solidity ACIR tests ([#5065](https://github.com/AztecProtocol/aztec-packages/issues/5065)) ([58e1ff4](https://github.com/AztecProtocol/aztec-packages/commit/58e1ff4ecf8dbc5e4504994a9e22b04d09d0535d))
- Cleanup of prover and verifier instances ([#4959](https://github.com/AztecProtocol/aztec-packages/issues/4959)) ([f2fdefd](https://github.com/AztecProtocol/aztec-packages/commit/f2fdefd1a7b4759abc767f273e5defa5bf7ddcc7))
- Join-split example Part 1 ([#4965](https://github.com/AztecProtocol/aztec-packages/issues/4965)) ([b9de0f5](https://github.com/AztecProtocol/aztec-packages/commit/b9de0f52e89c05f2260afeae0ccc6c3ff63e69b6))
- Remove eccvm functionality to update the op queue and ensure ultra ops are populated through function ([#5084](https://github.com/AztecProtocol/aztec-packages/issues/5084)) ([77954ab](https://github.com/AztecProtocol/aztec-packages/commit/77954ab56de67e0e055f222d04dbeb353aa3c04b))

## [0.26.5](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.26.4...barretenberg-v0.26.5) (2024-03-07)

### Miscellaneous

- **barretenberg:** Synchronize aztec-packages versions

## [0.26.4](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.26.3...barretenberg-v0.26.4) (2024-03-06)

### Features

- **avm:** ALU &lt;--&gt; MAIN inter table relation on intermediate registers copy ([#4945](https://github.com/AztecProtocol/aztec-packages/issues/4945)) ([8708131](https://github.com/AztecProtocol/aztec-packages/commit/870813173e0fc760338a06485722387fdd1dfcab)), closes [#4613](https://github.com/AztecProtocol/aztec-packages/issues/4613)
- Circuit checker class ([#4931](https://github.com/AztecProtocol/aztec-packages/issues/4931)) ([4eba266](https://github.com/AztecProtocol/aztec-packages/commit/4eba26675a39cf6c9539da57c7177ec28ee3a8fb))

## [0.26.3](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.26.2...barretenberg-v0.26.3) (2024-03-06)

### Miscellaneous

- **barretenberg:** Synchronize aztec-packages versions

## [0.26.2](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.26.1...barretenberg-v0.26.2) (2024-03-06)

### Miscellaneous

- **barretenberg:** Synchronize aztec-packages versions

## [0.26.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.26.0...barretenberg-v0.26.1) (2024-03-06)

### Features

- Adding fr compatibility to smt variables api ([#4884](https://github.com/AztecProtocol/aztec-packages/issues/4884)) ([c085cbb](https://github.com/AztecProtocol/aztec-packages/commit/c085cbb0840b29698db1fec0ed5d6aa19c9c36ea))
- Indirect mem flag deserialisation ([#4877](https://github.com/AztecProtocol/aztec-packages/issues/4877)) ([4c6820f](https://github.com/AztecProtocol/aztec-packages/commit/4c6820f6359a2db4863502d36b188dd52d2d32b1))

### Miscellaneous

- Remove commitment key copy out of instance ([#4893](https://github.com/AztecProtocol/aztec-packages/issues/4893)) ([6eb6778](https://github.com/AztecProtocol/aztec-packages/commit/6eb6778c2f4586e97a659e3368aa25016f97d3b9))

## [0.26.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.25.0...barretenberg-v0.26.0) (2024-03-05)

### Miscellaneous

- **barretenberg:** Synchronize aztec-packages versions

## [0.25.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.24.0...barretenberg-v0.25.0) (2024-03-05)

### Features

- Additional op count timing ([#4722](https://github.com/AztecProtocol/aztec-packages/issues/4722)) ([f0cc760](https://github.com/AztecProtocol/aztec-packages/commit/f0cc76040a2de5d0f827afdb662591232c4ee1ed))
- Analyze % of time spent on field arithmetic ([#4501](https://github.com/AztecProtocol/aztec-packages/issues/4501)) ([5ddfa16](https://github.com/AztecProtocol/aztec-packages/commit/5ddfa16391f1017219a997c322b061ebe6f34db2))
- **avm-simulator:** Implement AVM message opcodes (simulator/transpiler/noir-test) ([#4852](https://github.com/AztecProtocol/aztec-packages/issues/4852)) ([c98325d](https://github.com/AztecProtocol/aztec-packages/commit/c98325d23897d23c09faddc4355958406d44faa9))
- **avm:** Enable main -&gt; mem clk lookups ([#4591](https://github.com/AztecProtocol/aztec-packages/issues/4591)) ([0e503c1](https://github.com/AztecProtocol/aztec-packages/commit/0e503c14c0c20a93e162a90d8d049f094b64de7d))
- **avm:** Hashing opcodes ([#4526](https://github.com/AztecProtocol/aztec-packages/issues/4526)) ([fe10c70](https://github.com/AztecProtocol/aztec-packages/commit/fe10c7049b3597a96f76a27a22e9233bc3b8ce82))
- **avm:** Propagate tag err to the main trace for op_return and internal_return ([#4615](https://github.com/AztecProtocol/aztec-packages/issues/4615)) ([427f1d8](https://github.com/AztecProtocol/aztec-packages/commit/427f1d8567a3f68c3093c29a2999096746927548)), closes [#4598](https://github.com/AztecProtocol/aztec-packages/issues/4598)
- Avoid requiring arith gates in sequence ([#4869](https://github.com/AztecProtocol/aztec-packages/issues/4869)) ([0ab0a94](https://github.com/AztecProtocol/aztec-packages/commit/0ab0a94842ce9b174ba82b430a93cba188fe75b0))
- **bb:** Working msan preset ([#4618](https://github.com/AztecProtocol/aztec-packages/issues/4618)) ([0195ac8](https://github.com/AztecProtocol/aztec-packages/commit/0195ac89a13dc2a7b9caa5a8d8d29458a99c5f76))
- Benchmark Protogalaxy rounds ([#4316](https://github.com/AztecProtocol/aztec-packages/issues/4316)) ([91af28d](https://github.com/AztecProtocol/aztec-packages/commit/91af28d6e03d85b5c749740c82cf9114379c823a))
- Bitwise_not avm circuit ([#4548](https://github.com/AztecProtocol/aztec-packages/issues/4548)) ([3a7d31b](https://github.com/AztecProtocol/aztec-packages/commit/3a7d31b200e6e604eea06a40dcf5bf02b088ab79))
- Equality avm circuit ([#4595](https://github.com/AztecProtocol/aztec-packages/issues/4595)) ([aad7b45](https://github.com/AztecProtocol/aztec-packages/commit/aad7b45aa6d3a4c3df259ea41fdde48bf01139b1))
- Execution Trace ([#4623](https://github.com/AztecProtocol/aztec-packages/issues/4623)) ([07ac589](https://github.com/AztecProtocol/aztec-packages/commit/07ac589d08964a44ea54a0d9fa0a21db73186aee))
- Gate blocks ([#4741](https://github.com/AztecProtocol/aztec-packages/issues/4741)) ([61067a5](https://github.com/AztecProtocol/aztec-packages/commit/61067a5cdedfd10fbc32e381083b031bc80fc6d6))
- Goblin documentation ([#4679](https://github.com/AztecProtocol/aztec-packages/issues/4679)) ([24d918f](https://github.com/AztecProtocol/aztec-packages/commit/24d918f7bd114f2641ae61bcf0da888e06f6520a))
- Goblin Translator Fuzzer ([#4752](https://github.com/AztecProtocol/aztec-packages/issues/4752)) ([7402517](https://github.com/AztecProtocol/aztec-packages/commit/74025170288e39e1d7516f57df94f22bc30f663c))
- Mega Bench ([#4671](https://github.com/AztecProtocol/aztec-packages/issues/4671)) ([319eea9](https://github.com/AztecProtocol/aztec-packages/commit/319eea9e4caf1d1ade00fedface5fab9bbf9db16))
- Implementing IPA optimisation ([#4363](https://github.com/AztecProtocol/aztec-packages/issues/4363)) ([13647c2](https://github.com/AztecProtocol/aztec-packages/commit/13647c24487116f971c81dfaf4ee4664870522d5))
- Login to ecr explicitly, faster bootstrap as we only do once. ([#4900](https://github.com/AztecProtocol/aztec-packages/issues/4900)) ([86d6749](https://github.com/AztecProtocol/aztec-packages/commit/86d6749615a533e0a9fbe0a1dca97b38fb14bb5f))
- Manual ClientIVC breakdown ([#4778](https://github.com/AztecProtocol/aztec-packages/issues/4778)) ([b4cfc89](https://github.com/AztecProtocol/aztec-packages/commit/b4cfc89c0d8286d2dfa3e04c58695d554951c920))
- Parallel native/wasm bb builds. Better messaging around using ci cache. ([#4766](https://github.com/AztecProtocol/aztec-packages/issues/4766)) ([a924e55](https://github.com/AztecProtocol/aztec-packages/commit/a924e55393daa89fbba3a87cf019977286104b59))
- Parallelise kernel and function circuit construction in client IVC ([#4841](https://github.com/AztecProtocol/aztec-packages/issues/4841)) ([9c689d8](https://github.com/AztecProtocol/aztec-packages/commit/9c689d8d5a7d330dabafaa7d10c0cfc5e4694921))
- Separate addition gate after final RAM gate ([#4851](https://github.com/AztecProtocol/aztec-packages/issues/4851)) ([f329db4](https://github.com/AztecProtocol/aztec-packages/commit/f329db4ec08f013bf8f53eb73b18d3d98d98e2e4))
- Separate arithmetic gate in sort with edges ([#4866](https://github.com/AztecProtocol/aztec-packages/issues/4866)) ([40adc5c](https://github.com/AztecProtocol/aztec-packages/commit/40adc5cdc578c6ff6d6a9aa25c9a2f3506ec1677))
- Simplify public input copy cycles ([#4753](https://github.com/AztecProtocol/aztec-packages/issues/4753)) ([a714ee0](https://github.com/AztecProtocol/aztec-packages/commit/a714ee027262dba3a083e17878862cd1144a86a6))
- Update RAM/ROM memory records for new block structure ([#4806](https://github.com/AztecProtocol/aztec-packages/issues/4806)) ([65e4ab9](https://github.com/AztecProtocol/aztec-packages/commit/65e4ab93219118c8ac46a68bc6607ee9d11f6478))

### Bug Fixes

- Add TODO with issue for num_gates bug ([#4847](https://github.com/AztecProtocol/aztec-packages/issues/4847)) ([f6c558b](https://github.com/AztecProtocol/aztec-packages/commit/f6c558b41d3e003e1626a853aff0b58705847e84))
- Assembly benching ([#4640](https://github.com/AztecProtocol/aztec-packages/issues/4640)) ([f144745](https://github.com/AztecProtocol/aztec-packages/commit/f14474571210a46e7159cb9d2f0bc9374a837d3d))
- **bb:** Initialize element::infinity() ([#4664](https://github.com/AztecProtocol/aztec-packages/issues/4664)) ([6813540](https://github.com/AztecProtocol/aztec-packages/commit/6813540731149db1f0d8932598335f95937ada03))
- Cpp build ([#4918](https://github.com/AztecProtocol/aztec-packages/issues/4918)) ([15df3c0](https://github.com/AztecProtocol/aztec-packages/commit/15df3c08168611f7f65f5837a937031d81bb3566))
- Debug build ([#4666](https://github.com/AztecProtocol/aztec-packages/issues/4666)) ([acc27b1](https://github.com/AztecProtocol/aztec-packages/commit/acc27b1bd2ec21c7b5c71f02974bd49d29b4caa5))
- **dsl:** Add full recursive verification test ([#4658](https://github.com/AztecProtocol/aztec-packages/issues/4658)) ([9e09772](https://github.com/AztecProtocol/aztec-packages/commit/9e0977261aea723d6ea68750788f29a40730c404))
- Fix races in slab allocator and lookup tables and add prepending for op_queues ([#4754](https://github.com/AztecProtocol/aztec-packages/issues/4754)) ([0c99de7](https://github.com/AztecProtocol/aztec-packages/commit/0c99de7c4b9931989824f66dab83cc644578a75c))
- Fix Translator composer test instability ([#4751](https://github.com/AztecProtocol/aztec-packages/issues/4751)) ([842ba7a](https://github.com/AztecProtocol/aztec-packages/commit/842ba7a720d075632ad2c4b948f874a12cfa3ecd))
- G2.Serialize sporadic failure ([#4626](https://github.com/AztecProtocol/aztec-packages/issues/4626)) ([c9e6bb1](https://github.com/AztecProtocol/aztec-packages/commit/c9e6bb1391070b6551b313b85fe73742ff0966fc))
- Get_wires for ultra ([#4605](https://github.com/AztecProtocol/aztec-packages/issues/4605)) ([512110e](https://github.com/AztecProtocol/aztec-packages/commit/512110e4bdc353b01ee92fb5b2ff5f6e6f875fbb))
- Master borked arithmetic tests ([#4606](https://github.com/AztecProtocol/aztec-packages/issues/4606)) ([472c54a](https://github.com/AztecProtocol/aztec-packages/commit/472c54a7e89001f5f752da670cc25ec1a537da87))
- Msan build ([#4646](https://github.com/AztecProtocol/aztec-packages/issues/4646)) ([886cc75](https://github.com/AztecProtocol/aztec-packages/commit/886cc7585f935f4f12257444af7862b51dc91584))
- MSAN msgpack noise ([#4677](https://github.com/AztecProtocol/aztec-packages/issues/4677)) ([1abae28](https://github.com/AztecProtocol/aztec-packages/commit/1abae28580354f5ccc620dbd717bf079f39fb445))
- Remove the `VerificationKey` from `ProverInstance` ([#4908](https://github.com/AztecProtocol/aztec-packages/issues/4908)) ([8619c08](https://github.com/AztecProtocol/aztec-packages/commit/8619c084cdfd061f284058b00a96f16fbbca65bf))
- Use size hint for ivc circuits ([#4802](https://github.com/AztecProtocol/aztec-packages/issues/4802)) ([035cff4](https://github.com/AztecProtocol/aztec-packages/commit/035cff451ca2171e08279b9d36b23f38b840efea))

### Miscellaneous

- Add pow poly bench and link optimization issues ([#4725](https://github.com/AztecProtocol/aztec-packages/issues/4725)) ([faa9586](https://github.com/AztecProtocol/aztec-packages/commit/faa9586ef702e3f150e6aa8217dcbcd63611dea2))
- Address comments ([#4772](https://github.com/AztecProtocol/aztec-packages/issues/4772)) ([10d90ab](https://github.com/AztecProtocol/aztec-packages/commit/10d90ab3a15de66f4b8a64464fe8e15f33a0589d))
- **avm:** Remove some leftover files related to Avm-mini (replaced by Avm) ([#4715](https://github.com/AztecProtocol/aztec-packages/issues/4715)) ([8c697ce](https://github.com/AztecProtocol/aztec-packages/commit/8c697ce187b4bb1c66f1146ebbc39567a46f35f8))
- **bb:** Allow dynamic plookup tables ([#4667](https://github.com/AztecProtocol/aztec-packages/issues/4667)) ([5920012](https://github.com/AztecProtocol/aztec-packages/commit/592001255a999abb7167f885a5def7f8651d63a7))
- **bb:** More namespaces under bb ([#4348](https://github.com/AztecProtocol/aztec-packages/issues/4348)) ([00ba983](https://github.com/AztecProtocol/aztec-packages/commit/00ba9837606f33ccbc5c0c40be22b11a736b1608))
- **bb:** Small test improvements ([#4568](https://github.com/AztecProtocol/aztec-packages/issues/4568)) ([e23d048](https://github.com/AztecProtocol/aztec-packages/commit/e23d048e916fa12966fe01d1a8c0d3bfb50c2943))
- **bb:** Use RefArray where possible ([#4686](https://github.com/AztecProtocol/aztec-packages/issues/4686)) ([5b4e1a6](https://github.com/AztecProtocol/aztec-packages/commit/5b4e1a61216655cebb58863d26d418b23881dd02))
- Bootstrap improvements. ([#4711](https://github.com/AztecProtocol/aztec-packages/issues/4711)) ([1375233](https://github.com/AztecProtocol/aztec-packages/commit/13752339334be9c8cc0ae500d0e932f76d18a77d))
- Get rid of Honk UltraComposer ([#4875](https://github.com/AztecProtocol/aztec-packages/issues/4875)) ([7e52c29](https://github.com/AztecProtocol/aztec-packages/commit/7e52c2971b91dfb0f07c178b2adb4427363acd1e))
- Implement poseidon2 opcode ([#4446](https://github.com/AztecProtocol/aztec-packages/issues/4446)) ([491a8df](https://github.com/AztecProtocol/aztec-packages/commit/491a8dfe81a33a7552686f70833f6130da944142))
- Make first iteration of protogalaxy more efficient ([#4630](https://github.com/AztecProtocol/aztec-packages/issues/4630)) ([4c7f24f](https://github.com/AztecProtocol/aztec-packages/commit/4c7f24f8ea8c21bc8114ead67d2082a06c9c5493))
- Min noir build ([#4812](https://github.com/AztecProtocol/aztec-packages/issues/4812)) ([01dd0a9](https://github.com/AztecProtocol/aztec-packages/commit/01dd0a9318de6c69d60e15d56b0fb29d2ec51b28))
- Move remaining data out of Honk UltraComposer ([#4848](https://github.com/AztecProtocol/aztec-packages/issues/4848)) ([823e071](https://github.com/AztecProtocol/aztec-packages/commit/823e071a0988cae906c13fa47e501fe9912788dc))
- Move vk computation out of Honk Ultra composer ([#4811](https://github.com/AztecProtocol/aztec-packages/issues/4811)) ([f354e89](https://github.com/AztecProtocol/aztec-packages/commit/f354e899b4b35dd6d06699f0dbff48f7ea9ed9c3))
- Pull noir for u64 as array lengths ([#4787](https://github.com/AztecProtocol/aztec-packages/issues/4787)) ([e69b586](https://github.com/AztecProtocol/aztec-packages/commit/e69b58660ff843350e1e098d8f1a84f4ce3d3c34))
- Remove VK computation Pg prover flow; improve benchmark to reflect possible optimization ([#4639](https://github.com/AztecProtocol/aztec-packages/issues/4639)) ([c1709b3](https://github.com/AztecProtocol/aztec-packages/commit/c1709b3d5fe615d980b2ebd9283fb841d9e6a85a))
- Remove WASMTIME_ENV_HACK ([#4714](https://github.com/AztecProtocol/aztec-packages/issues/4714)) ([50f89f1](https://github.com/AztecProtocol/aztec-packages/commit/50f89f1832154d526908c55ab296aaf9bacf3608))
- Rename avm_mini to avm ([#4580](https://github.com/AztecProtocol/aztec-packages/issues/4580)) ([5896a92](https://github.com/AztecProtocol/aztec-packages/commit/5896a920bc4f5fd239d69795872567af6ccbe803)), closes [#4533](https://github.com/AztecProtocol/aztec-packages/issues/4533)
- Squash yp ypb + other build improvements. ([#4901](https://github.com/AztecProtocol/aztec-packages/issues/4901)) ([be5855c](https://github.com/AztecProtocol/aztec-packages/commit/be5855cdbd1993155bd228afbeafee2c447b46a5))
- Toy avm snake case ([#4584](https://github.com/AztecProtocol/aztec-packages/issues/4584)) ([d071768](https://github.com/AztecProtocol/aztec-packages/commit/d07176863011382c34af5d5c80c596f737369703))

### Documentation

- **yellowpaper:** AVM `call` instructions, split out sections, cleanup ([#4594](https://github.com/AztecProtocol/aztec-packages/issues/4594)) ([e63f022](https://github.com/AztecProtocol/aztec-packages/commit/e63f02265d3d2b3c2f3e2a9e35ed6201753512f5))

## [0.24.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.23.0...barretenberg-v0.24.0) (2024-02-13)

### Features

- Add hashing to stdlib transcript ([#4161](https://github.com/AztecProtocol/aztec-packages/issues/4161)) ([e78b86f](https://github.com/AztecProtocol/aztec-packages/commit/e78b86f9d25cef977b4a3790cccd37a079c8a90f))
- Added cast opcode and cast calldata ([#4423](https://github.com/AztecProtocol/aztec-packages/issues/4423)) ([e58eda8](https://github.com/AztecProtocol/aztec-packages/commit/e58eda804cbdd8a7220013ac8befacbef243b856))
- Enable gmock and upgrade gtest to 1.13 ([#4480](https://github.com/AztecProtocol/aztec-packages/issues/4480)) ([5fc02e7](https://github.com/AztecProtocol/aztec-packages/commit/5fc02e7f9227788a529c05efbc844a35ec810773))
- IVC bench ([#4515](https://github.com/AztecProtocol/aztec-packages/issues/4515)) ([d8ae42b](https://github.com/AztecProtocol/aztec-packages/commit/d8ae42b1d9ea626dc213739825576522552998ad))
- Op count timers ([#4471](https://github.com/AztecProtocol/aztec-packages/issues/4471)) ([26918de](https://github.com/AztecProtocol/aztec-packages/commit/26918de4396269eda6c66efc745cf510460a885a))
- PG + Goblin ([#4399](https://github.com/AztecProtocol/aztec-packages/issues/4399)) ([295cd55](https://github.com/AztecProtocol/aztec-packages/commit/295cd5564048ca27316c508766a2dcfc3cc1bf7e))
- Prototype native merkle trees ([#4457](https://github.com/AztecProtocol/aztec-packages/issues/4457)) ([7d5e056](https://github.com/AztecProtocol/aztec-packages/commit/7d5e0563edf3c7397ca994033b703149242cc24c))

### Bug Fixes

- Convert folding recursive verifier ops to batch mul ([#4517](https://github.com/AztecProtocol/aztec-packages/issues/4517)) ([3750b26](https://github.com/AztecProtocol/aztec-packages/commit/3750b262af14ec00edced670d1fbc3d79dfb6b11))
- Cycle_group validate_is_on_curve bug ([#4494](https://github.com/AztecProtocol/aztec-packages/issues/4494)) ([fecf3f7](https://github.com/AztecProtocol/aztec-packages/commit/fecf3f7618d1e016ea5c3afc97e4253639c1d983))
- Mul with endomorphism ([#4538](https://github.com/AztecProtocol/aztec-packages/issues/4538)) ([1f4c90d](https://github.com/AztecProtocol/aztec-packages/commit/1f4c90da7901e27d8c2abaf248fac0b51bd188f7))
- StandardCircuitBuilder create_logic_constraint and uint logic_operator ([#4530](https://github.com/AztecProtocol/aztec-packages/issues/4530)) ([ce51d20](https://github.com/AztecProtocol/aztec-packages/commit/ce51d206ab54f769654422109fb7baa3d8ce2d72))

### Miscellaneous

- **avm-circuit:** Tests use OpCode enum's instead of hardcoded values ([#4554](https://github.com/AztecProtocol/aztec-packages/issues/4554)) ([ca4dd60](https://github.com/AztecProtocol/aztec-packages/commit/ca4dd60394934347b3d7f754b26275d0d3d538f1))
- **avm:** Use some matchers gtest functionalities to improve unit tests ([#4502](https://github.com/AztecProtocol/aztec-packages/issues/4502)) ([bf4fc6c](https://github.com/AztecProtocol/aztec-packages/commit/bf4fc6c7d50957236d56b311dd0272b1dceca92f)), closes [#4495](https://github.com/AztecProtocol/aztec-packages/issues/4495)
- Create constraints for sha256 compression opcode ([#4503](https://github.com/AztecProtocol/aztec-packages/issues/4503)) ([64bef49](https://github.com/AztecProtocol/aztec-packages/commit/64bef495d5ba25bb1d4b191e139618f5c491420d))
- Little cpp style improvements ([#4528](https://github.com/AztecProtocol/aztec-packages/issues/4528)) ([dcc9ba4](https://github.com/AztecProtocol/aztec-packages/commit/dcc9ba47b34201566d9433dce6be7da7ab54ccea))
- Updating field conversion code without pointer hack ([#4537](https://github.com/AztecProtocol/aztec-packages/issues/4537)) ([94f436e](https://github.com/AztecProtocol/aztec-packages/commit/94f436ed12f17d2671dbaea8bf581fc0cda0986d))

### Documentation

- **yellowpaper:** Avm tree-access operations ([#4552](https://github.com/AztecProtocol/aztec-packages/issues/4552)) ([913f4bd](https://github.com/AztecProtocol/aztec-packages/commit/913f4bde56c6602b6db6c73c4d6001bca9c46ca4))

## [0.23.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.22.0...barretenberg-v0.23.0) (2024-02-07)

### Features

- Add additional error types to verifier contract and revert early ([#4464](https://github.com/AztecProtocol/aztec-packages/issues/4464)) ([5e16063](https://github.com/AztecProtocol/aztec-packages/commit/5e160632bb7d48e676583e1b62b604c25fc4af4e))
- Allow nested arrays and vectors in Brillig foreign calls ([#4478](https://github.com/AztecProtocol/aztec-packages/issues/4478)) ([bbfa337](https://github.com/AztecProtocol/aztec-packages/commit/bbfa3374d20b44c49870e21c61cbb2ab5f7ae117))
- **avm:** Generic bytecode deserialization ([#4441](https://github.com/AztecProtocol/aztec-packages/issues/4441)) ([934fabc](https://github.com/AztecProtocol/aztec-packages/commit/934fabc8d3706e601eb3dca546c4545b58a10006)), closes [#4304](https://github.com/AztecProtocol/aztec-packages/issues/4304)
- **bb:** Op counting mode ([#4437](https://github.com/AztecProtocol/aztec-packages/issues/4437)) ([5d00cff](https://github.com/AztecProtocol/aztec-packages/commit/5d00cff86a1f76f5279dad6a0bd4e02c8211b225))

## [0.22.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.21.0...barretenberg-v0.22.0) (2024-02-06)

### ⚠ BREAKING CHANGES

- rename bigint_neg into bigint_sub ([#4420](https://github.com/AztecProtocol/aztec-packages/issues/4420))
- Add expression width into acir ([#4014](https://github.com/AztecProtocol/aztec-packages/issues/4014))
- **acir:** Move `is_recursive` flag to be part of the circuit definition ([#4221](https://github.com/AztecProtocol/aztec-packages/issues/4221))

### Features

- Add bit size to const opcode ([#4385](https://github.com/AztecProtocol/aztec-packages/issues/4385)) ([b2a000e](https://github.com/AztecProtocol/aztec-packages/commit/b2a000e5f366721b514653456db804a704242b20))
- Add expression width into acir ([#4014](https://github.com/AztecProtocol/aztec-packages/issues/4014)) ([f09e8fc](https://github.com/AztecProtocol/aztec-packages/commit/f09e8fc3fdaf9a0e5b9f927e345bf9e819e2024c))
- Add poseidon2 hashing to native transcript ([#3718](https://github.com/AztecProtocol/aztec-packages/issues/3718)) ([afcfa71](https://github.com/AztecProtocol/aztec-packages/commit/afcfa71da760680dfe02c39cf2de068a4297b3e7))
- Allow brillig to read arrays directly from memory ([#4460](https://github.com/AztecProtocol/aztec-packages/issues/4460)) ([f99392d](https://github.com/AztecProtocol/aztec-packages/commit/f99392dace572889b34ccd000f8af252c92c3b5e))
- **avm:** Add command to call avm proving in bb binary ([#4369](https://github.com/AztecProtocol/aztec-packages/issues/4369)) ([4f6d607](https://github.com/AztecProtocol/aztec-packages/commit/4f6d607d7dce36819d84ba6ce69bbd57e0ad79a0)), closes [#4039](https://github.com/AztecProtocol/aztec-packages/issues/4039)
- **avm:** Back in avm context with macro - refactor context ([#4438](https://github.com/AztecProtocol/aztec-packages/issues/4438)) ([ccf9b17](https://github.com/AztecProtocol/aztec-packages/commit/ccf9b17495ec46df6494fa93e1c848c87a05d071))
- **bb:** Wasmtime and remote benchmarking ([#4204](https://github.com/AztecProtocol/aztec-packages/issues/4204)) ([fd27808](https://github.com/AztecProtocol/aztec-packages/commit/fd27808721b1f32b4828db5465b502cca2f1ce6c))
- Folding `Mega` instances in ProtoGalaxy ([#4340](https://github.com/AztecProtocol/aztec-packages/issues/4340)) ([8569e7c](https://github.com/AztecProtocol/aztec-packages/commit/8569e7c091c3db424a3f1c70b0749489d8574ad2))
- Implementation for bigint opcodes ([#4288](https://github.com/AztecProtocol/aztec-packages/issues/4288)) ([b61dace](https://github.com/AztecProtocol/aztec-packages/commit/b61dacee47f57a8fce6657f28b64e7a3128d0dba))
- Improve ivc bench ([#4242](https://github.com/AztecProtocol/aztec-packages/issues/4242)) ([9d28354](https://github.com/AztecProtocol/aztec-packages/commit/9d28354ecefc9f7db71c7d2f40da7eae30e133c5))
- Memory only brillig ([#4215](https://github.com/AztecProtocol/aztec-packages/issues/4215)) ([018177b](https://github.com/AztecProtocol/aztec-packages/commit/018177bc757cce3258c153a56f1f7a871fec681c))
- Revert early in verifier contract for malformed proof inputs ([#4453](https://github.com/AztecProtocol/aztec-packages/issues/4453)) ([d4a7716](https://github.com/AztecProtocol/aztec-packages/commit/d4a7716800a5f67ec55f7f85beeb439f11b11d4d))
- Validate verification key on contract deployment ([#4450](https://github.com/AztecProtocol/aztec-packages/issues/4450)) ([00f9966](https://github.com/AztecProtocol/aztec-packages/commit/00f996631130b9a284f29adff4ce5bcc5ad70b1b))

### Bug Fixes

- Bb build ([#4317](https://github.com/AztecProtocol/aztec-packages/issues/4317)) ([82f5f03](https://github.com/AztecProtocol/aztec-packages/commit/82f5f03acdaee8e23b149369cb9e6f89f257b757))
- Mac build ([#4336](https://github.com/AztecProtocol/aztec-packages/issues/4336)) ([aeb4cf0](https://github.com/AztecProtocol/aztec-packages/commit/aeb4cf0d9cec6127cac947c4f0de8e853b2f34e0))
- Release the size of goblin translator ([#4259](https://github.com/AztecProtocol/aztec-packages/issues/4259)) ([6e1d958](https://github.com/AztecProtocol/aztec-packages/commit/6e1d958badafdbe4abdc0c221047186c5da69be4))

### Miscellaneous

- Acir-simulator -&gt; simulator ([#4439](https://github.com/AztecProtocol/aztec-packages/issues/4439)) ([bccd809](https://github.com/AztecProtocol/aztec-packages/commit/bccd809183f18a0d6fc05bfcdffa78ba1169e894))
- **acir:** Move `is_recursive` flag to be part of the circuit definition ([#4221](https://github.com/AztecProtocol/aztec-packages/issues/4221)) ([9c965a7](https://github.com/AztecProtocol/aztec-packages/commit/9c965a7c9e652dfeaba2f09152e5db287407473d))
- Collapse bb::honk ([#4318](https://github.com/AztecProtocol/aztec-packages/issues/4318)) ([5853af4](https://github.com/AztecProtocol/aztec-packages/commit/5853af448a86ed02901609f4786e86fe1651880e))
- Extract merge from UC and simplify ([#4343](https://github.com/AztecProtocol/aztec-packages/issues/4343)) ([54fd794](https://github.com/AztecProtocol/aztec-packages/commit/54fd7949cdbb0e213c37ce331f7546e2827f4c17))
- Fix bb wasm build when using remote cache ([#4397](https://github.com/AztecProtocol/aztec-packages/issues/4397)) ([14e57cb](https://github.com/AztecProtocol/aztec-packages/commit/14e57cb285571208c5f88f0eaf500b1e7859ef04))
- Poseidon2 hash uses span instead of vector ([#4003](https://github.com/AztecProtocol/aztec-packages/issues/4003)) ([f63e7a9](https://github.com/AztecProtocol/aztec-packages/commit/f63e7a94b1ba555eecbe08b7114e8b6ad0b82bc0))
- Rename bigint_neg into bigint_sub ([#4420](https://github.com/AztecProtocol/aztec-packages/issues/4420)) ([57824fe](https://github.com/AztecProtocol/aztec-packages/commit/57824feff268153a7a33b90a3dc68d5bc98a2471))

## [0.21.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.20.0...barretenberg-v0.21.0) (2024-01-30)

### ⚠ BREAKING CHANGES

- add opcode for sha256 compression function ([#4229](https://github.com/AztecProtocol/aztec-packages/issues/4229))
- add opcode for poseidon2 permutation ([#4214](https://github.com/AztecProtocol/aztec-packages/issues/4214))
- remove ec_double opcode ([#4210](https://github.com/AztecProtocol/aztec-packages/issues/4210))
- Add big int opcodes (without implementation) ([#4050](https://github.com/AztecProtocol/aztec-packages/issues/4050))

### Features

- **3738:** AVM basic arithmetic operations for non ff types ([#3881](https://github.com/AztecProtocol/aztec-packages/issues/3881)) ([457a3f9](https://github.com/AztecProtocol/aztec-packages/commit/457a3f9b0c05f58cc88ef43763c5d55b6debaf05)), closes [#3996](https://github.com/AztecProtocol/aztec-packages/issues/3996)
- Add big int opcodes (without implementation) ([#4050](https://github.com/AztecProtocol/aztec-packages/issues/4050)) ([bcab9ce](https://github.com/AztecProtocol/aztec-packages/commit/bcab9ceab62bede3bc1c105b3e639e7c64e3217a))
- Add opcode for poseidon2 permutation ([#4214](https://github.com/AztecProtocol/aztec-packages/issues/4214)) ([53c5ba5](https://github.com/AztecProtocol/aztec-packages/commit/53c5ba5fa2a86aba16bba8aa8d3a594a789e3e24))
- Add opcode for sha256 compression function ([#4229](https://github.com/AztecProtocol/aztec-packages/issues/4229)) ([ac25ff7](https://github.com/AztecProtocol/aztec-packages/commit/ac25ff737a934a5f260605f4497e4074c3ed5824))
- **avm:** Bytecode avm control flow ([#4253](https://github.com/AztecProtocol/aztec-packages/issues/4253)) ([fb1d742](https://github.com/AztecProtocol/aztec-packages/commit/fb1d7420860a35e68b987e790abdaba18595219b)), closes [#4209](https://github.com/AztecProtocol/aztec-packages/issues/4209)
- **avm:** Bytecode parsing and proof generation ([#4191](https://github.com/AztecProtocol/aztec-packages/issues/4191)) ([6c70548](https://github.com/AztecProtocol/aztec-packages/commit/6c70548a98c8e01bc7925d98ece9a2eda4139f69)), closes [#3791](https://github.com/AztecProtocol/aztec-packages/issues/3791)
- Implement Embedded EC add and double opcodes ([#3982](https://github.com/AztecProtocol/aztec-packages/issues/3982)) ([ccb7bff](https://github.com/AztecProtocol/aztec-packages/commit/ccb7bff8e16ea9c8bc4bd48754db59857137507e))
- Produce graph of internal Barretenberg dependencies ([#4225](https://github.com/AztecProtocol/aztec-packages/issues/4225)) ([88e7923](https://github.com/AztecProtocol/aztec-packages/commit/88e7923ed2ecd747b65f72c5955016c6a1b80b9f))
- Recursive folding and decider verifier for Protogalaxy ([#4156](https://github.com/AztecProtocol/aztec-packages/issues/4156)) ([9342048](https://github.com/AztecProtocol/aztec-packages/commit/93420480603b2dfa126e5bddb08cd768b7093352))
- Remove ec_double opcode ([#4210](https://github.com/AztecProtocol/aztec-packages/issues/4210)) ([75f26c4](https://github.com/AztecProtocol/aztec-packages/commit/75f26c4f2a9cf185891234eab6ec4f213d31fc50))
- Replace single bit range constraints with basic bool gates ([#4164](https://github.com/AztecProtocol/aztec-packages/issues/4164)) ([0a3553b](https://github.com/AztecProtocol/aztec-packages/commit/0a3553b10e02374843181901709933975dc36bb4))

### Bug Fixes

- **bb:** .gitignore ([#4201](https://github.com/AztecProtocol/aztec-packages/issues/4201)) ([a56e418](https://github.com/AztecProtocol/aztec-packages/commit/a56e418b0fe90b77b7a9fd6bcb0e40cd15260fd6))
- Generic Honk dependencies ([#4239](https://github.com/AztecProtocol/aztec-packages/issues/4239)) ([382dfbe](https://github.com/AztecProtocol/aztec-packages/commit/382dfbed6aa4c6da7b3c897f8a5f9639843d7037))

### Miscellaneous

- **bb:** Rearrange namespaces ([#4147](https://github.com/AztecProtocol/aztec-packages/issues/4147)) ([5de0a8e](https://github.com/AztecProtocol/aztec-packages/commit/5de0a8e8dce2483230cccb1d716613966089f2f6))
- Delete C++ PK circuits ([#4219](https://github.com/AztecProtocol/aztec-packages/issues/4219)) ([9136d32](https://github.com/AztecProtocol/aztec-packages/commit/9136d32268db350779d51e45884368be3a694220))

### Documentation

- **bb:** How to use docker_interactive.sh ([#4220](https://github.com/AztecProtocol/aztec-packages/issues/4220)) ([f44c6b1](https://github.com/AztecProtocol/aztec-packages/commit/f44c6b173856331a6ca4d00d50436671735172a2))

## [0.20.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.19.0...barretenberg-v0.20.0) (2024-01-22)

### Features

- Benchmark commit function ([#4178](https://github.com/AztecProtocol/aztec-packages/issues/4178)) ([ea84085](https://github.com/AztecProtocol/aztec-packages/commit/ea840857d8134c9af6f233b414f6d990cd2abd6d))
- Goblin acir composer ([#4112](https://github.com/AztecProtocol/aztec-packages/issues/4112)) ([5e85b92](https://github.com/AztecProtocol/aztec-packages/commit/5e85b92f48bc31fe55315de9f45c4907e417cb6a))

### Bug Fixes

- Make CMake version warning fatal ([#4144](https://github.com/AztecProtocol/aztec-packages/issues/4144)) ([b1443fa](https://github.com/AztecProtocol/aztec-packages/commit/b1443faf9d8f308dbad6d0aa365b1feb8385557d))
- Reinstate Ultra arith rec verifier test ([#3886](https://github.com/AztecProtocol/aztec-packages/issues/3886)) ([995973b](https://github.com/AztecProtocol/aztec-packages/commit/995973b0226ddd7ae4cb5c3501859bec10f4eb93))
- Upload_benchmarks_to_s3.sh missing exit ([#4046](https://github.com/AztecProtocol/aztec-packages/issues/4046)) ([52a9327](https://github.com/AztecProtocol/aztec-packages/commit/52a93279e43ae6780e8bfc253ee0570a443ed472))

### Miscellaneous

- **bb:** More concise namespaces, plookup =&gt; bb::plookup ([#4146](https://github.com/AztecProtocol/aztec-packages/issues/4146)) ([14d39ed](https://github.com/AztecProtocol/aztec-packages/commit/14d39edbe1a6753849581a664184d4e98baf923d))
- **bb:** Namespace plonk::stdlib =&gt; stdlib ([#4117](https://github.com/AztecProtocol/aztec-packages/issues/4117)) ([cd2f67f](https://github.com/AztecProtocol/aztec-packages/commit/cd2f67f5cbc471b9120f7c7070b96ba0d4994865))
- **bb:** Namespace proof_system=&gt;bb ([#4116](https://github.com/AztecProtocol/aztec-packages/issues/4116)) ([7438db3](https://github.com/AztecProtocol/aztec-packages/commit/7438db31b29860aa2c0af54afa8413711a24e1eb))
- Remove mutex dependency ([#4160](https://github.com/AztecProtocol/aztec-packages/issues/4160)) ([3b82be0](https://github.com/AztecProtocol/aztec-packages/commit/3b82be0f266c838c823bbe26cfea99337d7180a9))
- Remove unwanted submodules ([#4085](https://github.com/AztecProtocol/aztec-packages/issues/4085)) ([dda7c9c](https://github.com/AztecProtocol/aztec-packages/commit/dda7c9c4fa8da54d28b99b1cf601328030485503))

## [0.19.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.18.0...barretenberg-v0.19.0) (2024-01-17)

### ⚠ BREAKING CHANGES

- Start witness of ACIR generated by Noir start at zero not one ([#3961](https://github.com/AztecProtocol/aztec-packages/issues/3961))

### Features

- Remove dangerous function ([#4007](https://github.com/AztecProtocol/aztec-packages/issues/4007)) ([b3790eb](https://github.com/AztecProtocol/aztec-packages/commit/b3790ebfc3f6f62a30dc1b222b4cafaef8effb98))

### Bug Fixes

- Fix various warnings in `noir-protocol-circuits` ([#4048](https://github.com/AztecProtocol/aztec-packages/issues/4048)) ([470d046](https://github.com/AztecProtocol/aztec-packages/commit/470d046fe54c8b4e76d20ca3dbe8e128355b384f))
- Start witness of ACIR generated by Noir start at zero not one ([#3961](https://github.com/AztecProtocol/aztec-packages/issues/3961)) ([4cdc096](https://github.com/AztecProtocol/aztec-packages/commit/4cdc0963777de138bf5275dd657a738ae6f020d3))

### Miscellaneous

- Barretenberg =&gt; bb namespace shortening ([#4066](https://github.com/AztecProtocol/aztec-packages/issues/4066)) ([e6b66b8](https://github.com/AztecProtocol/aztec-packages/commit/e6b66b856db498e6fc465212f3645cf2c196c31a))

## [0.18.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.17.0...barretenberg-v0.18.0) (2024-01-16)

### ⚠ BREAKING CHANGES

- Remove `Directive::Quotient` ([#4019](https://github.com/AztecProtocol/aztec-packages/issues/4019))
- implement keccakf1600 in brillig ([#3914](https://github.com/AztecProtocol/aztec-packages/issues/3914))
- add blake3 opcode to brillig ([#3913](https://github.com/AztecProtocol/aztec-packages/issues/3913))
- Remove opcode supported from the backend ([#3889](https://github.com/AztecProtocol/aztec-packages/issues/3889))

### Features

- Acir cleanup ([#3845](https://github.com/AztecProtocol/aztec-packages/issues/3845)) ([390b84c](https://github.com/AztecProtocol/aztec-packages/commit/390b84ced39ea8ed76c291019e63d18a772f7c3c))
- Add ACIR opcodes for ECADD and ECDOUBLE ([#3878](https://github.com/AztecProtocol/aztec-packages/issues/3878)) ([537630f](https://github.com/AztecProtocol/aztec-packages/commit/537630ffe1b3747a03aa821687e33db04b1fe3ad))
- Add blake3 opcode to brillig ([#3913](https://github.com/AztecProtocol/aztec-packages/issues/3913)) ([34fad0a](https://github.com/AztecProtocol/aztec-packages/commit/34fad0a76c58139b4b56f372aa6f39f897286b3a))
- Bench bb in pr's, docker shell utils ([#3561](https://github.com/AztecProtocol/aztec-packages/issues/3561)) ([5408919](https://github.com/AztecProtocol/aztec-packages/commit/54089190a4532988cec9f88d199263aeafa2c2f3))
- Benchmark protogalaxy prover ([#3958](https://github.com/AztecProtocol/aztec-packages/issues/3958)) ([5843722](https://github.com/AztecProtocol/aztec-packages/commit/5843722ff5e888bf858016c6d005af37fac42e1c))
- Benchmarks for basic functionality and IPA improvements ([#4004](https://github.com/AztecProtocol/aztec-packages/issues/4004)) ([fd1f619](https://github.com/AztecProtocol/aztec-packages/commit/fd1f619f443916c172b6311aa71a84153145ef4d))
- Bootstrap cache v2 ([#3876](https://github.com/AztecProtocol/aztec-packages/issues/3876)) ([331598d](https://github.com/AztecProtocol/aztec-packages/commit/331598d369ab9bb91dcc48d50bdd8df0684f0b79))
- Implement keccakf1600 in brillig ([#3914](https://github.com/AztecProtocol/aztec-packages/issues/3914)) ([a182381](https://github.com/AztecProtocol/aztec-packages/commit/a18238180cbd6c71f75fcfcb1a093ac29c839aeb))
- Parallel IPA ([#3882](https://github.com/AztecProtocol/aztec-packages/issues/3882)) ([7002a33](https://github.com/AztecProtocol/aztec-packages/commit/7002a332da3bb9a75d5164a068a2bd9ea1ad211a))
- Pil lookups w/ xor table example ([#3880](https://github.com/AztecProtocol/aztec-packages/issues/3880)) ([544d24e](https://github.com/AztecProtocol/aztec-packages/commit/544d24e419a604c4720988315239e365f06205b1))
- Poseidon2 stdlib impl ([#3551](https://github.com/AztecProtocol/aztec-packages/issues/3551)) ([50b4a72](https://github.com/AztecProtocol/aztec-packages/commit/50b4a728b4c20503f6ab56c07feaa29d767cec10))
- Protogalaxy Decider and complete folding tests ([#3657](https://github.com/AztecProtocol/aztec-packages/issues/3657)) ([cfdaf9c](https://github.com/AztecProtocol/aztec-packages/commit/cfdaf9c1980356764a0bed88bc01358b8e807bd0))
- Relations vs widgets benchmarking ([#3931](https://github.com/AztecProtocol/aztec-packages/issues/3931)) ([3af64ef](https://github.com/AztecProtocol/aztec-packages/commit/3af64eff3a32922849cb0fd1977ee89a6ea7cd07))
- Remove opcode supported from the backend ([#3889](https://github.com/AztecProtocol/aztec-packages/issues/3889)) ([1fd135c](https://github.com/AztecProtocol/aztec-packages/commit/1fd135cb61a0b0419a339743c2a4fa9890d62720))
- Reorganize acir composer ([#3957](https://github.com/AztecProtocol/aztec-packages/issues/3957)) ([e6232e8](https://github.com/AztecProtocol/aztec-packages/commit/e6232e8ded1fa731565b17b77b0b2be80b2ef6e2))
- Standalone calldata test ([#3842](https://github.com/AztecProtocol/aztec-packages/issues/3842)) ([7353a35](https://github.com/AztecProtocol/aztec-packages/commit/7353a358aa3f364d1d31fd00c73a9e1a4b6dff4e))

### Bug Fixes

- Bb unnecessary env var ([#3901](https://github.com/AztecProtocol/aztec-packages/issues/3901)) ([f127e5a](https://github.com/AztecProtocol/aztec-packages/commit/f127e5a4176d00e641c8f2308ebf105f415cb914))

### Miscellaneous

- Codegen acir opcodes after renaming arithmetic to assertzero ([#3896](https://github.com/AztecProtocol/aztec-packages/issues/3896)) ([c710ce1](https://github.com/AztecProtocol/aztec-packages/commit/c710ce19eaa3fbcf7c83957e7341a6ca10677ef1))
- Document `witness_buf_to_witness_data` ([#3940](https://github.com/AztecProtocol/aztec-packages/issues/3940)) ([fbaa726](https://github.com/AztecProtocol/aztec-packages/commit/fbaa72641c50cc7f05712e266416f12c4edf8fe9))
- Remove 'extern template's, expand macros ([#3953](https://github.com/AztecProtocol/aztec-packages/issues/3953)) ([5fe9908](https://github.com/AztecProtocol/aztec-packages/commit/5fe99085963cec32a2d411b95ab8887578a90253))
- Remove `Directive::Quotient` ([#4019](https://github.com/AztecProtocol/aztec-packages/issues/4019)) ([824d76f](https://github.com/AztecProtocol/aztec-packages/commit/824d76f363180821678238f1474a00520f781758))
- Reorganize benchmarks ([#3909](https://github.com/AztecProtocol/aztec-packages/issues/3909)) ([730766b](https://github.com/AztecProtocol/aztec-packages/commit/730766b07d9521c0ec6c0606042b506edbc5db48))

## [0.17.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.16.9...barretenberg-v0.17.0) (2024-01-09)

### ⚠ BREAKING CHANGES

- Remove aggregation objects from RecursionConstraint ([#3885](https://github.com/AztecProtocol/aztec-packages/issues/3885))
- Noir development branch (serialization changes) ([#3858](https://github.com/AztecProtocol/aztec-packages/issues/3858))
- Add Side effect counter struct for ordering ([#3608](https://github.com/AztecProtocol/aztec-packages/issues/3608))
- return full verification contract from `AcirComposer::get_solidity_verifier` ([#3735](https://github.com/AztecProtocol/aztec-packages/issues/3735))

### Features

- Adding option to set initial and max memory ([#3265](https://github.com/AztecProtocol/aztec-packages/issues/3265)) ([0ad75fe](https://github.com/AztecProtocol/aztec-packages/commit/0ad75fe745099119726976f964a92d1587f32fbf))
- **avm-main:** Pil -&gt; permutations ([#3650](https://github.com/AztecProtocol/aztec-packages/issues/3650)) ([c52acf6](https://github.com/AztecProtocol/aztec-packages/commit/c52acf64cf00443867f8f578a1c25cda49583faf))
- **avm-mini:** Call and return opcodes ([#3704](https://github.com/AztecProtocol/aztec-packages/issues/3704)) ([e534204](https://github.com/AztecProtocol/aztec-packages/commit/e534204c760db31eb1347cd76e85d151a1fb8305))
- **avm:** Add standalone jump opcode ([#3781](https://github.com/AztecProtocol/aztec-packages/issues/3781)) ([b1b2e7c](https://github.com/AztecProtocol/aztec-packages/commit/b1b2e7ca28ba56cf0bae0f906734df00458714b9))
- **avm:** VM circuit handles tagged memory ([#3725](https://github.com/AztecProtocol/aztec-packages/issues/3725)) ([739fe90](https://github.com/AztecProtocol/aztec-packages/commit/739fe90a50891d99b03a8f34da556c8725673f80)), closes [#3644](https://github.com/AztecProtocol/aztec-packages/issues/3644)
- Barretenberg doxygen CI ([#3818](https://github.com/AztecProtocol/aztec-packages/issues/3818)) ([022a918](https://github.com/AztecProtocol/aztec-packages/commit/022a918911817b1897fd69ea72da84054450c8cb))
- Bb uses goblin ([#3636](https://github.com/AztecProtocol/aztec-packages/issues/3636)) ([d093266](https://github.com/AztecProtocol/aztec-packages/commit/d09326636140dbd68d3efb8bc4ec2b6948e2bfe1))
- Correct circuit construction from acir ([#3757](https://github.com/AztecProtocol/aztec-packages/issues/3757)) ([a876ab8](https://github.com/AztecProtocol/aztec-packages/commit/a876ab8a61108be06bd5d884d727058e7e54a383))
- Goblin and eccvm bench ([#3606](https://github.com/AztecProtocol/aztec-packages/issues/3606)) ([1fe63b2](https://github.com/AztecProtocol/aztec-packages/commit/1fe63b2cf5b83fef576bb99294700743929d5ec7))
- Goblinize the final ecc ops in ZM ([#3741](https://github.com/AztecProtocol/aztec-packages/issues/3741)) ([3048d08](https://github.com/AztecProtocol/aztec-packages/commit/3048d0820c89f3bcce38913d3744cf5be1ece14f))
- Noir development branch (serialization changes) ([#3858](https://github.com/AztecProtocol/aztec-packages/issues/3858)) ([d2ae2cd](https://github.com/AztecProtocol/aztec-packages/commit/d2ae2cd529b0ef132c0b6c7c35938066c89d809c))
- ProverPolynomials owns its memory ([#3560](https://github.com/AztecProtocol/aztec-packages/issues/3560)) ([a4aba00](https://github.com/AztecProtocol/aztec-packages/commit/a4aba0061929c96bf9cccb64916f96011688a3e1))
- Return full verification contract from `AcirComposer::get_solidity_verifier` ([#3735](https://github.com/AztecProtocol/aztec-packages/issues/3735)) ([bd5614c](https://github.com/AztecProtocol/aztec-packages/commit/bd5614c2ee04065e149d3df48f1ace9c0ce3858f))

### Bug Fixes

- CRS not needed for gate_count. Grumpkin not needed for non-goblin. ([#3872](https://github.com/AztecProtocol/aztec-packages/issues/3872)) ([8cda00d](https://github.com/AztecProtocol/aztec-packages/commit/8cda00d94946ed7e8dfc1dbafdefae3e6d1af682))
- Disable goblin bbjs tests ([#3836](https://github.com/AztecProtocol/aztec-packages/issues/3836)) ([1f5b2c6](https://github.com/AztecProtocol/aztec-packages/commit/1f5b2c606def0c7203cbd7497264c95bbfa708e1))
- Reenable goblin bbjs for a single test ([#3838](https://github.com/AztecProtocol/aztec-packages/issues/3838)) ([30e47a0](https://github.com/AztecProtocol/aztec-packages/commit/30e47a005c39ae0af80ef33b83251d04046191dc))
- Update toy to new master ([78cf525](https://github.com/AztecProtocol/aztec-packages/commit/78cf525dcacba77386779a74b6f806fba47f1bc7))

### Miscellaneous

- Add Side effect counter struct for ordering ([#3608](https://github.com/AztecProtocol/aztec-packages/issues/3608)) ([c58b197](https://github.com/AztecProtocol/aztec-packages/commit/c58b197512297a292cfddd253d8d951b207829a0))
- Align bb.js testing ([#3840](https://github.com/AztecProtocol/aztec-packages/issues/3840)) ([c489727](https://github.com/AztecProtocol/aztec-packages/commit/c4897270515f23891a32807dd2be046be12d5095))
- **avm:** Avm memory trace building ([#3835](https://github.com/AztecProtocol/aztec-packages/issues/3835)) ([b7766d6](https://github.com/AztecProtocol/aztec-packages/commit/b7766d68727c92f92abc91131a4332db25d805dd))
- Bring boxes back to CI. Build and run using docker/docker-compose. ([#3727](https://github.com/AztecProtocol/aztec-packages/issues/3727)) ([4a1c0df](https://github.com/AztecProtocol/aztec-packages/commit/4a1c0df76f26530521daaaa60945fead106b555e))
- Cleanup recursion interface ([#3744](https://github.com/AztecProtocol/aztec-packages/issues/3744)) ([fde0ac3](https://github.com/AztecProtocol/aztec-packages/commit/fde0ac3e96fe6e2edcdb1e6919d372e96181eda5))
- **dsl:** Abstract nested aggregation object from ACIR ([#3765](https://github.com/AztecProtocol/aztec-packages/issues/3765)) ([92f72e4](https://github.com/AztecProtocol/aztec-packages/commit/92f72e44d4b57a3078da6bd1bb39dd0f615785be))
- Remove aggregation objects from RecursionConstraint ([#3885](https://github.com/AztecProtocol/aztec-packages/issues/3885)) ([9a80008](https://github.com/AztecProtocol/aztec-packages/commit/9a80008c623a9d26e1b82c9e86561c304ef185f1))
- Remove HashToField128Security ACIR opcode ([#3631](https://github.com/AztecProtocol/aztec-packages/issues/3631)) ([1d6d3c9](https://github.com/AztecProtocol/aztec-packages/commit/1d6d3c94f327de1f20ef7d78302d3957db70019e))
- Use simple "flat" CRS. ([#3748](https://github.com/AztecProtocol/aztec-packages/issues/3748)) ([5c6c2ca](https://github.com/AztecProtocol/aztec-packages/commit/5c6c2caf212fb22856df41fd15464dda37e10dab))

## [0.16.9](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.16.8...barretenberg-v0.16.9) (2023-12-13)

### Miscellaneous

- **barretenberg:** Synchronize aztec-packages versions

## [0.16.8](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.16.7...barretenberg-v0.16.8) (2023-12-13)

### Features

- Complete folding prover and verifier for ultra instances ([#3419](https://github.com/AztecProtocol/aztec-packages/issues/3419)) ([bb86ce9](https://github.com/AztecProtocol/aztec-packages/commit/bb86ce9a27e09b8a336af04b787b81d5f1d49ac8))
- Copy constructors for builders ([#3635](https://github.com/AztecProtocol/aztec-packages/issues/3635)) ([b82b0c5](https://github.com/AztecProtocol/aztec-packages/commit/b82b0c579c4a315c9b4eaf3e9726275633603b5a))
- Log-derivative based generic permutations for AVM ([#3428](https://github.com/AztecProtocol/aztec-packages/issues/3428)) ([379b5ad](https://github.com/AztecProtocol/aztec-packages/commit/379b5adc259ac69b01e61b852172cdfc87cf9350))
- Merge recursive verifier ([#3588](https://github.com/AztecProtocol/aztec-packages/issues/3588)) ([cdd9259](https://github.com/AztecProtocol/aztec-packages/commit/cdd92595c313617189a530e0bfda987db211ae6b))

### Bug Fixes

- Aztec sandbox compose fixes ([#3634](https://github.com/AztecProtocol/aztec-packages/issues/3634)) ([765a19c](https://github.com/AztecProtocol/aztec-packages/commit/765a19c3aad3a2793a764b970b7cc8a819094da7))
- Broken uint256_t implicit copy ([#3625](https://github.com/AztecProtocol/aztec-packages/issues/3625)) ([1a6b44d](https://github.com/AztecProtocol/aztec-packages/commit/1a6b44d67e077eb5904ab30255454693d6a1edac))

### Miscellaneous

- Nuke fib ([#3607](https://github.com/AztecProtocol/aztec-packages/issues/3607)) ([48e2e3d](https://github.com/AztecProtocol/aztec-packages/commit/48e2e3d261a7091cb0b87565ec8bc9ae595b3022))

## [0.16.7](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.16.6...barretenberg-v0.16.7) (2023-12-06)

### Features

- Encapsulated Goblin ([#3524](https://github.com/AztecProtocol/aztec-packages/issues/3524)) ([2f08423](https://github.com/AztecProtocol/aztec-packages/commit/2f08423e37942f991634fe6c45de52feb1f159cf))

## [0.16.6](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.16.5...barretenberg-v0.16.6) (2023-12-06)

### Miscellaneous

- **barretenberg:** Synchronize aztec-packages versions

## [0.16.5](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.16.4...barretenberg-v0.16.5) (2023-12-06)

### Miscellaneous

- Trivial change roundup ([#3556](https://github.com/AztecProtocol/aztec-packages/issues/3556)) ([ff893b2](https://github.com/AztecProtocol/aztec-packages/commit/ff893b236091b480b6de18ebaab57c62dcdfe1d4))

### Documentation

- Add libstdc++-12-dev to setup instructions ([#3585](https://github.com/AztecProtocol/aztec-packages/issues/3585)) ([9773e8c](https://github.com/AztecProtocol/aztec-packages/commit/9773e8c3b4789f0dd6b5fdaf0f283b9bd7c9812f))

## [0.16.4](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.16.3...barretenberg-v0.16.4) (2023-12-05)

### Miscellaneous

- **barretenberg:** Synchronize aztec-packages versions

## [0.16.3](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.16.2...barretenberg-v0.16.3) (2023-12-05)

### Miscellaneous

- CLI's startup time was pushing almost 2s. This gets the basic 'help' down to 0.16. ([#3529](https://github.com/AztecProtocol/aztec-packages/issues/3529)) ([396df13](https://github.com/AztecProtocol/aztec-packages/commit/396df13389cdcb8b8b0d5a92a4b3d1c2bffcb7a7))

## [0.16.2](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.16.1...barretenberg-v0.16.2) (2023-12-05)

### Features

- **AVM:** First version for mini AVM (ADD, RETURN, CALLDATACOPY) ([#3439](https://github.com/AztecProtocol/aztec-packages/issues/3439)) ([b3af146](https://github.com/AztecProtocol/aztec-packages/commit/b3af1463ed6b7858252ab4779f8c747a6de47363))
- Flavor refactor, reduce duplication ([#3407](https://github.com/AztecProtocol/aztec-packages/issues/3407)) ([8d6b013](https://github.com/AztecProtocol/aztec-packages/commit/8d6b01304d797f7cbb576b23a7e115390d113c79))
- New Poseidon2 circuit builder gates ([#3346](https://github.com/AztecProtocol/aztec-packages/issues/3346)) ([91cb369](https://github.com/AztecProtocol/aztec-packages/commit/91cb369aa7ecbf457965f53057cafa2c2e6f1214))
- New Poseidon2 relations ([#3406](https://github.com/AztecProtocol/aztec-packages/issues/3406)) ([14b9736](https://github.com/AztecProtocol/aztec-packages/commit/14b9736925c6da33133bd24ee283fb4c199082a5))
- Pull latest noir for brillig optimizations ([#3464](https://github.com/AztecProtocol/aztec-packages/issues/3464)) ([d356bac](https://github.com/AztecProtocol/aztec-packages/commit/d356bac740d203fbb9363a0127ca1d433358e029))
- Seperate pil files for sub machines ([#3454](https://github.com/AztecProtocol/aztec-packages/issues/3454)) ([d09d6f5](https://github.com/AztecProtocol/aztec-packages/commit/d09d6f5a5f2c7e2a58658a640a6a6d6ba4294701))

### Miscellaneous

- **avm:** Enable AVM unit tests in CI ([#3463](https://github.com/AztecProtocol/aztec-packages/issues/3463)) ([051dda9](https://github.com/AztecProtocol/aztec-packages/commit/051dda9c50f1d9f11f5063ddf51c9986a6998b43)), closes [#3461](https://github.com/AztecProtocol/aztec-packages/issues/3461)
- **bb:** Pointer_view to reference-based get_all ([#3495](https://github.com/AztecProtocol/aztec-packages/issues/3495)) ([50d7327](https://github.com/AztecProtocol/aztec-packages/commit/50d73271919306a05ac3a7c2e7d37363b6761248))
- **bb:** Reuse entities from Mega in MegaRecursive ([#3521](https://github.com/AztecProtocol/aztec-packages/issues/3521)) ([8259636](https://github.com/AztecProtocol/aztec-packages/commit/8259636c016c0adecb052f176e78444fb5481c38))
- Build the acir test vectors as part of CI. ([#3447](https://github.com/AztecProtocol/aztec-packages/issues/3447)) ([1a2d1f8](https://github.com/AztecProtocol/aztec-packages/commit/1a2d1f822d0e1fabd322c2c4d0473629edd56380))
- Field-agnostic and reusable transcript ([#3433](https://github.com/AztecProtocol/aztec-packages/issues/3433)) ([d78775a](https://github.com/AztecProtocol/aztec-packages/commit/d78775adb9574a3d76c3fca8cf940cdef460ae10))
- Optimise bb.js package size and sandox/cli dockerfiles to unbloat final containers. ([#3462](https://github.com/AztecProtocol/aztec-packages/issues/3462)) ([cb3db5d](https://github.com/AztecProtocol/aztec-packages/commit/cb3db5d0f1f8912f1a97258e5043eb0f69eff551))
- Pin node version in docker base images and bump nvmrc ([#3537](https://github.com/AztecProtocol/aztec-packages/issues/3537)) ([5d3895a](https://github.com/AztecProtocol/aztec-packages/commit/5d3895aefb7812eb6bd8017baf43533959ad69b4))
- Recursive verifier updates ([#3452](https://github.com/AztecProtocol/aztec-packages/issues/3452)) ([dbb4a12](https://github.com/AztecProtocol/aztec-packages/commit/dbb4a1205528bdd8217ea2d15ccf060e2aa9b7d2))
- Refactor `WitnessEntities` to be able to derive `WitnessCommitments` from it ([#3479](https://github.com/AztecProtocol/aztec-packages/issues/3479)) ([9c9b561](https://github.com/AztecProtocol/aztec-packages/commit/9c9b561f392de5fce11cefe4d72e4f33f2567f41))
- Transcript handled through shared_ptr ([#3434](https://github.com/AztecProtocol/aztec-packages/issues/3434)) ([30fca33](https://github.com/AztecProtocol/aztec-packages/commit/30fca3307ee7e33d81fd51c3d280c6362baef0b9))
- Typo fixes ([#3488](https://github.com/AztecProtocol/aztec-packages/issues/3488)) ([d9a44dc](https://github.com/AztecProtocol/aztec-packages/commit/d9a44dc2e655752e1c6503ac85b64169ec7e4754))

## [0.16.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.16.0...barretenberg-v0.16.1) (2023-11-28)

### Features

- Added poseidon2 hash function to barretenberg/crypto ([#3118](https://github.com/AztecProtocol/aztec-packages/issues/3118)) ([d47782b](https://github.com/AztecProtocol/aztec-packages/commit/d47782bb480f7e016dbc77cf962978ddca0632aa))

### Miscellaneous

- Point acir tests at noir master branch ([#3440](https://github.com/AztecProtocol/aztec-packages/issues/3440)) ([106e690](https://github.com/AztecProtocol/aztec-packages/commit/106e690993cdc10db85903d91af873c04744c05f))

## [0.16.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.15.1...barretenberg-v0.16.0) (2023-11-27)

### Features

- Goblin proof construction ([#3332](https://github.com/AztecProtocol/aztec-packages/issues/3332)) ([6a7ebb6](https://github.com/AztecProtocol/aztec-packages/commit/6a7ebb60e4ecf0ae0d047814e22ecd88c9c7528f))
- Noir subrepo. ([#3369](https://github.com/AztecProtocol/aztec-packages/issues/3369)) ([d94d88b](https://github.com/AztecProtocol/aztec-packages/commit/d94d88bf626ddbe41dd1b7fe3eb0f11619dde97a))

### Miscellaneous

- Deterministically deduplicate `cached_partial_non_native_field_multiplication` across wasm32 and native compilations ([#3425](https://github.com/AztecProtocol/aztec-packages/issues/3425)) ([5524933](https://github.com/AztecProtocol/aztec-packages/commit/55249336212764da4b85634e7d35e8fedb147619))
- Plumbs noir subrepo into yarn-project. ([#3420](https://github.com/AztecProtocol/aztec-packages/issues/3420)) ([63173c4](https://github.com/AztecProtocol/aztec-packages/commit/63173c45db127288bc4b079229239a650fc5d4be))
- Update path to acir artifacts ([#3426](https://github.com/AztecProtocol/aztec-packages/issues/3426)) ([f56f88d](https://github.com/AztecProtocol/aztec-packages/commit/f56f88de05a0ebfcc34c279ae869956a48baa0f4))

## [0.15.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.15.0...barretenberg-v0.15.1) (2023-11-21)

### Features

- **bb:** Add ability to write pk to file or stdout ([#3335](https://github.com/AztecProtocol/aztec-packages/issues/3335)) ([c99862c](https://github.com/AztecProtocol/aztec-packages/commit/c99862c9602d7d37f7fef348e9f014fb137adab1))
- DataBus PoC (UltraHonk as extension of Ultra) ([#3181](https://github.com/AztecProtocol/aztec-packages/issues/3181)) ([dd9dd84](https://github.com/AztecProtocol/aztec-packages/commit/dd9dd84e9cfc93f8605f28aa25fa36b0004052cb))
- Fold batching challenge (alpha) ([#3291](https://github.com/AztecProtocol/aztec-packages/issues/3291)) ([bc99a4f](https://github.com/AztecProtocol/aztec-packages/commit/bc99a4f644824727920b0b4a38ec5ba915d5c0ce))
- Open transcript polys as univariates in ECCVM ([#3331](https://github.com/AztecProtocol/aztec-packages/issues/3331)) ([436b22e](https://github.com/AztecProtocol/aztec-packages/commit/436b22e35bf8a41f78def237889f2afd2ca79830))
- ZM updates for Translator concatenated polys ([#3343](https://github.com/AztecProtocol/aztec-packages/issues/3343)) ([0e425db](https://github.com/AztecProtocol/aztec-packages/commit/0e425dbfc99af9fc2598a957acd8b71f3fd45fe9))

### Bug Fixes

- Bootstrap bbjs. ([#3337](https://github.com/AztecProtocol/aztec-packages/issues/3337)) ([06aedcb](https://github.com/AztecProtocol/aztec-packages/commit/06aedcbfd601e243d3486763c1306e20c1ae3688))
- Updating pedersen benchmarks ([#3211](https://github.com/AztecProtocol/aztec-packages/issues/3211)) ([7e89ff3](https://github.com/AztecProtocol/aztec-packages/commit/7e89ff363521dd65e0c9f0c098b3bacea33c2764))

### Miscellaneous

- All hashes in ts ([#3333](https://github.com/AztecProtocol/aztec-packages/issues/3333)) ([6307e12](https://github.com/AztecProtocol/aztec-packages/commit/6307e129770af7791dc5a477859b75ebb112a653))

## [0.15.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.14.2...barretenberg-v0.15.0) (2023-11-16)

### ⚠ BREAKING CHANGES

- Replace computing hashes in circuits wasm, with computing them in ts via bb.js pedersen call. ([#3114](https://github.com/AztecProtocol/aztec-packages/issues/3114))

### Features

- **bb:** Add msan preset ([#3284](https://github.com/AztecProtocol/aztec-packages/issues/3284)) ([bcf025c](https://github.com/AztecProtocol/aztec-packages/commit/bcf025ceef07fb2bf5b07f96e7818425ae59e79a))
- Protogalaxy combiner quotient ([#3245](https://github.com/AztecProtocol/aztec-packages/issues/3245)) ([db0f3ab](https://github.com/AztecProtocol/aztec-packages/commit/db0f3ab9b3d74e0527116a773bf11d26e6bf7736))
- Ultra honk arith from ultra ([#3274](https://github.com/AztecProtocol/aztec-packages/issues/3274)) ([ec2b805](https://github.com/AztecProtocol/aztec-packages/commit/ec2b805e5b35805e2c5e394ae2b6181865e22aa3))

### Bug Fixes

- Debug build ([#3283](https://github.com/AztecProtocol/aztec-packages/issues/3283)) ([aca2624](https://github.com/AztecProtocol/aztec-packages/commit/aca2624df2d07782f6879d32efc891318b985344))
- Fix block constraint key divergence bug. ([#3256](https://github.com/AztecProtocol/aztec-packages/issues/3256)) ([1c71a0c](https://github.com/AztecProtocol/aztec-packages/commit/1c71a0cf38cf463efe1964126a6a5741c27bd2eb))

### Miscellaneous

- **bb:** Remove -Wfatal-errors ([#3318](https://github.com/AztecProtocol/aztec-packages/issues/3318)) ([4229173](https://github.com/AztecProtocol/aztec-packages/commit/4229173e7d794ba7800b34dcc8565d7f3ea5525d))
- Clarify that barretenberg mirror should not take PRs ([#3303](https://github.com/AztecProtocol/aztec-packages/issues/3303)) ([13f1a1d](https://github.com/AztecProtocol/aztec-packages/commit/13f1a1d4f8cd12ac8f38e2d1a2c6715f2871f4c8))
- Clean up Plonk widgets ([#3305](https://github.com/AztecProtocol/aztec-packages/issues/3305)) ([4623d91](https://github.com/AztecProtocol/aztec-packages/commit/4623d916d5e8d048cf3c5e06f02d937cf91e6180))
- Explicitly instantiate Goblin translator relations ([#3239](https://github.com/AztecProtocol/aztec-packages/issues/3239)) ([e3b5fb0](https://github.com/AztecProtocol/aztec-packages/commit/e3b5fb0681839bd003804a9e066118dd4693502d))
- Plain struct flavor entities ([#3277](https://github.com/AztecProtocol/aztec-packages/issues/3277)) ([f109512](https://github.com/AztecProtocol/aztec-packages/commit/f1095124af96d2d69522c8677e5e02cd55063c99))
- Remove bn254 instantiation of eccvm plus naming changes ([#3330](https://github.com/AztecProtocol/aztec-packages/issues/3330)) ([23d1e2d](https://github.com/AztecProtocol/aztec-packages/commit/23d1e2d307757c42f6a070afcb22f800fae94555))
- Replace computing hashes in circuits wasm, with computing them in ts via bb.js pedersen call. ([#3114](https://github.com/AztecProtocol/aztec-packages/issues/3114)) ([87eeb71](https://github.com/AztecProtocol/aztec-packages/commit/87eeb715014996ec329de969df85684083b18f83))
- Revert build-debug folder for debug preset ([#3324](https://github.com/AztecProtocol/aztec-packages/issues/3324)) ([43a2e6b](https://github.com/AztecProtocol/aztec-packages/commit/43a2e6b68853d5c22fac4563949c83baf443827c))
- Towards plain struct flavor entities ([#3216](https://github.com/AztecProtocol/aztec-packages/issues/3216)) ([3ba89cf](https://github.com/AztecProtocol/aztec-packages/commit/3ba89cf6fe3821b1149f482ee28c5e0716878b15))
- Typo fixes based on cspell ([#3319](https://github.com/AztecProtocol/aztec-packages/issues/3319)) ([8ae44dd](https://github.com/AztecProtocol/aztec-packages/commit/8ae44dd702987db524ab5e3edd6545881614f56b))

## [0.14.2](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.14.1...barretenberg-v0.14.2) (2023-11-07)

### Features

- Run solidity tests for all acir artifacts ([#3161](https://github.com/AztecProtocol/aztec-packages/issues/3161)) ([d09f667](https://github.com/AztecProtocol/aztec-packages/commit/d09f66748fcbb7739b17940a36806abb72091ee1))

## [0.14.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.14.0...barretenberg-v0.14.1) (2023-11-07)

### Miscellaneous

- **barretenberg:** Synchronize aztec-packages versions

## [0.14.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.13.1...barretenberg-v0.14.0) (2023-11-07)

### Features

- Gperftools ([#3096](https://github.com/AztecProtocol/aztec-packages/issues/3096)) ([ea2f9a7](https://github.com/AztecProtocol/aztec-packages/commit/ea2f9a72674ae7fd3e810a12026bfc26c693e1c1))

### Bug Fixes

- Cleanup gen_inner_proof_files.sh script. ([#3242](https://github.com/AztecProtocol/aztec-packages/issues/3242)) ([ee57e00](https://github.com/AztecProtocol/aztec-packages/commit/ee57e00da06a2daea571cac579a5f6ef9e039d5e))
- Temporary fix for bb prove w/ ram rom blocks ([#3215](https://github.com/AztecProtocol/aztec-packages/issues/3215)) ([af93a33](https://github.com/AztecProtocol/aztec-packages/commit/af93a33fdd5d73648d31b4e4f7347d29b8892405))

### Miscellaneous

- Clean up and refactor arithmetization ([#3164](https://github.com/AztecProtocol/aztec-packages/issues/3164)) ([0370b13](https://github.com/AztecProtocol/aztec-packages/commit/0370b135c723458852894363383bbe9275eb0e56))
- Move flavors ([#3188](https://github.com/AztecProtocol/aztec-packages/issues/3188)) ([f1ff849](https://github.com/AztecProtocol/aztec-packages/commit/f1ff849d90b3914bf8c24bf54ded8d98b7ffa961))
- Move honk/pcs ([#3187](https://github.com/AztecProtocol/aztec-packages/issues/3187)) ([3870ff8](https://github.com/AztecProtocol/aztec-packages/commit/3870ff8f829c29556d633693875cf30ce8d724eb))
- Move log deriv lookup accum to library ([#3226](https://github.com/AztecProtocol/aztec-packages/issues/3226)) ([189d1bb](https://github.com/AztecProtocol/aztec-packages/commit/189d1bbd6691d0237d69acb012238e97589ee257))
- Move sumcheck ([#3189](https://github.com/AztecProtocol/aztec-packages/issues/3189)) ([410cae3](https://github.com/AztecProtocol/aztec-packages/commit/410cae39aba1387571308567a8022cc51b6d25d1))
- Move transcripts ([#3176](https://github.com/AztecProtocol/aztec-packages/issues/3176)) ([7372d19](https://github.com/AztecProtocol/aztec-packages/commit/7372d19f64737eabfa917f7368a5bf99068f48d5))
- Split out relations, PG, Honk variants ([#3238](https://github.com/AztecProtocol/aztec-packages/issues/3238)) ([8abd39f](https://github.com/AztecProtocol/aztec-packages/commit/8abd39f5f8a434d96fe259df9c5940787bd705f1))

### Documentation

- Updated stale tree docs ([#3166](https://github.com/AztecProtocol/aztec-packages/issues/3166)) ([3d5c98c](https://github.com/AztecProtocol/aztec-packages/commit/3d5c98c3eeb76103c331bfcbefc4127ae39836c7))

## [0.13.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.13.0...barretenberg-v0.13.1) (2023-10-31)

### Miscellaneous

- **barretenberg:** Synchronize aztec-packages versions

## [0.13.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.12.0...barretenberg-v0.13.0) (2023-10-31)

### Features

- Adding structure to Transcript ([#2937](https://github.com/AztecProtocol/aztec-packages/issues/2937)) ([db67aa1](https://github.com/AztecProtocol/aztec-packages/commit/db67aa1eb6ae9669d98301efbbb146d6265d58f4))
- Efficient ZM quotient computation ([#3016](https://github.com/AztecProtocol/aztec-packages/issues/3016)) ([ebda5fc](https://github.com/AztecProtocol/aztec-packages/commit/ebda5fcbc7321cb3f91b0c7a742b7cbd88a15179))
- Measure plonk rounds ([#3065](https://github.com/AztecProtocol/aztec-packages/issues/3065)) ([c8e1d8b](https://github.com/AztecProtocol/aztec-packages/commit/c8e1d8b9244c3955f0fea6a34a3cc28a81a29d2c))
- New script to output table of benchmarks for README pasting. ([#2780](https://github.com/AztecProtocol/aztec-packages/issues/2780)) ([6c20b45](https://github.com/AztecProtocol/aztec-packages/commit/6c20b45993ee9cbd319ab8351e2722e0c912f427))
- Pedersen in typescript. ([#3111](https://github.com/AztecProtocol/aztec-packages/issues/3111)) ([933f1b2](https://github.com/AztecProtocol/aztec-packages/commit/933f1b2c24a3a4bdaafd31e1158ba702ee9874c9))
- Protogalaxy folding of challenges ([#2935](https://github.com/AztecProtocol/aztec-packages/issues/2935)) ([7ed30e8](https://github.com/AztecProtocol/aztec-packages/commit/7ed30e83d2bea8399b7acd477c4dfc739417f96d))
- Zeromorph with concatenation (Goblin Translator part 10) ([#3006](https://github.com/AztecProtocol/aztec-packages/issues/3006)) ([70b0f17](https://github.com/AztecProtocol/aztec-packages/commit/70b0f17101f3b378df3e9a0247230b9ebf67239a))

### Miscellaneous

- Add stdlib tests for pedersen commitment ([#3075](https://github.com/AztecProtocol/aztec-packages/issues/3075)) ([87fa621](https://github.com/AztecProtocol/aztec-packages/commit/87fa621347e55f82e36c70515c1824161eee5282))
- Automatic c_binds for commit should return a point instead of an Fr element ([#3072](https://github.com/AztecProtocol/aztec-packages/issues/3072)) ([2e289a5](https://github.com/AztecProtocol/aztec-packages/commit/2e289a5d11d28496ac47220bede03268065e0cb7))
- Cleanup remaining mentions of `compress` with pedersen in cpp and ts ([#3074](https://github.com/AztecProtocol/aztec-packages/issues/3074)) ([52cf383](https://github.com/AztecProtocol/aztec-packages/commit/52cf3831794a6ab497c9a40f85859f4cc8ac4700))
- Remove endomorphism coefficient from ecc_add_gate ([#3115](https://github.com/AztecProtocol/aztec-packages/issues/3115)) ([d294987](https://github.com/AztecProtocol/aztec-packages/commit/d294987ad25fb69d2934dfade2bf7063ff64bef2))
- Remove unecessary calls to `pedersen__init` ([#3079](https://github.com/AztecProtocol/aztec-packages/issues/3079)) ([84f8db2](https://github.com/AztecProtocol/aztec-packages/commit/84f8db20f482242ac29a23eb4c8876f14f060b4c))
- Remove unused pedersen c_binds ([#3058](https://github.com/AztecProtocol/aztec-packages/issues/3058)) ([e71e5f9](https://github.com/AztecProtocol/aztec-packages/commit/e71e5f94ba920208e7cc9b2b1b9d62678b699812))
- Removes pedersen commit native pairs method ([#3073](https://github.com/AztecProtocol/aztec-packages/issues/3073)) ([69a34c7](https://github.com/AztecProtocol/aztec-packages/commit/69a34c72c9dccbd54072553ed1ecf0460b16db69))

## [0.12.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.11.1...barretenberg-v0.12.0) (2023-10-26)

### ⚠ BREAKING CHANGES

- remove plookup pedersen methods from c_bind namespace ([#3033](https://github.com/AztecProtocol/aztec-packages/issues/3033))

### Features

- Added correctness tests for several small relations in Goblin Translator (Goblin Translator part 8) ([#2963](https://github.com/AztecProtocol/aztec-packages/issues/2963)) ([4c83250](https://github.com/AztecProtocol/aztec-packages/commit/4c8325093e7d76158a767dcf2854f1cfd274c5ff))
- Correctness tests for decomposition and non-native field relations (Goblin Translator Part 9) ([#2981](https://github.com/AztecProtocol/aztec-packages/issues/2981)) ([cdc830d](https://github.com/AztecProtocol/aztec-packages/commit/cdc830dd8731d9f8fed85bb46b3ed6771796f526))
- Enable sol verifier tests in ci ([#2997](https://github.com/AztecProtocol/aztec-packages/issues/2997)) ([058de1e](https://github.com/AztecProtocol/aztec-packages/commit/058de1ea92b1c19f76867b93769d8de4bb9a6f55))
- Goblin Translator flavor and permutation correctness (Goblin Translator part 7) ([#2961](https://github.com/AztecProtocol/aztec-packages/issues/2961)) ([737f17f](https://github.com/AztecProtocol/aztec-packages/commit/737f17fdff5a213dd1424c4e668bce41b95b349a))

### Bug Fixes

- Fix clang-16 check ([#3030](https://github.com/AztecProtocol/aztec-packages/issues/3030)) ([7a5a8b3](https://github.com/AztecProtocol/aztec-packages/commit/7a5a8b3b79c18b45aa29eacc05e9bfb26090cc95))

### Miscellaneous

- **acir_tests:** Add script to regenerate double_verify_proof inputs ([#3005](https://github.com/AztecProtocol/aztec-packages/issues/3005)) ([9c4eab2](https://github.com/AztecProtocol/aztec-packages/commit/9c4eab27d6a8a774d49f40ccea92faf305caf500))
- Fix `pedersen_compress_with_hash_index` c_bind function ([#3054](https://github.com/AztecProtocol/aztec-packages/issues/3054)) ([a136f6e](https://github.com/AztecProtocol/aztec-packages/commit/a136f6e70725500739b518e1bfc96b680c3cb1b2))
- Proxy redundant `hash` methods ([#3046](https://github.com/AztecProtocol/aztec-packages/issues/3046)) ([df389b5](https://github.com/AztecProtocol/aztec-packages/commit/df389b5f593a202bc644479a6c3dff884b7d3652))
- Remove `pedersen_buffer_to_field` from c_bind ([#3045](https://github.com/AztecProtocol/aztec-packages/issues/3045)) ([de7e63b](https://github.com/AztecProtocol/aztec-packages/commit/de7e63bf7e1184333c1eaadf2387fef6bf163871))
- Remove pedersen hash oracle ([#3023](https://github.com/AztecProtocol/aztec-packages/issues/3023)) ([0e6958c](https://github.com/AztecProtocol/aztec-packages/commit/0e6958c94e6d00d4132f08baa2cd63141ff8aae7))
- Remove plookup pedersen methods from c_bind namespace ([#3033](https://github.com/AztecProtocol/aztec-packages/issues/3033)) ([a8ea391](https://github.com/AztecProtocol/aztec-packages/commit/a8ea391c95a9fe4fa26a3fa987f52114a40c664a))

## [0.11.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.11.0...barretenberg-v0.11.1) (2023-10-24)

### Features

- ProverPlookupAuxiliaryWidget kernel bench ([#2924](https://github.com/AztecProtocol/aztec-packages/issues/2924)) ([faffc39](https://github.com/AztecProtocol/aztec-packages/commit/faffc39a379c9f215978e4867c3d24dbc638f0b4))

## [0.11.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.10.1...barretenberg-v0.11.0) (2023-10-24)

### Features

- Pedersen hash in acir format ([#2990](https://github.com/AztecProtocol/aztec-packages/issues/2990)) ([2a4c548](https://github.com/AztecProtocol/aztec-packages/commit/2a4c548bc816a5f379ee841e26bb30411deef56b))

### Miscellaneous

- Update acir_tests reference branch ([#2993](https://github.com/AztecProtocol/aztec-packages/issues/2993)) ([91813a5](https://github.com/AztecProtocol/aztec-packages/commit/91813a55b8503c279ccd38b1d83463b97b86d064))

## [0.10.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.10.0...barretenberg-v0.10.1) (2023-10-24)

### Miscellaneous

- **barretenberg:** Synchronize aztec-packages versions

## [0.10.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.9.0...barretenberg-v0.10.0) (2023-10-24)

### Features

- Goblin translator non-native field relation (Goblin Translator part 6) ([#2871](https://github.com/AztecProtocol/aztec-packages/issues/2871)) ([c4d8d96](https://github.com/AztecProtocol/aztec-packages/commit/c4d8d963171cf936242e04639154fccc86a0942f))
- Honk profiling by pass, tsan preset ([#2982](https://github.com/AztecProtocol/aztec-packages/issues/2982)) ([a1592fd](https://github.com/AztecProtocol/aztec-packages/commit/a1592fdcde661e09826852fc28bb4aa4c5521863))
- Protogalaxy Combiner ([#2436](https://github.com/AztecProtocol/aztec-packages/issues/2436)) ([a60c70d](https://github.com/AztecProtocol/aztec-packages/commit/a60c70dca1d920ad88511f77be3ad186afab7bdb))
- Protogalaxy perturbator! ([#2624](https://github.com/AztecProtocol/aztec-packages/issues/2624)) ([509dee6](https://github.com/AztecProtocol/aztec-packages/commit/509dee6108781f3dcd09b3c111be59f42798cac0))
- Refactor pedersen hash standard ([#2592](https://github.com/AztecProtocol/aztec-packages/issues/2592)) ([3085676](https://github.com/AztecProtocol/aztec-packages/commit/3085676dd8a68ac43abc3e5c7843ff437df91d7d))
- Widget benchmarking ([#2897](https://github.com/AztecProtocol/aztec-packages/issues/2897)) ([0e927e9](https://github.com/AztecProtocol/aztec-packages/commit/0e927e9233d7418b9fba4a0142f606e2f92a1f40))

### Bug Fixes

- Honk sumcheck performance ([#2925](https://github.com/AztecProtocol/aztec-packages/issues/2925)) ([5fbfe6e](https://github.com/AztecProtocol/aztec-packages/commit/5fbfe6eeccdb23f734fb36f30d1e33340f9fb07a))

### Miscellaneous

- Remove unused nix files ([#2933](https://github.com/AztecProtocol/aztec-packages/issues/2933)) ([3174f84](https://github.com/AztecProtocol/aztec-packages/commit/3174f84fe9d92b353d1b2c307ed5757ee941ce00))

## [0.9.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.8.14...barretenberg-v0.9.0) (2023-10-17)

### Features

- Bump msgpack ([#2884](https://github.com/AztecProtocol/aztec-packages/issues/2884)) ([d7b7fb1](https://github.com/AztecProtocol/aztec-packages/commit/d7b7fb1d70cfb6a592d4cf24c0da92ed9acc7d38))
- Download msgpack ([#2885](https://github.com/AztecProtocol/aztec-packages/issues/2885)) ([8ac8beb](https://github.com/AztecProtocol/aztec-packages/commit/8ac8bebaa8dad39df6f3d6f622e215574062ac52))

## [0.8.14](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.8.13...barretenberg-v0.8.14) (2023-10-13)

### Miscellaneous

- **barretenberg:** Synchronize aztec-packages versions

## [0.8.13](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.8.12...barretenberg-v0.8.13) (2023-10-13)

### Bug Fixes

- Fix check_circuit in goblin translator (resulted in flimsy test) ([#2827](https://github.com/AztecProtocol/aztec-packages/issues/2827)) ([98b1679](https://github.com/AztecProtocol/aztec-packages/commit/98b16793b0e84360af8dc70934636d11d7bc7e29))

## [0.8.12](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.8.11...barretenberg-v0.8.12) (2023-10-13)

### Bug Fixes

- Fix rebuild pattern slashes. ([#2843](https://github.com/AztecProtocol/aztec-packages/issues/2843)) ([e32517e](https://github.com/AztecProtocol/aztec-packages/commit/e32517e9eae791b32f94b3816413392ccf0ba096))

## [0.8.11](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.8.10...barretenberg-v0.8.11) (2023-10-13)

### Features

- Goblin Translator Decomposition relation (Goblin Translator part 4) ([#2802](https://github.com/AztecProtocol/aztec-packages/issues/2802)) ([3c3cd9f](https://github.com/AztecProtocol/aztec-packages/commit/3c3cd9f62640b505b55916648df6ccddf524cdfc))
- Goblin Translator GenPermSort relation (Goblin Translator part 3) ([#2795](https://github.com/AztecProtocol/aztec-packages/issues/2795)) ([b36fdc4](https://github.com/AztecProtocol/aztec-packages/commit/b36fdc481d16e56fe244c5a10a5223199f9f2e6b))
- Goblin translator opcode constraint and accumulator transfer relations (Goblin Translator part 5) ([#2805](https://github.com/AztecProtocol/aztec-packages/issues/2805)) ([b3d1f28](https://github.com/AztecProtocol/aztec-packages/commit/b3d1f280913494322baee369e6ee4f04353891b3))
- Goblin Translator Permutation relation (Goblin Translator part 2) ([#2790](https://github.com/AztecProtocol/aztec-packages/issues/2790)) ([9a354c9](https://github.com/AztecProtocol/aztec-packages/commit/9a354c94c91f8f2927ca66d0de65b5b893066710))
- Integrate ZeroMorph into Honk ([#2774](https://github.com/AztecProtocol/aztec-packages/issues/2774)) ([ea86869](https://github.com/AztecProtocol/aztec-packages/commit/ea86869e92da3fbf921314fdbca31fdb85a6e274))
- Update goblin translator circuit builder (Goblin Translator part 1) ([#2764](https://github.com/AztecProtocol/aztec-packages/issues/2764)) ([32c69ae](https://github.com/AztecProtocol/aztec-packages/commit/32c69ae36ed431482d286e228fd830256e8bd1b5))

### Miscellaneous

- Change acir_tests branch to point to master ([#2815](https://github.com/AztecProtocol/aztec-packages/issues/2815)) ([73f229d](https://github.com/AztecProtocol/aztec-packages/commit/73f229d3123301818262439a2a98767146a1a58c))
- Remove Ultra Grumpkin flavor ([#2825](https://github.com/AztecProtocol/aztec-packages/issues/2825)) ([bde77b8](https://github.com/AztecProtocol/aztec-packages/commit/bde77b8e6e91fa734e06453e67a50597480b2ec1))
- Remove work queue from honk ([#2814](https://github.com/AztecProtocol/aztec-packages/issues/2814)) ([bca7d12](https://github.com/AztecProtocol/aztec-packages/commit/bca7d126d2ec583977ee5bdf77a90263d059dc44))
- Spell check ([#2817](https://github.com/AztecProtocol/aztec-packages/issues/2817)) ([4777a11](https://github.com/AztecProtocol/aztec-packages/commit/4777a113491c4c9901b4589a9a6cb1e1148c0288))

## [0.8.10](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.8.9...barretenberg-v0.8.10) (2023-10-11)

### Features

- Bb faster init ([#2776](https://github.com/AztecProtocol/aztec-packages/issues/2776)) ([c794533](https://github.com/AztecProtocol/aztec-packages/commit/c794533754a9706d362d0374209df9eb5b6bfdc7))
- LLVM xray presets ([#2525](https://github.com/AztecProtocol/aztec-packages/issues/2525)) ([23a1ee9](https://github.com/AztecProtocol/aztec-packages/commit/23a1ee91da6003d1b5798640c8ccecbd226beef7))
- Separate aggregation protocol ([#2736](https://github.com/AztecProtocol/aztec-packages/issues/2736)) ([ad16937](https://github.com/AztecProtocol/aztec-packages/commit/ad169374943ef49c32eabc66483a7be28a711565))
- Simplify relation containers ([#2619](https://github.com/AztecProtocol/aztec-packages/issues/2619)) ([99c5127](https://github.com/AztecProtocol/aztec-packages/commit/99c5127ac5c10e6637534870a689a95238ae997c))
- ZeroMorph ([#2664](https://github.com/AztecProtocol/aztec-packages/issues/2664)) ([a006e5a](https://github.com/AztecProtocol/aztec-packages/commit/a006e5a0e0a30f8dfe992e3ac8a05f6c276f9300))

### Miscellaneous

- Acir format cleanup ([#2779](https://github.com/AztecProtocol/aztec-packages/issues/2779)) ([5ea373f](https://github.com/AztecProtocol/aztec-packages/commit/5ea373f7d653f7322a108297113a2deb379e1400))
- Stop whinging about this ownership stuff. ([#2775](https://github.com/AztecProtocol/aztec-packages/issues/2775)) ([3dd6900](https://github.com/AztecProtocol/aztec-packages/commit/3dd6900f96a7dc855643be0e4aba0cfe9fa8a16e))
- Update ACIR serialisation format ([#2771](https://github.com/AztecProtocol/aztec-packages/issues/2771)) ([6d85527](https://github.com/AztecProtocol/aztec-packages/commit/6d855270f8c069edac62536ccc391a0cab764323))
- Use global crs in more places. Less pain. ([#2772](https://github.com/AztecProtocol/aztec-packages/issues/2772)) ([b819980](https://github.com/AztecProtocol/aztec-packages/commit/b8199802bad3c05ebe4d1ded5338a09a04e0ed7e))

## [0.8.9](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.8.8...barretenberg-v0.8.9) (2023-10-10)

### Miscellaneous

- **barretenberg:** Synchronize aztec-packages versions

## [0.8.8](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.8.7...barretenberg-v0.8.8) (2023-10-09)

### Features

- GCC 13 preset ([#2623](https://github.com/AztecProtocol/aztec-packages/issues/2623)) ([4881414](https://github.com/AztecProtocol/aztec-packages/commit/4881414ceb30590674c244ef9bc4c8416eacd6bc))

### Bug Fixes

- Challenge generation update ([#2628](https://github.com/AztecProtocol/aztec-packages/issues/2628)) ([68c1fab](https://github.com/AztecProtocol/aztec-packages/commit/68c1fab51e3a339032b719ce966ed34787f33dab))

### Miscellaneous

- Bump ACIR deserializer ([#2675](https://github.com/AztecProtocol/aztec-packages/issues/2675)) ([502ee87](https://github.com/AztecProtocol/aztec-packages/commit/502ee872d6360bf4bc5b83c672eeb64c58944073))

## [0.8.7](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.8.6...barretenberg-v0.8.7) (2023-10-04)

### Miscellaneous

- **barretenberg:** Synchronize aztec-packages versions

## [0.8.6](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.8.5...barretenberg-v0.8.6) (2023-10-04)

### Miscellaneous

- **barretenberg:** Synchronize aztec-packages versions

## [0.8.5](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.8.4...barretenberg-v0.8.5) (2023-10-04)

### Miscellaneous

- **barretenberg:** Synchronize aztec-packages versions

## [0.8.4](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.8.3...barretenberg-v0.8.4) (2023-10-04)

### Miscellaneous

- **barretenberg:** Synchronize aztec-packages versions

## [0.8.3](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.8.2...barretenberg-v0.8.3) (2023-10-04)

### Miscellaneous

- **barretenberg:** Synchronize aztec-packages versions

## [0.8.2](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.8.1...barretenberg-v0.8.2) (2023-10-04)

### Bug Fixes

- Include ignition data in package or save after 1st download ([#2591](https://github.com/AztecProtocol/aztec-packages/issues/2591)) ([d5e9f8b](https://github.com/AztecProtocol/aztec-packages/commit/d5e9f8be6bbcb8a88dfdec8fee8fe7cf439f6b19)), closes [#2445](https://github.com/AztecProtocol/aztec-packages/issues/2445)
- Make target architecture configurable, target westmere in GA. ([#2660](https://github.com/AztecProtocol/aztec-packages/issues/2660)) ([3cb9639](https://github.com/AztecProtocol/aztec-packages/commit/3cb9639ed1158e70b377aa49832eb650e5cd2930))

## [0.8.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.8.0...barretenberg-v0.8.1) (2023-10-03)

### Bug Fixes

- Add missing ecc doubling gate into ultra plonk and ultra honk ([#2610](https://github.com/AztecProtocol/aztec-packages/issues/2610)) ([7cb7c58](https://github.com/AztecProtocol/aztec-packages/commit/7cb7c58444a087d81684afc6d5c2fc254357035e))

### Miscellaneous

- Update acir_tests script to point to master ([#2650](https://github.com/AztecProtocol/aztec-packages/issues/2650)) ([51d1e79](https://github.com/AztecProtocol/aztec-packages/commit/51d1e79c3463461864878d4d8f2e84d7e74b9c86))

## [0.8.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.7.10...barretenberg-v0.8.0) (2023-10-03)

### Features

- Barretenberg/crypto/blake3s supports compile-time hashing ([#2556](https://github.com/AztecProtocol/aztec-packages/issues/2556)) ([da05dd7](https://github.com/AztecProtocol/aztec-packages/commit/da05dd7ea41208aea42efe0aeb838e4d76e2d34a))
- **bb:** Add `bb --version` command ([#2482](https://github.com/AztecProtocol/aztec-packages/issues/2482)) ([530676f](https://github.com/AztecProtocol/aztec-packages/commit/530676f8ec53e63ba24f6fabc9097ae8f5db5fc6))
- **bb:** Avoid initializing CRS for `bb info` command ([#2425](https://github.com/AztecProtocol/aztec-packages/issues/2425)) ([d22c7b1](https://github.com/AztecProtocol/aztec-packages/commit/d22c7b1f69ea936c532fac68d19c6362f8a34be5))
- Consistent pedersen hash (work in progress) ([#1945](https://github.com/AztecProtocol/aztec-packages/issues/1945)) ([b4ad8f3](https://github.com/AztecProtocol/aztec-packages/commit/b4ad8f38250d82531439d6db33c8f81387c42496))
- Goblin op queue transcript aggregation ([#2257](https://github.com/AztecProtocol/aztec-packages/issues/2257)) ([b7f627a](https://github.com/AztecProtocol/aztec-packages/commit/b7f627a5e472d3dc691b799a5e3df508b685a272))
- Parallelization update for polynomials ([#2311](https://github.com/AztecProtocol/aztec-packages/issues/2311)) ([922fc99](https://github.com/AztecProtocol/aztec-packages/commit/922fc9912a4a88a41eef42fe64ca2b59d859b5b1))
- Update to protogalaxy interfaces ([#2498](https://github.com/AztecProtocol/aztec-packages/issues/2498)) ([9a3d265](https://github.com/AztecProtocol/aztec-packages/commit/9a3d2652d2614439017a6f47152efb9a177b7127))
- YML manifest. Simplify YBP. ([#2353](https://github.com/AztecProtocol/aztec-packages/issues/2353)) ([bf73bc3](https://github.com/AztecProtocol/aztec-packages/commit/bf73bc3e8fd0fd13193f9301073905682044a6c5))

### Bug Fixes

- **barretenberg:** Brittle headers caused error compiling for clang-16 on mainframe ([#2547](https://github.com/AztecProtocol/aztec-packages/issues/2547)) ([cc909da](https://github.com/AztecProtocol/aztec-packages/commit/cc909da0464003aee6d2ff4036ba59c321a5b617))
- Bb rebuild patterns ([#2499](https://github.com/AztecProtocol/aztec-packages/issues/2499)) ([868cceb](https://github.com/AztecProtocol/aztec-packages/commit/868cceb98c7fd6a8edd6710eba4d76ef58a68664))
- Fix working dir bug causing stdlib-tests to not run. ([#2495](https://github.com/AztecProtocol/aztec-packages/issues/2495)) ([6b3402c](https://github.com/AztecProtocol/aztec-packages/commit/6b3402c552292068dcdf74a920c65b2aad635441))
- Nightly subrepo mirror ([#2520](https://github.com/AztecProtocol/aztec-packages/issues/2520)) ([bedc8c8](https://github.com/AztecProtocol/aztec-packages/commit/bedc8c88cfc24a51806690f225a128f973c5845f))

### Miscellaneous

- BI build tweaks ([#2487](https://github.com/AztecProtocol/aztec-packages/issues/2487)) ([f8b6548](https://github.com/AztecProtocol/aztec-packages/commit/f8b65481eec99876007e521beecd671b9a18f19a))
- Kill Turbo ([#2442](https://github.com/AztecProtocol/aztec-packages/issues/2442)) ([c832825](https://github.com/AztecProtocol/aztec-packages/commit/c83282582536421ae67bbd936b3059597d908253))
- Provide cross compile to cjs. ([#2566](https://github.com/AztecProtocol/aztec-packages/issues/2566)) ([47d0d37](https://github.com/AztecProtocol/aztec-packages/commit/47d0d376727dfcb798af4ea019dfc23a9a57b6ca))
- Recursion todos ([#2516](https://github.com/AztecProtocol/aztec-packages/issues/2516)) ([2df107b](https://github.com/AztecProtocol/aztec-packages/commit/2df107b2da73217eb96d39c8ed880f76a2b3e4cd))
- Reenable some ultra honk composer tests ([#2417](https://github.com/AztecProtocol/aztec-packages/issues/2417)) ([31f4c32](https://github.com/AztecProtocol/aztec-packages/commit/31f4c32e2c4a3a91879e842ea2366eb167fdd510))
- Remove composer keyword from stdlib ([#2418](https://github.com/AztecProtocol/aztec-packages/issues/2418)) ([f3e7d91](https://github.com/AztecProtocol/aztec-packages/commit/f3e7d914e3b8b7f98eacde0dff12a51a04dde93e))
- Remove Standard Honk ([#2435](https://github.com/AztecProtocol/aztec-packages/issues/2435)) ([9b3ee45](https://github.com/AztecProtocol/aztec-packages/commit/9b3ee4579c0a13378eb27b5c24bf9b99a07de350))

### Documentation

- Fixed original minus underflow test ([#2472](https://github.com/AztecProtocol/aztec-packages/issues/2472)) ([0cf4bdc](https://github.com/AztecProtocol/aztec-packages/commit/0cf4bdc853d864fd4cf73d5af7e261ee2515c0d0))

## [0.7.10](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.7.9...barretenberg-v0.7.10) (2023-09-20)

### Miscellaneous

- **barretenberg:** Synchronize aztec-packages versions

## [0.7.9](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.7.8...barretenberg-v0.7.9) (2023-09-19)

### Miscellaneous

- **barretenberg:** Synchronize aztec-packages versions

## [0.7.8](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.7.7...barretenberg-v0.7.8) (2023-09-19)

### Features

- Allow tracing build system with [debug ci] ([#2389](https://github.com/AztecProtocol/aztec-packages/issues/2389)) ([ce311a9](https://github.com/AztecProtocol/aztec-packages/commit/ce311a9b44a8f0327235ccd3bb8f9a8fca97443e))

## [0.7.7](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.7.6...barretenberg-v0.7.7) (2023-09-18)

### Miscellaneous

- **barretenberg:** Synchronize aztec-packages versions

## [0.7.6](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.7.5...barretenberg-v0.7.6) (2023-09-18)

### Miscellaneous

- **barretenberg:** Synchronize aztec-packages versions

## [0.7.5](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.7.4...barretenberg-v0.7.5) (2023-09-15)

### Features

- Protogalaxy interfaces ([#2125](https://github.com/AztecProtocol/aztec-packages/issues/2125)) ([b45dd26](https://github.com/AztecProtocol/aztec-packages/commit/b45dd26214119f0c52c2c4f48ff11f650912fef9))

## [0.7.4](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.7.3...barretenberg-v0.7.4) (2023-09-15)

### Features

- Elliptic Curve Virtual Machine Circuit ([#1268](https://github.com/AztecProtocol/aztec-packages/issues/1268)) ([f85ecd9](https://github.com/AztecProtocol/aztec-packages/commit/f85ecd921271ec94b551992bcfe16c2b56f72d2e))

## [0.7.3](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.7.2...barretenberg-v0.7.3) (2023-09-15)

### Miscellaneous

- **barretenberg:** Synchronize aztec-packages versions

## [0.7.2](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.7.1...barretenberg-v0.7.2) (2023-09-14)

### Features

- ASAN build ([#2307](https://github.com/AztecProtocol/aztec-packages/issues/2307)) ([274c89f](https://github.com/AztecProtocol/aztec-packages/commit/274c89f1916d8af2054d9773dc632f87bb3bf2fc))

## [0.7.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.7.0...barretenberg-v0.7.1) (2023-09-14)

### Miscellaneous

- Move barretenberg to top of repo. Make circuits build off barretenberg build. ([#2221](https://github.com/AztecProtocol/aztec-packages/issues/2221)) ([404ec34](https://github.com/AztecProtocol/aztec-packages/commit/404ec34d38e1a9c3fbe7a3cdb6e88c28f62f72e4))

## [0.7.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.6.7...barretenberg-v0.7.0) (2023-09-13)

### ⚠ BREAKING CHANGES

- **aztec-noir:** rename noir-aztec to aztec-noir ([#2071](https://github.com/AztecProtocol/aztec-packages/issues/2071))

### Features

- **build:** Use LTS version of ubuntu ([#2239](https://github.com/AztecProtocol/aztec-packages/issues/2239)) ([ce6671e](https://github.com/AztecProtocol/aztec-packages/commit/ce6671e6ab72fcdc8114df5b6a45f81c0086b19d))

### Bug Fixes

- **build:** Update ubuntu version used in Docker builds ([#2236](https://github.com/AztecProtocol/aztec-packages/issues/2236)) ([dbe80b7](https://github.com/AztecProtocol/aztec-packages/commit/dbe80b739e97474b29e6a4125ac0d2f16e248b32))
- Format barretenberg ([#2209](https://github.com/AztecProtocol/aztec-packages/issues/2209)) ([0801372](https://github.com/AztecProtocol/aztec-packages/commit/08013725091c7e80c1e83145ffbf3983cf1e7fe3))
- Msgpack blowup with bigger objects ([#2207](https://github.com/AztecProtocol/aztec-packages/issues/2207)) ([b909937](https://github.com/AztecProtocol/aztec-packages/commit/b909937ba53b896e11e6b65db08b8f2bb83218d5))
- Refactor constraints in scalar mul to use the high limb ([#2161](https://github.com/AztecProtocol/aztec-packages/issues/2161)) ([1d0e25d](https://github.com/AztecProtocol/aztec-packages/commit/1d0e25d9fad69aebccacf9f646e3291ea89716ca))

### Miscellaneous

- Add debugging to run_tests ([#2212](https://github.com/AztecProtocol/aztec-packages/issues/2212)) ([1c5e78a](https://github.com/AztecProtocol/aztec-packages/commit/1c5e78a4ac01bee4b785857447efdb02d8d9cb35))
- **aztec-noir:** Rename noir-aztec to aztec-noir ([#2071](https://github.com/AztecProtocol/aztec-packages/issues/2071)) ([e1e14d2](https://github.com/AztecProtocol/aztec-packages/commit/e1e14d2c7fb44d56b9a10a645676d3551830bb10))
- Update url for acir artifacts ([#2231](https://github.com/AztecProtocol/aztec-packages/issues/2231)) ([5e0abd3](https://github.com/AztecProtocol/aztec-packages/commit/5e0abd35dec449a665760e5ee51eeff89c76532c))

## [0.6.7](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.6.6...barretenberg-v0.6.7) (2023-09-11)

### Miscellaneous

- **barretenberg:** Synchronize aztec-packages versions

## [0.6.6](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.6.5...barretenberg-v0.6.6) (2023-09-11)

### Miscellaneous

- **barretenberg:** Synchronize aztec-packages versions

## [0.6.5](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.6.4...barretenberg-v0.6.5) (2023-09-08)

### Miscellaneous

- **barretenberg:** Synchronize aztec-packages versions

## [0.6.4](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.6.3...barretenberg-v0.6.4) (2023-09-08)

### Miscellaneous

- **barretenberg:** Synchronize aztec-packages versions

## [0.6.3](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.6.2...barretenberg-v0.6.3) (2023-09-08)

### Miscellaneous

- **barretenberg:** Synchronize aztec-packages versions

## [0.6.2](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.6.1...barretenberg-v0.6.2) (2023-09-08)

### Miscellaneous

- **barretenberg:** Synchronize aztec-packages versions

## [0.6.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.5.2...barretenberg-v0.6.1) (2023-09-08)

### Bug Fixes

- Work around intermittent wasm webkit issue ([#2140](https://github.com/AztecProtocol/aztec-packages/issues/2140)) ([a9b0934](https://github.com/AztecProtocol/aztec-packages/commit/a9b09344c80d8628f95f859d4e2d455d61f9e7c6))

### Miscellaneous

- **master:** Release 0.5.2 ([#2141](https://github.com/AztecProtocol/aztec-packages/issues/2141)) ([451aad6](https://github.com/AztecProtocol/aztec-packages/commit/451aad6ea92ebced9839ca14baae10cee327be35))
- Release 0.5.2 ([f76b53c](https://github.com/AztecProtocol/aztec-packages/commit/f76b53c985116ac131a9b11b2a255feb7d0f8f13))
- Release 0.6.1 ([1bd1a79](https://github.com/AztecProtocol/aztec-packages/commit/1bd1a79b0cefcd90306133aab141d992e8ea5fc3))

## [0.5.2](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.5.2...barretenberg-v0.5.2) (2023-09-08)

### Bug Fixes

- Work around intermittent wasm webkit issue ([#2140](https://github.com/AztecProtocol/aztec-packages/issues/2140)) ([a9b0934](https://github.com/AztecProtocol/aztec-packages/commit/a9b09344c80d8628f95f859d4e2d455d61f9e7c6))

### Miscellaneous

- Release 0.5.2 ([f76b53c](https://github.com/AztecProtocol/aztec-packages/commit/f76b53c985116ac131a9b11b2a255feb7d0f8f13))

## [0.5.1](https://github.com/AztecProtocol/barretenberg/compare/barretenberg-v0.5.0...barretenberg-v0.5.1) (2023-09-05)

### Features

- Add `info` command to bb ([#2010](https://github.com/AztecProtocol/barretenberg/issues/2010)) ([2882d97](https://github.com/AztecProtocol/barretenberg/commit/2882d97f5165239badb328be80568e7d683c0465))
- **ci:** Use content hash in build system, restrict docs build to _.ts or _.cpp ([#1953](https://github.com/AztecProtocol/barretenberg/issues/1953)) ([297a20d](https://github.com/AztecProtocol/barretenberg/commit/297a20d7878a4aabab1cabf2cc5d2d67f9e969c5))

### Bug Fixes

- Adds Mac cross compile flags into barretenberg ([#1954](https://github.com/AztecProtocol/barretenberg/issues/1954)) ([0e17d97](https://github.com/AztecProtocol/barretenberg/commit/0e17d978a0cc6805b72646a8e36fd5267cbd6bcd))
- **bb.js:** (breaking change) bundles bb.js properly so that it works in the browser and in node ([#1855](https://github.com/AztecProtocol/barretenberg/issues/1855)) ([bc93a5f](https://github.com/AztecProtocol/barretenberg/commit/bc93a5f8510d0dc600343e7e613ab84380d3c225))
- **ci:** Incorrect content hash in some build targets ([#1973](https://github.com/AztecProtocol/barretenberg/issues/1973)) ([c6c469a](https://github.com/AztecProtocol/barretenberg/commit/c6c469aa5da7c6973f656ddf8af4fb20c3e8e4f6))
- Compilation on homebrew clang 16.06 ([#1937](https://github.com/AztecProtocol/barretenberg/issues/1937)) ([79c29ee](https://github.com/AztecProtocol/barretenberg/commit/79c29eebbdb78c1e9aa5b4a3da6207fbf93bdd10))
- Master ([#1981](https://github.com/AztecProtocol/barretenberg/issues/1981)) ([59a454e](https://github.com/AztecProtocol/barretenberg/commit/59a454ecf1611424893e1cb093774a23dde39310))
- Unify base64 interface between mac and linux (cherry-picked) ([#1968](https://github.com/AztecProtocol/barretenberg/issues/1968)) ([37ee120](https://github.com/AztecProtocol/barretenberg/commit/37ee1204eba280442b6941eff448d6ff15eb9f04))

## [0.5.0](https://github.com/AztecProtocol/barretenberg/compare/barretenberg-v0.4.6...barretenberg-v0.5.0) (2023-09-01)

### ⚠ BREAKING CHANGES

- update to acvm 0.24.0 ([#1925](https://github.com/AztecProtocol/barretenberg/issues/1925))

### Bug Fixes

- Benchmark preset uses clang16 ([#1902](https://github.com/AztecProtocol/barretenberg/issues/1902)) ([cd0ff0e](https://github.com/AztecProtocol/barretenberg/commit/cd0ff0e2c049917ec47a110b45d76bed4c00ae2a))
- Reset keccak var inputs to 0 ([#1881](https://github.com/AztecProtocol/barretenberg/issues/1881)) ([23011ee](https://github.com/AztecProtocol/barretenberg/commit/23011ee1ea7f1b00b0f4194ebceedc75ea01c157))

### Miscellaneous Chores

- Update to acvm 0.24.0 ([#1925](https://github.com/AztecProtocol/barretenberg/issues/1925)) ([5d8db8e](https://github.com/AztecProtocol/barretenberg/commit/5d8db8eb993334b43e24a51efba9c59e123320ab))

## [0.4.6](https://github.com/AztecProtocol/barretenberg/compare/barretenberg-v0.4.5...barretenberg-v0.4.6) (2023-08-29)

### Bug Fixes

- Truncate SRS size to the amount of points that we have downloaded ([#1862](https://github.com/AztecProtocol/barretenberg/issues/1862)) ([3bcf12b](https://github.com/AztecProtocol/barretenberg/commit/3bcf12b1a302280d5112475c5993b125e130209e))

## [0.4.5](https://github.com/AztecProtocol/barretenberg/compare/barretenberg-v0.4.4...barretenberg-v0.4.5) (2023-08-28)

### Bug Fixes

- Conditionally compile base64 command for bb binary ([#1851](https://github.com/AztecProtocol/barretenberg/issues/1851)) ([8f8b9f4](https://github.com/AztecProtocol/barretenberg/commit/8f8b9f46028a08342a3337db633782e5313e2763))

## [0.4.4](https://github.com/AztecProtocol/barretenberg/compare/barretenberg-v0.4.3...barretenberg-v0.4.4) (2023-08-28)

### Features

- Add ARM build for Mac + cleanup artifacts ([#1837](https://github.com/AztecProtocol/barretenberg/issues/1837)) ([2d2d5ea](https://github.com/AztecProtocol/barretenberg/commit/2d2d5ea33c512ab36c1214fb5bb90f80d8247469))

## [0.4.3](https://github.com/AztecProtocol/barretenberg/compare/barretenberg-v0.4.2...barretenberg-v0.4.3) (2023-08-23)

### Features

- **bb:** Use an environment variable to set the transcript URL ([#1750](https://github.com/AztecProtocol/barretenberg/issues/1750)) ([41d362e](https://github.com/AztecProtocol/barretenberg/commit/41d362e9c9ffeb763cd56ca8a9f8c4512b86c80c))

### Bug Fixes

- Clang version in README and subrepo edge case ([#1730](https://github.com/AztecProtocol/barretenberg/issues/1730)) ([74158c4](https://github.com/AztecProtocol/barretenberg/commit/74158c4e467d4b6ab90e7d5aeb9a28f04adc1d66))
- Download SRS using one canonical URL across the codebase ([#1748](https://github.com/AztecProtocol/barretenberg/issues/1748)) ([5c91de7](https://github.com/AztecProtocol/barretenberg/commit/5c91de7296e054f6d5ac3dca94ca85e06d496048))
- Proving fails when circuit has size &gt; ~500K ([#1739](https://github.com/AztecProtocol/barretenberg/issues/1739)) ([6d32383](https://github.com/AztecProtocol/barretenberg/commit/6d323838a525190618d608598357ee4608c46699))
- Revert clang check bootstrap.sh ([#1734](https://github.com/AztecProtocol/barretenberg/issues/1734)) ([65a38bc](https://github.com/AztecProtocol/barretenberg/commit/65a38bc045c66c5f64e87ba8c6e446945f2f0a24))
- Update barretenberg bootstrap.sh for mac ([#1732](https://github.com/AztecProtocol/barretenberg/issues/1732)) ([f21ac3e](https://github.com/AztecProtocol/barretenberg/commit/f21ac3e893b5d30f7a4ba8ca10e6fd70f5c617b4))

## [0.4.2](https://github.com/AztecProtocol/barretenberg/compare/barretenberg-v0.4.1...barretenberg-v0.4.2) (2023-08-21)

### Bug Fixes

- Remove automatic update to `AztecProtocol/dev-bb.js` ([#1712](https://github.com/AztecProtocol/barretenberg/issues/1712)) ([d883900](https://github.com/AztecProtocol/barretenberg/commit/d883900f9b297f659d14583ac93eede5160f9aae))

## [0.4.1](https://github.com/AztecProtocol/barretenberg/compare/barretenberg-v0.4.0...barretenberg-v0.4.1) (2023-08-21)

### Bug Fixes

- **bb:** Fix Typo ([#1709](https://github.com/AztecProtocol/barretenberg/issues/1709)) ([286d64e](https://github.com/AztecProtocol/barretenberg/commit/286d64e6036336314114f1d2a25273f4dabe36f4))

## [0.4.0](https://github.com/AztecProtocol/barretenberg/compare/barretenberg-v0.3.6...barretenberg-v0.4.0) (2023-08-21)

### ⚠ BREAKING CHANGES

- Barretenberg binaries now take in the encoded circuit instead of a json file ([#1618](https://github.com/AztecProtocol/barretenberg/issues/1618))

### Features

- Add msgpack defs to remaining circuit types ([#1538](https://github.com/AztecProtocol/barretenberg/issues/1538)) ([e560e39](https://github.com/AztecProtocol/barretenberg/commit/e560e3955d039a93e2ed157c684ea36abd178d4b))
- Add workflow to output to dev-bb.js ([#1299](https://github.com/AztecProtocol/barretenberg/issues/1299)) ([25a54f1](https://github.com/AztecProtocol/barretenberg/commit/25a54f123e6f98dafef4cd882839106eadf6ab8d))
- Celer benchmark ([#1369](https://github.com/AztecProtocol/barretenberg/issues/1369)) ([8fd364a](https://github.com/AztecProtocol/barretenberg/commit/8fd364a3ff6e7b5f377ef5ec37649b47fe0a3e44))
- Honk recursive verifier Pt. 1 ([#1488](https://github.com/AztecProtocol/barretenberg/issues/1488)) ([030dace](https://github.com/AztecProtocol/barretenberg/commit/030dacebd9831ed938b546133373cad63e17ecd8))
- New stdlib Transcript ([#1219](https://github.com/AztecProtocol/barretenberg/issues/1219)) ([1b9e077](https://github.com/AztecProtocol/barretenberg/commit/1b9e0770e7e470f2708eb6f96cd5ee831b84f4f4))

### Bug Fixes

- **acir:** When retrying failed ACIR tests it should not use the default CLI argument ([#1673](https://github.com/AztecProtocol/barretenberg/issues/1673)) ([ea4792d](https://github.com/AztecProtocol/barretenberg/commit/ea4792ddc9c23f7390f47cf78d4939cce6458a46))
- Align bbmalloc implementations ([#1513](https://github.com/AztecProtocol/barretenberg/issues/1513)) ([b92338d](https://github.com/AztecProtocol/barretenberg/commit/b92338d3c9de9d21a6933747a3f1479266d16f9e))
- Barretenberg binaries now take in the encoded circuit instead of a json file ([#1618](https://github.com/AztecProtocol/barretenberg/issues/1618)) ([180cdc9](https://github.com/AztecProtocol/barretenberg/commit/180cdc9ac7cf9aa793d9774dc866ceb4e6ec3fbc))
- Bb sync take 2 ([#1669](https://github.com/AztecProtocol/barretenberg/issues/1669)) ([d3eebe4](https://github.com/AztecProtocol/barretenberg/commit/d3eebe46e5b702801c866d7dd073a0eeb9f475b7))
- Bin reference when installing package ([#678](https://github.com/AztecProtocol/barretenberg/issues/678)) ([c734295](https://github.com/AztecProtocol/barretenberg/commit/c734295a10d2c40ede773519664170880f28b2b7))
- Fix paths in `barretenberg` bootstrap.sh script ([#1662](https://github.com/AztecProtocol/barretenberg/issues/1662)) ([c8917cd](https://github.com/AztecProtocol/barretenberg/commit/c8917cd8ec415dafe5309ec0e90aba28184d8294))
- Fixed a failing test and added a small fuzzer ([#1384](https://github.com/AztecProtocol/barretenberg/issues/1384)) ([441e972](https://github.com/AztecProtocol/barretenberg/commit/441e972c88c5c314b4958e158f977f60a8c9e32d))
- Sync aztec master ([#680](https://github.com/AztecProtocol/barretenberg/issues/680)) ([3afc243](https://github.com/AztecProtocol/barretenberg/commit/3afc2438053f530e49fbebbdbadd8db8a630bb8c))

## [0.3.6](https://github.com/AztecProtocol/barretenberg/compare/barretenberg-v0.3.5...barretenberg-v0.3.6) (2023-08-08)

### Features

- Update release-please.yml ([#651](https://github.com/AztecProtocol/barretenberg/issues/651)) ([2795df6](https://github.com/AztecProtocol/barretenberg/commit/2795df6b705175a32fe2a6f18b3c572e297e277e))

## [0.3.5](https://github.com/AztecProtocol/barretenberg/compare/barretenberg-v0.3.4...barretenberg-v0.3.5) (2023-08-07)

### Features

- Celer benchmark ([#1369](https://github.com/AztecProtocol/barretenberg/issues/1369)) ([d4ade2a](https://github.com/AztecProtocol/barretenberg/commit/d4ade2a5f06a3abf3c9c2635946d7121cc2f64b4))
- Goblin Honk Composer/Prover/Verifier ([#1220](https://github.com/AztecProtocol/barretenberg/issues/1220)) ([970bb07](https://github.com/AztecProtocol/barretenberg/commit/970bb073763cc59552cd05dccf7f8fc63f58cef9))
- Goblin translator prototype ([#1249](https://github.com/AztecProtocol/barretenberg/issues/1249)) ([7738d74](https://github.com/AztecProtocol/barretenberg/commit/7738d74791acc0fa8b1b1d8bb2a77783ca900123))
- Internal keyword + lending contract and tests ([#978](https://github.com/AztecProtocol/barretenberg/issues/978)) ([e58ca4b](https://github.com/AztecProtocol/barretenberg/commit/e58ca4b332272fc57b2a5358bb5003bac79a8f5a))
- Minimal barretenberg .circleci ([#1352](https://github.com/AztecProtocol/barretenberg/issues/1352)) ([708e2e2](https://github.com/AztecProtocol/barretenberg/commit/708e2e2786de5dce5bfc770c54734e5862a436e5))

### Bug Fixes

- Bootstrap.sh git hook for monorepo ([#1256](https://github.com/AztecProtocol/barretenberg/issues/1256)) ([b22b8d5](https://github.com/AztecProtocol/barretenberg/commit/b22b8d5f42ddfae140068c3ce8b3053d4c8d1874))
- Build-system spot request cancellation ([#1339](https://github.com/AztecProtocol/barretenberg/issues/1339)) ([fc1d96a](https://github.com/AztecProtocol/barretenberg/commit/fc1d96a744a8d5a6cae06c408546c3638408551d))
- Fixing external benchmarks ([#1250](https://github.com/AztecProtocol/barretenberg/issues/1250)) ([0ea6a39](https://github.com/AztecProtocol/barretenberg/commit/0ea6a39950e8cd5ff7765031457c162d03ebae06))
- Fixing fuzzing build after composer splitting ([#1317](https://github.com/AztecProtocol/barretenberg/issues/1317)) ([946c23c](https://github.com/AztecProtocol/barretenberg/commit/946c23c52d45ddce973e453c40c048734e7f6937))
- Reinstate barretenberg-benchmark-aggregator ([#1330](https://github.com/AztecProtocol/barretenberg/issues/1330)) ([407a915](https://github.com/AztecProtocol/barretenberg/commit/407a915a94c7d83dec9e14a11ad0e3461fd2906d))
- Retry git submodule fetch ([#1371](https://github.com/AztecProtocol/barretenberg/issues/1371)) ([037dda3](https://github.com/AztecProtocol/barretenberg/commit/037dda3d254d56a20292d2bed5a9582d36c08427))

## [0.3.4](https://github.com/AztecProtocol/barretenberg/compare/barretenberg-v0.3.3...barretenberg-v0.3.4) (2023-07-25)

### Features

- Add Mega Circuit builder ([#587](https://github.com/AztecProtocol/barretenberg/issues/587)) ([2d38c25](https://github.com/AztecProtocol/barretenberg/commit/2d38c252de8b867955da661181e51f1a5f28cbc6))
- Modify bb.js to be compatible with next.js ([#544](https://github.com/AztecProtocol/barretenberg/issues/544)) ([d384089](https://github.com/AztecProtocol/barretenberg/commit/d384089f60d1a6d5baeb0d3459556a310b790366))
- Support public inputs in Ultra Honk ([#581](https://github.com/AztecProtocol/barretenberg/issues/581)) ([9cd0a06](https://github.com/AztecProtocol/barretenberg/commit/9cd0a064b8258bf4f72dd9e1c5e8f85b074d1bbc))

## [0.3.3](https://github.com/AztecProtocol/barretenberg/compare/barretenberg-v0.3.2...barretenberg-v0.3.3) (2023-07-17)

### Features

- Bb and bb.js directly parse nargo bincode format. ([#610](https://github.com/AztecProtocol/barretenberg/issues/610)) ([d25e37a](https://github.com/AztecProtocol/barretenberg/commit/d25e37ad74b88dc45337b2a529ede3136dd4a699))
- Goblin work done in Valencia ([#569](https://github.com/AztecProtocol/barretenberg/issues/569)) ([57af751](https://github.com/AztecProtocol/barretenberg/commit/57af751646dc3c038fea24ada4e160f6d422845f))

## [0.3.2](https://github.com/AztecProtocol/barretenberg/compare/barretenberg-v0.3.1...barretenberg-v0.3.2) (2023-07-12)

### Features

- **msgpack:** Ability to specify NOSCHEMA for cbinds ([#605](https://github.com/AztecProtocol/barretenberg/issues/605)) ([8a4f5f1](https://github.com/AztecProtocol/barretenberg/commit/8a4f5f1d31e1d631c1cd3ed49c100858b58c56b2))

## [0.3.1](https://github.com/AztecProtocol/barretenberg/compare/barretenberg-v0.3.0...barretenberg-v0.3.1) (2023-07-11)

### Features

- Sentence case changelog titles ([#598](https://github.com/AztecProtocol/barretenberg/issues/598)) ([1466108](https://github.com/AztecProtocol/barretenberg/commit/146610857ae511e9cfb27f873f49cec2dd19ddad))

## 0.3.0 (2023-07-11)

### ⚠ BREAKING CHANGES

- Use circuit builders ([#501](https://github.com/AztecProtocol/barretenberg/issues/501))
- **dsl:** add hash index to pedersen constraint ([#436](https://github.com/AztecProtocol/barretenberg/issues/436))
- add support for ROM and RAM ACVM opcodes ([#417](https://github.com/AztecProtocol/barretenberg/issues/417))
- replace `MerkleMembershipConstraint` with`ComputeMerkleRootConstraint` ([#385](https://github.com/AztecProtocol/barretenberg/issues/385))
- Remove TOOLCHAIN logic and replace with CMake presets ([#162](https://github.com/AztecProtocol/barretenberg/issues/162))

### Features

- Add `get_sibling_path` method in MerkleTree ([#584](https://github.com/AztecProtocol/barretenberg/issues/584)) ([b3db9f8](https://github.com/AztecProtocol/barretenberg/commit/b3db9f8944e546cd9da9a1529e2562ee75e62369))
- Add `signature_verification_result` to schnorr stdlib ([#173](https://github.com/AztecProtocol/barretenberg/issues/173)) ([7ae381e](https://github.com/AztecProtocol/barretenberg/commit/7ae381e4c5a084efde18917569518c7d4040b653))
- Add equality and serialization to poly_triple ([#172](https://github.com/AztecProtocol/barretenberg/issues/172)) ([142b041](https://github.com/AztecProtocol/barretenberg/commit/142b041b2d3d090785f0e6f319fbf7504c751098))
- Add installation targets for libbarretenberg, wasm & headers ([#185](https://github.com/AztecProtocol/barretenberg/issues/185)) ([f2fdebe](https://github.com/AztecProtocol/barretenberg/commit/f2fdebe037d4d2d90761f98e28b4b0d3af9a0f63))
- Add Noir DSL with acir_format and turbo_proofs namespaces ([#198](https://github.com/AztecProtocol/barretenberg/issues/198)) ([54fab22](https://github.com/AztecProtocol/barretenberg/commit/54fab2217f437bb04a5e9fb71b271cf91b90c6e5))
- Add pkgconfig output for installed target ([#208](https://github.com/AztecProtocol/barretenberg/issues/208)) ([d85a365](https://github.com/AztecProtocol/barretenberg/commit/d85a365180ac2672bbd33bd8b799a1f154716ab3))
- add support for ROM and RAM ACVM opcodes ([#417](https://github.com/AztecProtocol/barretenberg/issues/417)) ([697fabb](https://github.com/AztecProtocol/barretenberg/commit/697fabb7cbeadb9264db5047e7fd36565dad8790))
- Allow bootstrap to work with linux + clang on ARM ([#131](https://github.com/AztecProtocol/barretenberg/issues/131)) ([52cb06b](https://github.com/AztecProtocol/barretenberg/commit/52cb06b445c73f2f324af6595af70ce9c130eb09))
- **api:** external cpp header for circuits ([#489](https://github.com/AztecProtocol/barretenberg/issues/489)) ([fbbb342](https://github.com/AztecProtocol/barretenberg/commit/fbbb34287fdef0e8fedb2e25c5431f17501ad653))
- **bb.js:** initial API ([#232](https://github.com/AztecProtocol/barretenberg/issues/232)) ([c860b02](https://github.com/AztecProtocol/barretenberg/commit/c860b02d80425de161af50acf33e94d94eb0659c))
- Benchmark suite update ([d7b1499](https://github.com/AztecProtocol/barretenberg/commit/d7b14993ac8d329664fd36e7b4aa083935b1d407))
- Benchmark suite update ([#508](https://github.com/AztecProtocol/barretenberg/issues/508)) ([d7b1499](https://github.com/AztecProtocol/barretenberg/commit/d7b14993ac8d329664fd36e7b4aa083935b1d407))
- CI to test aztec circuits with current commit of bberg ([#418](https://github.com/AztecProtocol/barretenberg/issues/418)) ([20a0873](https://github.com/AztecProtocol/barretenberg/commit/20a0873dcbfe4a862ad53a9c137030689a521a04))
- **dsl:** Add ECDSA secp256r1 verification ([#582](https://github.com/AztecProtocol/barretenberg/issues/582)) ([adc4c7b](https://github.com/AztecProtocol/barretenberg/commit/adc4c7b4eb634eae28dd28e25b94b93a5b49c80e))
- **dsl:** add hash index to pedersen constraint ([#436](https://github.com/AztecProtocol/barretenberg/issues/436)) ([e0b8804](https://github.com/AztecProtocol/barretenberg/commit/e0b8804b9418c7aa39e29e800fecb4ed15d73b80))
- **github:** add pull request template ([65f3e33](https://github.com/AztecProtocol/barretenberg/commit/65f3e3312061e7284c0dd0f0f89fa92ee92f9eac))
- **honk:** Shared relation arithmetic ([#514](https://github.com/AztecProtocol/barretenberg/issues/514)) ([0838474](https://github.com/AztecProtocol/barretenberg/commit/0838474e67469a6d91d6595d1ee23e1dea53863c))
- Improve barretenberg headers ([#201](https://github.com/AztecProtocol/barretenberg/issues/201)) ([4e03839](https://github.com/AztecProtocol/barretenberg/commit/4e03839a970a5d07dab7f86cd2b7166a09f5045a))
- Initial native version of bb binary. ([#524](https://github.com/AztecProtocol/barretenberg/issues/524)) ([4a1b532](https://github.com/AztecProtocol/barretenberg/commit/4a1b5322dc78921d253e6a374eba0b616ab788df))
- Make the circuit constructors field agnostic so we can check circuits on grumpkin ([#534](https://github.com/AztecProtocol/barretenberg/issues/534)) ([656d794](https://github.com/AztecProtocol/barretenberg/commit/656d7944f94f3da88250f3140838f3e32e9d0174))
- Multithreaded Sumcheck ([#556](https://github.com/AztecProtocol/barretenberg/issues/556)) ([c4094b1](https://github.com/AztecProtocol/barretenberg/commit/c4094b155ba9d8e914c3e6a5b0d7808945b1eeed))
- **nullifier_tree:** make empty nullifier tree leaves hash be 0 ([#360](https://github.com/AztecProtocol/barretenberg/issues/360)) ([#382](https://github.com/AztecProtocol/barretenberg/issues/382)) ([b85ab8d](https://github.com/AztecProtocol/barretenberg/commit/b85ab8d587b3e93db2aa0f1c4f012e58e5d97915))
- Optimize memory consumption of pedersen generators ([#413](https://github.com/AztecProtocol/barretenberg/issues/413)) ([d60b16a](https://github.com/AztecProtocol/barretenberg/commit/d60b16a14219fd4bd130ce4537c3e94bfa10128f))
- Parallelized folding in Gemini ([#550](https://github.com/AztecProtocol/barretenberg/issues/550)) ([3b962d3](https://github.com/AztecProtocol/barretenberg/commit/3b962d372491430871443fd1b95fd9e049e233c8))
- **pkg-config:** Add a bindir variable ([#239](https://github.com/AztecProtocol/barretenberg/issues/239)) ([611bf34](https://github.com/AztecProtocol/barretenberg/commit/611bf34bcc6f82969a6fe546bf0a7cbecda6d36d))
- Remove TOOLCHAIN logic and replace with CMake presets ([#162](https://github.com/AztecProtocol/barretenberg/issues/162)) ([09db0be](https://github.com/AztecProtocol/barretenberg/commit/09db0be3d09ee12b4b73b03abe8fa4565cdb6660))
- replace `MerkleMembershipConstraint` with`ComputeMerkleRootConstraint` ([#385](https://github.com/AztecProtocol/barretenberg/issues/385)) ([74dbce5](https://github.com/AztecProtocol/barretenberg/commit/74dbce5dfa126ecd6dbda7b758581752f7b6a389))
- Sort includes ([#571](https://github.com/AztecProtocol/barretenberg/issues/571)) ([dfa8736](https://github.com/AztecProtocol/barretenberg/commit/dfa8736136323e62a705066d25bef962a6a0b82d))
- Split plonk and honk tests ([#529](https://github.com/AztecProtocol/barretenberg/issues/529)) ([ba583ff](https://github.com/AztecProtocol/barretenberg/commit/ba583ff00509f636feae7b78304b115e34fc2357))
- Support nix package manager ([#234](https://github.com/AztecProtocol/barretenberg/issues/234)) ([19a72fe](https://github.com/AztecProtocol/barretenberg/commit/19a72fec0ff8d451fc94a9f5563202867a5f8147))
- **ts:** allow passing srs via env functions ([#260](https://github.com/AztecProtocol/barretenberg/issues/260)) ([ac78353](https://github.com/AztecProtocol/barretenberg/commit/ac7835304f4524039abf0a0df9ae85d905f55c86))
- **ultrahonk:** Added a simple filler table to minimize the amount of entries used to make UltraHonk polynomials non-zero ([b20b401](https://github.com/AztecProtocol/barretenberg/commit/b20b4012546c5b67623950d0fedb0974df8bf345))
- **ultrahonk:** Added a simple filler table to minimize the amount of entries used to make UltraHonk polynomials non-zero ([#531](https://github.com/AztecProtocol/barretenberg/issues/531)) ([b20b401](https://github.com/AztecProtocol/barretenberg/commit/b20b4012546c5b67623950d0fedb0974df8bf345))
- Utilize globally installed benchmark if available ([#152](https://github.com/AztecProtocol/barretenberg/issues/152)) ([fbc5027](https://github.com/AztecProtocol/barretenberg/commit/fbc502794e9bbdfda797b11ac71eba996d649722))
- Utilize globally installed gtest if available ([#151](https://github.com/AztecProtocol/barretenberg/issues/151)) ([efa18a6](https://github.com/AztecProtocol/barretenberg/commit/efa18a621917dc6c38f453825cadc76eb793a73c))
- Utilize globally installed leveldb if available ([#134](https://github.com/AztecProtocol/barretenberg/issues/134)) ([255dfb5](https://github.com/AztecProtocol/barretenberg/commit/255dfb52adca885b0a4e4380769a279922af49ff))
- Working UltraPlonk for Noir ([#299](https://github.com/AztecProtocol/barretenberg/issues/299)) ([d56dfbd](https://github.com/AztecProtocol/barretenberg/commit/d56dfbdfd74b438b3c8652e1ae8740de99f93ae5))

### Bug Fixes

- add NUM_RESERVED_GATES before fetching subgroup size in composer ([#539](https://github.com/AztecProtocol/barretenberg/issues/539)) ([fa11abf](https://github.com/AztecProtocol/barretenberg/commit/fa11abf0877314b03420d6f7ace1312df41cd50b))
- Adds `VERSION` file to release-please ([#542](https://github.com/AztecProtocol/barretenberg/issues/542)) ([31fb34c](https://github.com/AztecProtocol/barretenberg/commit/31fb34c307a4336414b1fd2076d96105a29b0e7b))
- Align native library object library with wasm ([#238](https://github.com/AztecProtocol/barretenberg/issues/238)) ([4fa6c0d](https://github.com/AztecProtocol/barretenberg/commit/4fa6c0d2d8c6309d53757ad54d3433d1d662de5f))
- Avoid bb.js memory issues. ([#578](https://github.com/AztecProtocol/barretenberg/issues/578)) ([96891de](https://github.com/AztecProtocol/barretenberg/commit/96891de21fd74ca33ea75ae97f73cada39a5d337))
- Avoid targeting honk test files when testing is disabled ([#125](https://github.com/AztecProtocol/barretenberg/issues/125)) ([e4a70ed](https://github.com/AztecProtocol/barretenberg/commit/e4a70edf2bb39d67095cbe21fff310372369a92d))
- BarycentricData instantiation time and unused code in secp curves ([#572](https://github.com/AztecProtocol/barretenberg/issues/572)) ([bc78bb0](https://github.com/AztecProtocol/barretenberg/commit/bc78bb00d273c756fa4f02967d219cd3fd788890))
- bbmalloc linker error ([#459](https://github.com/AztecProtocol/barretenberg/issues/459)) ([d4761c1](https://github.com/AztecProtocol/barretenberg/commit/d4761c11f30eeecbcb2485f50516bee71809bab1))
- Build on stock apple clang. ([#592](https://github.com/AztecProtocol/barretenberg/issues/592)) ([0ac4bc3](https://github.com/AztecProtocol/barretenberg/commit/0ac4bc36619f85c1b3a65d3f825ba5683cbbe30c))
- **build:** git add -f .yalc ([#265](https://github.com/AztecProtocol/barretenberg/issues/265)) ([7671192](https://github.com/AztecProtocol/barretenberg/commit/7671192c8a60ff0bc0f8ad3e14ac299ff780cc25))
- bump timeout on common test. ([c9bc87d](https://github.com/AztecProtocol/barretenberg/commit/c9bc87d29fa1325162cb1e7bf2db7cc85747fd9e))
- Check for wasm-opt during configure & run on post_build ([#175](https://github.com/AztecProtocol/barretenberg/issues/175)) ([1ff6af3](https://github.com/AztecProtocol/barretenberg/commit/1ff6af3cb6b7b4d3bb53bfbdcbf1c3a568e0fa86))
- check_circuit bug fix ([#510](https://github.com/AztecProtocol/barretenberg/issues/510)) ([4b156a3](https://github.com/AztecProtocol/barretenberg/commit/4b156a3648e6da9dfe292e354da9a27185d2aa9d))
- cleanup of include statements and dependencies ([#527](https://github.com/AztecProtocol/barretenberg/issues/527)) ([b288c24](https://github.com/AztecProtocol/barretenberg/commit/b288c2420bdc350658cd3776bad1eb087cc28d63))
- **cmake:** Remove leveldb dependency that was accidentally re-added ([#335](https://github.com/AztecProtocol/barretenberg/issues/335)) ([3534e2b](https://github.com/AztecProtocol/barretenberg/commit/3534e2bfcca46dbca30573286f43425dab6bc810))
- **dsl:** Use info instead of std::cout to log ([#323](https://github.com/AztecProtocol/barretenberg/issues/323)) ([486d738](https://github.com/AztecProtocol/barretenberg/commit/486d73842b4b7d6aa84fa12d7462fe52e892d416))
- Ecdsa Malleability Bug ([#512](https://github.com/AztecProtocol/barretenberg/issues/512)) ([5cf856c](https://github.com/AztecProtocol/barretenberg/commit/5cf856c5c29c9f9b8abb87d7bde23b4932711350))
- **ecdsa:** correct short weierstrass curve eqn ([#567](https://github.com/AztecProtocol/barretenberg/issues/567)) ([386ec63](https://github.com/AztecProtocol/barretenberg/commit/386ec6372156d604e37e58490f1c7396077f84c4))
- Ensure barretenberg provides headers that Noir needs ([#200](https://github.com/AztecProtocol/barretenberg/issues/200)) ([0171a49](https://github.com/AztecProtocol/barretenberg/commit/0171a499a175f88a0ee3fcfd4de0f43ad0ebff85))
- Ensure TBB is optional using OPTIONAL_COMPONENTS ([#127](https://github.com/AztecProtocol/barretenberg/issues/127)) ([e3039b2](https://github.com/AztecProtocol/barretenberg/commit/e3039b26ea8aca4b8fdc4b2cbac6716ace261c76))
- Fixed the memory issue ([#509](https://github.com/AztecProtocol/barretenberg/issues/509)) ([107d438](https://github.com/AztecProtocol/barretenberg/commit/107d438ad96847e40f8e5374749b8cba820b2007))
- Increment CMakeList version on releases ([#536](https://github.com/AztecProtocol/barretenberg/issues/536)) ([b571411](https://github.com/AztecProtocol/barretenberg/commit/b571411a6d58f79e3e2553c3b1c81b4f186f2245))
- msgpack error ([#456](https://github.com/AztecProtocol/barretenberg/issues/456)) ([943d6d0](https://github.com/AztecProtocol/barretenberg/commit/943d6d07c57bea521c2593e892e839f25f82b289))
- msgpack variant_impl.hpp ([#462](https://github.com/AztecProtocol/barretenberg/issues/462)) ([b5838a6](https://github.com/AztecProtocol/barretenberg/commit/b5838a6c9fe456e832776da21379e41c0a2bbd5d))
- **nix:** Disable ASM & ADX when building in Nix ([#327](https://github.com/AztecProtocol/barretenberg/issues/327)) ([3bc724d](https://github.com/AztecProtocol/barretenberg/commit/3bc724d2163d29041bfa29a1e49625bab77289a2))
- **nix:** Use wasi-sdk 12 to provide barretenberg-wasm in overlay ([#315](https://github.com/AztecProtocol/barretenberg/issues/315)) ([4a06992](https://github.com/AztecProtocol/barretenberg/commit/4a069923f4a869f8c2315e6d3f738db6e66dcdfa))
- Pass brew omp location via LDFLAGS and CPPFLAGS ([#126](https://github.com/AztecProtocol/barretenberg/issues/126)) ([54141f1](https://github.com/AztecProtocol/barretenberg/commit/54141f12de9eee86220003b1f80d39a41795cedc))
- Remove leveldb_store from stdlib_merkle_tree ([#149](https://github.com/AztecProtocol/barretenberg/issues/149)) ([3ce5e7e](https://github.com/AztecProtocol/barretenberg/commit/3ce5e7e17ca7bb806373be833a44d55a8e584bda))
- Revert "fix: add NUM_RESERVED_GATES before fetching subgroup size in composer" ([#540](https://github.com/AztecProtocol/barretenberg/issues/540)) ([a9fbc39](https://github.com/AztecProtocol/barretenberg/commit/a9fbc3973f24680f676682d15c3a4cef0a1ab798))
- Revert generator changes that cause memory OOB access ([#338](https://github.com/AztecProtocol/barretenberg/issues/338)) ([500daf1](https://github.com/AztecProtocol/barretenberg/commit/500daf1ceb03771d2c01eaf1a86139a7ac1d814f))
- Soundness issue in bigfield's `evaluate_multiply_add` method ([#558](https://github.com/AztecProtocol/barretenberg/issues/558)) ([1a98ac6](https://github.com/AztecProtocol/barretenberg/commit/1a98ac64787a0e2904fd22043497a8d11afe5e6c))
- **srs:** Detect shasum utility when downloading lagrange ([#143](https://github.com/AztecProtocol/barretenberg/issues/143)) ([515604d](https://github.com/AztecProtocol/barretenberg/commit/515604dff83648e00106f35511aa567921599a78))
- Store lagrange forms of selector polys w/ Ultra ([#255](https://github.com/AztecProtocol/barretenberg/issues/255)) ([b121963](https://github.com/AztecProtocol/barretenberg/commit/b12196362497c8dfb3a64284d28de2d8ee7d730c))
- throw -&gt; throw_or_abort in sol gen ([#388](https://github.com/AztecProtocol/barretenberg/issues/388)) ([7cfe3f0](https://github.com/AztecProtocol/barretenberg/commit/7cfe3f055815e333ff8a8f1f30e8377c83d2182a))
- Trigger release-please ([#594](https://github.com/AztecProtocol/barretenberg/issues/594)) ([5042861](https://github.com/AztecProtocol/barretenberg/commit/5042861405df6b5659c0c32418720d8bdea81081))
- Update versioning in nix files when a release is made ([#549](https://github.com/AztecProtocol/barretenberg/issues/549)) ([1b3ff93](https://github.com/AztecProtocol/barretenberg/commit/1b3ff93e7ed8873583cdade95a860adb8823f1cd))
- **wasm:** Remove the CMAKE_STAGING_PREFIX variable from wasm preset ([#240](https://github.com/AztecProtocol/barretenberg/issues/240)) ([f2f8d1f](https://github.com/AztecProtocol/barretenberg/commit/f2f8d1f7a24ca73e30c981fd245c86f7f964abb7))
- Wrap each use of filesystem library in ifndef **wasm** ([#181](https://github.com/AztecProtocol/barretenberg/issues/181)) ([0eae962](https://github.com/AztecProtocol/barretenberg/commit/0eae96293b4d2da6b6b23ae80ac132fb49f90915))

### Code Refactoring

- Use circuit builders ([#501](https://github.com/AztecProtocol/barretenberg/issues/501)) ([709a29c](https://github.com/AztecProtocol/barretenberg/commit/709a29c89a305be017270361780995353188035a))

## [0.2.0](https://github.com/AztecProtocol/barretenberg/compare/v0.1.0...v0.2.0) (2023-07-11)

### ⚠ BREAKING CHANGES

- Use circuit builders ([#501](https://github.com/AztecProtocol/barretenberg/issues/501))

### Features

- Add `get_sibling_path` method in MerkleTree ([#584](https://github.com/AztecProtocol/barretenberg/issues/584)) ([b3db9f8](https://github.com/AztecProtocol/barretenberg/commit/b3db9f8944e546cd9da9a1529e2562ee75e62369))
- **dsl:** Add ECDSA secp256r1 verification ([#582](https://github.com/AztecProtocol/barretenberg/issues/582)) ([adc4c7b](https://github.com/AztecProtocol/barretenberg/commit/adc4c7b4eb634eae28dd28e25b94b93a5b49c80e))
- Initial native version of bb binary. ([#524](https://github.com/AztecProtocol/barretenberg/issues/524)) ([4a1b532](https://github.com/AztecProtocol/barretenberg/commit/4a1b5322dc78921d253e6a374eba0b616ab788df))
- Make the circuit constructors field agnostic so we can check circuits on grumpkin ([#534](https://github.com/AztecProtocol/barretenberg/issues/534)) ([656d794](https://github.com/AztecProtocol/barretenberg/commit/656d7944f94f3da88250f3140838f3e32e9d0174))
- Multithreaded Sumcheck ([#556](https://github.com/AztecProtocol/barretenberg/issues/556)) ([c4094b1](https://github.com/AztecProtocol/barretenberg/commit/c4094b155ba9d8e914c3e6a5b0d7808945b1eeed))
- Optimize memory consumption of pedersen generators ([#413](https://github.com/AztecProtocol/barretenberg/issues/413)) ([d60b16a](https://github.com/AztecProtocol/barretenberg/commit/d60b16a14219fd4bd130ce4537c3e94bfa10128f))
- Parallelized folding in Gemini ([#550](https://github.com/AztecProtocol/barretenberg/issues/550)) ([3b962d3](https://github.com/AztecProtocol/barretenberg/commit/3b962d372491430871443fd1b95fd9e049e233c8))
- Sort includes ([#571](https://github.com/AztecProtocol/barretenberg/issues/571)) ([dfa8736](https://github.com/AztecProtocol/barretenberg/commit/dfa8736136323e62a705066d25bef962a6a0b82d))
- Split plonk and honk tests ([#529](https://github.com/AztecProtocol/barretenberg/issues/529)) ([ba583ff](https://github.com/AztecProtocol/barretenberg/commit/ba583ff00509f636feae7b78304b115e34fc2357))

### Bug Fixes

- add NUM_RESERVED_GATES before fetching subgroup size in composer ([#539](https://github.com/AztecProtocol/barretenberg/issues/539)) ([fa11abf](https://github.com/AztecProtocol/barretenberg/commit/fa11abf0877314b03420d6f7ace1312df41cd50b))
- Adds `VERSION` file to release-please ([#542](https://github.com/AztecProtocol/barretenberg/issues/542)) ([31fb34c](https://github.com/AztecProtocol/barretenberg/commit/31fb34c307a4336414b1fd2076d96105a29b0e7b))
- Avoid bb.js memory issues. ([#578](https://github.com/AztecProtocol/barretenberg/issues/578)) ([96891de](https://github.com/AztecProtocol/barretenberg/commit/96891de21fd74ca33ea75ae97f73cada39a5d337))
- BarycentricData instantiation time and unused code in secp curves ([#572](https://github.com/AztecProtocol/barretenberg/issues/572)) ([bc78bb0](https://github.com/AztecProtocol/barretenberg/commit/bc78bb00d273c756fa4f02967d219cd3fd788890))
- Build on stock apple clang. ([#592](https://github.com/AztecProtocol/barretenberg/issues/592)) ([0ac4bc3](https://github.com/AztecProtocol/barretenberg/commit/0ac4bc36619f85c1b3a65d3f825ba5683cbbe30c))
- bump timeout on common test. ([c9bc87d](https://github.com/AztecProtocol/barretenberg/commit/c9bc87d29fa1325162cb1e7bf2db7cc85747fd9e))
- check_circuit bug fix ([#510](https://github.com/AztecProtocol/barretenberg/issues/510)) ([4b156a3](https://github.com/AztecProtocol/barretenberg/commit/4b156a3648e6da9dfe292e354da9a27185d2aa9d))
- cleanup of include statements and dependencies ([#527](https://github.com/AztecProtocol/barretenberg/issues/527)) ([b288c24](https://github.com/AztecProtocol/barretenberg/commit/b288c2420bdc350658cd3776bad1eb087cc28d63))
- Ecdsa Malleability Bug ([#512](https://github.com/AztecProtocol/barretenberg/issues/512)) ([5cf856c](https://github.com/AztecProtocol/barretenberg/commit/5cf856c5c29c9f9b8abb87d7bde23b4932711350))
- **ecdsa:** correct short weierstrass curve eqn ([#567](https://github.com/AztecProtocol/barretenberg/issues/567)) ([386ec63](https://github.com/AztecProtocol/barretenberg/commit/386ec6372156d604e37e58490f1c7396077f84c4))
- Increment CMakeList version on releases ([#536](https://github.com/AztecProtocol/barretenberg/issues/536)) ([b571411](https://github.com/AztecProtocol/barretenberg/commit/b571411a6d58f79e3e2553c3b1c81b4f186f2245))
- Revert "fix: add NUM_RESERVED_GATES before fetching subgroup size in composer" ([#540](https://github.com/AztecProtocol/barretenberg/issues/540)) ([a9fbc39](https://github.com/AztecProtocol/barretenberg/commit/a9fbc3973f24680f676682d15c3a4cef0a1ab798))
- Soundness issue in bigfield's `evaluate_multiply_add` method ([#558](https://github.com/AztecProtocol/barretenberg/issues/558)) ([1a98ac6](https://github.com/AztecProtocol/barretenberg/commit/1a98ac64787a0e2904fd22043497a8d11afe5e6c))
- Update versioning in nix files when a release is made ([#549](https://github.com/AztecProtocol/barretenberg/issues/549)) ([1b3ff93](https://github.com/AztecProtocol/barretenberg/commit/1b3ff93e7ed8873583cdade95a860adb8823f1cd))

### Code Refactoring

- Use circuit builders ([#501](https://github.com/AztecProtocol/barretenberg/issues/501)) ([709a29c](https://github.com/AztecProtocol/barretenberg/commit/709a29c89a305be017270361780995353188035a))

## 0.1.0 (2023-06-15)

### ⚠ BREAKING CHANGES

- **dsl:** add hash index to pedersen constraint ([#436](https://github.com/AztecProtocol/barretenberg/issues/436))
- add support for ROM and RAM ACVM opcodes ([#417](https://github.com/AztecProtocol/barretenberg/issues/417))
- replace `MerkleMembershipConstraint` with`ComputeMerkleRootConstraint` ([#385](https://github.com/AztecProtocol/barretenberg/issues/385))
- Remove TOOLCHAIN logic and replace with CMake presets ([#162](https://github.com/AztecProtocol/barretenberg/issues/162))

### Features

- Add `signature_verification_result` to schnorr stdlib ([#173](https://github.com/AztecProtocol/barretenberg/issues/173)) ([7ae381e](https://github.com/AztecProtocol/barretenberg/commit/7ae381e4c5a084efde18917569518c7d4040b653))
- Add equality and serialization to poly_triple ([#172](https://github.com/AztecProtocol/barretenberg/issues/172)) ([142b041](https://github.com/AztecProtocol/barretenberg/commit/142b041b2d3d090785f0e6f319fbf7504c751098))
- Add installation targets for libbarretenberg, wasm & headers ([#185](https://github.com/AztecProtocol/barretenberg/issues/185)) ([f2fdebe](https://github.com/AztecProtocol/barretenberg/commit/f2fdebe037d4d2d90761f98e28b4b0d3af9a0f63))
- Add Noir DSL with acir_format and turbo_proofs namespaces ([#198](https://github.com/AztecProtocol/barretenberg/issues/198)) ([54fab22](https://github.com/AztecProtocol/barretenberg/commit/54fab2217f437bb04a5e9fb71b271cf91b90c6e5))
- Add pkgconfig output for installed target ([#208](https://github.com/AztecProtocol/barretenberg/issues/208)) ([d85a365](https://github.com/AztecProtocol/barretenberg/commit/d85a365180ac2672bbd33bd8b799a1f154716ab3))
- add support for ROM and RAM ACVM opcodes ([#417](https://github.com/AztecProtocol/barretenberg/issues/417)) ([697fabb](https://github.com/AztecProtocol/barretenberg/commit/697fabb7cbeadb9264db5047e7fd36565dad8790))
- Allow bootstrap to work with linux + clang on ARM ([#131](https://github.com/AztecProtocol/barretenberg/issues/131)) ([52cb06b](https://github.com/AztecProtocol/barretenberg/commit/52cb06b445c73f2f324af6595af70ce9c130eb09))
- **api:** external cpp header for circuits ([#489](https://github.com/AztecProtocol/barretenberg/issues/489)) ([fbbb342](https://github.com/AztecProtocol/barretenberg/commit/fbbb34287fdef0e8fedb2e25c5431f17501ad653))
- **bb.js:** initial API ([#232](https://github.com/AztecProtocol/barretenberg/issues/232)) ([c860b02](https://github.com/AztecProtocol/barretenberg/commit/c860b02d80425de161af50acf33e94d94eb0659c))
- Benchmark suite update ([d7b1499](https://github.com/AztecProtocol/barretenberg/commit/d7b14993ac8d329664fd36e7b4aa083935b1d407))
- Benchmark suite update ([#508](https://github.com/AztecProtocol/barretenberg/issues/508)) ([d7b1499](https://github.com/AztecProtocol/barretenberg/commit/d7b14993ac8d329664fd36e7b4aa083935b1d407))
- CI to test aztec circuits with current commit of bberg ([#418](https://github.com/AztecProtocol/barretenberg/issues/418)) ([20a0873](https://github.com/AztecProtocol/barretenberg/commit/20a0873dcbfe4a862ad53a9c137030689a521a04))
- **dsl:** add hash index to pedersen constraint ([#436](https://github.com/AztecProtocol/barretenberg/issues/436)) ([e0b8804](https://github.com/AztecProtocol/barretenberg/commit/e0b8804b9418c7aa39e29e800fecb4ed15d73b80))
- **github:** add pull request template ([65f3e33](https://github.com/AztecProtocol/barretenberg/commit/65f3e3312061e7284c0dd0f0f89fa92ee92f9eac))
- **honk:** Shared relation arithmetic ([#514](https://github.com/AztecProtocol/barretenberg/issues/514)) ([0838474](https://github.com/AztecProtocol/barretenberg/commit/0838474e67469a6d91d6595d1ee23e1dea53863c))
- Improve barretenberg headers ([#201](https://github.com/AztecProtocol/barretenberg/issues/201)) ([4e03839](https://github.com/AztecProtocol/barretenberg/commit/4e03839a970a5d07dab7f86cd2b7166a09f5045a))
- **nullifier_tree:** make empty nullifier tree leaves hash be 0 ([#360](https://github.com/AztecProtocol/barretenberg/issues/360)) ([#382](https://github.com/AztecProtocol/barretenberg/issues/382)) ([b85ab8d](https://github.com/AztecProtocol/barretenberg/commit/b85ab8d587b3e93db2aa0f1c4f012e58e5d97915))
- **pkg-config:** Add a bindir variable ([#239](https://github.com/AztecProtocol/barretenberg/issues/239)) ([611bf34](https://github.com/AztecProtocol/barretenberg/commit/611bf34bcc6f82969a6fe546bf0a7cbecda6d36d))
- Remove TOOLCHAIN logic and replace with CMake presets ([#162](https://github.com/AztecProtocol/barretenberg/issues/162)) ([09db0be](https://github.com/AztecProtocol/barretenberg/commit/09db0be3d09ee12b4b73b03abe8fa4565cdb6660))
- replace `MerkleMembershipConstraint` with`ComputeMerkleRootConstraint` ([#385](https://github.com/AztecProtocol/barretenberg/issues/385)) ([74dbce5](https://github.com/AztecProtocol/barretenberg/commit/74dbce5dfa126ecd6dbda7b758581752f7b6a389))
- Support nix package manager ([#234](https://github.com/AztecProtocol/barretenberg/issues/234)) ([19a72fe](https://github.com/AztecProtocol/barretenberg/commit/19a72fec0ff8d451fc94a9f5563202867a5f8147))
- **ts:** allow passing srs via env functions ([#260](https://github.com/AztecProtocol/barretenberg/issues/260)) ([ac78353](https://github.com/AztecProtocol/barretenberg/commit/ac7835304f4524039abf0a0df9ae85d905f55c86))
- **ultrahonk:** Added a simple filler table to minimize the amount of entries used to make UltraHonk polynomials non-zero ([b20b401](https://github.com/AztecProtocol/barretenberg/commit/b20b4012546c5b67623950d0fedb0974df8bf345))
- **ultrahonk:** Added a simple filler table to minimize the amount of entries used to make UltraHonk polynomials non-zero ([#531](https://github.com/AztecProtocol/barretenberg/issues/531)) ([b20b401](https://github.com/AztecProtocol/barretenberg/commit/b20b4012546c5b67623950d0fedb0974df8bf345))
- Utilize globally installed benchmark if available ([#152](https://github.com/AztecProtocol/barretenberg/issues/152)) ([fbc5027](https://github.com/AztecProtocol/barretenberg/commit/fbc502794e9bbdfda797b11ac71eba996d649722))
- Utilize globally installed gtest if available ([#151](https://github.com/AztecProtocol/barretenberg/issues/151)) ([efa18a6](https://github.com/AztecProtocol/barretenberg/commit/efa18a621917dc6c38f453825cadc76eb793a73c))
- Utilize globally installed leveldb if available ([#134](https://github.com/AztecProtocol/barretenberg/issues/134)) ([255dfb5](https://github.com/AztecProtocol/barretenberg/commit/255dfb52adca885b0a4e4380769a279922af49ff))
- Working UltraPlonk for Noir ([#299](https://github.com/AztecProtocol/barretenberg/issues/299)) ([d56dfbd](https://github.com/AztecProtocol/barretenberg/commit/d56dfbdfd74b438b3c8652e1ae8740de99f93ae5))

### Bug Fixes

- Align native library object library with wasm ([#238](https://github.com/AztecProtocol/barretenberg/issues/238)) ([4fa6c0d](https://github.com/AztecProtocol/barretenberg/commit/4fa6c0d2d8c6309d53757ad54d3433d1d662de5f))
- Avoid targeting honk test files when testing is disabled ([#125](https://github.com/AztecProtocol/barretenberg/issues/125)) ([e4a70ed](https://github.com/AztecProtocol/barretenberg/commit/e4a70edf2bb39d67095cbe21fff310372369a92d))
- bbmalloc linker error ([#459](https://github.com/AztecProtocol/barretenberg/issues/459)) ([d4761c1](https://github.com/AztecProtocol/barretenberg/commit/d4761c11f30eeecbcb2485f50516bee71809bab1))
- **build:** git add -f .yalc ([#265](https://github.com/AztecProtocol/barretenberg/issues/265)) ([7671192](https://github.com/AztecProtocol/barretenberg/commit/7671192c8a60ff0bc0f8ad3e14ac299ff780cc25))
- Check for wasm-opt during configure & run on post_build ([#175](https://github.com/AztecProtocol/barretenberg/issues/175)) ([1ff6af3](https://github.com/AztecProtocol/barretenberg/commit/1ff6af3cb6b7b4d3bb53bfbdcbf1c3a568e0fa86))
- **cmake:** Remove leveldb dependency that was accidentally re-added ([#335](https://github.com/AztecProtocol/barretenberg/issues/335)) ([3534e2b](https://github.com/AztecProtocol/barretenberg/commit/3534e2bfcca46dbca30573286f43425dab6bc810))
- **dsl:** Use info instead of std::cout to log ([#323](https://github.com/AztecProtocol/barretenberg/issues/323)) ([486d738](https://github.com/AztecProtocol/barretenberg/commit/486d73842b4b7d6aa84fa12d7462fe52e892d416))
- Ensure barretenberg provides headers that Noir needs ([#200](https://github.com/AztecProtocol/barretenberg/issues/200)) ([0171a49](https://github.com/AztecProtocol/barretenberg/commit/0171a499a175f88a0ee3fcfd4de0f43ad0ebff85))
- Ensure TBB is optional using OPTIONAL_COMPONENTS ([#127](https://github.com/AztecProtocol/barretenberg/issues/127)) ([e3039b2](https://github.com/AztecProtocol/barretenberg/commit/e3039b26ea8aca4b8fdc4b2cbac6716ace261c76))
- Fixed the memory issue ([#509](https://github.com/AztecProtocol/barretenberg/issues/509)) ([107d438](https://github.com/AztecProtocol/barretenberg/commit/107d438ad96847e40f8e5374749b8cba820b2007))
- msgpack error ([#456](https://github.com/AztecProtocol/barretenberg/issues/456)) ([943d6d0](https://github.com/AztecProtocol/barretenberg/commit/943d6d07c57bea521c2593e892e839f25f82b289))
- msgpack variant_impl.hpp ([#462](https://github.com/AztecProtocol/barretenberg/issues/462)) ([b5838a6](https://github.com/AztecProtocol/barretenberg/commit/b5838a6c9fe456e832776da21379e41c0a2bbd5d))
- **nix:** Disable ASM & ADX when building in Nix ([#327](https://github.com/AztecProtocol/barretenberg/issues/327)) ([3bc724d](https://github.com/AztecProtocol/barretenberg/commit/3bc724d2163d29041bfa29a1e49625bab77289a2))
- **nix:** Use wasi-sdk 12 to provide barretenberg-wasm in overlay ([#315](https://github.com/AztecProtocol/barretenberg/issues/315)) ([4a06992](https://github.com/AztecProtocol/barretenberg/commit/4a069923f4a869f8c2315e6d3f738db6e66dcdfa))
- Pass brew omp location via LDFLAGS and CPPFLAGS ([#126](https://github.com/AztecProtocol/barretenberg/issues/126)) ([54141f1](https://github.com/AztecProtocol/barretenberg/commit/54141f12de9eee86220003b1f80d39a41795cedc))
- Remove leveldb_store from stdlib_merkle_tree ([#149](https://github.com/AztecProtocol/barretenberg/issues/149)) ([3ce5e7e](https://github.com/AztecProtocol/barretenberg/commit/3ce5e7e17ca7bb806373be833a44d55a8e584bda))
- Revert generator changes that cause memory OOB access ([#338](https://github.com/AztecProtocol/barretenberg/issues/338)) ([500daf1](https://github.com/AztecProtocol/barretenberg/commit/500daf1ceb03771d2c01eaf1a86139a7ac1d814f))
- **srs:** Detect shasum utility when downloading lagrange ([#143](https://github.com/AztecProtocol/barretenberg/issues/143)) ([515604d](https://github.com/AztecProtocol/barretenberg/commit/515604dff83648e00106f35511aa567921599a78))
- Store lagrange forms of selector polys w/ Ultra ([#255](https://github.com/AztecProtocol/barretenberg/issues/255)) ([b121963](https://github.com/AztecProtocol/barretenberg/commit/b12196362497c8dfb3a64284d28de2d8ee7d730c))
- throw -&gt; throw_or_abort in sol gen ([#388](https://github.com/AztecProtocol/barretenberg/issues/388)) ([7cfe3f0](https://github.com/AztecProtocol/barretenberg/commit/7cfe3f055815e333ff8a8f1f30e8377c83d2182a))
- **wasm:** Remove the CMAKE_STAGING_PREFIX variable from wasm preset ([#240](https://github.com/AztecProtocol/barretenberg/issues/240)) ([f2f8d1f](https://github.com/AztecProtocol/barretenberg/commit/f2f8d1f7a24ca73e30c981fd245c86f7f964abb7))
- Wrap each use of filesystem library in ifndef **wasm** ([#181](https://github.com/AztecProtocol/barretenberg/issues/181)) ([0eae962](https://github.com/AztecProtocol/barretenberg/commit/0eae96293b4d2da6b6b23ae80ac132fb49f90915))
