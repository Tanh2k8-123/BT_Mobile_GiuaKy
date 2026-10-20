import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { syncPendingChanges } from '../syncService.mjs';

const studentId = 'BIT240015';
const apiBaseUrl = 'https://6ad7349995e98f36aef203d5.mockapi.io';
const collection = 'Dish';
const testId = `BIT240015-offline-test-${randomUUID()}`;
const idField = `${studentId}_Id`;
const nameField = `${studentId}_Name`;
const categoryField = `${studentId}_DishCategoryId`;
const dish = {
  [idField]: testId,
  [nameField]: 'Món kiểm tra đồng bộ offline',
  [`${studentId}_Price`]: 23000,
  [`${studentId}_PreparationTime`]: 12,
  [`${studentId}_IsAvailable`]: true,
  [`${studentId}_Description`]: 'Bản ghi tạm để kiểm tra luồng offline.',
  [`${studentId}_DescriptionEn`]: 'Temporary record for offline sync verification.',
  [categoryField]: 'cat-noodles',
  [`${studentId}_DishImage`]: [],
  [`${studentId}_Dirty`]: true,
};

async function findRemote() {
  const query = new URLSearchParams({ [idField]: testId });
  const response = await fetch(`${apiBaseUrl}/${collection}?${query}`);
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`MockAPI lookup failed: ${response.status}`);
  return response.json();
}

async function removeRemoteTestRecord() {
  const records = await findRemote();
  for (const record of records) {
    const serverId = record.Id ?? record.id;
    if (serverId != null) {
      const response = await fetch(`${apiBaseUrl}/${collection}/${encodeURIComponent(serverId)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(`MockAPI cleanup failed: ${response.status}`);
    }
  }
}

async function main() {
  const pending = [{ type: 'upsert', id: testId, revision: Date.now() }];
  const common = { apiBaseUrl, collection, studentId, dishes: [dish], pending };
  try {
    await removeRemoteTestRecord();
    const offline = await syncPendingChanges({ ...common, online: false });
    assert.equal(offline.remaining.length, 1, 'offline save should remain queued');
    assert.equal((await findRemote()).length, 0, 'offline save should not reach MockAPI');

    const created = await syncPendingChanges({ ...common, online: true });
    assert.equal(created.error, null, 'reconnect should upload the queued dish');
    assert.equal(created.remaining.length, 0);
    assert.equal((await findRemote()).length, 1, 'create should produce one remote record');

    dish[nameField] = 'Món kiểm tra đã sửa khi offline';
    const edited = await syncPendingChanges({ ...common, pending: [{ ...pending[0], revision: Date.now() + 1 }], online: true });
    assert.equal(edited.error, null, 'offline edit should update the remote record');
    const records = await findRemote();
    assert.equal(records.length, 1, 'edit should not create a duplicate');
    assert.equal(records[0][nameField], dish[nameField]);

    const removed = await syncPendingChanges({
      ...common, pending: [{ type: 'delete', id: testId, revision: Date.now() + 2 }], online: true,
    });
    assert.equal(removed.error, null, 'delete queue entry should sync');
    assert.equal((await findRemote()).length, 0, 'temporary test record should be cleaned up');
    console.log('Offline-to-online create/edit passed; temporary test record removed.');
  } finally {
    await removeRemoteTestRecord();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
