import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const appUrl = process.env.CBAM_STEEL_REHEARSAL_URL ?? 'http://127.0.0.1:3010';
const chromePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outputBase = process.env.CBAM_STEEL_REHEARSAL_OUTPUT ?? resolve('artifacts', 'steel-product-rehearsal');
const runId = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
const outputRoot = join(outputBase, runId);
const profileDir = join(outputRoot, 'chrome-profile');
const port = 9250 + Math.floor(Math.random() * 100);

const scenarioMode = process.argv.includes('--complex') ? 'complex' : 'simple';

const simpleAssumptions = {
    product: '열연강판',
    cnCode: '72083900',
    outputMassT: 10_000,
    electricityMwh: 6_000,
    electricityEf: 0.466,
    cityGasNm3: 500_000,
    cityGasNcvGjPerNm3: 0.037,
    cityGasEfTco2ePerTj: 56.1,
    slabConsumedMassT: 10_500,
    slabDirectSee: 1.35,
    slabIndirectSee: 0.25,
};

const complexAssumptions = {
    product: '열연강판',
    cnCode: '72083900',
    nonCbamProduct: '밀스케일',
    nonCbamCnCode: '26190090',
    outputMassT: 8_200,
    cbamOutputMassT: 8_000,
    nonCbamOutputMassT: 200,
    electricityMwh: 4_500,
    electricityEf: 0.466,
    cityGasNm3: 400_000,
    cityGasNcvGjPerNm3: 0.037,
    cityGasEfTco2ePerTj: 56.1,
    precursors: [
        { supplier: '가정 공급사 A', route: 'Electric arc furnace', consumedMassT: 5_000, directSee: 0.55, indirectSee: 0.35 },
        { supplier: '가정 공급사 B', route: 'Blast furnace-basic oxygen furnace', consumedMassT: 3_500, directSee: 1.85, indirectSee: 0.18 },
    ],
};

const assumptions = scenarioMode === 'complex' ? complexAssumptions : simpleAssumptions;
const precursorRows = scenarioMode === 'complex'
    ? complexAssumptions.precursors
    : [{ consumedMassT: simpleAssumptions.slabConsumedMassT, directSee: simpleAssumptions.slabDirectSee, indirectSee: simpleAssumptions.slabIndirectSee }];

const expected = {
    ownDirectEmissionsTco2e:
        assumptions.cityGasNm3 * assumptions.cityGasNcvGjPerNm3 * assumptions.cityGasEfTco2ePerTj / 1000,
    ownIndirectEmissionsTco2e: assumptions.electricityMwh * assumptions.electricityEf,
    precursorDirectEmissionsTco2e: precursorRows.reduce((sum, item) => sum + item.consumedMassT * item.directSee, 0),
    precursorIndirectEmissionsTco2e: precursorRows.reduce((sum, item) => sum + item.consumedMassT * item.indirectSee, 0),
};
expected.cbamBasisEmissionsTco2e = expected.ownDirectEmissionsTco2e + expected.precursorDirectEmissionsTco2e;
expected.cbamBasisSee = expected.cbamBasisEmissionsTco2e / assumptions.outputMassT;
expected.informationalEmissionsTco2e =
    expected.ownDirectEmissionsTco2e +
    expected.ownIndirectEmissionsTco2e +
    expected.precursorDirectEmissionsTco2e +
    expected.precursorIndirectEmissionsTco2e;
expected.informationalSee = expected.informationalEmissionsTco2e / assumptions.outputMassT;

