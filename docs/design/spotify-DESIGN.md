# Design System Inspired by Spotify

> 출처: getdesign.md 계열 분석(사용자 제공). CBAM_Platform `/scenarios` 다크 트라이얼(design/scenarios-spotify-trial)의 참조.
> 요약: near-black 다크(#121212~#1f1f1f) + Spotify Green(#1ed760) 단일 기능 액센트 + 무채색 UI + pill/circle 기하 + 무거운 그림자.

## 핵심
- 배경 near-black `#121212`, 표면 `#181818`/`#1f1f1f`, 카드 6~8px 라운드.
- **Spotify Green `#1ed760`은 기능적 액센트만**(재생/활성/CTA) — 장식·배경 금지.
- 텍스트 white `#ffffff` / silver `#b3b3b3`. 700(bold)·400(regular) 이분법, 600 드물게.
- 버튼: pill(500~9999px), 라벨 uppercase + wide letter-spacing(1.4~2px). 재생 컨트롤 circle(50%).
- 시맨틱: negative red `#f3727f`, warning orange `#ffa42b`, announcement blue `#539df5`.
- 그림자 무겁게: 카드 `rgba(0,0,0,0.3) 0 8px 8px`, 다이얼로그 `rgba(0,0,0,0.5) 0 8px 24px`.
- 폰트 CircularSp(SpotifyMixUI). 대체: 기하 산세리프(Montserrat/Poppins) 또는 Helvetica Neue 스택.

## CBAM_Platform 적용 매핑(트라이얼)
- 페이지 전체를 `#121212` 다크 컨테이너로 감쌈. 카드 `#181818`.
- 결론 히어로: `#181818` + 무거운 그림자. 타일 라벨 uppercase, 숫자 tabular.
- favorable(실측 유리/절감) = 그린 `#1ed760`. attention(기본값 유리) = orange `#ffa42b`. 오류 = red.
- 링크·아이콘 칩 = 그린. 폼/상세 표는 라이트 시트로 여는 서랍 패턴(다크 요약 + 라이트 상세).
- 폰트는 Montserrat(Circular 대체)를 이 페이지에만 로드.

(전체 원문은 대화 로그의 사용자 제공 DESIGN.md 참조. 팀 표준으로 승격 시 이 파일을 정본으로 확장.)
