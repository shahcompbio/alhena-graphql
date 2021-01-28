const { Client } = require("@elastic/elasticsearch");

const HOST = process.env.ELASTICSEARCH_HOST || process.env.HOST || "localhost";
const PORT =
  process.env.ELASTICSEARCH_PORT || process.env.CLIENT_PORT || "2212";

const URL = process.env.ELASTICSEARCH_NODE || "https://" + HOST + ":" + PORT;

const client = (authKey, authKeyID) =>
  new Client({
    node: URL,
    auth: {
      apiKey: {
        id: authKeyID,
        api_key: authKey
      }
    },
    ssl: { rejectUnauthorized: false }
  });

export default client;
