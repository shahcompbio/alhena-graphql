const { Client } = require("@elastic/elasticsearch");

const HOST = process.env.HOST || "localhost";
const PORT = process.env.CLIENT_PORT || "9200";
const client = new Client({
  node: "http://localhost:9200"
});

export default client;
