export type StoreName =
  | "installations"
  | "products"
  | "periods"
  | "processes"
  | "product_output_lines"
  | "source_streams"
  | "precursors"
  | "settings";

export interface LocalEntity {
  id: string;
  created_at: string;
  updated_at: string;
}

export interface Installation extends LocalEntity {
  name: string;
  local_name?: string;
  country: string;
  street?: string;
  economic_activity?: string;
  postcode?: string;
  po_box?: string;
  city?: string;
  unlocode?: string;
  latitude?: string;
  longitude?: string;
  authorized_representative_name?: string;
  email?: string;
  telephone?: string;
  boundary_json?: Record<string, unknown>;
}

export type ProductReportingScope =
  | "CBAM_GOOD"
  | "NON_CBAM_COPRODUCT"
  | "WASTE_RECYCLE"
  | "INTERNAL_ONLY";

export interface Product extends LocalEntity {
  installation_id?: string;
  name: string;
  hs_code: string;
  cn_code?: string;
  hs_group: string;
  product_type_enum: string;
  unit: string;
  reporting_scope?: ProductReportingScope;
}

export interface ReportingPeriod extends LocalEntity {
  installation_id?: string;
  name: string;
  start_date: string;
  end_date: string;
  status: "DRAFT" | "READY" | "CALCULATED";
}

export interface ProductionProcess extends LocalEntity {
  period_id?: string;
  product_id?: string;
  name: string;
  production_route: string;
  output_mass_t: number;
  market_output_mass_t: number;
  internal_consumption_mass_t: number;
  direct_attributable_emissions_tco2e: number;
  electricity_mwh: number;
  electricity_ef_tco2e_per_mwh: number;
  // 전력 EF 출처 유형(CBAM 위계). 선택적: 기존 .cbam 백업과의 하위호환을 위해 undefined 허용.
  electricity_ef_source?: string;
}

export interface ProductOutputLine extends LocalEntity {
  process_id: string;
  product_id?: string;
  name: string;
  output_mass_t: number;
  allocation_basis: "MASS" | "MANUAL";
  manual_allocation_percent: number;
  note: string;
  reporting_scope?: ProductReportingScope;
}

export interface SourceStream extends LocalEntity {
  period_id?: string;
  process_id?: string;
  name: string;
  stream_type: "FUEL" | "PROCESS_MATERIAL" | "OTHER";
  method: string;
  activity_data: number;
  activity_unit: string;
  ncv_gj_per_unit: number;
  emission_factor_tco2e_per_unit: number;
  // Optional for backward compatibility with existing .cbam backups.
  // Missing fuel records are interpreted as energy-basis factors (tCO2e/TJ), matching the original app formula.
  emission_factor_basis?: "PER_TJ" | "PER_ACTIVITY_UNIT";
  oxidation_factor: number;
  conversion_factor: number;
  fossil_fraction: number;
  biomass_fraction: number;
  factor_source_type?: "EU_OR_IPCC_DEFAULT" | "NATIONAL_INVENTORY" | "SUPPLIER_OR_LAB" | "UNCLASSIFIED";
  source: string;
}

export interface PrecursorOutputAllocation {
  product_output_line_id?: string;
  product_id?: string;
  allocated_mass_t: number;
  allocation_percent?: number;
  note?: string;
}

export interface PurchasedPrecursor extends LocalEntity {
  period_id?: string;
  process_id?: string;
  product_id?: string;
  name: string;
  precursor_cn_code?: string;
  aggregated_goods_category: string;
  production_route: string;
  supplier_country: string;
  supplier_installation: string;
  supplier_reporting_period?: string;
  data_mode: "ACTUAL" | "SEMI_ACTUAL" | "DEFAULT";
  verification_status: "UNVERIFIED" | "SUPPLIER_CONFIRMED" | "VERIFIED";
  default_value_year: "2026" | "2027" | "2028_ONWARDS";
  purchased_mass_t: number;
  consumed_mass_t: number;
  consumed_for_non_cbam_mass_t: number;
  direct_see_tco2e_per_t: number;
  indirect_see_tco2e_per_t: number;
  // 간접 SEE의 실제 분해(선택): 공급사가 전력사용량·계수를 따로 주면 보존한다.
  // 있으면 EU E_PurchPrec에 그대로 기재하고, 없으면 indirect_see를 1×값으로 우겨넣는다(bridge).
  // indirect_see_tco2e_per_t는 여전히 권위값(= mwh × factor)이며 계산엔진은 이 단일값만 쓴다.
  indirect_electricity_mwh_per_t?: number;
  indirect_electricity_factor_tco2e_per_mwh?: number;
  source: string;
  default_value_justification: string;
  output_allocations?: PrecursorOutputAllocation[];
}

