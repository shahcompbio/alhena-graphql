import redis from "./api/redisClient.js";

const { gql } = require("apollo-server");

import client from "./api/client";

import bodybuilder from "bodybuilder";
import _ from "lodash";

import { getApiId } from "./Dashboards";

const FIELD_HIERARCHY = ["project", "sample_id", "library_id", "jira_id"];
const FIELD_NAMES = {
  project: "Project",
  sample_id: "Sample ID",
  library_id: "Library ID",
  jira_id: "Jira ID"
};

export const schema = gql`
  extend type Query {
    analysesTree(filters: [Term]!, auth: ApiUser!): AnalysesTree
    analysesList(filters: [Term]!, auth: ApiUser!): [AnalysisGroup!]
    analysesStats(filters: [Term]!, auth: ApiUser!): [Stat!]!
  }
  input Term {
    label: String!
    value: String!
  }

  type AnalysesTree {
    source: String
    children: [ParentType!]
  }
  interface NodeType {
    target: String!
  }
  type ParentType implements NodeType {
    source: String
    target: String!
    children: [NodeType!]
  }
  type ChildType implements NodeType {
    source: String
    target: String!
    value: Int!
  }

  type AnalysisGroup {
    label: String!
    type: String!
    values: [String!]
  }

  type Stat {
    label: String!
    value: Int!
  }
`;

const filterChildren = (root, hierarchyLevel) => {
  const uniqueRoot = _.uniq(
    root.filtered.map(analysis => analysis[FIELD_HIERARCHY[hierarchyLevel]])
  );

  const mappedRoot = uniqueRoot.map(field => ({
    target: field,
    source: root.filtered[0][FIELD_HIERARCHY[hierarchyLevel - 1]],
    hierarchyLevel: hierarchyLevel + 1,
    filtered: root.filtered.filter(
      analysis =>
        analysis[FIELD_HIERARCHY[hierarchyLevel]].localeCompare(field) === 0
    )
  }));

  return mappedRoot;
};

async function getAnalyses(filters, auth) {
  const baseQuery = bodybuilder().size(10000);

  const query =
    filters === []
      ? baseQuery.build()
      : filters
          .reduce(
            (query, filter) =>
              query.filter("term", filter["label"], filter["value"]),
            baseQuery
          )
          .build();

  const authKey = await redis.get(auth.uid + ":" + auth.authKeyID);

  const data = await client(authKey, auth.authKeyID).search({
    index: "analyses",
    body: query
  });
  return data["body"]["hits"]["hits"].map(hit => hit["_source"]);
}

const getUniqueValuesInKey = (list, key) =>
  list
    .map(element => element[key])
    .reduce(
      (uniques, value) =>
        uniques.indexOf(value) === -1 ? [...uniques, value] : uniques,
      []
    );

export const resolvers = {
  NodeType: {
    target: root => root.target,
    __resolveType(event, context, info) {
      if (event.hierarchyLevel === FIELD_HIERARCHY.length) {
        return "ChildType";
      } else {
        return "ParentType";
      }
    }
  },
  ParentType: {
    source: root => root.source,
    children: root => filterChildren(root, root.hierarchyLevel)
  },
  ChildType: {
    source: root => root.source,
    value: () => 1
  },
  AnalysesTree: {
    source: () => null,
    children: root => filterChildren({ filtered: [...root] }, 0)
  },

  AnalysisGroup: {
    label: root => root.label,
    type: root => root.type,
    values: root => root.values
  },
  Stat: {
    label: root => root.label,
    value: root => root.value
  },
  Query: {
    analysesTree: async (_, { filters, auth }) => {
      const data = await getAnalyses(filters, auth);
      return data;
    },

    analysesList: async (_, { filters, auth }) => {
      const data = await getAnalyses(filters, auth);

      const uniqueValuesInHierarchy = FIELD_HIERARCHY.map(field => {
        const values = getUniqueValuesInKey(data, field);

        return {
          label: FIELD_NAMES[field],
          type: field,
          values: values
        };
      });

      return uniqueValuesInHierarchy;
    },

    analysesStats: async (_, { filters, auth }) => {
      const data = await getAnalyses(filters, auth);

      // Return count of each thing in the hierarchy

      const counts = FIELD_HIERARCHY.map(field => {
        const values = getUniqueValuesInKey(data, field);

        return {
          label: FIELD_NAMES[field],
          value: values.length
        };
      });

      return counts;
    }
  }
};
