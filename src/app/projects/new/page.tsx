"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "@/lib/session";
import { useRouter } from "next/navigation";
import { Sparkles, GitBranch, Star, RefreshCw, Search, AlertCircle, ArrowLeft, ExternalLink, Bot, Zap, Check, ChevronDown, ChevronUp, Lightbulb, ThumbsUp } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { TechStack } from "@/components/tech-stack";
import { GradeBadge } from "@/components/grade-badge";
import { ScoreRadar } from "@/components/score-radar";
import { LoadingSpinner, FullPageLoading } from "@/components/loading-animation";
import { LottieAnimation } from "@/components/lottie-animation";

type Repo = { id: number; name: string; url: string; description: string | null; language: string | null; stars: number };

export default function NewProject() {
  const { session, loading: sessionLoading } = useSession();
  const router = useRouter();
  const resultsRef = useRef<HTMLDivElement>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [repoUrl, setRepoUrl] = useState("");
  const [repoSearch, setRepoSearch] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");

  useEffect(() => {
    if (!sessionLoading && !session) router.push("/signin");
  }, [session, sessionLoading, router]);
  useEffect(() => { if (session) fetchRepos(); }, [session]);
  useEffect(() => { if (result && resultsRef.current) resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" }); }, [result]);

  const fetchRepos = async () => {
    setLoadingRepos(true); setRepoError(null);
    try {
      const res = await fetch("/api/github/repos");
      if (!res.ok) { const err = await res.json(); setRepoError(err.error || "Failed"); return; }
      const rdata = await res.json(); setRepos(Array.isArray(rdata) ? rdata : []);
    } catch { setRepoError("Failed to fetch"); }
    finally { setLoadingRepos(false); }
  };

  const extractRepoName = (url: string) => { const m = url.match(/github\.com\/([^\/]+)\/([^\/]+)/); return m ? `${m[1]}/${m[2].replace(/\.git$/, "")}` : null; };

  const handleSelect = (repo: Repo) => {
    setSelectedRepo(repo); setResult(null); setAuditError(null); setAnalyzing(true); setRepoUrl(repo.url);
    analyzeRepo(repo.url);
  };

  const analyzeRepo = async (url: string) => {
    const repoName = extractRepoName(url);
    if (!repoName) { setAuditError("Invalid URL"); setAnalyzing(false); return; }
    try {
      const res = await fetch("/api/audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repoUrl: url, repoName }) });
      const data = await res.json();
      if (!res.ok) { setAuditError(data.error || "Failed"); setAnalyzing(false); return; }
      setResult(data);
    } catch { setAuditError("Failed to analyze"); }
    finally { setAnalyzing(false); }
  };

  const handleSave = async () => {
    if (!result) return; const repoName = extractRepoName(repoUrl); if (!repoName) return; setSaving(true);
    try {
      const res = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        name: repoName.split("/")[1], repoUrl,
        overallScore: result.overallScore, codeQuality: result.codeQuality, documentation: result.documentation,
        bestPractices: result.bestPractices, performance: result.performance,
        techStack: result.techStack, strengths: result.strengths, suggestions: result.suggestions,
        summary: result.summary || result.analysis || "Repository analyzed.", description: result.description || "", readme: result.readme || "",
      }) });
      if (!res.ok) { alert((await res.json()).error || "Failed"); return; }
      router.push(`/projects/${(await res.json()).id}`);
    } catch { alert("Failed"); }
    finally { setSaving(false); }
  };

  if (sessionLoading) return <FullPageLoading />;
  if (!session) return null;

  const filteredRepos = repoSearch ? repos.filter((r) => r.name.toLowerCase().includes(repoSearch.toLowerCase())) : repos;

  // Results view
  if (selectedRepo) {
    return (
      <div className="min-h-screen bg-[#050505]"><Navbar />
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
          <button onClick={() => { setSelectedRepo(null); setResult(null); setAuditError(null); setAnalyzing(false); }} className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to repository list</button>

          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 mb-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1"><GitBranch className="w-4 h-4 text-emerald-400 shrink-0" /><h2 className="font-semibold truncate">{selectedRepo.name}</h2></div>
                {selectedRepo.description && <p className="text-sm text-white/40 truncate mt-0.5">{selectedRepo.description}</p>}
                <div className="flex items-center gap-3 mt-2 text-xs text-white/30">{selectedRepo.language && <span>{selectedRepo.language}</span>}<span className="flex items-center gap-1"><Star className="w-3 h-3" />{selectedRepo.stars}</span></div>
              </div>
              <a href={selectedRepo.url} target="_blank" rel="noreferrer" className="shrink-0 p-2 bg-white/[0.06] rounded-lg hover:bg-white/[0.08] transition-colors"><ExternalLink className="w-4 h-4 text-white/40" /></a>
            </div>
            {analyzing && (
              <div className="mt-4 pt-4 border-t border-white/[0.06]">
                <LottieAnimation src="/animations/ai-processing.json" className="w-24 h-24 mx-auto opacity-80" />
                <LoadingSpinner text="Trying Gemini AI..." />
              </div>
            )}
            {auditError && <div className="mt-4 pt-4 border-t border-white/[0.06] flex items-start gap-2 text-red-400 text-sm"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{auditError}</span></div>}
          </div>

          <div ref={resultsRef}>
            {result && (
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
                <div className={`px-5 py-2.5 flex items-center gap-2 text-xs font-medium ${result.aiPowered ? "bg-emerald-500/10 text-emerald-400 border-b border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border-b border-amber-500/20"}`}>
                  {result.aiPowered ? <><Bot className="w-3.5 h-3.5" />AI audit completed</> : <><Zap className="w-3.5 h-3.5" />Gemini AI unavailable{result.aiError ? ` (${result.aiError})` : ""}</>}
                </div>
                <div className="p-5 border-b border-white/[0.06] flex items-center justify-between">
                  <div><h2 className="font-semibold">{result.aiPowered ? "AI Audit" : "GitHub Analysis"}</h2><span className="text-xs text-white/40">{result.aiPowered ? "Gemini 2.5 Flash" : "Repo metadata"}</span></div>
                  <GradeBadge score={result.overallScore || 0} size="lg" />
                </div>
                <div className="p-5 space-y-5">
                  <ScoreRadar
                    overallScore={result.overallScore || 0}
                    codeQuality={result.codeQuality || 0}
                    documentation={result.documentation || 0}
                    bestPractices={result.bestPractices || 0}
                    performance={result.performance || 0}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.06]">
                      <div className="text-xs text-white/40 mb-1 flex items-center gap-1"><ThumbsUp className="w-3 h-3" /> Tech Stack</div>
                      {result.techStack?.length > 0 ? <TechStack techs={result.techStack} limit={4} /> : <span className="text-xs text-white/30">Not detected</span>}
                    </div>
                    <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.06]">
                      <div className="text-xs text-white/40 mb-1 flex items-center gap-1"><Lightbulb className="w-3 h-3" /> Key Strengths</div>
                      {result.strengths?.length > 0 ? (
                        <ul className="space-y-1">{result.strengths.slice(0, 3).map((s: string, i: number) => <li key={i} className="flex items-start gap-1.5 text-xs text-white/60"><span className="w-1 h-1 rounded-full bg-emerald-400 shrink-0 mt-1.5" />{s}</li>)}</ul>
                      ) : <span className="text-xs text-white/30">N/A</span>}
                    </div>
                  </div>
                  {(result.summary || result.analysis) && <div><div className="text-xs text-white/40 uppercase tracking-wider mb-1.5">Summary</div><p className="text-sm text-white/70 leading-relaxed">{result.summary || result.analysis || "Repository analyzed."}</p></div>}
                  {result.suggestions?.length > 0 && (
                    <div><div className="text-xs text-white/40 uppercase tracking-wider mb-1.5">Suggestions</div>
                      <ul className="space-y-1.5">{result.suggestions.map((s: string, i: number) => <li key={i} className="flex items-start gap-2 text-sm text-white/60"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 mt-1.5" />{s}</li>)}</ul></div>
                  )}
                  <button onClick={handleSave} disabled={saving} className="w-full py-3 bg-white text-black font-semibold rounded-xl hover:bg-white/90 transition-all disabled:opacity-50 shadow-lg shadow-white/10 flex items-center justify-center gap-2">
                    {saving ? <LoadingSpinner size={18} /> : <Sparkles className="w-4 h-4" />}{saving ? "Saving..." : "Save Project to Profile"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // Repo list view
  return (
    <div className="min-h-screen bg-[#050505]"><Navbar />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8"><h1 className="text-2xl sm:text-3xl font-bold">Import Project</h1><p className="text-white/40 mt-1">Pick a repo or paste a URL to get an AI-powered audit</p></div>
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 sm:p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center shadow-lg shadow-emerald-500/20"><GitBranch className="w-4 h-4 text-black" /></div>
              <div><h2 className="font-semibold text-sm">Your Repositories</h2><p className="text-xs text-white/40">Click one to analyze</p></div>
            </div>
            <button onClick={fetchRepos} disabled={loadingRepos} className="p-2 text-white/30 hover:text-white/60 rounded-lg hover:bg-white/[0.06] transition-all"><RefreshCw className={`w-4 h-4 ${loadingRepos ? "animate-spin" : ""}`} /></button>
          </div>
          <div className="relative mb-3"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input type="text" value={repoSearch} onChange={(e) => setRepoSearch(e.target.value)} placeholder="Search..." className="w-full pl-9 pr-4 py-2 bg-[#050505] border border-white/[0.06] rounded-lg text-sm focus:border-emerald-500/50 focus:outline-none text-white/70 placeholder:text-white/20" /></div>
          {loadingRepos ? <LoadingSpinner text="Loading repos..." /> : repoError ? <div className="flex items-start gap-2 py-4 text-red-400 text-sm"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{repoError}</div> : filteredRepos.length === 0 ? (
            <div className="text-center py-8 text-white/30 text-sm">{repos.length === 0 ? "No repos found." : "No matches."}<button onClick={() => setShowManual(true)} className="text-emerald-400 hover:underline ml-1">Paste URL</button></div>
          ) : (
            <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
              {filteredRepos.map((repo) => (
                <button key={repo.id} type="button" onClick={() => handleSelect(repo)}
                  className="w-full text-left p-3 bg-[#050505] border border-white/[0.06] rounded-lg hover:border-emerald-500/40 hover:bg-white/[0.02] transition-all group">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0 group-hover:border-emerald-500/30 group-hover:bg-emerald-500/5 transition-all"><GitBranch className="w-3.5 h-3.5 text-white/30 group-hover:text-emerald-400 transition-colors" /></div>
                    <div className="min-w-0 flex-1"><div className="text-sm font-medium truncate group-hover:text-emerald-400 transition-colors">{repo.name}</div>{repo.description && <div className="text-xs text-white/30 truncate">{repo.description}</div>}</div>
                    <div className="flex items-center gap-2 text-xs text-white/30 shrink-0">{repo.language && <span>{repo.language}</span>}<span className="flex items-center gap-1"><Star className="w-3 h-3" />{repo.stars}</span></div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="text-center mb-4"><button type="button" onClick={() => setShowManual(!showManual)} className="text-xs text-white/30 hover:text-white/60 transition-colors">{showManual ? "Hide" : "Or paste a URL instead"}</button></div>
        {showManual && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 sm:p-5">
            <label className="block text-sm font-medium mb-2">GitHub URL</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input type="text" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://github.com/user/repo" className="flex-1 px-4 py-2.5 bg-[#050505] border border-white/[0.06] rounded-lg text-sm focus:border-emerald-500/50 focus:outline-none text-white/70 placeholder:text-white/20" />
              <button type="button" onClick={() => { setSelectedRepo({ id: 0, name: "", url: repoUrl, description: "", language: null, stars: 0 }); analyzeRepo(repoUrl); }} disabled={analyzing || !repoUrl}
                className="px-5 py-2.5 bg-white text-black text-sm font-semibold rounded-lg hover:bg-white/90 transition-all disabled:opacity-50 shadow-lg shadow-white/10 flex items-center justify-center gap-2">
                {analyzing ? <LoadingSpinner size={16} /> : <Sparkles className="w-4 h-4" />}Analyze</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
