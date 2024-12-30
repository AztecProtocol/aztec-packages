// Sanity check for the platform
#if defined(__x86_64__)

////////////////////////////////////////////////////////////////////////////////
///  Simple macros
////////////////////////////////////////////////////////////////////////////////

// Save current CPU context to start a function. From System V AMD64 ABI calling 
// conventions, registers %rbx, %rsp, %rbp, %r12-%r15 must be restored at return.
.macro save_context
    pushq %rbp
    pushq %r15
    pushq %r14
    pushq %r13
    pushq %r12
    pushq %rbx
.endm

// Restore CPU context  to finish a function. 
// Symmetric to above save function.
.macro restore_context
    popq %rbx
    popq %r12
    popq %r13
    popq %r14
    popq %r15
    popq %rbp
.endm

// Load 4 registers r0, r1, r2, r3, 
// from memory address pointed by ptr.
.macro load_from ptr r0 r1 r2 r3
    
    movq   (\ptr),  \r0
    movq  8(\ptr),  \r1
    movq 16(\ptr),  \r2
    movq 24(\ptr),  \r3

.endm

// Store 4 registers r0, r1, r2, r3, 
// to memory address pointed by ptr.
.macro store_to ptr r0 r1 r2 r3

    movq \r0,   (\ptr)
    movq \r1,  8(\ptr)
    movq \r2, 16(\ptr)
    movq \r3, 24(\ptr)

.endm

// [x0, x1, x2, x3, x4] += [y0, y1, y2, y3]
// Set x4 to 0 before calling, then x4 get the carry
// or perform add 4-word y to 5-word x (assuming no overflow)
.macro add256 x0 x1 x2 x3 x4 y0 y1 y2 y3

    addq \y0, \x0
    adcq \y1, \x1
    adcq \y2, \x2
    adcq \y3, \x3
    adcq $0,  \x4

.endm

// [x0, x1, x2, x3] -= [y0, y1, y2, y3]
// Borrow is returned in b
.macro sub256 x0 x1 x2 x3 b y0 y1 y2 y3

    subq \y0, \x0
    sbbq \y1, \x1
    sbbq \y2, \x2
    sbbq \y3, \x3
    adcq $0,  \b

.endm

////////////////////////////////////////////////////////////////////////////////
///  Partial reduction macros
////////////////////////////////////////////////////////////////////////////////

// ----------------------------------------------------------------------------
// Macro overflow_reduce
//
// Takes a 257-bit integer t and reduce it (mod p) to a 256-bit integer
// t = [t0, t1, t2, t3, t4] with t4 in {0,1}
// 
// The overflow reduction does the following:
//  - let b255 = t >> 255
//  - let b256 = t >> 256 (= t4)
//  - if b256 = 1 and b255 = 1 then we remove 32 p = [32, 0, 0, 544, 1] to t
//  - if b256 = 1 and b255 = 0 then we remove 16 p = [16, 0, 0, 272 + 2^63, 0] to t
//  - if b256 = 0 then remove nothing
// It first computes s such that
//   - s = 32*p if b255=1 and b256=1
//   - s = 16*p if b255=0 and b256=1
//   - s = 0 otherwise
// then subtracts s to t.
// The 5th (most significant) word is omitted in this subtraction (result always 0).
//
// The macro takes t0, t1, t2, t3 and b256 as input. 
// Registers for b255, s0, s3 do not need to be initialized but are crashed.
// ----------------------------------------------------------------------------

.macro overflow_reduce t0 t1 t2 t3 b256 b255 s0 s3

    // b255 (r9)
    movq \t3, \b255
    shrq $63, \b255

    // compute u = [u0, u1, u2, u3] = b256 * 16p
    // u0 = b256 * 16 (r10)
    movq \b256, \s0
    shlq $4,    \s0
    // u1 = s2 = 0
    // u3 = b256 * (272 + 2^63) (r11)
    movq \b256, \s3
    imulq $272, \b256
    shlq $63,   \s3
    xorq \b256, \s3
    
    // compute s = [s0, s1, s2, s3, s4] = u << b255
    addq $1, \b255
    // s0 = u0  << b255 (r10)
    imulq \b255, \s0 
    // s3 = u << b255 (r11)
    imulq \b255, \s3
    
    // s4 = b256
    // we don't need to compute it and subtract it

    // compute t - s
    subq \s0, \t0
    sbbq $0,  \t1
    sbbq $0,  \t2
    sbbq \s3, \t3

.endm

