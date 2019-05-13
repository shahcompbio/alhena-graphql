const { gql } = require("apollo-server");
import { getAllAnalyses } from "./api/client.js";

import client from "./api/colossus";

import _ from "lodash";
const FIELD_HIERARCHY = ["project", "sample_id", "library_id", "jira_id"];
export const schema = gql`
  extend type Query {
    getAllSunburstAnalyses: SunburstData
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

const processData = data =>
  data.map((datum, index) => ({
    project:
      index % 3 === 0 ? "DLP+" : index % 3 === 1 ? "Spectrum" : "Fitness",
    sample_id: datum["library"]["sample"]["sample_id"],
    library_id: datum["library"]["pool_id"],
    jira_id: datum["library"]["jira_ticket"]
  }));
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
    getAllSunburstAnalyses: async () => {
      return await getAllAnalyses();
    },

    analyses: async () => {
      const data = await client
        .get("/analysis_information/?page=60")
        .then(response => {
          return response.data.results;
        })
        .catch(error => {
          return {};
        });
      return processData(data);
    }
  }
};
