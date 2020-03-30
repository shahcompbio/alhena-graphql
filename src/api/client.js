const { Client } = require("@elastic/elasticsearch");

const HOST = process.env.HOST || "localhost";
const PORT = process.env.CLIENT_PORT || "2212";
const client = (authKey, authKeyID) =>
  new Client({
    //node: "https://localhost:2212",
    node: "https://" + HOST + ":" + PORT,
    auth: {
      apiKey: {
        id: authKeyID,
        api_key: authKey
      }
    },
    ssl: { rejectUnauthorized: false }
  });

export default client;
