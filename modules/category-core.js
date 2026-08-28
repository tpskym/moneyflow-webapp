import { normalizeTextForSearch } from "./operation-core.js";

export function createCategoryId(name, { now = Date.now, random = Math.random } = {}) {
  const base = normalizeTextForSearch(name).replace(/[^a-z0-9\-_ ]/g, "").replace(/\s+/g, "-").slice(0, 32);
  return `${base || "cat"}-${now().toString(36)}-${random().toString(16).slice(2, 6)}`;
}

export function normalizeHexColor(value) {
  return /^#([0-9a-fA-F]{6})$/.test(value || "") ? String(value).toUpperCase() : "#64748B";
}

export function sanitizeCategories(categories, { defaults = [], createId = createCategoryId } = {}) {
  if (!Array.isArray(categories)) return [...defaults];
  return categories
    .map((category) => {
      if (!category || typeof category !== "object") return null;
      const name = String(category.name || "").trim();
      if (!name) return null;
      return { id: category.id || createId(name), name, mode: "both", color: normalizeHexColor(category.color || "#64748b") };
    })
    .filter(Boolean);
}

export function getAllCategoriesSorted(categories) {
  return getAllCategoriesSortedFrom(categories);
}

export function findCategoryByNormalizedName(categories, normalizedName) {
  const target = normalizeTextForSearch(normalizedName);
  return target ? categories.find((category) => normalizeTextForSearch(category.name) === target) || null : null;
}

export function getMatchedCategories(categories, query, { threshold = 0.48 } = {}) {
  const normalized = normalizeTextForSearch(query);
  const all = getAllCategoriesSortedFrom(categories);
  if (!normalized) return all;
  return all
    .map((category) => ({ category, score: getCategorySearchScore(normalizeTextForSearch(category.name), normalized) }))
    .filter((entry) => entry.score >= threshold)
    .sort((left, right) => right.score - left.score || normalizeTextForSearch(left.category.name).localeCompare(normalizeTextForSearch(right.category.name), "ru"))
    .map((entry) => entry.category);
}

export function mergeCategories(localCategories, remoteCategories) {
  const seen = new Map();
  for (const category of localCategories) {
    if (!category?.id || !category?.name) continue;
    seen.set(normalizeTextForSearch(category.name), {
      ...category,
      name: String(category.name).trim(),
      mode: "both",
      color: normalizeHexColor(category.color || "#64748b"),
    });
  }
  for (const category of remoteCategories) {
    if (!category?.id || !category?.name) continue;
    const normalized = normalizeTextForSearch(category.name);
    if (seen.has(normalized)) continue;
    seen.set(normalized, { id: category.id, name: String(category.name).trim(), mode: "both", color: normalizeHexColor(category.color || "#64748b") });
  }
  return [...seen.values()];
}

export function pickCategoryColor(categories, palette, random = Math.random) {
  const used = new Set(categories.map((category) => normalizeHexColor(category.color)));
  const available = palette.filter((color) => !used.has(normalizeHexColor(color)));
  const candidates = available.length ? available : palette;
  return candidates[Math.floor(random() * candidates.length)];
}

function getAllCategoriesSortedFrom(categories) {
  return [...categories].sort((a, b) => normalizeTextForSearch(a.name).localeCompare(normalizeTextForSearch(b.name), "ru"));
}

function getCategorySearchScore(categoryName, query) {
  if (!query) return 1;
  if (!categoryName) return 0;
  if (categoryName === query) return 1.1;
  if (categoryName.startsWith(query)) return 1;
  if (categoryName.includes(` ${query}`) || categoryName.includes(query)) return 0.95;
  const queryWords = query.split(" ").filter(Boolean);
  const nameWords = categoryName.split(" ").filter(Boolean);
  if (queryWords.length > 1 && queryWords.every((word) => nameWords.some((nameWord) => nameWord.includes(word)))) return 0.9;
  if (query.length <= 3 && categoryName.includes(query[0])) return 0.7;
  const distance = getLevenshteinDistance(categoryName, query);
  return 1 - distance / Math.max(categoryName.length, query.length);
}

function getLevenshteinDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const saved = previous[rightIndex];
      previous[rightIndex] = left[leftIndex - 1] === right[rightIndex - 1]
        ? diagonal
        : Math.min(previous[rightIndex] + 1, previous[rightIndex - 1] + 1, diagonal + 1);
      diagonal = saved;
    }
  }
  return previous[right.length];
}
