"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  careerAnchorQuestions,
  careerAnchorCategories,
} from "@/lib/phase-data";

interface CareerAnchorSurveyProps {
  groupId: string;
  onComplete?: (results: Record<string, number>) => void;
}

const LIKERT_LABELS = [
  "전혀 아니다",
  "아니다",
  "약간 아니다",
  "약간 그렇다",
  "그렇다",
  "매우 그렇다",
];

const QUESTIONS_PER_PAGE = 5;

export default function CareerAnchorSurvey({
  groupId,
  onComplete,
}: CareerAnchorSurveyProps) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [currentPage, setCurrentPage] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [existingResults, setExistingResults] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [resultId, setResultId] = useState<string | null>(null);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const totalQuestions = careerAnchorQuestions.length;
  const totalPages = Math.ceil(totalQuestions / QUESTIONS_PER_PAGE);
  const answeredCount = Object.keys(answers).length;
  const progress = (answeredCount / totalQuestions) * 100;

  useEffect(() => {
    async function loadExisting() {
      try {
        const res = await fetch(`/api/career-anchor?groupId=${groupId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.myResult) {
            setExistingResults(data.myResult.results);
            setResultId(data.myResult.id);
            setAiReport(data.myResult.aiReport || null);
            setShowResults(true);
          }
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    loadExisting();
  }, [groupId]);

  const currentQuestions = useMemo(() => {
    const start = currentPage * QUESTIONS_PER_PAGE;
    return careerAnchorQuestions.slice(start, start + QUESTIONS_PER_PAGE).map(
      (q, i) => ({ index: start + i, text: q })
    );
  }, [currentPage]);

  const canGoNext = useMemo(() => {
    return currentQuestions.every((q) => answers[q.index] !== undefined);
  }, [currentQuestions, answers]);

  const allAnswered = answeredCount === totalQuestions;

  const handleAnswer = useCallback((questionIndex: number, value: number) => {
    setAnswers((prev) => ({ ...prev, [questionIndex]: value }));
  }, []);

  const results = useMemo(() => {
    if (existingResults) return existingResults;
    if (!allAnswered) return null;
    const categoryResults: Record<string, number> = {};
    for (const cat of careerAnchorCategories) {
      const sum = cat.questions.reduce((acc, qIdx) => acc + (answers[qIdx] || 0), 0);
      categoryResults[cat.key] = Math.round((sum / cat.questions.length) * 100) / 100;
    }
    return categoryResults;
  }, [answers, allAnswered, existingResults]);

  const sortedCategories = useMemo(() => {
    if (!results) return [];
    return [...careerAnchorCategories].sort((a, b) => (results[b.key] || 0) - (results[a.key] || 0));
  }, [results]);

  const maxScore = 6;

  const handleSubmit = useCallback(() => {
    if (!results) return;
    setShowResults(true);
  }, [results]);

  const handleSave = useCallback(async () => {
    if (!results) return;
    setSaving(true);
    const topAnchor = [...careerAnchorCategories].sort(
      (a, b) => (results[b.key] || 0) - (results[a.key] || 0)
    )[0].key;
    try {
      const res = await fetch("/api/career-anchor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, results, topAnchor }),
      });
      if (res.ok) {
        const data = await res.json();
        setSaved(true);
        setResultId(data.result.id);
        onComplete?.(results);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }, [results, groupId, onComplete]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <svg className="animate-spin w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (showResults && results) {
    return (
      <div className="animate-fade-in">
        <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
          <h2 className="text-xl font-semibold text-slate-900 mb-1">커리어 앵커 검사 결과</h2>
          <p className="text-sm text-slate-500 mb-6">Career Anchor Assessment Results</p>
          <div className="mb-8">
            <div className="flex flex-col gap-3">
              {sortedCategories.map((cat) => {
                const score = results[cat.key] || 0;
                const percentage = (score / maxScore) * 100;
                return (
                  <div key={cat.key} className="flex items-center gap-3">
                    <div className="w-28 text-right">
                      <span className="text-sm font-medium text-slate-900">{cat.name}</span>
                    </div>
                    <div className="flex-1 h-7 bg-slate-100 rounded-md overflow-hidden relative">
                      <div
                        className="h-full rounded-md transition-all duration-700 ease-out flex items-center justify-end pr-3"
                        style={{ width: `${Math.max(percentage, 5)}%`, backgroundColor: cat.color }}
                      >
                        <span className="text-xs font-semibold text-white">{score.toFixed(1)}</span>
                      </div>
                    </div>
                    <div className="w-10 text-right">
                      <span className="text-xs text-slate-400">/ {maxScore}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex justify-center mb-8">
            <div className="relative w-64 h-64">
              {[1, 2, 3, 4, 5, 6].map((ring) => (
                <div key={ring} className="absolute rounded-full border border-slate-200" style={{ width: `${(ring / 6) * 100}%`, height: `${(ring / 6) * 100}%`, left: `${50 - (ring / 6) * 50}%`, top: `${50 - (ring / 6) * 50}%` }} />
              ))}
              {careerAnchorCategories.map((cat, i) => {
                const score = results[cat.key] || 0;
                const angle = (i / careerAnchorCategories.length) * 2 * Math.PI - Math.PI / 2;
                const radius = (score / maxScore) * 48;
                const labelRadius = 55;
                const x = 50 + radius * Math.cos(angle);
                const y = 50 + radius * Math.sin(angle);
                const labelX = 50 + labelRadius * Math.cos(angle);
                const labelY = 50 + labelRadius * Math.sin(angle);
                return (
                  <div key={cat.key}>
                    <div className="absolute w-3 h-3 rounded-full border-2 border-white shadow-sm z-10" style={{ backgroundColor: cat.color, left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }} />
                    <div className="absolute text-[9px] font-medium text-slate-500 whitespace-nowrap" style={{ left: `${labelX}%`, top: `${labelY}%`, transform: "translate(-50%, -50%)" }}>{cat.name}</div>
                    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100">
                      <line x1="50" y1="50" x2={x} y2={y} stroke={cat.color} strokeWidth="1.5" opacity="0.4" />
                    </svg>
                  </div>
                );
              })}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100">
                <polygon points={careerAnchorCategories.map((cat, i) => { const score = results[cat.key] || 0; const angle = (i / careerAnchorCategories.length) * 2 * Math.PI - Math.PI / 2; const radius = (score / maxScore) * 48; return `${50 + radius * Math.cos(angle)},${50 + radius * Math.sin(angle)}`; }).join(" ")} fill="rgba(37, 99, 235, 0.12)" stroke="rgba(37, 99, 235, 0.5)" strokeWidth="1.5" />
              </svg>
            </div>
          </div>
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-slate-900">상위 3개 커리어 앵커</h3>
            {sortedCategories.slice(0, 3).map((cat, i) => (
              <div key={cat.key} className="flex items-start gap-3 p-4 rounded-lg bg-white border border-slate-200" style={{ borderLeftWidth: "4px", borderLeftColor: cat.color }}>
                <div className="flex items-center justify-center w-7 h-7 rounded-lg text-white text-xs font-semibold shrink-0" style={{ backgroundColor: cat.color }}>{i + 1}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-slate-900">{cat.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-md font-semibold" style={{ color: cat.color, backgroundColor: `${cat.color}12` }}>{(results[cat.key] || 0).toFixed(1)}점</span>
                  </div>
                  <p className="text-sm text-slate-500 leading-relaxed">{getAnchorDescription(cat.key)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        {!existingResults && (
          <div className="flex justify-center gap-3">
            <button onClick={() => { setShowResults(false); setExistingResults(null); }} className="btn-outline">다시 검사하기</button>
            <button onClick={handleSave} disabled={saving || saved} className="btn-primary px-8 disabled:opacity-60">
              {saved ? "저장 완료!" : saving ? "저장 중..." : "결과 저장하기"}
            </button>
          </div>
        )}
        {existingResults && !aiReport && !generating && (
          <div className="text-center"><p className="text-sm text-slate-400">이미 검사를 완료했습니다.</p></div>
        )}
        {/* AI Report Section */}
        {(saved || existingResults) && resultId && (
          <div className="bg-white rounded-lg border border-slate-200 p-6 mt-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">AI 커리어 분석 리포트</h3>
                <p className="text-sm text-slate-500 mt-0.5">강점, 약점, 추천 직업을 AI가 분석합니다</p>
              </div>
              {!aiReport && !generating && (
                <button
                  onClick={async () => {
                    setGenerating(true);
                    try {
                      const res = await fetch("/api/ai-analysis", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ resultId }),
                      });
                      if (res.ok) {
                        const data = await res.json();
                        setAiReport(data.report);
                      } else {
                        const data = await res.json();
                        alert(data.error || "AI 분석 생성에 실패했습니다.");
                      }
                    } catch {
                      alert("서버 연결에 실패했습니다.");
                    } finally {
                      setGenerating(false);
                    }
                  }}
                  className="btn-primary text-sm"
                >
                  AI 분석 생성
                </button>
              )}
            </div>
            {generating && (
              <div className="text-center py-12">
                <svg className="animate-spin w-10 h-10 text-blue-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="text-slate-500">AI가 커리어 분석 리포트를 작성하고 있습니다...</p>
                <p className="text-sm text-slate-400 mt-1">약 10-20초 소요됩니다</p>
              </div>
            )}
            {aiReport && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-6">
                {aiReport.split("\n").map((line, i) => {
                  if (line.startsWith("# ")) return <h2 key={i} className="text-xl font-bold text-slate-900 mb-4 mt-0">{line.slice(2)}</h2>;
                  if (line.startsWith("## ")) return <h3 key={i} className="text-lg font-semibold text-slate-900 mt-6 mb-3">{line.slice(3)}</h3>;
                  if (line.startsWith("### ")) return <h4 key={i} className="text-base font-semibold text-slate-800 mt-4 mb-2">{line.slice(4)}</h4>;
                  if (line.startsWith("---")) return <hr key={i} className="my-4 border-slate-300" />;
                  if (line.startsWith("- ") || line.startsWith("* ")) {
                    return (
                      <div key={i} className="flex gap-2 mb-1.5 ml-2">
                        <span className="text-slate-400 shrink-0">&bull;</span>
                        <p className="text-sm text-slate-700 leading-relaxed">{renderBold(line.slice(2))}</p>
                      </div>
                    );
                  }
                  if (line.match(/^\d+\.\s/)) {
                    const content = line.replace(/^\d+\.\s/, "");
                    return (
                      <div key={i} className="flex gap-2 mb-1.5 ml-2">
                        <span className="text-slate-500 shrink-0 text-sm font-medium">{line.match(/^\d+/)?.[0]}.</span>
                        <p className="text-sm text-slate-700 leading-relaxed">{renderBold(content)}</p>
                      </div>
                    );
                  }
                  if (line.trim() === "") return <div key={i} className="h-2" />;
                  return <p key={i} className="text-sm text-slate-700 leading-relaxed mb-2">{renderBold(line)}</p>;
                })}
              </div>
            )}
            {!aiReport && !generating && (
              <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-lg">
                <div className="text-3xl mb-3">&#x1F916;</div>
                <h4 className="font-semibold text-slate-900 mb-1">AI 분석 리포트를 생성해보세요</h4>
                <p className="text-sm text-slate-500">검사 결과를 기반으로 강점, 약점, 추천 직업을 분석합니다</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-slate-500">진행률: {answeredCount} / {totalQuestions}</span>
          <span className="text-sm font-semibold text-blue-600">{Math.round(progress)}%</span>
        </div>
        <div className="w-full h-2 bg-slate-100 rounded-lg overflow-hidden">
          <div className="h-full rounded-lg transition-all duration-300 bg-blue-600" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex justify-between mt-1.5">
          <span className="text-xs text-slate-400">Page {currentPage + 1} / {totalPages}</span>
          <span className="text-xs text-slate-400">6점 척도 (1=전혀 아니다, 6=매우 그렇다)</span>
        </div>
      </div>
      <div className="space-y-4 mb-6">
        {currentQuestions.map((q) => (
          <div key={q.index} className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="flex items-start gap-3 mb-4">
              <span className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg bg-blue-50 text-blue-600 text-xs font-semibold">{q.index + 1}</span>
              <p className="text-sm font-medium text-slate-900 pt-0.5 leading-relaxed">{q.text}</p>
            </div>
            <div className="grid grid-cols-6 gap-1.5 ml-10">
              {LIKERT_LABELS.map((label, i) => {
                const value = i + 1;
                const isSelected = answers[q.index] === value;
                return (
                  <button key={value} onClick={() => handleAnswer(q.index, value)} className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-lg border transition-colors text-center ${isSelected ? "border-blue-600 bg-blue-50" : "border-slate-200 bg-white hover:border-blue-300"}`}>
                    <span className={`text-lg font-semibold ${isSelected ? "text-blue-600" : "text-slate-400"}`}>{value}</span>
                    <span className={`text-[10px] leading-tight ${isSelected ? "text-blue-600 font-medium" : "text-slate-400"}`}>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <button onClick={() => setCurrentPage((p) => Math.max(0, p - 1))} disabled={currentPage === 0} className="btn-outline disabled:opacity-40 disabled:cursor-not-allowed">이전</button>
        <div className="flex gap-1.5">
          {Array.from({ length: totalPages }, (_, i) => (
            <button key={i} onClick={() => setCurrentPage(i)} className={`w-2 h-2 rounded-full transition-colors ${i === currentPage ? "bg-blue-600" : "bg-slate-200 hover:bg-slate-300"}`} />
          ))}
        </div>
        {currentPage < totalPages - 1 ? (
          <button onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))} disabled={!canGoNext} className="btn-primary text-sm disabled:opacity-40 disabled:cursor-not-allowed">다음</button>
        ) : (
          <button onClick={handleSubmit} disabled={!allAnswered} className="btn-primary text-sm disabled:opacity-40 disabled:cursor-not-allowed">결과 보기</button>
        )}
      </div>
    </div>
  );
}

