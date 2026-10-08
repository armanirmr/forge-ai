import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

type ProductHeaderProps = {
  active?: "repositories" | "analytics" | "settings";
  children?: ReactNode;
};

export function ProductHeader({ active = "repositories", children }: ProductHeaderProps) {
  return (
    <header className="border-b border-border bg-card text-card-foreground">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-8 px-4 sm:px-6">
        <Link href="/repositories" className="flex shrink-0 items-center gap-2.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span aria-hidden="true" className="grid size-8 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">F</span>
          <span className="text-lg font-semibold tracking-tight">ForgeAI</span>
        </Link>

        <nav aria-label="Main navigation" className="flex h-full items-center gap-1">
          <Link
            href="/repositories"
            aria-current={active === "repositories" ? "page" : undefined}
            className={`flex h-full items-center border-b-2 px-3 text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
              active === "repositories"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Repositories
          </Link>
          <Link
            href="/analytics"
            aria-current={active === "analytics" ? "page" : undefined}
            className={`flex h-full items-center border-b-2 px-3 text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
              active === "analytics"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Analytics
          </Link>
          <Link
            href="/settings"
            aria-current={active === "settings" ? "page" : undefined}
            className={`flex h-full items-center border-b-2 px-3 text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
              active === "settings"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Settings
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {children}
          <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
            <Button variant="outline" size="sm" type="submit">Sign out</Button>
          </form>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
