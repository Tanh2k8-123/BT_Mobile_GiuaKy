import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDishRecord, filterAndSortDishes, hasDishNameConflict, makeDishImageRecords, normalizeDishImages, preparationTimeKind,
  resolveDefaultLanguage, syncPendingChanges, upsertDish, validateDishDraft,
} from '../syncService.mjs';

const studentId = 'BIT240015';
const makeDish = (id, name = 'Test Dish') => ({
  [`${studentId}_Id`]: id,
  [`${studentId}_Name`]: name,
  [`${studentId}_Price`]: 12000,
  [`${studentId}_PreparationTime`]: 10,
  [`${studentId}_IsAvailable`]: true,
  [`${studentId}_Description`]: 'Test description',
  [`${studentId}_DishCategoryId`]: 'cat-noodles',
  [`${studentId}_DishImage`]: [],
  [`${studentId}_Dirty`]: true,
});

function mockApi() {
  let records = [];
  let nextServerId = 1;
  let failAfterFirstPost = false;
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input);
    const method = options.method || 'GET';
    const parts = url.pathname.split('/').filter(Boolean);
    const serverId = parts[1];
    if (method === 'GET') {
      const idFilter = url.searchParams.get(`${studentId}_Id`);
      const result = records.filter((record) => !idFilter || record[`${studentId}_Id`] === idFilter);
      if (idFilter && result.length === 0) return response({ error: 'Not found' }, 404);
      return response(result);
    }
    if (method === 'POST') {
      const record = { ...JSON.parse(options.body), Id: String(nextServerId++) };
      records.push(record);
      if (failAfterFirstPost) {
        failAfterFirstPost = false;
        return response({ error: 'simulated lost response' }, 503);
      }
      return response(record, 201);
    }
    if (method === 'PUT') {
      const index = records.findIndex((record) => record.Id === serverId);
      if (index < 0) return response({}, 404);
      records[index] = { ...JSON.parse(options.body), Id: serverId };
      return response(records[index]);
    }
    if (method === 'DELETE') {
      records = records.filter((record) => record.Id !== serverId);
      return response(null, 204);
    }
    return response({}, 405);
  };
  return {
    fetchImpl,
    records: () => records,
    failAfterFirstPost: () => { failAfterFirstPost = true; },
  };
}

