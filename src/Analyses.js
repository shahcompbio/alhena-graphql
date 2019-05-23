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
    analysesTree(filter: Term): AnalysesTree
    analysesList(filter: Term): [AnalysisGroup!]
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

async function getAnalyses(filter) {
  const query =
    filter === null
      ? bodybuilder()
          .size(10000)
          .build()
      : bodybuilder()
          .size(10000)
          .filter("term", filter["label"], filter["value"])
          .build();
  const data = await client.search({
    index: "analyses",
    body: query
  });
  return data["body"]["hits"]["hits"].map(hit => hit["_source"]);
}

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
  Query: {
    analysesTree: async (_, { filter }) => {
      const data = await getAnalyses(filter);
      return data;
    },

    analysesList: async (_, { filter }) => {
      const data = await getAnalyses(filter);

      const uniqueValuesInHierarchy = FIELD_HIERARCHY.map(field => {
        const values = data
          .map(datum => datum[field])
          .reduce(
            (uniqueList, fieldValue) =>
              uniqueList.indexOf(fieldValue) === -1
                ? [...uniqueList, fieldValue]
                : uniqueList,
            []
          );

        return {
          label: FIELD_NAMES[field],
          type: field,
          values: values
        };
      });

      return uniqueValuesInHierarchy;
    }
  }
};
