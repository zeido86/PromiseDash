import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { AuthForm } from "@/components/auth-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authOptions } from "@/lib/auth";

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    redirect("/dashboard");
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_#ffffff15,_transparent_45%)]" />
      <Card className="relative z-10 w-full max-w-md border-white/10 bg-card/95 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-2xl">PromisesDash</CardTitle>
          <p className="text-sm text-muted-foreground">
            Personliga loften, vanor och mal i en modern dashboard.
          </p>
        </CardHeader>
        <CardContent>
          <AuthForm />
        </CardContent>
      </Card>
    </div>
  );
}
