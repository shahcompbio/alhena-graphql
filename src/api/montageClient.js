const { Client } = require("@elastic/elasticsearch");

const HOST = process.env.HOST || "localhost";
const client = new Client({
  node: "http://localhost:" + "2212"
  //  node: "http://frontend:2212"
});

export default client;
