const canvas = document.getElementById('drawingCanvas');
const context = canvas.getContext('2d');
const recognizeButton = document.getElementById('recognizeButton');
const saveButton = document.getElementById('saveButton');
const CANVAS_SIZE = 28;
let latestResults = null;
let drawing = false;
let hasInput = false;

function renderProbabilities(target, values = Array(10).fill(0), activeDigit = -1) {
  const list = document.getElementById(target);
  list.innerHTML = values.map((value, digit) => {
    const percent = value * 100;
    return `<div class="probability-row ${digit === activeDigit ? 'active' : ''}">
      <span>${digit}</span><div class="probability-track"><div class="probability-bar" style="width:${Math.max(percent, .8)}%"></div></div>
      <span class="probability-value">${percent.toFixed(2)}%</span></div>`;
  }).join('');
}

function renderModelResult(prefix, result) {
  document.getElementById(`${prefix}Prediction`).textContent = result.prediction;
  document.getElementById(`${prefix}Confidence`).textContent = `${(result.confidence * 100).toFixed(2)}%`;
  renderProbabilities(`${prefix}Probabilities`, result.probabilities, result.prediction);
}

function resetResults() {
  latestResults = null;
  saveButton.disabled = true;
  for (const prefix of ['hog', 'cnn']) {
    document.getElementById(`${prefix}Prediction`).textContent = '-';
    document.getElementById(`${prefix}Confidence`).textContent = '0.00%';
    renderProbabilities(`${prefix}Probabilities`);
  }
}

async function saveTestCase() {
  if (!latestResults || !hasInput) {
    alert('Hãy vẽ chữ số và chạy Nhận diện trước khi Save.');
    return;
  }
  saveButton.disabled = true;
  try {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Không thể tạo ảnh từ canvas.');
    const image = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Không thể đọc ảnh để lưu.'));
      reader.readAsDataURL(blob);
    });
    const response = await fetch('/api/save-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, results: latestResults })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    alert(`Đã lưu case ${data.case_id}: ${data.image_filename}`);
  } catch (error) {
    alert(`Không thể lưu case: ${error.message}`);
  } finally {
    saveButton.disabled = false;
  }
}

function clearDrawing() {
  context.fillStyle = '#000';
  context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  hasInput = false;
  resetResults();
}

function configureDrawing() {
  context.fillStyle = '#000';
  context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = 2.5;
  context.strokeStyle = '#fff';
}

function point(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * CANVAS_SIZE / rect.width,
    y: (event.clientY - rect.top) * CANVAS_SIZE / rect.height,
  };
}

canvas.addEventListener('pointerdown', event => {
  drawing = true;
  hasInput = true;
  const p = point(event);
  context.beginPath();
  context.moveTo(p.x, p.y);
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', event => {
  if (!drawing) return;
  const p = point(event);
  context.lineTo(p.x, p.y);
  context.stroke();
});
canvas.addEventListener('pointerup', () => { drawing = false; });
canvas.addEventListener('pointercancel', () => { drawing = false; });

document.getElementById('clearButton').addEventListener('click', clearDrawing);
document.getElementById('redrawButton').addEventListener('click', clearDrawing);
saveButton.addEventListener('click', saveTestCase);

recognizeButton.addEventListener('click', async () => {
  if (!hasInput) {
    alert('Vui lòng vẽ hoặc tải ảnh chữ số.');
    return;
  }
  recognizeButton.disabled = true;
  try {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Không thể tạo ảnh từ canvas.');
    const response = await fetch('/api/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: blob
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    latestResults = { hog_lr: data.hog_lr, cnn: data.cnn };
    renderModelResult('hog', data.hog_lr);
    renderModelResult('cnn', data.cnn);
    saveButton.disabled = false;
  } catch (error) {
    alert(`Không thể nhận diện: ${error.message}`);
  } finally {
    recognizeButton.disabled = false;
  }
});

configureDrawing();
resetResults();
