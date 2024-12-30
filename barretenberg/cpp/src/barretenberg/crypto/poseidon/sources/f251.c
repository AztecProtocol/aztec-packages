#include <stdint.h>

#include "f251.h"

// Check if the compiler defines int128 or if ASSEMBLY is defined, or if
// we want ISO_C
#if !defined(__SIZEOF_INT128__) || defined(ASSEMBLY) || defined(ISO_C)

////////////////////////////////////////////////////////////////////////////////
///  Macros
////////////////////////////////////////////////////////////////////////////////

#define HI(x)       (x >> 32)
#define LO(x)       (x & 0xFFFFFFFF)
#define CONST_P3     0x800000000000011ull   // p = p3 * 2^192 + 1  = [1, 0, 0, p3]
#define CONST_16P3  0x8000000000000110ull   // 16p = [16, 0, 0, (16p)_3]

////////////////////////////////////////////////////////////////////////////////
///  Constant field elements
////////////////////////////////////////////////////////////////////////////////

// 2^256 in Montgomery form = (2^256)^2 mod p
const felt_t CONST_MONT_2256 = {
    0xfffffd737e000401ull, 0x1330fffffull, 
    0xffffffffff6f8000ull, 0x7ffd4ab5e008810ull };

const felt_t CONST_ONE = {1, 0, 0, 0};


////////////////////////////////////////////////////////////////////////////////
///  Integer operations
////////////////////////////////////////////////////////////////////////////////

// 64-bit addition
// z = x + y + in_c (mod 2^64)
// out_c = carry 
void add64(uint64_t *z, uint64_t *out_c, uint64_t x, uint64_t y, uint64_t in_c) {
    uint64_t t0, t1;

    t0 = LO(x) + LO(y) + LO(in_c);
    t1 = HI(t0) + HI(x) + HI(y) + HI(in_c);
    t0 = LO(t0);

    *out_c = HI(t1);
    *z = t0 + (t1 << 32);
}

// 64-bit subtraction 
// compute x + ((2^64-1)-y) + (1-borrow) = 2^64 + x - y - borrow
// result z = x - y (mod 2^64)
// borrow = not carry
void sub64(uint64_t *z, uint64_t *out_b, uint64_t x, uint64_t y, uint64_t in_b) {
    add64(z, out_b, x, -1-y, 1-in_b);
    *out_b ^= 1;
}

#ifndef ASSEMBLY

// 64-bit multiplication
// (z[0], z[1]) = x * y 
void mult64(uint64_t *z, uint64_t x, uint64_t y) {
    
    uint64_t z0, z1, z2, z3; 
    
    uint64_t t = LO(x) * LO(y);
    z0 = LO(t);
    
    t = HI(x) * LO(y) + HI(t);
    z1 = LO(t);
    z2 = HI(t);
    
    t = z1 + LO(x) * HI(y);
    z1 = LO(t);
    
    t = z2 + HI(x) * HI(y) + HI(t);
    z2 = LO(t);
    z3 = HI(t);
    
    z[0] = z1 << 32 | z0;
    z[1] = z3 << 32 | z2;
}

// 256-bit integer addition
// Adds two 256-bit integers:
// x = (x[0], x[1], x[2], x[3])
// y = (y[0], y[1], y[2], y[3])
// Retruns a (256+64)-bit integer:
// z = (z[0], z[1], z[2], z[3], z[4]) = x+y
// Low-order words are in low-order indexes.
void add256(uint64_t *z, const uint64_t *x, const uint64_t *y) {

    uint64_t c;

    add64(z+0, &c, x[0], y[0], 0);
    add64(z+1, &c, x[1], y[1], c);
    add64(z+2, &c, x[2], y[2], c);
    add64(z+3, &c, x[3], y[3], c);
    z[4] = c;
}

////////////////////////////////////////////////////////////////////////////////
///  Partial reduction functions
////////////////////////////////////////////////////////////////////////////////

// Overflow reduction modulo p.
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
void f251_overflow_reduce(uint64_t *z, const uint64_t *t)
{
    uint64_t b;
    uint64_t r255 = t[3] >> 63;
    uint64_t r256 = t[4];

    // computes s = [s0, s1, s2, s3, s4] wrt (r255,r256)
    uint64_t s0 = r256 * (16 + r255 * 16);
    // s1 = 0
    // s2 = 0
    uint64_t s3 = r256 * r255 * 544;
    s3 += r256 * (1-r255) * CONST_16P3;
    //s4 = r256 * r255;

    // subtraction 
    sub64(z+0, &b, t[0], s0, 0);
    sub64(z+1, &b, t[1],  0, b);
    sub64(z+2, &b, t[2],  0, b);
    sub64(z+3, &b, t[3], s3, b);
}

