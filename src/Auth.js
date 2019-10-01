var Redis = require("ioredis");
const { gql, AuthenticationError } = require("apollo-server");

var redis = new Redis();
import authClient from "./api/authClient";

import _ from "lodash";

export const schema = gql`
  extend type Query {
    login(user: User!): Acknowledgement
  }
  input User {
    uid: String!
    password: String!
  }
  input ApiUser {
    uid: String!
    authKeyID: String!
  }
  type Acknowledgement {
    statusCode: String
    authKeyID: String
  }
`;
async function login(user) {
  const result = await authClient(user.uid, user.password).security.getApiKey({
    username: user.uid
  });
  //wrong auth
  if (result.statusCode === 200) {
    //if keys invalidate
    var oldKey;
    if (result.body.api_keys.length !== 0) {
      oldKey = await authClient(
        user.uid,
        user.password
      ).security.invalidateApiKey({
        body: { name: "login-" + user.uid }
      });
    }
    if ((oldKey && oldKey.statusCode === 200) || oldKey === undefined) {
      const newKey = await authClient(
        user.uid,
        user.password
      ).security.createApiKey({
        body: { name: "login-" + user.uid, expiration: "1d" }
      });
      redis.set(user.uid + ":" + newKey.body.id, newKey.body.api_key);
      return {
        statusCode: newKey.statusCode,
        authKeyID: newKey.body ? newKey.body.id : null
      };
    } else {
      return { statusCode: oldKey.statusCode, authKeyID: null };
    }
  }
}

export const resolvers = {
  Query: {
    login: async (_, { user }) => {
      return await login(user);
    }
  },
  Acknowledgement: {
    statusCode: root => root.statusCode,
    authKeyID: root => root.authKeyID
  }
};
