require("dotenv").config();
const { Client } = require("@elastic/elasticsearch");

const HOST = process.env.ELASTICSEARCH_HOST || process.env.HOST || "localhost";
const PORT =
  process.env.ELASTICSEARCH_PORT || process.env.CLIENT_PORT || "2212";

const URL = process.env.ELASTICSEARCH_NODE || "https://" + HOST + ":" + PORT;

const authClient = (user, password) =>
  new Client({
    //node: "https://localhost:2212",
    node: URL,
    auth: {
      username: user,
      password: password
    },
    ssl: { rejectUnauthorized: false }
  });

export default authClient;