// Few bits reduction modulo p.
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
void f251_fewbits_reduce(uint64_t *z, const uint64_t *r)
{
    uint64_t b,c;

    // computes s = [s0, s1, s2, s3, s4] = r[4] * 32*p
    uint64_t s0 = 32 * r[4];
    // s1 = 0
    // s2 = 0
    uint64_t s3 = 544 * r[4];
    //s4 = r[4];

    // z = r - r[4] * 32*p 
    sub64(z+0, &b, r[0], s0, 0);
    sub64(z+1, &b, r[1],  0, b);
    sub64(z+2, &b, r[2],  0, b);
    sub64(z+3, &b, r[3], s3, b);
    
    // z += b * p
    add64(z+0, &c, z[0], b, 0);
    add64(z+1, &c, z[1], 0, c);
    add64(z+2, &c, z[2], 0, c);
    add64(z+3, &c, z[3], b*CONST_P3, c);

}

#endif 

// Final reduce
// Takes a 256-bit integer x and reduces it modulo p, 
// i.e. returns z = x mod p, with z in [0,p).
//
// This reduction proceeds as follows
//   1. xh = x >> 251
//   2. z = x - xh * p
//   3. if z<0 (i.e. if a borrow occurs) then z = z + p
//
// This works for the same reason as for f251_fewbits_reduce
// but with a 5 bit gap.

void f251_final_reduce(uint64_t *z, const uint64_t *x)
{
    uint64_t b,c;

    // computes s = [s0, s1, s2, s3] = xh * p
    uint64_t xh = x[3] >> 59;
    uint64_t s0 = xh;
    // s1 = 0
    // s2 = 0
    uint64_t s3 = xh * CONST_P3;

    // z = x - xh * p
    sub64(z+0, &b, x[0], s0, 0);
    sub64(z+1, &b, x[1],  0, b);
    sub64(z+2, &b, x[2],  0, b);
    sub64(z+3, &b, x[3], s3, b);
    
    // z += b * p
    add64(z+0, &c, z[0], b, 0);
    add64(z+1, &c, z[1], 0, c);
    add64(z+2, &c, z[2], 0, c);
    add64(z+3, &c, z[3], b*CONST_P3, c);

}


////////////////////////////////////////////////////////////////////////////////
///  F251 basic operations
////////////////////////////////////////////////////////////////////////////////

// F251 copy
// Copies x to z.
void f251_copy(felt_t z, const felt_t x)
{
    z[0]=x[0]; z[1]=x[1]; z[2]=x[2]; z[3]=x[3]; 
}

#ifndef ASSEMBLY

// F251 addition
// Computes z = x + y mod p, where
//  - x and y are two 256-bit integers (4 words)
//  - the result z is "partialy reduced" modulo p, 
//    i.e. it holds on 256 bits but might be greater than p.
// The function first computes x + y, then performs the partial reduction 
// by calling f251_fewbits_reduce.
void f251_add(felt_t z, const felt_t x, const felt_t y)
{
    uint64_t t[5];

    add256(t,x,y);
    f251_overflow_reduce(z, t);
}

// F251 subtraction
// Computes z = x - y mod p, where
//  - x and y are two 256-bit integers (4 words)
//  - the result z is "partialy reduced" modulo p, 
//    i.e. it holds on 256 bits but might be greater than p.
// The function first computes (x + 32*p) - y, where 32*p = [32, 0, 0, 544, 1]
// then performs the partial reduction by calling f251_fewbits_reduce.
void f251_sub(felt_t z, const felt_t x, const felt_t y) {

    uint64_t t[5];
    uint64_t c, b;

    add64(t+0, &c, x[0], 32,  0);
    add64(t+1, &c, x[1], 0,   c);
    add64(t+2, &c, x[2], 0,   c);
    add64(t+3, &c, x[3], 544, c);
    t[4] = 1 + c;

    sub64(t+0, &b, t[0], y[0], 0);
    sub64(t+1, &b, t[1], y[1], b);
    sub64(t+2, &b, t[2], y[2], b);
    sub64(t+3, &b, t[3], y[3], b);
    sub64(t+4, &b, t[4],    0, b);

    f251_fewbits_reduce(z,t);
}

