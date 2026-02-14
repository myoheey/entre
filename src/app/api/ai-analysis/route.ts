import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import {
  careerAnchorCategories,
  anchorDescriptions,
  anchorFullNames,
} from "@/lib/phase-data";

const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { resultId } = await request.json();
    if (!resultId) {
      return NextResponse.json({ error: "resultId is required" }, { status: 400 });
    }

    const result = await prisma.careerAnchorResult.findUnique({
      where: { id: resultId },
      include: { user: { select: { name: true } } },
    });

    if (!result || result.userId !== session.id) {
      return NextResponse.json({ error: "Result not found" }, { status: 404 });
    }

    // If already has AI report, return it
    if (result.aiReport) {
      return NextResponse.json({ report: result.aiReport });
    }

    const scores = JSON.parse(result.results) as Record<string, number>;
    const sorted = [...careerAnchorCategories].sort(
      (a, b) => (scores[b.key] || 0) - (scores[a.key] || 0)
    );
    const top3 = sorted.slice(0, 3);
    const bottom3 = sorted.slice(-3).reverse();

    const scoresSummary = sorted
      .map((cat) => `- ${anchorFullNames[cat.key]}: ${(scores[cat.key] || 0).toFixed(1)}점 / 6점`)
      .join("\n");

    const top3Summary = top3
      .map((cat) => `- ${anchorFullNames[cat.key]} (${(scores[cat.key] || 0).toFixed(1)}점): ${anchorDescriptions[cat.key]}`)
      .join("\n");

    const bottom3Summary = bottom3
      .map((cat) => `- ${anchorFullNames[cat.key]} (${(scores[cat.key] || 0).toFixed(1)}점)`)
      .join("\n");

    const prompt = `당신은 커리어 컨설팅 전문가입니다. 아래는 "${result.user.name}" 님의 Edgar Schein 커리어 앵커 검사 결과입니다.

## 검사 결과 (6점 만점)
${scoresSummary}

## 상위 3개 앵커 (강점)
${top3Summary}

## 하위 3개 앵커
${bottom3Summary}

위 결과를 바탕으로 아래 형식에 맞춰 한국어로 상세한 커리어 분석 리포트를 작성해주세요.

---

# ${result.user.name} 님의 커리어 앵커 분석 리포트

## 1. 종합 프로필 요약
(이 사람의 커리어 성향을 3-4문장으로 종합 요약)

## 2. 핵심 강점 분석
(상위 3개 앵커를 기반으로 구체적인 강점 3가지를 각각 상세하게 설명)

## 3. 성장 가능 영역 (약점)
(하위 앵커를 기반으로 보완이 필요한 영역 2-3가지를 건설적으로 설명)

## 4. 추천 직업 및 진로
(이 사람에게 적합한 구체적인 직업/직무를 10개 추천하고, 각각 왜 적합한지 1줄로 설명)

## 5. 커리어 개발 조언
(향후 커리어를 발전시키기 위한 구체적인 행동 제안 3-4가지)

---
리포트는 전문적이면서도 따뜻한 톤으로 작성하고, 구체적인 예시와 실용적인 조언을 포함해주세요.`;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI 서비스가 설정되지 않았습니다. 관리자에게 문의하세요." },
        { status: 503 }
      );
    }

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 3000,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Gemini API error:", response.status, errorData);
      return NextResponse.json(
        { error: "AI 분석 중 오류가 발생했습니다." },
        { status: 500 }
      );
    }

    const data = await response.json();
    const report =
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "리포트 생성에 실패했습니다.";

    // Save the report to DB
    await prisma.careerAnchorResult.update({
      where: { id: resultId },
      data: { aiReport: report },
    });

    return NextResponse.json({ report });
  } catch (error) {
    console.error("AI analysis error:", error);
    return NextResponse.json({ error: "AI 분석 중 오류가 발생했습니다." }, { status: 500 });
  }
}
