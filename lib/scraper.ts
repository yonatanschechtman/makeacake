export interface PriceResult {
  ingredientName: string;
  pricePerUnit: number | null;
  unit: string | null;
  packageInfo: string | null;
  supermarket: string | null;
  error?: string;
}

// Rami Levy UOM → base unit and gram/ml factor
const UOM_MAP: Record<string, { base: string; factor: number }> = {
  "קג":  { base: "גרם",  factor: 1000 },
  'ק"ג': { base: "גרם",  factor: 1000 },
  "גר":  { base: "גרם",  factor: 1 },
  "גרם": { base: "גרם",  factor: 1 },
  "ל":   { base: 'מ"ל',  factor: 1000 },
  "ליטר":{ base: 'מ"ל',  factor: 1000 },
  "מל":  { base: 'מ"ל',  factor: 1 },
  'מ"ל': { base: 'מ"ל',  factor: 1 },
};

interface RamiLevyProduct {
  name: string;
  price: { price: number };
  gs?: {
    Net_Content?: {
      UOM?: string;
      value?: string;
      text?: string;
    };
  };
  prop?: {
    by_kilo_content?: number;
  };
}

export async function fetchIngredientPrice(ingredientName: string): Promise<PriceResult> {
  try {
    const url = `https://www.rami-levy.co.il/api/search?q=${encodeURIComponent(ingredientName)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json() as { data: RamiLevyProduct[]; total: number };

    if (!json.data || json.data.length === 0) {
      return { ingredientName, pricePerUnit: null, unit: null, packageInfo: null, supermarket: "rami-levy.co.il" };
    }

    const product = json.data[0];
    const price = product.price?.price;
    const netContent = product.gs?.Net_Content;
    const uom = netContent?.UOM?.trim() ?? "";
    const qty = parseFloat(netContent?.value ?? "1") || 1;
    const packageInfo = `${product.name} (${netContent?.text ?? ""})`;

    const norm = UOM_MAP[uom];
    let pricePerUnit: number | null = null;
    let unit: string | null = null;

    if (price != null && norm) {
      pricePerUnit = price / (qty * norm.factor);
      unit = norm.base;
    } else if (price != null) {
      // Unknown unit — store price per package unit
      pricePerUnit = price / qty;
      unit = uom || "יחידה";
    }

    return { ingredientName, pricePerUnit, unit, packageInfo, supermarket: "rami-levy.co.il" };
  } catch (err) {
    return {
      ingredientName,
      pricePerUnit: null,
      unit: null,
      packageInfo: null,
      supermarket: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function fetchMultiplePrices(ingredientNames: string[]): Promise<PriceResult[]> {
  const results: PriceResult[] = [];
  for (const name of ingredientNames) {
    const result = await fetchIngredientPrice(name);
    results.push(result);
  }
  return results;
}
