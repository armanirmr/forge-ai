import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

export const { handlers, auth, signIn, signOut } = NextAuth({
	secret: process.env.NEXTAUTH_SECRET,
	providers: [
		GitHub({
			clientId: process.env.GITHUB_CLIENT_ID,
			clientSecret: process.env.GITHUB_CLIENT_SECRET,
			// Least privilege for now: read public repos. PR creation (Phase 11)
			// will require a broader scope, which we'll request deliberately then.
			authorization: { params: { scope: "read:user public_repo" } },
		}),
	],
	callbacks: {
		jwt({ token, account }) {
			if (account?.access_token) token.accessToken = account.access_token;
			return token;
		},
		session({ session }) {
			// Keep provider credentials in the encrypted JWT cookie, never in the
			// session response returned by /api/auth/session.
			return session;
		},
	},
});
