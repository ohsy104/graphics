// public/main.js
// AI 기후탐험대 평가 화면 - 업로드/웹캠, 혼동행렬, 오분류 갤러리, 클래스별 막대, 오류 리스트

// 기본 모델 경로 (public/ 기준)
let MODEL_BASE = "models/my-model/"; // 필요시 변경
const CLASS_NAMES = ["열대기후", "한대기후", "온대기후"];

let model = null;
let maxPredictions = 0;
let webcam = null;
let currentImageElement = null; // <img> or <canvas> for prediction

// 통계 (브라우저 세션 내 메모리)
const confusion = Array.from({length:3}, () => [0,0,0]); // trueIndex x predIndex
const classTotals = [0,0,0];
const classCorrect = [0,0,0];
const misclassified = []; // {dataUrl, trueIndex, predIndex}

// DOM
const preview = document.getElementById("preview");
const fileInput = document.getElementById("file-input");
const startWebcamBtn = document.getElementById("start-webcam");
const captureBtn = document.getElementById("capture");
const predictBtn = document.getElementById("predict-btn");
const truthSelect = document.getElementById("truth-select");
const modelSelect = document.getElementById("model-select");
const startModelBtn = document.getElementById("start-model");
const modelPathDisplay = document.getElementById("model-path-display");
const confusionTable = document.getElementById("confusion-table");
const barsContainer = document.getElementById("bars-container");
const gallery = document.getElementById("gallery");
const errorList = document.getElementById("error-list");

// 초기 렌더
renderConfusion();
renderBars();
renderGallery();
renderErrors();

