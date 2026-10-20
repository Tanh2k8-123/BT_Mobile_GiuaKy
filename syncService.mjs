export function validateDishDraft({ name, price, preparationTime, categoryId, categoryIds }) {
  const normalizedName = String(name ?? '').trim();
  const normalizedPrice = Number(price);
  const normalizedPreparationTime = Number(preparationTime);
  const validCategories = categoryIds instanceof Set ? categoryIds : new Set(categoryIds || []);

  if (!normalizedName) return { ok: false, reason: 'name' };
  if (!Number.isFinite(normalizedPrice) || normalizedPrice <= 0) return { ok: false, reason: 'price' };
  if (!Number.isInteger(normalizedPreparationTime) || normalizedPreparationTime <= 0) return { ok: false, reason: 'preparationTime' };
  if (!validCategories.has(categoryId)) return { ok: false, reason: 'categoryId' };
  return {
    ok: true,
    value: { name: normalizedName, price: normalizedPrice, preparationTime: normalizedPreparationTime },
  };
}

export function resolveDefaultLanguage(savedLanguage, defaultVersion) {
  if (Number(defaultVersion) < 2) return 'en';
  return savedLanguage === 'vi' ? 'vi' : 'en';
}

export function filterAndSortDishes({
  dishes, studentId, query = '', categoryId = 'all', availableOnly = false,
  minPrice = '', maxPrice = '', sort = 'newest',
}) {
  const field = (name) => `${studentId}_${name}`;
  const normalizedQuery = String(query).trim().toLocaleLowerCase();
  const minimum = String(minPrice).trim() === '' ? null : Number(minPrice);
  const maximum = String(maxPrice).trim() === '' ? null : Number(maxPrice);
  if ((minimum !== null && !Number.isFinite(minimum)) || (maximum !== null && !Number.isFinite(maximum))) return [];
  if (minimum !== null && maximum !== null && minimum > maximum) return [];

  const result = (Array.isArray(dishes) ? dishes : []).filter((dish) => {
    const name = String(dish[field('Name')] || '').toLocaleLowerCase();
    if (normalizedQuery && !name.includes(normalizedQuery)) return false;
    if (categoryId !== 'all' && dish[field('DishCategoryId')] !== categoryId) return false;
    if (availableOnly && !dish[field('IsAvailable')]) return false;
    const price = Number(dish[field('Price')]);
    if (minimum !== null && price < minimum) return false;
    if (maximum !== null && price > maximum) return false;
    return true;
  });

  if (sort === 'priceAsc') result.sort((a, b) => a[field('Price')] - b[field('Price')]);
  if (sort === 'priceDesc') result.sort((a, b) => b[field('Price')] - a[field('Price')]);
  if (sort === 'timeAsc') result.sort((a, b) => a[field('PreparationTime')] - b[field('PreparationTime')]);
  return result;
}

export function makeDishImageRecords(imageUrls, coverIndex, studentId) {
  const field = (name) => `${studentId}_${name}`;
  const entries = (Array.isArray(imageUrls) ? imageUrls : [])
    .map((url, sourceIndex) => ({ url: String(url ?? '').trim(), sourceIndex }))
    .filter((entry) => entry.url);
  if (entries.length === 0) return [];
  const requestedCover = Number.isInteger(coverIndex) ? coverIndex : 0;
  let selectedCover = entries.findIndex((entry) => entry.sourceIndex === requestedCover);
  if (selectedCover < 0) selectedCover = 0;
  return entries.map((entry, index) => ({
    [field('ImageUrl')]: entry.url,
    [field('IsThumbnail')]: index === selectedCover,
  }));
}

export function normalizeDishImages(images, studentId) {
  const field = (name) => `${studentId}_${name}`;
  const validImages = (Array.isArray(images) ? images : [])
    .map((image) => ({
      url: String(image?.[field('ImageUrl')] ?? '').trim(),
      thumbnail: Boolean(image?.[field('IsThumbnail')]),
    }))
    .filter((image) => image.url);
  if (validImages.length === 0) return [];
  const thumbnailIndex = validImages.findIndex((image) => image.thumbnail);
  const selectedThumbnail = thumbnailIndex < 0 ? 0 : thumbnailIndex;
  return validImages.map((image, index) => ({
    [field('ImageUrl')]: image.url,
    [field('IsThumbnail')]: index === selectedThumbnail,
  }));
}

