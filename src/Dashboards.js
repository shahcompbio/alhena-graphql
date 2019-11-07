import redis from "./api/redisClient.js";
const { gql } = require("apollo-server");
var crypto = require("crypto");

import client from "./api/client";
import authClient from "./api/authClient";

import { createSuperUserClient, getRedisApiKey } from "./utils.js";

import _ from "lodash";

export const schema = gql`
  extend type Query {
    getDashboards(auth: ApiUser!): [Dashboard]
    getAllDashboards(auth: ApiUser!): [Dashboard]
    getAllIndices: [Index!]
    getIndicesByDashboard(dashboard: String!): [Index]
    deleteDashboard(name: String!): DeleteAcknowledgment
    createNewDashboard(dashboard: DashboardInput!): CreationAcknowledgement
    updateDashboard(dashboard: DashboardInput!): UpdateAcknowledgement
  }
  type UpdateAcknowledgement {
    updated: Boolean!
  }
  type DeleteAcknowledgment {
    allDeleted: Boolean
  }
  input DashboardInput {
    name: String
    indices: [String!]
  }
  type Index {
    name: String
  }
  type Dashboard {
    name: String!
    count: Int!
  }
`;
var collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base"
});
const getAllDashboards = async client => {
  var response = await client.security.getRole({});
  return Object.keys(response.body)
    .filter(role => role.indexOf("_dashboardReader") !== -1)
    .map(role => {
      return {
        name: role.split("_")[0],
        count: response.body[role].indices[0].names.length - 1
      };
    });
};
const deleteDashboard = async name => {
  const client = createSuperUserClient();

  const deleteRoleResponse = await client.security.deleteRole({
    name: name + "_dashboardReader",
    refresh: "wait_for"
  });
  return deleteRoleResponse;
};
const updateDashboard = async (name, indices) => {
  const deleteResponse = await deleteDashboard(name);
  const created = await createDashboard(name, indices);
  return created;
};
const getUserRoles = async username => {
  var response = await authClient(
    process.env.ES_USER,
    process.env.ES_PASSWORD
  ).security.getUser({ username: username });
  return response.body[username].roles;
};

const getIndicesByDashboard = async name => {
  const client = createSuperUserClient();
  const roleName = name + "_dashboardReader";
  var analyses = await client.security.getRole({
    name: roleName
  });
  return analyses.body[roleName].indices[0].names.filter(
    hit => hit !== "analyses"
  );
};
const createDashboard = async (name, indices) => {
  const client = createSuperUserClient();

  const dashboardRoles = await client.security.putRole({
    name: name + "_dashboardReader",
    body: {
      indices: [
        {
          names: ["analyses", ...indices],
          privileges: ["read"]
        }
      ]
    }
  });
  return dashboardRoles.body.role;
};

const getIndices = async () => {
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
const getApiId = async uid => {
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
  Dashboard: {
    name: root => root.name,
    count: root => root.count
  },
  Index: {
    name: root => root
  },
  DeleteAcknowledgment: {
    allDeleted: root => root.deleted === root.total
  },
  UpdateAcknowledgement: {
    updated: root => (root.created === false ? true : false)
  },
  Query: {
    async updateDashboard(_, { dashboard }) {
      return await updateDashboard(dashboard.name, dashboard.indices);
    },
    async deleteDashboard(_, { name }) {
      return await deleteDashboard(name);
    },
    async createNewDashboard(_, { dashboard }) {
      return await createDashboard(dashboard.name, dashboard.indices);
    },
    async getAllIndices() {
      return await getIndices();
    },
    async getAllDashboards(_, { auth }) {
      const authKey = await getRedisApiKey(auth);
      const apiClient = client(authKey, auth.authKeyID);
      return await getAllDashboards(apiClient);
    },
    async getIndicesByDashboard(_, { dashboard }) {
      return await getIndicesByDashboard(dashboard);
    },
    async getDashboards(_, { auth }) {
      const authKey = await getRedisApiKey(auth);
      const apiClient = client(authKey, auth.authKeyID);

      const allDashboards = await getAllDashboards(apiClient);

      const authorizedDashboards = await getUserRoles(auth.uid);
      const authorizedDashboardsMapping = await authorizedDashboards.reduce(
        (final, dashboard) => {
          final[dashboard.split("_")[0]] = true;
          return final;
        },
        {}
      );
      const userAllowedPorjects = allDashboards.filter(dashboard =>
        authorizedDashboardsMapping.hasOwnProperty(dashboard.key)
      );
      return userAllowedPorjects;
    }
  }
};
