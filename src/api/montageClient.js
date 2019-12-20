const elasticsearch = require("elasticsearch");

const HOST = process.env.HOST || "localhost";
const client = new elasticsearch.Client({
  host: HOST + ":" + "2212"
});

export default client;