// ----------------------------------------------------------------------------
// Macro fewbits_reduce
//
// This macro performs a "few bits" reduction modulo p.
// Takes t = [t0, t1, t2, t3, t4], a 5-word integer such that t4 is "small".
// It reduces t modulo p such that the result holds on 4 words.
// By t4 "small", we require t4 to be of 53 bits or less (i.e. t4 < 2^53).
//
// This reduction proceeds as follows
//   1. s = t4 * 32*p, where 32*p = [32, 0, 0, 544, 1]
//   2. t = t - s (mod 2^256), let b be the borrow of this subtraction
//   3. t = t + b * p
//
// Explanation:  
// If the 256-bit subtraction in step 2 produces a borrow, then 
//         s = t4 * 32*p = [32 * t4, 0, 0, 544 * t4, t4] > t
//     <=> t - s = [t0 - 32 * t4, t1, t2, t3 - 544 * t4] < 0
// By adding p = [1, 0, 0, p3] to t - s, we ensure that t - s + p >= 0
// whenever p3 > 544 * t4 (which holds since t4 < 2^53). Moreover, t - s + p
// is then the smallest representative of t mod p (i.e. the one in [0,p)) so
// this addition of p does not overflow.
// 
// The result is stored in [t0, t1, t2, t3]. 
// t4, tmp0, tmp1 are crashed.
// ----------------------------------------------------------------------------

.macro fewbits_reduce t0 t1 t2 t3 t4 tmp0 tmp1

    // compute s = [s0, s1, s2, s3, s4] = t4 * 32*p
    // s0 = 32 * t4 (tmp0)
    movq \t4, \tmp0
    shlq $5, \tmp0
    // s1 = s2 = 0
    // s3 = 544 * t4 (stored in t4)
    imulq $544, \t4

    // t = t - s
    subq \tmp0, \t0
    sbbq $0,   \t1
    sbbq $0,   \t2
    sbbq \t4,  \t3

    // b = borrow (tmp0)
    movq $0, \tmp0
    adcq $0, \tmp0

    // b * p[3] = b * (2^59 + 17) (tmp1)
    // t4 used as tmp register
    movq \tmp0, \tmp1
    imulq $17, \tmp1
    movq \tmp0, \t4 
    shlq $59, \t4
    xorq \t4, \tmp1

    // z += b * p 
    addq \tmp0, \t0
    adcq $0,    \t1
    adcq $0,    \t2
    adcq \tmp1, \t3

.endm


#ifdef __APPLE__
/* Apple Mac OS */
.section __TEXT,__text
#define FUN_PREFIX _
#else
/* Othe UNIX systems */
.section .text
#define FUN_PREFIX
#endif
/* Concatenation helpers */
#define JOIN(x, y) JOIN_AGAIN(x, y)
#define JOIN_AGAIN(x, y) x ## y
#define FUN(f) JOIN(FUN_PREFIX, f)


////////////////////////////////////////////////////////////////////////////////
///  F251 basic operations
////////////////////////////////////////////////////////////////////////////////

// ----------------------------------------------------------------------------
// void f251_add(felt_t z, const felt_t x, const felt_t y)
//
// Computes a 256-bit integer z congruent to x+y modulo p.
// The result z might be greater than p but is lower than 2^256.
// Arguments are passed in rdi (z), rsi (x) and rdx (y).
//
// The function first adds x and y and then performs an "overflow reduction"
// (see macro overflow_reduce).
// ----------------------------------------------------------------------------

.globl FUN(f251_add)
.p2align 4, 0x90

FUN(f251_add): 

    save_context

    // load x
    load_from %rsi, %r8, %r9, %r10, %r11

    // load y
    load_from %rdx, %r12, %r13, %r14, %r15

    // t = x + y (r12 - r15)
    // carry in rax
    movq $0, %rax
    add256 %r12, %r13, %r14, %r15, %rax, %r8, %r9, %r10, %r11

    // z = overflow_reduce(t)
    overflow_reduce %r12, %r13, %r14, %r15, %rax, %r8, %r9, %r10
    // result in r12 - r15

    // store z
    store_to %rdi ,%r12, %r13, %r14, %r15

    restore_context
    retq

// ----------------------------------------------------------------------------
// Macro neg_mod_p 
// 
// Computes t = 32 p - y.
//
// y is passed in [y0, y1, y2, y3] 
// t is returned in [t0, t1, t2, t3, t4]
// ----------------------------------------------------------------------------

