export type OAuthAccountIdentity = {
	provider?: string;
	providerAccountId?: string;
};

/** Auth.js creates a new user UUID for OAuth sign-ins without a database adapter. */
export function stableUserSubject(
	tokenSubject: string | undefined,
	account?: OAuthAccountIdentity | null,
): string | undefined {
	if (account?.provider === "github" && account.providerAccountId) {
		return account.providerAccountId;
	}
	return tokenSubject;
}
