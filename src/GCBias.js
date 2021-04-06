const { gql } = require("apollo-server");

import _ from "lodash";

import { createSuperUserClient } from "./utils.js";

import bodybuilder from "bodybuilder";
export const schema = gql`
  extend type Query {
    gcBias(
      analysis: String!
      quality: String!
      selectedCells: [Int!]
      isGrouped: Boolean!
    ): [GCBias]
  }
  type GCBias {
    stats: GCStats
    cellOrder: [Int]
    gcCells: [GCCell]
    experimentalCondition: String
  }
  type GCCell {
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
    async gcBias(_, { analysis, quality, selectedCells, isGrouped }) {
      return await getGcBias(analysis, quality, selectedCells, isGrouped);
    }
  },
  GCBias: {
    stats: root => root,
    cellOrder: root => root["cells"],
    gcCells: root => root["results"]["agg_terms_gc_percent"]["buckets"],
    experimentalCondition: root => root["category"]
  },
  GCCell: {
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
      const viewingMax =
        root["results"]["agg_percentiles_value"]["values"]["75.0"];
      return viewingMax + viewingMax / 10;
    },
    yMin: root => root["results"]["agg_stats_value"]["min"],
    xMax: root => 0,
    xMin: root => 100
  }
};
const createMappingByField = (results, keyWord) =>
  results.reduce((final, record) => {
    const expCondition = record["_source"]["experimental_condition"];
    const cellID = record["_source"][keyWord];

    final[expCondition] = final[expCondition]
      ? [...final[expCondition], cellID]
      : [cellID];

    return final;
  }, {});
async function getGcBias(analysis, quality, selectedCells, isGrouped) {
  const client = createSuperUserClient();
  const cellIDQuery =
    selectedCells.length > 0
      ? bodybuilder()
          .size(50000)
          .filter("range", "quality", { gte: parseFloat(quality) })
          .filter("terms", "order", selectedCells)
          .build()
      : bodybuilder()
          .size(50000)
          .filter("range", "quality", { gte: parseFloat(quality) })
          .build();

  const cellIDResults = await client.search({
    index: `${analysis.toLowerCase()}_qc`,
    body: cellIDQuery
  });
  const results = cellIDResults["body"]["hits"]["hits"];
  if (isGrouped) {
    const filteredCellIDs = createMappingByField(results, "cell_id");
    const filteredCellOrder = createMappingByField(results, "order");
    var categorySeperatedResults = await Object.keys(filteredCellIDs).map(
      async category => {
        const query = bodybuilder()
          .size(0)
          .filter("terms", "cell_id", filteredCellIDs[category])
          .aggregation("terms", "gc_percent", { size: 200 }, a =>
            a
              .aggregation("extended_stats", "value")
              .aggregation("percentiles", "value")
              .aggregation("terms", "cell_id")
          )
          .aggregation("stats", "value")
          .aggregation("percentiles", "value")
          .build();

        const results = await client.search({
          index: `${analysis.toLowerCase()}_gc_bias`,
          body: query
        });

        return {
          category: category,
          results: results["body"]["aggregations"],
          cells: [...filteredCellOrder[category]]
        };
      }
    );
    return Promise.all(categorySeperatedResults);
  } else {
    const cellIDs = cellIDResults["body"]["hits"]["hits"].map(
      entry => entry["_source"]["cell_id"]
    );
    const order = cellIDResults["body"]["hits"]["hits"].map(
      entry => entry["_source"]["order"]
    );
    const query = bodybuilder()
      .size(0)
      .filter("terms", "cell_id", cellIDs)
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

    return [
      {
        category: "All",
        results: results["body"]["aggregations"],
        cells: [...order]
      }
    ];
  }
}
