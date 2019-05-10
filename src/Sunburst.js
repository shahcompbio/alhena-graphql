const {gql} = require("apollo-server");
import {getAllAnalyses} from "./api/client.js";

import _ from "lodash";
const fieldHierachy = {
  0: "project",
  1: "library_id",
  2: "sample_id",
  3: "jira_id"
};
export const schema = gql`
  extend type Query {
    getAllSunburstAnalyses: SunburstData
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

const filterChildren = (root, hierachyLevel) =>
  _.uniq(
    root.filtered.map(
      analysis => analysis._source[fieldHierachy[hierachyLevel]]
    )
  ).map(field => {
    var filteredChildren = root.filtered.filter(analysis => {
      return (
        analysis._source[fieldHierachy[hierachyLevel]].localeCompare(field) ===
        0
      );
    });
    return {
      name: field,
      filtered: [...filteredChildren],
      hierachyLevel: hierachyLevel + 1
    };
  });

export const resolvers = {
  NodeType: {
    name: root => root.name,
    __resolveType(event, context, info) {
      if (event.hierachyLevel === 4) {
        return "ChildType";
      } else {
        return "ParentType";
      }
    }
  },
  ParentType: {
    children: root => filterChildren(root, root.hierachyLevel)
  },
  ChildType: {
    value: () => 1
  },
  SunburstData: {
    children: root => filterChildren({filtered: [...root]}, 0)
  },
  Query: {
    getAllSunburstAnalyses: async () => {
      return await getAllAnalyses();
    }
  }
};
