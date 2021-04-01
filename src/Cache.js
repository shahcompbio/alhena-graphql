const { gql } = require("apollo-server");
import redis from "./api/redisClient.js";

import _ from "lodash";

import cacheConfig from "./api/cacheConfigs.js";

import bodybuilder from "bodybuilder";
export const schema = gql`
  extend type Query {
    setCache(type: String!, value: Int!, auth: ApiUser!): Confirmation
  }
`;

export const resolvers = {
  Query: {
    async setCache(_, { type, value, auth }) {
      await redis.set(cacheConfig[type] + auth.uid, value);
      return true;
    }
  }
};
