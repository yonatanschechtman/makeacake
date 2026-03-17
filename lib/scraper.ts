import puppeteer from "puppeteer";

export interface PriceResult {
  ingredientName: string;
  pricePerUnit: number | null;
  unit: string | null;
  packageInfo: string | null;
  supermarket: string | null;
  error?: string;
}

// Unit normalization map (Hebrew → base unit)
const UNIT_MULTIPLIERS: Record<string, { base: string; factor: number }> = {
  "ק\"ג": { base: "גרם", factor: 1000 },
  "קילוגרם": { base: "גרם", factor: 1000 },
  "ליטר": { base: "מ\"ל", factor: 1000 },
  "גרם": { base: "גרם", factor: 1 },
  "מ\"ל": { base: "מ\"ל", factor: 1 },
  "מל": { base: "מ\"ל", factor: 1 },
};

export async function fetchIngredientPrice(ingredientName: string): Promise<PriceResult> {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--no-zygote",
      ],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Mobile Safari/537.36"
    );

    const searchUrl = `https://chp.co.il/main/search/${encodeURIComponent(ingredientName)}`;
    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 30000 });

    // Extract first product result
    const result = await page.evaluate(() => {
      // Try various selectors that chp.co.il may use
      const productCards = document.querySelectorAll(
        ".product-item, .item-card, [class*='product'], [class*='item']"
      );

      for (const card of Array.from(productCards)) {
        const priceEl = card.querySelector("[class*='price'], .price");
        const nameEl = card.querySelector("[class*='name'], .name, h3, h4");
        const unitEl = card.querySelector("[class*='unit'], .unit, [class*='weight']");

        if (priceEl) {
          const priceText = priceEl.textContent?.trim() || "";
          const nameText = nameEl?.textContent?.trim() || "";
          const unitText = unitEl?.textContent?.trim() || "";

          return { priceText, nameText, unitText };
        }
      }

      // Fallback: look for any price-like text on page
      const allText = document.body.innerText;
      return { allText: allText.slice(0, 2000), priceText: "", nameText: "", unitText: "" };
    });

    // Parse price from text (e.g. "₪8.90" or "8.90 ₪")
    const priceMatch = result.priceText.match(/[\d.,]+/);
    const price = priceMatch ? parseFloat(priceMatch[0].replace(",", ".")) : null;

    // Determine package info and normalize to per-unit
    let pricePerUnit: number | null = null;
    let unit: string | null = null;
    let packageInfo: string | null = null;

    if (price !== null && result.unitText) {
      packageInfo = result.unitText;
      // Try to find weight/volume in unit string
      const weightMatch = result.unitText.match(/([\d.,]+)\s*(ק"ג|קילוגרם|גרם|ליטר|מ"ל|מל)/);
      if (weightMatch) {
        const qty = parseFloat(weightMatch[1].replace(",", "."));
        const unitKey = weightMatch[2];
        const norm = UNIT_MULTIPLIERS[unitKey];
        if (norm) {
          pricePerUnit = price / (qty * norm.factor);
          unit = norm.base;
        }
      } else {
        pricePerUnit = price;
        unit = "יחידה";
      }
    } else if (price !== null) {
      pricePerUnit = price;
      unit = "יחידה";
    }

    return {
      ingredientName,
      pricePerUnit,
      unit,
      packageInfo,
      supermarket: "chp.co.il",
    };
  } catch (err) {
    return {
      ingredientName,
      pricePerUnit: null,
      unit: null,
      packageInfo: null,
      supermarket: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  } finally {
    if (browser) await browser.close();
  }
}

export async function fetchMultiplePrices(ingredientNames: string[]): Promise<PriceResult[]> {
  // Fetch sequentially to avoid overloading the target site
  const results: PriceResult[] = [];
  for (const name of ingredientNames) {
    const result = await fetchIngredientPrice(name);
    results.push(result);
  }
  return results;
}
