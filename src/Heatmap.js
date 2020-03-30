const { gql } = require("apollo-server");

import _ from "lodash";

import { createSuperUserClient } from "./utils.js";
//import client from "./api/localClient.js";

import bodybuilder from "bodybuilder";

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
      const client = createSuperUserClient();
      const query = bodybuilder()
        .size(0)
        .agg(
          "terms",
          "chrom_number",
          { size: 50000, order: { _term: "asc" } },
          a => a.agg("max", "end").agg("min", "start")
        )
        .build();

      const results = await client.search({
        index: `${analysis.toLowerCase()}_segs`,
        body: query
      });

      return results.body.aggregations.agg_terms_chrom_number.buckets;
    },
    async bins(_, { analysis, id }) {
      return await getBinsForID(analysis, id);
    },
    async categoriesStats(_, { analysis }) {
      const queryResults = await getAllCategoryStats(analysis);
      return ["experimental_condition", "cell_call", "state_mode"].map(
        category => ({
          category,
          types: queryResults[`agg_terms_${category}`].buckets
        })
      );
    },
    async analysisStats(_, { analysis, indices }) {
      const cellStats = await getCellStats(analysis, indices);

      const maxState = await getMaxState(analysis);
      return {
        maxState: maxState,
        cellStats: cellStats
      };
    },
    async heatmapOrder(_, { analysis, quality }) {
      return await getAllHeatmapOrder(analysis, quality);
    },

    async segs(_, { analysis, indices, quality }) {
      const results = await getIDsForIndices(analysis, indices, quality);
      return results.body.hits.hits.map(id => ({ ...id["_source"], analysis }));
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
    id: root => root.order + root.experimental_condition,
    state_mode: root => root.state_mode,
    experimental_condition: root => root.experimental_condition,
    cell_call: root => root.cell_call,
    heatmap_order: root => root.order
  },
  CategoryStats: {
    category: root => root.category,
    types: root => root.types.map(type => type.key)
  },
  Chromosome: {
    id: root => root.key,
    start: root => root.agg_min_start.value,
    end: root => root.agg_max_end.value
  },
  HeatmapOrder: {
    order: root => root["order"]
  },
  SegRow: {
    id: root => `${root.cell_id}`,
    name: root => root.cell_id,
    index: root => root.order,
    segs: async root => {
      const analysis = root.analysis;
      const id = root.cell_id;

      return await getSegsForID(analysis, id);
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
  const client = createSuperUserClient();
  const query = bodybuilder()
    .size(50000)
    .sort("order", "asc")
    .filter("exists", "order")
    .filter("range", "quality", { gte: parseFloat(quality) })
    .build();
  const results = await client.search({
    index: `${analysis.toLowerCase()}_qc`,
    body: query
  });
  return results.body.hits.hits.map(record => record["_source"]);
}
async function getAllCategoryStats(analysis) {
  const client = createSuperUserClient();
  const query = bodybuilder()
    .size(0)
    .filter("range", "quality", { gte: 0.75 })
    .agg("terms", "experimental_condition", {
      size: 1000,
      order: { _term: "asc" }
    })
    .agg("terms", "cell_call", { size: 1000, order: { _term: "asc" } })
    .agg("terms", "state_mode", { size: 1000, order: { _term: "asc" } })
    .build();
  const results = await client.search({
    index: `${analysis.toLowerCase()}_qc`,
    body: query
  });
  return results.body.aggregations;
}
async function getCellStats(analysis, indices) {
  const client = createSuperUserClient();
  const query = bodybuilder()
    .size(50000)
    .sort("order", "asc")
    .filter("exists", "order")
    .filter("terms", "order", indices)
    .build();

  const results = await client.search({
    index: `${analysis.toLowerCase()}_qc`,
    body: query
  });

  return results.body.hits.hits.map(record => record["_source"]);
}
async function getMaxState(analysis) {
  const client = createSuperUserClient();
  const query = bodybuilder()
    .size(0)
    .agg("max", "state")
    .build();
  const results = await client.search({
    index: `${analysis.toLowerCase()}_segs`,
    body: query
  });
  return results.body.aggregations.agg_max_state.value;
}

/*********
 * Bins
 **********/
async function getBinsForID(analysis, id) {
  const client = createSuperUserClient();
  const query = bodybuilder()
    .size(50000)
    .filter("exists", "copy")
    .filter("term", "cell_id", id)
    .build();

  const results = await client.search({
    index: `${analysis.toLowerCase()}_bins`,
    body: query
  });
  return results.body.hits.hits.map(record => record["_source"]);
}
/*********
 * Segs
 **********/
async function getIDsForIndices(analysis, indices, quality) {
  const client = createSuperUserClient();
  const query = bodybuilder()
    .size(50000)
    .sort("order", "asc")
    .filter("exists", "order")
    .filter("range", "quality", { gte: parseFloat(quality) })
    .filter("terms", "order", indices)
    .build();

  const results = await client.search({
    index: `${analysis.toLowerCase()}_qc`,
    body: query
  });
  return results;
}

async function getSegsForID(analysis, id) {
  const client = createSuperUserClient();
  const query = bodybuilder()
    .size(50000)
    .filter("term", "cell_id", id)
    .build();
  const results = await client.search({
    index: `${analysis.toLowerCase()}_segs`,
    body: query
  });

  return results.body.hits.hits.map(seg => seg["_source"]);
}