if (scenarioMode === 'complex') {
    expected.cbamProductAllocationShare = complexAssumptions.cbamOutputMassT / complexAssumptions.outputMassT;
    expected.nonCbamAllocationShare = complexAssumptions.nonCbamOutputMassT / complexAssumptions.outputMassT;
    expected.cbamProductOwnDirectEmissionsTco2e = expected.ownDirectEmissionsTco2e * expected.cbamProductAllocationShare;
    expected.cbamProductOwnIndirectEmissionsTco2e = expected.ownIndirectEmissionsTco2e * expected.cbamProductAllocationShare;
    expected.cbamProductEmissionsTco2e = expected.cbamProductOwnDirectEmissionsTco2e + expected.precursorDirectEmissionsTco2e;
    expected.cbamProductInformationalEmissionsTco2e = expected.cbamProductEmissionsTco2e + expected.cbamProductOwnIndirectEmissionsTco2e + expected.precursorIndirectEmissionsTco2e;
    expected.nonCbamResultEmissionsTco2e = (expected.ownDirectEmissionsTco2e + expected.ownIndirectEmissionsTco2e) * expected.nonCbamAllocationShare;
    expected.displayedAggregateCbamEmissionsTco2e = expected.cbamProductEmissionsTco2e;
    expected.displayedAggregateCbamSee = expected.cbamProductEmissionsTco2e / complexAssumptions.cbamOutputMassT;
    expected.dashboardDirectEmissionsTco2e = expected.cbamProductEmissionsTco2e;
    expected.dashboardIndirectEmissionsTco2e = expected.cbamProductOwnIndirectEmissionsTco2e + expected.precursorIndirectEmissionsTco2e;
}

function sleep(ms) {
    return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function waitFor(condition, timeoutMs, label) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        const value = await condition();
        if (value) return value;
        await sleep(200);
    }
    throw new Error(`Timed out waiting for ${label}`);
}

class CdpClient {
    constructor(wsUrl) {
        this.ws = new WebSocket(wsUrl);
        this.nextId = 1;
        this.pending = new Map();
        this.opened = new Promise((resolvePromise, rejectPromise) => {
            this.ws.addEventListener('open', resolvePromise, { once: true });
            this.ws.addEventListener('error', rejectPromise, { once: true });
        });
        this.ws.addEventListener('message', (event) => {
            const message = JSON.parse(event.data);
            if (!message.id || !this.pending.has(message.id)) return;
            const pending = this.pending.get(message.id);
            this.pending.delete(message.id);
            if (message.error) pending.reject(new Error(message.error.message));
            else pending.resolve(message.result ?? {});
        });
    }

    async send(method, params = {}) {
        await this.opened;
        const id = this.nextId++;
        this.ws.send(JSON.stringify({ id, method, params }));
        return new Promise((resolvePromise, rejectPromise) => {
            this.pending.set(id, { resolve: resolvePromise, reject: rejectPromise });
        });
    }

    close() {
        this.ws.close();
    }
}

async function evaluate(cdp, expression) {
    const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'Runtime evaluation failed');
    return result.result?.value;
}

async function navigate(cdp, path) {
    await cdp.send('Page.navigate', { url: `${appUrl}${path}` });
    await waitFor(() => evaluate(cdp, `document.readyState === 'complete'`), 15000, path);
    await sleep(700);
}

async function screenshot(cdp, name, width = 1440, height = 1000) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await sleep(250);
    const layout = await evaluate(cdp, `({ documentWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth })`);
    assert.ok(layout.documentWidth <= layout.viewportWidth + 1, `${name}: horizontal page overflow`);
    const result = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const path = join(outputRoot, `${name}-${width}x${height}.png`);
    await writeFile(path, Buffer.from(result.data, 'base64'));
    return path;
}

async function clickRoute(cdp, path) {
    const clicked = await evaluate(cdp, `(() => {
        const link = Array.from(document.querySelectorAll('a')).find((item) => item.getAttribute('href') === ${JSON.stringify(path)});
        if (!link) return false;
        link.click();
        return true;
    })()`);
    assert.equal(clicked, true, `navigation link not found: ${path}`);
    await waitFor(
        () => evaluate(cdp, `location.pathname === ${JSON.stringify(path)} && document.readyState === 'complete'`),
        10000,
        path
    );
    await sleep(700);
}

