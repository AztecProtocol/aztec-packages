###############################################################################
# Configuration
###############################################################################

# Platform detection.
ifeq ($(OS),Windows_NT)
	PLATFORM = Windows
else
	UNAME_S := $(shell uname -s)
	ifeq ($(UNAME_S),Darwin)
		PLATFORM = Darwin
	else
		PLATFORM = Linux
	endif
endif

# Some commands need xcode.
ifeq ($(PLATFORM),Darwin)
	XCRUN = xcrun
endif

# The base compiler flags. More can be added on command line.
CFLAGS += -I. -I../inc -O2 -Werror -Wno-gnu-folding-constant
# Enable a bunch of optional warnings.
CFLAGS += \
	-pedantic \
	-Wall \
	-Wextra \
	-Waggregate-return \
	-Walloca \
	-Warray-bounds \
	-Wbad-function-cast \
	-Wcast-align \
	-Wcast-qual \
	-Wconversion \
	-Wdisabled-optimization \
	-Wdouble-promotion \
	-Wenum-compare \
	-Wfloat-equal \
	-Wframe-larger-than=1048576 \
	-Wimplicit \
	-Wimplicit-fallthrough \
	-Winit-self \
	-Winline \
	-Winvalid-pch \
	-Wmissing-declarations \
	-Wmissing-field-initializers \
	-Wmissing-format-attribute \
	-Wmissing-include-dirs \
	-Wmissing-noreturn \
	-Wmissing-prototypes \
	-Wnested-externs \
	-Wnull-dereference \
	-Wold-style-definition \
	-Woverlength-strings \
	-Wpacked \
	-Wpadded \
	-Wpointer-arith \
	-Wredundant-decls \
	-Wshadow \
	-Wsign-compare \
	-Wsign-conversion \
	-Wstack-protector \
	-Wstrict-aliasing=2 \
	-Wstrict-overflow=5 \
	-Wstrict-prototypes \
	-Wswitch-default \
	-Wswitch-enum \
	-Wtype-limits \
	-Wundef \
	-Wuninitialized \
	-Wunreachable-code \
	-Wvariadic-macros \
	-Wwrite-strings

# Cross-platform compilation settings.
ifeq ($(PLATFORM),Windows)
	CC = gcc
	CFLAGS += -D_CRT_SECURE_NO_WARNINGS
	CFLAGS += -Wno-missing-braces -Wno-format
else
	CC = clang
	CFLAGS += -fPIC
	CFLAGS += -Wmissing-braces -Wformat=2
endif

# Settings for blst.
BLST_DIR = ../blst
BLST_HASH = $(shell git -C $(BLST_DIR) rev-parse HEAD)
BLST_HASH_FILE = .blst_hash
BLST_LIBRARY = ../lib/libblst.a
BLST_BUILDSCRIPT = ../blst/build.sh
BLST_BUILDSCRIPT_FLAGS = -D__BLST_PORTABLE__

# Libraries to build with.
LIBS = $(BLST_LIBRARY)

# Create file lists.
SOURCE_FILES := $(shell find . -name '*.c' | sed 's|^\./||' | sort)
HEADER_FILES := $(shell find . -name '*.h' | sed 's|^\./||' | sort)

# There is no tests header file.
HEADER_FILES := $(filter-out test/tests.h, $(HEADER_FILES))
# We don't want to format this and it is not expected to change.
HEADER_FILES := $(filter-out test/tinytest.h, $(HEADER_FILES))

###############################################################################
# Core
###############################################################################

all: test

# This will populate the blst directory will files.
$(BLST_BUILDSCRIPT):
	@echo "[+] initializing blst submodule"
	@git submodule update --init

