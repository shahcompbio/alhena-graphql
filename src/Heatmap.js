const { gql } = require("apollo-server");

import _ from "lodash";
import client from "./api/montageClient.js";

export const schema = gql`
  extend type Query {
    chromosomes(analysis: String!): [Chromosome]
    segs(analysis: String!, indices: [Int!]!, quality: String!): [SegRow]
    bins(analysis: String!, id: String!): [Bin]
    analysisStats(analysis: String, indices: [Int!]!): AnalysisStats!
    heatmapOrder(analysis: String, quality: String!): [HeatmapOrder]
    categoriesStats(analysis: String): [CategoryStats]
  }

  type Chromosome {
    id: String!
    start: Int!
    end: Int!
  }
  type AnalysisStats {
    maxState: Int!
    cellStats: [CellStats]
  }
  type CategoryStats {
    category: String!
    types: [String]!
  }
  type CellStats {
    id: String!
    state_mode: String
    experimental_condition: String
    heatmap_order: Int
    cell_call: String
  }
  type ExperimentalConditions {
    type: String
    index: Int
  }
  type Bin {
    id: String!
    state: String!
    start: String!
    end: String!
    chromNumber: String!
    copy: String!
  }
  type HeatmapOrder {
    order: Int!
  }
  type SegRow {
    id: String!
    name: String!
    index: Int!
    segs: [Seg!]!
  }
  type Seg {
    chromosome: String!
    start: Int!
    end: Int!
    state: Int!
  }
`;

export const resolvers = {
  Query: {
    async chromosomes(_, { analysis }) {
      const results = await client.search({
        index: analysis.toLowerCase(),
        body: {
          size: 0,
          aggs: {
            chrom_ranges: {
              terms: {
                field: "chrom_number",
                size: 50000,
                //order: { _key: "asc" }
                order: { _term: "asc" }
              },
              aggs: {
                XMax: {
                  max: {
                    field: "end"
                  }
                },
                XMin: {
                  min: {
                    field: "start"
                  }
                }
              }
            }
          }
        }
      });

      return results.aggregations.chrom_ranges.buckets;
    },
    async bins(_, { analysis, id }) {
      return await getBinsForID(analysis, id);
    },
    async categoriesStats(_, { analysis }) {
      const queryResults = await getAllCategoryStats(analysis);
      return Object.keys(queryResults).map(key => {
        return { category: key, types: queryResults[key].buckets };
      });
    },
    async analysisStats(_, { analysis, indices }) {
      const cellStats = await getCellStats(analysis, indices);

      const maxState = await getMaxState(analysis);
      return {
        maxState: maxState,
        cellStats: cellStats.hits.hits
      };
    },
    async heatmapOrder(_, { analysis, quality }) {
      return await getAllHeatmapOrder(analysis, quality);
    },

    async segs(_, { analysis, indices, quality }) {
      const results = await getIDsForIndices(analysis, indices, quality);
      return results.hits.hits.map(id => ({ ...id, analysis }));
    }
  },
  Bin: {
    id: root => root.cell_id + root.start + root.chrom_number,
    state: root => root.state,
    start: root => root.start,
    end: root => root.end,
    chromNumber: root => root.chrom_number,
    copy: root => root.copy
  },
  AnalysisStats: {
    maxState: root => root.maxState,
    cellStats: root => root.cellStats
  },
  CellStats: {
    id: root =>
      root.fields.all_heatmap_order[0] + root.fields.experimental_condition[0],
    state_mode: root => root.fields.state_mode[0],
    experimental_condition: root => root.fields.experimental_condition[0],
    cell_call: root => root.fields.cell_call[0],
    heatmap_order: root => root.fields.all_heatmap_order[0]
  },
  CategoryStats: {
    category: root => root.category,
    types: root => root.types.map(type => type.key)
  },
  Chromosome: {
    id: root => root.key,
    start: root => root.XMin.value,
    end: root => root.XMax.value
  },
  HeatmapOrder: {
    order: root => root.fields["all_heatmap_order"][0]
  },
  SegRow: {
    id: root => `${root["_source"].cell_id}`,
    name: root => root["_source"].cell_id,
    index: root => root["_source"].all_heatmap_order,
    segs: async root => {
      const index = root["_index"].toLowerCase();
      const id = root["_source"].cell_id;

      return await getSegsForID(index, id);
    }
  },
  Seg: {
    chromosome: root => root.chrom_number,
    start: root => root.start,
    end: root => root.end,
    state: root => root.state
  }
};

