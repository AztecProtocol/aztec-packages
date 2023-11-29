FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/yarn-project-prod AS yarn-project-prod

# Need new arch specific image.
FROM node:18-alpine
COPY --from=yarn-project-prod /usr/src /usr/src
WORKDIR /usr/src/yarn-project/aztec-sandbox
ENTRYPOINT ["yarn", "start"]
EXPOSE 8079 8080
