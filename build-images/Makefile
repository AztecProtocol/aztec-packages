build:
	docker build -f Dockerfile.build -t aztecprotocol/build .

basebox: build
	docker build -f Dockerfile.basebox -t aztecprotocol/basebox .

devbox: basebox
	docker build -f Dockerfile.devbox -t aztecprotocol/devbox .

sysbox: basebox
	docker build -f Dockerfile.sysbox -t aztecprotocol/sysbox .

all: build devbox basebox

.PHONY: all build basebox devbox sysbox
