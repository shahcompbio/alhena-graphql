var Redis = require("ioredis");
var redis = process.env.REDIS_HOST
  ? new Redis({ host: process.env.REDIS_HOST, port: process.env.REDIS_PORT })
  : process.env.HOST
  ? new Redis({ host: "redis" })
  : new Redis({});

export default redis;
