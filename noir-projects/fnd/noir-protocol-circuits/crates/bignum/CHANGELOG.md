# Changelog

## [0.10.0](https://github.com/noir-lang/noir-bignum/compare/v0.9.2...v0.10.0) (2026-04-08)


### ⚠ BREAKING CHANGES

* update poseidon2 dependency ([#263](https://github.com/noir-lang/noir-bignum/issues/263))

### Bug Fixes

* Update poseidon2 dependency ([#263](https://github.com/noir-lang/noir-bignum/issues/263)) ([b76ce95](https://github.com/noir-lang/noir-bignum/commit/b76ce951d258f76019d958aaef2413b308a0309b))

## [0.9.2](https://github.com/noir-lang/noir-bignum/compare/v0.9.1...v0.9.2) (2026-02-20)


### Bug Fixes

* Update poseidon dependency to version v0.2.6 ([#259](https://github.com/noir-lang/noir-bignum/issues/259)) ([7fdfcf6](https://github.com/noir-lang/noir-bignum/commit/7fdfcf6080d0b698d692c0d9da76befd7d69c9ec))

## [0.9.1](https://github.com/noir-lang/noir-bignum/compare/v0.9.0...v0.9.1) (2026-02-19)


### Bug Fixes

* Unnecessary comptime global & Update poseidon ([#257](https://github.com/noir-lang/noir-bignum/issues/257)) ([d438539](https://github.com/noir-lang/noir-bignum/commit/d438539bf6e29d52cc79f3165532a3c8404d3eeb))

## [0.9.0](https://github.com/noir-lang/noir-bignum/compare/v0.8.3...v0.9.0) (2026-02-05)


### ⚠ BREAKING CHANGES

* Dispatch to udiv from `Div` trait impl for bignums without a multiplicative inverse. ([#253](https://github.com/noir-lang/noir-bignum/issues/253))

### Features

* Barrett reduciton optimization ([#241](https://github.com/noir-lang/noir-bignum/issues/241)) ([e7d5cb0](https://github.com/noir-lang/noir-bignum/commit/e7d5cb0a8c150282bca0a2ef01429ffd7dbf11fb))
* Re-export macro-required functions from pub(crate) modules ([#245](https://github.com/noir-lang/noir-bignum/issues/245)) ([c02db37](https://github.com/noir-lang/noir-bignum/commit/c02db375ceacb6f8f963c1aed6086c4c3acd9bab))
* Remove redundant hinting of `result` on various operations ([#252](https://github.com/noir-lang/noir-bignum/issues/252)) ([9c4d299](https://github.com/noir-lang/noir-bignum/commit/9c4d299c2240da7f57387d329ef2e9a88784cc93))
* Split params object to avoid passing unused data ([#249](https://github.com/noir-lang/noir-bignum/issues/249)) ([16d4ba6](https://github.com/noir-lang/noir-bignum/commit/16d4ba665232699083c4154de1c17c4a50eeac34))
* Switch to gcd algorithm for `__invmod` ([#255](https://github.com/noir-lang/noir-bignum/issues/255)) ([2d2d6d7](https://github.com/noir-lang/noir-bignum/commit/2d2d6d7fe5b66d32f8ec52c9909dd85d2f84c0a0))


### Bug Fixes

* Dispatch to udiv from `Div` trait impl for bignums without a multiplicative inverse. ([#253](https://github.com/noir-lang/noir-bignum/issues/253)) ([cd4ad0e](https://github.com/noir-lang/noir-bignum/commit/cd4ad0e39f1dd9c63fde0186c01c5535a3724e2a))
* Prevent infinite loop when inverting modulus value and add testing ([#256](https://github.com/noir-lang/noir-bignum/issues/256)) ([5293dc6](https://github.com/noir-lang/noir-bignum/commit/5293dc6471f7571485261e0255550a4b1fdb2390))

## [0.8.3](https://github.com/noir-lang/noir-bignum/compare/v0.8.2...v0.8.3) (2025-12-04)


### Bug Fixes

* **expressions:** Document, clean up and restructure `evaluate_quadratic_expression` ([#232](https://github.com/noir-lang/noir-bignum/issues/232)) ([2affae1](https://github.com/noir-lang/noir-bignum/commit/2affae1bf72574e2cb2b55edf17ac2f1a05f93e6))
* **udiv_mod:** Change `udiv_mod` expression evaluation method ([#235](https://github.com/noir-lang/noir-bignum/issues/235)) ([f7debae](https://github.com/noir-lang/noir-bignum/commit/f7debae5f3cc329377315457303196baea2f6db1))

## [0.8.2](https://github.com/noir-lang/noir-bignum/compare/v0.8.1...v0.8.2) (2025-11-13)


### Bug Fixes

* Revert `batch_invert` ([#222](https://github.com/noir-lang/noir-bignum/issues/222)) ([fe25ca4](https://github.com/noir-lang/noir-bignum/commit/fe25ca4d2cb9178b67d3322fe19d0e53644cbfdf))

## [0.8.1](https://github.com/noir-lang/noir-bignum/compare/v0.8.0...v0.8.1) (2025-11-13)


### Features

* Clean up and optimize `__barrett_reduction` ([#214](https://github.com/noir-lang/noir-bignum/issues/214)) ([e163efa](https://github.com/noir-lang/noir-bignum/commit/e163efac2f306296a4680979f64291079a5e6ef0))
* Clean up and optimize arithmetic with flags  ([#217](https://github.com/noir-lang/noir-bignum/issues/217)) ([a44cf68](https://github.com/noir-lang/noir-bignum/commit/a44cf685013cf7ab16af43972367ee95f6eb457b))

## [0.8.0](https://github.com/noir-lang/noir-bignum/compare/v0.7.5...v0.8.0) (2025-08-14)


### ⚠ BREAKING CHANGES

* switch to new bit shifts semantic ([#196](https://github.com/noir-lang/noir-bignum/issues/196))

### Bug Fixes

* Switch to new bit shifts semantic ([#196](https://github.com/noir-lang/noir-bignum/issues/196)) ([d87eeb0](https://github.com/noir-lang/noir-bignum/commit/d87eeb062e03ea087e2f473367265fa58a66b5e9))

## [0.7.5](https://github.com/noir-lang/noir-bignum/compare/v0.7.4...v0.7.5) (2025-07-24)


### Bug Fixes

* Let the bignum module be public ([#192](https://github.com/noir-lang/noir-bignum/issues/192)) ([a43f327](https://github.com/noir-lang/noir-bignum/commit/a43f327ab2a9838ae99d35494c7ed6e66a1eb542))

## [0.7.4](https://github.com/noir-lang/noir-bignum/compare/v0.7.3...v0.7.4) (2025-07-11)


### Features

* Expose bignum trait derivation macro  ([#187](https://github.com/noir-lang/noir-bignum/issues/187)) ([103d6e2](https://github.com/noir-lang/noir-bignum/commit/103d6e2b360123f9bc2a378e0a5810d9fb41f9f1))
* Remove conditional select from Bignum ([#185](https://github.com/noir-lang/noir-bignum/issues/185)) ([38c03e7](https://github.com/noir-lang/noir-bignum/commit/38c03e75b14a25c2321cd0a11186760fa403a106))


### Bug Fixes

* Correct from_field and derive_from_seed for small field modulus ([#190](https://github.com/noir-lang/noir-bignum/issues/190)) ([52b4cd0](https://github.com/noir-lang/noir-bignum/commit/52b4cd0d6a72d8de34aaad6577dc1164afeea428))

## [0.7.3](https://github.com/noir-lang/noir-bignum/compare/v0.7.2...v0.7.3) (2025-05-30)


### Bug Fixes

* Bump poseidon to v0.1.1 ([#177](https://github.com/noir-lang/noir-bignum/issues/177)) ([bb978f6](https://github.com/noir-lang/noir-bignum/commit/bb978f66fe822f39332cab6aed452151597b2962))
* Do not cast numeric to bool ([#182](https://github.com/noir-lang/noir-bignum/issues/182)) ([e9b1985](https://github.com/noir-lang/noir-bignum/commit/e9b1985455dda46a01c7d07cecbb697bbc6214e8))
* Refactor __get_msb to work on a single 128bit debrujin sequence ([#181](https://github.com/noir-lang/noir-bignum/issues/181)) ([3f4a7da](https://github.com/noir-lang/noir-bignum/commit/3f4a7da92e570aed393f5ffe425fd7a212a5d9ad))
* Remove `as_array` call for which `N` cannot be deduced ([#180](https://github.com/noir-lang/noir-bignum/issues/180)) ([c7c7720](https://github.com/noir-lang/noir-bignum/commit/c7c77208f83af0a966177dbf9c7dedb61a45ff90))

## [0.7.2](https://github.com/noir-lang/noir-bignum/compare/v0.7.1...v0.7.2) (2025-05-22)


### Bug Fixes

* Fix the `from::&lt;Field&gt;` logic when the `MOD_BITS` is the same as the native field bitsize  ([#172](https://github.com/noir-lang/noir-bignum/issues/172)) ([aed8c3a](https://github.com/noir-lang/noir-bignum/commit/aed8c3a8390d0e9125d34e5a0884351160fe6d7d))
* Remove unused generic in trait impl ([#176](https://github.com/noir-lang/noir-bignum/issues/176)) ([31189ce](https://github.com/noir-lang/noir-bignum/commit/31189ce7648e33787e364890aa47ec325bfb4d9b))
* Remove unused generics ([#174](https://github.com/noir-lang/noir-bignum/issues/174)) ([ea51006](https://github.com/noir-lang/noir-bignum/commit/ea51006df70f8161bbe268182b617ca399b75824))

## [0.7.1](https://github.com/noir-lang/noir-bignum/compare/v0.7.0...v0.7.1) (2025-04-28)


### Bug Fixes

* Fixing the bug when comparing two equal bignums ([#168](https://github.com/noir-lang/noir-bignum/issues/168)) ([7d02987](https://github.com/noir-lang/noir-bignum/commit/7d02987ce8d0575182a156b4707036b240cf0ab1))
* Replace references to associated constants with macro-generated constants ([#169](https://github.com/noir-lang/noir-bignum/issues/169)) ([ed93f0b](https://github.com/noir-lang/noir-bignum/commit/ed93f0bc84c8a9bcc4ed434ce2aa80e28fd80055))

## [0.7.0](https://github.com/noir-lang/noir-bignum/compare/v0.6.1...v0.7.0) (2025-04-18)


### ⚠ BREAKING CHANGES

* convert methods into free functions where appropriate ([#161](https://github.com/noir-lang/noir-bignum/issues/161))
* implementing `BignumTrait` for each type using metaprogramming ([#151](https://github.com/noir-lang/noir-bignum/issues/151))
* Fixing the bytesize for be, le byte serialization, adding new functionality and tests ([#157](https://github.com/noir-lang/noir-bignum/issues/157))

### Features

* Fixing the bytesize for be, le byte serialization, adding new functionality and tests ([#157](https://github.com/noir-lang/noir-bignum/issues/157)) ([3a2664e](https://github.com/noir-lang/noir-bignum/commit/3a2664e9fd02edc75f574159dfb6e89cdb752db0))
* Implementing `BignumTrait` for each type using metaprogramming ([#151](https://github.com/noir-lang/noir-bignum/issues/151)) ([6a7cf5f](https://github.com/noir-lang/noir-bignum/commit/6a7cf5fa20f1e7b1c0ccad336f8dba5f64509967))


### Bug Fixes

* Fix warnings ([#167](https://github.com/noir-lang/noir-bignum/issues/167)) ([ddfb63a](https://github.com/noir-lang/noir-bignum/commit/ddfb63a4023e2d84f35fb1e7f99d07611d4b655d))
* Fixed the array length bug when normalizing limbs in multiplication  ([#159](https://github.com/noir-lang/noir-bignum/issues/159)) ([98256f3](https://github.com/noir-lang/noir-bignum/commit/98256f3d9bdcfc58ef6e3939875bf19b6e86e912))
* Remove usage of stdlib poseidon ([#166](https://github.com/noir-lang/noir-bignum/issues/166)) ([19c4a48](https://github.com/noir-lang/noir-bignum/commit/19c4a4849d4b550bde7224f29f586c1b90952330))


### Miscellaneous Chores

* Convert methods into free functions where appropriate ([#161](https://github.com/noir-lang/noir-bignum/issues/161)) ([7a851dd](https://github.com/noir-lang/noir-bignum/commit/7a851ddfdedc125d593f3bd161f56074f7ecf84a))

## [0.6.1](https://github.com/noir-lang/noir-bignum/compare/v0.6.0...v0.6.1) (2025-03-11)


### Features

* Add comparison operators ([#130](https://github.com/noir-lang/noir-bignum/issues/130)) ([ad90979](https://github.com/noir-lang/noir-bignum/commit/ad9097927f7844dc4549e4e4322c8fed110342e8))

## [0.6.0](https://github.com/noir-lang/noir-bignum/compare/v0.5.4...v0.6.0) (2025-02-25)


### ⚠ BREAKING CHANGES

* refactor library to work on u128 limbs ([#120](https://github.com/noir-lang/noir-bignum/issues/120))
* remove the `RuntimeBignumTrait` and impl the methods directly for the `RuntimeBignum` struct.  ([#134](https://github.com/noir-lang/noir-bignum/issues/134))

### Features

* Export pre-defined bignum types ([#125](https://github.com/noir-lang/noir-bignum/issues/125)) ([41c3882](https://github.com/noir-lang/noir-bignum/commit/41c38828dbb6277eff99cea9e2d0901a601b943b))
* Refactor library to work on u128 limbs ([#120](https://github.com/noir-lang/noir-bignum/issues/120)) ([78e7216](https://github.com/noir-lang/noir-bignum/commit/78e7216b019db27530322ae9bba5d0bb6e7c6b6a))


### Bug Fixes

* Bugs on border cases of udiv_mod ([#128](https://github.com/noir-lang/noir-bignum/issues/128)) ([86a9492](https://github.com/noir-lang/noir-bignum/commit/86a9492b063de8b9ce29382445f84efff46a372e))


### Miscellaneous Chores

* Remove the `RuntimeBignumTrait` and impl the methods directly for the `RuntimeBignum` struct.  ([#134](https://github.com/noir-lang/noir-bignum/issues/134)) ([954dcf6](https://github.com/noir-lang/noir-bignum/commit/954dcf6bf5335c20d4c75f99cb9f9c448c6d6996))

## [0.5.4](https://github.com/noir-lang/noir-bignum/compare/v0.5.3...v0.5.4) (2025-02-08)


### Bug Fixes

* Correct batch inversion implementation ([#121](https://github.com/noir-lang/noir-bignum/issues/121)) ([399d21a](https://github.com/noir-lang/noir-bignum/commit/399d21adb6786ad0ce2b670e8b216faf1f8a3fc2))

## [0.5.3](https://github.com/noir-lang/noir-bignum/compare/v0.5.2...v0.5.3) (2025-02-03)


### Bug Fixes

* Correct batch inversion function ([#117](https://github.com/noir-lang/noir-bignum/issues/117)) ([976d3ef](https://github.com/noir-lang/noir-bignum/commit/976d3efd392fc12d95256624e82f5c826e98ab82))

## [0.5.2](https://github.com/noir-lang/noir-bignum/compare/v0.5.1...v0.5.2) (2025-01-29)


### Features

* Add `is_zero` ([#111](https://github.com/noir-lang/noir-bignum/issues/111)) ([2ca1383](https://github.com/noir-lang/noir-bignum/commit/2ca1383238b927d11fc12c48c618475172c0a677))
* Implement `Default` trait on `BigNum` ([#109](https://github.com/noir-lang/noir-bignum/issues/109)) ([e56352a](https://github.com/noir-lang/noir-bignum/commit/e56352a05c3cb8620076dd9e0453ef9b20974315))


### Bug Fixes

* Constrain `split_60_bits` function ([#113](https://github.com/noir-lang/noir-bignum/issues/113)) ([0d19e5a](https://github.com/noir-lang/noir-bignum/commit/0d19e5a34dbfa91e9f7c2eedb3e51b034ecd75d7))

## [0.5.1](https://github.com/noir-lang/noir-bignum/compare/v0.5.0...v0.5.1) (2025-01-27)


### Features

* Add zero constructor ([#108](https://github.com/noir-lang/noir-bignum/issues/108)) ([c6466ef](https://github.com/noir-lang/noir-bignum/commit/c6466ef6c831d6ecd12dbc9e921b822319f7e4a8))
* Added `to_field` function ([#99](https://github.com/noir-lang/noir-bignum/issues/99)) ([7c92c22](https://github.com/noir-lang/noir-bignum/commit/7c92c22d35bb2f4199d53b32dd339d6b9142bb0d))
* Constrain ops only in constrained context ([#102](https://github.com/noir-lang/noir-bignum/issues/102)) ([b3000e1](https://github.com/noir-lang/noir-bignum/commit/b3000e17c4f057be85cf36e56816ea77b719e5f2))
* Deprecate `BigNum::new()` ([#110](https://github.com/noir-lang/noir-bignum/issues/110)) ([ce3c654](https://github.com/noir-lang/noir-bignum/commit/ce3c654a077f2b5c96f53610123f9321fcd11089))
* Implement `From&lt;Field&gt;` on `BigNum` ([#87](https://github.com/noir-lang/noir-bignum/issues/87)) ([35bf983](https://github.com/noir-lang/noir-bignum/commit/35bf983bdf80abbb2f191dd6c464a6fe3516f9c2))
* Minor unconstrained bytecode optimizations ([#79](https://github.com/noir-lang/noir-bignum/issues/79)) ([b44ef7f](https://github.com/noir-lang/noir-bignum/commit/b44ef7f6bee56751e2d83848e84accf25e0bdc0f))
* Remove unnecessary usage of slices ([#104](https://github.com/noir-lang/noir-bignum/issues/104)) ([fb6f9e5](https://github.com/noir-lang/noir-bignum/commit/fb6f9e5982dda8729d6b12ef83ad3ef60cdf0b7e))

## [0.5.0](https://github.com/noir-lang/noir-bignum/compare/v0.4.2...v0.5.0) (2025-01-06)


### ⚠ BREAKING CHANGES

* remove redefinition of arithmetic methods on `BigNumTrait` ([#84](https://github.com/noir-lang/noir-bignum/issues/84))

### Features

* Remove redefinition of arithmetic methods on `BigNumTrait` ([#84](https://github.com/noir-lang/noir-bignum/issues/84)) ([b5c6ce2](https://github.com/noir-lang/noir-bignum/commit/b5c6ce20d8a5705127f3b0c33a17e77750fc91c2))

## [0.4.2](https://github.com/noir-lang/noir-bignum/compare/v0.4.1...v0.4.2) (2024-11-15)


### Bug Fixes

* Constraint count regression introduced in commit 53f652b  ([#53](https://github.com/noir-lang/noir-bignum/issues/53)) ([d81d5fa](https://github.com/noir-lang/noir-bignum/commit/d81d5fac5e2ea919bd93e513644d0edc5630261c))

## [0.4.1](https://github.com/noir-lang/noir-bignum/compare/v0.4.0...v0.4.1) (2024-11-08)


### Features

* Optimize brillig execution of `split_X_bits` functions ([#47](https://github.com/noir-lang/noir-bignum/issues/47)) ([31ebc7c](https://github.com/noir-lang/noir-bignum/commit/31ebc7cc03a7d8be4aef90a632515f79e3405c7a))
* Remove a bunch of unnecessary bytecode from unconstrained ops ([#50](https://github.com/noir-lang/noir-bignum/issues/50)) ([08c4151](https://github.com/noir-lang/noir-bignum/commit/08c4151f12cc4fe1831da2eba6c854948a17c3d8))
* Remove generic parameter from the `BigNum` trait ([#44](https://github.com/noir-lang/noir-bignum/issues/44)) ([53f652b](https://github.com/noir-lang/noir-bignum/commit/53f652b443967b589ae5ee3b3c9bdba5d3606806))


### Bug Fixes

* Check that `RuntimeBigNum`s have the same `BigNumParams` on operations ([#46](https://github.com/noir-lang/noir-bignum/issues/46)) ([729dd24](https://github.com/noir-lang/noir-bignum/commit/729dd244e07a17b4c5f4d24fcd63caae91e8d645))
* Fix barrett reduction bug ([#51](https://github.com/noir-lang/noir-bignum/issues/51)) ([c61a621](https://github.com/noir-lang/noir-bignum/commit/c61a621745fb6a6c3778fbee35344bc7cf79f6a9))
* Fix broken tests in `runtime_bignum_test.nr` ([#39](https://github.com/noir-lang/noir-bignum/issues/39)) ([63e6c85](https://github.com/noir-lang/noir-bignum/commit/63e6c851712ff3492d0b538437d3ddb0c6aacc1e))

## [0.4.0](https://github.com/noir-lang/noir-bignum/compare/v0.3.5...v0.4.0) (2024-11-01)


### ⚠ BREAKING CHANGES

* refactor library architecture ([#36](https://github.com/noir-lang/noir-bignum/issues/36))
* bump minimum noir version to 0.35.0 and address privacy warnings #24

### Features

* Added modular square root computation and fully constrained `derive_from_seed` method ([#32](https://github.com/noir-lang/noir-bignum/issues/32)) ([20e03b0](https://github.com/noir-lang/noir-bignum/commit/20e03b04f7e2c57b61538d707695ae02979c51b4))
* Refactor library architecture ([#36](https://github.com/noir-lang/noir-bignum/issues/36)) ([4fa65f6](https://github.com/noir-lang/noir-bignum/commit/4fa65f6be596ea1b6c6c49b784fa7a9aca95c5d4))


### Bug Fixes

* Bump minimum noir version to 0.35.0 and address privacy warnings [#24](https://github.com/noir-lang/noir-bignum/issues/24) ([fc53098](https://github.com/noir-lang/noir-bignum/commit/fc53098332e1843759114ad7c05118e8fee141ed))
* Fixed reduction parameter error ([#31](https://github.com/noir-lang/noir-bignum/issues/31)) ([c312ef7](https://github.com/noir-lang/noir-bignum/commit/c312ef72e2127153fad5afcffc5bf88045a5b4ba))
* Remove unnecessary generic ([#42](https://github.com/noir-lang/noir-bignum/issues/42)) ([1eb64aa](https://github.com/noir-lang/noir-bignum/commit/1eb64aab691e96d143775183987e7dfc2132bdc3))

## [0.3.5](https://github.com/noir-lang/noir-bignum/compare/v0.3.4...v0.3.5) (2024-10-02)


### Features

* Bignum uses generic arithmetic instead of clunky ArrayX struct ([#17](https://github.com/noir-lang/noir-bignum/issues/17)) ([08f5710](https://github.com/noir-lang/noir-bignum/commit/08f5710e085e55c038b8555032c90a31d7c91037))
