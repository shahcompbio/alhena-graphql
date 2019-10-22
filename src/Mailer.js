export default mailer;
import redis from "./api/redisClient.js";
const { gql, AuthenticationError } = require("apollo-server");

import { oneDayExpiryDate } from "./api/utils/config.js";

import mailer from "./api/mailerClient";

import _ from "lodash";

export const schema = gql`
  extend type Query {
    sendMail(recipient: Recipient!): Response
  }
  input Recipient {
    email: String!
    name: String!
  }
  type Response {
    response: String!
    rejected: [String]
    accepted: [String]
  }
`;

export const resolvers = {
  Query: {
    sendMail: async (_, { recipient }) => {
      var mailResponse = await mailer(recipient);

      if (mailResponse.response.accepted.length > 0) {
        await redis.set(
          mailResponse.secureUrl,
          mailResponse.response.accepted[0]
        );
        await redis.expireat(mailResponse.secureUrl, oneDayExpiryDate());
      }
      return mailResponse.response;
    }
  },
  Response: {
    response: root => root.messageId,
    rejected: root => root.rejected,
    accepted: root => root.accepted
  }
};
