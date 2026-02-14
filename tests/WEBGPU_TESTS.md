# WebGPU Browser Tests

이 디렉토리에는 브라우저 환경에서 실행되는 WebGPU 테스트가 포함되어 있습니다.

## 왜 별도의 브라우저 테스트가 필요한가?

Node.js 환경에서는 WebGPU API가 지원되지 않기 때문에, GPU 관련 테스트는 브라우저에서 실행해야 합니다.

- ✅ **Node.js 테스트** (`npm test`): CPU 기반 IK, 수학 연산, 스켈레톤 로직
- ✅ **브라우저 테스트** (`npm run test:webgpu`): GPU 스키닝, 컴퓨트 셰이더

## 🚀 실행 방법

### 방법 1: NPM 스크립트 (권장)
```bash
npm run test:webgpu
```
- HTTP 서버 시작
- 브라우저에서 테스트 페이지 자동 열림
- 테스트 자동 실행

### 방법 2: Shell 스크립트
```bash
./run-webgpu-tests.sh
```

### 방법 3: 수동 실행
```bash
# 1. HTTP 서버 시작
python3 -m http.server 8888

# 2. 브라우저에서 열기
open http://localhost:8888/tests/webgpu-browser-test.html
```

## 📋 테스트 내용

### 현재 테스트 (3 tests)
1. **WebGPU 초기화**
   - GPU adapter 및 device 획득
   - WebGPU 지원 확인

2. **Identity Transform**
   - 항등 변환 행렬 적용
   - 버텍스 위치 보존 확인
   - GPU 스키닝 기본 동작 검증

3. **90° Rotation Transform**
   - Z축 기준 90도 회전
   - 예상 결과 검증:
     - (1,0,0) → (0,1,0)
     - (0,1,0) → (-1,0,0)
     - (0,0,1) → (0,0,1)

## 🌐 브라우저 요구사항

### 지원 브라우저
- ✅ Chrome 113+ (권장)
- ✅ Edge 113+
- ❌ Safari (WebGPU 지원 제한적)
- ❌ Firefox (WebGPU 개발 중)

### macOS 설정
Chrome 또는 Edge 최신 버전 사용:
```bash
# Chrome 버전 확인
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --version

# Edge 버전 확인
/Applications/Microsoft\ Edge.app/Contents/MacOS/Microsoft\ Edge --version
```

## 📊 테스트 결과 예시

성공 시:
```
✓ WebGPU Initialization
✓ Identity Transform
✓ 90° Rotation Transform

Tests: 3 passed, 0 failed
Pass Rate: 100%
```

## 🔍 디버깅

### WebGPU 지원 확인
브라우저 콘솔에서:
```javascript
console.log('WebGPU supported:', !!navigator.gpu);
```

### GPU 어댑터 정보
```javascript
const adapter = await navigator.gpu.requestAdapter();
const info = await adapter.requestAdapterInfo();
console.log('GPU:', info);
```

### Chrome Flags
Chrome에서 WebGPU 활성화 확인:
```
chrome://flags/#enable-unsafe-webgpu
```
기본적으로 Chrome 113+에서는 활성화되어 있음.

## 📝 테스트 추가하기

새로운 WebGPU 테스트 추가:

1. `webgpu-browser-test.html` 열기
2. 새 테스트 함수 작성:
```javascript
async function testMyFeature(device) {
  // 1. 버퍼 생성
  // 2. 셰이더 설정
  // 3. 컴퓨트 파이프라인 실행
  // 4. 결과 검증
  return { passed: true, details: '...' };
}
```
3. `runAllTests()`에 추가:
```javascript
const test3 = await testMyFeature(device);
logTest('My Feature', test3.passed, test3.details);
```

## 🎯 향후 계획

- [ ] Translation 테스트 추가
- [ ] Multi-joint 스키닝 테스트
- [ ] 실제 SMPL 메시 데이터로 통합 테스트
- [ ] 성능 벤치마크 추가
- [ ] 자동화된 CI/CD WebGPU 테스트 (Puppeteer)

## 🐛 문제 해결

### "WebGPU not supported" 오류
- Chrome/Edge 버전 확인 (113+ 필요)
- `chrome://gpu`에서 WebGPU 상태 확인
- GPU 드라이버 업데이트

### HTTP 서버 포트 충돌
다른 포트 사용:
```bash
python3 -m http.server 9999
# http://localhost:9999/tests/webgpu-browser-test.html
```

### 테스트가 자동 실행되지 않음
- 페이지 새로고침 (⌘+R)
- "Run All Tests" 버튼 클릭
- 브라우저 콘솔에서 에러 확인

## 📚 참고 자료

- [WebGPU Specification](https://www.w3.org/TR/webgpu/)
- [WebGPU Samples](https://webgpu.github.io/webgpu-samples/)
- [Chrome WebGPU Status](https://chromestatus.com/feature/6213121689518080)
- [Linear Blend Skinning](https://en.wikipedia.org/wiki/Skeletal_animation)
