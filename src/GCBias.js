const { gql } = require("apollo-server");

import _ from "lodash";

import { createSuperUserClient } from "./utils.js";
//import client from "./api/localClient.js";

import bodybuilder from "bodybuilder";
export const schema = gql`
  extend type Query {
    gcBias(analysis: String, quality: String!, selectionOrder: [Int!]): GCBias
  }
  type GCBias {
    stats: GCStats
    gcCells: [GCCell]
  }
  type GCCell {
    experimentalCondition: String
    gcPercent: Float
    highCi: Float
    lowCi: Float
    median: Float
  }
  type GCStats {
    xMin: Float
    yMin: Float
    xMax: Float
    yMax: Float
  }
`;

export const resolvers = {
  Query: {
    async gcBias(_, { analysis, quality, selectionOrder }) {
      return await getGcBias(analysis, quality, selectionOrder);
    }
  },
  GCBias: {
    stats: root => root,
    gcCells: root => root["agg_terms_gc_percent"]["buckets"]
  },
  GCCell: {
    experimentalCondition: root => "",
    gcPercent: root => root["key"],
    highCi: root => {
      const { avg, count, std_deviation } = root["agg_extended_stats_value"];
      return avg + (1.96 * std_deviation) / Math.sqrt(count);
    },
    lowCi: root => {
      const { avg, count, std_deviation } = root["agg_extended_stats_value"];
      return avg - (1.96 * std_deviation) / Math.sqrt(count);
    },
    median: root => root["agg_extended_stats_value"]["avg"]
  },

  GCStats: {
    yMax: root => {
      const viewingMax = root["agg_percentiles_value"]["values"]["75.0"];
      return viewingMax + viewingMax / 10;
    },
    yMin: root => root["agg_stats_value"].min,
    xMax: root => 0,
    xMin: root => 100
  }
};
async function getGcBias(analysis, quality, selectionOrder) {
  const client = createSuperUserClient();
  const cellIDQuery = selectionOrder
    ? bodybuilder()
        .size(10000)
        .filter("range", "quality", { gte: parseFloat(quality) })
        .filter("terms", "order", selectionOrder)
        .build()
    : bodybuilder()
        .size(10000)
        .filter("range", "quality", { gte: parseFloat(quality) })
        .build();

  const cellIDResults = await client.search({
    index: `${analysis.toLowerCase()}_qc`,
    body: cellIDQuery
  });

  const filteredCellIDs = cellIDResults["body"]["hits"]["hits"].map(
    record => record["_source"]["cell_id"]
  );

  const query = bodybuilder()
    .size(0)
    .filter("terms", "cell_id", filteredCellIDs)
    .aggregation("terms", "gc_percent", { size: 200 }, a =>
      a
        .aggregation("extended_stats", "value")
        .aggregation("percentiles", "value")
    )
    .aggregation("stats", "value")
    .aggregation("percentiles", "value")
    .build();

  const results = await client.search({
    index: `${analysis.toLowerCase()}_gc_bias`,
    body: query
  });

  return results["body"]["aggregations"];
}
