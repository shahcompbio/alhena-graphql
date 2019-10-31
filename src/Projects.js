import redis from "./api/redisClient.js";
const { gql } = require("apollo-server");

import client from "./api/client";
import authClient from "./api/authClient";

import _ from "lodash";

const FIELDS = ["project"];

export const schema = gql`
  extend type Query {
    getProjects(auth: ApiUser!): [Project]
    getAllIndices: [Index!]
  }
  type Index {
    name: String
  }
  type Project {
    name: String!
    count: Int!
  }
`;
var collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base"
});
export const getIndices = async () => {
  var response = await authClient(
    process.env.ES_USER,
    process.env.ES_PASSWORD
  ).search({
    index: "analyses",
    size: 5000
  });
  const indexNames = response.body.hits.hits.map(hit => hit._source.jira_id);
  return [...new Set(indexNames)].sort(collator.compare);
};
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
  Index: {
    name: root => root
  },
  Query: {
    async getAllIndices() {
      return await getIndices();
    },
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
