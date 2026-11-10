import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { Pool } from "pg";
import { ac, roles } from "./access";

export const auth = betterAuth({
  database: new Pool({ connectionString: process.env.DATABASE_URL }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  plugins: [
    admin({
      ac,
      roles,
      defaultRole: "public",
      adminRoles: ["admin"],
    }),
  ],
});
