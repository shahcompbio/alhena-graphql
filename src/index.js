import "@babel/polyfill";
import { ApolloServer } from "apollo-server-express";
import { gql, AuthenticationError } from "apollo-server";

import * as analyses from "./Analyses.js";
import * as projects from "./Projects.js";
import * as auth from "./Auth.js";

import { makeExecutableSchema } from "graphql-tools";
import { merge } from "lodash";

const baseSchema = gql`
  type Query {
    _blank: String
  }
`;
const schema = makeExecutableSchema({
  typeDefs: [baseSchema, analyses.schema, projects.schema, auth.schema],
  resolvers: merge(analyses.resolvers, projects.resolvers, auth.resolvers),
  inheritResolversFromInterfaces: true
});

const server = new ApolloServer({ schema });

const express = require("express");
const app = express();
server.applyMiddleware({ app });

app.listen({ port: 4000 }, () =>
  console.log(`🚀 Server ready at http://localhost:4000${server.graphqlPath}`)
);
