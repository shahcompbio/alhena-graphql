const { Client } = require("@elastic/elasticsearch");

const HOST = process.env.HOST || "localhost";
const PORT = process.env.CLIENT_PORT || "2225";
const client = (authKey, authKeyID) =>
  new Client({
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