# This will build blst without condition.
# It will also copy the header files to our include directory.
.PHONY: build_blst
build_blst: $(BLST_BUILDSCRIPT)
	@echo "[+] building blst"
	@cd $(dir $(BLST_BUILDSCRIPT)) && \
	./$(notdir $(BLST_BUILDSCRIPT)) $(BLST_BUILDSCRIPT_FLAGS) && \
	cp $(notdir $(BLST_LIBRARY)) ../lib && \
	cp bindings/*.h ../inc
	@echo $(BLST_HASH) > $(BLST_HASH_FILE)

# This will build blst if the module is out of date.
# We track this with a hidden file.
.PHONY: blst
blst:
	@if [ ! -f $(BLST_HASH_FILE) ] || \
		[ "$(BLST_HASH)" != "$$(cat $(BLST_HASH_FILE))" ]; then \
			$(MAKE) build_blst; \
	fi

# This compiles the tests with optimizations disabled.
# It will re-build if any of our source/header files change.
tests: CFLAGS += -O0
tests: blst $(SOURCE_FILES) $(HEADER_FILES)
	@echo "[+] building tests"
	@$(CC) $(CFLAGS) -o $@ test/tests.c $(LIBS)

# This simply runs the test suite.
.PHONY: test
test: tests
	@echo "[+] executing tests"
	@./tests

###############################################################################
# Coverage
###############################################################################

tests_cov: CFLAGS += -O0 -fprofile-instr-generate -fcoverage-mapping
tests_cov: blst $(SOURCE_FILES) $(HEADER_FILES)
	@echo "[+] building tests with coverage"
	@$(CC) $(CFLAGS) -o $@ test/tests.c $(LIBS)

.PHONY: coverage
coverage: tests_cov
	@echo "[+] executing tests with coverage"
	@LLVM_PROFILE_FILE="ckzg.profraw" ./$<
	@$(XCRUN) llvm-profdata merge --sparse ckzg.profraw -o ckzg.profdata
	@$(XCRUN) llvm-cov show --instr-profile=ckzg.profdata --format=html \
	    $< $(SOURCE_FILES) > coverage.html
	@$(XCRUN) llvm-cov report --instr-profile=ckzg.profdata \
	    --show-functions $< $(SOURCE_FILES)

###############################################################################
# Profile
###############################################################################

tests_prof: LIBS += -lprofiler
tests_prof: CFLAGS += -O0 -DPROFILE
ifeq ($(PLATFORM),Darwin)
tests_prof: CFLAGS += -L$(shell brew --prefix gperftools)/lib
tests_prof: CFLAGS += -I$(shell brew --prefix gperftools)/include
endif
tests_prof: blst $(SOURCE_FILES) $(HEADER_FILES)
	@echo "[+] building tests with profiler"
	@$(CC) $(CFLAGS) -o $@ test/tests.c $(LIBS)

.PHONY: run_profiler
run_profiler: tests_prof
	@echo "[+] executing tests with profiler"
	@CPUPROFILE_FREQUENCY=1000000000 ./$<

.PHONY: profile_%
profile_%: run_profiler
	@echo "[+] generating profiling graph for $*"
	@pprof --pdf --nodefraction=0.00001 --edgefraction=0.00001 \
	    ./tests_prof $*.prof > $*.pdf

.PHONY: profile
profile: \
	profile_blob_to_kzg_commitment \
	profile_compute_kzg_proof \
	profile_compute_blob_kzg_proof \
	profile_verify_kzg_proof \
	profile_verify_blob_kzg_proof \
	profile_verify_blob_kzg_proof_batch \
	profile_compute_cells_and_kzg_proofs \
	profile_recover_cells_and_kzg_proofs \
	profile_verify_cell_kzg_proof_batch

###############################################################################
# Sanitize
###############################################################################

.PHONY: sanitize_%
sanitize_%: CFLAGS += -O0 -fsanitize=$*
sanitize_%: blst $(SOURCE_FILES) $(HEADER_FILES)
	@echo "[+] building tests with $* sanitizer"
	@$(CC) $(CFLAGS) -o $@ test/tests.c $(LIBS)
	@echo "[+] executing tests with $* sanitizer"
	@ASAN_OPTIONS=allocator_may_return_null=1 \
	    LSAN_OPTIONS=allocator_may_return_null=1 \
	    ./$@; rm $@

.PHONY: sanitize
ifeq ($(PLATFORM),Darwin)
sanitize: \
	sanitize_address \
	sanitize_undefined
else ifeq ($(PLATFORM),Linux)
sanitize: \
	sanitize_address \
	sanitize_leak \
	sanitize_safe-stack \
	sanitize_undefined
endif

###############################################################################
# Analyze
###############################################################################

.PHONY: analyze
analyze: blst $(SOURCE_FILES)
	@rm -rf analysis-report
	@for src in $(SOURCE_FILES); do \
		echo "[+] analyzing $$src..."; \
		$(CC) --analyze -Xanalyzer -analyzer-output=html -o analysis-report $(CFLAGS) -c $$src; \
		[ -d analysis-report ] && exit 1; true; \
	done

###############################################################################
# Cleanup
###############################################################################

.PHONY: format
format:
	@echo "[+] executing formatter"
	@python3 ../scripts/format_c_params.py
	@clang-format -i --sort-includes $(SOURCE_FILES) $(HEADER_FILES)

.PHONY: clean
clean:
	@echo "[+] cleaning"
	@rm -f *.o */*.o *.profraw *.profdata *.html xray-log.* *.prof *.pdf \
	    tests tests_cov tests_prof .blst_hash
	@rm -rf analysis-report
