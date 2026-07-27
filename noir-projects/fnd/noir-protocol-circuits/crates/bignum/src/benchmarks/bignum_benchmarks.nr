comptime fn make_bench(m: Module, params: Quoted) -> Quoted {
    let module_name = m.name();

    // Constrained methods' benchmarks

    let add_bench_name = f"add_{module_name}".quoted_contents();

    let neg_bench_name = f"neg_{module_name}".quoted_contents();
    let sub_bench_name = f"sub_{module_name}".quoted_contents();

    let mul_bench_name = f"mul_{module_name}".quoted_contents();

    let div_bench_name = f"div_{module_name}".quoted_contents();

    let udiv_mod_bench_name = f"udiv_mod_{module_name}".quoted_contents();
    let udiv_bench_name = f"udiv_{module_name}".quoted_contents();

    let eq_bench_name = f"eq_{module_name}".quoted_contents();
    let cmp_bench_name = f"cmp_{module_name}".quoted_contents();
    let is_zero_bench_name = f"is_zero_{module_name}".quoted_contents();
    let is_zero_integer_bench_name = f"is_zero_integer_{module_name}".quoted_contents();

    let assert_is_not_equal_bench_name = f"assert_is_not_equal_{module_name}".quoted_contents();
    let assert_is_not_zero_bench_name = f"assert_is_not_zero_{module_name}".quoted_contents();
    let assert_is_not_zero_integer_bench_name =
        f"assert_is_not_zero_integer_{module_name}".quoted_contents();

    let validate_in_range_bench_name = f"validate_in_range_{module_name}".quoted_contents();
    let validate_in_field_bench_name = f"validate_in_field_{module_name}".quoted_contents();

    let from_field_bench_name = f"from_field_{module_name}".quoted_contents();
    let to_field_bench_name = f"to_field_{module_name}".quoted_contents();

    let to_be_bytes_bench_name = f"to_be_bytes_{module_name}".quoted_contents();
    let from_be_bytes_bench_name = f"from_be_bytes_{module_name}".quoted_contents();
    let to_le_bytes_bench_name = f"to_le_bytes_{module_name}".quoted_contents();
    let from_le_bytes_bench_name = f"from_le_bytes_{module_name}".quoted_contents();

    let derive_from_seed_13_elements_bench_name =
        f"derive_from_seed_13_elements_{module_name}".quoted_contents();

    let evaluate_quadratic_expression_3_elements_bench_name =
        f"evaluate_quadratic_expression_3_elements_{module_name}".quoted_contents();
    let evaluate_quadratic_expression_12_elements_bench_name =
        f"evaluate_quadratic_expression_12_elements_{module_name}".quoted_contents();

    // Unconstrained methods' benchmarks
    let batch_invert_10_elements_bench_name =
        f"batch_invert_10_elements_{module_name}".quoted_contents();

    let sqrt_bench_name = f"sqrt_{module_name}".quoted_contents();

    let pow_bench_name = f"pow_{module_name}".quoted_contents();

    let BigNum = quote { crate::bignum::BigNum };
    let typ = params.as_type();

    let typ_token = params;
    let MOD_BITS = quote { <$typ_token as $BigNum>::MOD_BITS };
    let N = quote { <$typ_token as $BigNum>::N };

    quote {
        #[export]
        fn $add_bench_name(a: $typ, b: $typ) -> $typ {
            a + b
        }

        #[export]
        fn $neg_bench_name(a: $typ) -> $typ {
            -a
        }

        #[export] 
        fn $sub_bench_name(a: $typ, b: $typ) -> $typ {
            a - b
        }

        #[export]
        fn $mul_bench_name(a: $typ, b: $typ) -> $typ {
            a * b
        }

        #[export]
        fn $div_bench_name(a: $typ, b: $typ) -> $typ {
            a / b
        }

        #[export]  
        fn $udiv_mod_bench_name(a: $typ, b: $typ) -> ($typ, $typ) {
            $BigNum::udiv_mod(a, b)
        }

        #[export]
        fn $udiv_bench_name(a: $typ, b: $typ) -> $typ {
            $BigNum::udiv(a, b)
        }

        #[export]
        fn $eq_bench_name(a: $typ, b: $typ) -> bool {
            a == b
        }

        #[export]
        fn $cmp_bench_name(a: $typ, b: $typ) -> bool {
            a > b
        }

        #[export]
        fn $is_zero_bench_name(a: $typ) -> bool {
            $BigNum::is_zero(a)
        }

        #[export]
        fn $is_zero_integer_bench_name(a: $typ) -> bool {
            $BigNum::unsafe_is_zero_integer(a)
        }

        #[export]
        fn $assert_is_not_equal_bench_name(a: $typ, b: $typ) {
            $BigNum::assert_is_not_equal(a, b)
        }

        #[export]
        fn $assert_is_not_zero_bench_name(a: $typ) {
            $BigNum::assert_is_not_zero(a)
        }

        #[export]
        fn $assert_is_not_zero_integer_bench_name(a: $typ) {
            $BigNum::unsafe_assert_is_not_zero_integer(a)
        }

        #[export]
        fn $validate_in_range_bench_name(a: $typ) {
            $BigNum::validate_in_range(a)
        }

        #[export]
        fn $validate_in_field_bench_name(a: $typ) {
            $BigNum::validate_in_field(a)
        }        

        #[export]
        fn $from_field_bench_name(a: Field) -> $typ {
            $typ::from(a)
        }

        #[export]
        fn $to_field_bench_name(a: $typ) -> Field {
            crate::bignum::to_field(a)
        }

        #[export]
        fn $from_be_bytes_bench_name(a: [u8; ($MOD_BITS+7) / 8]) -> [u128; $N] {
            crate::fns::serialization::from_be_bytes_unsafe(a)
        }

        #[export]
        fn $to_be_bytes_bench_name(a: $typ) -> [u8; ($MOD_BITS+7) / 8] {
            crate::fns::serialization::to_be_bytes_unsafe($BigNum::get_limbs(a))
        }

        #[export]
        fn $from_le_bytes_bench_name(a: [u8; ($MOD_BITS+7) / 8]) -> [u128; $N] {
            crate::fns::serialization::from_le_bytes_unsafe(a)
        }

        #[export]
        fn $to_le_bytes_bench_name(a: $typ) -> [u8; ($MOD_BITS+7) / 8] {
            crate::fns::serialization::to_le_bytes_unsafe($BigNum::get_limbs(a))
        }

        #[export]
        fn $derive_from_seed_13_elements_bench_name(a: [u8; 13]) -> $typ {
            $BigNum::derive_from_seed(a)
        }

        #[export]
        fn $evaluate_quadratic_expression_3_elements_bench_name(
            lhs: [[$typ; 3]; 3],
            lhs_flags: [[bool; 3]; 3],
            rhs: [[$typ; 3]; 3],
            rhs_flags: [[bool; 3]; 3],
            add: [$typ; 3],
            add_flags: [bool; 3],
        ) {
            crate::bignum::evaluate_quadratic_expression(lhs, lhs_flags, rhs, rhs_flags, add, add_flags)
        }

        #[export]
        fn $evaluate_quadratic_expression_12_elements_bench_name(
            lhs: [[$typ; 3]; 12],
            lhs_flags: [[bool; 3]; 12],
            rhs: [[$typ; 3]; 12],
            rhs_flags: [[bool; 3]; 12],
            add: [$typ; 3],
            add_flags: [bool; 3],
        ) {
            crate::bignum::evaluate_quadratic_expression(lhs, lhs_flags, rhs, rhs_flags, add, add_flags)
        }

        #[export]
        fn $batch_invert_10_elements_bench_name(a: [$typ; 10]) -> [$typ; 10]{
           // Safety: Benchmarking 
           unsafe { crate::bignum::batch_invert(a) }                         
        }

        #[export]
        fn $pow_bench_name(a: $typ, b: $typ) -> $typ{
           // Safety: Benchmarking 
           unsafe { $BigNum::__pow(a, b) }                         
        }

        #[export]
        fn $sqrt_bench_name(a: $typ) -> Option<$typ> {
           // Safety: Benchmarking 
            unsafe { $BigNum::__sqrt(a) }
        }
   }
}

// the types we will be benchmarking
// type BN254Fq
// type U256
// type BLS12_381Fq
// type BLS12_381Fr
// type BLS12_377Fq
// type BLS12_377Fr
// type U2048

#[make_bench(quote { crate::fields::bn254Fq::BN254_Fq })]
mod BN254_Fq_Bench {}

#[make_bench(quote { crate::fields::U256::U256 })]
mod U256_Bench {}

#[make_bench(quote { crate::fields::bls12_381Fq::BLS12_381_Fq })]
mod BLS12_381Fq_Bench {}

#[make_bench(quote { crate::fields::bls12_381Fr::BLS12_381_Fr })]
mod BLS12_381Fr_Bench {}

#[make_bench(quote { crate::fields::bls12_377Fq::BLS12_377_Fq })]
mod BLS12_377Fq_Bench {}

#[make_bench(quote { crate::fields::bls12_377Fr::BLS12_377_Fr })]
mod BLS12_377Fr_Bench {}

#[make_bench(quote { crate::fields::U2048::U2048 })]
mod U2048_Bench {}