.macro neg_mod_p t0 t1 t2 t3 t4 y0 y1 y2 y3

    // t = 32p
    movq $32, \t0
    movq $0,  \t1
    movq $0,  \t2
    movq $544,\t3
    movq $1,  \t4

    // t = 32p - y
    subq \y0, \t0
    sbbq \y1, \t1
    sbbq \y2, \t2
    sbbq \y3, \t3
    sbbq $0,  \t4

.endm 

// ----------------------------------------------------------------------------
// void f251_sub(felt_t z, const felt_t x, const felt_t y)
//
// Computes a 256-bit integer z congruent to x-y modulo p.
// The result z might be greater than p but is lower than 2^256.
// Arguments are passed in rdi (z), rsi (x) and rdx (y).
//
// The function first computes t = 32p - y, then t += x, and finally performs 
// a "few bits reduction" (see macro fewbits_reduce).
// ----------------------------------------------------------------------------

.globl FUN(f251_sub)
.p2align 4, 0x90

FUN(f251_sub): 

    save_context

    // load y
    load_from %rdx, %r12, %r13, %r14, %r15

    // compute t = 32p - y
    neg_mod_p %r8, %r9, %r10, %r11, %rax, %r12, %r13, %r14, %r15
    // result in r8-r11, rax
    
    // load x
    load_from %rsi, %r12, %r13, %r14, %r15

    // t += x
    add256 %r8, %r9, %r10, %r11, %rax, %r12, %r13, %r14, %r15
    // result in r8-r11, rax
    // overflow word (rax) in {0, 1, 2}

    // z = fewbits_reduce(t)
    fewbits_reduce %r8, %r9, %r10, %r11, %rax, %r12, %r13
    // result in r8-r11

    // store z
    store_to %rdi ,%r8, %r9, %r10, %r11

    restore_context
    retq


////////////////////////////////////////////////////////////////////////////////
///  F251 "x +/- c*y" functions
////////////////////////////////////////////////////////////////////////////////

// ----------------------------------------------------------------------------
// Macro x_plus_c_times_y
//
// This macro computes x + c * y.
// The constant c is passed in rdx.
// The result is stored in the register (x0 - x3, tmp1)
// (where tmp1 contains the overflow word)
// 
// ASSUMPTIONS:
//   (1) Flags CF = 0 and OF = 0 at start
//   (2) The constant c is in rdx
// ----------------------------------------------------------------------------

.macro x_plus_c_times_y x0 x1 x2 x3 y0 y1 y2 y3 tmp0 tmp1

    // [x0, x1] += c * y0
    mulxq \y0, \tmp0, \tmp1
    adcxq \tmp0, \x0
    adoxq \tmp1, \x1

    // [x1, x2] += c * y1
    mulxq \y1, \tmp0, \tmp1
    adcxq \tmp0, \x1
    adoxq \tmp1, \x2

    // [x2, x3] += c * y2
    mulxq \y2, \tmp0, \tmp1
    adcxq \tmp0, \x2
    adoxq \tmp1, \x3

    // [x3, _] += c * y3
    mulxq \y3, \tmp0, \tmp1
    adcxq \tmp0, \x3

    // tmp1 = overflow
    movq $0, \tmp0
    adoxq \tmp0, \tmp1
    adcxq \tmp0, \tmp1

.endm

// ----------------------------------------------------------------------------
// void f251_x_plus_c_times_y(felt_t z, const felt_t x, const uint32_t c, const felt_t y)
//
// This function computes z = x + c * y (mod p).
// Arguments are passed in rdi (z), rsi (x), rdx (c), y (rcx).
//
// First loads x and y, 
// then computes x + c * y (macro x_plus_c_times_y), 
// then performs a "few bits reduction" (macro fewbits_reduce),
// finally stores the result.
// ----------------------------------------------------------------------------

.globl FUN(f251_x_plus_c_times_y)
.p2align 4, 0x90

FUN(f251_x_plus_c_times_y): 

    save_context 

    // load x
    load_from %rsi, %r8, %r9, %r10, %r11

    // load y
    load_from %rcx, %r12, %r13, %r14, %r15
    
    // clear CF and OF flags
    addq $0, %rdx
    // compute x + c * y 
    x_plus_c_times_y %r8, %r9, %r10, %r11, %r12, %r13, %r14, %r15, %rax, %rsi
    // result is in (r8-r11, rsi)

    // compute overflow reduction
    fewbits_reduce %r8, %r9, %r10, %r11, %rsi, %rax, %rdx
    // result is in r8-r11

    // store z
    store_to %rdi ,%r8, %r9, %r10, %r11

    restore_context
    retq

