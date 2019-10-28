var nodemailer = require("nodemailer");
var fs = require("fs");
var handlebars = require("handlebars");

import generateSecurePathHash from "./utils/crypto.js";
import { oneDayExpiryDate } from "./utils/config.js";

const readHTMLFile = function(path, callback) {
  fs.readFile(path, { encoding: "utf-8" }, function(err, html) {
    if (err) {
      throw err;
      callback(err);
    } else {
      callback(null, html);
    }
  });
};

const transporter = (host, port, user, password) =>
  nodemailer.createTransport({
    host: host,
    port: port,
    secure: false, // upgrade later with STARTTLS
    auth: {
      user: user,
      pass: password
    },
    tls: {
      // do not fail on invalid certs
      rejectUnauthorized: false
    }
  });

const mailer = async recipient => {
  var tomorrow = oneDayExpiryDate();
  var path = generateSecurePathHash(tomorrow, "/NewAccount", "enigma");

  var homePath = "http://" + process.env.SERVER_NAME + "/NewAccount/";
  var secureUrl = "md5=" + path + "&expires=" + tomorrow;

  return new Promise((resolve, reject) => {
    readHTMLFile(
      __dirname + "/utils/emailTemplates/newUserTemplate.html",
      async function(err, html) {
        var template = handlebars.compile(html);
        var replacements = {
          name: recipient.name,
          secureUrl: homePath + secureUrl
        };
        var htmlToSend = template(replacements);
        var response = await transporter(
          process.env.MAIL_HOST,
          process.env.MAIL_PORT,
          process.env.MAIL_USER,
          process.env.MAIL_PASSWORD
        ).sendMail({
          from: process.env.ADMIN_EMAIL,
          to: recipient.email,
          subject: "Create Account",
          html: htmlToSend,
          attachments: [
            {
              filename: "logo.png",
              path: __dirname + "/utils/images/logo.png",
              cid: "logo"
            }
          ]
        });

        resolve({ response: response, secureUrl: secureUrl });
      }
    );
  });
};
export default mailer;
