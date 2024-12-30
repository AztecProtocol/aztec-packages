#include <stdlib.h>
#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include <inttypes.h>
#include <sys/time.h>
#include "poseidon.h"
#include "platform_utils.h"

static int get_ms_time(uint64_t *time)
{
        struct timeval tv;
        int ret;

        if (time == NULL) {
                ret = -1;
                goto err;
        }

        ret = gettimeofday(&tv, NULL);
        if (ret < 0) {
                ret = -1;
                goto err;
        }

        (*time) = (uint64_t)(((tv.tv_sec) * 1000) + ((tv.tv_usec) / 1000));
        ret = 0;

err:
        return ret;
}

static void clear_state(felt_t* state, int size)
{
    int i;

    for(i=0; i<size; i++)
    {
        state[i][0] = 0;
        state[i][1] = 0;
        state[i][2] = 0;
        state[i][3] = 0;
    }
}

__attribute__((used)) static void print_state(felt_t* state, int size)
{
    int i;

    for(i=0; i<size; i++)
    {
        printf("%016" PRIx64,state[i][3]);
        printf("%016" PRIx64,state[i][2]);
        printf("%016" PRIx64,state[i][1]);
        printf("%016" PRIx64,state[i][0]);
        printf("\n");
    }
}

felt_t RES_P3_0[3] = 
{
    {0x86550ed6a9086133ull, 0x852357968577b1e3ull, 0xa28fc9d49e233bc6ull, 0x79e8d1e78258000ull},
    {0xa256154cbb6fb984ull, 0xe5b5404b91ccaabcull, 0xdbb796ff6aa6a63bull, 0x3840d003d0f3f96ull},
    {0x50b70eaa8a3c7cc7ull, 0x9325a61fb2ef326eull, 0x142d0ac83d9da00cull, 0x1eb39da3f7d3b04ull}
};

felt_t RES_P4_0[4] = 
{
    {0x9116ee725265ef9cull, 0x817222f1f1c13e7ull, 0x8d99527db44b1431ull, 0x12ed6e9f9465e1cull},
    {0x144ec1545502b500ull, 0xea1c0eba513a21c8ull, 0x804a3392f9a2ce4cull, 0x7e30a5f68db0e3full},
    {0x17734072bf3344e7ull, 0x27702f1e3f665340ull, 0xbdd6916c9bf4faa2ull, 0x822c3084ad4c2eull},
    {0xbae9bddb5eb0b590ull, 0xf2495d68dcd9b84dull, 0x9307714900a9bbc7ull, 0x7c4d826e783eb92ull}
};


felt_t RES_P5_0[5] = 
{
    {0xc15aa112316d2a0cull, 0x66d1b060071048baull, 0x23b97bcdabd372e8ull, 0x52b15cd07aaa1d5ull},
    {0xc138969929d0919full, 0x44fd8396998f5313ull, 0x1d3bb8f062fb1cffull, 0x724a9efd5de8bcaull},
    {0x8662aa7de9fa2532ull, 0x5798c9ccf0b6c453ull, 0xc43f8e6ea7a0f3bbull, 0x74a39122aec2362ull},
    {0x4c0269509b1dbd85ull, 0xea61a2cc96b5095cull, 0xf575b5d2343d529eull, 0x5b7548e84387873ull},
    {0xfd1147e3dbc9bd14ull, 0xcd0d09c20d1bcf9aull, 0x8f2e620c9335798ull, 0x7f2df5323eefb39ull}
};

felt_t RES_P9_0[9] = 
{
    {0xb68b2f181a1105eaull, 0xa478c29c28e2af58ull, 0xb9c19a08b8b64a1cull, 0x3644784ce53d19cull},
    {0x3959922aa4ffa44cull, 0x26edc7b9b60fd6aeull, 0x305bd4a334f03825ull, 0x3c84f6ab262a6a4ull},
    {0x8414717a65042af3ull, 0xdf93cdbb739c695bull, 0x9a630365d2644188ull, 0x6ffd0ddc41370a1ull},
    {0x2af67fae46335e27ull, 0x82c8eebdf6432935ull, 0xca833d15c60929edull, 0x237aea4fd643083ull},
    {0x86cbdf690acb8921ull, 0x2dd91342c988f688ull, 0xb504147b794ae020ull, 0x268d9336cd4dd1ull},
    {0xea89aa6a45b479e7ull, 0xf2bafb1882965ce9ull, 0xea8a4f918dca95adull, 0x27bd1c418651643ull},
    {0x52f3daf9f421e217ull, 0xfb2d84891e5cb448ull, 0x9c7bede6ac2e339dull, 0x10edf75e00c657full},
    {0x2316ced970caf77bull, 0xf9346e8a3c5a2814ull, 0x10b97aaf51ee144full, 0x1d8c6a1ee897c35ull},
    {0x843a2de1afbece60ull, 0x210fc63dcfc96f0bull, 0x246a5c8b7adcfc7full, 0x6eb59614b6bd7e0ull}
};

#ifndef PERF_MEASUREMENT
#define PERF_MEASUREMENT 500000
#endif

// Small macro to measure performance of a function with argument a
#define DO_MEASURE_PERF(fn, a, m) do { \
  uint64_t i, t1 = 0, t2 = 0, t = 0; \
  for(i = 0; i < PERF_MEASUREMENT; i++){ \
    	get_ms_time(&t1); \
        fn(a); \
    	get_ms_time(&t2); \
        t += (t2 - t1); \
  } \
  printf("[+] %s performance measurement: %f ms on average\n", #fn, (float)t / (float)PERF_MEASUREMENT); \
} while(0);

int main(int argc, const char* argv[])
{
    felt_t state[9];
    int err = 0;

    (void)argc;
    (void)argv;

    print_backend();

    // Test poseidon3
    clear_state(state, 3);
    permutation_3(state);
    // print_state(state, 3);
    // printf("---------\n");

    if (memcmp(state,RES_P3_0,3*sizeof(felt_t)))
    {
        printf("Permutation 3 NOK :-/\n");
        err ++;
    }

    // Test poseidon4
    clear_state(state, 4);
    permutation_4(state);
    // print_state(state, 4);
    // printf("---------\n");

    if (memcmp(state,RES_P4_0,4*sizeof(felt_t)))
    {
        printf("Permutation 4 NOK :-/\n");
        err ++;
    }

    // Test poseidon5
    clear_state(state, 5);
    permutation_5(state);
    // print_state(state, 5);
    // printf("---------\n");

    if (memcmp(state,RES_P5_0,5*sizeof(felt_t)))
    {
        printf("Permutation 5 NOK :-/\n");
        err ++;
    }

    // Test poseidon9
    clear_state(state, 9);
    permutation_9(state);
    // print_state(state, 9);
    // printf("---------\n");

    if (memcmp(state,RES_P9_0,9*sizeof(felt_t)))
    {
        printf("Permutation 9 - NOK :-/\n");
        err ++;
    }

    if (!err)
    {
        printf("All good :-)\n");
    }

    // Test performance
    // Permutation 3
    clear_state(state, 3);
    DO_MEASURE_PERF(permutation_3, state, PERF_MEASUREMENT);
    // Permutation 4
    clear_state(state, 4);
    DO_MEASURE_PERF(permutation_4, state, PERF_MEASUREMENT);
    // Permutation 3
    clear_state(state, 5);
    DO_MEASURE_PERF(permutation_5, state, PERF_MEASUREMENT);
    // Permutation 9
    clear_state(state, 9);
    DO_MEASURE_PERF(permutation_9, state, PERF_MEASUREMENT);

    return 0;
}
