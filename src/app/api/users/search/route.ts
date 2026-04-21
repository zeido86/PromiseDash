import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const rawQuery = searchParams.get("username") ?? searchParams.get("q") ?? "";
  const query = rawQuery.trim().toLowerCase();

  if (query.length < 2) {
    return NextResponse.json({ users: [] });
  }

  const users = await prisma.user.findMany({
    where: {
      id: { not: session.user.id },
      username: {
        not: null,
        startsWith: query,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      username: true,
      name: true,
    },
    orderBy: { username: "asc" },
    take: 10,
  });

  return NextResponse.json({ users });
}
