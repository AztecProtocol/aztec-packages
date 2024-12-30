#if defined(ASSEMBLY) && defined(__x86_64__) && defined(__GNUC__)
#include <stdint.h>
#include <signal.h>
#include <stdlib.h>

void _asm_sanity_check(void);
void asm_sanity_check_post(int signo);
void asm_sanity_check_pre(void);
#endif

#include <stdio.h>
#include "f251.h"
void print_backend(void);
