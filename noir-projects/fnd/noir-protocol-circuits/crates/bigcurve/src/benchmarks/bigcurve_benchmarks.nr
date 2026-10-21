use crate::curves::bls12_377::BLS12_377;
use crate::curves::bls12_381::BLS12_381;
use crate::curves::bn254::BN254;
use crate::curves::mnt4_753::MNT4_753;
use crate::curves::mnt6_753::MNT6_753;
use crate::curves::pallas::Pallas;
use crate::curves::secp256k1::Secp256k1;
use crate::curves::secp256r1::Secp256r1;
use crate::curves::secp384r1::Secp384r1;
use crate::curves::vesta::Vesta;

comptime fn make_bench(m: Module, params: Quoted) -> Quoted {
    let module_name = m.name();
    let add_bench_name = f"add_{module_name}".quoted_contents();
    let sub_bench_name = f"sub_{module_name}".quoted_contents();
    let neg_bench_name = f"neg_{module_name}".quoted_contents();
    let mul_bench_name = f"mul_{module_name}".quoted_contents();
    let eq_bench_name = f"eq_{module_name}".quoted_contents();
    let validate_on_curve_bench_name = f"validate_on_curve_{module_name}".quoted_contents();
    let evaluate_linear_expression_bench_name =
        f"evaluate_linear_expression_{module_name}".quoted_contents();
    let hash_to_curve_bench_name = f"hash_to_curve_{module_name}".quoted_contents();
    let BigCurve = quote { crate::bigcurve::BigCurve };
    let ScalarField = quote { crate::scalar_field::ScalarField };

    let typ = params.as_type();

    quote {
        #[export]
        fn $add_bench_name(a: $typ, b: $typ) -> $typ {
            a + b
        }

        #[export] 
        fn $sub_bench_name(a: $typ, b: $typ) -> $typ {
            a - b
        }

        #[export]
        fn $neg_bench_name(a: $typ) -> $typ {
            -a
        }

        #[export]
        fn $eq_bench_name(a: $typ, b: $typ) -> bool {
            a == b
        }
        #[export]
        fn $validate_on_curve_bench_name(a: $typ) {
            $BigCurve::validate_on_curve(a);
        }

        #[export]
        fn $mul_bench_name(a: $typ, b: $ScalarField<64>) -> $typ {
            $BigCurve::mul(a, b)
        }

        #[export]
        fn $hash_to_curve_bench_name(a: [u8; 10]) -> $typ {
            $BigCurve::hash_to_curve(a)
        }

        #[export]
        fn $evaluate_linear_expression_bench_name(a: [$typ; 3], b: [$ScalarField<64>; 3], c: [$typ; 2]) -> $typ {
            $BigCurve::evaluate_linear_expression(a, b, c)
        }

    }
}

#[make_bench(quote { BN254 })]
mod BN254_Bench {}

#[make_bench(quote { BLS12_381 })]
mod BLS12_381_Bench {}

#[make_bench(quote { BLS12_377 })]
mod BLS12_377_Bench {}

#[make_bench(quote { MNT4_753 })]
mod MNT4_753_Bench {}

#[make_bench(quote { MNT6_753 })]
mod MNT6_753_Bench {}

#[make_bench(quote { Pallas })]
mod Pallas_Bench {}

#[make_bench(quote { Secp256k1 })]
mod Secp256k1_Bench {}

#[make_bench(quote { Secp256r1 })]
mod Secp256r1_Bench {}

#[make_bench(quote { Secp384r1 })]
mod Secp384r1_Bench {}

#[make_bench(quote { Vesta })]
mod Vesta_Bench {}
