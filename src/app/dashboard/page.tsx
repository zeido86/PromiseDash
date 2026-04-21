import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { DashboardClient } from "@/components/dashboard-client";
import { authOptions } from "@/lib/auth";
import { getDashboardData } from "@/lib/dashboard";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/");
  }

  const data = await getDashboardData(session.user.id);

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 md:px-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Hej {session.user.name ?? "vanebyggare"}!</h1>
        <p className="text-muted-foreground">
          Din oversikt over loften, registreringar, vikt och kaloribank.
        </p>
      </header>
      <DashboardClient data={data} />
    </main>
  );
}
