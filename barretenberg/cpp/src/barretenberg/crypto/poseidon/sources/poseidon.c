#include "f251.h"
#include "poseidon_rc.h"

#define FULL_ROUND              0xF
#define PARTIAL_ROUND           0x1

#define N_FULL_ROUNDS_P3        8
#define N_FULL_ROUNDS_P4        8
#define N_FULL_ROUNDS_P5        8
#define N_FULL_ROUNDS_P9        8
#define N_PARTIAL_ROUNDS_P3     83
#define N_PARTIAL_ROUNDS_P4     84
#define N_PARTIAL_ROUNDS_P5     84
#define N_PARTIAL_ROUNDS_P9     84


void state_to_montgomery(felt_t state[], int size)
{
    int i;

    for(i=0; i<size; i++)
    {
        f251_to_montgomery(state[i],state[i]);
    } 
}

void state_from_montgomery(felt_t state[], int size)
{
    int i;

    for(i=0; i<size; i++)
    {
        f251_from_montgomery(state[i],state[i]);
    } 
}

void mix_layer_3(felt_t state[])
{
    felt_t t;

    // t = s[0] + s[1] + s[2]
    f251_sum_state_3(t, state);

    // s[0] = t + 2 s[0]
    f251_x_plus_2y(state[0],t,state[0]);
    
    // s[1] = t - 2 s[1]
    f251_x_minus_2y(state[1],t,state[1]);

    // s[2] = t - 3 s[2]
    f251_x_minus_3y(state[2],t,state[2]);
}

void mix_layer_4(felt_t state[])
{
    felt_t t1, t2;

    // t1 = s[0] + s[1] + s[2] + s[3]
    // t2 = s[0] + s[1] + s[3]
    f251_sum_state_4(t1, t2, state);

    // s[0] = t1 + s[0]
    f251_add(state[0],t1,state[0]);

    // s[1] = t1
    f251_copy(state[1],t1);

    // s[2] = t2
    f251_copy(state[2],t2);

    // s[3] = t1 - 2 s[3]
    f251_x_minus_2y(state[3],t1,state[3]);
}

void mix_layer_5(felt_t state[])
{
    felt_t t;

    // t = s[0] + s[1] + s[2] + s[3] + s[4]
    f251_sum_state_5(t, state);

    // s[0] = t + 2 s[0]
    f251_x_plus_2y(state[0],t,state[0]);

    // s[1] = t + s[1]
    f251_add(state[1],t,state[1]);

    // s[2] = t
    f251_copy(state[2],t);

    // s[3] = t - 2 s[3]
    f251_x_minus_2y(state[3],t,state[3]);

    // s[4] = t - 3 s[4]
    f251_x_minus_3y(state[4],t,state[4]);
}

void mix_layer_9(felt_t state[])
{
    felt_t t1, t2;

    // t1 = s[0] + s[1] + ... + s[7] + s[8]
    // t2 = s[0] + s[1] + ... + s[7]   
    f251_sum_state_9(t1, t2, state);

    // s[0] = t1 + 4 s[0]
    f251_x_plus_4y(state[0],t1,state[0]);

    // s[1] = t1 + 3 s[1]
    f251_x_plus_3y(state[1],t1,state[1]);

    // s[2] = t1 + 2 s[2]
    f251_x_plus_2y(state[2],t1,state[2]);

    // s[3] = t1 + s[3]
    f251_add(state[3],t1,state[3]);

    // s[4] = t1
    f251_copy(state[4],t1);

    // s[5] = t1 - s[5]
    f251_sub(state[5],t1,state[5]);

    // s[6] = t1 - 2 s[6]
    f251_x_minus_2y(state[6],t1,state[6]);

    // s[7] = t1 - 4 s[7]
    f251_x_minus_4y(state[7],t1,state[7]);

    // s[8] = t2 - 4 s[8]
    f251_x_minus_4y(state[8],t2,state[8]);
}

