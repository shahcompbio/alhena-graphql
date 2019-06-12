const { gql } = require("apollo-server");

import client from "./api/client";

import bodybuilder from "bodybuilder";
import _ from "lodash";

const FIELD_HIERARCHY = ["project", "sample_id", "library_id", "jira_id"];
const FIELD_NAMES = {
  project: "Project",
  sample_id: "Sample ID",
  library_id: "Library ID",
  jira_id: "Jira ID"
};

export const schema = gql`
  extend type Query {
    analysesTree(filters: [Term]!): AnalysesTree
    analysesList(filters: [Term]!): [AnalysisGroup!]
    analysesStats(filters: [Term]!): [Stat!]!
  }
  input Term {
    label: String!
    value: String!
  }

  type AnalysesTree {
    children: [ParentType!]
  }
  interface NodeType {
    name: String!
  }
  type ParentType implements NodeType {
    name: String!
    children: [NodeType!]
  }
  type ChildType implements NodeType {
    name: String!
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
    name: field,
    hierarchyLevel: hierarchyLevel + 1,
    filtered: root.filtered.filter(
      analysis =>
        analysis[FIELD_HIERARCHY[hierarchyLevel]].localeCompare(field) === 0
    )
  }));

  return mappedRoot;
};

async function getAnalyses(filters) {
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

  const data = await client.search({
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
    name: root => root.name,
    __resolveType(event, context, info) {
      if (event.hierarchyLevel === FIELD_HIERARCHY.length) {
        return "ChildType";
      } else {
        return "ParentType";
      }
    }
  },
  ParentType: {
    children: root => filterChildren(root, root.hierarchyLevel)
  },
  ChildType: {
    value: () => 1
  },
  AnalysesTree: {
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
    analysesTree: async (_, { filters }) => {
      const data = await getAnalyses(filters);
      return data;
    },

    analysesList: async (_, { filters }) => {
      const data = await getAnalyses(filters);

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

    analysesStats: async (_, { filters }) => {
      const data = await getAnalyses(filters);

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
