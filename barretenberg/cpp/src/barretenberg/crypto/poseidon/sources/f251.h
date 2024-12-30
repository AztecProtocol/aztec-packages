#ifndef __F251_H__
#define __F251_H__

#include <stdint.h>

// In case of non x86_64 platforms, undefine ASSEMBLY
#if defined(ASSEMBLY) && !defined(__x86_64__)
#undef ASSEMBLY
#endif

// Adapt the ABI to sysv one if we are dealing with a GNUC compiler for a Windows target
#if defined(ASSEMBLY) && defined(__GNUC__) && defined(__WIN32__)
#define SYSV_ABI __attribute__((sysv_abi))
#else
#define SYSV_ABI
#endif

typedef uint64_t felt_t[4];

////////////////////////////////////////////////////////////////////////////////
///  F251 basic operations
////////////////////////////////////////////////////////////////////////////////

/**
 * @brief Field element copy
 * 
 * Copy x to z.
 * 
 * @param z destination
 * @param x source
 */
void f251_copy(felt_t z, const felt_t x);

/**
 * @brief Field addition
 * 
 * Assign z = x + y (mod p)  with p = 2^251 + 17 * 2^192 + 1.
 * Both x and y are in [0,2^256). The result z is also in [0,2^256).
 * (One should further use f251_final_reduce to get a result in [0,p).)
 * 
 * @param z result of the addition (in [0,2^256))
 * @param x first operand (in [0,2^256)) 
 * @param y second operand (in [0,2^256))
 */
SYSV_ABI void f251_add(felt_t z, const felt_t x, const felt_t y);

/**
 * @brief Field subtraction
 * 
 * Assign z = x - y (mod p)  with p = 2^251 + 17 * 2^192 + 1.
 * Both x and y are in [0,2^256). The result z is also in [0,2^256).
 * (One should further use f251_final_reduce to get a result in [0,p).)
 * 
 * @param z result of the subtraction (in [0,2^256))
 * @param x first operand (in [0,2^256))
 * @param y second operand (in [0,2^256))
 */
SYSV_ABI void f251_sub(felt_t z, const felt_t x, const felt_t y);

////////////////////////////////////////////////////////////////////////////////
///  F251 "x +/- c*y" functions
////////////////////////////////////////////////////////////////////////////////

#ifdef ASSEMBLY

/**
 * @brief Function computing z = x + c * y (mod p).
 * 
 * Asign z = x + c * y (mod p)  with p = 2^251 + 17 * 2^192 + 1.
 * Both x and y are in [0,2^256). c is in [0,2^32). The result z is in [0,2^256).
 * (One should further use f251_final_reduce to get a result in [0,p).)
 * 
 * @param z result (in [0,2^256))
 * @param x first operand (in [0,2^256))
 * @param c second operand (in [0,2^32))
 * @param y third operand (in [0,2^256))
 */
SYSV_ABI void f251_x_plus_c_times_y(felt_t z, const felt_t x, const uint32_t c, const felt_t y);

/**
 * @brief Function computing z = x - c * y (mod p).
 * 
 * Asign z = x - c * y (mod p)  with p = 2^251 + 17 * 2^192 + 1.
 * Both x and y are in [0,2^256). c is in [0,2^32). The result z is in [0,2^256).
 * (One should further use f251_final_reduce to get a result in [0,p).)
 * 
 * @param z result (in [0,2^256))
 * @param x first operand (in [0,2^256))
 * @param c second operand (in [0,2^32))
 * @param y third operand (in [0,2^256))
 */
SYSV_ABI void f251_x_minus_c_times_y(felt_t z, const felt_t x, const uint32_t c, const felt_t y);

#define f251_x_plus_2y(z,x,y) f251_x_plus_c_times_y(z,x,2,y)
#define f251_x_plus_3y(z,x,y) f251_x_plus_c_times_y(z,x,3,y)
#define f251_x_plus_4y(z,x,y) f251_x_plus_c_times_y(z,x,4,y)