void round_3(felt_t state[], int rc_idx, uint8_t round_mode)
{
    // AddRoundConstant + SubWords
    if (round_mode == FULL_ROUND) {
        f251_add(state[0],state[0],CONST_RC_MONTGOMERY_P3[rc_idx+0]);
        f251_add(state[1],state[1],CONST_RC_MONTGOMERY_P3[rc_idx+1]);
        f251_add(state[2],state[2],CONST_RC_MONTGOMERY_P3[rc_idx+2]);

        f251_montgomery_cube(state[0],state[0]);
        f251_montgomery_cube(state[1],state[1]);
        f251_montgomery_cube(state[2],state[2]);
    }
    else {
        f251_add(state[2],state[2],CONST_RC_MONTGOMERY_P3[rc_idx]);
        f251_montgomery_cube(state[2],state[2]);
    }

    // MixLayer
    mix_layer_3(state);
}

void round_4(felt_t state[], int rc_idx, uint8_t round_mode)
{
    // AddRoundConstant + SubWords
    if (round_mode == FULL_ROUND) {
        f251_add(state[0],state[0],CONST_RC_MONTGOMERY_P4[rc_idx+0]);
        f251_add(state[1],state[1],CONST_RC_MONTGOMERY_P4[rc_idx+1]);
        f251_add(state[2],state[2],CONST_RC_MONTGOMERY_P4[rc_idx+2]);
        f251_add(state[3],state[3],CONST_RC_MONTGOMERY_P4[rc_idx+3]);

        f251_montgomery_cube(state[0],state[0]);
        f251_montgomery_cube(state[1],state[1]);
        f251_montgomery_cube(state[2],state[2]);
        f251_montgomery_cube(state[3],state[3]);
    }
    else {
        f251_add(state[3],state[3],CONST_RC_MONTGOMERY_P4[rc_idx]);
        f251_montgomery_cube(state[3],state[3]);
    }

    // MixLayer
    mix_layer_4(state);
}

void round_5(felt_t state[], int rc_idx, uint8_t round_mode)
{
    // AddRoundConstant + SubWords
    if (round_mode == FULL_ROUND) {
        f251_add(state[0],state[0],CONST_RC_MONTGOMERY_P5[rc_idx+0]);
        f251_add(state[1],state[1],CONST_RC_MONTGOMERY_P5[rc_idx+1]);
        f251_add(state[2],state[2],CONST_RC_MONTGOMERY_P5[rc_idx+2]);
        f251_add(state[3],state[3],CONST_RC_MONTGOMERY_P5[rc_idx+3]);
        f251_add(state[4],state[4],CONST_RC_MONTGOMERY_P5[rc_idx+4]);

        f251_montgomery_cube(state[0],state[0]);
        f251_montgomery_cube(state[1],state[1]);
        f251_montgomery_cube(state[2],state[2]);
        f251_montgomery_cube(state[3],state[3]);
        f251_montgomery_cube(state[4],state[4]);
    }
    else {
        f251_add(state[4],state[4],CONST_RC_MONTGOMERY_P5[rc_idx]);
        f251_montgomery_cube(state[4],state[4]);
    }
    
    // MixLayer
    mix_layer_5(state);
}

