import NextAuth from "next-auth";
import GithubProvider from "next-auth/providers/github";

export const authOptions = {
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      authorization: { params: { scope: "read:user repo" } },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, account }) {
      // Save the access token to the token object on sign in
      if (account) {
        token.accessToken = account.access_token;
      }
      return token;
    },
    async session({ session, token }) {
      // Add the access token to the session
      session.accessToken = token.accessToken;
      return session;
    },
    async redirect({ url, baseUrl }) {
      // Redirect to repos page after sign in
      if (url.startsWith(baseUrl)) {
        return url;
      }
      // Default redirect to repos page
      return `${baseUrl}/repos`;
    },
  },
};

// Create the NextAuth handler
const handler = NextAuth(authOptions);

// Export named HTTP methods
export { handler as GET, handler as POST };