function response(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

test('dish form accepts valid data regardless of the list price filter state', () => {
  const result = validateDishDraft({
    name: '  Bún bò  ', price: '45000', preparationTime: '20', categoryId: 'cat-noodles',
    categoryIds: ['cat-noodles', 'cat-rice', 'cat-drinks'],
  });
  assert.deepEqual(result, { ok: true, value: { name: 'Bún bò', price: 45000, preparationTime: 20 } });
});

test('dish form rejects blank names, nonpositive values, and unknown categories', () => {
  const common = { price: '10000', preparationTime: '5', categoryId: 'cat-noodles', categoryIds: ['cat-noodles'] };
  assert.equal(validateDishDraft({ ...common, name: '  ' }).reason, 'name');
  assert.equal(validateDishDraft({ ...common, name: 'Soup', price: '0' }).reason, 'price');
  assert.equal(validateDishDraft({ ...common, name: 'Soup', preparationTime: '1.5' }).reason, 'preparationTime');
  assert.equal(validateDishDraft({ ...common, name: 'Soup', categoryId: 'unknown' }).reason, 'categoryId');
});

test('search, category, sale status and price filters combine in one result', () => {
  const dishes = [
    { ...makeDish('pho-1', 'Pho House'), [`${studentId}_Price`]: 50000, [`${studentId}_PreparationTime`]: 20 },
    { ...makeDish('pho-2', 'Pho Quick'), [`${studentId}_Price`]: 30000, [`${studentId}_PreparationTime`]: 10, [`${studentId}_IsAvailable`]: false },
    { ...makeDish('rice-1', 'Pho Rice'), [`${studentId}_Price`]: 45000, [`${studentId}_DishCategoryId`]: 'cat-rice' },
  ];
  const result = filterAndSortDishes({
    dishes, studentId, query: 'pho', categoryId: 'cat-noodles', availableOnly: true,
    minPrice: '40000', maxPrice: '60000',
  });
  assert.deepEqual(result.map((dish) => dish[`${studentId}_Id`]), ['pho-1']);
});

test('filters handle stopped items and invalid price ranges; sort orders are correct', () => {
  const dishes = [
    { ...makeDish('a', 'A'), [`${studentId}_Price`]: 40000, [`${studentId}_PreparationTime`]: 25 },
    { ...makeDish('b', 'B'), [`${studentId}_Price`]: 20000, [`${studentId}_PreparationTime`]: 8 },
    { ...makeDish('c', 'C'), [`${studentId}_Price`]: 30000, [`${studentId}_PreparationTime`]: 15, [`${studentId}_IsAvailable`]: false },
  ];
  const ids = (options) => filterAndSortDishes({ dishes, studentId, ...options }).map((dish) => dish[`${studentId}_Id`]);
  assert.deepEqual(ids({ availableOnly: true }), ['a', 'b']);
  assert.deepEqual(ids({ minPrice: '50000', maxPrice: '10000' }), []);
  assert.deepEqual(ids({ sort: 'priceAsc' }), ['b', 'c', 'a']);
  assert.deepEqual(ids({ sort: 'priceDesc' }), ['a', 'c', 'b']);
  assert.deepEqual(ids({ sort: 'timeAsc' }), ['b', 'c', 'a']);
});

test('image selection keeps at most one thumbnail, and empty image lists stay empty', () => {
  const images = makeDishImageRecords([' https://one.test/a ', '', 'https://two.test/b'], 99, studentId);
  assert.equal(images.length, 2);
  assert.equal(images.filter((image) => image[`${studentId}_IsThumbnail`]).length, 1);
  assert.equal(images[0][`${studentId}_IsThumbnail`], true);
  assert.deepEqual(makeDishImageRecords([], 0, studentId), []);
  const afterRemovingBlankUrl = makeDishImageRecords(['', 'https://cover.test/image', 'https://other.test/image'], 1, studentId);
  assert.equal(afterRemovingBlankUrl[0][`${studentId}_IsThumbnail`], true);
  assert.equal(afterRemovingBlankUrl.filter((image) => image[`${studentId}_IsThumbnail`]).length, 1);
});

test('remote image data drops empty URLs and normalizes multiple thumbnail flags', () => {
  const images = normalizeDishImages([
    { [`${studentId}_ImageUrl`]: '', [`${studentId}_IsThumbnail`]: true },
    { [`${studentId}_ImageUrl`]: ' https://one.test/a ', [`${studentId}_IsThumbnail`]: false },
    { [`${studentId}_ImageUrl`]: 'https://two.test/b', [`${studentId}_IsThumbnail`]: true },
    { [`${studentId}_ImageUrl`]: 'https://three.test/c', [`${studentId}_IsThumbnail`]: true },
  ], studentId);
  assert.equal(images.length, 3);
  assert.equal(images[0][`${studentId}_ImageUrl`], 'https://one.test/a');
  assert.equal(images.filter((image) => image[`${studentId}_IsThumbnail`]).length, 1);
  assert.equal(images[1][`${studentId}_IsThumbnail`], true);
  assert.deepEqual(normalizeDishImages([], studentId), []);
});

test('preparation labels use the 15-minute boundary', () => {
  assert.equal(preparationTimeKind(15), 'quick');
  assert.equal(preparationTimeKind(16), 'regular');
});

test('same-category duplicate names are case-insensitive but edits and other categories are allowed', () => {
  const dishes = [makeDish('existing', 'Pho House')];
  assert.equal(hasDishNameConflict(dishes, '  PHO HOUSE ', 'cat-noodles', 'new-id', studentId), true);
  assert.equal(hasDishNameConflict(dishes, 'Pho House', 'cat-noodles', 'existing', studentId), false);
  assert.equal(hasDishNameConflict(dishes, 'Pho House', 'cat-rice', 'new-id', studentId), false);
});

test('form saves the selected stored category and edits the same dish instead of duplicating it', () => {
  const storedCategories = ['cat-noodles', 'cat-rice', 'cat-drinks'];
  const selectedCategory = storedCategories[1];
  const created = buildDishRecord({
    studentId, id: 'dish-form-1', name: 'Cơm gà', price: 52000, preparationTime: 18,
    isAvailable: true, description: 'Gà ăn kèm cơm.', descriptionEn: 'Chicken with rice.',
    categoryId: selectedCategory,
  });
  assert.equal(created[`${studentId}_DishCategoryId`], 'cat-rice');
  const afterCreate = upsertDish([], created, studentId);
  assert.equal(afterCreate.length, 1);
  const edited = buildDishRecord({
    studentId, id: 'dish-form-1', name: 'Cơm gà nướng', price: 55000, preparationTime: 20,
    isAvailable: true, description: 'Gà nướng ăn kèm cơm.', descriptionEn: 'Grilled chicken with rice.',
    categoryId: selectedCategory,
  });
  const afterEdit = upsertDish(afterCreate, edited, studentId);
  assert.equal(afterEdit.length, 1);
  assert.equal(afterEdit[0][`${studentId}_Name`], 'Cơm gà nướng');
  assert.equal(afterEdit[0][`${studentId}_DishCategoryId`], 'cat-rice');
});

test('English is the migrated default while a later Vietnamese choice persists', () => {
  assert.equal(resolveDefaultLanguage('vi', 1), 'en');
  assert.equal(resolveDefaultLanguage('vi', 2), 'vi');
  assert.equal(resolveDefaultLanguage('unsupported', 2), 'en');
});

test('offline save stays queued, then reconnect creates exactly one MockAPI record', async () => {
  const api = mockApi();
  const dish = makeDish('BIT240015-offline-1');
  const pending = [{ type: 'upsert', id: dish[`${studentId}_Id`] }];
  const args = { apiBaseUrl: 'https://mock.test', collection: 'Dish', studentId, dishes: [dish], pending, fetchImpl: api.fetchImpl };

  const offline = await syncPendingChanges({ ...args, online: false });
  assert.deepEqual(offline.remaining, pending);
  assert.equal(api.records().length, 0);

  const online = await syncPendingChanges({ ...args, online: true });
  assert.equal(online.error, null);
  assert.deepEqual(online.remaining, []);
  assert.equal(api.records().length, 1);
  assert.equal(api.records()[0][`${studentId}_Name`], 'Test Dish');
});

test('retry after a lost POST response updates the existing record instead of duplicating it', async () => {
  const api = mockApi();
  api.failAfterFirstPost();
  const dish = makeDish('BIT240015-offline-retry');
  const pending = [{ type: 'upsert', id: dish[`${studentId}_Id`] }];
  const args = { apiBaseUrl: 'https://mock.test', collection: 'Dish', studentId, dishes: [dish], pending, online: true, fetchImpl: api.fetchImpl };

  const firstAttempt = await syncPendingChanges(args);
  assert.ok(firstAttempt.error);
  assert.equal(firstAttempt.remaining.length, 1);
  dish[`${studentId}_Name`] = 'Updated after retry';
  const retry = await syncPendingChanges(args);
  assert.equal(retry.error, null);
  assert.equal(api.records().length, 1);
  assert.equal(api.records()[0][`${studentId}_Name`], 'Updated after retry');
});
