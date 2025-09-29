FROM ubuntu:latest
COPY . /test
RUN ls -la /test/yarn-project/cli/ || echo "cli not found"
RUN ls -la /test/yarn-project/cli/proofs/ || echo "proofs not found"