export interface AppSetting extends LocalEntity {
  key: string;
  value: unknown;
}

export const CBAM_LOCAL_APP_NAME = "CBAM Local";
export const CBAM_LOCAL_APP_VERSION = "0.1.0";
export const CBAM_LAST_BACKUP_AT_KEY = "cbam-local:last-backup-at";

export interface CbamBackupManifest {
  format: "cbam-local-backup";
  format_version: 1;
  app_name: typeof CBAM_LOCAL_APP_NAME;
  app_version: string;
  exported_at: string;
  stores: StoreName[];
  counts: Record<StoreName, number>;
}

export interface CbamBackupFile {
  manifest: CbamBackupManifest;
  data: {
    [K in StoreName]: StoreEntityMap[K][];
  };
}

export interface BackupStatus {
  helper: string;
  label: "백업 필요" | "백업 점검" | "백업 완료";
  tone: "success" | "warning";
}

type BackupData = CbamBackupFile["data"];

type StoreEntityMap = {
  installations: Installation;
  products: Product;
  periods: ReportingPeriod;
  processes: ProductionProcess;
  product_output_lines: ProductOutputLine;
  source_streams: SourceStream;
  precursors: PurchasedPrecursor;
  settings: AppSetting;
};

const DB_NAME = "cbam-local";
const DB_VERSION = 5;
const STORE_NAMES: StoreName[] = [
  "installations",
  "products",
  "periods",
  "processes",
  "product_output_lines",
  "source_streams",
  "precursors",
  "settings",
];

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

export async function getLocalSetting<T = unknown>(key: string): Promise<T | undefined> {
  const settings = await listLocalItems("settings");
  return settings.find((setting) => setting.key === key)?.value as T | undefined;
}

export async function setLocalSetting(key: string, value: unknown): Promise<AppSetting> {
  const settings = await listLocalItems("settings");
  const existing = settings.find((setting) => setting.key === key);

  if (existing) {
    return updateLocalItem("settings", {
      ...existing,
      value,
    });
  }

  return createLocalItem("settings", {
    key,
    value,
  });
}

export function createLocalBackup(data: BackupData, exportedAt = nowIso()): CbamBackupFile {
  return {
    manifest: {
      format: "cbam-local-backup",
      format_version: 1,
      app_name: CBAM_LOCAL_APP_NAME,
      app_version: CBAM_LOCAL_APP_VERSION,
      exported_at: exportedAt,
      stores: STORE_NAMES,
      counts: {
        installations: data.installations.length,
        products: data.products.length,
        periods: data.periods.length,
        processes: data.processes.length,
        product_output_lines: data.product_output_lines.length,
        source_streams: data.source_streams.length,
        precursors: data.precursors.length,
        settings: data.settings.length,
      },
    },
    data,
  };
}

export function getBackupCompatibilityMessage(manifest: CbamBackupManifest): string {
  if (manifest.app_name !== CBAM_LOCAL_APP_NAME) {
    return "이 백업은 CBAM Local이 아닌 앱에서 생성된 것으로 표시됩니다. 복원 전 파일 출처와 데이터 구조를 확인하세요.";
  }

  if (manifest.app_version === "unknown") {
    return "이 백업은 앱 버전 정보가 없는 이전 형식입니다. 복원은 가능하지만, 복원 후 산정 결과와 시나리오 가정값을 다시 확인하세요.";
  }

  if (manifest.app_version !== CBAM_LOCAL_APP_VERSION) {
    return `이 백업은 현재 앱 버전(${CBAM_LOCAL_APP_VERSION})과 다른 버전(${manifest.app_version})에서 생성되었습니다. 복원 전 현재 데이터를 별도 백업해 두세요.`;
  }

  return "";
}

