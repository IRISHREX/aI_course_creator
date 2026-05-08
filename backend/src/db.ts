import dns from "dns";
import mongoose from "mongoose";
import { env } from "./env.js";

// Some Windows/DNS environments block Node's SRV resolution for MongoDB Atlas.
// Force Node to use public resolvers before connecting.
dns.setServers(["8.8.8.8", "1.1.1.1"]);

mongoose.set("strictQuery", true);

export async function connectDb() {
  await mongoose.connect(env.DATABASE_URL);
}

export { mongoose };
