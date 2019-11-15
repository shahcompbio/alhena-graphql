const { Client } = require("@elastic/elasticsearch");

const HOST = process.env.HOST || "localhost";
const PORT = process.env.CLIENT_PORT || "2225";
const authClient = (user, password) =>
  new Client({
    node: "https://" + HOST + ":" + PORT,
    auth: {
      username: user,
      password: password
    },
    ssl: { rejectUnauthorized: false }
  });

export default authClient;
