import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// Save or update career anchor results
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const { groupId, results, topAnchor } = body;

    if (!groupId || !results || !topAnchor) {
      return NextResponse.json(
        { error: "groupId, results, and topAnchor are required" },
        { status: 400 }
      );
    }

    // Verify user is a member of the group
    const membership = await prisma.groupMember.findUnique({
      where: { userId_groupId: { userId: session.id, groupId } },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "You are not a member of this group" },
        { status: 403 }
      );
    }

    const result = await prisma.careerAnchorResult.upsert({
      where: {
        userId_groupId: { userId: session.id, groupId },
      },
      create: {
        userId: session.id,
        groupId,
        results: JSON.stringify(results),
        topAnchor,
      },
      update: {
        results: JSON.stringify(results),
        topAnchor,
      },
    });

    return NextResponse.json({ result }, { status: 200 });
  } catch (error) {
    console.error("Save career anchor error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Get career anchor results for a group
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get("groupId");

    if (!groupId) {
      return NextResponse.json(
        { error: "groupId query parameter is required" },
        { status: 400 }
      );
    }

    const group = await prisma.assessmentGroup.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const hasAccess =
      group.professorId === session.id ||
      !!(await prisma.groupMember.findUnique({
        where: { userId_groupId: { userId: session.id, groupId } },
      }));

    if (!hasAccess) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const results = await prisma.careerAnchorResult.findMany({
      where: { groupId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const parsed = results.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.user.name,
      results: JSON.parse(r.results),
      topAnchor: r.topAnchor,
      aiReport: r.aiReport,
      createdAt: r.createdAt,
    }));

    const myResult = parsed.find((r) => r.userId === session.id) || null;

    return NextResponse.json({ results: parsed, myResult, role: session.role });
  } catch (error) {
    console.error("Get career anchor error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
