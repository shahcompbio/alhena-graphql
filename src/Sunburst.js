const { gql } = require("apollo-server");

import client from "./api/client";

import _ from "lodash";
const FIELD_HIERARCHY = ["project", "sample_id", "library_id", "jira_id"];
export const schema = gql`
  extend type Query {
    analyses: SunburstData
  }

  type SunburstData {
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
  SunburstData: {
    children: root => filterChildren({ filtered: [...root] }, 0)
  },
  Query: {
    analyses: async () => {
      const data = await client.search({
        index: "analyses",
        size: 10000
      });
      return data["body"]["hits"]["hits"].map(hit => hit["_source"]);
    }
  }
};