#define f251_x_minus_2y(z,x,y) f251_x_minus_c_times_y(z,x,2,y)
#define f251_x_minus_3y(z,x,y) f251_x_minus_c_times_y(z,x,3,y)
#define f251_x_minus_4y(z,x,y) f251_x_minus_c_times_y(z,x,4,y)

#else

/**
 * @brief Function computing z = x + 2y (mod p).
 * 
 * Asign z = x + 2y (mod p)  with p = 2^251 + 17 * 2^192 + 1.
 * Both x and y are in [0,2^256). The result z is also in [0,2^256).
 * (One should further use f251_final_reduce to get a result in [0,p).)
 * 
 * @param z result (in [0,2^256))
 * @param x first operand (in [0,2^256))
 * @param y second operand (in [0,2^256))
 */
void f251_x_plus_2y(felt_t z, const felt_t x, const felt_t y);

/**
 * @brief Function computing z = x + 3y (mod p).
 * 
 * Asign z = x + 3y (mod p)  with p = 2^251 + 17 * 2^192 + 1.
 * Both x and y are in [0,2^256). The result z is also in [0,2^256).
 * (One should further use f251_final_reduce to get a result in [0,p).)
 * 
 * @param z result (in [0,2^256))
 * @param x first operand (in [0,2^256))
 * @param y second operand (in [0,2^256))
 */
void f251_x_plus_3y(felt_t z, const felt_t x, const felt_t y);

/**
 * @brief Function computing z = x + 4y (mod p).
 * 
 * Asign z = x + 4y (mod p)  with p = 2^251 + 17 * 2^192 + 1.
 * Both x and y are in [0,2^256). The result z is also in [0,2^256).
 * (One should further use f251_final_reduce to get a result in [0,p).)
 * 
 * @param z result (in [0,2^256))
 * @param x first operand (in [0,2^256))
 * @param y second operand (in [0,2^256))
 */
void f251_x_plus_4y(felt_t z, const felt_t x, const felt_t y);

/**
 * @brief Function computing z = x - 2y (mod p).
 * 
 * Asign z = x - 2y (mod p)  with p = 2^251 + 17 * 2^192 + 1.
 * Both x and y are in [0,2^256). The result z is also in [0,2^256).
 * (One should further use f251_final_reduce to get a result in [0,p).)
 * 
 * @param z result (in [0,2^256))
 * @param x first operand (in [0,2^256))
 * @param y second operand (in [0,2^256))
 */
void f251_x_minus_2y(felt_t z, const felt_t x, const felt_t y);

/**
 * @brief Function computing z = x - 3y (mod p).
 * 
 * Asign z = x - 3y (mod p)  with p = 2^251 + 17 * 2^192 + 1.
 * Both x and y are in [0,2^256). The result z is also in [0,2^256).
 * (One should further use f251_final_reduce to get a result in [0,p).)
 * 
 * @param z result (in [0,2^256))
 * @param x first operand (in [0,2^256))
 * @param y second operand (in [0,2^256))
 */
void f251_x_minus_3y(felt_t z, const felt_t x, const felt_t y);

/**
 * @brief Function computing z = x - 4y (mod p).
 * 
 * Asign z = x - 4y (mod p)  with p = 2^251 + 17 * 2^192 + 1.
 * Both x and y are in [0,2^256). The result z is also in [0,2^256).
 * (One should further use f251_final_reduce to get a result in [0,p).)
 * 
 * @param z result (in [0,2^256))
 * @param x first operand (in [0,2^256))
 * @param y second operand (in [0,2^256))
 */
void f251_x_minus_4y(felt_t z, const felt_t x, const felt_t y);

#endif

////////////////////////////////////////////////////////////////////////////////
///  F251 sum state functions
////////////////////////////////////////////////////////////////////////////////

/**
 * @brief Sum the state cells
 * 
 * Computes z = state[0] + state[1] + state[2] (mod p)
 * with p = 2^251 + 17 * 2^192 + 1.
 * State cells are in [0,2^256). The result z is also in [0,2^256).
 * (One should further use f251_final_reduce to get a result in [0,p).)
 * 
 * @param z result (in [0,2^256))
 * @param state input state (array of 3 cells in [0,2^256))
 */
