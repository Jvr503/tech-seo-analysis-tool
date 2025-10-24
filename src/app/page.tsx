'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  CheckSquare, FileDown, Filter, ListChecks, RefreshCw,
  Info, Sparkles, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';

// ✅ Bundled dataset: no CSV required
import { BUNDLED_TEMPLATE } from '@/data/bundled_template';

// -------------------------------------------------------
// Tech SEO Analysis Tool — Bundled & Brand-styled (Propellic)
// - Loads ALL inspection elements from bundled_template.ts
// - Target Score locked to 9
// - Implementation includes N/A & blanks (excludes only 9)
// - Per-row "Generate recs" (Gemini API via /api/recommend)
// -------------------------------------------------------

/** Propellic brand tokens */
const BRAND = {
  midnightHex: '#152534',
  pinkHex: '#E21A6B',
  whiteHex: '#FFFFFF',
  plumHex: '#482342',
  roseHex: '#EB669C',
  blushHex: '#F7BFD5',
  burgundyHex: '#8F1F55',
};

// ✅ Contrast fixes: brighter foregrounds on dark bg
// (white text, higher-contrast inputs & buttons)
const HIGH_CONTRAST_TEXT = '#EEF3F6';  // near-white for readability
const MUTED_TEXT = 'rgba(255,255,255,0.92)';

const INCLUDE_NA_IN_IMPLEMENTATION = true; // include N/A; exclude only score=9
const TARGET_FIXED = '9';

const IMPLEMENTER_OPTIONS = [
  'Developer',
  'Site Editor',
  'Client',
  'Client/Developer',
  'Propellic',
];

const ISSUE_CATEGORY_OPTIONS = [
  '1- Accessibility',
  '2- Page Speed',
  '3- Mobile Condition',
  '4- Content',
  '5- Social',
  '6- Link Issues',
  '7- Other',
  '8- Local Search',
];

// Radix/ shadcn Select.Item cannot use an empty-string value
const SCORE_OPTIONS = ['N/A', '1','2','3','4','5','6','7','8','9'];

