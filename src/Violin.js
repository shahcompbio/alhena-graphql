const { gql } = require("apollo-server");

import _ from "lodash";

import { createSuperUserClient } from "./utils.js";
import { configConsts } from "./config.js";

import bodybuilder from "bodybuilder";
export const schema = gql`
  extend type Query {
    violin(
      analysis: String!
      quality: String!
      selectedCells: [Int!]
      xAxis: String!
      yAxis: String!
    ): Violin
    violinAxisOptions: ViolinAxisOptions
  }
  type ViolinAxisOptions {
    xAxis: [AxisOptions]
    yAxis: [AxisOptions]
  }
  type ViolinOptions {
    label: String
    type: String
  }
  type Violin {
    data: [ViolinGroup]
    stats: ViolinStats
    cells: [ViolinCells]
  }
  type ViolinCells {
    order: Int
    category: String
  }
  type ViolinGroup {
    name: String
    histogram: [ViolinHistogramValues]
    percentiles: [ViolinPercentileValues]
    stat: ViolinStats
  }
  type ViolinHistogramValues {
    key: String
    count: Int
  }
  type ViolinPercentileValues {
    percentile: String
    value: Float
  }
  type ViolinStats {
    avg: Float
    min: Float
    max: Float
    count: Float
    sum: Float
  }
`;

export const resolvers = {
  Query: {
    violinAxisOptions() {
      return configConsts.reduce(
        (final, current) => {
          if (current["class"] === "numerical") {
            final["yAxis"] = [...final["yAxis"], current];
          } else {
            final["xAxis"] = [...final["xAxis"], current];
          }
          return final;
        },
        { xAxis: [], yAxis: [] }
      );
    },
    async violin(_, { analysis, quality, selectedCells, xAxis, yAxis }) {
      return await getViolin(analysis, quality, selectedCells, xAxis, yAxis);
    }
  },
  ViolinAxisOptions: {
    xAxis: root => root.xAxis,
    yAxis: root => root.yAxis
  },
  Violin: {
    data: root => root.body.aggregations.xAxisAggs.buckets,
    stats: root => root.body.aggregations.allYStats,
    cells: root => root.body.hits.hits
  },
  ViolinGroup: {
    name: root => root.key,
    histogram: root => root.histogramY.buckets,
    percentiles: root =>
      Object.keys(root.bucketPercentiles.values).map(p => ({
        percentile: p,
        value: root.bucketPercentiles.values[p]
      })),
    stat: root => root.bucketStats
  },
  ViolinHistogramValues: {
    key: root => root.key,
    count: root => root.doc_count
  },
  ViolinPercentileValues: {
    percentile: root => root.percentile,
    value: root => root.value
  },
  ViolinCells: {
    order: root => root._source.order,
    category: (root, args, context, info) =>
      root._source[info.variableValues.xAxis]
  },
  ViolinStats: {
    max: root => root.max,
    min: root => root.min,
    avg: root => root.avg,
    count: root => root.count,
    sum: root => root.sum
  }
};
const getMinMax = async (axisName, quality, client, analysis) => {
  const histogram = {};
  if (axisName === "quality") {
    histogram["interval"] = (1 - quality) / 10;
    histogram["max"] = 1;
    histogram["min"] = quality;
  } else {
    const query = bodybuilder()
      //.aggregation("stats", axisName)
      .aggregation("max", axisName)
      .aggregation("min", axisName)
      .build();

    const results = await client.search({
      index: `${analysis.toLowerCase()}_qc`,
      body: query
    });

    histogram["min"] =
      results["body"]["aggregations"]["agg_min_" + axisName]["value"];
    histogram["max"] =
      results["body"]["aggregations"]["agg_max_" + axisName]["value"];

    histogram["interval"] = Math.abs(histogram["max"] - histogram["min"]) / 10;
  }
  return histogram;
};
async function getViolin(analysis, quality, selectedCells, xAxis, yAxis) {
  const client = createSuperUserClient();
  const histogram = await getMinMax(yAxis, quality, client, analysis);
  const query =
    selectedCells.length > 0
      ? bodybuilder()
          .size(10000)
          .filter("terms", "order", selectedCells)
          .filter("range", "quality", { gte: parseFloat(quality) })
          .aggregation("terms", xAxis)
          .aggregation("stats", yAxis, "allYStats")
          .agg(
            "terms",
            xAxis,
            {
              size: 1000,
              order: { _term: "asc" }
            },
            a =>
              a
                .aggregation(
                  "histogram",
                  yAxis,
                  {
                    interval: histogram["interval"],
                    extended_bounds: {
                      min: histogram["min"],
                      max: histogram["max"]
                    }
                  },
                  "histogramY"
                )
                .aggregation("stats", yAxis, "bucketStats")
                .aggregation("percentiles", yAxis, "bucketPercentiles"),
            "xAxisAggs"
          )
          .build()
      : bodybuilder()
          .size(10000)
          .filter("range", "quality", { gte: parseFloat(quality) })
          .aggregation("stats", yAxis, "allYStats")
          .aggregation("terms", xAxis)
          .filter("exists", "order")
          .sort("order", "asc")
          .aggregation(
            "terms",
            xAxis,
            {
              size: 1000,
              order: { _term: "asc" }
            },
            a =>
              a
                .aggregation(
                  "histogram",
                  yAxis,
                  {
                    interval: histogram["interval"],
                    extended_bounds: {
                      min: histogram["min"],
                      max: histogram["max"]
                    }
                  },
                  "histogramY"
                )
                .aggregation("stats", yAxis, "bucketStats")
                .aggregation("percentiles", yAxis, "bucketPercentiles"),
            "xAxisAggs"
          )
          .build();

  const results = await client.search({
    index: `${analysis.toLowerCase()}_qc`,
    body: query
  });

  return results;
}
