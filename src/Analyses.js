import redis from "./api/redisClient.js";

const { gql } = require("apollo-server");

import client from "./api/client";

import bodybuilder from "bodybuilder";
import _ from "lodash";

import { createSuperUserClient } from "./utils.js";
import { getApiId, getIndicesByDashboard } from "./Dashboards";

const FIELD_HIERARCHY = ["project", "sample_id", "library_id", "jira_id"];
const FIELD_NAMES = {
  project: "Project",
  sample_id: "Sample ID",
  library_id: "Library ID",
  jira_id: "Jira ID"
};

export const schema = gql`
  extend type Query {
    analyses(filters: [Term]!, auth: ApiUser!, dashboardName: String!): Analyses
  }
  input Term {
    label: String!
    value: String!
  }
  type Analyses {
    analysesStats: [Stat!]!
    analysesList: [AnalysisGroup!]
    analysesTree: AnalysesTree
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

const getAnalyses = async (filters, auth, dashboardName) => {
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

  const allowedIndices = await getIndicesByDashboard(dashboardName);
  const allowedIndicesObj = allowedIndices.reduce((final, index) => {
    final[index] = true;
    return final;
  }, {});

  const allowedAnalyses = data["body"]["hits"]["hits"]
    .map(hit => hit["_source"])
    .filter(analysis => allowedIndicesObj.hasOwnProperty(analysis.jira_id))
    .map(analysis => {
      analysis["project"] = dashboardName;
      return analysis;
    });
  const labelsObj = {
    project: dashboardName,
    sample_id: "Samples",
    library_id: "Libraries",
    jira_id: "Jira ID"
  };
  return [...allowedAnalyses, labelsObj];
};

const getUniqueValuesInKey = (list, key) =>
  list
    .map(element => element[key])
    .reduce(
      (uniques, value) =>
        uniques.indexOf(value) === -1 ? [...uniques, value] : uniques,
      []
    );

export const resolvers = {
  Analyses: {
    analysesStats: root => root.stats,
    analysesList: root => root.list,
    analysesTree: root => root.tree
  },
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
    analyses: async (_, { filters, auth, dashboardName }) => {
      const data = await getAnalyses(filters, auth, dashboardName);

      const counts = FIELD_HIERARCHY.map(field => {
        const values = getUniqueValuesInKey(data, field);

        return {
          label: FIELD_NAMES[field],
          value: values.length,
          type: field,
          values: values
        };
      });

      return {
        tree: data,
        list: counts,
        stats: counts
      };
    }
  }
};
