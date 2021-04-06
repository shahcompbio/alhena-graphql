import redis from "./api/redisClient.js";
const { gql } = require("apollo-server");
var crypto = require("crypto");

import client from "./api/client";
import authClient from "./api/authClient";

import { createSuperUserClient, getRedisApiKey } from "./utils.js";
import cacheConfig from "./api/cacheConfigs.js";

import _ from "lodash";

export const schema = gql`
  extend type Query {
    getDashboardsByUser(auth: ApiUser!): UserDashboard
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
    count: Int
  }
  type UserDashboard {
    dashboards: [Dashboard]!
    defaultDashboard: String
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
  const client = createSuperUserClient();
  var response = await client.security.getUser({ username: username });
  return response.body[username].roles;
};

export const getIndicesByDashboard = async name => {
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
  const client = createSuperUserClient();

  var response = await client.search({
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

const getKey = async key => await redis.get(key);

export const resolvers = {
  UserDashboard: {
    dashboards: root => root.dashboards,
    defaultDashboard: root => root.defaultDashboard
  },
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
    updated: root => root.created
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
    async getDashboardsByUser(_, { auth }) {
      const authorizedDashboards = await getUserRoles(auth.uid);
      const lastSelectedDashboard = await getKey(
        cacheConfig["lastSelectedProject"] + auth.uid
      );
      if (authorizedDashboards[0] === "superuser") {
        const client = createSuperUserClient();
        const allDashboards = await getAllDashboards(client);
        return {
          defaultDashboard: lastSelectedDashboard
            ? lastSelectedDashboard
            : allDashboards[0]["name"],
          dashboards: allDashboards.map(dashboard => ({
            name: dashboard["name"]
          }))
        };
      }
      return {
        defaultDashboard: lastSelectedDashboard
          ? lastSelectedDashboard
          : authorizedDashboards[0].split("_")[0],
        dashboards: authorizedDashboards.reduce((final, dashboardName) => {
          return [
            ...final,
            {
              name: dashboardName.split("_")[0]
            }
          ];
        }, [])
      };
    }
  }
};
