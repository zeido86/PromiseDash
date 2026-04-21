"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const loginSchema = z.object({
  identifier: z.string().min(3),
  password: z.string().min(8),
});

const registerSchema = z.object({
  username: z
    .string()
    .min(3, "Användarnamn måste vara minst 3 tecken")
    .max(30, "Användarnamn får max vara 30 tecken")
    .regex(/^[a-zA-Z0-9_]+$/, "Användarnamn får bara innehålla bokstäver, siffror och _"),
  name: z.string().min(2),
  email: z.email(),
  password: z.string().min(8),
});

type LoginValues = z.infer<typeof loginSchema>;
type RegisterValues = z.infer<typeof registerSchema>;

export function AuthForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: "", password: "" },
  });

  const registerForm = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { username: "", name: "", email: "", password: "" },
  });

  async function onLogin(values: LoginValues) {
    setError(null);
    setIsLoading(true);
    const result = await signIn("credentials", { ...values, redirect: false });
    setIsLoading(false);

    if (result?.error) {
      setError("Fel användarnamn/e-post eller losenord.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  async function onRegister(values: RegisterValues) {
    setError(null);
    setIsLoading(true);
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Registrering misslyckades.");
      setIsLoading(false);
      return;
    }

    await onLogin({ identifier: values.email, password: values.password });
  }

  return (
    <Tabs defaultValue="login" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="login">Logga in</TabsTrigger>
        <TabsTrigger value="register">Skapa konto</TabsTrigger>
      </TabsList>

      <TabsContent value="login" className="space-y-4">
        <form className="space-y-3" onSubmit={loginForm.handleSubmit(onLogin)}>
          <div className="space-y-2">
            <Label htmlFor="login-identifier">Användarnamn eller e-post</Label>
            <Input id="login-identifier" autoCapitalize="none" {...loginForm.register("identifier")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="login-password">Losenord</Label>
            <Input id="login-password" type="password" {...loginForm.register("password")} />
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Loggar in..." : "Logga in"}
          </Button>
        </form>
      </TabsContent>

      <TabsContent value="register" className="space-y-4">
        <form className="space-y-3" onSubmit={registerForm.handleSubmit(onRegister)}>
          <div className="space-y-2">
            <Label htmlFor="register-username">Användarnamn</Label>
            <Input id="register-username" autoCapitalize="none" {...registerForm.register("username")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="register-name">Namn</Label>
            <Input id="register-name" {...registerForm.register("name")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="register-email">E-post</Label>
            <Input id="register-email" type="email" {...registerForm.register("email")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="register-password">Losenord</Label>
            <Input id="register-password" type="password" {...registerForm.register("password")} />
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Skapar konto..." : "Skapa konto"}
          </Button>
        </form>
      </TabsContent>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </Tabs>
  );
}