SYSV_ABI void f251_sum_state_3(felt_t z, const felt_t state[]);

/**
 * @brief Sum the state cells
 * 
 * Computes z = state[0] + state[1] + state[2] + state[3] (mod p)
 * with p = 2^251 + 17 * 2^192 + 1.
 * State cells are in [0,2^256). The result z is also in [0,2^256).
 * (One should further use f251_final_reduce to get a result in [0,p).)
 * 
 * @param z result (in [0,2^256))
 * @param state input state (array of 4 cells in [0,2^256))
 */
SYSV_ABI void f251_sum_state_4(felt_t t1, felt_t t2, const felt_t state[]);

/**
 * @brief Sum the state cells
 * 
 * Computes z = state[0] + state[1] + state[2] + state[3] + state[4] (mod p)
 * with p = 2^251 + 17 * 2^192 + 1.
 * State cells are in [0,2^256). The result z is also in [0,2^256).
 * (One should further use f251_final_reduce to get a result in [0,p).)
 * 
 * @param z result (in [0,2^256))
 * @param state input state (array of 5 cells in [0,2^256))
 */
SYSV_ABI void f251_sum_state_5(felt_t t, const felt_t state[]);

/**
 * @brief Sum the state cells
 * 
 * Computes z = state[0] + ... + state[8] (mod p)
 * with p = 2^251 + 17 * 2^192 + 1.
 * State cells are in [0,2^256). The result z is also in [0,2^256).
 * (One should further use f251_final_reduce to get a result in [0,p).)
 * 
 * @param z result (in [0,2^256))
 * @param state input state (array of 9 cells in [0,2^256))
 */
SYSV_ABI void f251_sum_state_9(felt_t t1, felt_t t2, const felt_t state[]);

////////////////////////////////////////////////////////////////////////////////
///  F251 Montgomery functions 
////////////////////////////////////////////////////////////////////////////////

/**
 * @brief Convert to Montgomery form
 * 
 * Puts x in Montgomery form i.e. return mx = x * 2^256 (mod p)
 * with p = 2^251 + 17 * 2^192 + 1.
 * x in is [0,2^256) and the result mx is also in [0,2^256).
 * (One should further use f251_final_reduce to get a result in [0,p).)
 * 
 * @param mx result (in [0,2^256))
 * @param x input value (in [0,2^256))
 */
void f251_to_montgomery(felt_t mx, const felt_t x);

/**
 * @brief Convert back from Montgomery form
 * 
 * Put x in standard form from its Montgomery form mx i.e. return x = mx * 2^-256 (mod p)
 * with p = 2^251 + 17 * 2^192 + 1.
 * mx in is [0,2^256) and the result x is also in [0,2^256).
 * (One should further use f251_final_reduce to get a result in [0,p).)
 * 
 * @param x result (in [0,2^256))
 * @param mx input value (in [0,2^256))
 */
void f251_from_montgomery(felt_t x, const felt_t mx);


/**
 * @brief Montgomery multiplication
 * 
 * Compute the Montgomery product z between x and y, i.e. z = x * y * 2^-256 (mod p)
 * with p = 2^251 + 17 * 2^192 + 1.
 * Both x and y are in [0,2^256). The result z is also in [0,2^256).
 * (One should further use f251_final_reduce to get a result in [0,p).)
 * 
 * @param z result (in [0,2^256))
 * @param x first operand (in [0,2^256))
 * @param y second operand (in [0,2^256))
 */
SYSV_ABI void f251_montgomery_mult(felt_t z, const felt_t x, const felt_t y);


/**
 * @brief Montgomery cube
 * 
 * Compute the Montgomery cube z = x^3 (in Montgomery form) from x (in Montgomery form),
 * i.e.  z = x^3 * (2^-256)^2 (mod p)  with p = 2^251 + 17 * 2^192 + 1.
 * x in is [0,2^256) and the result z is also in [0,2^256).
 * (One should further use f251_final_reduce to get a result in [0,p).)
 * 
 * @param z result (in [0,2^256))
 * @param x input value (in [0,2^256))
 */
void f251_montgomery_cube(felt_t z, const felt_t x);

#endif // __F251_H__
