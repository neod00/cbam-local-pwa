export type StoreName = "installations" | "products" | "periods" | "settings";

export interface LocalEntity {
  id: string;
  created_at: string;
  updated_at: string;
}

export interface Installation extends LocalEntity {
  name: string;
  country: string;
  boundary_json?: Record<string, unknown>;
}

export interface Product extends LocalEntity {
  installation_id?: string;
  name: string;
  hs_code: string;
  hs_group: "72" | "73";
  product_type_enum: string;
  unit: string;
}

export interface ReportingPeriod extends LocalEntity {
  installation_id?: string;
  name: string;
  start_date: string;
  end_date: string;
  status: "DRAFT" | "READY" | "CALCULATED";
}

export interface AppSetting extends LocalEntity {
  key: string;
  value: unknown;
}

type StoreEntityMap = {
  installations: Installation;
  products: Product;
  periods: ReportingPeriod;
  settings: AppSetting;
};

const DB_NAME = "cbam-local";
const DB_VERSION = 1;
const STORE_NAMES: StoreName[] = ["installations", "products", "periods", "settings"];

let dbPromise: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      for (const storeName of STORE_NAMES) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: "id" });
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

async function runTransaction<T>(
  storeName: StoreName,
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = callback(store);
    let result: T;

    if (request) {
      request.onsuccess = () => {
        result = request.result;
      };
      request.onerror = () => reject(request.error);
    }

    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function listLocalItems<TStoreName extends StoreName>(
  storeName: TStoreName
): Promise<StoreEntityMap[TStoreName][]> {
  return runTransaction(storeName, "readonly", (store) => store.getAll());
}

export async function createLocalItem<TStoreName extends StoreName>(
  storeName: TStoreName,
  item: Omit<StoreEntityMap[TStoreName], keyof LocalEntity> & Partial<Pick<LocalEntity, "id">>
): Promise<StoreEntityMap[TStoreName]> {
  const timestamp = nowIso();
  const entity = {
    ...item,
    id: item.id ?? createId(storeName.slice(0, -1)),
    created_at: timestamp,
    updated_at: timestamp,
  } as StoreEntityMap[TStoreName];

  await runTransaction(storeName, "readwrite", (store) => store.put(entity));
  return entity;
}

export async function updateLocalItem<TStoreName extends StoreName>(
  storeName: TStoreName,
  item: StoreEntityMap[TStoreName]
): Promise<StoreEntityMap[TStoreName]> {
  const entity = {
    ...item,
    updated_at: nowIso(),
  };

  await runTransaction(storeName, "readwrite", (store) => store.put(entity));
  return entity;
}

export async function deleteLocalItem(storeName: StoreName, id: string): Promise<void> {
  await runTransaction(storeName, "readwrite", (store) => store.delete(id));
}

export async function seedLocalData(): Promise<void> {
  const [installations, products, periods] = await Promise.all([
    listLocalItems("installations"),
    listLocalItems("products"),
    listLocalItems("periods"),
  ]);

  if (installations.length === 0) {
    const installation = await createLocalItem("installations", {
      name: "Main Factory A",
      country: "KR",
    });

    if (products.length === 0) {
      await createLocalItem("products", {
        installation_id: installation.id,
        name: "Hot Rolled Coil",
        hs_code: "7208",
        hs_group: "72",
        product_type_enum: "HS72_PLATE_SHEET",
        unit: "tonne",
      });
      await createLocalItem("products", {
        installation_id: installation.id,
        name: "Steel Pipe",
        hs_code: "7306",
        hs_group: "73",
        product_type_enum: "HS73_PIPE_TUBE",
        unit: "tonne",
      });
    }

    if (periods.length === 0) {
      await createLocalItem("periods", {
        installation_id: installation.id,
        name: "2024 Annual",
        start_date: "2024-01-01",
        end_date: "2024-12-31",
        status: "DRAFT",
      });
    }
  }
}
