import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import Image from "next/image";

import { AuthForm } from "@/components/auth-form";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { authOptions } from "@/lib/auth";
import logo from "../../Img/PDLogo.png";

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    redirect("/dashboard");
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#060814] px-4 py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_#2da2ff55,_transparent_45%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,_#5b2dff44,_transparent_45%)]" />
      <Card className="relative z-10 w-full max-w-md border-[#2da2ff33] bg-[#0a1022]/95 backdrop-blur-sm">
        <CardHeader className="items-center">
          <Image src={logo} alt="PromisesDash logga" className="h-28 w-auto object-contain" priority />
        </CardHeader>
        <CardContent>
          <AuthForm />
        </CardContent>
      </Card>
    </div>
  );
}
