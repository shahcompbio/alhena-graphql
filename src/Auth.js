import redis from "./api/redisClient.js";
const { gql, AuthenticationError } = require("apollo-server");

import authClient from "./api/authClient";
import client from "./api/client";
import { oneDayExpiryDate } from "./api/utils/config.js";

import _ from "lodash";

export const schema = gql`
  extend type Query {
    login(user: User!): LoginAcknowledgement
    getUsers(auth: ApiUser!): [AppUsers]
    createNewUser(user: NewUser!): CreationAcknowledgement
    verifyNewUserUri(key: String!): NewUserAcknowledgement
    deleteUser(username: String!): DeletionAcknowledgement
  }
  input NewUser {
    username: String!
    email: String!
    name: String!
    password: String!
  }
  input AuthKey {
    key: String!
  }
  input User {
    uid: String!
    password: String!
  }
  input ApiUser {
    uid: String!
    authKeyID: String!
  }
  type AppUsers {
    username: String
    roles: [String]
    full_name: String
    email: String
    enabled: String
  }
  type NewUserAcknowledgement {
    isValid: Boolean!
    email: String
  }
  type DeletionAcknowledgement {
    isDeleted: Boolean
  }
  type CreationAcknowledgement {
    created: Boolean
  }
  type LoginAcknowledgement {
    statusCode: String
    authKeyID: String
    role: [String]
  }
`;
const verifyUriKey = async key => await redis.get(key);
const deleteUser = async username => {
  var response = await authClient(
    process.env.ES_USER,
    process.env.ES_PASSWORD
  ).security.deleteUser({
    username: username,
    refresh: "wait_for"
  });
  return response.body;
};
const createNewUser = async user => {
  var response = await authClient(
    process.env.ES_USER,
    process.env.ES_PASSWORD
  ).security.putUser({
    username: user.username,
    refresh: "wait_for",
    body: {
      password: user.password,
      full_name: user.name,
      email: user.email,
      roles: ["dashboardViewer"]
    }
  });
  return response.body;
};
const getUsers = async auth => {
  const authKey = await redis.get(auth.uid + ":" + auth.authKeyID);
  const data = await client(authKey, auth.authKeyID).security.getUser({});
  var users =
    data.statusCode === 200
      ? Object.keys(data.body).map(name => {
          return { ...data.body[name] };
        })
      : [];
  return users;
};
const login = async user => {
  const result = await authClient(user.uid, user.password).security.getApiKey({
    username: user.uid
  });
  //wrong auth
  if (result.statusCode === 200) {
    //if keys invalidate
    var oldKey;
    var authorizedClient = authClient(user.uid, user.password);
    if (result.body.api_keys.length !== 0) {
      oldKey = await authorizedClient.security.invalidateApiKey({
        body: { name: "login-" + user.uid }
      });
    }
    if ((oldKey && oldKey.statusCode === 200) || oldKey === undefined) {
      const newKey = await authorizedClient.security.createApiKey({
        body: { name: "login-" + user.uid, expiration: "1d" }
      });
      const roleMapping = await authorizedClient.security.getUser({
        username: user.uid
      });

      //store in local sotrage to expire tomorrow
      redis.set(user.uid + ":" + newKey.body.id, newKey.body.api_key);
      redis.expireat(user.uid + ":" + newKey.body.id, oneDayExpiryDate());

      return {
        statusCode: newKey.statusCode,
        authKeyID: newKey.body ? newKey.body.id : null,
        role: roleMapping.body[user.uid].roles
      };
    } else {
      return { statusCode: oldKey.statusCode, authKeyID: null, role: [] };
    }
  }
};

export const resolvers = {
  Query: {
    login: async (_, { user }) => {
      return await login(user);
    },
    getUsers: async (_, { auth }) => {
      return await getUsers(auth);
    },
    createNewUser: async (_, { user }) => {
      return await createNewUser(user);
    },
    verifyNewUserUri: async (_, { key }) => {
      return await verifyUriKey(key);
    },
    deleteUser: async (_, { username }) => {
      return await deleteUser(username);
    }
  },
  AppUsers: {
    username: ({ username }) => username,
    roles: ({ roles }) => roles,
    full_name: ({ full_name }) => full_name,
    enabled: ({ enabled }) => enabled.toString(),
    email: ({ email }) => email
  },
  NewUserAcknowledgement: {
    isValid: root => (root ? true : false),
    email: root => root
  },
  DeletionAcknowledgement: {
    isDeleted: root => root.found
  },
  CreationAcknowledgement: { created: root => root.created },
  LoginAcknowledgement: {
    statusCode: root => root.statusCode,
    authKeyID: root => root.authKeyID,
    role: root => root.role
  }
};
