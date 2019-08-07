const { gql } = require("apollo-server");

import client from "./api/client";

import _ from "lodash";
const FIELDS = ["project"];

export const schema = gql`
  extend type Query {
    getProjects: [Project]
  }
  type Project {
    name: String!
    count: Int!
  }
`;

export const resolvers = {
  Project: {
    name: root => root.key,
    count: root => root.doc_count
  },
  Query: {
    async getProjects() {
      const data = await client.search({
        index: "analyses",
        size: 10000,
        body: {
          size: 0,
          aggs: {
            project: {
              terms: { field: "project" }
            }
          }
        }
      });

      return data["body"]["aggregations"]["project"]["buckets"];
    }
  }
};
