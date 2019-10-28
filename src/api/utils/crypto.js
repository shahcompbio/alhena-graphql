var crypto = require("crypto");

const generateSecurePathHash = (expires, url, secret) => {
  if (!expires || !url || !secret) {
    return undefined;
  }

  var input = expires + url + " " + secret;
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
