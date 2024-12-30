#ifdef MAKEFILE_TEST_ADX_SUPPORT
// Test ADX instructions set support
#if !defined(__x86_64__)
#error "Error: can not test ADX support on non-x86_64 platforms!"
#endif 

#include <stdint.h>
    
int main(int argc, char *argv[])
{   
    uint64_t a = 0; 
    uint64_t b = 1; 
    (void)argc;
    (void)argv;
    
    asm volatile ("adcx %1, %0"
        : "=r" (a)
        : "r" (b));
    asm volatile ("adox %1, %0"
        : "=r" (a)
        : "r" (b));
    asm volatile ("mulx %2, %1, %0"
        : "=r" (a), "=r" (a)
        : "r" (b));
        
    return 0;
}

#else

#include "platform_utils.h"

#if defined(ASSEMBLY) && defined(__x86_64__) && defined(__GNUC__)
// In case of assembly, we perform some sanity checks on the platform
// to see if we can run here!

volatile uint8_t __asm_sanity_check = 0;

void _asm_sanity_check(void)
{
    uint64_t a = 0;
    uint64_t b = 1;

    asm volatile ("adcx %1, %0"
        : "=r" (a)
        : "r" (b));
    asm volatile ("adox %1, %0"
        : "=r" (a)
        : "r" (b));
    asm volatile ("mulx %2, %1, %0"
        : "=r" (a), "=r" (a)
        : "r" (b));

    __asm_sanity_check = 1;

    return;
}

void asm_sanity_check_post(int signo)
{
    if((signo == SIGILL) && (!__asm_sanity_check)){
        printf("[-] Sorry, but your CPU does not seem to support the necessary ADX extensions for the x86_64 ASSEMBLY backend!\n");
        exit(-1);
    }
    return;
}

__attribute__((constructor)) void asm_sanity_check_pre(void)
{
    // Catch the illegal instruction signal
    if(signal(SIGILL, asm_sanity_check_post) == SIG_ERR) {
        return;
    }
    _asm_sanity_check();
}
#endif

void print_backend(void){
#ifdef ASSEMBLY
    printf("[+] Poseidon is using the ASSEMBLY backend\n");
#elif !defined(__SIZEOF_INT128__) || defined(ISO_C)
    printf("[+] Poseidon is using the ISO C backend\n");
#else
    printf("[+] Poseidon is using the __int128 compiler builtin backend\n");
#endif
}

#endif
