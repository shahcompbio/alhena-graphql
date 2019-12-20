const { gql } = require("apollo-server");

import client from "./api/montageClient.js";

export const schema = gql`
  extend type Query {
    chromosomes(analysis: String!): [Chromosome]
    segs(analysis: String!, indices: [Int!]!): [SegRow]
  }
  type Chromosome {
    id: String!
    start: Int!
    end: Int!
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

    async segs(_, { analysis, indices }) {
      const results = await getIDsForIndices(analysis, indices);
      return results.hits.hits.map(id => ({ ...id, analysis }));
    }
  },

  Chromosome: {
    id: root => root.key,
    start: root => root.XMin.value,
    end: root => root.XMax.value
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

/*********
 * Segs
 **********/
async function getIDsForIndices(analysis, indices) {
  const first100 = Array.from(Array(100).keys());
  const results = await client.search({
    index: analysis.toLowerCase(),
    body: {
      size: 50000,
      sort: [
        {
          all_heatmap_order: {
            order: "asc"
          }
        }
      ],
      query: {
        bool: {
          must: [
            {
              terms: {
                all_heatmap_order: [...first100]
              }
            }
          ]
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

/*********
 * Clones
 **********/
async function getIDsForRange(analysis, range) {
  const results = await client.search({
    index: `ce00_${analysis.toLowerCase()}_tree`,
    body: {
      size: 50000,
      query: {
        bool: {
          must: [
            {
              range: {
                heatmap_order: {
                  gte: range[0],
                  lte: range[1]
                }
              }
            }
          ]
        }
      }
    }
  });
  return results;
}
