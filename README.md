# graphics — 그래픽스 수업 데모 (Teachable Machine + Vercel)

서울교육대학교 그래픽스 수업 실습용 리포지터리입니다.  
Teachable Machine(구글)의 모델을 GitHub 리포지터리에 올려 Vercel로 배포하여 실시간 데모/수업 자료로 사용합니다.

## 목표
- Teachable Machine로 만든 분류/포즈/오디오 모델을 웹에서 간단히 실행
- 모델 파일을 repo 또는 CDN에 호스팅하고 Vercel로 배포
- 수업 실습용으로 쉽게 재사용/공유 가능한 템플릿 제공

---

## 폴더 구조 (권장)
- public/
  - models/
    - my-model/ (Teachable Machine에서 내보낸 모델 파일들: `model.json`, `metadata.json`, `group1-shard1of1.bin` 등)
  - assets/ (이미지, CSS 등)
- src/
  - index.html (또는 React/Vue 진입 파일들)
  - main.js (모델 로드 및 UI 제어)
- README.md
- package.json

---

## Teachable Machine 모델 내보내기 (요약)
1. Teachable Machine에서 모델을 훈련합니다.
2. Export > TensorFlow.js 탭 선택
3. "Download my model" 클릭해서 모델 파일들을 다운로드
4. 압축을 풀고 `public/models/<your-model-name>/` 폴더로 업로드
   - 예: `public/models/my-model/model.json`, `public/models/my-model/metadata.json`, `...bin`

모델을 리포지터리에 직접 넣지 않고 외부 호스팅(예: Google Drive, S3, CDN)을 원하면 모델 URL을 환경 변수로 설정해 사용하세요.

---

## 클라이언트에서 모델 불러오기 (예: 이미지 분류, tmImage)
다음은 브라우저에서 Teachable Machine의 TensorFlow.js 모델을 로드하는 간단한 예시입니다.

```javascript
// 예: public/models/my-model/model.json 위치에 모델이 있을 때
const modelURL = 'models/my-model/model.json';
const metadataURL = 'models/my-model/metadata.json';

// tmImage 라이브러리 사용 (Teachable Machine 제공)
const model = await tmImage.load(modelURL, metadataURL);

// webcam 사용 예시
const webcam = new tmImage.Webcam(400, 400, true);
await webcam.setup();
await webcam.play();
document.getElementById('webcam-container').appendChild(webcam.canvas);

async function predict() {
  const prediction = await model.predict(webcam.canvas);
  // prediction은 레이블별 확률 배열
  console.log(prediction);
}
setInterval(predict, 200);
```

- 모델 종류에 따라 tmImage / tmPose / tmAudio 중 해당 라이브러리를 사용하세요.
- Teachable Machine의 공식 예제 코드를 참고하면 빠르게 적용 가능합니다.

---

## 로컬에서 테스트
1. 종속성 설치 (프레임워크 사용 시)
   - 예: npm install
2. 개발 서버 실행
   - npm run dev 또는 npx serve public (정적 사이트일 경우)
3. 브라우저에서 로컬 주소로 접속하여 모델 작동 확인

모델이 `public/models/...` 하위에 있으면 정적 파일로 잘 제공됩니다.

---

## Vercel에 배포하기
1. Vercel에 로그인하고 새 프로젝트 생성
2. GitHub 리포지터리(ohsy104/graphics) 연결
3. 빌드 설정
   - 프레임워크 없음(Static) 또는 사용한 프레임워크에 맞게 설정
   - 빌드 커맨드: (예:) `npm run build` (프레임워크가 있다면)
   - 출력 디렉터리: (예:) `dist` 또는 프로젝트에 따라 `public` 등
4. 환경 변수(선택)
   - 외부 모델 URL을 사용할 경우 `MODEL_BASE_URL` 같은 변수를 설정
5. 배포하면 공개 URL에서 모델 기반 데모를 확인

팁: 정적 HTML + JS로 구성하면 빌드 없이도 Vercel이 자동으로 정적 파일을 제공하여 간편합니다.

---

## 환경 변수 예시 (외부 모델 사용 시)
- MODEL_BASE_URL=https://cdn.example.com/models/my-model
클라이언트 코드에서는 base URL을 환경 변수로 읽어서 `modelURL = `${MODEL_BASE_URL}/model.json`` 처럼 사용합니다.

---

## 수업용 체크리스트
- [ ] 모델 학습 및 테스트 완료
- [ ] 모델 파일을 `public/models/<name>/`에 업로드
- [ ] index.html / main.js에서 모델 경로가 올바른지 확인
- [ ] 로컬에서 모델이 정상 작동하는지 확인
- [ ] GitHub에 푸시 후 Vercel에 연결하여 배포
- [ ] 배포된 URL로 수업에서 시연

---

## 기여 방법
수업용이므로 수정/개선은 자유롭게 가능합니다. 수정 후 Pull Request를 보내시면 검토하겠습니다.

---

## 연락 / 크레딖
- 만든 사람: 서울교대 그래픽스 수업 (ohsy104)
- 참고: Teachable Machine 공식 문서 — https://teachablemachine.withgoogle.com/

---

## 라이선스
원하시는 라이선스를 적어 주세요. (예: MIT)
