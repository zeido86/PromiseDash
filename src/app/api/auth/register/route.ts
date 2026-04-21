import { hash } from "bcryptjs";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validators";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ogiltig indata", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { username, name, email, password } = parsed.data;
    const normalizedEmail = email.toLowerCase();
    const normalizedUsername = username.trim().toLowerCase();

    const [existingEmail, existingUsername] = await Promise.all([
      prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      }),
      prisma.user.findUnique({
        where: { username: normalizedUsername },
        select: { id: true },
      }),
    ]);

    if (existingEmail) {
      return NextResponse.json({ error: "E-post finns redan" }, { status: 409 });
    }

    if (existingUsername) {
      return NextResponse.json({ error: "Användarnamnet är upptaget" }, { status: 409 });
    }

    const passwordHash = await hash(password, 12);

    const user = await prisma.user.create({
      data: {
        username: normalizedUsername,
        name,
        email: normalizedEmail,
        passwordHash,
      },
      select: { id: true, username: true, email: true, name: true },
    });

    return NextResponse.json(user, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Kunde inte skapa konto" }, { status: 500 });
  }
}
