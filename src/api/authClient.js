const { Client } = require("@elastic/elasticsearch");

const HOST = process.env.HOST || "localhost";
const authClient = (user, password) =>
  new Client({
    node: "https://" + HOST + ":" + "2225",
    auth: {
      username: user,
      password: password
    },
    ssl: { rejectUnauthorized: false }
  });

export default authClient;
