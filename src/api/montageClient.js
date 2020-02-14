const { Client } = require("@elastic/elasticsearch");

const HOST = process.env.HOST || "localhost";
const client = new Client({
  node: "http://localhost:" + "9200"
  //  node: "http://frontend:2212"
});

export default client;
