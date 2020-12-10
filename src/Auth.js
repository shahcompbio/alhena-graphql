import redis from "./api/redisClient.js";
const { gql, AuthenticationError } = require("apollo-server");

import authClient from "./api/authClient";
import client from "./api/client";

import generateSecurePathHash from "./api/utils/crypto.js";

import { superUserRoles } from "./api/utils/config.js";
import { createSuperUserClient, getRedisApiKey } from "./utils.js";

import _ from "lodash";

export const schema = gql`
  extend type Query {
    login(user: User!): LoginAcknowledgement
    logout(username: String!): Acknowledgement
    getUsers(auth: ApiUser!): [AppUsers]
    createNewUser(user: NewUser!): CreationAcknowledgement
    verifyNewUserUri(key: String!): NewUserAcknowledgement
    verifyPasswordResetUri(key: String!): NewUserAcknowledgement
    updateUserRoles(
      newRoles: [String!]
      username: String!
      email: String!
      name: String!
    ): CreationAcknowledgement
    doesUserExist(username: String!, email: String!): Confirmation
    deleteUser(username: String!): DeletionAcknowledgement
    allowResetPassword(username: String!): ConfirmationHashLink
    changePassword(username: String!, newPassword: String!): Acknowledgement
    newUserLink(newUser: NewUserLink!): NewUserLinkResponse
  }
  input NewUserLink {
    email: String!
    name: String!
    roles: String!
  }
  type NewUserLinkResponse {
    newUserLink: String
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
  type Confirmation {
    confirmed: Boolean
  }
  type ConfirmationHashLink {
    hashLink: String
  }
  type Acknowledgement {
    confirmed: Boolean
  }
  type NewUserAcknowledgement {
    isValid: Boolean!
    email: String
    username: String
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

const verifyUriKey = async (key) => await redis.get(key);

const checkUserExistance = async (username, email) => {
  const client = createSuperUserClient();
  const retrievedUser = await client.security.getUser(
    {
      username: username,
    },
    { ignore: [404] }
  );

  return retrievedUser.statusCode === 404
    ? false
    : retrievedUser["body"][username]["email"] === email;
};
const allowResetPassword = async (username) => {
  const redisSecretHash =
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15);
  await redis.set(redisSecretHash, username);
  await redis.expireat(redisSecretHash, parseInt(+new Date() / 1000) + 86400);
  return (
    "https://" + process.env.SERVER_NAME + "/resetPassword/" + redisSecretHash
  );
};
const updatePassword = async (username, newPassword) => {
  const client = createSuperUserClient();

  var response = await client.security.changePassword({
    username: username,
    refresh: "wait_for",
    body: {
      password: newPassword,
    },
  });
  return response.statusCode;
};

const deleteUser = async (username) => {
  const client = createSuperUserClient();

  var response = await client.security.deleteUser({
    username: username,
    refresh: "wait_for",
  });
  return response.body;
};

const createNewUser = async (user) => {
  var roles = await redis.get("roles_" + user.email);
  if (roles === null) {
    return false;
  } else {
    const client = createSuperUserClient();

    var response = await client.security.putUser({
      username: user.username,
      refresh: "wait_for",
      body: {
        password: user.password,
        full_name: user.name,
        email: user.email,
        roles: [...roles.split(",").map((role) => role + "_dashboardReader")],
      },
    });

    return response.body;
  }
};
const getUsers = async (auth) => {
  const authKey = await redis.get(auth.uid + ":" + auth.authKeyID);
  const data = await client(authKey, auth.authKeyID).security.getUser({});
  var users =
    data.statusCode === 200
      ? Object.keys(data.body)
          .filter(
            (name) => !superUserRoles.hasOwnProperty(data.body[name].roles[0])
          )
          .map((name) => {
            return { ...data.body[name] };
          })
          .map((user) => {
            user["roles"] = user.roles.map((role) => role.split("_")[0]);
            return user;
          })
      : [];
  return users;
};
const incompleteLogin = (statusCode) => {
  return { statusCode: statusCode, authKeyID: null, role: [] };
};

const logout = async (username) => {
  const client = createSuperUserClient();

  const oldKey = await client.security.invalidateApiKey({
    body: { name: "login-" + username },
  });

  return oldKey && oldKey.statusCode === 200;
};

const login = async (user) => {
  const isPasswordCorrect = await authClient(user.uid, user.password).search({
    index: "analyses",
    size: 1,
  });
  if (isPasswordCorrect.statusCode === 200) {
    const client = createSuperUserClient();
    const result = await client.security.getApiKey({
      name: "login-" + user.uid,
    });

    if (result.statusCode === 200) {
      //if keys invalidate
      var oldKey;
      if (result.body.api_keys.length !== 0) {
        oldKey = await client.security.invalidateApiKey({
          body: { name: "login-" + user.uid },
        });
      }

      if ((oldKey && oldKey.statusCode === 200) || oldKey === undefined) {
        const newKey = await client.security.createApiKey({
          body: {
            name: "login-" + user.uid,
            expiration: "1d",
          },
          refresh: "wait_for",
        });

        if (newKey.statusCode === 200) {
          const roleMapping = await client.security.getUser({
            username: user.uid,
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
            role: roleMapping.body[user.uid].roles,
          };
        } else {
          return incompleteLogin(newKey.statusCode);
        }
      } else {
        return incompleteLogin(newKey.statusCode);
      }
    }
  } else {
    return incompleteLogin(isPasswordCorrect.statusCode);
  }
};
const generateNewUserLink = async (newUser) => {
  // var homePath = process.env.SERVER_NAME
  //   ? "https://" +
  //     process.env.SERVER_NAME +
  //     "/" +
  //     process.env.REACT_APP_BASENAME +
  //     "/NewAccount"
  //   : "http://localhost:3001/NewAccount";

  const redisSecretHash =
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15);

  // const finalUrl = homePath + "/" + redisSecretHash;

  await redis.set(redisSecretHash, newUser.email);
  await redis.expireat(redisSecretHash, parseInt(+new Date() / 1000) + 86400);

  //store user roles

  await redis.set("roles_" + newUser.email, newUser.roles);
  await redis.expireat(
    "roles_" + newUser.email,
    parseInt(+new Date() / 1000) + 86400
  );

  return redisSecretHash;
};
const updateRoles = async (newRoles, username, email, name) => {
  const client = createSuperUserClient();

  var response = await client.security.putUser({
    username: username,
    refresh: "wait_for",
    body: {
      email: email,
      full_name: name,
      roles: [
        ...newRoles.map((role) =>
          role.indexOf("_dashboardReader") === -1
            ? role + "_dashboardReader"
            : role
        ),
      ],
    },
  });
  return response.body;
};
export const resolvers = {
  Query: {
    allowResetPassword: async (_, { username }) => {
      return await allowResetPassword(username);
    },
    changePassword: async (_, { username, newPassword }) => {
      return await updatePassword(username, newPassword);
    },
    createNewUser: async (_, { user }) => {
      return await createNewUser(user);
    },
    deleteUser: async (_, { username }) => {
      return await deleteUser(username);
    },
    doesUserExist: async (_, { username, email }) => {
      return await checkUserExistance(username, email);
    },
    getUsers: async (_, { auth }) => {
      return await getUsers(auth);
    },
    login: async (_, { user }) => {
      return await login(user);
    },
    logout: async (_, { username }) => {
      return await logout(username);
    },
    newUserLink: async (_, { newUser }) => {
      return generateNewUserLink(newUser);
    },
    verifyPasswordResetUri: async (_, { key }) => {
      const username = await verifyUriKey(key);
      return { username: username };
    },
    verifyNewUserUri: async (_, { key }) => {
      const email = await verifyUriKey(key);
      return { email: email };
    },
    updateUserRoles: async (_, { newRoles, username, email, name }) => {
      return await updateRoles(newRoles, username, email, name);
    },
  },
  AppUsers: {
    username: ({ username }) => username,
    roles: ({ roles }) => roles,
    full_name: ({ full_name }) => full_name,
    enabled: ({ enabled }) => enabled.toString(),
    email: ({ email }) => email,
  },
  Confirmation: {
    confirmed: (root) => root,
  },
  ConfirmationHashLink: {
    hashLink: (root) => root,
  },
  Acknowledgement: {
    confirmed: (root) => root,
  },
  NewUserLinkResponse: {
    newUserLink: (root) => root,
  },
  NewUserAcknowledgement: {
    isValid: (root) => (root.email || root.username ? true : false),
    email: (root) => root.email,
    username: (root) => root.username,
  },
  DeletionAcknowledgement: {
    isDeleted: (root) => root.found,
  },
  CreationAcknowledgement: { created: (root) => root.created },
  LoginAcknowledgement: {
    statusCode: (root) => root.statusCode,
    authKeyID: (root) => root.authKeyID,
    role: (root) => root.role,
  },
};
