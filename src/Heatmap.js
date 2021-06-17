import redis from "./api/redisClient.js";
const { gql } = require("apollo-server");

import _ from "lodash";

import { createSuperUserClient } from "./utils.js";

import bodybuilder from "bodybuilder";
import { configConsts } from "./config.js";

const round = num => Math.round(num * 100) / 100;
export const schema = gql`
  extend type Query {
    chromosomes(analysis: String!): [Chromosome]
    segs(analysis: String!, indices: [Int!]!, quality: String!): [SegRow]
    bins(analysis: String!, id: String!): [Bin]
    analysisStats(analysis: String, indices: [Int!]!): AnalysisStats!
    heatmapOrder(analysis: String, quality: String!): [HeatmapOrder]
    categoriesStats(analysis: String, dataFilters: [String]): [CategoryStats]
    numericalDataFilters(
      analysis: String
      quality: String!
      params: [InputParams]
    ): DataFilterStats
    heatmapOrderFromParameter(
      analysis: String!
      params: [InputParams]
      quality: String!
    ): [HeatmapOrder]
  }
  type NumericalDataFilters {
    name: String
    label: String
    max: Float
    min: Float
    localMax: Float
    localMin: Float
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
  type DataFilterStats {
    numericalDataFilters: [NumericalDataFilters]
    heatmapOrderFromDataFilters: [HeatmapOrder]
  }
  type CategoryStats {
    category: String!
    types: [String]!
    cellIDs: [Int]!
  }
  type CellStats {
    id: String!
    state_mode: String
    experimental_condition: String
    heatmap_order: Int
    cell_call: String
    clone_id: String
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

  input InputParams {
    param: String!
    value: String!
    operator: String
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
        .agg("terms", "chr", { size: 50000, order: { _term: "asc" } }, a =>
          a.agg("max", "end").agg("min", "start")
        )
        .build();

      const results = await client.search({
        index: `${analysis.toLowerCase()}_segs`,
        body: query
      });

      return results.body.aggregations.agg_terms_chr.buckets;
    },
    async numericalDataFilters(_, { analysis, quality, params }) {
      return await getDataFilters(analysis, quality, params);
    },
    async bins(_, { analysis, id }) {
      return await getBinsForID(analysis, id);
    },

    async categoriesStats(_, { analysis }) {
      const queryResults = await getAllCategoryStats(analysis);
      return [
        "experimental_condition",
        //  "cell_call",
        "state_mode",
        "clone_id"
      ].map(category => ({
        category,
        types: queryResults[`agg_terms_${category}`].buckets
      }));
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
    },
    async heatmapOrderFromParameter(_, { analysis, params, quality }) {
      const results = await getHeatmapOrderByParam(analysis, params, quality);
      return results;
    }
  },
  DataFilterStats: {
    numericalDataFilters: root => root["numericalDataFilters"],
    heatmapOrderFromDataFilters: root => root["order"]
  },
  NumericalDataFilters: {
    name: root =>
      root.name
        .split("_")
        .splice(2, root.name.length - 1)
        .join("_"),
    label: root => root.label,
    max: root => round(root.stats.max),
    min: root => round(root.stats.min),
    localMax: root => round(root.localStats.max),
    localMin: root => round(root.localStats.min)
  },
  Bin: {
    id: root => root.cell_id + root.start + root.chr,
    state: root => root.state,
    start: root => root.start,
    end: root => root.end,
    chromNumber: root => root.chr,
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
    heatmap_order: root => root.order,
    clone_id: root => root.clone_id
  },
  CategoryStats: {
    category: root => root.category,
    types: root => root.types.map(type => type.key),
    cellIDs: root => root
  },
  Chromosome: {
    id: root => root.key,
    start: root => root.agg_min_start.value,
    end: root => root.agg_max_end.value
  },
  HeatmapOrder: {
    order: root => root.order
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
    chromosome: root => root.chr,
    start: root => root.start,
    end: root => root.end,
    state: root => root.state
  }
};
async function getDataFilters(analysis, quality, params) {
  const dataFilterLabelObj = configConsts.reduce((final, curr) => {
    final[curr.type] = curr["label"];
    return final;
  }, {});

  const client = createSuperUserClient();

  var query = bodybuilder()
    .size(0)
    .agg("stats", "mad_neutral_state")
    .agg("stats", "log_likelihood")
    .agg("stats", "total_mapped_reads")
    .agg("stats", "coverage_breadth")
    .build();

  const results = await client.search({
    index: `${analysis.toLowerCase()}_qc`,
    body: query
  });

  var localMaxMinQuery = bodybuilder();
  const filters = params.map(param => {
    if (param["operator"]) {
      localMaxMinQuery.addFilter("range", param["param"], {
        [param["operator"]]: parseFloat(param["value"])
      });
    } else if (
      param["param"] === "experimental_condition" &&
      param["value"].indexOf(",") !== -1
    ) {
      localMaxMinQuery.addFilter("terms", param["param"], [
        ...param["value"].split(",")
      ]);
    } else {
      localMaxMinQuery.addFilter("term", param["param"], param["value"]);
    }
  });

  localMaxMinQuery
    .size(50000)
    .sort("order", "asc")
    .filter("exists", "order")
    .filter("range", "quality", { gte: parseFloat(quality) })
    .agg("stats", "mad_neutral_state")
    .agg("stats", "log_likelihood")
    .agg("stats", "total_mapped_reads")
    .agg("stats", "coverage_breadth")
    .build();
  const localMaxResults = await client.search({
    index: `${analysis.toLowerCase()}_qc`,
    body: localMaxMinQuery.build()
  });
  return {
    order: localMaxResults.body.hits.hits.map(record => record["_source"]),
    numericalDataFilters: Object.keys(results.body.aggregations).map(agg => ({
      label:
        dataFilterLabelObj[
          agg
            .split("_")
            .splice(2, agg.length - 1)
            .join("_")
        ],
      name: agg,
      localStats: localMaxResults.body.aggregations[agg],
      stats: results.body.aggregations[agg]
    }))
  };
}
async function getHeatmapOrderByParam(analysis, params, quality) {
  const client = createSuperUserClient();
  var query = bodybuilder();

  const filters = params.map(param => {
    if (
      param["param"] === "experimental_condition" &&
      param["value"].indexOf(",") !== -1
    ) {
      query.addFilter("terms", param["param"], [param["value"].split(",")]);
    } else {
      query.addFilter("term", param["param"], param["value"]);
    }
  });

  query
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
async function getAllHeatmapOrder(analysis, quality) {
  const client = createSuperUserClient();
  const query = bodybuilder()
    .size(5)
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
    //.agg("terms", "cell_call", { size: 1000, order: { _term: "asc" } })
    .agg("terms", "state_mode", { size: 1000, order: { _term: "asc" } })
    .agg("terms", "clone_id", { size: 1000, order: { _term: "asc" } })
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
