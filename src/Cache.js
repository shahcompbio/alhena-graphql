const { gql } = require("apollo-server");
import redis from "./api/redisClient.js";

import _ from "lodash";

import cacheConfig from "./api/cacheConfigs.js";

import bodybuilder from "bodybuilder";
export const schema = gql`
  extend type Query {
    getQueryParams(fragment: String): ParamsFromLink
    setCacheCopyUrl(type: String!, value: String!): Link!
    setCache(type: String!, value: Int!, auth: ApiUser!): Confirmation
  }
  type ParamsFromLink {
    paramsFromLink: String
  }
  type Link {
    link: String!
  }
`;

export const resolvers = {
  Query: {
    async getQueryParams(_, { fragment }) {
      if (fragment) {
        const response = await redis.get(cacheConfig["copyUrl"] + fragment);
        return response;
      } else {
        return null;
      }
    },
    async setCache(_, { type, value, auth }) {
      await redis.set(cacheConfig[type] + auth.uid, value);
      return true;
    },
    async setCacheCopyUrl(_, { type, value }) {
      const urlFragment = Math.random()
        .toString(36)
        .substr(2, 7);
      const respsone = await redis.set(cacheConfig[type] + urlFragment, value);
      await redis.expireat(
        cacheConfig[type] + urlFragment,
        parseInt(+new Date() / 1000) + 7 * 86400
      );

      return urlFragment;
    }
  },
  ParamsFromLink: {
    paramsFromLink: root => root
  },
  Link: {
    link: root => root
  }
};
