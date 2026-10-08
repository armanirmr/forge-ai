import "server-only";
import { headers } from "next/headers";
import { getToken } from "next-auth/jwt";

/** Reads the provider credential from the encrypted Auth.js cookie on the server. */
export async function getGitHubAccessToken(): Promise<string | undefined> {
	const requestHeaders = await headers();
	const token = await getToken({
		req: { headers: requestHeaders },
		secret: process.env.NEXTAUTH_SECRET,
	});
	return typeof token?.accessToken === "string" ? token.accessToken : undefined;
}
