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
    <div className="relative min-h-screen bg-[#060814]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_#2da2ff40,_transparent_45%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,_#5b2dff33,_transparent_45%)]" />
      <main className="relative mx-auto w-full max-w-7xl space-y-6 px-4 py-8 md:px-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-white">Hej {session.user.name ?? "vanebyggare"}!</h1>
          <p className="text-blue-100/80">
            Din oversikt over loften, registreringar, vikt och kaloribank.
          </p>
        </header>
        <DashboardClient data={data} />
      </main>
    </div>
  );
}
