const { Client } = require("@elastic/elasticsearch");

const HOST = process.env.HOST || "localhost";
const client = new Client({
  node: "http://" + HOST + ":" + "9200"
});

export default client;