void round_9(felt_t state[], int rc_idx, uint8_t round_mode)
{
    // AddRoundConstant + SubWords
    if (round_mode == FULL_ROUND) {
        f251_add(state[0],state[0],CONST_RC_MONTGOMERY_P9[rc_idx+0]);
        f251_add(state[1],state[1],CONST_RC_MONTGOMERY_P9[rc_idx+1]);
        f251_add(state[2],state[2],CONST_RC_MONTGOMERY_P9[rc_idx+2]);
        f251_add(state[3],state[3],CONST_RC_MONTGOMERY_P9[rc_idx+3]);
        f251_add(state[4],state[4],CONST_RC_MONTGOMERY_P9[rc_idx+4]);
        f251_add(state[5],state[5],CONST_RC_MONTGOMERY_P9[rc_idx+5]);
        f251_add(state[6],state[6],CONST_RC_MONTGOMERY_P9[rc_idx+6]);
        f251_add(state[7],state[7],CONST_RC_MONTGOMERY_P9[rc_idx+7]);
        f251_add(state[8],state[8],CONST_RC_MONTGOMERY_P9[rc_idx+8]);

        f251_montgomery_cube(state[0],state[0]);
        f251_montgomery_cube(state[1],state[1]);
        f251_montgomery_cube(state[2],state[2]);
        f251_montgomery_cube(state[3],state[3]);
        f251_montgomery_cube(state[4],state[4]);
        f251_montgomery_cube(state[5],state[5]);
        f251_montgomery_cube(state[6],state[6]);
        f251_montgomery_cube(state[7],state[7]);
        f251_montgomery_cube(state[8],state[8]);
    }
    else {
        f251_add(state[8],state[8],CONST_RC_MONTGOMERY_P9[rc_idx]);
        f251_montgomery_cube(state[8],state[8]);
    }

    // MixLayer
    mix_layer_9(state);
}

void permutation_3(felt_t state[])
{
    int r, rc_idx = 0;

    state_to_montgomery(state,3);
    
    for (r=0; r<N_FULL_ROUNDS_P3/2; r++) {
        round_3(state, rc_idx, FULL_ROUND);
        rc_idx += 3;
    }
    for (r=0; r<N_PARTIAL_ROUNDS_P3; r++) {
        round_3(state, rc_idx, PARTIAL_ROUND);
        rc_idx ++;
    }
    for (r=0; r<N_FULL_ROUNDS_P3/2; r++) {
        round_3(state, rc_idx, FULL_ROUND);
        rc_idx += 3;
    }

    state_from_montgomery(state,3);
}

void permutation_4(felt_t state[])
{
    int r, rc_idx = 0;
    
    state_to_montgomery(state,4);

    for (r=0; r<N_FULL_ROUNDS_P4/2; r++) {
        round_4(state, rc_idx, FULL_ROUND);
        rc_idx += 4;
    }
    for (r=0; r<N_PARTIAL_ROUNDS_P4; r++) {
        round_4(state, rc_idx, PARTIAL_ROUND);
        rc_idx ++;
    }
    for (r=0; r<N_FULL_ROUNDS_P4/2; r++) {
        round_4(state, rc_idx, FULL_ROUND);
        rc_idx += 4;
    }

    state_from_montgomery(state,4);
}

void permutation_5(felt_t state[])
{
    int r, rc_idx = 0;
    
    state_to_montgomery(state,5);
    
    for (r=0; r<N_FULL_ROUNDS_P5/2; r++) {
        round_5(state, rc_idx, FULL_ROUND);
        rc_idx += 5;
    }
    for (r=0; r<N_PARTIAL_ROUNDS_P5; r++) {
        round_5(state, rc_idx, PARTIAL_ROUND);
        rc_idx ++;
    }
    for (r=0; r<N_FULL_ROUNDS_P5/2; r++) {
        round_5(state, rc_idx, FULL_ROUND);
        rc_idx += 5;
    }

    state_from_montgomery(state,5);
}

void permutation_9(felt_t state[])
{
    int r, rc_idx = 0;
    
    state_to_montgomery(state,9);
    
    for (r=0; r<N_FULL_ROUNDS_P9/2; r++) {
        round_9(state, rc_idx, FULL_ROUND);
        rc_idx += 9;
    }
    for (r=0; r<N_PARTIAL_ROUNDS_P9; r++) {
        round_9(state, rc_idx, PARTIAL_ROUND);
        rc_idx ++;
    }
    for (r=0; r<N_FULL_ROUNDS_P9/2; r++) {
        round_9(state, rc_idx, FULL_ROUND);
        rc_idx += 9;
    }

    state_from_montgomery(state,9);
}

