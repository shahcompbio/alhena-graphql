const { gql } = require("apollo-server");

import _ from "lodash";
import client from "./api/montageClient.js";
import bodybuilder from "bodybuilder";

export const schema = gql`
  extend type Query {
    chipHeatmap(analysis: String, quality: String!): ChipHeatmap
  }
  type ChipHeatmap {
    squares: [Square]
    stats: ChipStats
  }
  type ChipStats {
    max: Int
  }
  type Square {
    columnIndex: Int
    rowIndex: Int
    cellId: String
    heatmapOrder: Int
    totalMappedReads: String
  }
`;

export const resolvers = {
  Query: {
    async chipHeatmap(_, { analysis, quality }) {
      return await getChipHeatmap(analysis, quality);
    }
  },
  ChipHeatmap: {
    stats: root => root["aggregations"]["agg_max_total_mapped_reads"],
    squares: root => root["hits"]["hits"].map(record => record["_source"])
  },
  ChipStats: {
    max: root => root.value
  },
  Square: {
    columnIndex: root => root["column"],
    rowIndex: root => root["row"],
    heatmapOrder: root => (root.hasOwnProperty("order") ? root["order"] : null),
    cellId: root => root["cell_id"],
    totalMappedReads: root => root["total_mapped_reads"]
  }
};
const getChipHeatmap = async (analysis, quality) => {
  const query = bodybuilder()
    .size(10000)
    .filter("range", "quality", { gte: parseFloat(quality) })
    .agg("max", "total_mapped_reads")
    .build();

  const results = await client.search({
    index: `${analysis.toLowerCase()}_qc`,
    body: query
  });

  return results.body;
};
