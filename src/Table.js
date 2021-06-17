//cellmine_metadata
const { gql } = require("apollo-server");

import _ from "lodash";

import { createSuperUserClient } from "./utils.js";
import { configConsts } from "./config.js";

//import client from "./api/localClient.js";

import bodybuilder from "bodybuilder";

export const schema = gql`
  extend type Query {
    metaDataTable(analysis: String): [MetaDataTableRows]
  }
  type MetaDataTableRows {
    lysisBuffer: String
    lysisTime: String
    protease: String
    presoakTime: String
    sampleType: String
    pcrCycles: String
    experimentalCondition: String
    stain: String
    tagAmount: String
  }
`;

export const resolvers = {
  Query: {
    async metaDataTable(_, { analysis }) {
      return await getMetadataTable(analysis);
    }
  },
  MetaDataTableRows: {
    lysisBuffer: root => root.lysis_buffer,
    lysisTime: root => root.lysis_time,
    protease: root => root.protease,
    presoakTime: root => root.presoak_time,
    sampleType: root => root.sample_type,
    pcrCycles: root => root.pcr_cycles,
    experimentalCondition: root => root.experimental_condition,
    stain: root => root.stain,
    tagAmount: root => root.tag_amount
  }
};

const getMetadataTable = async analysis => {
  const client = createSuperUserClient();
  const query = bodybuilder()
    .size(50000)
    .build();

  const results = await client.search({
    index: `cellmine_metadata`,
    body: query
  });

  return results.body.hits.hits
    .map(hit => hit["_source"])
    .filter(hit => hit["jira_id"].toLowerCase() === analysis.toLowerCase());
};
