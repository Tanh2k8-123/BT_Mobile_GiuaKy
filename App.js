import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image, Modal, Pressable, SafeAreaView, ScrollView, StatusBar,
  Platform, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import {
  buildDishRecord, filterAndSortDishes, hasDishNameConflict, normalizeDishImages, preparationTimeKind,
  resolveDefaultLanguage, syncPendingChanges, upsertDish, validateDishDraft,
} from './syncService.mjs';

// Every persisted table, field, and storage key is prefixed with the student ID.
const SID = 'BIT240015';
const KEYS = {
  dishes: `${SID}_Dish`, categories: `${SID}_DishCategory`, language: `${SID}_Language`,
  pending: `${SID}_PendingChanges`, languageDefaultVersion: `${SID}_LanguageDefaultVersion`,
  dishContentVersion: `${SID}_DishContentVersion`,
};
const API_BASE_URL = 'https://6ad7349995e98f36aef203d5.mockapi.io';
const COLLECTION = 'Dish';
const CATEGORY_COLLECTION = 'DishCategory';
const SEED_CATEGORIES = [
  { [`${SID}_Id`]: 'cat-noodles', [`${SID}_Name`]: 'Noodles', [`${SID}_Description`]: 'Noodles and pasta' },
  { [`${SID}_Id`]: 'cat-rice', [`${SID}_Name`]: 'Rice dishes', [`${SID}_Description`]: 'Rice meals' },
  { [`${SID}_Id`]: 'cat-drinks', [`${SID}_Name`]: 'Drinks', [`${SID}_Description`]: 'Cold and hot drinks' },
];
const CATEGORY_LABELS = {
  'cat-noodles': { en: 'Noodles', vi: 'Mì & phở' },
  'cat-rice': { en: 'Rice dishes', vi: 'Món cơm' },
  'cat-drinks': { en: 'Drinks', vi: 'Đồ uống' },
};
const SEED_DISHES = [
  ['dish-1', 'Phở bò', 65000, 20, true, 'Phở bò nấu chậm với rau thơm.', 'Slow-simmered beef pho with fresh herbs.', 'cat-noodles', 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=900'],
  ['dish-2', 'Phở gà', 55000, 18, true, 'Phở gà thanh nhẹ ăn kèm rau thơm.', 'Light chicken pho served with fresh herbs.', 'cat-noodles', 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=900'],
  ['dish-3', 'Cơm chiên rau củ', 45000, 12, true, 'Cơm chiên nóng với rau củ.', 'Wok-fried rice with seasonal vegetables.', 'cat-rice', 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=900'],
  ['dish-4', 'Cơm tấm sườn', 60000, 25, false, 'Cơm tấm ăn kèm sườn nướng.', 'Broken rice served with grilled pork.', 'cat-rice', 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=900'],
  ['dish-5', 'Cà phê sữa đá', 30000, 5, true, 'Cà phê Việt Nam với sữa và đá.', 'Vietnamese coffee with milk over ice.', 'cat-drinks', 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=900'],
].map(([id, name, price, time, available, description, descriptionEn, category, url]) => ({
  [`${SID}_Id`]: id, [`${SID}_Name`]: name, [`${SID}_Price`]: price,
  [`${SID}_PreparationTime`]: time, [`${SID}_IsAvailable`]: available,
  [`${SID}_Description`]: description, [`${SID}_DescriptionEn`]: descriptionEn,
  [`${SID}_DishCategoryId`]: category,
  [`${SID}_DishImage`]: [{ [`${SID}_ImageUrl`]: url, [`${SID}_IsThumbnail`]: true }],
  [`${SID}_Dirty`]: false,
}));
const F = (name) => `${SID}_${name}`;
const id = () => `${SID.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function read(key, fallback) {
  try { const value = await AsyncStorage.getItem(key); return value ? JSON.parse(value) : fallback; }
  catch { return fallback; }
}
async function write(key, value) { await AsyncStorage.setItem(key, JSON.stringify(value)); }

const STRINGS = {
  en: {
    title: 'Food Manager', subtitle: 'Your kitchen, under control', search: 'Search dishes...', all: 'All categories',
    available: 'Available', anyStatus: 'All status', priceMin: 'Min price', priceMax: 'Max price', sort: 'Sort',
    newest: 'Default', priceAsc: 'Price: low to high', priceDesc: 'Price: high to low', timeAsc: 'Prep: quickest',
    dishes: 'DISHES', add: 'Add dish', details: 'Dish details', edit: 'Edit dish', name: 'Name', category: 'Category',
    price: 'Price (VND)', prep: 'Preparation time (min)', description: 'Description', image: 'Image URL',
    addImage: 'Add image URL', save: 'Save dish', cancel: 'Cancel', delete: 'Delete', editAction: 'Edit',
    images: 'Photos', setCover: 'Set as cover', cover: 'COVER', regular: 'Regular', quick: 'Quick',
    active: 'Available', inactive: 'Not available', noDishes: 'No dishes found', validation: 'Please complete all required fields correctly.',
    duplicate: 'A dish with this name already exists in this category.', confirmDelete: 'Delete this dish?', confirm: 'Confirm',
    synced: 'All changes synced', pending: 'changes waiting to sync', offline: 'Offline · changes saved on this device',
    online: 'Online', syncError: 'Sync error · local changes are safe', language: 'VI', close: 'Close', choose: 'Choose a category', noImages: 'No photos added',
    minError: 'Minimum price cannot exceed maximum price.',
  },
  vi: {
    title: 'Quản lý món ăn', subtitle: 'Bếp của bạn trong tầm tay', search: 'Tìm món ăn...', all: 'Tất cả loại món',
    available: 'Đang bán', anyStatus: 'Mọi trạng thái', priceMin: 'Giá từ', priceMax: 'Giá đến', sort: 'Sắp xếp',
    newest: 'Mặc định', priceAsc: 'Giá tăng dần', priceDesc: 'Giá giảm dần', timeAsc: 'Thời gian nhanh nhất',
    dishes: 'MÓN ĂN', add: 'Thêm món', details: 'Chi tiết món ăn', edit: 'Sửa món', name: 'Tên món', category: 'Loại món',
    price: 'Giá (VND)', prep: 'Thời gian chế biến (phút)', description: 'Mô tả', image: 'Đường dẫn ảnh',
    addImage: 'Thêm đường dẫn ảnh', save: 'Lưu món', cancel: 'Hủy', delete: 'Xóa', editAction: 'Sửa',
    images: 'Hình ảnh', setCover: 'Chọn ảnh đại diện', cover: 'ĐẠI DIỆN', regular: 'Thông thường', quick: 'Nhanh',
    active: 'Đang bán', inactive: 'Ngừng bán', noDishes: 'Không tìm thấy món ăn', validation: 'Vui lòng nhập đúng các trường bắt buộc.',
    duplicate: 'Tên món đã tồn tại trong loại này.', confirmDelete: 'Bạn có chắc muốn xóa món này?', confirm: 'Xác nhận',
    synced: 'Đã đồng bộ', pending: 'thay đổi chờ đồng bộ', offline: 'Ngoại tuyến · dữ liệu đã lưu trên máy',
    online: 'Trực tuyến', syncError: 'Lỗi đồng bộ · dữ liệu cục bộ vẫn an toàn', language: 'EN', close: 'Đóng', choose: 'Chọn loại món', noImages: 'Chưa có ảnh',
    minError: 'Giá tối thiểu không được lớn hơn giá tối đa.',
  },
};

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}/${path}`, {
    ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!response.ok) throw new Error(`MockAPI ${response.status}`);
  return response.status === 204 ? null : response.json();
}

function fromRemoteCategory(item) {
  if (!item?.[F('Id')] || !String(item[F('Name')] || '').trim()) return null;
  return {
    [F('Id')]: item[F('Id')], [F('Name')]: item[F('Name')] || '',
    [F('Description')]: item[F('Description')] || '',
  };
}

function fromRemoteDish(item, validCategoryIds) {
  if (!item?.[F('Id')] || !validCategoryIds.has(item[F('DishCategoryId')])) return null;
  const name = String(item[F('Name')] || '').trim();
  const price = Number(item[F('Price')]);
  const preparationTime = Number(item[F('PreparationTime')]);
  if (!name || !Number.isFinite(price) || price <= 0 || !Number.isInteger(preparationTime) || preparationTime <= 0) return null;
  const images = normalizeDishImages(item[F('DishImage')], SID);
  return {
    [F('Id')]: item[F('Id')], [F('Name')]: name,
    [F('Price')]: price, [F('PreparationTime')]: preparationTime,
    [F('IsAvailable')]: Boolean(item[F('IsAvailable')]), [F('Description')]: item[F('Description')] || '',
    [F('DescriptionEn')]: item[F('DescriptionEn')] || '',
    [F('DishCategoryId')]: item[F('DishCategoryId')],
    [F('DishImage')]: images, [F('Dirty')]: false,
  };
}

export default function App() {
  const [dishes, setDishes] = useState([]);
  const [categories, setCategories] = useState(SEED_CATEGORIES);
  const [language, setLanguage] = useState('vi');
  const [online, setOnline] = useState(false);
  const [pending, setPending] = useState([]);
  const [ready, setReady] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [availableOnly, setAvailableOnly] = useState(false);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sort, setSort] = useState('newest');
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteReturnModal, setDeleteReturnModal] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState('');
  const [retryToken, setRetryToken] = useState(0);
  const persistenceQueue = useRef(Promise.resolve());
  const t = STRINGS[language];

  useEffect(() => {
    (async () => {
      const [savedDishes, savedCategories, savedLanguage, savedPending, languageDefaultVersion, dishContentVersion] = await Promise.all([
        read(KEYS.dishes, null), read(KEYS.categories, null), read(KEYS.language, 'en'), read(KEYS.pending, []),
        read(KEYS.languageDefaultVersion, 0), read(KEYS.dishContentVersion, 0),
      ]);
      let loadedDishes = savedDishes || SEED_DISHES;
      let loadedPending = savedPending || [];
      if (savedDishes && dishContentVersion < 2) {
        const localizedSeedById = new Map(SEED_DISHES.map((dish) => [dish[F('Id')], dish]));
        const updatedIds = [];
        loadedDishes = loadedDishes.map((dish) => {
          const localizedSeed = localizedSeedById.get(dish[F('Id')]);
          if (!localizedSeed) return dish;
          updatedIds.push(dish[F('Id')]);
          return { ...dish, [F('Name')]: localizedSeed[F('Name')], [F('Description')]: localizedSeed[F('Description')],
            [F('DescriptionEn')]: localizedSeed[F('DescriptionEn')], [F('Dirty')]: true };
        });
        loadedPending = [...loadedPending.filter((change) => !updatedIds.includes(change.id)),
          ...updatedIds.map((dishId, index) => ({ type: 'upsert', id: dishId, revision: Date.now() + index }))];
        await write(KEYS.dishContentVersion, 2);
      }
      if (!savedDishes && dishContentVersion < 2) await write(KEYS.dishContentVersion, 2);
      setDishes(loadedDishes);
      setCategories(Array.isArray(savedCategories) && savedCategories.length ? savedCategories : SEED_CATEGORIES);
      const shouldApplyDefaultLanguage = languageDefaultVersion < 2;
      setLanguage(resolveDefaultLanguage(savedLanguage, languageDefaultVersion));
      setPending(loadedPending);
      if (shouldApplyDefaultLanguage) {
        await Promise.all([write(KEYS.language, 'en'), write(KEYS.languageDefaultVersion, 2)]);
      }
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    persistenceQueue.current = persistenceQueue.current.then(() => Promise.all([
      write(KEYS.dishes, dishes), write(KEYS.categories, categories),
      write(KEYS.pending, pending), write(KEYS.language, language),
    ])).catch(() => setSyncError(true));
  }, [dishes, categories, pending, language, ready]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const update = () => setOnline(typeof navigator !== 'undefined' && navigator.onLine);
      update();
      window.addEventListener('online', update);
      window.addEventListener('offline', update);
      return () => {
        window.removeEventListener('online', update);
        window.removeEventListener('offline', update);
      };
    }
    return NetInfo.addEventListener((state) => setOnline(Boolean(state.isConnected && state.isInternetReachable !== false)));
  }, []);

  // Pull server state, ensure the app's seed categories exist, and upload clean local seeds once.
  useEffect(() => {
    if (!ready || !online || !API_BASE_URL) return;
    let cancelled = false;
    let retryTimer;
    (async () => {
      try {
        const [remoteDishes, remoteCategories] = await Promise.all([
          apiRequest(COLLECTION), apiRequest(CATEGORY_COLLECTION),
        ]);
        if (cancelled) return;
        const serverCategories = (remoteCategories || []).map(fromRemoteCategory).filter(Boolean);
        const categoryIds = new Set([...categories, ...serverCategories].map((category) => category[F('Id')]));
        const serverDishes = (remoteDishes || []).map((dish) => fromRemoteDish(dish, categoryIds)).filter(Boolean);
        const categoryById = new Map(serverCategories.map((category) => [category[F('Id')], category]));
        for (const category of categories) {
          if (!categoryById.has(category[F('Id')])) {
            await apiRequest(CATEGORY_COLLECTION, { method: 'POST', body: JSON.stringify(category) });
            categoryById.set(category[F('Id')], category);
          }
        }
        const dishById = new Map(serverDishes.map((dish) => [dish[F('Id')], dish]));
        for (const dish of dishes) {
          if (!dish[F('Dirty')] && !dishById.has(dish[F('Id')])) {
            await apiRequest(COLLECTION, { method: 'POST', body: JSON.stringify(toRemote(dish)) });
            dishById.set(dish[F('Id')], dish);
          }
        }
        if (cancelled) return;
        setCategories((current) => {
          const merged = [...serverCategories];
          for (const category of current) if (!categoryById.has(category[F('Id')])) merged.push(category);
          return merged.length ? merged : current;
        });
        setDishes((local) => {
          const localById = new Map(local.map((dish) => [dish[F('Id')], dish]));
          const remoteById = new Map([...dishById.values()].map((dish) => [dish[F('Id')], dish]));
          const deletedIds = new Set(pending.filter((change) => change.type === 'delete').map((change) => change.id));
          const merged = [...remoteById.values()].filter((dish) => !deletedIds.has(dish[F('Id')])).map((remote) => {
            const current = localById.get(remote[F('Id')]);
            return current?.[F('Dirty')] ? current : remote;
          });
          for (const current of local) if (!remoteById.has(current[F('Id')]) && !deletedIds.has(current[F('Id')])) merged.push(current);
          return merged;
        });
        setSyncError(false);
      } catch (error) {
        if (!cancelled) {
          console.warn('[FoodManager] initial MockAPI sync failed:', error);
          setSyncError(true);
          retryTimer = setTimeout(() => setRetryToken((value) => value + 1), 5000);
        }
      }
    })();
    return () => { cancelled = true; if (retryTimer) clearTimeout(retryTimer); };
  }, [ready, online, retryToken]);

  const pendingSignature = pending.map((change) => `${change.type}:${change.id}:${change.revision || 0}`).join('|');
  useEffect(() => {
    if (!ready || !online || !API_BASE_URL || pending.length === 0) return;
    let cancelled = false;
    let retryTimer;
    (async () => {
      const result = await syncPendingChanges({
        apiBaseUrl: API_BASE_URL, collection: COLLECTION, studentId: SID,
        dishes, pending, online, fetchImpl: fetch,
      });
      if (cancelled) return;
      const syncedIds = new Set(result.syncedIds);
      if (syncedIds.size) setDishes((current) => current.map((dish) => syncedIds.has(dish[F('Id')])
        ? { ...dish, [F('Dirty')]: false } : dish));
      setPending(result.remaining);
      if (result.error) {
        console.warn('[FoodManager] queued sync failed:', result.error);
        setSyncError(true);
        retryTimer = setTimeout(() => setRetryToken((value) => value + 1), 5000);
      } else if (result.remaining.length === 0) {
        setSyncError(false);
      }
    })();
    return () => { cancelled = true; if (retryTimer) clearTimeout(retryTimer); };
  }, [ready, online, pendingSignature, retryToken]);

  const visibleDishes = useMemo(() => filterAndSortDishes({
    dishes, studentId: SID, query, categoryId: categoryFilter, availableOnly,
    minPrice, maxPrice, sort,
  }), [dishes, query, categoryFilter, availableOnly, minPrice, maxPrice, sort]);
  const invalidPriceRange = minPrice !== '' && maxPrice !== '' && Number(minPrice) > Number(maxPrice);

  function openForm(dish = null) {
    setSelected(dish);
    setFormError('');
    setForm(dish ? {
      name: dish[F('Name')], price: String(dish[F('Price')]), prep: String(dish[F('PreparationTime')]),
      description: language === 'en' ? (dish[F('DescriptionEn')] || dish[F('Description')]) : dish[F('Description')],
      category: dish[F('DishCategoryId')], available: dish[F('IsAvailable')],
      images: (dish[F('DishImage')] || []).map((image) => image[F('ImageUrl')]), cover: Math.max(0, (dish[F('DishImage')] || []).findIndex((image) => image[F('IsThumbnail')])),
    } : emptyForm());
    setModal('form');
  }

  function updateForm(patch) {
    setForm((current) => ({ ...current, ...patch }));
    setFormError('');
  }

  function persistChange(next, change) {
    setDishes(next); setPending((current) => [...current.filter((item) => item.id !== change.id), { ...change, revision: Date.now() }]);
  }

  function saveDish() {
    const validation = validateDishDraft({
      name: form.name, price: form.price, preparationTime: form.prep,
      categoryId: form.category, categoryIds: categories.map((category) => category[F('Id')]),
    });
    if (!validation.ok) { setFormError(t.validation); return; }
    const { name, price, preparationTime: prep } = validation.value;
    if (hasDishNameConflict(dishes, name, form.category, selected?.[F('Id')], SID)) {
      setFormError(t.duplicate); return;
    }
    const dishId = selected?.[F('Id')] || id();
    const dish = buildDishRecord({
      studentId: SID, id: dishId, name, price, preparationTime: prep, isAvailable: form.available,
      description: language === 'vi' ? form.description.trim() : (selected?.[F('Description')] || form.description.trim()),
      descriptionEn: language === 'en' ? form.description.trim() : (selected?.[F('DescriptionEn')] || ''),
      categoryId: form.category, imageUrls: form.images, coverIndex: form.cover,
    });
    const next = upsertDish(dishes, dish, SID);
    persistChange(next, { type: 'upsert', id: dishId }); setFormError(''); setModal(null);
  }

  function deleteDish(dish) {
    setDeleteReturnModal(modal);
    setModal(null);
    setDeleteTarget(dish);
  }

  function cancelDelete() {
    setDeleteTarget(null);
    setModal(deleteReturnModal);
    setDeleteReturnModal(null);
  }

  function confirmDeleteDish() {
    if (!deleteTarget) return;
    const deletedId = deleteTarget[F('Id')];
    setDishes((current) => current.filter((dish) => dish[F('Id')] !== deletedId));
    setPending((current) => [...current.filter((change) => change.id !== deletedId), {
      type: 'delete', id: deletedId, revision: Date.now(),
    }]);
    setSelected((current) => current?.[F('Id')] === deletedId ? null : current);
    setDeleteTarget(null);
    setDeleteReturnModal(null);
    setModal(null);
  }

  function openDetails(dish) { setSelected(dish); setModal('details'); }
  function categoryName(categoryId) {
    return CATEGORY_LABELS[categoryId]?.[language]
      || categories.find((c) => c[F('Id')] === categoryId)?.[F('Name')]
      || '—';
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ExpoStatusBar style="dark" />
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <View><Text style={styles.eyebrow}>BIT240015 · FOOD SERVICE</Text><Text style={styles.title}>{t.title}</Text><Text style={styles.subtitle}>{t.subtitle}</Text></View>
        <Pressable style={styles.languageButton} onPress={() => setLanguage(language === 'en' ? 'vi' : 'en')}><Text style={styles.languageText}>{t.language}</Text></Pressable>
      </View>
      <View style={[styles.syncBanner, !online && styles.syncOffline]}>
        <View style={[styles.dot, online && API_BASE_URL ? styles.dotOnline : styles.dotOffline]} />
        <Text style={styles.syncText}>{!online ? t.offline : syncError ? t.syncError : pending.length ? `${pending.length} ${t.pending}` : t.synced}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextInput style={styles.search} placeholder={t.search} placeholderTextColor="#9a9b95" value={query} onChangeText={setQuery} />
        <View style={styles.chips}>
          <Chip label={t.all} active={categoryFilter === 'all'} onPress={() => setCategoryFilter('all')} />
          {categories.map((category) => <Chip key={category[F('Id')]} label={categoryName(category[F('Id')])} active={categoryFilter === category[F('Id')]} onPress={() => setCategoryFilter(category[F('Id')])} />)}
        </View>
        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>{t.available}</Text><Switch value={availableOnly} onValueChange={setAvailableOnly} trackColor={{ true: '#1f6650' }} />
        </View>
        <View style={styles.priceRow}>
          <TextInput style={styles.priceInput} keyboardType="numeric" placeholder={t.priceMin} value={minPrice} onChangeText={setMinPrice} />
          <Text style={styles.to}>—</Text>
          <TextInput style={styles.priceInput} keyboardType="numeric" placeholder={t.priceMax} value={maxPrice} onChangeText={setMaxPrice} />
        </View>
        {invalidPriceRange && <Text style={styles.rangeError}>{t.minError}</Text>}
        <Text style={styles.sectionLabel}>{t.sort}</Text>
        <View style={styles.chips}>
          {['newest', 'priceAsc', 'priceDesc', 'timeAsc'].map((value) => <Chip key={value} label={t[value]} active={sort === value} onPress={() => setSort(value)} small />)}
        </View>
        <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>{t.dishes} <Text style={styles.count}>{visibleDishes.length.toString().padStart(2, '0')}</Text></Text><Pressable style={styles.addButton} onPress={() => openForm()}><Text style={styles.addText}>＋ {t.add}</Text></Pressable></View>
        {visibleDishes.map((dish) => {
          const thumbnail = (dish[F('DishImage')] || []).find((photo) => photo[F('IsThumbnail')]) || dish[F('DishImage')]?.[0];
          return <Pressable key={dish[F('Id')]} style={styles.card} onPress={() => openDetails(dish)}>
            {thumbnail ? <Image source={{ uri: thumbnail[F('ImageUrl')] }} style={styles.cardImage} /> : <View style={[styles.cardImage, styles.imagePlaceholder]}><Text>🍽</Text></View>}
            <View style={styles.cardBody}>
              <View style={styles.cardTop}><Text style={styles.categoryTag}>{categoryName(dish[F('DishCategoryId')]).toUpperCase()}</Text><Text style={[styles.status, dish[F('IsAvailable')] ? styles.statusOn : styles.statusOff]}>{dish[F('IsAvailable')] ? t.active : t.inactive}</Text></View>
              <Text style={styles.dishName}>{dish[F('Name')]}</Text>
              <Text style={styles.cardDescription} numberOfLines={1}>{dishDescription(dish, language) || '—'}</Text>
              <View style={styles.cardBottom}><Text style={styles.price}>{Number(dish[F('Price')]).toLocaleString()} <Text style={styles.currency}>VND</Text></Text><Text style={styles.time}>◷ {dish[F('PreparationTime')]} min · {t[preparationTimeKind(dish[F('PreparationTime')])]}</Text></View>
            </View>
          </Pressable>;
        })}
        {visibleDishes.length === 0 && <View style={styles.empty}><Text style={styles.emptyIcon}>⌕</Text><Text style={styles.emptyText}>{t.noDishes}</Text></View>}
        <Text style={styles.footer}>BIT240015_FoodManager</Text>
      </ScrollView>

      <Modal visible={modal === 'form'} animationType="slide" onRequestClose={() => setModal(null)}>
        <SafeAreaView style={styles.modalSafe}><View style={styles.modalHeader}><Pressable onPress={() => setModal(null)}><Text style={styles.close}>{t.cancel}</Text></Pressable><Text style={styles.modalTitle}>{selected ? t.edit : t.add}</Text><View style={{ width: 45 }} /></View>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <Field label={t.name} value={form.name} onChangeText={(name) => updateForm({ name })} />
            <Text style={styles.label}>{t.category}</Text><View style={styles.chips}>{categories.map((c) => <Chip key={c[F('Id')]} label={categoryName(c[F('Id')])} active={form.category === c[F('Id')]} onPress={() => updateForm({ category: c[F('Id')] })} />)}</View>
            <View style={styles.twoFields}><View style={{ flex: 1 }}><Field label={t.price} value={form.price} onChangeText={(price) => updateForm({ price })} numeric /></View><View style={{ flex: 1 }}><Field label={t.prep} value={form.prep} onChangeText={(prep) => updateForm({ prep })} numeric /></View></View>
            <Field label={t.description} value={form.description} onChangeText={(description) => updateForm({ description })} multiline />
            {!!formError && <Text accessibilityRole="alert" style={styles.formError}>{formError}</Text>}
            <Text style={styles.label}>{t.images}</Text>
            {form.images.map((url, index) => <View key={`${index}-${url}`} style={styles.imageField}><TextInput style={[styles.input, { flex: 1 }]} value={url} onChangeText={(value) => updateForm({ images: form.images.map((item, i) => i === index ? value : item) })} autoCapitalize="none" placeholder={t.image} /><Pressable onPress={() => updateForm({ images: form.images.filter((_, i) => i !== index), cover: Math.max(0, form.cover - (index <= form.cover ? 1 : 0)) })}><Text style={styles.remove}>×</Text></Pressable></View>)}
            <Field label={t.addImage} value={form.newImage || ''} onChangeText={(newImage) => updateForm({ newImage })} autoCapitalize="none" />
            <Pressable style={styles.outlineButton} onPress={() => { if (form.newImage?.trim()) updateForm({ images: [...form.images, form.newImage.trim()], cover: form.images.length, newImage: '' }); }}><Text style={styles.outlineText}>＋ {t.addImage}</Text></Pressable>
            {form.images.map((_, index) => <Pressable key={`cover-${index}`} onPress={() => updateForm({ cover: index })}><Text style={styles.coverChoice}>{index === form.cover ? '◉' : '○'} {t.setCover} {index + 1}</Text></Pressable>)}
            <View style={styles.filterRow}><Text style={styles.label}>{t.available}</Text><Switch value={form.available} onValueChange={(available) => updateForm({ available })} trackColor={{ true: '#1f6650' }} /></View>
            <Pressable style={styles.primaryButton} onPress={saveDish}><Text style={styles.primaryText}>{t.save}</Text></Pressable>
            {!!selected && <Pressable style={styles.deleteButton} onPress={() => deleteDish(selected)}><Text style={styles.deleteText}>{t.delete}</Text></Pressable>}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal visible={modal === 'details'} animationType="slide" onRequestClose={() => setModal(null)}>
        <SafeAreaView style={styles.modalSafe}><View style={styles.modalHeader}><Pressable onPress={() => setModal(null)}><Text style={styles.close}>{t.close}</Text></Pressable><Text style={styles.modalTitle}>{t.details}</Text><Pressable onPress={() => openForm(selected)}><Text style={styles.close}>{t.editAction}</Text></Pressable></View>
          {selected && <ScrollView contentContainerStyle={styles.detail}>
            {(selected[F('DishImage')] || []).map((photo, index) => <View key={photo[F('ImageUrl')] + index} style={styles.detailPhotoWrap}><Image source={{ uri: photo[F('ImageUrl')] }} style={styles.detailPhoto} /><View style={styles.photoCaption}><Text style={styles.cardDescription}>{photo[F('IsThumbnail')] ? t.cover : `${t.images} ${index + 1}`}</Text><Pressable onPress={() => { const images = selected[F('DishImage')].map((item, i) => ({ ...item, [F('IsThumbnail')]: i === index })); const updated = { ...selected, [F('DishImage')]: images, [F('Dirty')]: true }; setSelected(updated); persistChange(dishes.map((d) => d[F('Id')] === updated[F('Id')] ? updated : d), { type: 'upsert', id: updated[F('Id')] }); }}><Text style={styles.close}>{t.setCover}</Text></Pressable></View></View>)}
            {!(selected[F('DishImage')] || []).length && <Text style={styles.noImages}>{t.noImages}</Text>}
            <Text style={styles.categoryTag}>{categoryName(selected[F('DishCategoryId')]).toUpperCase()}</Text><Text style={styles.detailTitle}>{selected[F('Name')]}</Text>
            <Text style={styles.price}>{Number(selected[F('Price')]).toLocaleString()} <Text style={styles.currency}>VND</Text></Text>
            <Text style={styles.detailMeta}>◷ {selected[F('PreparationTime')]} min · {t[preparationTimeKind(selected[F('PreparationTime')])]} · {selected[F('IsAvailable')] ? t.active : t.inactive}</Text>
            <Text style={styles.detailDescription}>{dishDescription(selected, language) || '—'}</Text>
            <Pressable style={styles.deleteButton} onPress={() => deleteDish(selected)}><Text style={styles.deleteText}>{t.delete}</Text></Pressable>
          </ScrollView>}
        </SafeAreaView>
      </Modal>

      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={cancelDelete}>
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>{t.confirm}</Text>
            <Text style={styles.confirmMessage}>{t.confirmDelete}</Text>
            <View style={styles.confirmActions}>
              <Pressable accessibilityRole="button" style={styles.confirmCancel} onPress={cancelDelete}>
                <Text style={styles.confirmCancelText}>{t.cancel}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" style={styles.confirmDelete} onPress={confirmDeleteDish}>
                <Text style={styles.confirmDeleteText}>{t.delete}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function emptyForm() { return { name: '', price: '', prep: '', description: '', category: 'cat-noodles', available: true, images: [], cover: 0, newImage: '' }; }
function toRemote(dish) { const result = { ...dish }; delete result[F('Dirty')]; return result; }
function dishDescription(dish, language) { return language === 'en' ? (dish[F('DescriptionEn')] || dish[F('Description')]) : dish[F('Description')]; }
function Chip({ label, active, onPress, small }) { return <Pressable onPress={onPress} style={[styles.chip, small && styles.chipSmall, active && styles.chipActive]}><Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text></Pressable>; }
function Field({ label, value, onChangeText, numeric, multiline, autoCapitalize }) { return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput style={[styles.input, multiline && styles.multiline]} value={value} onChangeText={onChangeText} keyboardType={numeric ? 'numeric' : 'default'} multiline={multiline} autoCapitalize={autoCapitalize || 'sentences'} /></View>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f7f7f2' }, header: { paddingHorizontal: 22, paddingTop: 13, paddingBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: '#6a766b', fontSize: 10, letterSpacing: 1.8, fontWeight: '800' }, title: { color: '#15291f', fontSize: 28, fontWeight: '800', marginTop: 5, letterSpacing: -0.8 }, subtitle: { color: '#829086', fontSize: 12, marginTop: 3 },
  languageButton: { borderWidth: 1, borderColor: '#dce2d9', backgroundColor: '#fff', borderRadius: 15, paddingHorizontal: 14, paddingVertical: 10 }, languageText: { color: '#205c48', fontWeight: '800' },
  syncBanner: { marginHorizontal: 20, borderRadius: 12, backgroundColor: '#e8f1eb', paddingVertical: 9, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 8 }, syncOffline: { backgroundColor: '#f1eee6' }, dot: { width: 7, height: 7, borderRadius: 8, marginRight: 8 }, dotOnline: { backgroundColor: '#3d9569' }, dotOffline: { backgroundColor: '#ce9e45' }, syncText: { color: '#607267', fontSize: 11, fontWeight: '600' },
  content: { paddingHorizontal: 20, paddingBottom: 30 }, search: { backgroundColor: '#fff', borderColor: '#eceee8', borderWidth: 1, height: 48, borderRadius: 14, paddingHorizontal: 15, color: '#20362c', marginTop: 8, marginBottom: 12 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 8 }, chip: { borderRadius: 20, backgroundColor: '#fff', borderColor: '#e4e8e1', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 }, chipActive: { backgroundColor: '#205c48', borderColor: '#205c48' }, chipText: { fontSize: 11, color: '#67766c', fontWeight: '600' }, chipTextActive: { color: '#fff' }, chipSmall: { paddingHorizontal: 9, paddingVertical: 7 },
  filterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 40 }, filterLabel: { color: '#66746b', fontSize: 12, fontWeight: '600' }, priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 }, priceInput: { flex: 1, height: 42, borderRadius: 11, backgroundColor: '#fff', borderWidth: 1, borderColor: '#eceee8', paddingHorizontal: 12, color: '#25382e', fontSize: 12 }, to: { color: '#9aa199' }, sectionLabel: { color: '#68746c', fontSize: 11, fontWeight: '700', marginTop: 14, marginBottom: 8 },
  rangeError: { color: '#a5483c', fontSize: 11, marginTop: 6 },
  confirmBackdrop: { flex: 1, backgroundColor: 'rgba(18, 35, 27, 0.38)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  confirmCard: { width: '100%', maxWidth: 380, backgroundColor: '#fff', borderRadius: 18, padding: 22, borderWidth: 1, borderColor: '#e8ebe4' },
  confirmTitle: { color: '#1b3025', fontSize: 18, fontWeight: '800' },
  confirmMessage: { color: '#66746b', fontSize: 14, lineHeight: 21, marginTop: 10 },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 22 },
  confirmCancel: { borderRadius: 11, borderWidth: 1, borderColor: '#dce2d9', paddingVertical: 11, paddingHorizontal: 18 },
  confirmCancelText: { color: '#506157', fontSize: 13, fontWeight: '700' },
  confirmDelete: { borderRadius: 11, backgroundColor: '#a5483c', paddingVertical: 11, paddingHorizontal: 18 },
  confirmDeleteText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 15, marginBottom: 10 }, sectionTitle: { color: '#78847c', fontSize: 11, letterSpacing: 1.3, fontWeight: '800' }, count: { color: '#acb2ac' }, addButton: { backgroundColor: '#205c48', borderRadius: 11, paddingHorizontal: 12, paddingVertical: 9 }, addText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  card: { backgroundColor: '#fff', borderRadius: 17, overflow: 'hidden', marginBottom: 12, borderWidth: 1, borderColor: '#eceee8' }, cardImage: { width: '100%', height: 155, backgroundColor: '#e8ede6' }, imagePlaceholder: { alignItems: 'center', justifyContent: 'center' }, cardBody: { padding: 14 }, cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, categoryTag: { color: '#4c7a62', fontSize: 9, letterSpacing: 1.1, fontWeight: '800' }, status: { fontSize: 9, fontWeight: '700', borderRadius: 9, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4 }, statusOn: { color: '#27674c', backgroundColor: '#e8f3e9' }, statusOff: { color: '#967343', backgroundColor: '#f7f0e3' }, dishName: { color: '#1b3025', fontSize: 19, fontWeight: '800', marginTop: 6 }, cardDescription: { color: '#8a948d', fontSize: 11, marginTop: 4 }, cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }, price: { color: '#1f6049', fontSize: 15, fontWeight: '800' }, currency: { color: '#8c9a90', fontSize: 9, fontWeight: '700' }, time: { color: '#8a948d', fontSize: 10 }, empty: { alignItems: 'center', padding: 44 }, emptyIcon: { color: '#acb8ad', fontSize: 40 }, emptyText: { color: '#7c8a7f', marginTop: 8 }, footer: { textAlign: 'center', color: '#abb2aa', fontSize: 10, marginTop: 12, letterSpacing: 1 },
  modalSafe: { flex: 1, backgroundColor: '#f7f7f2' }, modalHeader: { minHeight: 56, paddingHorizontal: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderColor: '#e8ebe4' }, modalTitle: { fontSize: 16, color: '#1c3025', fontWeight: '800' }, close: { color: '#28634d', fontWeight: '700', fontSize: 13 }, form: { padding: 20, paddingBottom: 40 }, field: { marginBottom: 14 }, label: { color: '#6e7b71', fontSize: 11, fontWeight: '700', marginBottom: 7 }, input: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: '#e4e8e1', backgroundColor: '#fff', paddingHorizontal: 13, color: '#24382d', fontSize: 13 }, multiline: { minHeight: 85, paddingTop: 12, textAlignVertical: 'top' }, formError: { color: '#a5483c', fontSize: 12, lineHeight: 18, marginBottom: 12 }, twoFields: { flexDirection: 'row', gap: 10 }, imageField: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }, remove: { color: '#b95445', fontSize: 24, paddingHorizontal: 5 }, outlineButton: { borderWidth: 1, borderColor: '#b7c9bd', borderRadius: 11, alignItems: 'center', padding: 11, marginTop: 3 }, outlineText: { color: '#28634d', fontWeight: '700', fontSize: 12 }, coverChoice: { color: '#557260', fontSize: 11, paddingVertical: 7 }, primaryButton: { backgroundColor: '#205c48', borderRadius: 13, alignItems: 'center', padding: 15, marginTop: 20 }, primaryText: { color: '#fff', fontWeight: '800' }, deleteButton: { borderWidth: 1, borderColor: '#e5c9c3', borderRadius: 12, alignItems: 'center', padding: 13, marginTop: 12 }, deleteText: { color: '#a5483c', fontWeight: '700' },
  detail: { padding: 20, paddingBottom: 40 }, detailPhotoWrap: { backgroundColor: '#fff', borderRadius: 15, overflow: 'hidden', marginBottom: 12 }, detailPhoto: { height: 225, backgroundColor: '#e8ede6' }, photoCaption: { padding: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, noImages: { color: '#8a948d', paddingVertical: 15 }, detailTitle: { color: '#1b3025', fontSize: 27, fontWeight: '800', marginTop: 7 }, detailMeta: { color: '#748278', marginTop: 10 }, detailDescription: { color: '#54655a', fontSize: 14, lineHeight: 22, marginTop: 18 },
});
