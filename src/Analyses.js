import redis from "./api/redisClient.js";

const { gql } = require("apollo-server");

import client from "./api/client";

import bodybuilder from "bodybuilder";
import _ from "lodash";

import cacheConfig from "./api/cacheConfigs.js";
import { createSuperUserClient } from "./utils.js";
import { getApiId, getIndicesByDashboard } from "./Dashboards";

const FIELD_HIERARCHY = ["project", "sample_id", "library_id", "dashboard_id"];
const FIELD_NAMES = {
  project: "Project",
  sample_id: "Sample ID",
  library_id: "Library",
  dashboard_id: "Dashboard ID"
};

export const schema = gql`
  extend type Query {
    analyses(filters: [Term]!, auth: ApiUser!, dashboardName: String!): Analyses
    analysisMetadata(analysis: String!): AnalysisRow
  }
  input Term {
    label: String!
    value: String!
  }

  type Analyses {
    error: Boolean
    defaultProjectView: Int!
    analysesStats: [Stat!]!
    analysesList: [AnalysisGroup!]
    analysesTree: AnalysesTree
    analysesRows: [AnalysisRow]
  }

  type AnalysisRow {
    project: String
    sample_id: String!
    library_id: String!
    dashboard_id: String!
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
  //set last selected project for user
  await redis.set(cacheConfig["lastSelectedProject"] + auth.uid, dashboardName);
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
  const data = await client(authKey, auth.authKeyID).search(
    {
      index: "analyses",
      body: query
    },
    {
      ignore: [401]
    }
  );
  if (data["body"].hasOwnProperty("error")) {
    return null;
  } else {
    const allowedIndices = await getIndicesByDashboard(dashboardName);
    const allowedIndicesObj = allowedIndices.reduce((final, index) => {
      final[index] = true;
      return final;
    }, {});

    const allowedAnalyses = data["body"]["hits"]["hits"]
      .map(hit => hit["_source"])
      .filter(analysis =>
        allowedIndicesObj.hasOwnProperty(analysis.dashboard_id)
      )
      .map(analysis => {
        analysis["project"] = dashboardName;
        return analysis;
      });

    return [...allowedAnalyses];
  }
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
    error: root => root.error,
    defaultProjectView: root => root.defaultProjectView,
    analysesStats: root => root.stats,
    analysesList: root => root.list,
    analysesTree: root => root.tree,
    analysesRows: root => root.tree
  },

  ParentType: {
    source: root => root.source,
    children: root => filterChildren(root, root.hierarchyLevel)
  },
  ChildType: {
    source: root => root.source,
    value: () => 1
  },
  AnalysisRow: {
    project: root => root.project,
    sample_id: root => root.sample_id,
    library_id: root => root.library_id,
    dashboard_id: root => root.dashboard_id
  },
  AnalysesTree: {
    source: () => null,
    children: root => filterChildren({ filtered: [...root] }, 0)
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
    analysisMetadata: async (_, { analysis }) => {
      const baseQuery = bodybuilder().size(10000);

      const client = createSuperUserClient();

      const data = await client.search(
        {
          index: "analyses",
          body: baseQuery.build()
        },
        {
          ignore: [401]
        }
      );
      const source = data["body"]["hits"]["hits"].map(hit => hit["_source"]);
      return source.filter(hit => hit["dashboard_id"] === analysis)[0];
    },
    analyses: async (_, { filters, auth, dashboardName }) => {
      const data = await getAnalyses(filters, auth, dashboardName);
      if (data) {
        const defaultProjectView = await redis.get(
          cacheConfig["isSpiderSelectionDefault"] + auth.uid
        );
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
          error: false,
          defaultProjectView:
            defaultProjectView !== null ? defaultProjectView : 0,
          tree: data,
          list: counts,
          stats: counts
        };
      } else {
        return {
          error: true,
          defaultProjectView: 0,
          tree: [],
          list: [],
          stats: []
        };
      }
    }
  }
};
