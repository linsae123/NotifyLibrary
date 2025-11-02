# Lunar Library (Notify)
BetterDiscord 알림 라이브러리

BetterDiscord 플러그인에서 토스트(Toast), 모달(Modal), 확인(Confirm), 프롬프트(Prompt), 진행(Progress) 등을 간단하게 사용할 수 있도록 제공하는 범용 알림 UI 라이브러리입니다.

> ✅ 개발자 콘솔 또는 다른 플러그인 코드에서 바로 사용 가능  
> ✅ 다양한 UI/테마/위치 설정 지원  
> ✅ Promise 기반 Confirm / Prompt 지원

---

## 📦 설치 방법

1. `lunar.lib.plugin.js` 를 아래 경로에 넣어주세요  
```
%appdata%\BetterDiscord\plugins\lunar.lib.plugin.js
```


2. Discord → 설정 → BetterDiscord → 플러그인 → ✅ Lunar Library 활성화

3. 의존성  
- **ZeresPluginLibrary** (`0PluginLibrary.plugin.js`) 필요  
- 없다면 설치 안내가 자동 표시됩니다

---

## 🚀 빠른 시작
전역 객체: `window.Notify`

---

### ✅ 토스트 — Toast
```js
Notify.toast("설정이 저장되었습니다!", { type: "success" });

Notify.show({
title: "서버 연결 실패",
message: "인터넷 연결을 확인하세요.",
type: "error",
timeout: 0,
actions: [
 { label: "다시 시도", onClick: () => console.log("Retry") }
]
});
```

### 📊 진행 — Progress
```js
const progress = Notify.progress({
  title: "업데이트 다운로드",
  message: "다운로드 시작...",
  percent: 0
});

progress.update({ percent: 50, message: "절반 완료" });
progress.update({ percent: 100, message: "완료!", type: "success" });
```

### 🪟 모달 / 알림 — Modal & Alert
```js
Notify.alert("공지", "업데이트가 필요합니다.");

Notify.modal({
  title: "환영합니다!",
  body: "<h4>HTML 가능</h4>",
  buttons: [
    { label: "닫기", className: "primary", onClick: close => close() }
  ]
});
```

### ✅ Confirm / Prompt (Promise 기반)
```js
const confirmed = await Notify.confirm({
  title: "삭제 확인",
  body: "정말 삭제하시겠습니까?",
  confirmText: "삭제",
  cancelText: "취소",
  danger: true
});
console.log("결과:", confirmed);

const name = await Notify.prompt({
  title: "이름 입력",
  body: "이름을 입력하세요",
  placeholder: "홍길동"
});
console.log("입력값:", name);
```

### 🎨 테마 / 위치 / CSS
```js
Notify.setPosition("top-left");
// top-left | top-right | bottom-left | bottom-right

Notify.useTheme("nova");
// default, dark, light, discord, matrix, solarized, dracula, nova

Notify.injectCSS(`
  .bd-notify {
    border-radius: 0;
  }
`);
```

### 🧩 API 요약
기능	설명
Notify.show(options)	상세 토스트
Notify.toast(msg, options)	간단 토스트
Notify.progress(options)	진행 UI (update/destroy)
Notify.modal(options)	커스텀 모달
Notify.alert(title, body)	간단 알림
Notify.confirm(options)	확인 (Promise)
Notify.prompt(options)	입력 (Promise)
Notify.injectCSS(css)	CSS 삽입
Notify.appendCSS(css)	기존 CSS 유지 추가
Notify.useTheme(name)	테마 설정
Notify.setPosition(pos)	위치 설정
Notify.clearAll()	알림 전체 제거

### 🔌 플러그인 내 사용 예시
```js
onStart() {
  if (window.Notify) {
    window.Notify.toast("플러그인이 시작되었습니다!");
  } else {
    console.warn("Notify 라이브러리를 찾을 수 없습니다.");
  }
}
```

### 📄 라이선스

MIT License
