// public/main.js (단순화 버전)
// - 모델 선택 UI 제거
// - 기본 모델 경로를 자동으로 로드 (models/my-model/)
// - 파일 업로드 / 웹캠 캡처 / 예측 및 기록 기능만 제공

const MODEL_BASE = "models/my-model/"; // 기본 경로 (repo의 public/models/my-model/)
const CLASS_NAMES = ["열대기후", "한대기후", "온대기후"];

let model = null;
let webcam = null;
let currentImageElement = null;

const confusion = Array.from({length:3}, () => [0,0,0]);
const classTotals = [0,0,0];
const classCorrect = [0,0,0];
const misclassified = [];

const preview = document.getElementById("preview");
const fileInput = document.getElementById("file-input");
const startWebcamBtn = document.getElementById("start-webcam");
const captureBtn = document.getElementById("capture");
const predictBtn = document.getElementById("predict-btn");
const truthSelect = document.getElementById("truth-select");
const confusionTable = document.getElementById("confusion-table");
const barsContainer = document.getElementById("bars-container");
const gallery = document.getElementById("gallery");
const errorList = document.getElementById("error-list");

renderConfusion();
renderBars();
renderGallery();
renderErrors();

(async function autoLoad() {
  const modelURL = MODEL_BASE + (MODEL_BASE.endsWith("/") ? "" : "/") + "model.json";
  const metadataURL = MODEL_BASE + (MODEL_BASE.endsWith("/") ? "" : "/") + "metadata.json";
  try {
    model = await tmImage.load(modelURL, metadataURL);
    console.log("모델 로드 완료:", modelURL);
    predictBtn.disabled = false;
  } catch (e) {
    console.warn("모델 자동 로드 실패:", e);
  }
})();

fileInput.addEventListener("change", (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  stopWebcamIfRunning();
  const url = URL.createObjectURL(f);
  const img = new Image();
  img.onload = () => {
    preview.innerHTML = "";
    img.style.maxWidth = "100%";
    img.style.maxHeight = "100%";
    preview.appendChild(img);
    currentImageElement = img;
    predictBtn.disabled = false;
    URL.revokeObjectURL(url);
  };
  img.src = url;
});

startWebcamBtn.addEventListener("click", async () => {
  if (webcam) {
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
    alert("웹캠 권한을 확인해주세요.");
  }
});

captureBtn.addEventListener("click", () => {
  if (!webcam) return;
  const dataUrl = webcam.canvas.toDataURL("image/png");
  const img = new Image();
  img.onload = () => {
    preview.innerHTML = "";
    preview.appendChild(img);
    currentImageElement = img;
    stopWebcamIfRunning();
    startWebcamBtn.textContent = "웹캠 시작";
    captureBtn.disabled = true;
  };
  img.src = dataUrl;
});

function stopWebcamIfRunning(){
  if (webcam) {
    try { webcam.stop(); } catch(e){/*ignore*/}
    webcam = null;
  }
}

predictBtn.addEventListener("click", async () => {
  if (!model) {
    alert("모델이 아직 로드되지 않았습니다. public/models/my-model/ 위치에 모델 파일을 올려두었는지 확인하세요.");
    return;
  }
  if (!currentImageElement) {
    alert("이미지를 업로드하거나 웹캠으로 캡처하세요.");
    return;
  }

  const trueIndex = parseInt(truthSelect.value);
  let predictions;
  try {
    predictions = await model.predict(currentImageElement);
  } catch (err) {
    console.error(err);
    alert("예측 중 오류가 발생했습니다.");
    return;
  }

  let bestIdx = 0;
  let bestProb = -1;
  for (let i=0;i<predictions.length;i++){
    if (predictions[i].probability > bestProb){
      bestProb = predictions[i].probability;
      bestIdx = i;
    }
  }

  confusion[trueIndex][bestIdx] += 1;
  classTotals[trueIndex] += 1;
  if (trueIndex === bestIdx) classCorrect[trueIndex] += 1;
  else {
    let dataUrl = null;
    if (currentImageElement instanceof HTMLCanvasElement) dataUrl = currentImageElement.toDataURL("image/png");
    else if (currentImageElement instanceof HTMLImageElement) {
      const cvs = document.createElement("canvas");
      cvs.width = currentImageElement.naturalWidth || currentImageElement.width;
      cvs.height = currentImageElement.naturalHeight || currentImageElement.height;
      const ctx = cvs.getContext("2d");
      ctx.drawImage(currentImageElement, 0, 0, cvs.width, cvs.height);
      dataUrl = cvs.toDataURL("image/png");
    }
    misclassified.unshift({dataUrl, trueIndex, predIndex: bestIdx});
    if (misclassified.length > 200) misclassified.pop();
  }

  renderConfusion();
  renderBars();
  renderGallery();
  renderErrors();
});

function renderConfusion(){
  let html = "<thead><tr><th></th>";
  for (let j=0;j<CLASS_NAMES.length;j++) html += `<th>예측: ${CLASS_NAMES[j]}</th>`;
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

function renderBars(){
  barsContainer.innerHTML = "";
  for (let i=0;i<CLASS_NAMES.length;i++){
    const total = classTotals[i] || 0;
    const correct = classCorrect[i] || 0;
    const pct = total === 0 ? 0 : Math.round((correct/total)*100);
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
  if (errorList.children.length === 0) errorList.innerHTML = "<li>모든 클래스의 정확도가 75% 이상입니다.</li>";
}
