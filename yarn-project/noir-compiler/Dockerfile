FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/yarn-project-base

WORKDIR /usr/src/yarn-project/
COPY @types @types
COPY foundation foundation
COPY noir-compiler noir-compiler

WORKDIR /usr/src/yarn-project/noir-compiler
RUN yarn build
