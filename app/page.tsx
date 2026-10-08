import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";

export default async function Home() {
  const session = await auth();
  if (session) redirect("/repositories");

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 p-8">
      <h1 className="text-3xl font-semibold">Changeweft</h1>
      <p className="text-muted-foreground">
        AI-assisted software delivery with validation and human approval.
      </p>
      <form
        action={async () => {
          "use server";
          await signIn("github", { redirectTo: "/repositories" });
        }}
      >
        <Button type="submit">Sign in with GitHub</Button>
      </form>
    </main>
  );
}
