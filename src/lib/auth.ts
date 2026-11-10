import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { Pool } from "pg";
import { ac, roles } from "./access";
import { sanitizeSignupRole } from "./signup-roles";

export const auth = betterAuth({
  database: new Pool({ connectionString: process.env.DATABASE_URL }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "public",
        input: true,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => ({
          data: { ...user, role: sanitizeSignupRole(user.role) },
        }),
      },
    },
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
