import { building } from "$app/environment";
import { svelteKitHandler } from "better-auth/svelte-kit";
import type { Handle } from "@sveltejs/kit";
import { auth } from "./lib/auth.js";

export const handle: Handle = async ({ event, resolve }) => {
	if (!building) {
		// Populate locals.user and locals.session from Better Auth session
		const session = await auth.api.getSession({
			headers: event.request.headers,
		});

		if (session) {
			event.locals.user = {
				id: session.user.id,
				email: session.user.email,
				name: session.user.name,
				username: (session.user as { username?: string }).username ?? "",
			};
			event.locals.session = {
				id: session.session.id,
				userId: session.session.userId,
				expiresAt: session.session.expiresAt,
			};
		}
	}

	return svelteKitHandler({ event, resolve, auth, building });
};