export function getBackupStatus(value?: string, now = Date.now()): BackupStatus {
  if (!value) {
    return {
      helper: "아직 백업 파일을 만든 기록이 없습니다.",
      label: "백업 필요",
      tone: "warning",
    };
  }

  const backupTime = new Date(value).getTime();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  if (!Number.isFinite(backupTime) || now - backupTime > sevenDaysMs) {
    return {
      helper: "최근 백업이 오래되었습니다. 주요 입력 후 새 백업을 권장합니다.",
      label: "백업 점검",
      tone: "warning",
    };
  }

  return {
    helper: "최근 백업 기록이 있습니다.",
    label: "백업 완료",
    tone: "success",
  };
}

export async function exportLocalBackup(): Promise<CbamBackupFile> {
  return createLocalBackup({
    installations: await listLocalItems("installations"),
    products: await listLocalItems("products"),
    periods: await listLocalItems("periods"),
    processes: await listLocalItems("processes"),
    product_output_lines: await listLocalItems("product_output_lines"),
    source_streams: await listLocalItems("source_streams"),
    precursors: await listLocalItems("precursors"),
    settings: await listLocalItems("settings"),
  });
}

export function parseBackupFile(content: string): CbamBackupFile {
  const parsed = JSON.parse(content) as Partial<CbamBackupFile>;

  if (
    parsed.manifest?.format !== "cbam-local-backup" ||
    parsed.manifest.format_version !== 1 ||
    !parsed.data
  ) {
    throw new Error("유효하지 않거나 지원하지 않는 .cbam 백업 파일입니다.");
  }

  const data = parsed.data as Partial<CbamBackupFile["data"]>;
  for (const storeName of STORE_NAMES) {
    if (data[storeName] === undefined) {
      data[storeName] = [];
    }

    if (!Array.isArray(data[storeName])) {
      throw new Error(`백업 파일의 ${storeName} 데이터 저장소 형식이 올바르지 않습니다.`);
    }
  }

  return {
    manifest: {
      ...parsed.manifest,
      app_version: parsed.manifest.app_version ?? "unknown",
      stores: STORE_NAMES,
      counts: {
        installations: data.installations?.length ?? 0,
        products: data.products?.length ?? 0,
        periods: data.periods?.length ?? 0,
        processes: data.processes?.length ?? 0,
        product_output_lines: data.product_output_lines?.length ?? 0,
        source_streams: data.source_streams?.length ?? 0,
        precursors: data.precursors?.length ?? 0,
        settings: data.settings?.length ?? 0,
      },
    },
    data: data as CbamBackupFile["data"],
  };
}

