import { NextResponse } from 'next/server';

// Read env (your .env.local already has these)
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const API_KEY =
  process.env.GOOGLE_GENAI_API_KEY ||
  process.env.NEXT_PUBLIC_GOOGLE_GENAI_API_KEY;

function extractText(data: any): { text?: string; explain?: string } {
  try {
    const c = data?.candidates?.[0];
    // v1beta typical shape
    const parts = c?.content?.parts;
    if (Array.isArray(parts)) {
      const joined = parts.map((p: any) => p?.text).filter(Boolean).join('');
      if (joined) return { text: joined };
    }
    // Fallbacks sometimes seen
    if (typeof c?.output_text === 'string' && c.output_text) return { text: c.output_text };
    if (typeof data?.text === 'string' && data.text) return { text: data.text };

    const finish = c?.finishReason || c?.finish_reason || data?.promptFeedback?.blockReason;
    return { explain: `No text in response. finishReason=${finish ?? 'unknown'}` };
  } catch (e: any) {
    return { explain: `Parser error: ${String(e)}` };
  }
}

export async function POST(req: Request) {
  try {
    if (!API_KEY) {
      return NextResponse.json(
        { recommendation: 'Server is missing GOOGLE_GENAI_API_KEY.' },
        { status: 500 }
      );
    }

    const { analysis = '', score = '', element = '', category = '', subcategory = '' } = await req.json();

    // If score is 9, short-circuit with generic text
    if (String(score) === '9') {
      return NextResponse.json({
        recommendation:
          `No action needed. “${element}” meets best practices. Maintain current implementation and monitor over time.`
      });
    }

    const system = `
You are a senior Technical SEO engineer writing hands-on, implementation-ready recommendations.
Output MUST be Markdown with clear section headers, numbered steps, concrete examples/snippets, acceptance criteria,
and who should implement (Developer, Site Editor, Client). Tailor depth to severity; score < 9 requires deep detail.
If facts are missing, state assumptions and provide options.
`.trim();

    const user = `
INSPECTION ELEMENT: ${element}
CATEGORY/SUBCATEGORY: ${category} / ${subcategory}
CURRENT SCORE: ${score}
ANALYSIS (verbatim notes):
${analysis}

Write:
1) Summary of issue(s) & impact (quantify if possible)
2) Remediation plan (numbered steps; include examples/snippets/tools)
3) Acceptance criteria (measurable)
4) Owner & effort (who implements; rough complexity)
5) Risks/Dependencies
6) Nice-to-haves (optional)
`.trim();

    // v1beta endpoint for Gemini 2.x
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(API_KEY)}`;

    const body = {
      // Reduce false blocks in dev; adjust as your policy permits
      safetySettings: [
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
      generationConfig: {
        temperature: 0.3,
        topP: 0.9,
        topK: 40,
        maxOutputTokens: 1600,
      },
      contents: [
        { role: 'user', parts: [{ text: system + '\n\n' + user }] }
      ],
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const raw = await resp.text();
    let data: any = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch {}

    if (!resp.ok) {
      console.error('Gemini error:', resp.status, raw);
      return NextResponse.json(
        { recommendation: `Gemini error: ${resp.status} ${raw}` },
        { status: 500 }
      );
    }

    const { text, explain } = extractText(data);
    if (text) return NextResponse.json({ recommendation: text });

    console.error('Gemini no-text response:', JSON.stringify(data).slice(0, 2000));
    return NextResponse.json(
      { recommendation: `No recommendation text returned. ${explain ?? ''}`.trim() },
      { status: 200 }
    );
  } catch (e: any) {
    console.error('Server error:', e);
    return NextResponse.json({ recommendation: `Server error: ${String(e)}` }, { status: 500 });
  }
}
