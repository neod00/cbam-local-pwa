"use client";

import { useEffect } from "react";
import { ensureBundledReferences } from "@/lib/bundled-references";

/** 앱을 열 때 EU 공식 기준값(내장본)을 로컬 DB에 넣는다. 화면을 그리지 않고, 실패해도 앱은 평소대로 쓴다(올리기 경로가 남아 있다). */
export default function BundledReferenceLoader() {
  useEffect(() => {
    void ensureBundledReferences();
  }, []);

  return null;
}
