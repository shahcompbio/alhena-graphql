import axios from "axios";

const client = axios.create({
  baseURL: "https://colossus.canadacentral.cloudapp.azure.com/api",
  auth: {
    username: "alhena",
    password: "Montage!123"
  }
});

export default client;
