const { Client } = require("@elastic/elasticsearch");

const HOST = process.env.HOST || "localhost";
const PORT = process.env.CLIENT_PORT || "2212";
const authClient = (user, password) =>
  new Client({
    node: "https://localhost:2212",
    //  node: "https://" + HOST + ":" + PORT,
    auth: {
      username: user,
      password: password
    },
    ssl: { rejectUnauthorized: false }
  });

export default authClient;
