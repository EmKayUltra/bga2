import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";
import { jwt } from "better-auth/plugins";
import pg from "pg";

const { Pool } = pg;

export const auth = betterAuth({
	database: new Pool({
		connectionString: "postgres://bga2:secret@db:5432/bga2",
	}),
	emailAndPassword: {
		enabled: true,
	},
	plugins: [
		username(),
		jwt(),
	],
	basePath: "/api/auth",
	baseURL: "http://localhost:5173",
});

export default auth;
