const { gql } = require("apollo-server");

import _ from "lodash";

import { createSuperUserClient } from "./utils.js";
import { configConsts } from "./config.js";

//import client from "./api/localClient.js";

import bodybuilder from "bodybuilder";
export const schema = gql`
  extend type Query {
    scatterplot(
      analysis: String!
      quality: String!
      selectedCells: [Int!]
      xAxis: String!
      yAxis: String!
    ): Scatterplot
    scatterplotAxisOptions: [AxisOptions!]
  }
  type AxisOptions {
    label: String
    type: String
  }
  type Scatterplot {
    stats: ScatterStats
    points: [ScatterplotPoint]
    histogram: Histogram
  }
  type Histogram {
    xBuckets: [HistogramBuckets]
    yBuckets: [HistogramBuckets]
  }
  type HistogramBuckets {
    key: Float
    count: Int
  }
  type ScatterplotPoint {
    x: Float
    y: Float
    heatmapOrder: Int
  }
  type ScatterStats {
    xMin: Float
    yMin: Float
    xMax: Float
    yMax: Float
    xSum: Float
    ySum: Float
    xAvg: Float
    yAvg: Float
    xCount: Int
    yCount: Int
  }
`;

export const resolvers = {
  Query: {
    scatterplotAxisOptions() {
      return configConsts;
    },
    async scatterplot(_, { analysis, quality, selectedCells, xAxis, yAxis }) {
      return await getScatterplot(
        analysis,
        quality,
        selectedCells,
        xAxis,
        yAxis
      );
    }
  },
  AxisOptions: {
    label: root => root.label,
    type: root => root.type
  },
  Histogram: {
    xBuckets: root => root["xInterval"]["buckets"],
    yBuckets: root => root["yInterval"]["buckets"]
  },
  HistogramBuckets: {
    key: root => root.key,
    count: root => root.doc_count
  },
  Scatterplot: {
    stats: root => root["scatterplot"]["aggregations"],
    points: root => root["scatterplot"]["hits"]["hits"],
    histogram: root => root["histogram"]
  },
  ScatterplotPoint: {
    x(obj, args, context, info) {
      return obj["_source"][info.variableValues.xAxis];
    },
    y(obj, args, context, info) {
      return obj["_source"][info.variableValues.yAxis];
    },
    heatmapOrder: root => root["_source"]["order"]
  },

  ScatterStats: {
    yMax: root => root["yInterval"]["max"],
    yMin: root => root["yInterval"]["min"],
    xMax: root => root["xInterval"]["max"],
    xMin: root => root["xInterval"]["min"],
    yAvg: root => root["yInterval"]["avg"],
    xAvg: root => root["xInterval"]["avg"],
    xCount: root => root["xInterval"]["count"],
    yCount: root => root["yInterval"]["count"],
    ySum: root => root["yInterval"]["sum"],
    xSum: root => root["xInterval"]["sum"]
  }
};

async function getScatterplot(analysis, quality, selectedCells, xAxis, yAxis) {
  const client = createSuperUserClient();
  const cellIDQuery =
    selectedCells.length > 0
      ? bodybuilder()
          .size(10000)
          .filter("range", "quality", { gte: parseFloat(quality) })
          .filter("terms", "order", selectedCells)
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
    .size(100000)
    .filter("terms", "cell_id", filteredCellIDs)
    .aggregation("stats", yAxis, "yInterval")
    .aggregation("stats", xAxis, "xInterval")
    .build();

  const results = await client.search({
    index: `${analysis.toLowerCase()}_qc`,
    body: query
  });

  const histogramResults = await getHistogram(
    results.body,
    filteredCellIDs,
    analysis,
    xAxis,
    yAxis
  );

  return {
    scatterplot: results["body"],
    histogram: histogramResults.body.aggregations
  };
}

const getHistogram = async (
  results,
  filteredCellIDs,
  analysis,
  xAxis,
  yAxis
) => {
  const client = createSuperUserClient();
  const x = results.aggregations["xInterval"];
  const y = results.aggregations["yInterval"];
  const xInterval =
    x.max - x.min < 1 || x.max - x.min === 1
      ? (x.max - x.min) / 10
      : Math.round((x.max - x.min) / 25);
  const yInterval =
    y.max - y.min < 1 || y.max - y.min === 1
      ? (y.max - y.min) / 10
      : Math.round((y.max - y.min) / 25);

  const histogramQuery = bodybuilder()
    .size(0)
    .filter("terms", "cell_id", filteredCellIDs)
    .aggregation(
      "histogram",
      xAxis,
      {
        interval: xInterval
      },
      "xInterval"
    )
    .aggregation(
      "histogram",
      yAxis,
      {
        interval: yInterval
      },
      "yInterval"
    )
    .build();

  return await client.search({
    index: `${analysis.toLowerCase()}_qc`,
    body: histogramQuery
  });
};
