import { NextRequest, NextResponse } from "next/server";
import { auditCode, cleanAiError, type AuditResult } from "@/lib/gemini";
import { auth } from "@/lib/auth";

type GitHubRepo = {
  description: string | null;
  language: string | null;
  topics: string[];
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  size: number;
  default_branch: string;
};

function computeFallback(data: GitHubRepo, readme: string): AuditResult {
  const techStack: string[] = [];
  if (data.language) techStack.push(data.language);
  if (data.topics) techStack.push(...data.topics.filter(Boolean));

  const topicLower = (data.topics || []).map((t) => t.toLowerCase());
  if (topicLower.includes("react") || topicLower.includes("nextjs") || readme.match(/react|next\.?js/i)) {
    if (!techStack.includes("React")) techStack.push("React");
  }
  if (topicLower.includes("typescript") || readme.match(/typescript/i))
    if (!techStack.includes("TypeScript")) techStack.push("TypeScript");
  if (topicLower.includes("python") || data.language === "Python")
    if (!techStack.includes("Python")) techStack.push("Python");
  if (readme.match(/prisma|postgres|mongodb|redis|mysql|sqlite/i)) {
    const d = readme.match(/(Prisma|PostgreSQL|Postgres|MongoDB|Redis|MySQL|SQLite)/g);
    if (d) d.forEach((t) => { if (!techStack.includes(t)) techStack.push(t); });
  }

  const raw = data.stargazers_count * 3 + Math.min(data.size / 10, 50) + (data.description ? 10 : 0);
  const capped = Math.min(Math.round(raw), 100);
  const overallScore = Math.max(capped, 25);
  const codeQuality = Math.max(Math.min(Math.round(55 + data.stargazers_count * 2), 90), 30);
  const documentation = data.description ? Math.min(75, 40 + (data.description.length / 10)) : 35;
  const bestPractices = Math.max(Math.min(Math.round(45 + data.stargazers_count * 1.5 + (data.topics?.length || 0) * 3), 85), 25);
  const performance = Math.max(Math.min(Math.round(60 + Math.max(0, 35 - data.size / 2000)), 90), 35);

  const strengths: string[] = [];
  if (data.stargazers_count > 5) strengths.push("Growing community interest with notable stars");
  if (data.description) strengths.push("Clear project description for discoverability");
  if (data.topics && data.topics.length > 0) strengths.push("Well-tagged with relevant topics");
  if (strengths.length === 0) strengths.push("Repository has a solid foundation to build upon");

  const suggestions: string[] = [];
  if (data.stargazers_count < 5) suggestions.push("Add a detailed README with setup instructions and badges");
  if (!data.description) suggestions.push("Add a repository description to improve discoverability");
  if (data.size > 50000) suggestions.push("Consider breaking this monolith into smaller packages");
  suggestions.push("Add CONTRIBUTING.md and issue templates for open source collaboration");
  if (data.open_issues_count > 10) suggestions.push("Address open issues to improve project health");

  const summary = data.description
    ? `${data.language || "Multi-language"} project with ${data.stargazers_count} stars and ${data.forks_count} forks. ${data.description}`
    : `Repository with ${data.stargazers_count} stars in ${data.language || "multiple languages"}.`;

  return {
    overallScore, codeQuality, documentation, bestPractices, performance,
    techStack: [...new Set(techStack)],
    strengths, suggestions, summary,
  };
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { repoUrl, repoName } = await request.json();
    if (!repoUrl || !repoName || typeof repoUrl !== "string" || typeof repoName !== "string")
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    if (repoUrl.length > 500 || repoName.length > 200)
      return NextResponse.json({ error: "Input too long" }, { status: 400 });

    const [repoRes, readmeRes, topicsRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${repoName}`, { headers: { Accept: "application/vnd.github.v3+json" } }),
      fetch(`https://api.github.com/repos/${repoName}/readme`, { headers: { Accept: "application/vnd.github.v3+json" } }).catch(() => null),
      fetch(`https://api.github.com/repos/${repoName}/topics`, { headers: { Accept: "application/vnd.github.mercy-preview+json" } }).catch(() => null),
    ]);

    if (!repoRes.ok) return NextResponse.json({ error: "Repository not found or is private" }, { status: 400 });

    const repoData = await repoRes.json();
    const description = repoData.description || "";

    let readme = "";
    if (readmeRes?.ok) {
      const readmeData = await readmeRes.json();
      readme = Buffer.from(readmeData.content, "base64").toString("utf-8");
    }

    let topics: string[] = [];
    if (topicsRes?.ok) {
      const topicsData = await topicsRes.json();
      topics = topicsData.names || [];
    }

    const githubData: GitHubRepo = {
      description: repoData.description, language: repoData.language, topics,
      stargazers_count: repoData.stargazers_count || 0, forks_count: repoData.forks_count || 0,
      open_issues_count: repoData.open_issues_count || 0, size: repoData.size || 0,
      default_branch: repoData.default_branch,
    };

    const branch = repoData.default_branch || "main";
    
    let projectContext = "";
    let sourceCode = "";
    let folderStructure = "";
    
    try {
      const treeRes = await fetch(`https://api.github.com/repos/${repoName}/git/trees/${branch}?recursive=1`, { headers: { Accept: "application/vnd.github.v3+json" } });
      if (treeRes.ok) {
        const treeData = await treeRes.json();
        const allFiles: any[] = treeData.tree || [];
        
        folderStructure = allFiles.slice(0, 50).map((f: any) => f.path.split("/").slice(0, 3).join("/")).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i).join("\n");
        
        const pkgFile = allFiles.find((f: any) => f.path === "package.json");
        if (pkgFile) {
          try {
            const pkgRes = await fetch(`https://raw.githubusercontent.com/${repoName}/${branch}/package.json`);
            if (pkgRes.ok) {
              const pkg = JSON.parse(await pkgRes.text());
              const deps = { ...pkg.dependencies, ...pkg.devDependencies };
              projectContext += `\n📦 Dependencies: ${Object.keys(deps).slice(0, 20).join(", ")}`;
              if (pkg.scripts) projectContext += `\n⚡ Scripts: ${Object.keys(pkg.scripts).slice(0, 8).join(", ")}`;
            }
          } catch {}
        }
        
        const priorityPatterns = [
          /^src\/(components|lib|hooks|pages|app)\/.*\.(ts|tsx|js|jsx)$/,
          /^[^\/]+\.(ts|tsx|js|jsx)$/,
          /\/index\.(ts|tsx|js|jsx)$/,
          /App\.(ts|tsx|js|jsx)$/,
          /main\.(ts|tsx|js|jsx|py|go|rs)$/,
          /entry|setup|config\.(ts|js)$/i,
        ];
        
        const isPriority = (path: string) => priorityPatterns.some(p => p.test(path));
        const isRelevant = (path: string) => !path.includes("node_modules") && !path.includes(".next") && !path.includes("dist") && !path.includes("test") && !path.includes("__") && 
          path.match(/\.(ts|tsx|js|jsx|py|go|rs|vue|svelte)$/) && allFiles.find(f => f.path === path)?.size < 30000;
        
        const sorted = [...allFiles].filter(isRelevant).sort((a, b) => {
          const aP = isPriority(a.path) ? 0 : 1;
          const bP = isPriority(b.path) ? 0 : 1;
          return aP - bP || a.path.localeCompare(b.path);
        });
        
        const filesToFetch = sorted.slice(0, 6);
        const fileContents = await Promise.all(filesToFetch.map(async (file) => {
          try {
            const fileRes = await fetch(`https://raw.githubusercontent.com/${repoName}/${branch}/${file.path}`);
            if (fileRes.ok) {
              const content = await fileRes.text();
              const trimmed = content.split("\n").filter(l => l.trim() && !l.trim().startsWith("//") && !l.trim().startsWith("/*") && !l.trim().startsWith("*")).slice(0, 80).join("\n");
              return { path: file.path, content: trimmed.slice(0, 1500) };
            }
          } catch {}
          return null;
        }));
        
        sourceCode = fileContents.filter(Boolean).map(f => `\n// ${f!.path}\n${f!.content}`).join("");
      }
    } catch {}

    const codeToAnalyze = `📦 ${repoName}
📝 ${description || "No description"}
🔧 Language: ${repoData.language || "Unknown"} | ⭐${repoData.stargazers_count} | 🍴${repoData.forks_count} | 🐛${repoData.open_issues_count}
🏷️ Topics: ${topics.join(", ") || "None"}
${projectContext}
📁 Dir structure: ${folderStructure.slice(0, 500)}
📖 README: ${readme.slice(0, 1500)}
📁 Structure:\n${folderStructure.slice(0, 800)}
📖 README:\n${readme.slice(0, 1500)}
💻 Code:\n${sourceCode.slice(0, 12000)}`;

    let result: AuditResult;
    let aiPowered = true;
    let aiError: string | null = null;

    try { result = await auditCode(codeToAnalyze, repoName); }
    catch (err) {
      aiError = cleanAiError(err);
      console.error("AI audit failed, falling back to GitHub data:", aiError);
      result = computeFallback(githubData, readme);
      aiPowered = false;
    }

    return NextResponse.json({ ...result, aiPowered, aiError, description, readme });
  } catch (error) {
    console.error("Audit error:", error);
    return NextResponse.json({ error: "Audit failed" }, { status: 500 });
  }
}