async function seedComplexScenario(cdp) {
    const now = new Date().toISOString();
    const stores = ['installations', 'products', 'periods', 'processes', 'product_output_lines', 'source_streams', 'precursors', 'settings'];
    const records = {
        installations: [{
            id: 'installation_complex_steel', created_at: now, updated_at: now,
            name: '가정 복합 열연 사업장', local_name: '가정 복합 열연 사업장',
            country: 'KR', city: 'Pohang', authorized_representative_name: '환경팀 복합 테스트 담당자',
        }],
        periods: [{
            id: 'period_complex_steel', created_at: now, updated_at: now,
            installation_id: 'installation_complex_steel', name: '2026 복합 공정 테스트',
            start_date: '2026-01-01', end_date: '2026-12-31', status: 'READY',
        }],
        products: [
            {
                id: 'product_complex_hrc', created_at: now, updated_at: now,
                installation_id: 'installation_complex_steel', name: complexAssumptions.product,
                hs_code: '7208', cn_code: complexAssumptions.cnCode, hs_group: '72',
                product_type_enum: 'HS72_IRON_STEEL', unit: 'tonne', reporting_scope: 'CBAM_GOOD',
            },
            {
                id: 'product_complex_mill_scale', created_at: now, updated_at: now,
                installation_id: 'installation_complex_steel', name: complexAssumptions.nonCbamProduct,
                hs_code: '2619', cn_code: complexAssumptions.nonCbamCnCode, hs_group: '26',
                product_type_enum: 'UNKNOWN_PRODUCT', unit: 'tonne', reporting_scope: 'NON_CBAM_COPRODUCT',
            },
        ],
        processes: [{
            id: 'process_complex_steel', created_at: now, updated_at: now,
            period_id: 'period_complex_steel', product_id: 'product_complex_hrc',
            name: '공용 열연 압연 공정', production_route: 'Hot rolling with mixed slab routes',
            output_mass_t: complexAssumptions.outputMassT,
            market_output_mass_t: complexAssumptions.cbamOutputMassT,
            internal_consumption_mass_t: complexAssumptions.nonCbamOutputMassT,
            direct_attributable_emissions_tco2e: expected.ownDirectEmissionsTco2e,
            electricity_mwh: complexAssumptions.electricityMwh,
            electricity_ef_tco2e_per_mwh: complexAssumptions.electricityEf,
            electricity_ef_source: '2026 공용 압연라인 전력 집계 · 테스트 가정',
        }],
        product_output_lines: [
            {
                id: 'output_complex_hrc', created_at: now, updated_at: now,
                process_id: 'process_complex_steel', product_id: 'product_complex_hrc',
                name: complexAssumptions.product, output_mass_t: complexAssumptions.cbamOutputMassT,
                allocation_basis: 'MASS', manual_allocation_percent: 0, note: 'CBAM 대상 주제품', reporting_scope: 'CBAM_GOOD',
            },
            {
                id: 'output_complex_mill_scale', created_at: now, updated_at: now,
                process_id: 'process_complex_steel', product_id: 'product_complex_mill_scale',
                name: complexAssumptions.nonCbamProduct, output_mass_t: complexAssumptions.nonCbamOutputMassT,
                allocation_basis: 'MASS', manual_allocation_percent: 0, note: '비CBAM 부산물', reporting_scope: 'NON_CBAM_COPRODUCT',
            },
        ],
        source_streams: [{
            id: 'source_complex_gas', created_at: now, updated_at: now,
            period_id: 'period_complex_steel', process_id: 'process_complex_steel',
            name: '공용 가열로 도시가스', stream_type: 'FUEL', method: 'Combustion',
            activity_data: complexAssumptions.cityGasNm3, activity_unit: 'Nm3',
            ncv_gj_per_unit: complexAssumptions.cityGasNcvGjPerNm3,
            emission_factor_tco2e_per_unit: complexAssumptions.cityGasEfTco2ePerTj,
            emission_factor_basis: 'PER_TJ', oxidation_factor: 1, conversion_factor: 1,
            fossil_fraction: 1, biomass_fraction: 0, factor_source_type: 'NATIONAL_INVENTORY',
            source: '2026 가열로 도시가스 고지서 · 테스트 가정',
        }],
        precursors: complexAssumptions.precursors.map((item, index) => ({
            id: 'precursor_complex_' + (index + 1), created_at: now, updated_at: now,
            period_id: 'period_complex_steel', process_id: 'process_complex_steel',
            product_id: 'product_complex_hrc', name: '구매 철강 슬래브 - 공급사 ' + (index === 0 ? 'A' : 'B'),
            precursor_cn_code: index === 0 ? '72071210' : '72071290',
            aggregated_goods_category: 'Crude steel', production_route: item.route,
            supplier_country: index === 0 ? 'South Korea' : 'Japan', supplier_installation: item.supplier,
            data_mode: 'ACTUAL', verification_status: 'VERIFIED', default_value_year: '2026',
            purchased_mass_t: item.consumedMassT, consumed_mass_t: item.consumedMassT,
            consumed_for_non_cbam_mass_t: 0,
            direct_see_tco2e_per_t: item.directSee, indirect_see_tco2e_per_t: item.indirectSee,
            source: '가정 공급업체 Communication 회신 ' + (index + 1), default_value_justification: '', output_allocations: [{ product_output_line_id: 'output_complex_hrc', product_id: 'product_complex_hrc', allocated_mass_t: item.consumedMassT, allocation_percent: 100 }],
        })),
        settings: [{
            id: 'setting_complex_steel', created_at: now, updated_at: now,
            key: 'beginner:precursors-applicable', value: true,
        }],
    };

    return evaluate(cdp, `(async () => {
        localStorage.setItem('cbam-local-ui-mode', 'modern');
        const stores = ${JSON.stringify(stores)};
        const records = ${JSON.stringify(records)};
        const database = await new Promise((resolve, reject) => {
            const request = indexedDB.open('cbam-local', 5);
            request.onupgradeneeded = () => {
                stores.forEach((storeName) => {
                    if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName, { keyPath: 'id' });
                });
            };
            request.onerror = () => reject(request.error?.message ?? 'database open failed');
            request.onsuccess = () => resolve(request.result);
        });
        for (const storeName of stores) {
            await new Promise((resolve, reject) => {
                const transaction = database.transaction(storeName, 'readwrite');
                records[storeName].forEach((record) => transaction.objectStore(storeName).put(record));
                transaction.oncomplete = () => resolve(true);
                transaction.onerror = () => reject(transaction.error?.message ?? ('seed failed: ' + storeName));
            });
        }
        database.close();
        return Object.fromEntries(stores.map((storeName) => [storeName, records[storeName].length]));
    })()`);
}
async function seedScenario(cdp) {
    if (scenarioMode === 'complex') {
        return seedComplexScenario(cdp);
    }

    const now = new Date().toISOString();
    const stores = ['installations', 'products', 'periods', 'processes', 'product_output_lines', 'source_streams', 'precursors', 'settings'];
    const records = {
        installations: [{
            id: 'installation_steel_rehearsal', created_at: now, updated_at: now,
            name: '가정 동해 전기로·압연 사업장', local_name: '가정 동해 전기로·압연 사업장',
            country: 'KR', city: 'Pohang', authorized_representative_name: '환경팀 테스트 담당자',
        }],
        periods: [{
            id: 'period_steel_rehearsal', created_at: now, updated_at: now,
            installation_id: 'installation_steel_rehearsal', name: '2026 확정기간',
            start_date: '2026-01-01', end_date: '2026-12-31', status: 'READY',
        }],
        products: [{
            id: 'product_steel_rehearsal', created_at: now, updated_at: now,
            installation_id: 'installation_steel_rehearsal', name: assumptions.product,
            hs_code: '7208', cn_code: assumptions.cnCode, hs_group: '72',
            product_type_enum: 'HS72_IRON_STEEL', unit: 'tonne', reporting_scope: 'CBAM_GOOD',
        }],
        processes: [{
            id: 'process_steel_rehearsal', created_at: now, updated_at: now,
            period_id: 'period_steel_rehearsal', product_id: 'product_steel_rehearsal',
            name: '전기로 및 열연 압연 공정', production_route: 'Electric arc furnace',
            output_mass_t: assumptions.outputMassT, market_output_mass_t: assumptions.outputMassT,
            internal_consumption_mass_t: 0,
            direct_attributable_emissions_tco2e: expected.ownDirectEmissionsTco2e,
            electricity_mwh: assumptions.electricityMwh,
            electricity_ef_tco2e_per_mwh: assumptions.electricityEf,
            electricity_ef_source: '2026 전력 고지서 합계 · 테스트 가정 계수',
        }],
        product_output_lines: [{
            id: 'output_steel_rehearsal', created_at: now, updated_at: now,
            process_id: 'process_steel_rehearsal', product_id: 'product_steel_rehearsal',
            name: assumptions.product, output_mass_t: assumptions.outputMassT,
            allocation_basis: 'MASS', manual_allocation_percent: 0, note: '단일 품목 전량 배분', reporting_scope: 'CBAM_GOOD',
        }],
        source_streams: [{
            id: 'source_steel_rehearsal', created_at: now, updated_at: now,
            period_id: 'period_steel_rehearsal', process_id: 'process_steel_rehearsal',
            name: '도시가스 연소', stream_type: 'FUEL', method: 'Combustion',
            activity_data: assumptions.cityGasNm3, activity_unit: 'Nm3',
            ncv_gj_per_unit: assumptions.cityGasNcvGjPerNm3,
            emission_factor_tco2e_per_unit: assumptions.cityGasEfTco2ePerTj,
            emission_factor_basis: 'PER_TJ', oxidation_factor: 1, conversion_factor: 1,
            fossil_fraction: 1, biomass_fraction: 0, factor_source_type: 'NATIONAL_INVENTORY',
            source: '2026 도시가스 고지서 합계 · 테스트 가정 계수',
        }],
        precursors: [{
            id: 'precursor_steel_rehearsal', created_at: now, updated_at: now,
            period_id: 'period_steel_rehearsal', process_id: 'process_steel_rehearsal',
            product_id: 'product_steel_rehearsal', name: '구매 철강 슬래브', precursor_cn_code: '72071210',
            aggregated_goods_category: 'Crude steel', production_route: 'Electric arc furnace',
            supplier_country: 'South Korea', supplier_installation: '가정 슬래브 공급사',
            data_mode: 'ACTUAL', verification_status: 'VERIFIED', default_value_year: '2026',
            purchased_mass_t: assumptions.slabConsumedMassT, consumed_mass_t: assumptions.slabConsumedMassT,
            consumed_for_non_cbam_mass_t: 0,
            direct_see_tco2e_per_t: assumptions.slabDirectSee,
            indirect_see_tco2e_per_t: assumptions.slabIndirectSee,
            source: '가정 공급업체 Communication 회신', default_value_justification: '', output_allocations: [{ product_output_line_id: 'output_steel_rehearsal', product_id: 'product_steel_rehearsal', allocated_mass_t: assumptions.slabConsumedMassT, allocation_percent: 100 }],
        }],
        settings: [{
            id: 'setting_steel_rehearsal', created_at: now, updated_at: now,
            key: 'beginner:precursors-applicable', value: true,
        }],
    };

    return evaluate(cdp, `(async () => {
        localStorage.setItem('cbam-local-ui-mode', 'modern');
        const stores = ${JSON.stringify(stores)};
        const records = ${JSON.stringify(records)};
        const database = await new Promise((resolve, reject) => {
            const request = indexedDB.open('cbam-local', 5);
            request.onupgradeneeded = () => {
                stores.forEach((storeName) => {
                    if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName, { keyPath: 'id' });
                });
            };
            request.onerror = () => reject(request.error?.message ?? 'database open failed');
            request.onsuccess = () => resolve(request.result);
        });

        for (const storeName of stores) {
            await new Promise((resolve, reject) => {
                const transaction = database.transaction(storeName, 'readwrite');
                records[storeName].forEach((record) => transaction.objectStore(storeName).put(record));
                transaction.oncomplete = () => resolve(true);
                transaction.onerror = () => reject(transaction.error?.message ?? ('seed failed: ' + storeName));
                transaction.onabort = () => reject(transaction.error?.message ?? ('seed aborted: ' + storeName));
            });
        }

        database.close();
        return Object.fromEntries(stores.map((storeName) => [storeName, records[storeName].length]));
    })()`);
}

