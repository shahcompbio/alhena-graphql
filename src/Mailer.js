import redis from "./api/redisClient.js";
const { gql, AuthenticationError } = require("apollo-server");
import generateSecurePathHash from "./api/utils/crypto.js";
import mailer from "./api/mailerClient";

import _ from "lodash";

export const schema = gql`
  extend type Query {
    sendMail(recipient: Recipient!): Response
  }
  input Recipient {
    email: String!
    name: String!
    roles: String!
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
      //    const extension = "newUser";
      //    var secureUrl = generateSecurePathHash(extension, "createNewUserAlhena");
      var homePath = "https://" + process.env.SERVER_NAME + "/NewAccount";
      const redisSecretHash =
        Math.random()
          .toString(36)
          .substring(2, 15) +
        Math.random()
          .toString(36)
          .substring(2, 15);

      //  const finalUrl = homePath + secureUrl + "/" + redisSecretHash;
      const finalUrl = homePath + "/" + redisSecretHash;

      var mailResponse = await mailer(recipient, finalUrl);

      if (mailResponse.response.accepted.length > 0) {
        await redis.set(redisSecretHash, recipient.email);
        await redis.expireat(
          redisSecretHash,
          parseInt(+new Date() / 1000) + 86400
        );

        //store user roles

        await redis.set("roles_" + recipient.email, recipient.roles);
        await redis.expireat(
          "roles_" + recipient.email,
          parseInt(+new Date() / 1000) + 86400
        );
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
