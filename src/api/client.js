const uri = process.env.URI;
const {Client} = require("@elastic/elasticsearch");
const client = new Client({node: ""});

export const getAllAnalyses = async () => {
  const {body} = await client.search({
    index: "analyses",
    size: 10000
  });
  return body.hits.hits;
};
export const getAllDashboards = async () => {
  const {body} = await client.search({
    index: "published_dashboards",
    size: 10000
  });
  return body.hits.hits;
};
