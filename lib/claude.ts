import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface GroupingSuggestion {
  canonical: string;
  aliases: string[];
  confidence: "high" | "medium" | "low";
  reasoning: string;
}

export interface ExtractedRecipe {
  name: string;
  servingSize: number;
  ingredients: { name: string; quantity: number; unit: string; notes?: string }[];
  instructions: string;
}

const SYSTEM_PROMPT = `אתה עוזר מומחה לחילוץ מתכונים. קרא את התוכן המסופק וחלץ את המתכון בפורמט JSON בדיוק.
החזר JSON תקין בלבד, ללא טקסט נוסף. המבנה הנדרש:
{
  "name": "שם המתכון",
  "servingSize": 1,
  "ingredients": [
    { "name": "שם המרכיב", "quantity": 2.5, "unit": "כוס", "notes": "הערה אופציונלית" }
  ],
  "instructions": "הוראות הכנה"
}
חשוב:
- quantity חייב להיות מספר (float)
- unit בעברית (כוס, גרם, כף, כפית, ק"ג, מ"ל, ליטר, יחידה, וכו')
- אם servingSize לא ציין, שים 1
- name של המתכון בעברית אם המקור בעברית`;

export async function extractRecipeFromText(text: string): Promise<ExtractedRecipe> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `חלץ את המתכון מהטקסט הבא:\n\n${text}` }],
  });

  const content = response.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");

  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in response");

  return JSON.parse(jsonMatch[0]) as ExtractedRecipe;
}

export async function extractRecipeFromHtml(html: string, url: string): Promise<ExtractedRecipe> {
  // Strip script/style tags and trim HTML
  const cleanHtml = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000); // limit tokens

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `חלץ את המתכון מדף האינטרנט הבא (URL: ${url}):\n\n${cleanHtml}`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");

  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in response");

  return JSON.parse(jsonMatch[0]) as ExtractedRecipe;
}

export async function suggestDensity(ingredientName: string): Promise<{ density: number | null; source: string }> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: [{ type: "web_search_20250305", name: "web_search" } as any],
    messages: [{
      role: "user",
      content: `What is the density in grams per ml of "${ingredientName}" as commonly used in home cooking or baking? Search for a reliable value. Return ONLY valid JSON with no extra text: {"density": <number>, "source": "<brief source description>"}. If truly unknown, use {"density": null, "source": "unknown"}.`,
    }],
  });

  // Handle possible tool-use loop (web search may require one iteration)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cur: any = response;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const msgs: any[] = [{ role: "user", content: `What is the density in grams per ml of "${ingredientName}" as commonly used in home cooking or baking? Search for a reliable value. Return ONLY valid JSON with no extra text: {"density": <number>, "source": "<brief source description>"}. If truly unknown, use {"density": null, "source": "unknown"}.` }];

  let iterations = 0;
  while (cur.stop_reason === "tool_use" && iterations < 3) {
    iterations++;
    msgs.push({ role: "assistant", content: cur.content });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolResults = cur.content.filter((b: any) => b.type === "tool_use").map((b: any) => ({
      type: "tool_result",
      tool_use_id: b.id,
      content: "",
    }));
    msgs.push({ role: "user", content: toolResults });
    cur = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: [{ type: "web_search_20250305", name: "web_search" } as any],
      messages: msgs,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const textBlock = cur.content.find((b: any) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return { density: null, source: "לא ידוע" };
  const match = textBlock.text.match(/\{[^{}]*"density"[^{}]*\}/);
  if (!match) return { density: null, source: "לא ידוע" };
  try { return JSON.parse(match[0]); } catch { return { density: null, source: "לא ידוע" }; }
}

export async function suggestIngredientGroups(names: string[]): Promise<GroupingSuggestion[]> {
  const prompt = `להלן רשימת שמות מרכיבים ממתכונים. מצא קבוצות של מרכיבים שהם בעצם אותו מרכיב בסיסי אך עם וריאציות בשם.

כללים חשובים:
- כלול רק קבוצות עם 2 שמות לפחות
- בחר את השם הקצר/הבסיסי ביותר כשם הקנוני (canonical)
- "חמאה קרה" + "חמאה מומסת" → canonical "חמאה" ✓
- "חלמון ביצה" ≠ "ביצה" (מוצר שונה) ✗
- confidence: "high" = ברור שזה אותו מרכיב, "medium" = כנראה, "low" = ספק

החזר JSON בלבד:
{ "groups": [ { "canonical": "שם קנוני", "aliases": ["וריאציה1", "וריאציה2"], "confidence": "high|medium|low", "reasoning": "הסבר קצר" } ] }

רשימת המרכיבים:
${names.join("\n")}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  const content = response.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");

  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];

  const parsed = JSON.parse(jsonMatch[0]);
  return (parsed.groups ?? []) as GroupingSuggestion[];
}

export async function extractRecipeFromImage(base64Image: string, mimeType: string): Promise<ExtractedRecipe> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: base64Image,
            },
          },
          { type: "text", text: "חלץ את המתכון מהתמונה הזו." },
        ],
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");

  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in response");

  return JSON.parse(jsonMatch[0]) as ExtractedRecipe;
}
