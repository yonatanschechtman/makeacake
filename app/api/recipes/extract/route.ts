import { NextRequest, NextResponse } from "next/server";
import { extractRecipeFromText, extractRecipeFromHtml, extractRecipeFromImage } from "@/lib/claude";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { type, content, url, mimeType } = body;

  if (!type || !content) {
    return NextResponse.json({ error: "Missing type or content" }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  try {
    let recipe;

    if (type === "url") {
      // Fetch the URL server-side
      const response = await fetch(url as string, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1",
          "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8",
        },
        signal: AbortSignal.timeout(15000),
      });
      const html = await response.text();
      recipe = await extractRecipeFromHtml(html, url as string);
    } else if (type === "text") {
      recipe = await extractRecipeFromText(content);
    } else if (type === "photo") {
      recipe = await extractRecipeFromImage(content, mimeType || "image/jpeg");
    } else {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    return NextResponse.json(recipe);
  } catch (err) {
    console.error("Extract error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Extraction failed" },
      { status: 500 }
    );
  }
}
