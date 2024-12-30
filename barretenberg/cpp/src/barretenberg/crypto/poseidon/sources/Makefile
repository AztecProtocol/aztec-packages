CC ?= gcc
CFLAGS ?= -Wall -Wextra -O3 -fPIC
CFLAGS += $(EXTRA_CFLAGS)
CFLAGS_ASM += $(EXTRA_ASMFLAGS)
CFLAGS_ASM += -DASSEMBLY
DEPS = f251.h poseidon_rc.h poseidon.h

OBJ_C   = f251.o f251_int128.o poseidon_rc.o poseidon.o
OBJ_ASM = f251_c.o f251_asm.o poseidon_rc.o poseidon_asm.o
SO_C    = lib_pos.so 
SO_ASM  = lib_pos_asm.so
SO_INT128  = lib_pos_avx.so

# Force ISO C as asked by the user
ifeq ($(ISO_C), 1)
CFLAGS += -DISO_C
endif

# Current compilation detection
PLATFORM_X86_64 := $(shell $(CC) -dumpmachine | grep x86_64)



ifneq ($(PLATFORM_X86_64),)
all: test_adx $(OBJ_C) $(OBJ_ASM) $(SO_C) $(SO_ASM) test test_asm
test_adx: platform_utils.c
	$(shell $(CC) $(CFLAGS) -DMAKEFILE_TEST_ADX_SUPPORT -o bin_test_adx $^)
	@if [ -e bin_test_adx ]; then \
		if ./bin_test_adx; then \
			echo "\n[+] Your CPU supports ADX: the assembly version should run here with no problem!\n"; \
		else \
			echo "\n[-] Your CPU does not seem to support ADX ... The assembly version will not run here!\n"; \
		fi \
	else \
		echo "\n[-] Could not check if your CPU supports ADX ... The assembly version might or might not run here!\n"; \
	fi;
	@rm -f bin_test_adx*
else
all: $(OBJ_C) $(OBJ_ASM) $(SO_C) $(SO_ASM) test test_asm
endif

only_c: $(OBJ_C) $(SO_C) 

%.o: %.c $(DEPS)
	$(CC) -c -o $@ $< $(CFLAGS)

poseidon_asm.o: poseidon.c
	$(CC) $(CFLAGS) $(CFLAGS_ASM) -c -o $@ $^

f251_c.o: f251.c
	$(CC) $(CFLAGS) $(CFLAGS_ASM) -c -o $@ $^

f251_asm.o: f251_asm.S
ifneq ($(PLATFORM_X86_64),)
	$(CC) -c -o $@ $^ $(CFLAGS)
else
	@echo "[-] Platform is not x86_64, skipping ASM f251_asm.o target"
endif

f251_int128.o: f251_int128.c
	$(CC) $(CFLAGS) -c -o $@ $^ 

lib_pos.so:
	$(CC) $(CFLAGS) -shared -o $@ poseidon.o poseidon_rc.o f251.o f251_int128.o

lib_pos_asm.so:
ifneq ($(PLATFORM_X86_64),)
	$(CC) $(CFLAGS) $(CFLAGS_ASM) -shared -o $@ poseidon_asm.o poseidon_rc.o f251_c.o f251_asm.o platform_utils.c
else
	@echo "[-] Platform is not x86_64, skipping ASM lib_pos_asm.so target"
endif

test: test.c platform_utils.c f251.o f251_int128.o poseidon_rc.o poseidon.o
	$(CC) $(CFLAGS) -fPIE -o $@ $^ 

ifneq ($(PLATFORM_X86_64),)
test_asm: test.c platform_utils.c f251_c.o f251_asm.o poseidon_rc.o poseidon_asm.o
	$(CC) $(CFLAGS) $(CFLAGS_ASM) -fPIE -o $@ $^ 
else
test_asm:
	@echo "[-] Platform is not x86_64, skipping ASM test_asm target"
endif

clean:
	rm -f *.o *.so test test_asm test.exe test_asm.exe bin_test_adx*
