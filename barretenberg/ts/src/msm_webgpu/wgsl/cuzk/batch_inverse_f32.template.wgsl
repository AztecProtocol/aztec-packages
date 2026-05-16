// 23-bit f32 mirror of `batch_inverse.template.wgsl`. Montgomery's
// batch-inverse trick on the GPU, single-threaded. Wire format is
// BigIntF32 throughout; the algorithm is Mont-invariant because every
// operation is multiplication.

@group(0) @binding(0)
var<storage, read> inputs: array<BigIntF32>;

@group(0) @binding(1)
var<storage, read_write> prefix: array<BigIntF32>;

@group(0) @binding(2)
var<storage, read_write> outputs: array<BigIntF32>;

@group(0) @binding(3)
var<storage, read_write> count_buf: array<atomic<u32>>;

@compute
@workgroup_size(1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    if (global_id.x != 0u) {
        return;
    }

    let n = atomicLoad(&count_buf[0]);
    if (n == 0u) {
        return;
    }

    var acc: BigIntF32 = inputs[0];
    prefix[0] = acc;
    for (var i = 1u; i < n; i = i + 1u) {
        var a_i: BigIntF32 = inputs[i];
        acc = montgomery_product_f32(&acc, &a_i);
        prefix[i] = acc;
    }

    var inv_acc: BigIntF32 = fr_inv_f32(acc);

    for (var idx = 0u; idx < n - 1u; idx = idx + 1u) {
        let i = n - 1u - idx;
        var prev: BigIntF32 = prefix[i - 1u];
        var out_i: BigIntF32 = montgomery_product_f32(&inv_acc, &prev);
        outputs[i] = out_i;

        var a_i: BigIntF32 = inputs[i];
        inv_acc = montgomery_product_f32(&inv_acc, &a_i);
    }
    outputs[0] = inv_acc;

    {{{ recompile }}}
}
