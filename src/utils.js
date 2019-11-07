import authClient from "./api/authClient";
import redis from "./api/redisClient.js";

export const createSuperUserClient = () =>
  authClient(process.env.ES_USER, process.env.ES_PASSWORD);

export const getRedisApiKey = async auth =>
  await redis.get(auth.uid + ":" + auth.authKeyID);