////////////////////////////////////////////////////////////////////////////////
///  F251 "x +/- c*y" functions
////////////////////////////////////////////////////////////////////////////////

// F251 "x + 2y"
// Computes z = x + 2*y mod p, where
//  - x and y are two 256-bit integers (4 words)
//  - the result z is "partialy reduced" modulo p, 
//    i.e. it holds on 256 bits but might be greater than p.
void f251_x_plus_2y(felt_t z, const felt_t x, const felt_t y) {

    uint64_t t[5];
    uint64_t c;

    add64(t+0, &c, x[0], y[0] << 1, 0);
    add64(t+1, &c, x[1], (y[1] << 1) | (y[0] >> 63), c);
    add64(t+2, &c, x[2], (y[2] << 1) | (y[1] >> 63), c);
    add64(t+3, &c, x[3], (y[3] << 1) | (y[2] >> 63), c);
    t[4] = (y[3] >> 63) + c;

    f251_fewbits_reduce(z,t);
}

// F251 "x + 3y"
// Computes z = x + 3*y mod p, where
//  - x and y are two 256-bit integers (4 words)
//  - the result z is "partialy reduced" modulo p, 
//    i.e. it holds on 256 bits but might be greater than p.
void f251_x_plus_3y(felt_t z, const felt_t x, const felt_t y) {

    uint64_t t[5];
    uint64_t c1,c2;

    add64(t+0, &c1, x[0], y[0], 0);
    add64(t+0, &c2, t[0], y[0] << 1, 0);
    add64(t+1, &c1, x[1], y[1], c1);
    add64(t+1, &c2, t[1], (y[1] << 1) | (y[0] >> 63), c2);
    add64(t+2, &c1, x[2], y[2], c1);
    add64(t+2, &c2, t[2], (y[2] << 1) | (y[1] >> 63), c2);
    add64(t+3, &c1, x[3], y[3], c1);
    add64(t+3, &c2, t[3], (y[3] << 1) | (y[2] >> 63), c2);
    t[4] = (y[3] >> 63) + c1 + c2;

    f251_fewbits_reduce(z,t);
}

// F251 "x + 4y"
// Computes z = x + 4*y mod p, where
//  - x and y are two 256-bit integers (4 words)
//  - the result z is "partialy reduced" modulo p, 
//    i.e. it holds on 256 bits but might be greater than p.
void f251_x_plus_4y(felt_t z, const felt_t x, const felt_t y) {

    uint64_t t[5];
    uint64_t c;

    add64(t+0, &c, x[0], y[0] << 2, 0);
    add64(t+1, &c, x[1], (y[1] << 2) | (y[0] >> 62), c);
    add64(t+2, &c, x[2], (y[2] << 2) | (y[1] >> 62), c);
    add64(t+3, &c, x[3], (y[3] << 2) | (y[2] >> 62), c);
    t[4] = (y[3] >> 62) + c;

    f251_fewbits_reduce(z,t);
}

// F251 "x - 2y"
// Computes z = x - 2*y mod p, where
//  - x and y are two 256-bit integers (4 words)
//  - the result z is "partialy reduced" modulo p, 
//    i.e. it holds on 256 bits but might be greater than p.
// The function first computes (x + 2*32*p) - 2*y, where 2*32*p = [64, 0, 0, 1088, 2],
// then performs the partial reduction by calling f251_fewbits_reduce.
void f251_x_minus_2y(felt_t z, const felt_t x, const felt_t y) {

    uint64_t t[5];
    uint64_t c, b;

    add64(t+0, &c, x[0], 64,   0);
    add64(t+1, &c, x[1], 0,    c);
    add64(t+2, &c, x[2], 0,    c);
    add64(t+3, &c, x[3], 1088, c);
    t[4] = 2 + c;

    sub64(t+0, &b, t[0], (y[0] << 1), 0);
    sub64(t+1, &b, t[1], (y[1] << 1) | (y[0] >> 63), b);
    sub64(t+2, &b, t[2], (y[2] << 1) | (y[1] >> 63), b);
    sub64(t+3, &b, t[3], (y[3] << 1) | (y[2] >> 63), b);
    sub64(t+4, &b, t[4], (y[3] >> 63), b);

    f251_fewbits_reduce(z,t);
}

