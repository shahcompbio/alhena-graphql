import "@babel/polyfill";
import { ApolloServer } from "apollo-server-express";
import { gql } from "apollo-server";

import * as analyses from "./Analyses.js";
import * as projects from "./Projects.js";

import { makeExecutableSchema } from "graphql-tools";
import { merge } from "lodash";

const baseSchema = gql`
  type Query {
    _blank: String
  }
`;
const schema = makeExecutableSchema({
  typeDefs: [baseSchema, analyses.schema, projects.schema],
  resolvers: merge(analyses.resolvers, projects.resolvers),
  inheritResolversFromInterfaces: true
});

const server = new ApolloServer({ schema });

const express = require("express");
const app = express();
server.applyMiddleware({ app });

app.listen({ port: 4000 }, () =>
  console.log(`🚀 Server ready at http://localhost:4000${server.graphqlPath}`)
);
