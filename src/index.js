require("dotenv").config();
import "@babel/polyfill";

import { ApolloServer } from "apollo-server-express";
import { gql, AuthenticationError } from "apollo-server";

import * as heatmap from "./Heatmap.js";
import * as analyses from "./Analyses.js";
import * as dashboards from "./Dashboards.js";
import * as auth from "./Auth.js";
import * as chipHeatmap from "./ChipHeatmap.js";
import * as gcBias from "./GCBias.js";
import * as scatterplot from "./Scatterplot.js";
import * as violin from "./Violin.js";
import * as cache from "./Cache.js";

import { makeExecutableSchema } from "graphql-tools";
import { merge } from "lodash";

const baseSchema = gql`
  type Query {
    _blank: String
  }
`;
console.log("hello");
const schema = makeExecutableSchema({
  typeDefs: [
    baseSchema,
    analyses.schema,
    dashboards.schema,
    auth.schema,
    heatmap.schema,
    chipHeatmap.schema,
    gcBias.schema,
    scatterplot.schema,
    violin.schema,
    cache.schema
  ],
  resolvers: merge(
    analyses.resolvers,
    dashboards.resolvers,
    auth.resolvers,
    heatmap.resolvers,
    chipHeatmap.resolvers,
    gcBias.resolvers,
    scatterplot.resolvers,
    violin.resolvers,
    cache.resolvers
  ),
  inheritResolversFromInterfaces: true
});

const server = new ApolloServer({ schema });

const express = require("express");
const app = express();
server.applyMiddleware({ app });

app.listen({ port: 4000 }, () =>
  console.log(`🚀 Server ready at http://localhost:4000${server.graphqlPath}`)
);
