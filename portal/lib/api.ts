import axios from "axios";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "https://backend.nexapay.space",
  timeout: 15000,
});
