import redis from "./api/redisClient.js";
const { gql } = require("apollo-server");
var crypto = require("crypto");

import client from "./api/client";
import authClient from "./api/authClient";
import bodybuilder from "bodybuilder";

import { createSuperUserClient, getRedisApiKey } from "./utils.js";
import cacheConfig from "./api/cacheConfigs.js";
import { defaultDashboardColumns } from "./config.js";

import _ from "lodash";

export const schema = gql`
  extend type Query {
    getDashboardsByUser(auth: ApiUser!): UserDashboard

    getAllSettings: [DashboardColumns!]
    getAvailableDashboardColumns: [DashboardColumns!]
    setDashboardColumnsByDashboard(
      dashboard: String!
      columns: [String!]
    ): CreationAcknowledgement
    getDashboardColumnsByDashboard(dashboard: String!): [DashboardColumns!]
    updateDashboardColumns(
      columns: [DashboardColumnsInput]
    ): UpdateAcknowledgement

    getAllDashboards(auth: ApiUser!): [Dashboard]
    getAllIndices: [Index!]
    getIndicesByDashboard(dashboard: String!): [Index]

    deleteDashboardByName(name: String!): DeleteAcknowledgment
    createNewDashboard(dashboard: DashboardInput!): CreationAcknowledgement
    updateDashboardByName(dashboard: DashboardInput!): UpdateAcknowledgement

    getDashboardUsers(name: String!): [AppUsers]
    getAllUsers: [AppUsers]
  }
  type UpdateAcknowledgement {
    updated: Boolean!
  }
  type DeleteAcknowledgment {
    allDeleted: Boolean
  }
  input DashboardColumnsInput {
    id: String
    name: String
  }
  input DashboardInput {
    name: String!
    indices: [String!]
    columns: [String!]
    users: [String!]
    deletedUsers: [String]
  }
  type Index {
    name: String
  }

  type Dashboard {
    name: String!
    count: Int
  }
  type DashboardColumns {
    type: String
    label: String
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
export const getAllSettings = async () => {
  const baseQuery = bodybuilder().size(1000);

  const client = createSuperUserClient();

  const data = await client.search(
    {
      index: "metadata_labels",
      body: baseQuery.build()
    },
    {
      ignore: [401]
    }
  );
  return data["body"]["hits"]["hits"].map(d => ({
    type: d["_source"]["id"],
    label: d["_source"]["name"]
  }));
};
const getAvailableDashboardColumns = async () => {
  return await getAllSettings();
};
export const getDashboardColumnsByDashboard = async name => {
  const columns = await redis.get(cacheConfig["dahboardColumns"] + name);
  if (columns === null) {
    return defaultDashboardColumns;
  } else {
    const allFields = await getAllSettings();
    const columnConstants = allFields.reduce((final, column) => {
      final[column["type"]] = column["label"];
      return final;
    }, {});
    //jira /dashboard id artifact
    const colSplit = columns.split(",");

    const jiraIndex = colSplit.indexOf("jira_id");
    const columnList =
      jiraIndex !== -1 && colSplit.indexOf("dashboard_id") === -1
        ? [...colSplit.filter((d, i) => i !== jiraIndex), "dashboard_id"]
        : colSplit;
    return columnList.map(column => ({
      type: column,
      label: columnConstants[column]
    }));
  }
};
const setDashboardColumns = async (name, selectedDashboardColumns) => {
  const join = selectedDashboardColumns.join(",");
  const red = await redis.set(cacheConfig["dahboardColumns"] + name, join);
  return true;
};
const getAllDashboards = async client => {
  var response = await client.security.getRole({});

  return Object.keys(response.body)
    .filter(role => role.indexOf(cacheConfig["dashboardRoles"]) !== -1)
    .map(role => {
      return {
        name: role.split("_")[0],
        count: response.body[role].indices[0].names.length - 1
      };
    });
};
const getAllUsers = async () => {
  const client = createSuperUserClient();
  const superUsers = [
    "elastic",
    "kibana",
    "logstash_system",
    "beats_system",
    "apm_system",
    "remote_monitoring_user",
    "kibana_system"
  ];

  const allUsers = await client.security.getUser({});
  return Object.keys(allUsers.body).reduce((final, user) => {
    if (superUsers.indexOf(user) === -1) {
      final = [...final, allUsers.body[user]];
    }

    return final;
  }, []);
};
const getAllDashboardUsers = async name => {
  const client = createSuperUserClient();

  const allUsers = await client.security.getUser({});

  return Object.keys(allUsers.body).reduce((final, user) => {
    const userObj = allUsers.body[user];
    if (userObj["full_name"] !== null) {
      if (userObj.roles.indexOf(name + cacheConfig["dashboardRoles"]) != -1) {
        final = [...final, allUsers.body[user]];
      }
    }
    return final;
  }, []);
};

const deleteDashboard = async name => {
  const client = createSuperUserClient();
  const allUsersLastProjKeys = await redis.keys(
    cacheConfig["lastSelectedProject"] + "*"
  );
  const allUsersLastProj = await redis.mget(allUsersLastProjKeys);
  const projIndices = allUsersLastProj.reduce((final, curr, index) => {
    if (curr === name) {
      final = [...final, index];
    }
    return final;
  }, []);

  if (projIndices.length > 0) {
    projIndices.map(index => {
      redis.del(allUsersLastProjKeys[index]);
    });
  }
  await deletedUsersFromDashboard(name);
  const deleteRoleResponse = await client.security.deleteRole({
    name: name + cacheConfig["dashboardRoles"],
    refresh: "wait_for"
  });

  return deleteRoleResponse;
};
const updateDashboard = async (name, indices, columns, users, deletedUsers) => {
  const client = createSuperUserClient();

  const created = await createDashboard(
    name,
    indices,
    columns,
    users,
    deletedUsers
  );
  //es docs say on update response is false
  return { created: created["created"] === false };
};

const getUserRoles = async username => {
  const client = createSuperUserClient();
  var response = await client.security.getUser({ username: username });
  return response.body[username].roles;
};

export const getIndicesByDashboard = async name => {
  const client = createSuperUserClient();
  const roleName = name + cacheConfig["dashboardRoles"];

  var analyses = await client.security.getRole({
    name: roleName
  });

  return analyses.body[roleName].indices[0].names.filter(
    hit => hit !== "analyses"
  );
};
const createDashboard = async (name, indices, columns, users, deletedUsers) => {
  const client = createSuperUserClient();
  //columns
  const news = await setDashboardColumns(name, columns);
  //users
  const usersResponse = await appendUsersToDashboard(name, users, deletedUsers);

  //roles
  const dashboardRoles = await client.security.putRole({
    name: name + cacheConfig["dashboardRoles"],
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
const deletedUsersFromDashboard = async name => {
  const client = createSuperUserClient();
  var userContent = await client.security.getUser({});

  const newUserObj = Object.keys(userContent["body"]).reduce((final, user) => {
    var userObj = userContent["body"][user];
    //if the user has this dashboard delete
    if (userObj["roles"].indexOf(name + cacheConfig["dashboardRoles"]) !== -1) {
      userObj["roles"] = userObj["roles"].filter(
        role => role !== name + cacheConfig["dashboardRoles"]
      );
    }
    final[user] = userObj;
    return final;
  }, {});

  //update users
  Object.keys(newUserObj).map(async user => {
    var userResponses = await client.security.putUser({
      username: user,
      refresh: "wait_for",
      body: { ...newUserObj[user] }
    });
  });
  return;
};
const appendUsersToDashboard = async (name, users, deletedUsers) => {
  const client = createSuperUserClient();
  const allUsers =
    deletedUsers.length === 0 ? [...users] : [...users, ...deletedUsers];

  var userContent = await client.security.getUser({
    username: [...allUsers]
  });

  const newUserObj = Object.keys(userContent["body"]).reduce((final, user) => {
    var userObj = userContent["body"][user];
    if (deletedUsers.indexOf(user) !== -1) {
      userObj["roles"] = userObj["roles"].filter(
        role => role !== name + cacheConfig["dashboardRoles"]
      );
    } else {
      userObj["roles"] =
        userObj["roles"].indexOf(name + cacheConfig["dashboardRoles"]) === -1
          ? [...userObj["roles"], name + cacheConfig["dashboardRoles"]]
          : [...userObj["roles"]];
    }
    final[user] = userObj;
    return final;
  }, {});

  Object.keys(newUserObj).map(async user => {
    var userResponses = await client.security.putUser({
      username: user,
      refresh: "wait_for",
      body: { ...newUserObj[user] }
    });
  });
  return;
};
const getIndices = async () => {
  const client = createSuperUserClient();

  var response = await client.search({
    index: "analyses",
    size: 5000
  });

  const indexNames = response.body.hits.hits.map(hit =>
    hit._source.dashboard_id ? hit._source.dashboard_id : hit._source.jira_id
  );
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
const updateDashboardColumns = async columns => {
  const client = createSuperUserClient();
  const body = columns.flatMap(doc => [
    { index: { _index: "metadata_labels", _type: "_doc", _id: doc["id"] } },
    { ...doc }
  ]);
  const { body: bulkResponse } = await client.bulk({
    refresh: true,
    body: body
  });

  if (bulkResponse.errors) {
    const erroredDocuments = [];
    bulkResponse.items.forEach((action, i) => {
      const operation = Object.keys(action)[0];
      if (action[operation].error) {
        erroredDocuments.push({
          // If the status is 429 it means that you can retry the document,
          // otherwise it's very likely a mapping error, and you should
          // fix the document before to try it again.
          status: action[operation].status,
          error: action[operation].error,
          operation: body[i * 2],
          document: body[i * 2 + 1]
        });
      }
    });
    return { created: false };
  } else {
    return { created: true };
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
  DashboardColumns: {
    type: root => root.type,
    label: root => root.label
  },
  Query: {
    async getAllSettings() {
      return await getAllSettings();
    },
    async getAllUsers() {
      return await getAllUsers();
    },
    async getDashboardUsers(_, { name }) {
      return await getAllDashboardUsers(name);
    },
    async updateDashboardColumns(_, { columns }) {
      return await updateDashboardColumns(columns);
    },
    async updateDashboardByName(_, { dashboard }) {
      return await updateDashboard(
        dashboard.name,
        dashboard.indices,
        dashboard.columns,
        dashboard.users,
        dashboard.deletedUsers
      );
    },
    async deleteDashboardByName(_, { name }) {
      return await deleteDashboard(name);
    },
    async createNewDashboard(_, { dashboard }) {
      return await createDashboard(
        dashboard.name,
        dashboard.indices,
        dashboard.columns,
        dashboard.users,
        []
      );
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
    async getDashboardColumnsByDashboard(_, { dashboard }) {
      return await getDashboardColumnsByDashboard(dashboard);
    },
    async setDashboardColumnsByDashboard(_, { dashboard, columns }) {
      return await setDashboardColumns(dashboard, columns);
    },
    async getAvailableDashboardColumns() {
      return await getAvailableDashboardColumns();
    },
    async getDashboardsByUser(_, { auth }) {
      const authorizedDashboards = await getUserRoles(auth.uid);
      var lastSelectedDashboard = await getKey(
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
