const { gql } = require("apollo-server");

import _ from "lodash";
import client from "./api/montageClient.js";
import bodybuilder from "bodybuilder";
var json = require("./gcbias.json");
export const schema = gql`
  extend type Query {
    gcBias(analysis: String, quality: String!, cellIDs: [String!]): GCBias
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
    async gcBias(_, { analysis, quality, cellIDs }) {
      return await getGcBias(analysis, quality, cellIDs);
    }
  },
  GCBias: {
    stats: root => root["agg_stats_value"],
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
    median: root => root["agg_percentiles_value"]["values"]["50.0"]
  },

  GCStats: {
    yMax: root => root.max,
    yMin: root => root.min,
    xMax: root => 0,
    xMin: root => 100
  }
};
async function getGcBias(analysis, quality, cellIDs) {
  const cellIDQuery = bodybuilder()
    .size(10000)
    .filter("range", "quality", { gte: parseFloat(quality) })
    .build();

  const cellIDResults = await client.search({
    index: `${analysis.toLowerCase()}_qc`,
    body: cellIDQuery
  });

  const filteredCellIDs = cellIDs
    ? cellIDs
    : cellIDResults["body"]["hits"]["hits"].map(
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
    .build();

  const results = await client.search({
    index: `${analysis.toLowerCase()}_gc_bias`,
    body: query
  });

  return results["body"]["aggregations"];
}
