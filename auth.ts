import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { stableUserSubject } from "@/lib/auth/identity";

export const { handlers, auth, signIn, signOut } = NextAuth({
	secret: process.env.NEXTAUTH_SECRET,
	// Cloudflare Workers are not automatically recognized by Auth.js as a trusted host.
	trustHost: true,
	providers: [
		GitHub({
			clientId: process.env.GITHUB_CLIENT_ID,
			clientSecret: process.env.GITHUB_CLIENT_SECRET,
			// Public-repository access supports imports and PRs. Private repositories
			// are not enabled because they would require the broader `repo` scope.
			authorization: { params: { scope: "read:user public_repo" } },
		}),
	],
	callbacks: {
		jwt({ token, account }) {
			// Without a database adapter Auth.js creates a new random user ID on every
			// OAuth sign-in. Use GitHub's stable account ID for all app ownership keys.
			token.sub = stableUserSubject(token.sub, account);
			if (account?.access_token) token.accessToken = account.access_token;
			return token;
		},
		session({ session, token }) {
			// Keep provider credentials in the encrypted JWT cookie, never in the
			// session response returned by /api/auth/session.
			if (session.user && token.sub) session.user.id = token.sub;
			return session;
		},
	},
});
