// public/main.js
// Updated: more verbose debug output, moved browse button above drop area, improved label handling

document.addEventListener('DOMContentLoaded', () => {
  console.log('main.js loaded (DOMContentLoaded)');

  const MODEL_BASE = 'https://teachablemachine.withgoogle.com/models/4E3fH9sQf/';
  let LABELS = [];

  let model = null;
  let currentImageElement = null;
  const predictionHistory = [];

  // DOM
  const dropArea = document.getElementById('drop-area');
  const fileInput = document.getElementById('file-input');
  const browseBtn = document.getElementById('browse');
  const classifyBtn = document.getElementById('classify');
  const top3El = document.getElementById('top3');
  const historyEl = document.getElementById('history');
  const modelStatus = document.getElementById('model-status');
  const debugArea = document.getElementById('debug-area');

  function setModelStatus(text){ if (modelStatus) modelStatus.innerText = '모델 로드 상태: ' + text; }
  function appendDebug(msg){ if (!debugArea) return; const p = document.createElement('div'); p.innerText = msg; debugArea.prepend(p); }

  function updateClassifyButton(){ if (classifyBtn) classifyBtn.disabled = !(model && currentImageElement); }

  async function loadMetadata(){
    const metadataURL = MODEL_BASE + (MODEL_BASE.endsWith('/')? '': '/') + 'metadata.json';
    try{
      const res = await fetch(metadataURL);
      if (!res.ok) throw new Error('metadata fetch failed: ' + res.status);
      const md = await res.json();
      if (Array.isArray(md.labels) && md.labels.length>0){ LABELS = md.labels; }
      else if (md && Array.isArray(md.classNames)) { LABELS = md.classNames; }
      else if (md && md.labels && Array.isArray(md.labels)) { LABELS = md.labels; }
      else { console.warn('No labels array in metadata.json, will rely on prediction output'); }
      console.log('Loaded metadata labels:', LABELS);
      appendDebug('Loaded metadata labels: ' + JSON.stringify(LABELS));
    }catch(e){
      console.warn('Could not load metadata.json:', e);
      appendDebug('Could not load metadata.json: ' + e.message);
    }
  }

  async function autoLoadModel(){
    setModelStatus('로딩 중...');
    await loadMetadata();
    const modelURL = MODEL_BASE + (MODEL_BASE.endsWith('/')? '': '/') + 'model.json';
    try{
      model = await tmImage.load(modelURL, modelURL.replace('model.json','metadata.json'));
      console.log('Model loaded:', modelURL);
      setModelStatus('로드 완료');
      appendDebug('Model loaded: ' + modelURL);
      updateClassifyButton();
    }catch(e){
      console.error('Model load failed:', e);
      setModelStatus('로드 실패 — 콘솔 확인');
      appendDebug('Model load failed: ' + e.message);
    }
  }

  autoLoadModel();

  // drag & drop handlers
  if (dropArea){
    ['dragenter','dragover'].forEach(evt => dropArea.addEventListener(evt, (e)=>{ e.preventDefault(); e.stopPropagation(); dropArea.classList.add('dragover'); }));
    ['dragleave','dragend','drop'].forEach(evt => dropArea.addEventListener(evt, (e)=>{ e.preventDefault(); e.stopPropagation(); dropArea.classList.remove('dragover'); }));
    dropArea.addEventListener('drop', (e)=>{ const dt = e.dataTransfer; if (!dt || !dt.files || dt.files.length===0) return; handleFile(dt.files[0]); });
  }

  if (browseBtn && fileInput){ browseBtn.addEventListener('click', ()=> fileInput.click()); fileInput.addEventListener('change', (e)=>{ const f = e.target.files && e.target.files[0]; if (f) handleFile(f); }); }

  function handleFile(file){
    if (!file.type.startsWith('image/')){ alert('이미지 파일만 업로드할 수 있습니다.'); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = ()=>{
      if (dropArea) dropArea.innerHTML = '';
      img.style.maxWidth = '100%'; img.style.maxHeight = '100%';
      if (dropArea) dropArea.appendChild(img);
      currentImageElement = img; updateClassifyButton(); URL.revokeObjectURL(url);
      appendDebug('Image loaded for prediction (w:' + img.naturalWidth + ', h:' + img.naturalHeight + ')');
    };
    img.onerror = (err)=>{ console.error('Image load error', err); alert('이미지를 불러오는 데 실패했습니다.'); URL.revokeObjectURL(url); appendDebug('Image load error: ' + err.message); };
    img.src = url;
  }

  function normalizePredictions(predictions){
    if (!predictions) return [];
    const arr = predictions.map((p,idx)=>{
      const label = p.className || p.label || (LABELS[idx] || `Class ${idx}`);
      const prob = (p.probability != null) ? p.probability : (p.prob || 0);
      return {label, prob};
    });
    arr.sort((a,b)=>b.prob - a.prob);
    return arr;
  }

  function renderTop3(predArr){
    if (!top3El) return;
    top3El.innerHTML = '';
    if (!predArr || predArr.length===0){ top3El.innerHTML = '<div class="top3-row">예측 결과가 없습니다.</div>'; return; }
    const top = predArr.slice(0,3);
    top.forEach(p => {
      const row = document.createElement('div'); row.className = 'top3-row';
      const label = document.createElement('div'); label.innerText = p.label;
      const prob = document.createElement('div'); prob.innerText = Math.round(p.prob*100) + '%';
      row.appendChild(label); row.appendChild(prob); top3El.appendChild(row);
    });
  }

  function addHistoryItem(imgDataUrl, predLabel, predProb, allPreds){
    predictionHistory.unshift({img:imgDataUrl, label:predLabel, prob:predProb, preds:allPreds});
    if (predictionHistory.length>200) predictionHistory.pop();
    renderHistory();
  }

  function renderHistory(){
    if (!historyEl) return;
    historyEl.innerHTML = '';
    if (predictionHistory.length===0){ historyEl.innerHTML = '<div class="small-note">아직 예측 이력이 없습니다.</div>'; return; }
    for (const it of predictionHistory){
      const row = document.createElement('div'); row.className = 'history-item';
      const thumb = document.createElement('div'); thumb.className = 'thumb'; const img = new Image(); img.src = it.img; thumb.appendChild(img);
      const info = document.createElement('div'); info.className = 'pred-info'; info.innerHTML = `<strong>${it.label}</strong> (${Math.round(it.prob*100)}%)`;
      row.appendChild(thumb); row.appendChild(info); historyEl.appendChild(row);
    }
  }

  classifyBtn && classifyBtn.addEventListener('click', async ()=>{
    if (!model){ alert('모델을 불러오지 못했습니다. 콘솔을 확인해 주세요.'); return; }
    if (!currentImageElement){ alert('사진을 넣어 주세요.'); return; }
    try{
      // Do prediction
      const predictions = await model.predict(currentImageElement, false);
      const normalized = normalizePredictions(predictions);
      console.log('Predictions (normalized):', normalized);
      appendDebug('Predictions: ' + JSON.stringify(normalized));
      renderTop3(normalized);
      // capture image data url
      const cvs = document.createElement('canvas'); cvs.width = currentImageElement.naturalWidth || currentImageElement.width; cvs.height = currentImageElement.naturalHeight || currentImageElement.height; const ctx = cvs.getContext('2d'); ctx.drawImage(currentImageElement,0,0,cvs.width,cvs.height); const dataUrl = cvs.toDataURL('image/png');
      addHistoryItem(dataUrl, normalized[0].label, normalized[0].prob, normalized);
      const banner = document.createElement('div'); banner.style.position='fixed'; banner.style.right='20px'; banner.style.top='92px'; banner.style.background='linear-gradient(90deg,#2fb64b,#0b8a3e)'; banner.style.color='white'; banner.style.padding='10px 14px'; banner.style.borderRadius='8px'; banner.style.boxShadow='0 6px 18px rgba(11,138,62,0.12)'; banner.style.fontWeight='700'; banner.innerText = `분류 결과: ${normalized[0].label} (${Math.round(normalized[0].prob*100)}%)`; document.body.appendChild(banner); setTimeout(()=>banner.remove(),2000);
    }catch(e){ console.error('Classification failed', e); appendDebug('Classification failed: ' + e.message); alert('예측 중 오류가 발생했습니다. 콘솔을 확인해 주세요.'); }
  });

});
