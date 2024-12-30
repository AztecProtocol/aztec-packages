#ifndef __POSEIDON_H__
#define __POSEIDON_H__

#include <stdint.h>
#include "f251.h"

/**
 * @brief Poseidon MixLayer (n=3)
 * 
 * Apply the Poseidon MixLayer to the input state (of size 3).
 * Specifically, multiply the state by the following matrix:
 *   [3,  1,  1] 
 *   [1, -1,  1] 
 *   [1,  1, -2]
 * on the field Fp with p = 2^251 + 17 * 2^192 + 1.
 * 
 * @param state input Poseidon state (modified by the function)
 */
void mix_layer_3(felt_t state[]);

/**
 * @brief Poseidon MixLayer (n=4)
 * 
 * Apply the Poseidon MixLayer to the input state (of size 4).
 * Specifically, multiply the state by the following matrix:
 *   [2, 1, 1,  1] 
 *   [1, 1, 1,  1] 
 *   [1, 1, 0,  1] 
 *   [1, 1, 1, -1]
 * on the field Fp with p = 2^251 + 17 * 2^192 + 1.
 * 
 * @param state input Poseidon state (modified by the function)
 */
void mix_layer_4(felt_t state[]);

/**
 * @brief Poseidon MixLayer (n=5)
 * 
 * Apply the Poseidon MixLayer to the input state (of size 5).
 * Specifically, multiply the state by the following matrix:
 *    [3, 1, 1,  1,  1] 
 *    [1, 2, 1,  1,  1] 
 *    [1, 1, 1,  1,  1] 
 *    [1, 1, 1, -1,  1] 
 *    [1, 1, 1,  1, -2]
 * on the field Fp with p = 2^251 + 17 * 2^192 + 1.
 *
 * @param state input Poseidon state (modified by the function)
 */
void mix_layer_5(felt_t state[]);

/**
 * @brief Poseidon MixLayer (n=9)
 * 
 * Apply the Poseidon MixLayer to the input state (of size 4).
 * Specifically, multiply the state by the following matrix:
 *    [5, 1, 1, 1, 1, 1,  1,  1,  1]
 *    [1, 4, 1, 1, 1, 1,  1,  1,  1]
 *    [1, 1, 3, 1, 1, 1,  1,  1,  1]
 *    [1, 1, 1, 2, 1, 1,  1,  1,  1]
 *    [1, 1, 1, 1, 1, 1,  1,  1,  1]
 *    [1, 1, 1, 1, 1, 0,  1,  1,  1]
 *    [1, 1, 1, 1, 1, 1, -1,  1,  1]
 *    [1, 1, 1, 1, 1, 1,  1, -3,  1]
 *    [1, 1, 1, 1, 1, 1,  1,  1, -4]
 * on the field Fp with p = 2^251 + 17 * 2^192 + 1.
 * 
 * @param state input Poseidon state (modified by the function)
 */
void mix_layer_9(felt_t state[]);

/**
 * @brief Poseidon round function (n=3)
 * 
 * Apply one Poseidon round function to the input state (of size 3).
 * The round function successively applies AddRoundConstants, 
 * SubWords and MixLayer. 
 * AddRoundConstants adds hardcoded constants to the state (on Fp).
 * SubWords applies the cube function (x -> x^3) to state cells (on Fp).
 *   - If round_mode is FULL_ROUND, the cube is applied to all the cells.
 *   - If round_mode is PARTIAL_ROUND, the cube is applied to a single cell.
 * MixLayer multiplies the state by an hardcoded matrix (on Fp).
 * Fp is the finite field of elements mod p = 2^251 + 17 * 2^192 + 1.
 * 
 * @param state input Poseidon state (modified by the function)
 */
void round_3(felt_t state[], int index, uint8_t round_mode);

