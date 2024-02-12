FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/noir-projects as noir-projects
FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/yarn-project

# Copy in aztec-nr.
COPY --from=noir-projects /usr/src/noir-projects/aztec-nr /usr/src/noir-projects/aztec-nr

WORKDIR /usr/src

COPY . .
WORKDIR /usr/src/docs
RUN yarn && yarn build