function extractCount(text, label) {
    const index = text.indexOf(label);
    if (index < 0) return undefined;
    const match = text.slice(index, index + 80).match(/(\d+)건/);
    return match ? Number(match[1]) : undefined;
}

async function run() {
    assert.ok(existsSync(chromePath), `Chrome not found: ${chromePath}`);
    await mkdir(profileDir, { recursive: true });

    const chrome = spawn(chromePath, [
        '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`,
        '--no-first-run', '--disable-background-networking', '--disable-extensions',
        '--window-size=1440,1000', 'about:blank',
    ], { stdio: 'ignore' });

    let cdp;
    const consoleErrors = [];
    try {
        const target = await waitFor(async () => {
            try {
                const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1000) });
                const targets = await response.json();
                return targets.find((item) => item.type === 'page' && item.webSocketDebuggerUrl);
            } catch {
                return undefined;
            }
        }, 15000, 'Chrome target');

        cdp = new CdpClient(target.webSocketDebuggerUrl);
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        cdp.ws.addEventListener('message', (event) => {
            const message = JSON.parse(event.data);
            if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
                consoleErrors.push(message.params.args?.map((arg) => arg.value ?? arg.description).join(' '));
            }
            if (message.method === 'Runtime.exceptionThrown') consoleErrors.push(message.params.exceptionDetails?.text ?? 'Runtime exception');
        });

        await navigate(cdp, '/workspace');
        console.log('Opening local workspace...');
        const seededCounts = await seedScenario(cdp);
        console.log('Seeding assumed steel-product records...');

        const storedPrecursorRoutes = await evaluate(cdp, `new Promise((resolve, reject) => {
            const request = indexedDB.open('cbam-local', 5);
            request.onerror = () => reject(request.error?.message ?? 'database open failed');
            request.onsuccess = () => {
                const readRequest = request.result.transaction('precursors', 'readonly').objectStore('precursors').getAll();
                readRequest.onsuccess = () => resolve(readRequest.result.map((item) => item.production_route));
                readRequest.onerror = () => reject(readRequest.error?.message ?? 'precursor read failed');
            };
        })`);

        let precursorRouteValuesVisible;
        let precursorScreenshot;
        let advancedResultsScreenshot;
        let advancedResultsContainBothProducts;
        let advancedResultsMarksNonCbamNotApplicable;

        if (scenarioMode === 'complex') {
            assert.equal(new Set(storedPrecursorRoutes).size, 2, 'two distinct precursor production routes should be stored');
            await navigate(cdp, '/precursors?advanced=1');
            await waitFor(() => evaluate(cdp, `document.body.innerText.includes('구매 철강 슬래브 - 공급사 A') && document.body.innerText.includes('구매 철강 슬래브 - 공급사 B')`), 10000, 'two precursor rows');
            const precursorText = await evaluate(cdp, 'document.body.innerText');
            precursorRouteValuesVisible = complexAssumptions.precursors.every((item) => precursorText.includes(item.route));
            precursorScreenshot = await screenshot(cdp, 'precursors-advanced');

            await navigate(cdp, '/results?advanced=1');
            await waitFor(() => evaluate(cdp, `document.body.innerText.includes(${JSON.stringify(complexAssumptions.product)}) && document.body.innerText.includes(${JSON.stringify(complexAssumptions.nonCbamProduct)})`), 10000, 'two product result rows');
            const advancedResultsText = await evaluate(cdp, 'document.body.innerText');
            advancedResultsContainBothProducts =
                advancedResultsText.includes(complexAssumptions.product) &&
                advancedResultsText.includes(complexAssumptions.nonCbamProduct);
            assert.equal(advancedResultsContainBothProducts, true);
            advancedResultsMarksNonCbamNotApplicable = advancedResultsText.includes('비CBAM 공동산출물') && advancedResultsText.includes('해당 없음');
            assert.equal(advancedResultsMarksNonCbamNotApplicable, true);
            assert.equal(precursorRouteValuesVisible, true);
            advancedResultsScreenshot = await screenshot(cdp, 'results-advanced');
            await clickRoute(cdp, '/results');
        } else {
            await navigate(cdp, '/results');
        }

        console.log('Checking calculation results...');
        await waitFor(() => evaluate(cdp, `document.body.innerText.includes('총 CBAM 배출량')`), 10000, 'steel calculation result');
        const resultsText = await evaluate(cdp, 'document.body.innerText');
        const expectedEmissionsValue = scenarioMode === 'complex'
            ? expected.displayedAggregateCbamEmissionsTco2e
            : expected.cbamBasisEmissionsTco2e;
        const expectedSeeValue = scenarioMode === 'complex'
            ? expected.displayedAggregateCbamSee
            : expected.cbamBasisSee;
        const expectedEmissionsText = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 }).format(expectedEmissionsValue);
        const expectedSeeText = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 4 }).format(expectedSeeValue);
        assert.ok(resultsText.includes(expectedEmissionsText), `CBAM emissions should show ${expectedEmissionsText} tCO2e`);
        assert.ok(resultsText.includes(expectedSeeText), `CBAM SEE should show ${expectedSeeText} tCO2e/t`);
        assert.ok(resultsText.includes('간접배출 중 일부는 해당 CN 품목 규칙에 따라 CBAM 기준값에서 제외'), 'indirect exclusion explanation should be visible');
        if (scenarioMode === 'complex') assert.equal(resultsText.includes(complexAssumptions.nonCbamProduct), false, 'simplified results should keep non-CBAM coproduct details collapsed');
        const resultsScreenshot = await screenshot(cdp, 'results');
        const resultsTabletScreenshot = await screenshot(cdp, 'results', 1024, 900);

        await clickRoute(cdp, '/');
        console.log('Checking dashboard...');
        await waitFor(() => evaluate(cdp, `document.body.innerText.includes(${JSON.stringify(assumptions.product)})`), 10000, 'dashboard product context');
        const dashboardText = await evaluate(cdp, 'document.body.innerText');
        assert.ok(dashboardText.includes(assumptions.product));
        const dashboardDirectValue = scenarioMode === 'complex' ? expected.dashboardDirectEmissionsTco2e : expected.cbamBasisEmissionsTco2e;
        const dashboardIndirectValue = scenarioMode === 'complex' ? expected.dashboardIndirectEmissionsTco2e : expected.ownIndirectEmissionsTco2e + expected.precursorIndirectEmissionsTco2e;
        const expectedDashboardDirectText = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(dashboardDirectValue);
        const expectedDashboardIndirectText = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(dashboardIndirectValue);
        const expectedDashboardSeeText = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 }).format(expectedSeeValue);
        assert.ok(dashboardText.includes(expectedDashboardDirectText));
        assert.ok(dashboardText.includes(expectedDashboardIndirectText));
        assert.ok(dashboardText.includes(expectedDashboardSeeText));
        const dashboardScreenshot = await screenshot(cdp, 'dashboard');

        await clickRoute(cdp, '/export');
        console.log('Checking EU report readiness...');
        const exportText = await evaluate(cdp, 'document.body.innerText');
        const blockingErrors = extractCount(exportText, '차단 오류');
        assert.equal(blockingErrors, 0, `expected no blocking export errors, found ${blockingErrors}`);
        const exportScreenshot = await screenshot(cdp, 'export');

        assert.equal(consoleErrors.length, 0, consoleErrors.join('\n'));
        const report = {
            appUrl,
            scenario: scenarioMode === 'complex'
                ? '2026 다중 산출물·다중 전구물질 경로 열연강판 시나리오'
                : '2026 열연강판 CN 72083900 가정 시나리오',
            scenarioMode,
            assumptions,
            expected,
            observed: {
                cbamBasisEmissionsVisible: resultsText.includes(expectedEmissionsText),
                cbamBasisSeeVisible: resultsText.includes(expectedSeeText),
                indirectExclusionExplained: resultsText.includes('간접배출 중 일부는 해당 CN 품목 규칙에 따라 CBAM 기준값에서 제외'),
                storedPrecursorRoutes,
                precursorRouteValuesVisible,
                advancedResultsContainBothProducts,
                simplifiedResultsNamesNonCbamOutput: scenarioMode === 'complex' ? resultsText.includes(complexAssumptions.nonCbamProduct) : undefined,
                dashboardDirectEmissionsVisible: dashboardText.includes(expectedDashboardDirectText),
                dashboardIndirectEmissionsVisible: dashboardText.includes(expectedDashboardIndirectText),
                advancedResultsMarksNonCbamNotApplicable,
                dashboardCbamSeeVisible: dashboardText.includes(expectedDashboardSeeText),
                dashboardDirectEmissionsText: expectedDashboardDirectText,
                dashboardIndirectEmissionsText: expectedDashboardIndirectText,
                exportBlockingErrors: blockingErrors,
            },
            seededCounts,
            screenshots: {
                dashboardScreenshot,
                resultsScreenshot,
                resultsTabletScreenshot,
                exportScreenshot,
                precursorScreenshot,
                advancedResultsScreenshot,
            },
            consoleErrors,
            limitations: ['공식 EU Communication Excel 템플릿 파일이 없어 실제 공식 파일 복사본 생성은 이번 시나리오에서 제외'],
            checkedAt: new Date().toISOString(),
        };
        await writeFile(join(outputRoot, 'report.json'), JSON.stringify(report, null, 2));
        console.log(JSON.stringify(report, null, 2));
    } finally {
        cdp?.close();
        chrome.kill();
    }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