// ----------------------------------------------------------------------------
// Macro minus_c_times_y
//
// This macro computes t = c * (32p - y).
// The constant c is passed in rdx.
// The result is stored in the registers t0-t4.
// ----------------------------------------------------------------------------

.macro minus_c_times_y t0 t1 t2 t3 t4 y0 y1 y2 y3

    // t = 32p
    movq $32, \t0
    movq $0,  \t1
    movq $0,  \t2
    movq $544,\t3
    movq $1,  \t4

    // t = 32p - y
    subq \y0, \t0
    sbbq \y1, \t1
    sbbq \y2, \t2
    sbbq \y3, \t3
    sbbq $0,  \t4

    // t = c * (32p - y)
    mulxq \t0, \t0, \y1
    mulxq \t1, \t1, \y2
    mulxq \t2, \t2, \y3
    mulxq \t3, \t3, \y0
    addq  \y1, \t1
    adcq  \y2, \t2
    adcq  \y3, \t3
    adcq  \y0, \t4

.endm

// ----------------------------------------------------------------------------
// void f251_x_minus_c_times_y(felt_t z, const felt_t x, const uint32_t c, const felt_t y)
//
// This function computes z = x - c * y (mod p).
// Arguments are passed in rdi (z), rsi (x), rdx (c), y (rcx).
//
// First loads y, 
// then computes t = c * (32p - y)  (macro minus_c_times_y),
// then loads x,
// then computes t = t + x (macro add256),
// then performs a "few bits reduction" of t (macro fewbits_reduce),
// finally stores the result.
// ----------------------------------------------------------------------------

.globl FUN(f251_x_minus_c_times_y)
.p2align 4, 0x90

FUN(f251_x_minus_c_times_y): 

    save_context 

    // load y 
    load_from %rcx, %r12, %r13, %r14, %r15

    // compute t = c * (32p - y)
    minus_c_times_y %r8, %r9, %r10, %r11, %rcx, %r12, %r13, %r14, %r15
    // result in (r8-r11, rcx)

    // load x
    load_from %rsi, %r12, %r13, %r14, %r15

    // compute t + x
    add256 %r8, %r9, %r10, %r11, %rcx, %r12, %r13, %r14, %r15

    // compute overflow reduction
    fewbits_reduce %r8, %r9, %r10, %r11, %rcx, %rax, %rdx
    // result is in r8-r11

    // store z
    store_to %rdi ,%r8, %r9, %r10, %r11

    restore_context
    retq


////////////////////////////////////////////////////////////////////////////////
///  F251 sum state functions
////////////////////////////////////////////////////////////////////////////////

// ----------------------------------------------------------------------------
// Macros load_state_<i>
//
// Load state[i] in r8-r11 if i=0, in r12-r15 if i>0.
// ----------------------------------------------------------------------------

.macro load_state_0 state

    movq (\state),   %r8
    movq 8(\state),  %r9
    movq 16(\state), %r10
    movq 24(\state), %r11

.endm 

.macro load_state_1 state

    movq 32(\state), %r12
    movq 40(\state), %r13
    movq 48(\state), %r14
    movq 56(\state), %r15

.endm 

.macro load_state_2 state

    movq 64(\state), %r12
    movq 72(\state), %r13
    movq 80(\state), %r14
    movq 88(\state), %r15

.endm 

.macro load_state_3 state

    movq 96(\state),  %r12
    movq 104(\state), %r13
    movq 112(\state), %r14
    movq 120(\state), %r15

.endm 

.macro load_state_4 state

    movq 128(\state), %r12
    movq 136(\state), %r13
    movq 144(\state), %r14
    movq 152(\state), %r15

.endm 

.macro load_state_5 state

    movq 160(\state), %r12
    movq 168(\state), %r13
    movq 176(\state), %r14
    movq 184(\state), %r15

.endm 

.macro load_state_6 state

    movq 192(\state), %r12
    movq 200(\state), %r13
    movq 208(\state), %r14
    movq 216(\state), %r15

.endm 

.macro load_state_7 state

    movq 224(\state), %r12
    movq 232(\state), %r13
    movq 240(\state), %r14
    movq 248(\state), %r15

.endm 

.macro load_state_8 state

    movq 256(\state), %r12
    movq 264(\state), %r13
    movq 272(\state), %r14
    movq 280(\state), %r15

.endm 

// ----------------------------------------------------------------------------
// void f251_sum_state_3(felt_t t, const felt_t state[])
//
// Computes t = state[0] + state[1] + state[2].
//
// Arguments are passed in rdi (t), rsi (state).
// ----------------------------------------------------------------------------

