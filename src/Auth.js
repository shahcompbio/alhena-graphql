import redis from "./api/redisClient.js";
const { gql, AuthenticationError } = require("apollo-server");

import authClient from "./api/authClient";
import client from "./api/client";

import { superUserRoles } from "./api/utils/config.js";
import { createSuperUserClient, getRedisApiKey } from "./utils.js";

import _ from "lodash";

export const schema = gql`
  extend type Query {
    login(user: User!): LoginAcknowledgement
    getUsers(auth: ApiUser!): [AppUsers]
    createNewUser(user: NewUser!): CreationAcknowledgement
    verifyNewUserUri(key: String!): NewUserAcknowledgement
    updateUserRoles(
      newRoles: [String!]
      username: String!
      email: String!
      name: String!
    ): CreationAcknowledgement
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
  var roles = await redis.get("roles_" + user.email);

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
      roles: [...roles.split(",")]
    }
  });

  return response.body;
};
const getUsers = async auth => {
  const authKey = await redis.get(auth.uid + ":" + auth.authKeyID);
  const data = await client(authKey, auth.authKeyID).security.getUser({});
  var users =
    data.statusCode === 200
      ? Object.keys(data.body)
          .filter(
            name => !superUserRoles.hasOwnProperty(data.body[name].roles[0])
          )
          .map(name => {
            return { ...data.body[name] };
          })
          .map(user => {
            user["roles"] = user.roles.map(role => role.split("_")[0]);
            return user;
          })
      : [];
  return users;
};
const login = async user => {
  /*  const isPasswordCorrect = await authClient(user.uid, user.password).search(
    {
      index: "analyses"
    },
    function(error) {
      console.log(error);
    }
  );*/
  //console.log(isPasswordCorrect);
  const client = authClient(process.env.ES_USER, process.env.ES_PASSWORD);

  const result = await client.security.getApiKey({
    username: user.uid
  });
  //wrong auth
  if (result.statusCode === 200) {
    //if keys invalidate
    var oldKey;
    if (result.body.api_keys.length !== 0) {
      oldKey = await client.security.invalidateApiKey({
        body: { name: "login-" + user.uid }
      });
    }
    if ((oldKey && oldKey.statusCode === 200) || oldKey === undefined) {
      const newKey = await client.security.createApiKey({
        body: { name: "login-" + user.uid, expiration: "1d" }
      });
      const roleMapping = await client.security.getUser({
        username: user.uid
      });

      //store in local sotrage to expire tomorrow
      redis.set(user.uid + ":" + newKey.body.id, newKey.body.api_key);

      redis.expireat(
        user.uid + ":" + newKey.body.id,
        parseInt(+new Date() / 1000) + 86400
      );

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
const updateRoles = async (newRoles, username, email, name) => {
  var response = await authClient(
    process.env.ES_USER,
    process.env.ES_PASSWORD
  ).security.putUser({
    username: username,
    refresh: "wait_for",
    body: {
      email: email,
      full_name: name,
      roles: [
        ...newRoles.map(role =>
          role.indexOf("_dashboardReader") === -1
            ? role + "_dashboardReader"
            : role
        )
      ]
    }
  });
  return response.body;
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
    },
    updateUserRoles: async (_, { newRoles, username, email, name }) => {
      return await updateRoles(newRoles, username, email, name);
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
