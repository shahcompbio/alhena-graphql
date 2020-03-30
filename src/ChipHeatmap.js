const { gql } = require("apollo-server");

import _ from "lodash";

import { createSuperUserClient } from "./utils.js";
import { configConsts } from "./config.js";

//import client from "./api/localClient.js";

import bodybuilder from "bodybuilder";

export const schema = gql`
  extend type Query {
    chipHeatmapOptions: [AxisOptions!]
    chipHeatmap(
      analysis: String
      quality: String!
      metric: String!
      selectedCells: [Int!]
    ): ChipHeatmap
  }
  type ChipHeatmap {
    squares: [Square]
    stats: ChipStats
  }
  type ChipStats {
    max: Float
  }
  type Square {
    columnIndex: Int
    rowIndex: Int
    cellId: String
    heatmapOrder: Int
    metric: String
  }
`;

export const resolvers = {
  Query: {
    chipHeatmapOptions() {
      return configConsts;
    },
    async chipHeatmap(_, { analysis, quality, metric, selectedCells }) {
      return await getChipHeatmap(analysis, quality, metric, selectedCells);
    }
  },
  ChipHeatmap: {
    stats(obj, args, context, info) {
      return obj["aggregations"]["agg_max_" + info.variableValues.metric];
    },
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
    metric(obj, args, context, info) {
      return obj[info.variableValues.metric];
    }
  }
};

const getChipHeatmap = async (analysis, quality, metric, selectedCells) => {
  const client = createSuperUserClient();
  const query =
    selectedCells.length > 0
      ? bodybuilder()
          .size(10000)
          .filter("range", "quality", { gte: parseFloat(quality) })
          .filter("terms", "order", selectedCells)
          .agg("max", metric)
          .build()
      : bodybuilder()
          .size(10000)
          .filter("range", "quality", { gte: parseFloat(quality) })
          .agg("max", metric)
          .build();

  const results = await client.search({
    index: `${analysis.toLowerCase()}_qc`,
    body: query
  });

  return results.body;
};