.globl FUN(f251_sum_state_3)
.p2align 4, 0x90

FUN(f251_sum_state_3): 

    save_context 

    // load state[0] in r8-r11
    load_state_0 %rsi

    // load state[1] in r12-r15
    load_state_1 %rsi

    // t = state[0] + state[1]
    movq $0, %rax
    add256 %r8, %r9, %r10, %r11, %rax, %r12, %r13, %r14, %r15
    // result in (r9-r10, rax)

    // load state[2]
    load_state_2 %rsi

    // t = state[0] + state[1] + state[2]
    add256 %r8, %r9, %r10, %r11, %rax, %r12, %r13, %r14, %r15
    // result in (r9-r10, rax)

    // t = fewbits_reduce(t)
    fewbits_reduce %r8, %r9, %r10, %r11, %rax, %rcx, %rdx
    // result is in r8-r11

    // store t
    store_to %rdi ,%r8, %r9, %r10, %r11

    restore_context
    retq

// ----------------------------------------------------------------------------
// void f251_sum_state_4(felt_t t1, felt_t t2, const felt_t state[])
//
// Computes:
//   t1 = state[0] + state[1] + state[2] + state[3]
//   t2 = state[0] + state[1] + state[3]
//
// Arguments are passed in rdi (t1), rsi (t2), rdx(state)
// ----------------------------------------------------------------------------

.globl FUN(f251_sum_state_4)
.p2align 4, 0x90

FUN(f251_sum_state_4): 

    save_context 

    // load state[0] in r8-r11
    load_state_0 %rdx

    // load state[1] in r12-r15
    load_state_1 %rdx

    // t = state[0] + state[1]
    movq $0, %rax
    add256 %r8, %r9, %r10, %r11, %rax, %r12, %r13, %r14, %r15
    // result in (r9-r10, rax)

    // load state[3]
    load_state_3 %rdx

    // t = state[0] + state[1] + state[3]
    add256 %r8, %r9, %r10, %r11, %rax, %r12, %r13, %r14, %r15
    // result in (r9-r10, rax)

    // t2 = fewbits_reduce(t)
    fewbits_reduce %r8, %r9, %r10, %r11, %rax, %rcx, %rbx
    // result is in r8-r11

    // store t2
    store_to %rsi ,%r8, %r9, %r10, %r11

    // load state[2]
    load_state_2 %rdx

    // t = state[0] + state[1] + state[2] + state[3]
    movq $0, %rax
    add256 %r8, %r9, %r10, %r11, %rax, %r12, %r13, %r14, %r15
    // result in (r9-r10, rax)

    // t1 = fewbits_reduce(t)
    fewbits_reduce %r8, %r9, %r10, %r11, %rax, %rcx, %rbx
    // result is in r8-r11

    // store t1
    store_to %rdi ,%r8, %r9, %r10, %r11

    restore_context
    retq


// ----------------------------------------------------------------------------
// void f251_sum_state_5(felt_t t, const felt_t state[])
//
// Computes t = state[0] + ... + state[4]
// 
// Arguments are passed in rdi (t), rsi (state).
// ----------------------------------------------------------------------------

.globl FUN(f251_sum_state_5)
.p2align 4, 0x90

FUN(f251_sum_state_5): 

    save_context 

    // load state[0] in r8-r11
    load_state_0 %rsi

    // load state[1] in r12-r15
    load_state_1 %rsi

    // t = state[0] + state[1]
    movq $0, %rax
    add256 %r8, %r9, %r10, %r11, %rax, %r12, %r13, %r14, %r15
    // result in (r9-r10, rax)

    // load state[2]
    load_state_2 %rsi

    // t = state[0] + state[1] + state[2]
    add256 %r8, %r9, %r10, %r11, %rax, %r12, %r13, %r14, %r15
    // result in (r9-r10, rax)

    // load state[3]
    load_state_3 %rsi

    // t = state[0] + ... + state[3]
    add256 %r8, %r9, %r10, %r11, %rax, %r12, %r13, %r14, %r15
    // result in (r9-r10, rax)

    // load state[4]
    load_state_4 %rsi

    // t = state[0] ... + state[4]
    add256 %r8, %r9, %r10, %r11, %rax, %r12, %r13, %r14, %r15
    // result in (r9-r10, rax)

    // t = fewbits_reduce(t)
    fewbits_reduce %r8, %r9, %r10, %r11, %rax, %rcx, %rdx
    // result is in r8-r11

    // store t
    store_to %rdi ,%r8, %r9, %r10, %r11

    restore_context
    retq


