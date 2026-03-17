import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