// ---------- utils ----------
function sanitizeScore(val: any) {
  if (val === null || val === undefined) return '';
  const s = String(val).trim();
  if (s.toUpperCase() === 'N/A') return 'N/A';
  if (!s) return '';
  const n = Number(s);
  if (!Number.isFinite(n)) return '';
  return String(Math.min(9, Math.max(1, Math.round(n))));
}
function inferSeverity(score: string) {
  if (score === '' || score === 'N/A') return 0;
  const n = Number(score);
  if (!Number.isFinite(n)) return 0;
  return 10 - n; // 9 => 1, 1 => 9
}
function csvEscape(val: any) {
  const s = (val ?? '').toString();
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function downloadCSV(filename: string, rows: any[]) {
  const headers = [
    'X/√','INSPECTION ELEMENT','PRIORITY','ISSUE CATEGORY',
    'ISSUE SUB-CATEGORY','SKILLSET','SCORE','TARGET SCORE',
    'ANALYSIS','RECOMMENDATIONS','IMPLEMENTER'
  ];
  const lines = [headers.join(',')];
  for (const r of rows) {
    const line = [
      r.check ? 'TRUE' : 'FALSE',
      r.inspectionElement,
      r.priority || '',
      r.issueCategory,
      r.issueSubCategory,
      r.skillset,
      r.score || '',
      TARGET_FIXED,
      r.analysis,
      r.recommendations,
      r.implementer || '',
    ].map(csvEscape).join(',');
    lines.push(line);
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 400);
}

function runTests(templateSource: string) {
  const results: {name: string; status: 'pass'|'fail'; msg?: string}[] = [];
  const pass = (n: string, m = '') => results.push({ name: n, status: 'pass', msg: m });
  const fail = (n: string, m: string) => results.push({ name: n, status: 'fail', msg: m });
  try {
    if (!SCORE_OPTIONS.includes('')) pass('No empty score option'); else fail('No empty score option', JSON.stringify(SCORE_OPTIONS));
    if (TARGET_FIXED === '9') pass('Target fixed to 9'); else fail('Target fixed to 9', TARGET_FIXED);
    if (Array.isArray(BUNDLED_TEMPLATE) && BUNDLED_TEMPLATE.length > 50) pass('Bundled template loaded', `rows=${BUNDLED_TEMPLATE.length}`); else fail('Bundled size', String(BUNDLED_TEMPLATE?.length ?? 0));
    pass('Source', templateSource);
  } catch (e: any) { fail('Runtime tests error', String(e)); }
  return results;
}

export default function TechSEOAnalysisTool() {
  const [data, setData] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [templateSource, setTemplateSource] = useState<'bundled'|'localStorage'>('bundled');
  const [tests, setTests] = useState(() => runTests('init'));
  const [loadingId, setLoadingId] = useState<number | null>(null);

  // Load from localStorage; otherwise use bundled template
  useEffect(() => {
    try {
      const raw = localStorage.getItem('tsa.template.data');
      if (raw) {
        setData(JSON.parse(raw));
        setTemplateSource('localStorage');
        setTests(runTests('localStorage'));
        return;
      }
    } catch {}
    setData([...BUNDLED_TEMPLATE]);
    setTemplateSource('bundled');
    setTests(runTests('bundled'));
  }, []);

  // Persist to localStorage on change
  useEffect(() => { try { localStorage.setItem('tsa.template.data', JSON.stringify(data)); } catch {} }, [data]);

  const onChangeField = (id: number, key: string, value: any) => {
    setData((rows) => rows.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
  };

  const resetToBundled = () => {
    setData([...BUNDLED_TEMPLATE]);
    setTemplateSource('bundled');
    try { localStorage.removeItem('tsa.template.data'); } catch {}
  };

  const filtered = useMemo(() => {
    let rows = data;
    if (filterCat !== 'all') rows = rows.filter((r) => (r.issueCategory || '').toLowerCase() === filterCat.toLowerCase());
    if (q.trim()) {
      const n = q.trim().toLowerCase();
      rows = rows.filter((r) =>
        (r.inspectionElement || '').toLowerCase().includes(n) ||
        (r.analysis || '').toLowerCase().includes(n) ||
        (r.recommendations || '').toLowerCase().includes(n)
      );
    }
    return rows;
  }, [data, q, filterCat]);

  const implementationRows = useMemo(() => (
    data
      .filter((r) => r.score !== '9' && (INCLUDE_NA_IN_IMPLEMENTATION ? true : r.score !== 'N/A'))
      .map((r) => ({ ...r, severity: inferSeverity(r.score) }))
      .sort((a,b) => (Number(a.priority||999) - Number(b.priority||999)) || b.severity - a.severity)
  ), [data]);

  const autoPrioritize = () => {
    const ranked = [...implementationRows]
      .sort((a,b) => b.severity - a.severity)
      .map((r, i) => ({ id: r.id, priority: String(i+1) }));
    setData((rows) => rows.map((r) => ({ ...r, priority: ranked.find(x => x.id===r.id)?.priority || r.priority })));
  };

  // --- Generate recommendations (server route uses Gemini) ---
  async function generateRecs(row: any) {
    try {
      setLoadingId(row.id);
      // If score is 9, drop a generic short rec without calling the model
      if (String(row.score) === '9') {
        const generic = `No action needed. This inspection element meets best practices. Continue to monitor and keep parity with Target Score ${TARGET_FIXED}.`;
        onChangeField(row.id, 'recommendations', generic);
        return;
      }
      const resp = await fetch('/api/recommend', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          analysis: row.analysis || '',
          score: row.score || '',
          element: row.inspectionElement || '',
          category: row.issueCategory || '',
          subcategory: row.issueSubCategory || '',
        }),
      });
      const json = await resp.json();
      const rec = json?.recommendation || 'No recommendation returned.';
      onChangeField(row.id, 'recommendations', rec);
    } catch (e: any) {
      onChangeField(row.id, 'recommendations', `Error generating recommendation: ${String(e)}`);
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--brand-midnight)] text-[var(--brand-text)] font-brand">
      {/* Brand variables + font (global) */}
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap');
        :root {
          --brand-midnight: ${BRAND.midnightHex};
          --brand-pink: ${BRAND.pinkHex};
          --brand-white: ${BRAND.whiteHex};
          --brand-plum: ${BRAND.plumHex};
          --brand-rose: ${BRAND.roseHex};
          --brand-blush: ${BRAND.blushHex};
          --brand-burgundy: ${BRAND.burgundyHex};
          --brand-text: ${HIGH_CONTRAST_TEXT};
          --brand-text-muted: ${MUTED_TEXT};
        }
        .font-brand { font-family: 'Montserrat', ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, 'Apple Color Emoji','Segoe UI Emoji','Segoe UI Symbol'; }
        .btn-brand { background: var(--brand-pink); color: #fff; box-shadow: 0 2px 10px rgba(226,26,107,0.35); }
        .btn-brand:hover { filter: brightness(1.03); box-shadow: 0 4px 16px rgba(226,26,107,0.45); }
        .card-bg { background: #1a293b; border-color: rgba(255,255,255,0.12); }
        .text-muted-foreground { color: var(--brand-text-muted); }
        .select-trigger { background: #0f1e2c; border-color: rgba(255,255,255,0.25); color: ${HIGH_CONTRAST_TEXT}; }
        .input-bg, .textarea-bg { background: #0f1e2c; color: ${HIGH_CONTRAST_TEXT}; border-color: rgba(255,255,255,0.25); }
        ::placeholder { color: rgba(255,255,255,0.6); }
        .brand-hero { position: relative; overflow: hidden; }
        .brand-hero::before {
          content: ''; position: absolute; inset: 0; pointer-events: none;
          background:
            linear-gradient(135deg, transparent 0%, transparent 40%, rgba(226,26,107,0.9) 40%, rgba(226,26,107,0.9) 60%, transparent 60%, transparent 100%),
            linear-gradient(135deg, transparent 0%, transparent 35%, rgba(235,102,156,0.8) 35%, rgba(235,102,156,0.8) 55%, transparent 55%, transparent 100%),
            linear-gradient(135deg, transparent 0%, transparent 30%, rgba(247,191,213,0.5) 30%, rgba(247,191,213,0.5) 50%, transparent 50%, transparent 100%);
          transform: translateX(35%) skewX(-8deg); filter: drop-shadow(0 10px 24px rgba(0,0,0,0.35));
        }
        .badge { display:inline-block; padding:2px 8px; font-size:12px; border-radius:9999px; background: rgba(226,26,107,0.25); color:#fff; border:1px solid rgba(226,26,107,0.55); }
      `}</style>

      {/* Hero */}
      <div className="brand-hero">
        <div className="mx-auto max-w-7xl px-6 py-10 relative">
          <motion.h1 initial={{opacity:0, y:-6}} animate={{opacity:1, y:0}} transition={{duration:0.35}} className="text-3xl md:text-4xl font-semibold tracking-tight">
            Propellic – Technical SEO Analysis Tool
          </motion.h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
            Source: <span className="badge">bundled</span>. Fully bundled, no CSV required. Edit freely and export CSVs.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl p-6 space-y-6">
        {/* Controls */}
        <Card className="shadow-sm card-bg border">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2"><RefreshCw className="h-5 w-5"/>Dataset</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-sm">Filter</Label>
              <Select value={filterCat} onValueChange={setFilterCat}>
                <SelectTrigger className="w-[240px] select-trigger"><SelectValue placeholder="Filter by category"/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {ISSUE_CATEGORY_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search elements, analysis, recs…" className="w-[280px] input-bg"/>
            <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              <Info className="h-4 w-4"/>
              <span>{data.length} inspection elements</span>
            </div>
            <div className="ml-auto flex gap-2">
              <Button className="btn-brand" onClick={() => downloadCSV('Technical_SEO_Analysis_Updated.csv', data)}><FileDown className="h-4 w-4 mr-2"/>Export CSV</Button>
              <Button variant="outline" className="border-white/30 text-[var(--brand-text)] hover:bg-white/10" onClick={resetToBundled}>Reset to bundled template</Button>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="analysis" className="w-full">
          <TabsList className="grid grid-cols-3 w-full md:w-auto bg-white/10">
            <TabsTrigger value="analysis" className="flex items-center gap-2 data-[state=active]:bg-white/20"><Filter className="h-4 w-4"/>Analysis</TabsTrigger>
            <TabsTrigger value="impl" className="flex items-center gap-2 data-[state=active]:bg-white/20"><ListChecks className="h-4 w-4"/>Implementation checklist</TabsTrigger>
            <TabsTrigger value="tests" className="flex items-center gap-2 data-[state=active]:bg-white/20"><CheckSquare className="h-4 w-4"/>Tests</TabsTrigger>
          </TabsList>

          <TabsContent value="analysis" className="mt-4">
            <Card className="shadow-sm card-bg border">
              <CardContent className="overflow-x-auto">
                <div className="min-w-[1100px]">
                  <div className="grid grid-cols-12 text-xs font-medium px-2" style={{color: HIGH_CONTRAST_TEXT}}>
                    <div className="col-span-1 p-2">X/√</div>
                    <div className="col-span-2 p-2">Inspection element</div>
                    <div className="col-span-2 p-2">Issue category</div>
                    <div className="col-span-1 p-2">Sub-category</div>
                    <div className="col-span-1 p-2">Skillset</div>
                    <div className="col-span-1 p-2">Score</div>
                    <div className="col-span-1 p-2">Target</div>
                    <div className="col-span-1 p-2">Priority</div>
                    <div className="col-span-2 p-2">Implementer</div>
                  </div>
                  <div className="divide-y divide-white/10">
                    {filtered.map((r) => (
                      <div key={r.id} className="grid grid-cols-12 items-start px-2 py-3 hover:bg-white/5">
                        <div className="col-span-1 p-2">
                          <Switch checked={!!r.check} onCheckedChange={(v) => onChangeField(r.id, 'check', v)} />
                        </div>
                        <div className="col-span-2 p-2">
                          <Input value={r.inspectionElement} onChange={(e) => onChangeField(r.id, 'inspectionElement', e.target.value)} className="input-bg"/>
                          <div className="mt-2 text-xs" style={{color:'rgba(255,255,255,0.85)'}}>Analysis</div>
                          <Textarea className="mt-1 textarea-bg" value={r.analysis} onChange={(e) => onChangeField(r.id, 'analysis', e.target.value)} rows={4}/>
                          {/* Generate recommendations button (per row) */}
                          <div className="mt-2">
                            <Button className="btn-brand" disabled={loadingId === r.id} onClick={() => generateRecs(r)}>
                              {loadingId === r.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin"/> : null}
                              Generate recs
                            </Button>
                          </div>
                          <div className="mt-3 text-xs" style={{color:'rgba(255,255,255,0.85)'}}>Recommendations</div>
                          <Textarea className="mt-1 textarea-bg" value={r.recommendations} onChange={(e) => onChangeField(r.id, 'recommendations', e.target.value)} rows={4}/>
                        </div>
                        <div className="col-span-2 p-2">
                          <Select value={r.issueCategory || undefined} onValueChange={(v) => onChangeField(r.id, 'issueCategory', v)}>
                            <SelectTrigger className="select-trigger"><SelectValue placeholder="Category"/></SelectTrigger>
                            <SelectContent>
                              {ISSUE_CATEGORY_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-1 p-2">
                          <Input value={r.issueSubCategory} onChange={(e) => onChangeField(r.id, 'issueSubCategory', e.target.value)} className="input-bg"/>
                        </div>
                        <div className="col-span-1 p-2">
                          <Input value={r.skillset} onChange={(e) => onChangeField(r.id, 'skillset', e.target.value)} className="input-bg"/>
                        </div>
                        <div className="col-span-1 p-2">
                          <Select value={r.score || undefined} onValueChange={(v) => onChangeField(r.id, 'score', v === '_clear' ? '' : sanitizeScore(v))}>
                            <SelectTrigger className="select-trigger"><SelectValue placeholder="Score"/></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_clear">(clear)</SelectItem>
                              {SCORE_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-1 p-2">
                          <div className="px-3 py-2 bg-white/10 rounded-md text-sm">{TARGET_FIXED}</div>
                        </div>
                        <div className="col-span-1 p-2">
                          <Input value={r.priority || ''} onChange={(e) => onChangeField(r.id, 'priority', e.target.value.replace(/[^0-9]/g,''))} className="input-bg" placeholder="#"/>
                        </div>
                        <div className="col-span-2 p-2">
                          <Select value={r.implementer || undefined} onValueChange={(v) => onChangeField(r.id, 'implementer', v)}>
                            <SelectTrigger className="select-trigger"><SelectValue placeholder="Select"/></SelectTrigger>
                            <SelectContent>
                              {IMPLEMENTER_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="impl" className="mt-4">
            <Card className="shadow-sm card-bg border">
              <CardHeader className="pb-3">
                <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
                  <div className="flex items-center gap-2">
                    <Button className="btn-brand" onClick={autoPrioritize}><CheckSquare className="h-4 w-4 mr-2"/>Auto-prioritize</Button>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="border-white/30 text-[var(--brand-text)] hover:bg-white/10" onClick={() => downloadCSV('Implementation_Checklist.csv', implementationRows)}><FileDown className="h-4 w-4 mr-2"/>Export checklist CSV</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <div className="min-w-[1000px]">
                  <div className="grid grid-cols-10 text-xs font-medium px-2" style={{color: HIGH_CONTRAST_TEXT}}>
                    <div className="col-span-1 p-2">Priority</div>
                    <div className="col-span-2 p-2">Inspection element</div>
                    <div className="col-span-2 p-2">Issue category</div>
                    <div className="col-span-1 p-2">Implementer</div>
                    <div className="col-span-1 p-2">Score</div>
                    <div className="col-span-1 p-2">Severity</div>
                    <div className="col-span-2 p-2">Recommendations</div>
                  </div>
                  <div className="divide-y divide-white/10">
                    {implementationRows.map((r) => (
                      <div key={r.id} className="grid grid-cols-10 items-start px-2 py-3 hover:bg-white/5">
                        <div className="col-span-1 p-2">
                          <Input value={r.priority || ''} onChange={(e) => onChangeField(r.id, 'priority', e.target.value.replace(/[^0-9]/g,''))} className="input-bg" placeholder="#"/>
                        </div>
                        <div className="col-span-2 p-2 text-sm">{r.inspectionElement}</div>
                        <div className="col-span-2 p-2 text-sm">{r.issueCategory}</div>
                        <div className="col-span-1 p-2">
                          <Select value={r.implementer || undefined} onValueChange={(v) => onChangeField(r.id, 'implementer', v)}>
                            <SelectTrigger className="select-trigger"><SelectValue placeholder="Select"/></SelectTrigger>
                            <SelectContent>
                              {IMPLEMENTER_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-1 p-2 text-sm">{r.score || ''}</div>
                        <div className="col-span-1 p-2 text-sm">{inferSeverity(r.score)}</div>
                        <div className="col-span-2 p-2">
                          <Textarea value={r.recommendations} onChange={(e) => onChangeField(r.id, 'recommendations', e.target.value)} className="textarea-bg" rows={4}/>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tests" className="mt-4">
            <Card className="shadow-sm card-bg border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4"/>Runtime tests</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {runTests(templateSource).map((t, idx) => (
                    <div key={idx} className={`text-sm ${t.status === 'pass' ? 'text-emerald-300' : 'text-red-300'}`}>
                      <span className="font-medium">{t.status.toUpperCase()}:</span> {t.name}{t.msg ? ` — ${t.msg}` : ''}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Card className="shadow-sm card-bg border">
          <CardHeader className="pb-2"><CardTitle className="text-base">Notes</CardTitle></CardHeader>
          <CardContent className="text-sm text-[var(--brand-text)]/90 space-y-2">
            <ul className="list-disc pl-5 space-y-1">
              <li>Data is fully bundled — no CSV needed. Use <b>Reset to bundled template</b> to discard local edits.</li>
              <li><b>Generate recs</b> uses Gemini via a server route. Deep detail when Score &lt; 9; short generic text when Score = 9.</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
