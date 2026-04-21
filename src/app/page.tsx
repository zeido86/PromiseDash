import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import Image from "next/image";

import { AuthForm } from "@/components/auth-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authOptions } from "@/lib/auth";
import logo from "../../Img/PDLogo.png";

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
          <Image src={logo} alt="PromisesDash logga" className="mb-4 h-12 w-auto object-contain" priority />
          <CardTitle className="text-2xl">PromisesDash</CardTitle>
        </CardHeader>
        <CardContent>
          <AuthForm />
        </CardContent>
      </Card>
    </div>
  );
}
