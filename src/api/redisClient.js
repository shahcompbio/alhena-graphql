var Redis = require("ioredis");
var redis = process.env.HOST ? new Redis({ host: "redis" }) : new Redis({});

export default redis;