// F251 "x - 3y"
// Computes z = x - 3*y mod p, where
//  - x and y are two 256-bit integers (4 words)
//  - the result z is "partialy reduced" modulo p, 
//    i.e. it holds on 256 bits but might be greater than p.
// The function first computes (x + 3*32*p) - 2*y - y, where 3*32*p = [96, 0, 0, 1632, 3]
// then performs the partial reduction by calling f251_fewbits_reduce.
void f251_x_minus_3y(felt_t z, const felt_t x, const felt_t y) {

    uint64_t t[5];
    uint64_t c, b;

    add64(t+0, &c, x[0], 96,   0);
    add64(t+1, &c, x[1], 0,    c);
    add64(t+2, &c, x[2], 0,    c);
    add64(t+3, &c, x[3], 1632, c);
    t[4] = 3 + c;

    sub64(t+0, &b, t[0], (y[0] << 1), 0);
    sub64(t+1, &b, t[1], (y[1] << 1) | (y[0] >> 63), b);
    sub64(t+2, &b, t[2], (y[2] << 1) | (y[1] >> 63), b);
    sub64(t+3, &b, t[3], (y[3] << 1) | (y[2] >> 63), b);
    sub64(t+4, &b, t[4], (y[3] >> 63), b);

    sub64(t+0, &b, t[0], y[0], 0);
    sub64(t+1, &b, t[1], y[1], b);
    sub64(t+2, &b, t[2], y[2], b);
    sub64(t+3, &b, t[3], y[3], b);
    sub64(t+4, &b, t[4],    0, b);

    f251_fewbits_reduce(z,t);
}

// F251 "x - 4y"
// Computes z = x - 4*y mod p, where
//  - x and y are two 256-bit integers (4 words)
//  - the result z is "partialy reduced" modulo p, 
//    i.e. it holds on 256 bits but might be greater than p.
// The function first computes (x + 4*32*p) - 4*y, where 4*32*p = [128, 0, 0, 2176, 4]
// then performs the partial reduction by calling f251_fewbits_reduce.
void f251_x_minus_4y(felt_t z, const felt_t x, const felt_t y) {

    uint64_t t[5];
    uint64_t c, b;

    add64(t+0, &c, x[0], 128,  0);
    add64(t+1, &c, x[1], 0,    c);
    add64(t+2, &c, x[2], 0,    c);
    add64(t+3, &c, x[3], 2176, c);
    t[4] = 4 + c;

    sub64(t+0, &b, t[0], (y[0] << 2), 0);
    sub64(t+1, &b, t[1], (y[1] << 2) | (y[0] >> 62), b);
    sub64(t+2, &b, t[2], (y[2] << 2) | (y[1] >> 62), b);
    sub64(t+3, &b, t[3], (y[3] << 2) | (y[2] >> 62), b);
    sub64(t+4, &b, t[4], (y[3] >> 62), b);

    f251_fewbits_reduce(z,t);
}

////////////////////////////////////////////////////////////////////////////////
///  F251 sum state functions
////////////////////////////////////////////////////////////////////////////////

// F251 sum state (size = 3)
// Computes t = state[0] + state[1] + state[2]
void f251_sum_state_3(felt_t t, const felt_t state[])
{
    f251_add(t,state[0],state[1]);
    f251_add(t,t,state[2]);
}

// F251 sum state (size = 4)
// Computes:
//    t1 = state[0] + state[1] + state[2] + state[3]
//    t2 = state[0] + state[1] + state[3]
void f251_sum_state_4(felt_t t1, felt_t t2, const felt_t state[])
{
    f251_add(t1,state[0],state[1]);
    f251_add(t2,t1,state[3]);
    f251_add(t1,t2,state[2]);
}

// F251 sum state (size = 5)
// Computes t = state[0] + ... + state[4]
void f251_sum_state_5(felt_t t, const felt_t state[])
{
    f251_add(t,state[0],state[1]);
    f251_add(t,t,state[2]);
    f251_add(t,t,state[3]);
    f251_add(t,t,state[4]);
}

