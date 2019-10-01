require("dotenv").config();
var Redis = require("ioredis");
var redis = new Redis();
const { gql } = require("apollo-server");

import client from "./api/client";
import authClient from "./api/authClient";

import _ from "lodash";

const FIELDS = ["project"];

const adminPassword = process.env.PASS;
const adminUser = process.env.UID;

export const schema = gql`
  extend type Query {
    getProjects(auth: ApiUser!): [Project]
  }
  type Project {
    name: String!
    count: Int!
  }
`;

export const getApiId = async uid => {
  const apiKeyResult = await authClient(
    adminUser,
    adminPass
  ).security.getApiKey({
    name: "login-" + uid
  });

  if (apiKeyResult.statusCode === 200) {
    return apiKeyResult.body.api_keys.filter(
      key => key.invalidated === false
    )[0].id;
  }
};
export const resolvers = {
  Project: {
    name: root => root.key,
    count: root => root.doc_count
  },
  Query: {
    async getProjects(_, { auth }) {
      const authKey = await redis.get(auth.uid + ":" + auth.authKeyID);

      var data = await client(authKey, auth.authKeyID).search({
        index: "analyses",
        size: 10000,
        body: {
          size: 0,
          aggs: {
            project: {
              terms: { field: "project" }
            }
          }
        }
      });
      return data["body"]["aggregations"]["project"]["buckets"];
    }
  }
};
