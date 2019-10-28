const { Client } = require("@elastic/elasticsearch");

const HOST = process.env.HOST || "localhost";
const client = (authKey, authKeyID) =>
  new Client({
    node: "https://" + HOST + ":" + "2225",
    auth: {
      apiKey: {
        id: authKeyID,
        api_key: authKey
      }
    },
    ssl: { rejectUnauthorized: false }
  });

export default client;
