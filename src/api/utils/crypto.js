var crypto = require("crypto");

const generateSecurePathHash = (url, secret) => {
  if (!url || !secret) {
    return undefined;
  }

  var input = url + secret;
  /*  return crypto
    .createHash("md5")
    .update(input)
    .digest("hex");*/

  var binaryHash = crypto
    .createHash("md5")
    .update(input)
    .digest();

  var base64Value = new Buffer(binaryHash).toString("base64");
  return base64Value
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
};
export default generateSecurePathHash;