function getAnchorDescription(key: string): string {
  const descriptions: Record<string, string> = {
    TF: "특정 분야의 전문성을 깊이 있게 발전시키는 것에 가치를 둡니다. 자신의 전문 분야에서 최고가 되는 것을 목표로 하며, 기술적 역량의 성장이 핵심 동기입니다.",
    GM: "조직을 이끌고 관리하는 역할에서 보람을 찾습니다. 높은 직위와 영향력을 추구하며, 팀의 성과를 만들어내는 리더십이 핵심 역량입니다.",
    AU: "자유롭고 독립적인 업무 환경을 중시합니다. 규칙에 얽매이지 않고 자신만의 방식으로 일하는 것을 선호하며, 창의적이고 자율적인 환경에서 능력을 발휘합니다.",
    SE: "안정적이고 예측 가능한 환경을 추구합니다. 고용 안정성과 재정적 보장을 중요하게 여기며, 장기적인 안정을 기반으로 경력을 쌓아갑니다.",
    EC: "새로운 것을 창조하고 사업을 만들어내는 것에 열정이 있습니다. 혁신적인 아이디어를 실현시키고 무에서 유를 창조하는 기업가 정신이 핵심입니다.",
    SV: "사회에 기여하고 다른 사람들을 돕는 것에 큰 보람을 느낍니다. 세상을 더 나은 곳으로 만들고자 하는 봉사 정신과 사회적 가치 실현이 핵심 동기입니다.",
    CH: "끊임없이 새로운 도전을 추구합니다. 불가능해 보이는 일에 도전하고 경쟁에서 이기는 것에 동기부여를 받으며, 극한 상황에서 능력을 발휘합니다.",
    LS: "일과 삶의 균형을 가장 중요하게 생각합니다. 가족과의 시간, 취미, 여가를 충분히 즐길 수 있는 유연한 근무 환경을 추구합니다.",
  };
  return descriptions[key] || "";
}

function renderBold(text: string): React.ReactNode {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-slate-900">{part}</strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}
