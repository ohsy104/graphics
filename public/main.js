// public/main.js (drag-and-drop simplified UI)
// - Uses external Teachable Machine model URL provided by user
// - Drag & drop image input
// - No webcam
// - Simple, clear "분류하기" button that runs model.predict and records results

const MODEL_BASE = "https://teachablemachine.withgoogle.com/models/4E3fH9sQf/"; // <- set to the model URL you provided
const CLASS_NAMES = ["열대기후", "한대기후", "온대기후"];

let model = null;
let currentImageElement = null; // <img> element containing the image to predict

// stats
const confusion = Array.from({length:3}, () => [0,0,0]);
const classTotals = [0,0,0];
const classCorrect = [0,0,0];
const misclassified = []; // {dataUrl, trueIndex, predIndex}

// DOM
const dropArea = document.getElementById("drop-area");
const fileInput = document.getElementById("file-input");
const browseBtn = document.getElementById("browse");
const classifyBtn = document.getElementById("classify");
const truthSelect = document.getElementById("truth-select");
const confusionTable = document.getElementById("confusion-table");
const barsContainer = document.getElementById("bars-container");
const gallery = document.getElementById("gallery");
const errorList = document.getElementById("error-list");

// initial render
renderConfusion();
renderBars();
renderGallery();
renderErrors();

// auto-load model from external URL (best-effort). If fails, user sees alert when trying to classify.
(async function autoLoad(){
  const modelURL = MODEL_BASE + (MODEL_BASE.endsWith("/")?"":"/") + "model.json";
  const metadataURL = MODEL_BASE + (MODEL_BASE.endsWith("/")?"":"/") + "metadata.json";
  try{
    model = await tmImage.load(modelURL, metadataURL);
    console.log("Model loaded:", modelURL);
    updateClassifyButton();
  }catch(e){
    console.warn('Model auto-load failed:', e);
  }
})();

function updateClassifyButton(){
  classifyBtn.disabled = !(model && currentImageElement);
}

// drag & drop handlers
['dragenter','dragover'].forEach(evt => dropArea.addEventListener(evt, (e)=>{
  e.preventDefault(); e.stopPropagation(); dropArea.classList.add('dragover');
}));
['dragleave','dragend','drop'].forEach(evt => dropArea.addEventListener(evt, (e)=>{
  e.preventDefault(); e.stopPropagation(); dropArea.classList.remove('dragover');
}));

dropArea.addEventListener('drop', (e)=>{
  const dt = e.dataTransfer;
  if (!dt || !dt.files || dt.files.length === 0) return;
  const f = dt.files[0];
  handleFile(f);
});

browseBtn.addEventListener('click', ()=> fileInput.click());
fileInput.addEventListener('change', (e)=>{
  const f = e.target.files && e.target.files[0];
  if (f) handleFile(f);
});