// 유틸: 이미지 엘리먼트 생성 및 미리보기
function showPreviewFromFile(file){
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    preview.innerHTML = "";
    img.style.maxWidth = "100%";
    img.style.maxHeight = "100%";
    preview.appendChild(img);
    currentImageElement = img;
    predictBtn.disabled = false;
    // revokeObjectURL는 이미지 로드 후 해도 됨
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

// 파일 업로드 이벤트
fileInput.addEventListener("change", (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  // stop webcam if running
  stopWebcamIfRunning();
  showPreviewFromFile(f);
});

// 모델 불러오기
startModelBtn.addEventListener("click", async () => {
  let selected = modelSelect.value;
  if (selected === "") {
    const custom = prompt("모델이 위치한 기본 URL 또는 경로를 입력하세요.\n예: https://cdn.example.com/models/my-model/ 또는 models/my-model/");
    if (!custom) return;
    selected = custom;
  }
  MODEL_BASE = selected;
  modelPathDisplay.textContent = MODEL_BASE;
  await loadModel(MODEL_BASE);
});

// 모델 로드 함수
async function loadModel(baseUrl){
  const modelURL = baseUrl + (baseUrl.endsWith("/") ? "" : "/") + "model.json";
  const metadataURL = baseUrl + (baseUrl.endsWith("/") ? "" : "/") + "metadata.json";
  try {
    model = await tmImage.load(modelURL, metadataURL);
    maxPredictions = model.getTotalClasses();
    alert("모델 로드 완료: " + modelURL);
    predictBtn.disabled = false;
  } catch (err) {
    console.error(err);
    alert("모델을 불러오는 중 오류가 발생했습니다. 경로를 확인하세요: " + modelURL);
  }
}

// 웹캠 제어
startWebcamBtn.addEventListener("click", async () => {
  if (webcam) {
    // 이미 시작되어 있으면 중지
    stopWebcamIfRunning();
    startWebcamBtn.textContent = "웹캠 시작";
    captureBtn.disabled = true;
    return;
  }
  try {
    webcam = new tmImage.Webcam(320, 240, true);
    await webcam.setup();
    await webcam.play();
    preview.innerHTML = "";
    preview.appendChild(webcam.canvas);
    currentImageElement = webcam.canvas;
    startWebcamBtn.textContent = "웹캠 중지";
    captureBtn.disabled = false;
    predictBtn.disabled = false;
  } catch (err) {
    console.error(err);
    alert("웹캠을 사용할 수 없습니다. 권한을 확인하세요.");
  }
});

captureBtn.addEventListener("click", async () => {
  if (!webcam) return;
  // webcam.canvas 이미 사용 가능; 만들어둔 캔버스를 이미지로 내려받아 미리보기로 교체해서 보존 가능
  const dataUrl = webcam.canvas.toDataURL("image/png");
  const img = new Image();
  img.onload = () => {
    preview.innerHTML = "";
    preview.appendChild(img);
    currentImageElement = img;
    // stop webcam after capture (선택적) - 여기서는 웹캠을 유지하지 않음
    stopWebcamIfRunning();
    startWebcamBtn.textContent = "웹캠 시작";
    captureBtn.disabled = true;
  };
  img.src = dataUrl;
});

// 웹캠 중지 유틸
function stopWebcamIfRunning(){
  if (webcam) {
    try { webcam.stop(); } catch(e){/*ignore*/}
    webcam = null;
  }
}

// 예측 및 기록
predictBtn.addEventListener("click", async () => {
  if (!model) {
    alert("먼저 모델을 불러와 주세요 (모델 불러오기).");
    return;
  }
  if (!currentImageElement) {
    alert("이미지를 업로드하거나 웹캠으로 캡처해 주세요.");
    return;
  }
  const trueIndex = parseInt(truthSelect.value);
  // 예측
  let predictions;
  try {
    predictions = await model.predict(currentImageElement);
  } catch (err) {
    console.error(err);
    alert("예측 중 오류가 발생했습니다.");
    return;
  }
  // 가장 높은 확률 인덱스
  let bestIdx = 0;
  let bestProb = -1;
  for (let i=0;i<predictions.length;i++){
    if (predictions[i].probability > bestProb){
      bestProb = predictions[i].probability;
      bestIdx = i;
    }
  }

  // 기록: confusion, totals, corrects
  confusion[trueIndex][bestIdx] += 1;
  classTotals[trueIndex] += 1;
  if (trueIndex === bestIdx) classCorrect[trueIndex] += 1;
  else {
    // misclassified 저장 (썸네일)
    // 현재 preview 엘리먼트의 이미지를 dataURL로 얻기
    let dataUrl = null;
    if (currentImageElement instanceof HTMLCanvasElement) {
      dataUrl = currentImageElement.toDataURL("image/png");
    } else if (currentImageElement instanceof HTMLImageElement) {
      // 이미지가 외부 URL일 경우 canvas로 그려서 dataURL 생성
      const cvs = document.createElement("canvas");
      cvs.width = currentImageElement.naturalWidth || currentImageElement.width;
      cvs.height = currentImageElement.naturalHeight || currentImageElement.height;
      const ctx = cvs.getContext("2d");
      ctx.drawImage(currentImageElement, 0, 0, cvs.width, cvs.height);
      dataUrl = cvs.toDataURL("image/png");
    }
    misclassified.unshift({dataUrl, trueIndex, predIndex: bestIdx});
    // 적당한 최대 갯수 유지
    if (misclassified.length > 200) misclassified.pop();
  }

  // 화면 갱신
  renderConfusion();
  renderBars();
  renderGallery();
  renderErrors();
});

// 렌더러: confusion matrix
function renderConfusion(){
  // 헤더
  let html = "<thead><tr><th></th>";
  for (let j=0;j<CLASS_NAMES.length;j++){
    html += `<th>예측: ${CLASS_NAMES[j]}</th>`;
  }
  html += "</tr></thead><tbody>";
  for (let i=0;i<CLASS_NAMES.length;i++){
    html += `<tr><th>실제: ${CLASS_NAMES[i]}</th>`;
    for (let j=0;j<CLASS_NAMES.length;j++){
      const val = confusion[i][j] || 0;
      const cls = (i===j) ? "cell-correct" : (val>0 ? "cell-wrong" : "");
      html += `<td class="${cls}">${val}</td>`;
    }
    html += "</tr>";
  }
  html += "</tbody>";
  confusionTable.innerHTML = html;
}

// 렌더러: bars (class-wise accuracy)
function renderBars(){
  barsContainer.innerHTML = "";
  for (let i=0;i<CLASS_NAMES.length;i++){
    const total = classTotals[i] || 0;
    const correct = classCorrect[i] || 0;
    const pct = total === 0 ? 0 : Math.round((correct/total)*100);
    // row
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <div class="bar-label">${CLASS_NAMES[i]}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;"></div></div>
      <div class="percent">${pct}%</div>
    `;
    barsContainer.appendChild(row);
  }
}

// 렌더러: misclassified gallery
function renderGallery(){
  gallery.innerHTML = "";
  if (misclassified.length === 0) {
    gallery.innerHTML = `<div class="small-note">아직 오분류된 사진이 없습니다.</div>`;
    return;
  }
  for (const item of misclassified){
    const div = document.createElement("div");
    div.className = "thumb";
    const img = new Image();
    img.src = item.dataUrl;
    const small = document.createElement("small");
    small.innerText = `실제: ${CLASS_NAMES[item.trueIndex]} / 예측: ${CLASS_NAMES[item.predIndex]}`;
    div.appendChild(img);
    div.appendChild(small);
    gallery.appendChild(div);
  }
}

// 렌더러: error list (accuracy < 75%)
function renderErrors(){
  errorList.innerHTML = "";
  for (let i=0;i<CLASS_NAMES.length;i++){
    const total = classTotals[i] || 0;
    const correct = classCorrect[i] || 0;
    const pct = total === 0 ? 0 : Math.round((correct/total)*100);
    if (pct < 75){
      const li = document.createElement("li");
      li.innerText = `${CLASS_NAMES[i]} — 정확도: ${pct}% (정답 ${correct} / 총 ${total})`;
      errorList.appendChild(li);
    }
  }
  if (errorList.children.length === 0){
    errorList.innerHTML = "<li>모든 클래스의 정확도가 75% 이상입니다.</li>";
  }
}

/* 초기 모델 자동 로드 시도(선택적): 주석 해제하면 페이지 로드 시 모델을 로드합니다 */
// loadModel(MODEL_BASE);