export function selectDishThumbnail(images, selectedIndex, studentId) {
  if (!Array.isArray(images) || !Number.isInteger(selectedIndex)
    || selectedIndex < 0 || selectedIndex >= images.length) return null;
  const thumbnailField = `${studentId}_IsThumbnail`;
  return images.map((image, index) => ({ ...image, [thumbnailField]: index === selectedIndex }));
}

export function buildDishRecord({
  studentId, id, name, price, preparationTime, isAvailable, description, descriptionEn,
  categoryId, imageUrls = [], coverIndex = 0,
}) {
  const field = (key) => `${studentId}_${key}`;
  return {
    [field('Id')]: id,
    [field('Name')]: name,
    [field('Price')]: price,
    [field('PreparationTime')]: preparationTime,
    [field('IsAvailable')]: Boolean(isAvailable),
    [field('Description')]: description,
    [field('DescriptionEn')]: descriptionEn,
    [field('DishCategoryId')]: categoryId,
    [field('DishImage')]: makeDishImageRecords(imageUrls, coverIndex, studentId),
    [field('Dirty')]: true,
  };
}

export function upsertDish(dishes, dish, studentId) {
  const idField = `${studentId}_Id`;
  const exists = (dishes || []).some((item) => item[idField] === dish[idField]);
  return exists
    ? dishes.map((item) => item[idField] === dish[idField] ? dish : item)
    : [dish, ...(dishes || [])];
}

export function hasDishNameConflict(dishes, name, categoryId, editingId, studentId) {
  const field = (key) => `${studentId}_${key}`;
  const normalizedName = String(name ?? '').trim().toLocaleLowerCase();
  return (dishes || []).some((dish) => dish[field('Id')] !== editingId
    && dish[field('DishCategoryId')] === categoryId
    && String(dish[field('Name')] || '').trim().toLocaleLowerCase() === normalizedName);
}

export function preparationTimeKind(minutes) {
  return Number(minutes) <= 15 ? 'quick' : 'regular';
}

async function requestJson(fetchImpl, url, options) {
  const response = await fetchImpl(url, options);
  if (!response.ok) throw new Error(`MockAPI ${response.status}`);
  return response.status === 204 ? null : response.json();
}

async function findByBusinessId(fetchImpl, url) {
  const response = await fetchImpl(url, { method: 'GET' });
  // MockAPI returns 404 (instead of an empty array) when a filter has no matches.
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`MockAPI ${response.status}`);
  const result = await response.json();
  return Array.isArray(result) ? result : result ? [result] : [];
}

export async function syncPendingChanges({
  apiBaseUrl, collection, studentId, dishes, pending, online, fetchImpl = globalThis.fetch,
}) {
  if (!online || !pending.length) return { syncedIds: [], remaining: pending, error: null };

  const base = apiBaseUrl.replace(/\/+$/, '');
  const idField = `${studentId}_Id`;
  const dirtyField = `${studentId}_Dirty`;
  const businessIdField = `${studentId}_Id`;
  const syncedIds = [];

  for (let index = 0; index < pending.length; index += 1) {
    const change = pending[index];
    try {
      const params = new URLSearchParams({ [idField]: change.id });
      const matches = await findByBusinessId(fetchImpl, `${base}/${collection}?${params.toString()}`);

      if (change.type === 'delete') {
        for (const remote of matches || []) {
          const remoteId = remote.Id ?? remote.id;
          if (remoteId != null) await requestJson(fetchImpl, `${base}/${collection}/${encodeURIComponent(remoteId)}`, { method: 'DELETE' });
        }
        syncedIds.push(change.id);
        continue;
      }

      const local = dishes.find((dish) => dish[businessIdField] === change.id);
      if (!local) {
        syncedIds.push(change.id);
        continue;
      }

      const payload = { ...local };
      delete payload[dirtyField];
      if (matches?.length) {
        const remoteId = matches[0].Id ?? matches[0].id;
        if (remoteId == null) throw new Error('MockAPI record is missing its server ID');
        await requestJson(fetchImpl, `${base}/${collection}/${encodeURIComponent(remoteId)}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
      } else {
        await requestJson(fetchImpl, `${base}/${collection}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
      }
      syncedIds.push(change.id);
    } catch (error) {
      return {
        syncedIds,
        remaining: pending.slice(index),
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  return { syncedIds, remaining: [], error: null };
}
