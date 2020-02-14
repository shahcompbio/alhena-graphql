const { gql } = require("apollo-server");

import _ from "lodash";
import client from "./api/montageClient.js";

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
    stats: root => root.max_mapped_reads,
    squares: root =>
      root.column.buckets
        .map(column => {
          const key = column.key;
          return column.row.buckets.map(rowEntry => ({
            colIndex: key,
            ...rowEntry
          }));
        })
        .flat(1)
  },
  ChipStats: {
    max: root => root.value
  },
  Square: {
    columnIndex: root => root.colIndex,
    rowIndex: root => root.key,
    heatmapOrder: root =>
      root.heatmap_order.buckets.length > 0
        ? root.heatmap_order.buckets[0].key
        : null,
    cellId: root => root.cell_id.buckets[0].key,
    totalMappedReads: root => root.total_mapped_reads.value
  }
};
const getChipHeatmap = async (analysis, quality) => {
  const results = await client.search({
    index: analysis.toLowerCase(),
    size: 0,
    body: {
      aggs: {
        max_mapped_reads: { max: { field: "total_mapped_reads" } },
        column: {
          terms: {
            size: 1000,
            field: "column",
            order: {
              _term: "asc"
            }
          },
          aggs: {
            row: {
              terms: {
                size: 1000,
                field: "row",
                order: {
                  _term: "asc"
                }
              },
              aggs: {
                cell_id: {
                  terms: {
                    size: 1000,
                    field: "cell_id"
                  }
                },
                heatmap_order: {
                  terms: {
                    size: 1000,
                    field: "all_heatmap_order"
                  }
                },
                total_mapped_reads: {
                  avg: {
                    field: "total_mapped_reads"
                  }
                },
                experimental_condition: {
                  terms: {
                    size: 1000,
                    field: "experimental_condition"
                  }
                }
              }
            }
          }
        }
      },
      query: {
        filtered: {
          filter: {
            bool: {
              must: [
                {
                  terms: {
                    caller: ["single_cell_qc"]
                  }
                },
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
  });
  return results.body.aggregations;
};
