// public/main.js
// Improved drag-and-drop fallback and robust handlers

document.addEventListener('DOMContentLoaded', () => {
  console.log('main.js loaded (DOMContentLoaded)');

  // Prefer a local model placed under public/models/my-model/
  const LOCAL_MODEL_DIR = 'models/my-model/';
  const REMOTE_MODEL_BASE = 'https://teachablemachine.withgoogle.com/models/4E3fH9sQf/';
  let MODEL_BASE = REMOTE_MODEL_DIR; // will be set after existence check
  const UNCERT_THRESHOLD = 0.75;

  let LABELS = [];
  let model = null;

  const dropArea = document.getElementById('drop-area');
  const preview = document.getElementById('preview');
  const fileInput = document.getElementById('file-input');
  const browseLabel = document.querySelector('label[for="file-input"]') || document.getElementById('browse');
  const classifyBtn = document.getElementById('classify');
  const truthSelect = document.getElementById('truth-select');
  const confusionContainer = document.getElementById('confusion-container');
  const galleryEl = document.getElementById('gallery');
  const accuracyEl = document.getElementById('accuracy');
  const modelStatus = document.getElementById('model-status');

  let labelsWithUncert = [];
  let matrix = [];
  let totalCount = 0;
  let correctCount = 0;

  function setModelStatus(text){ if (modelStatus) modelStatus.innerText = '모델 로드 상태: ' + text; }

  function debug(msg){ console.log('[demo]', msg); }

  function populateTruthSelect(){
    if (!truthSelect) return;
    truthSelect.innerHTML = '<option value="">(실제 레이블 선택)</option>';
    const options = LABELS.length > 0 ? LABELS : ['열대기후','한대기후','온대기후'];
    for (const label of options){ const opt = document.createElement('option'); opt.value = label; opt.innerText = label; truthSelect.appendChild(opt); }
  }

  function initMatrix(){
    labelsWithUncert = LABELS.slice();
    if (!labelsWithUncert.includes('불확실')) labelsWithUncert.push('불확실');
    const n = labelsWithUncert.length;
    matrix = Array.from({length:n}, ()=>Array(n).fill(0));
    renderConfusion(); renderStats();
  }

  async function loadMetadata(){
    try{
      const res = await fetch(MODEL_BASE + 'metadata.json');
      if (!res.ok) throw new Error('metadata fetch failed: ' + res.status);
      const md = await res.json();
      LABELS = Array.isArray(md.labels) ? md.labels.slice() : Array.isArray(md.classNames) ? md.classNames.slice() : [];
      populateTruthSelect(); initMatrix(); debug('Loaded labels: ' + JSON.stringify(LABELS));
    }catch(err){
      console.warn(err); LABELS = []; populateTruthSelect(); initMatrix(); debug('Could not load metadata.json: ' + (err && err.message));
    }
  }

  // Check for a local model first; if not present, fall back to the remote MODEL_BASE
  async function chooseModelBase(){
    try{
      // Use HEAD to avoid downloading the full model; some hosts may not support HEAD -> fallback to GET
      let res = await fetch(LOCAL_MODEL_DIR + 'model.json', {method:'HEAD'});
      if (!res.ok){
        // try GET as a fallback (some static hosts/servers don't respond to HEAD)
        res = await fetch(LOCAL_MODEL_DIR + 'model.json');
      }
      if (res.ok){ MODEL_BASE = LOCAL_MODEL_DIR; debug('Using local model base: ' + MODEL_BASE); return; }
    }catch(e){ debug('Local model check failed: ' + (e && e.message)); }
    MODEL_BASE = REMOTE_MODEL_BASE; debug('Falling back to remote model base: ' + MODEL_BASE);
  }

  async function loadModel(){
    setModelStatus('로딩 중...');
    await chooseModelBase();
    await loadMetadata();
    try{
      const modelURL = MODEL_BASE + 'model.json';
      model = await tmImage.load(modelURL, MODEL_BASE + 'metadata.json');
      setModelStatus('로드 완료'); debug('Model loaded: ' + modelURL);
    }catch(e){ console.error('Model load failed', e); setModelStatus('로드 실패 — 콘솔 확인'); }
  }

  function renderConfusion(){
    if (!confusionContainer) return;
    const labels = labelsWithUncert;
    const table = document.createElement('table'); table.className = 'confusion';
    const thead = document.createElement('thead');
    const hrow = document.createElement('tr'); const corner = document.createElement('th'); corner.innerText='실제 \\ 예측'; hrow.appendChild(corner);
    for (const l of labels){ const th = document.createElement('th'); th.innerText = l; hrow.appendChild(th); }
    thead.appendChild(hrow); table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (let i=0;i<labels.length;i++){
      const tr = document.createElement('tr'); const th = document.createElement('th'); th.innerText = labels[i]; tr.appendChild(th);
      for (let j=0;j<labels.length;j++){
        const td = document.createElement('td'); td.innerText = matrix[i][j] || 0;
        const isUncert = labels[j] === '불확실';
        if (i===j && !isUncert && i < labels.length-1) td.className='cell-correct';
        else if (matrix[i][j] > 0 && (i!==j || isUncert)) td.className='cell-wrong';
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody); confusionContainer.innerHTML=''; confusionContainer.appendChild(table);
  }

  function renderStats(){ if (accuracyEl) accuracyEl.innerText = totalCount===0 ? '-' : ((correctCount/totalCount)*100).toFixed(1) + '%'; }

  function handleFile(file){
    if (!file) return;
    if (!file.type || !file.type.startsWith('image/')){ alert('이미지 파일만 업로드할 수 있습니다.'); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = ()=>{
      if (preview) preview.innerHTML = '';
      img.style.maxWidth = '100%'; img.style.maxHeight = '300px'; img.style.objectFit='contain'; img.style.borderRadius='8px';
      if (preview) { preview.appendChild(img); preview._file = file; }
      URL.revokeObjectURL(url);
    };
    img.onerror = ()=>{ alert('이미지를 불러오는 데 실패했습니다.'); URL.revokeObjectURL(url); };
    img.src = url;
  }

  // Helper: extract file from DataTransfer in cross-browser way
  function fileFromDataTransfer(dt){
    if (!dt) return null;
    if (dt.files && dt.files.length>0) return dt.files[0];
    if (dt.items && dt.items.length>0){
      for (let i=0;i<dt.items.length;i++){
        const it = dt.items[i];
        if (it.kind === 'file'){
          try{ const f = it.getAsFile(); if (f) return f; }catch(_){ }
        }
      }
    }
    return null;
  }

  // Setup drop handlers on dropArea (if present) and document body as fallback
  function setupDragDrop(){
    // Ensure dropArea receives events
    if (dropArea) dropArea.style.pointerEvents = dropArea.style.pointerEvents || 'auto';

    // Add listeners with passive:false so preventDefault works reliably
    const onDragOver = (e)=>{ e.preventDefault(); e.stopPropagation(); if (dropArea) dropArea.classList.add('dragover'); };
    const onDragLeave = (e)=>{ e.preventDefault(); e.stopPropagation(); if (dropArea) dropArea.classList.remove('dragover'); };
    const onDropHandler = (e, target)=>{
      e.preventDefault(); e.stopPropagation(); if (dropArea) dropArea.classList.remove('dragover');
      const dt = e.dataTransfer || (e.originalEvent && e.originalEvent.dataTransfer);
      const file = fileFromDataTransfer(dt);
      if (file) handleFile(file);
      else debug('drop received but no usable file');
    };

    // Attach to dropArea if exists (prefer)
    if (dropArea){
      ['dragenter','dragover'].forEach(evt => dropArea.addEventListener(evt, onDragOver, {passive:false}));
      ['dragleave','dragend','mouseout'].forEach(evt => dropArea.addEventListener(evt, onDragLeave, {passive:false}));
      dropArea.addEventListener('drop', (e)=>onDropHandler(e, dropArea), {passive:false});
    }

    // Body-level fallback: cover cases where events target other elements
    document.body.addEventListener('dragover', (e)=>{ e.preventDefault(); e.stopPropagation(); if (dropArea) dropArea.classList.add('dragover'); }, {passive:false});
    document.body.addEventListener('dragleave', (e)=>{ e.preventDefault(); e.stopPropagation(); if (dropArea) dropArea.classList.remove('dragover'); }, {passive:false});
    document.body.addEventListener('drop', (e)=>onDropHandler(e, document.body), {passive:false});

    // Window-level preventDefault to avoid navigation on drop outside
    window.addEventListener('dragover', (e)=>{ e.preventDefault(); }, {passive:false});
    window.addEventListener('drop', (e)=>{ e.preventDefault(); }, {passive:false});

    debug('Drag/drop handlers installed');
  }

  function previewToDataURL(callback){
    const img = preview && preview.querySelector('img'); if (!img) return callback(null);
    const cvs = document.createElement('canvas');
    const w = img.naturalWidth || img.width; const h = img.naturalHeight || img.height;
    const maxW = 400, maxH = 400; let sw = w, sh = h;
    if (sw > maxW){ sh = sh * (maxW / sw); sw = maxW; }
    if (sh > maxH){ sw = sw * (maxH / sh); sh = maxH; }
    cvs.width = sw; cvs.height = sh; const ctx = cvs.getContext('2d'); ctx.drawImage(img,0,0,sw,sh);
    callback(cvs.toDataURL('image/png'));
  }

  function addToGallery(dataUrl, filename, predLabel, truthLabel, prob){
    if (!galleryEl) return; const thumb = document.createElement('div'); thumb.className='thumb';
    const img = document.createElement('img'); img.src = dataUrl; const meta = document.createElement('div'); meta.className='meta'; meta.innerText = `${filename}\n(예측: ${predLabel}, 실제: ${truthLabel}, 확률: ${((prob||0)*100).toFixed(1)}%)`;
    thumb.appendChild(img); thumb.appendChild(meta); galleryEl.prepend(thumb);
  }

  function ensureLabelInMatrix(label){ if (labelsWithUncert.includes(label)) return; labelsWithUncert.splice(labelsWithUncert.length-1,0,label); const n = labelsWithUncert.length; matrix = matrix.map(r=>{ const nr = r.slice(); nr.splice(n-1,0,0); return nr; }); matrix.push(Array(n).fill(0)); }

  async function classifyCurrent(){
    if (!preview || !preview.querySelector('img')){ alert('이미지를 넣어 주세요.'); return; }
    const truthValue = truthSelect && truthSelect.value; if (!truthValue){ alert('실제 레이블을 선택해 주세요.'); return; }
    if (!model){ alert('모델이 로드되지 않았습니다. 잠시 후 다시 시도하세요.'); return; }
    const imgEl = preview.querySelector('img');
    try{
      const preds = await model.predict(imgEl, false);
      const normalized = preds.map((p,idx)=>({ label: p.className || p.label || (`Class ${idx}`), prob: (p.probability != null) ? p.probability : (p.prob || 0) })).sort((a,b)=>b.prob - a.prob);
      let predLabel = normalized[0] ? normalized[0].label : '불확실'; let predProb = normalized[0] ? normalized[0].prob : 0; if (predProb < UNCERT_THRESHOLD) predLabel = '불확실';
      ensureLabelInMatrix(predLabel);
      const truthIndex = labelsWithUncert.indexOf(truthValue); let predIndex = labelsWithUncert.indexOf(predLabel); if (predIndex === -1){ ensureLabelInMatrix(predLabel); predIndex = labelsWithUncert.indexOf(predLabel); }
      totalCount += 1; if (predLabel === truthValue) correctCount += 1; if (truthIndex >=0 && predIndex >=0) matrix[truthIndex][predIndex] = (matrix[truthIndex][predIndex] || 0) + 1;
      if (predLabel !== truthValue) previewToDataURL((dataUrl)=>{ const filename = (preview._file && preview._file.name) ? preview._file.name : 'image'; addToGallery(dataUrl, filename, predLabel, truthValue, predProb); });
      renderConfusion(); renderStats(); debug('Predictions: ' + JSON.stringify(normalized));
    }catch(e){ console.error('Classification failed', e); alert('예측 중 오류가 발생했습니다. 콘솔을 확인해 주세요.'); }
  }

  // bind UI
  function bindUI(){
    if (fileInput){ fileInput.addEventListener('change', e=>{ const f = e.target && e.target.files && e.target.files[0]; if (f) handleFile(f); }); }
    if (browseLabel && fileInput){ browseLabel.addEventListener('click', ()=>{ try{ fileInput.value = null;}catch(_){ } if (browseLabel.tagName && browseLabel.tagName.toLowerCase() !== 'label'){ try{ fileInput.click(); }catch(_){ } } }); }
    if (classifyBtn) classifyBtn.addEventListener('click', classifyCurrent);
  }

  // render helpers (polluted earlier; bring them here)
  function renderConfusion(){
    if (!confusionContainer) return; const labels = labelsWithUncert; const table = document.createElement('table'); table.className='confusion'; const thead=document.createElement('thead'); const hrow=document.createElement('tr'); const corner=document.createElement('th'); corner.innerText='실제 \\ 예측'; hrow.appendChild(corner); for(const l of labels){ const th=document.createElement('th'); th.innerText=l; hrow.appendChild(th);} thead.appendChild(hrow); table.appendChild(thead); const tbody=document.createElement('tbody'); for(let i=0;i<labels.length;i++){ const tr=document.createElement('tr'); const th=document.createElement('th'); th.innerText=labels[i]; tr.appendChild(th); for(let j=0;j<labels.length;j++){ const td=document.createElement('td'); td.innerText=matrix[i][j]||0; const isUncert=labels[j]==='불확실'; if(i===j && !isUncert && i<labels.length-1) td.className='cell-correct'; else if(matrix[i][j]>0 && (i!==j || isUncert)) td.className='cell-wrong'; tr.appendChild(td);} tbody.appendChild(tr);} table.appendChild(tbody); confusionContainer.innerHTML=''; confusionContainer.appendChild(table);
  }
  function renderStats(){ if(accuracyEl) accuracyEl.innerText = totalCount===0 ? '-' : ((correctCount/totalCount)*100).toFixed(1) + '%'; }

  // init
  populateTruthSelect(); initMatrix(); setupDragDrop(); bindUI(); loadModel();

});
