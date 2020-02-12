const { gql } = require("apollo-server");

import _ from "lodash";
import client from "./api/montageClient.js";
var json = require("./gcbias.json");
export const schema = gql`
  extend type Query {
    gcBias(analysis: String, quality: String!): GCBias
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
    async gcBias(_, { analysis, quality }) {
      return await getGcBias(analysis, quality);
    }
  },
  GCBias: {
    stats: root => root.aggregations,
    gcCells: root =>
      root.hits.hits.filter(
        hit => hit.fields.experimental_condition[0] === "GM"
      )
  },
  GCCell: {
    experimentalCondition: root => root.fields.experimental_condition[0],
    gcPercent: root => root.fields.gc_percent[0],
    highCi: root => root.fields.high_ci[0],
    lowCi: root => root.fields.low_ci[0],
    median: root => root.fields.median[0]
  },
  GCStats: {
    yMax: root => root.yStats.max,
    yMin: root => root.yStats.min,
    xMax: root => root.xStats.max,
    xMin: root => root.xStats.min
  }
};
const getGcBias = async (analysis, quality) => {
  /*const results = await client.search({
    index: analysis.toLowerCase(),
    size: 10000,
    body: {
      fields: [
        "gc_percent",
        "median",
        "high_ci",
        "low_ci",
        "experimental_condition"
      ],
      aggs: {
        xStats: { stats: { field: "gc_percent" } },
        yStats: { stats: { field: "median" } },
        subsetNames: { terms: { field: "experimental_condition", size: 10000 } }
      },
      sort: [{ gc_percent: { order: "asc" } }],
      query: {
        filtered: {
          filter: {
            bool: {
              must: [
                { terms: { sample_id: [analysis] } },
                { exists: { field: "gc_percent" } },
                { exists: { field: "median" } },
                { range: { median: { lte: 2 } } }
              ]
            }
          },
          query: {
            filtered: {
              filter: {
                bool: {
                  must: [
                    {
                      range: {
                        quality: {
                          gte: quality
                        }
                      }
                    }
                  ]
                }
              },
              query: {
                match_all: {}
              }
            }
          }
        }
      }
    }
  });*/
  console.log(json);
  return json;
};