// ----------------------------------------------------------------------------
// void f251_sum_state_9(felt_t t1, felt_t t2, const felt_t state[])
//
// Computes:
//   t1 = state[0] + state[1] + ... + state[7] + state[8]
//   t2 = state[0] + state[1] + ... + state[7]
//
// Arguments are passed in rdi (t1), rsi (t2), rdx(state)
// ----------------------------------------------------------------------------

.globl FUN(f251_sum_state_9)
.p2align 4, 0x90

FUN(f251_sum_state_9): 

    save_context 

    // load state[0] in r8-r11
    load_state_0 %rdx

    // load state[1] in r12-r15
    load_state_1 %rdx

    // t = state[0] + state[1]
    movq $0, %rax
    add256 %r8, %r9, %r10, %r11, %rax, %r12, %r13, %r14, %r15
    // result in (r9-r10, rax)

    // load state[2]
    load_state_2 %rdx

    // t = state[0] + state[1] + state[2]
    add256 %r8, %r9, %r10, %r11, %rax, %r12, %r13, %r14, %r15
    // result in (r9-r10, rax)

    // load state[3]
    load_state_3 %rdx

    // t = state[0] + ... + state[3]
    add256 %r8, %r9, %r10, %r11, %rax, %r12, %r13, %r14, %r15
    // result in (r9-r10, rax)

    // load state[4]
    load_state_4 %rdx

    // t = state[0] + ... + state[4]
    add256 %r8, %r9, %r10, %r11, %rax, %r12, %r13, %r14, %r15
    // result in (r9-r10, rax)

    // load state[5]
    load_state_5 %rdx

    // t = state[0] + ... + state[5]
    add256 %r8, %r9, %r10, %r11, %rax, %r12, %r13, %r14, %r15
    // result in (r9-r10, rax)

    // load state[6]
    load_state_6 %rdx

    // t = state[0] + ... + state[6]
    add256 %r8, %r9, %r10, %r11, %rax, %r12, %r13, %r14, %r15
    // result in (r9-r10, rax)

    // load state[7]
    load_state_7 %rdx

    // t = state[0] + ... + state[7]
    add256 %r8, %r9, %r10, %r11, %rax, %r12, %r13, %r14, %r15
    // result in (r9-r10, rax)

    // t2 = fewbits_reduce(t)
    fewbits_reduce %r8, %r9, %r10, %r11, %rax, %rcx, %rbx
    // result is in r8-r11

    // store t2
    store_to %rsi ,%r8, %r9, %r10, %r11

    // load state[8]
    load_state_8 %rdx

    // t = state[0] + ... + state[8]
    add256 %r8, %r9, %r10, %r11, %rax, %r12, %r13, %r14, %r15
    // result in (r9-r10, rax)

    // t1 = fewbits_reduce(t)
    fewbits_reduce %r8, %r9, %r10, %r11, %rax, %rcx, %rbx
    // result is in r8-r11

    // store t1
    store_to %rdi ,%r8, %r9, %r10, %r11

    restore_context
    retq


////////////////////////////////////////////////////////////////////////////////
///  F251 Montgomery functions 
////////////////////////////////////////////////////////////////////////////////

