PROTO_SRC_DIR := ../../../../../noir/noir-repo/acvm-repo/acir/src/proto
PROTO_DST_DIR := ./acir_format/proto

# Using acir/program.proto instead of the top level program.proto so that we don't deserialize the Brillig part.
PROTO_SCHEMAS += \
	acir/program.proto \
	acir/witness.proto \
	acir/circuit.proto \
	acir/native.proto

PROTO_CPP := $(PROTO_SCHEMAS:.proto=.pb.h)
PROTO_DST := $(patsubst %, $(PROTO_DST_DIR)/%, $(PROTO_CPP))

.PHONY: all
all: $(PROTO_DST)


test:
	@echo $(PROTO_DST)

# Compile an ACIR protobuf schema to C++
$(PROTO_DST_DIR)/%.pb.h: $(PROTO_SRC_DIR)/%.proto $(PROTO_DST_DIR) | .protoc
	protoc --cpp_out $(PROTO_DST_DIR) -I $(PROTO_SRC_DIR) $<

$(PROTO_DST_DIR):
	mkdir -p $@

.PHONY: .protoc
.protoc:
	@if [ -z "$$(which protoc)" ]; then \
		echo "Please install the protobuf compiler"; \
		exit 1; \
	fi
