const {gql} = require("apollo-server");
import {getAllDashboards} from "./api/client.js";

export const schema = gql`
  interface Dashboard {
    index: String!
    libraryID: String!
    project: String!
    sampleID: String!
  }
  extend type Query {
    getAllDashboards: [Dashboard!]
  }
  type QCDashboard implements Dashboard {
    index: String!
    libraryID: String!
    project: String!
    sampleID: String!
  }
  type FitnessDashboard implements Dashboard {
    index: String!
    libraryID: String!
    project: String!
    sampleID: String!
  }
  type SpectrumDashboard implements Dashboard {
    index: String!
    libraryID: String!
    project: String!
    sampleID: String!
  }
`;

export const resolvers = {
  Dashboard: {
    index: root => root._source.jira_id,
    libraryID: root => root._source.library_id,
    project: root => root._source.project,
    sampleID: root => root._source.sample_id,
    __resolveType(event, context, info) {
      if (event._source.project.indexOf("DLP") !== -1) {
        return "QCDashboard";
      } else if (event._source.project.indexOf("Spectrum") !== -1) {
        return "SpectrumDashboard";
      } else {
        return "FitnessDashboard";
      }
    }
  },
  Query: {
    getAllDashboards: async () => {
      return await getAllDashboards();
    }
  }
};