// F251 sum state (size = 9)
// Computes:
//    t1 = state[0] + state[1] + ... + state[7] + state[8]
//    t2 = state[0] + state[1] + ... + state[7]
void f251_sum_state_9(felt_t t1, felt_t t2, const felt_t state[])
{
    f251_add(t1,state[0],state[1]);
    f251_add(t1,t1,state[2]);
    f251_add(t1,t1,state[3]);
    f251_add(t1,t1,state[4]);
    f251_add(t1,t1,state[5]);
    f251_add(t1,t1,state[6]);
    f251_add(t2,t1,state[7]);
    f251_add(t1,t2,state[8]);
}

////////////////////////////////////////////////////////////////////////////////
///  F251 Montgomery functions 
////////////////////////////////////////////////////////////////////////////////

// Montgomery multiplication.
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
//   (z + x_i*y) * 2**(-64)
// using the following steps:
// MontgomeryRound(z, x_i, y):
//   Step 1. z += x_i * y
//   Step 2. u = (-z * p^-1) mod 2**64
//   Step 3. z += u * p
//   Step 4. return z >> 64
//
// Remark: u's purpose is to make z divisible by 2**64, while keeping it the same modulo p:
//      (z + u * p) mod p = z mod p
//      (z + u * p) mod 2**64 = (z + -z * p^-1 * p) mod 2**64 = 0 mod 2**64
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

void montgomery_round(uint64_t *z, uint64_t x_i, const uint64_t *y)
{
    uint64_t t[2];
    uint64_t c1, c2;
    uint64_t u;

    // Step 1: z += x_i * y

    mult64(t,x_i,y[0]);
    add64(z+0, &c1, z[0], t[0], 0);
    add64(z+1, &c2, z[1], t[1], 0);

    mult64(t,x_i,y[1]);
    add64(z+1, &c1, z[1], t[0], c1);
    add64(z+2, &c2, z[2], t[1], c2);

    mult64(t,x_i,y[2]);
    add64(z+2, &c1, z[2], t[0], c1);
    add64(z+3, &c2, z[3], t[1], c2);

    mult64(t,x_i,y[3]);
    add64(z+3, &c1, z[3], t[0], c1);
    add64(z+4, &c2, z[4], t[1], c2);

    z[4] += c1;

    // Step 2: u = - z[0] mod 2^64

    u = - z[0];

    // Step 3: z += u * p

    mult64(t,u,CONST_P3);
    add64(z+0, &c1, z[0], u,     0);
    add64(z+1, &c1, z[1], 0,    c1);
    add64(z+2, &c1, z[2], 0,    c1);
    add64(z+3, &c1, z[3], t[0], c1);
    add64(z+4, &c1, z[4], t[1], c1);
    add64(z+5, &c1, z[5], 0,    c1); 
}

void f251_montgomery_mult(felt_t z, const felt_t x, const felt_t y)
{
    uint64_t t[9] = {0, 0, 0, 0, 0, 0, 0, 0, 0};

    montgomery_round(t+0, x[0], y);
    montgomery_round(t+1, x[1], y);
    montgomery_round(t+2, x[2], y);
    montgomery_round(t+3, x[3], y);

   f251_overflow_reduce(z, t+4);
}

#endif

// Convert to Montgomery form.
// This function puts x in Montgomery form i.e. returns mx = x * 2^256 (mod p).
// This is done by Montgomery-multiplying x by Montgomery(2^256) = ((2^256)^2 mod p).
void f251_to_montgomery(felt_t mx, const felt_t x)
{
    f251_montgomery_mult(mx, x, CONST_MONT_2256);
}

// Convert back from Montgomery form.
// This function put x in standard form from its Montgomery form mx
// i.e. it returns x = mx * 2^-256 mod p.
// This is done by Montgomery-multiplying mx by Mon(2^-256) = 1.
void f251_from_montgomery(felt_t x, const felt_t mx)
{
    f251_montgomery_mult(x, mx, CONST_ONE);
    f251_final_reduce(x,x);
}

// Montgomery cube.
// This function computes x^3 (in Montgomery form) from x (in Montgomery form).
// It first performs a Montgomery square of x, 
// then Montgomery-multiply the result by x.
void f251_montgomery_cube(felt_t z, const felt_t x)
{
    uint64_t x2[4];

    f251_montgomery_mult(x2,x,x);
    f251_montgomery_mult(z,x2,x);
}

#endif // !defined(__SIZEOF_INT128__) || defined(ASSEMBLY) || defined(ISO_C)
