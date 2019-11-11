const { Client } = require("@elastic/elasticsearch");

const HOST = process.env.HOST || "localhost";
const authClient = (user, password) =>
  new Client({
    node: "https://" + HOST + ":" + process.env.CLIENT_PORT,
    auth: {
      username: user,
      password: password
    },
    ssl: { rejectUnauthorized: false }
  });

export default authClient;