/**
 * @brief Poseidon round function (n=4)
 * 
 * Apply one Poseidon round function to the input state (of size 4).
 * The round function successively applies AddRoundConstants, 
 * SubWords and MixLayer. 
 * AddRoundConstants adds hardcoded constants to the state (on Fp).
 * SubWords applies the cube function (x -> x^3) to state cells (on Fp).
 *   - If round_mode is FULL_ROUND, the cube is applied to all the cells.
 *   - If round_mode is PARTIAL_ROUND, the cube is applied to a single cell.
 * MixLayer multiplies the state by an hardcoded matrix (on Fp).
 * Fp is the finite field of elements mod p = 2^251 + 17 * 2^192 + 1.
 * 
 * @param state input Poseidon state (modified by the function)
 */
void round_4(felt_t state[], int index, uint8_t round_mode);

/**
 * @brief Poseidon round function (n=5)
 * 
 * Apply one Poseidon round function to the input state (of size 5).
 * The round function successively applies AddRoundConstants, 
 * SubWords and MixLayer. 
 * AddRoundConstants adds hardcoded constants to the state (on Fp).
 * SubWords applies the cube function (x -> x^3) to state cells (on Fp).
 *   - If round_mode is FULL_ROUND, the cube is applied to all the cells.
 *   - If round_mode is PARTIAL_ROUND, the cube is applied to a single cell.
 * MixLayer multiplies the state by an hardcoded matrix (on Fp).
 * Fp is the finite field of elements mod p = 2^251 + 17 * 2^192 + 1.
 * 
 * @param state input Poseidon state (modified by the function)
 */
void round_5(felt_t state[], int index, uint8_t round_mode);

/**
 * @brief Poseidon round function (n=9)
 * 
 * Apply one Poseidon round function to the input state (of size 9).
 * The round function successively applies AddRoundConstants, 
 * SubWords and MixLayer. 
 * AddRoundConstants adds hardcoded constants to the state (on Fp).
 * SubWords applies the cube function (x -> x^3) to state cells (on Fp).
 *   - If round_mode is FULL_ROUND, the cube is applied to all the cells.
 *   - If round_mode is PARTIAL_ROUND, the cube is applied to a single cell.
 * MixLayer multiplies the state by an hardcoded matrix (on Fp).
 * Fp is the finite field of elements mod p = 2^251 + 17 * 2^192 + 1.
 * 
 * @param state input Poseidon state (modified by the function)
 */
void round_9(felt_t state[], int index, uint8_t round_mode);

/**
 * @brief Poseidon permutation (n=3)
 * 
 * Apply the Poseidon permutation to the input state (of size 3).
 * Specifically, apply
 *    - 4 full rounds,
 *    - 83 partial rounds,
 *    - 4 full rounds
 * to the input state.
 * 
 * @param state input Poseidon state (modified by the function)
 */
void permutation_3(felt_t state[]);

/**
 * @brief Poseidon permutation (n=4)
 * 
 * Apply the Poseidon permutation to the input state (of size 4).
 * Specifically, apply
 *    - 4 full rounds,
 *    - 84 partial rounds,
 *    - 4 full rounds
 * to the input state.
 * 
 * @param state input Poseidon state (modified by the function)
 */
void permutation_4(felt_t state[]);

/**
 * @brief Poseidon permutation (n=5)
 * 
 * Apply the Poseidon permutation to the input state (of size 5).
 * Specifically, apply
 *    - 4 full rounds,
 *    - 84 partial rounds,
 *    - 4 full rounds
 * to the input state.
 * 
 * @param state input Poseidon state (modified by the function)
 */
void permutation_5(felt_t state[]);

/**
 * @brief Poseidon permutation (n=9)
 * 
 * Apply the Poseidon permutation to the input state (of size 9).
 * Specifically, apply
 *    - 4 full rounds,
 *    - 84 partial rounds,
 *    - 4 full rounds
 * to the input state.
 * 
 * @param state input Poseidon state (modified by the function)
 */
void permutation_9(felt_t state[]);

#endif // __POSEIDON_H__
