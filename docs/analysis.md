# 포커 게임 크롬 익스텐션 프로젝트 - 기술 분석

## 프로젝트 개요

**목표**: play.pokerlulu.com 포커 게임에서 플레이어 닉네임을 인식하고, 해당 플레이어에 대한 메모를 저장/조회하는 크롬 익스텐션 개발

**핵심 과제**: Canvas WebGL 게임에서 화면에 그려진 플레이어 닉네임 텍스트를 추출

## 기술적 분석 결과

### 1. 게임 구조 확인

**타겟 URL**: `https://play.pokerlulu.com/?gameId=T_SEkd1cUHRIonnFazHIl9bHGskZujVx`

**게임 엔진**: Cocos Creator (WebGL 기반)

**전역 변수 분석**:
```javascript
게임 관련 변수들:
- CC_MINIGAME: false (Cocos Creator 미니게임)
- TelegramGameProxy: 텔레그램 미니앱으로 작동
```

**Canvas 정보**:
```javascript
{
  width: 828,
  height: 1792,
  id: 'GameCanvas',
  class: '',
  context: 'WebGL'  // ⚠️ WebGL 사용 - Canvas 2D API 사용 안함
}
```

### 2. 핵심 문제점

**Canvas 2D Hooking 불가능**:
- 게임이 WebGL을 사용하므로 `fillText()`, `strokeText()` API를 사용하지 않음
- WebGL은 GPU에서 직접 렌더링하며 텍스트도 텍스처(이미지)로 처리
- 일반적인 Canvas API Hooking 방법 사용 불가

## 닉네임 추출 방법들

### ⭐ 방법 1: Network Traffic 분석 (최우선 추천)

**난이도**: MEDIUM
**신뢰도**: 90%+

게임 서버와 주고받는 WebSocket/HTTP 데이터에서 플레이어 정보 추출

**장점**:
- 가장 정확한 데이터 소스
- Canvas 렌더링 방식과 무관
- 실시간 업데이트 가능

**다음 단계**:
```javascript
// Chrome DevTools > Console에서 실행
const originalWebSocket = window.WebSocket;
window.WebSocket = function(...args) {
  console.log('🔵 WebSocket 연결:', args[0]);
  const ws = new originalWebSocket(...args);

  ws.addEventListener('message', (event) => {
    console.log('📥 메시지:', event.data);
  });

  return ws;
};
```

페이지를 새로고침하고 게임을 플레이하면서 콘솔에서 WebSocket 메시지를 확인하세요.

### 🎯 방법 2: Cocos Creator 엔진 메모리 접근

**난이도**: HIGH
**신뢰도**: 100% (성공 시)

Cocos Creator의 내부 Scene Graph에서 Label 노드 찾기

**테스트 코드**:
```javascript
// Console에서 실행
console.log(window.cc);
console.log(window.cc?.director);
console.log(window.cc?.director?.getScene());

// Scene의 모든 Label 찾기
if (window.cc && window.cc.director) {
  const scene = window.cc.director.getScene();

  function findLabels(node) {
    const labels = [];
    const label = node.getComponent(window.cc.Label);
    if (label) {
      console.log('Found label:', label.string);
      labels.push(label.string);
    }
    node.children.forEach(child => {
      labels.push(...findLabels(child));
    });
    return labels;
  }

  const allLabels = findLabels(scene);
  console.log('All labels:', allLabels);
}
```

### 📸 방법 3: OCR (최후의 수단)

**난이도**: MEDIUM
**신뢰도**: 60-80%

Tesseract.js를 사용한 광학 문자 인식

**단점**:
- 정확도 낮음
- CPU 사용량 높음
- 실시간 처리 어려움

## 현재 구현 상태

이 익스텐션은 **3가지 방법을 모두 시도**하도록 구현되어 있습니다:

1. **WebSocket 감청** (`src/content/injected.ts` - `setupWebSocketInterception()`)
2. **Cocos Creator Hook** (`src/content/injected.ts` - `setupCocosCreatorHook()`)
3. **OCR** (TODO - 필요시 추가)

## 다음 단계

### 🔍 즉시 확인 필요

1. **WebSocket 트래픽 분석**
   - Chrome DevTools > Network > WS 탭
   - 게임 플레이 중 메시지 구조 확인
   - 플레이어 정보가 포함된 메시지 식별

2. **Cocos Creator 객체 확인**
   ```javascript
   // 콘솔에서 실행
   console.log(window.cc);
   if (window.cc) {
     console.log('Cocos Creator available!');
     console.log('Director:', window.cc.director);
     console.log('Scene:', window.cc.director.getScene());
   }
   ```

3. **메시지 구조 파악 후 코드 수정**
   - `src/content/injected.ts`의 `extractPlayers()` 함수 수정
   - 실제 게임 데이터 구조에 맞게 파싱 로직 작성

## 서버 API 설계

### 엔드포인트

```
POST   /api/players/:nickname/notes     # 메모 저장
GET    /api/players/:nickname/notes     # 메모 조회
PUT    /api/players/:nickname/notes/:id # 메모 수정
DELETE /api/players/:nickname/notes/:id # 메모 삭제
```

### 데이터베이스 스키마

```sql
CREATE TABLE player_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname VARCHAR(100) NOT NULL,
  game_id VARCHAR(255),
  user_id VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_nickname_user (nickname, user_id)
);
```

## 리스크 및 대응

| 리스크 | 영향도 | 대응 방안 |
|--------|--------|-----------|
| WebSocket 암호화 | HIGH | 프로토콜 분석, 복호화 로직 필요 |
| Cocos API 변경 | MEDIUM | 여러 버전 대응 코드 |
| 게임 업데이트 | MEDIUM | 유지보수, 에러 로깅 |
| 닉네임 추출 실패 | HIGH | Multi-fallback (WS → Memory → OCR) |

## 테스트 방법

### 로컬 테스트

1. 프로젝트 빌드:
   ```bash
   npm install
   npm run build
   ```

2. Chrome에서 로드:
   - `chrome://extensions/` 접속
   - "개발자 모드" 활성화
   - "압축해제된 확장 프로그램을 로드합니다" 클릭
   - `dist` 폴더 선택

3. 테스트 사이트 접속:
   - https://play.pokerlulu.com/?gameId=YOUR_GAME_ID

4. 개발자 도구 콘솔 확인:
   - `[Poker Notes]` 접두사가 붙은 로그 확인
   - 플레이어 감지 여부 확인

## 참고 자료

- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)
- [Cocos Creator API](https://docs.cocos.com/creator/manual/en/)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)

---

**마지막 업데이트**: 2026-05-01
**상태**: WebSocket/Cocos 분석 대기 중