// ----------------------------------------------------------------------------
// void f251_montgomery_mult(felt_t z, const felt_t x, const felt_t y)
//
// Computes the Montgomery product z between x and y.
// The inputs x and y are 256-bit integers on 4 words.
// The result z is a 256-bit integer on 4 words satisfying 
//   z mod p = x * y * 2^-256 mod p
// Arguments are passed in rdi (z), rsi (x) and rdx (y).
//
// Idea: x and y are represented in Montgomery form. This means that a number [x] mod p is
// represented as x = [x] * 2**256 (mod p), over 4 words of 64 bit: x[0], x[1], x[2], x[3] 
// (from least significant to most significant).
// This representation is not unique, but if we require x < p, it is.
// The representation of [x]*[y] is: ([x] * [y] * 2**256) mod p =
//    ( ([x] * 2**256) * ([y] * 2**256) * 2**(-256) ) mod p =
//    (x * y * 2**(-256)) mod p
//
// A Montgomery round computes a number congruent mod p to:
//   (val + x_i*y) * 2**(-64)
// using the following steps:
// MontgomeryRound(val, x_i, y):
//   Step 1. val += x_i * y
//   Step 2. u = (-val * p^-1) mod 2**64
//   Step 3. val += u * p
//   Step 4. return val >> 64
//
// Remarks:
// 1. u's purpose is to make val divisible by 2**64, while keeping it the same modulo p:
//      (val + u * p) mod p = val mod p
//      (val + u * p) mod 2**64 = (val + -val * p^-1 * p) mod 2**64 = 0 mod 2**64
// 2. Instead of (4.), we will consider the 64bit words cyclically.
//
// To see why 4 MontgomeryRounds give a full Montgomery multiplication, we follow res % p across
// iterations:
//   res_0 = 0  (mod p)
//   res_1 = (x_0 * y) * 2**(-64)  (mod p)
//   res_2 = (x_0 * y) * 2**(-128) + (x_1 * y) * 2**(-64)  (mod p)
//         = ((x_0 + x_1 * 2**64) * y) * 2**(-128)  (mod p)
//   res_3 = ((x_0 + x_1 * 2**64 + x_2 * 2**128) * y) * 2**(-192)  (mod p)
//   res_4 = ((x_0 + x_1 * 2**64 + x_2 * 2**128 + x_3 * 2**192) * y) * 2**(-256)  (mod p)
//         = x * y * 2**(-256)  (mod p)
// ----------------------------------------------------------------------------

// MontgomeryRound(val, x_i, y) computed a single round as explained above. 
// Used for every round except the first.
// x_i is passed in rdx.
// y is passed in r11-r14.
// p3 is passed in r10.
// 
// ASSUMPTIONS: 
//   1. CF and OF are off here. This macro keeps this invariant when it exits (CF and OF are off)
//   2. val5 = 0 (the usage of the macro ensure )
.macro MontgomeryRound val0 val1 val2 val3 val4 val5
      // Step 1. val += x_i * y
      // We actually have addition of three numbers here, since x_i * y_j is 2 words:
      //      0               val3             val2             val1             val0
      //      0           (x_i * y_3)_L    (x_i * y_2)_L    (x_i * y_1)_L    (x_i * y_0)_L
      // (x_i * y_3)_H    (x_i * y_2)_H    (x_i * y_1)_H    (x_i * y_0)_H         0
      // To add three numbers "together" (since we don't want to compute the multiplications more
      // than once), we use two carry chains:
      // * adcx is addition that does not affect overflow flag.
      // * adox is addition with overflow flag instead of carry flag, and doesn't affect the carry
      // flag.

      // [%rbx : %rax] = (x_i * y0)_H, (x_i * y0)_L .
      mulxq %r11, %rax, %rbx
      // val0 += (x_i * y_0)_L  (c carry chain) .
      adcxq %rax, \val0
      // val1 += (x_i * y_0)_H  (o carry chain) .
      adoxq %rbx, \val1

      // [%rbx : %rax] = (x_i * y1)_H, (x_i * y1)_L .
      mulxq %r12, %rax, %rbx
      // val1 += (x_i * y_1)_L  (c carry chain) .
      adcxq %rax, \val1
      // val2 += (x_i * y_1)_H  (o carry chain) .
      adoxq %rbx, \val2

      // [%rbx : %rax] = (x_i * y2)_H, (x_i * y2)_L .
      mulxq %r13, %rax, %rbx
      // val2 += (x_i * y_2)_L  (c carry chain) .
      adcxq %rax, \val2
      // val3 += (x_i * y_2)_H  (o carry chain) .
      adoxq %rbx, \val3

      // [%rbx : %rax] = (x_i * y3)_H, (x_i * y3)_L .
      mulxq %r14, %rax, %rbx
      // val3 += (x_i * y_3)_L  (c carry chain) .
      adcxq %rax, \val3
      // val4 += (x_i * y_3)_H  (o carry chain) .
      adoxq %rbx, \val4
      // add last carry from other carry chain (c) .
      adcq $0, \val4

      // The last two additions to val4 have no carry because:
      // val + x_i * y <= (2**256-1) + (2**64-1)*(2**256-1)
      //                = 2**64 * (2**256-1) < 2**(256+64)
      // Hence, CF is off

      // Step 2. u = (-val * M^-1) % 2**64
      //           = ( val0 * (-M^-1 % 2**64) ) % 2**64
      //           = ( val0 * (mprime) ) % 2**64
      // For our specific M, we have mprime = -1:
      //      u = (-val0) % 2**64

      // rdx = -val0 .
      movq \val0, %rdx
      negq %rdx

      // Step 3. val += u * M
      // Our specific M looks like [p3:0:0:1], and the situation looks like this:
      //     val4             val3             val2             val1             val0
      //      0             (u * p3)_L          0                0                u
      //   (u * p3)_H          0                0                0                0

      // [%rbx : %rax] = (u * p3)_H, (u * p3)_L .
      mulxq %r10, %rax, %rbx
      // val0 += u (carry in c) .
      addq %rdx, \val0
      // Note that val0 now is (val_previous + u * M) % 2**64 which is zero! (See first Remark at
      // the beginning)

      // val1 += 0 (carry in c) .
      adcq \val0, \val1
      // val2 += 0 (carry in c) .
      adcq \val0, \val2
      // val3 += (u * p3)_L (carry in c) .
      adcq %rax, \val3
      // val4 += (u * p3)_H (carry in c) .
      adcq %rbx, \val4
      // val5 += carry
      adcq $0, \val5

      // We have kept the invariant that CF and OF are off. Indeed:
      // We want to have no carry and no overflow here. This requires
      //   prev_val + x_i*y + u*M <= 2**(256+64-1)-1
      // What we have:
      //   prev_val + x_i*y + u*M <=
      //   2**256-1 + (2**64-1)*(M-1) + (2**64-1)*M =
      //   2**256 + (2**65-2)*M -2**64+1
      // We get the requirement:
      //   2**256 + (2**65-2)*M -2**64+1 <= 2**(256+64-1)-1
      //   (2**65-2)*M <= 2**256*(2**63 - 1) + 2**64 -2
      // Since our M holds that inequality, we have no carry nor overflow here.
