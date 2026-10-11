// EU Communication Template(xlsx)의 숨김시트를 읽는 작은 도구 — CN 마스터·CN 품명 생성기가 같이 쓴다.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { strFromU8, unzipSync } = require('fflate');

export function attr(tag, name) {
    return tag.match(new RegExp(`${name}="([^"]*)"`))?.[1];
}

export function loadWorkbook(path) {
    const zip = unzipSync(new Uint8Array(readFileSync(path)));
    const workbook = strFromU8(zip['xl/workbook.xml']);
    const rels = strFromU8(zip['xl/_rels/workbook.xml.rels']);

    const relTargets = new Map();
    for (const tag of rels.match(/<Relationship\b[^>]*\/?>/g) ?? []) {
        relTargets.set(attr(tag, 'Id'), attr(tag, 'Target').replace(/^\//, '').replace(/^xl\//, ''));
    }

    const sheets = new Map();
    for (const tag of workbook.match(/<sheet\b[^>]*\/?>/g) ?? []) {
        const rid = attr(tag, 'r:id');
        sheets.set(attr(tag, 'name'), `xl/${relTargets.get(rid)}`);
    }

    const shared = [];
    if (zip['xl/sharedStrings.xml']) {
        const xml = strFromU8(zip['xl/sharedStrings.xml']);
        for (const si of xml.match(/<si>[\s\S]*?<\/si>/g) ?? []) {
            shared.push((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? [])
                .map((t) => t.replace(/<[^>]+>/g, ''))
                .join('')
                .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
        }
    }

    return { zip, sheets, shared };
}

/** 시트를 셀 참조 → 값 맵으로. 수식 결과 캐시(<v>)를 읽는다. */
export function readSheet({ zip, sheets, shared }, name) {
    const path = sheets.get(name);

    if (!path || !zip[path]) {
        throw new Error(`시트를 찾지 못했습니다: ${name}`);
    }

    const xml = strFromU8(zip[path]);
    const cells = new Map();

    // [^>]*는 탐욕적이라 자기닫힘 셀의 '/'까지 먹고 다음 셀들을 통째로 삼킨다. 반드시 lazy.
    for (const cell of xml.match(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) ?? []) {
        const ref = attr(cell, 'r');
        const type = attr(cell, 't');

        if (!ref) {
            continue;
        }

        if (type === 'inlineStr') {
            cells.set(ref, (cell.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, '')).join(''));
            continue;
        }

        const raw = cell.match(/<v[^>]*>([\s\S]*?)<\/v>/)?.[1];

        if (raw === undefined) {
            continue;
        }

        const decoded = raw.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        cells.set(ref, type === 's' ? shared[Number(decoded)] : decoded);
    }

    return cells;
}

export function columnOf(cells, header, headerRow) {
    for (const [ref, value] of cells) {
        const match = ref.match(/^([A-Z]+)(\d+)$/);

        if (match && Number(match[2]) === headerRow && String(value).trim() === header) {
            return match[1];
        }
    }

    return undefined;
}