function handleFile(file){
  if (!file.type.startsWith('image/')){
    alert('이미지 파일만 업로드할 수 있습니다.');
    return;
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = ()=>{
    // show thumbnail
    dropArea.innerHTML = '';
    img.style.maxWidth = '100%';
    img.style.maxHeight = '100%';
    dropArea.appendChild(img);
    currentImageElement = img;
    updateClassifyButton();
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

// classify & record
classifyBtn.addEventListener('click', async ()=>{
  if (!model){
    alert('모델을 불러오지 못했습니다. 외부 모델 URL 또는 네트워크 상태를 확인하세요.');
    return;
  }
  if (!currentImageElement){
    alert('사진을 넣어 주세요.');
    return;
  }

  const trueIndex = parseInt(truthSelect.value);
  let predictions;
  try{
    predictions = await model.predict(currentImageElement);
  }catch(e){
    console.error('predict error', e);
    alert('예측 중 오류가 발생했습니다. 콘솔을 확인해 주세요.');
    return;
  }

  // find best prediction
  let bestIdx = 0; let bestProb = -1;
  for (let i=0;i<predictions.length;i++){
    if (predictions[i].probability > bestProb){ bestProb = predictions[i].probability; bestIdx = i; }
  }

  // save stats
  confusion[trueIndex][bestIdx] += 1;
  classTotals[trueIndex] += 1;
  if (trueIndex === bestIdx) classCorrect[trueIndex] += 1;
  else {
    // save misclassified thumbnail
    let dataUrl = null;
    if (currentImageElement instanceof HTMLImageElement){
      const cvs = document.createElement('canvas');
      cvs.width = currentImageElement.naturalWidth || currentImageElement.width;
      cvs.height = currentImageElement.naturalHeight || currentImageElement.height;
      const ctx = cvs.getContext('2d');
      ctx.drawImage(currentImageElement, 0, 0, cvs.width, cvs.height);
      dataUrl = cvs.toDataURL('image/png');
    }
    misclassified.unshift({dataUrl, trueIndex, predIndex: bestIdx});
    if (misclassified.length > 200) misclassified.pop();
  }

  // show a brief result banner
  showResultBanner(`${CLASS_NAMES[bestIdx]} (${Math.round(bestProb*100)}%)`);

  renderConfusion(); renderBars(); renderGallery(); renderErrors();
});

function showResultBanner(text){
  const banner = document.createElement('div');
  banner.style.position = 'fixed';
  banner.style.right = '20px';
  banner.style.top = '92px';
  banner.style.background = 'linear-gradient(90deg,#2fb64b,#0b8a3e)';
  banner.style.color = 'white';
  banner.style.padding = '10px 14px';
  banner.style.borderRadius = '8px';
  banner.style.boxShadow = '0 6px 18px rgba(11,138,62,0.12)';
  banner.style.fontWeight = '700';
  banner.innerText = `분류 결과: ${text}`;
  document.body.appendChild(banner);
  setTimeout(()=> banner.remove(), 2100);
}

// renderers
function renderConfusion(){
  let html = '<thead><tr><th></th>';
  for (let j=0;j<CLASS_NAMES.length;j++) html += `<th>예측: ${CLASS_NAMES[j]}</th>`;
  html += '</tr></thead><tbody>';
  for (let i=0;i<CLASS_NAMES.length;i++){
    html += `<tr><th>실제: ${CLASS_NAMES[i]}</th>`;
    for (let j=0;j<CLASS_NAMES.length;j++){
      const val = confusion[i][j] || 0;
      const cls = (i===j) ? 'cell-correct' : (val>0 ? 'cell-wrong' : '');
      html += `<td class="${cls}">${val}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody>';
  confusionTable.innerHTML = html;
}

function renderBars(){
  barsContainer.innerHTML = '';
  for (let i=0;i<CLASS_NAMES.length;i++){
    const total = classTotals[i] || 0;
    const correct = classCorrect[i] || 0;
    const pct = total === 0 ? 0 : Math.round((correct/total)*100);
    const row = document.createElement('div'); row.className = 'bar-row';
    row.innerHTML = `
      <div class="bar-label">${CLASS_NAMES[i]}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
      <div class="percent">${pct}%</div>`;
    barsContainer.appendChild(row);
  }
}

function renderGallery(){
  gallery.innerHTML = '';
  if (misclassified.length === 0){ gallery.innerHTML = '<div class="small-note">아직 오분류된 사진이 없습니다.</div>'; return; }
  for (const item of misclassified){
    const div = document.createElement('div'); div.className = 'thumb';
    const img = new Image(); img.src = item.dataUrl;
    const small = document.createElement('small'); small.innerText = `실제: ${CLASS_NAMES[item.trueIndex]} / 예측: ${CLASS_NAMES[item.predIndex]}`;
    div.appendChild(img); div.appendChild(small); gallery.appendChild(div);
  }
}

function renderErrors(){
  errorList.innerHTML = '';
  for (let i=0;i<CLASS_NAMES.length;i++){
    const total = classTotals[i] || 0; const correct = classCorrect[i] || 0; const pct = total===0?0:Math.round((correct/total)*100);
    if (pct < 75){ const li = document.createElement('li'); li.innerText = `${CLASS_NAMES[i]} — 정확도: ${pct}% (정답 ${correct} / 총 ${total})`; errorList.appendChild(li); }
  }
  if (errorList.children.length === 0) errorList.innerHTML = '<li>모든 클래스의 정확도가 75% 이상입니다.</li>';
}