export async function importLocalBackup(backup: CbamBackupFile): Promise<void> {
  const db = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAMES, "readwrite");

    for (const storeName of STORE_NAMES) {
      const store = transaction.objectStore(storeName);
      store.clear();
      for (const item of backup.data[storeName]) {
        store.put(item);
      }
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function clearLocalData(): Promise<void> {
  const db = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAMES, "readwrite");

    for (const storeName of STORE_NAMES) {
      transaction.objectStore(storeName).clear();
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function seedLocalData(): Promise<void> {
  const [installations, products, periods, processes, productOutputLines, sourceStreams, precursors] = await Promise.all([
    listLocalItems("installations"),
    listLocalItems("products"),
    listLocalItems("periods"),
    listLocalItems("processes"),
    listLocalItems("product_output_lines"),
    listLocalItems("source_streams"),
    listLocalItems("precursors"),
  ]);

  if (installations.length === 0) {
    const installation = await createLocalItem("installations", {
      name: "Main Factory A",
      local_name: "인천 제1공장",
      country: "KR",
      street: "1 Steel Road",
      economic_activity: "Steel processing",
      postcode: "21990",
      city: "Incheon",
      authorized_representative_name: "Local CBAM Manager",
      email: "cbam@example.com",
      telephone: "+82-32-000-0000",
    });
    let defaultProductId = products[0]?.id;

    if (products.length === 0) {
      const hotRolledCoil = await createLocalItem("products", {
        installation_id: installation.id,
        name: "Hot Rolled Coil",
        hs_code: "7208",
        cn_code: "72083900",
        hs_group: "72",
        product_type_enum: "HS72_PLATE_SHEET",
        unit: "tonne",
        reporting_scope: "CBAM_GOOD",
      });
      defaultProductId = hotRolledCoil.id;
      await createLocalItem("products", {
        installation_id: installation.id,
        name: "Steel Pipe",
        hs_code: "7306",
        cn_code: "73063080",
        hs_group: "73",
        product_type_enum: "HS73_PIPE_TUBE",
        unit: "tonne",
        reporting_scope: "CBAM_GOOD",
      });
    }

    let periodId: string | undefined = periods[0]?.id;

    if (periods.length === 0) {
      const period = await createLocalItem("periods", {
        installation_id: installation.id,
        name: "2024 Annual",
        start_date: "2024-01-01",
        end_date: "2024-12-31",
        status: "DRAFT",
      });
      periodId = period.id;
    }

    let processId: string | undefined = processes[0]?.id;

    if (processes.length === 0) {
      const process = await createLocalItem("processes", {
        period_id: periodId,
        product_id: defaultProductId,
        name: "Rolling and finishing",
        production_route: "Flat steel processing",
        output_mass_t: 1000,
        market_output_mass_t: 950,
        internal_consumption_mass_t: 50,
        direct_attributable_emissions_tco2e: 120,
        electricity_mwh: 500,
        electricity_ef_tco2e_per_mwh: 0.47,
      });
      processId = process.id;
    }

    if (productOutputLines.length === 0 && processId && defaultProductId) {
      await createLocalItem("product_output_lines", {
        process_id: processId,
        product_id: defaultProductId,
        name: "Hot Rolled Coil output",
        output_mass_t: 1000,
        allocation_basis: "MASS",
        manual_allocation_percent: 100,
        note: "",
      });
    }

    if (precursors.length === 0) {
      await createLocalItem("precursors", {
        period_id: periodId,
        process_id: processId,
        product_id: defaultProductId,
        name: "Purchased hot rolled coil",
        precursor_cn_code: "72083900",
        aggregated_goods_category: "Iron or steel products",
        production_route: "External precursor",
        supplier_country: "South Korea",
        supplier_installation: "Supplier steel mill",
        data_mode: "ACTUAL",
        verification_status: "SUPPLIER_CONFIRMED",
        default_value_year: "2026",
        purchased_mass_t: 1100,
        consumed_mass_t: 1000,
        consumed_for_non_cbam_mass_t: 0,
        direct_see_tco2e_per_t: 1.2,
        indirect_see_tco2e_per_t: 0.25,
        source: "Supplier communication template",
        default_value_justification: "",
      });
    }

    if (sourceStreams.length === 0) {
      await createLocalItem("source_streams", {
        period_id: periodId,
        process_id: processId,
        name: "Natural gas combustion",
        stream_type: "FUEL",
        method: "Combustion",
        activity_data: 36.5296803652968,
        activity_unit: "t",
        ncv_gj_per_unit: 45,
        emission_factor_tco2e_per_unit: 73,
        emission_factor_basis: "PER_TJ",
        oxidation_factor: 1,
        conversion_factor: 1,
        fossil_fraction: 1,
        biomass_fraction: 0,
        factor_source_type: "EU_OR_IPCC_DEFAULT",
        source: "Monthly fuel invoice",
      });
    }
  }

  const [currentInstallations, currentProducts, currentPeriods, currentProcesses, currentProductOutputLines, currentSourceStreams, currentPrecursors] = await Promise.all([
    listLocalItems("installations"),
    listLocalItems("products"),
    listLocalItems("periods"),
    listLocalItems("processes"),
    listLocalItems("product_output_lines"),
    listLocalItems("source_streams"),
    listLocalItems("precursors"),
  ]);
  const demoInstallation = currentInstallations.find((installation) => installation.name === "Main Factory A");

  if (demoInstallation && !demoInstallation.city) {
    await updateLocalItem("installations", {
      ...demoInstallation,
      local_name: demoInstallation.local_name ?? "인천 제1공장",
      street: demoInstallation.street ?? "1 Steel Road",
      economic_activity: demoInstallation.economic_activity ?? "Steel processing",
      postcode: demoInstallation.postcode ?? "21990",
      city: demoInstallation.city ?? "Incheon",
      authorized_representative_name:
        demoInstallation.authorized_representative_name ?? "Local CBAM Manager",
      email: demoInstallation.email ?? "cbam@example.com",
      telephone: demoInstallation.telephone ?? "+82-32-000-0000",
    });
  }
  const defaultProduct = currentProducts.find((product) => product.name === "Hot Rolled Coil") ?? currentProducts[0];
  const defaultPeriod = currentPeriods.find((period) => period.name === "2024 Annual") ?? currentPeriods[0];
  const demoProcess = currentProcesses.find((process) => process.name === "Rolling and finishing");

  if (defaultProduct && demoProcess && !demoProcess.product_id) {
    await updateLocalItem("processes", {
      ...demoProcess,
      product_id: defaultProduct.id,
    });
  }

  if (defaultProduct && demoProcess && currentProductOutputLines.length === 0) {
    await createLocalItem("product_output_lines", {
      process_id: demoProcess.id,
      product_id: defaultProduct.id,
      name: `${defaultProduct.name} output`,
      output_mass_t: demoProcess.output_mass_t,
      allocation_basis: "MASS",
      manual_allocation_percent: 100,
      note: "",
    });
  }

  const demoPrecursor = currentPrecursors.find((precursor) => precursor.name === "Purchased hot rolled coil");

  if (defaultProduct && demoPrecursor && (
    !demoPrecursor.product_id ||
    !demoPrecursor.process_id ||
    !demoPrecursor.precursor_cn_code ||
    !demoPrecursor.supplier_country ||
    !demoPrecursor.data_mode ||
    !demoPrecursor.verification_status ||
    !demoPrecursor.default_value_year
  )) {
    await updateLocalItem("precursors", {
      ...demoPrecursor,
      product_id: demoPrecursor.product_id ?? defaultProduct.id,
      process_id: demoPrecursor.process_id ?? demoProcess?.id,
      precursor_cn_code: demoPrecursor.precursor_cn_code ?? defaultProduct.cn_code ?? defaultProduct.hs_code,
      supplier_country: demoPrecursor.supplier_country ?? "South Korea",
      supplier_installation: demoPrecursor.supplier_installation ?? "",
      data_mode: demoPrecursor.data_mode ?? "ACTUAL",
      verification_status: demoPrecursor.verification_status ?? "SUPPLIER_CONFIRMED",
      default_value_year: demoPrecursor.default_value_year ?? "2026",
    });
  }

  const demoSourceStream = currentSourceStreams.find((sourceStream) => sourceStream.name === "Natural gas combustion");

  if (currentSourceStreams.length === 0 && demoProcess) {
    await createLocalItem("source_streams", {
      period_id: defaultPeriod?.id,
      process_id: demoProcess.id,
      name: "Natural gas combustion",
      stream_type: "FUEL",
      method: "Combustion",
      activity_data: 250,
      activity_unit: "t",
      ncv_gj_per_unit: 45,
      emission_factor_tco2e_per_unit: 73,
      emission_factor_basis: "PER_TJ",
      oxidation_factor: 1,
      conversion_factor: 1,
      fossil_fraction: 1,
      biomass_fraction: 0,
      factor_source_type: "EU_OR_IPCC_DEFAULT",
      source: "Monthly fuel invoice",
    });
  }

  if (demoSourceStream && !demoSourceStream.process_id) {
    await updateLocalItem("source_streams", {
      ...demoSourceStream,
      process_id: demoProcess?.id,
    });
  }

  if (demoSourceStream && demoSourceStream.method === "Standard method") {
    await updateLocalItem("source_streams", {
      ...demoSourceStream,
      method: "Combustion",
      activity_unit: demoSourceStream.activity_unit === "MWh" ? "t" : demoSourceStream.activity_unit,
      ncv_gj_per_unit: demoSourceStream.ncv_gj_per_unit === 3.6 ? 45 : demoSourceStream.ncv_gj_per_unit,
      emission_factor_tco2e_per_unit:
        demoSourceStream.emission_factor_tco2e_per_unit === 0.202 ? 73 : demoSourceStream.emission_factor_tco2e_per_unit,
    });
  }
}