async function getAllHeatmapOrder(analysis, quality) {
  const results = await client.search({
    index: analysis.toLowerCase(),
    size: 50000,
    body: {
      sort: [
        {
          all_heatmap_order: {
            unmapped_type: "long"
          }
        }
      ],
      fields: ["all_heatmap_order"],
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
                  exists: {
                    field: "all_heatmap_order"
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
          }
        }
      }
    }
  });
  return results.hits.hits;
}
async function getAllCategoryStats(analysis) {
  const results = await client.search({
    index: analysis,
    size: 0,
    body: {
      aggs: {
        experimental_condition: {
          terms: {
            size: 1000,
            field: "experimental_condition",
            order: { _term: "asc" }
          }
        },
        cell_call: {
          terms: {
            size: 1000,
            field: "cell_call",
            order: { _term: "asc" }
          }
        },
        mode_state: {
          terms: {
            size: 1000,
            field: "mode_state",
            order: { _term: "asc" }
          }
        }
      },
      query: {
        filtered: {
          filter: {
            bool: {
              must: [
                { terms: { caller: ["single_cell_qc"] } },
                { range: { quality: { gte: "0.75" } } }
              ]
            }
          },
          query: { match_all: {} }
        }
      }
    }
  });
  return results.aggregations;
}
async function getCellStats(analysis, indices) {
  const results = await client.search({
    index: analysis,
    size: 500000,
    body: {
      fields: [
        "all_heatmap_order",
        "cell_call",
        "experimental_condition",
        "state_mode"
      ],
      sort: [
        {
          all_heatmap_order: {
            unmapped_type: "long"
          }
        }
      ],
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
                  exists: {
                    field: "all_heatmap_order"
                  }
                }
              ]
            }
          },
          query: {
            bool: {
              must: [
                {
                  terms: {
                    all_heatmap_order: [...indices]
                  }
                }
              ]
            }
          }
        }
      }
    }
  });
  return results;
}
async function getMaxState(analysis) {
  const results = await client.search({
    index: analysis,
    size: 0,
    body: {
      aggs: {
        integer_median: {
          max: {
            field: "state"
          }
        }
      },
      query: {
        filtered: {
          filter: {
            bool: {
              must: [
                {
                  type: {
                    value: "segs"
                  }
                }
              ]
            }
          }
        }
      }
    }
  });
  return results.aggregations.integer_median.value;
}

/*********
 * Bins
 **********/
async function getBinsForID(index, id) {
  const results = await client.search({
    index,
    body: {
      size: 50000,
      _source: ["cell_id", "state", "start", "end", "chrom_number", "copy"],
      query: {
        bool: {
          filter: [{ term: { cell_id: id } }]
        }
      },
      filter: {
        bool: {
          should: [
            {
              bool: {
                must: [
                  {
                    type: {
                      value: "bins"
                    }
                  }
                ]
              }
            }
          ]
        }
      }
    }
  });
  return results.hits.hits.map(seg => seg["_source"]);
}
/*********
 * Segs
 **********/
async function getIDsForIndices(analysis, indices, quality) {
  const results = await client.search({
    index: analysis.toLowerCase(),
    body: {
      size: 50000,
      sort: [
        {
          all_heatmap_order: {
            unmapped_type: "long"
          }
        }
      ],
      aggs: {
        integer_median: {
          max: {
            field: "state"
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
                  exists: {
                    field: "all_heatmap_order"
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
            bool: {
              must: [
                {
                  terms: {
                    all_heatmap_order: [...indices]
                  }
                }
              ]
            }
          }
        }
      }
    }
  });
  return results;
}

async function getSegsForID(index, id) {
  const results = await client.search({
    index,
    body: {
      size: 50000,
      query: {
        bool: {
          filter: [{ term: { cell_id: id } }]
        }
      },
      filter: {
        bool: {
          should: [
            {
              bool: {
                must: [
                  {
                    type: {
                      value: "segs"
                    }
                  }
                ]
              }
            }
          ]
        }
      }
    }
  });

  return results.hits.hits.map(seg => seg["_source"]);
}
