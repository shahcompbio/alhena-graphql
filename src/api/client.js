const { Client } = require("@elastic/elasticsearch");

const HOST = process.env.HOST || "http://localhost";
const client = new Client({
  node: HOST + ":" + "9200"
});

export default client;

// const uri = process.env.URI;
// const {Client} = require("@elastic/elasticsearch");
// const client = new Client({node: ""});

// export const getAllAnalyses = async () => {
//   const {body} = await client.search({
//     index: "analyses",
//     size: 10000
//   });
//   return body.hits.hits;
// };
// export const getAllDashboards = async () => {
//   const {body} = await client.search({
//     index: "published_dashboards",
//     size: 10000
//   });
//   return body.hits.hits;
// };