.endm

// MontgomeryRound_first is for the very first round.
.macro MontgomeryRound_first val0 val1 val2 val3 val4 val5
      // Similar action to regular Round.
      // However, here we only to overwrite val, not add to it.
      // This is more efficient, so we have a different implementation for the first round.
      // Step 1. val = x_i * y
      mulxq %r11, \val0, \val1
      mulxq %r12, %rax, \val2
      addq %rax, \val1
      mulxq %r13, %rax, \val3
      adcq %rax, \val2
      mulxq %r14, %rax, \val4
      adcq %rax, \val3
      adcq $0, \val4

      // Step 2 + 3.
      // Currently, identical to regular Round, see above.
      movq \val0, %rdx
      negq %rdx
      mulxq %r10, %rax, %rbx
      addq %rdx, \val0
      adcq \val0, \val1
      adcq \val0, \val2
      adcq %rax, \val3
      adcq %rbx, \val4
      adcq $0, \val5
.endm

.globl FUN(f251_montgomery_mult)
.p2align 4, 0x90

FUN(f251_montgomery_mult):

    save_context

    // load y in r11-r14
    load_from %rdx, %r11, %r12, %r13, %r14

    // load x0 in rdx 
    movq (%rsi), %rdx
    // move p3 in r10
    movabsq $0x800000000000011, %r10 

    // save rdi (used in macros)
    pushq %rdi

    // Montgomery rounds
    // Registers [r8, r9, rdi, rcx, r15, rbp] are used as [val0 .. val5] in Montgomery rounds
    // The order is rotated to the right between each round
    movq $0, %rbp 
    MontgomeryRound_first %r8, %r9, %rdi, %rcx, %r15, %rbp
    // load x1 in rdx, run MontgomeryRound 
    mov 8(%rsi), %rdx
    MontgomeryRound       %r9, %rdi, %rcx, %r15, %rbp, %r8
    // load x2 in rdx, run MontgomeryRound 
    mov 16(%rsi), %rdx
    MontgomeryRound       %rdi, %rcx, %r15, %rbp, %r8, %r9
    // load x3 in rdx, run MontgomeryRound 
    mov 24(%rsi), %rdx
    MontgomeryRound       %rcx, %r15, %rbp, %r8, %r9, %rdi
    // The result is now stored on [val1 .. val5] = [r15, rbp, r8, r9, rdi]

    // overflow reduce
    overflow_reduce %r15, %rbp, %r8, %r9, %rdi, %rax, %rbx, %rcx

    // restore rdi
    popq %rdi

    // store z
    store_to %rdi, %r15, %rbp, %r8, %r9

    restore_context
    retq

#if !defined(__APPLE__) && !defined(__WIN32__)
/* This is only relevant for Linux */
.section .note.GNU-stack,"",%progbits 
#endif

#else // !define(__x86_64__)
#warning "f251_asm.S made empty since we are compiling for a non-x86_64 platform!"
#endif
