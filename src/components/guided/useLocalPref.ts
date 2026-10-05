'use client';

import { useCallback, useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
// localStorage를 못 쓰는 환경(사생활 보호 창 등)에서도 이번 화면에서는 값이 바뀌게 메모리에 둔다.
const memory = new Map<string, string>();

function subscribe(callback: () => void) {
    listeners.add(callback);
    window.addEventListener('storage', callback);
    return () => {
        listeners.delete(callback);
        window.removeEventListener('storage', callback);
    };
}

function read(key: string): string | null {
    if (memory.has(key)) {
        return memory.get(key) ?? null;
    }
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

/**
 * 이 브라우저에만 남기는 화면 취향 하나(문자열). 서버 렌더에서는 serverValue를 쓰고, 브라우저에서 읽으면 바로 저장된 값으로 바뀐다.
 * 업무 데이터가 아니다 — IndexedDB·백업에 들어가지 않는다.
 */
export function useLocalPref(key: string, serverValue: string | null): [string | null, (value: string) => void] {
    const value = useSyncExternalStore(
        subscribe,
        () => read(key),
        () => serverValue
    );
    const set = useCallback((next: string) => {
        memory.set(key, next);
        try {
            window.localStorage.setItem(key, next);
        } catch {
            // 저장하지 못해도 메모리 값으로 이번 화면에서는 적용된다.
        }
        listeners.forEach((listener) => listener());
    }, [key]);
    return [value, set];
}
