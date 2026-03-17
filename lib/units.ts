// Pure unit conversion logic — no external dependencies

// Volume units → ml
const VOLUME_TO_ML: Record<string, number> = {
  'כפית': 5,
  'כף': 15,
  'כוס': 240,
  'מ"ל': 1,
  'מל': 1,
  'ליטר': 1000,
};

// Weight units → grams
const WEIGHT_TO_G: Record<string, number> = {
  'גרם': 1,
  'ק"ג': 1000,
  'קילוגרם': 1000,
  'קורט': 0.5,  // pinch ≈ 0.5 g
};

function isVolume(unit: string) { return unit in VOLUME_TO_ML; }
function isWeight(unit: string) { return unit in WEIGHT_TO_G; }

export interface ConversionResult {
  converted: number;
  possible: boolean;
  reason?: string;
}

/**
 * Convert `qty` in `recipeUnit` to the same base as `priceUnit`.
 * priceUnit is the base unit stored in IngredientPrice (גרם | מ"ל | יחידה).
 * density: grams per ml, needed only for cross-unit conversions.
 */
export function convertToBaseUnit(
  qty: number,
  recipeUnit: string,
  priceUnit: string,
  density?: number | null,
): ConversionResult {
  const rVol = isVolume(recipeUnit);
  const rWgt = isWeight(recipeUnit);
  const pVol = isVolume(priceUnit) || priceUnit === 'מ"ל' || priceUnit === 'מל';
  const pWgt = isWeight(priceUnit) || priceUnit === 'גרם';

  // יחידה ↔ יחידה
  if (recipeUnit === 'יחידה' && priceUnit === 'יחידה') {
    return { converted: qty, possible: true };
  }
  if (recipeUnit === 'יחידה' || priceUnit === 'יחידה') {
    return { converted: 0, possible: false, reason: 'אי אפשר להמיר יחידה ליחידת נפח/משקל' };
  }

  // Unknown recipe unit
  if (!rVol && !rWgt) {
    return { converted: 0, possible: false, reason: `יחידה לא מוכרת: ${recipeUnit}` };
  }

  // Same dimension
  if (rVol && (pVol || priceUnit === 'מ"ל')) {
    const ml = qty * VOLUME_TO_ML[recipeUnit];
    const priceBaseUnit = VOLUME_TO_ML[priceUnit] ?? 1;
    return { converted: ml / priceBaseUnit, possible: true };
  }
  if (rWgt && (pWgt || priceUnit === 'גרם')) {
    const g = qty * WEIGHT_TO_G[recipeUnit];
    const priceBaseUnit = WEIGHT_TO_G[priceUnit] ?? 1;
    return { converted: g / priceBaseUnit, possible: true };
  }

  // Cross-unit conversion requires density
  if (!density) {
    return {
      converted: 0,
      possible: false,
      reason: 'נדרש צפיפות (גרם/מ"ל) כדי להמיר בין נפח ומשקל',
    };
  }

  if (rVol && pWgt) {
    // volume → grams
    const ml = qty * VOLUME_TO_ML[recipeUnit];
    const g = ml * density;
    const priceBaseUnit = WEIGHT_TO_G[priceUnit] ?? 1;
    return { converted: g / priceBaseUnit, possible: true };
  }

  if (rWgt && pVol) {
    // grams → volume
    const g = qty * WEIGHT_TO_G[recipeUnit];
    const ml = g / density;
    const priceBaseUnit = VOLUME_TO_ML[priceUnit] ?? 1;
    return { converted: ml / priceBaseUnit, possible: true };
  }

  return { converted: 0, possible: false, reason: 'המרה לא נתמכת' };
}
