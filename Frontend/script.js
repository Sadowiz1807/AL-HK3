const canvas = document.getElementById('drawingCanvas');
const context = canvas.getContext('2d');
const probabilityList = document.getElementById('probabilityList');
const predictedDigit = document.getElementById('predictedDigit');
const confidenceValue = document.getElementById('confidenceValue');

const initialProbabilities = [0.02, 0.03, 0.10, 0.06, 0.12, 0.25, 1.20, 98.67, 0.90, 0.65];
let drawing = false;

function renderProbabilities(values, activeDigit = 7) {
  probabilityList.innerHTML = values.map((value, digit) => `
    <div class="probability-row ${digit === activeDigit ? 'active' : ''}">
      <span>${digit}</span>
      <div class="probability-track">
        <div class="probability-bar" style="width:${Math.max(value, 0.8)}%"></div>
      </div>
      <span class="probability-value">${value.toFixed(2)}%</span>
    </div>
  `).join('');
}

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const snapshot = document.createElement('canvas');
  snapshot.width = canvas.width;
  snapshot.height = canvas.height;
  snapshot.getContext('2d').drawImage(canvas, 0, 0);
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = Math.max(18, rect.width * 0.038);
  context.strokeStyle = '#171717';
  if (snapshot.width) context.drawImage(snapshot, 0, 0, snapshot.width, snapshot.height, 0, 0, rect.width, rect.height);
}

function pointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function startDrawing(event) {
  drawing = true;
  const point = pointFromEvent(event);
  context.beginPath();
  context.moveTo(point.x, point.y);
  canvas.setPointerCapture(event.pointerId);
}

function draw(event) {
  if (!drawing) return;
  const point = pointFromEvent(event);
  context.lineTo(point.x, point.y);
  context.stroke();
}

function stopDrawing() { drawing = false; }

function clearCanvas() {
  const rect = canvas.getBoundingClientRect();
  context.clearRect(0, 0, rect.width, rect.height);
}

function drawDemoSeven() {
  clearCanvas();
  const { width, height } = canvas.getBoundingClientRect();
  context.beginPath();
  context.moveTo(width * .35, height * .2);
  context.bezierCurveTo(width * .45, height * .2, width * .57, height * .22, width * .67, height * .21);
  context.lineTo(width * .47, height * .74);
  context.stroke();
}

canvas.addEventListener('pointerdown', startDrawing);
canvas.addEventListener('pointermove', draw);
canvas.addEventListener('pointerup', stopDrawing);
canvas.addEventListener('pointercancel', stopDrawing);
document.getElementById('clearButton').addEventListener('click', clearCanvas);
document.getElementById('redrawButton').addEventListener('click', drawDemoSeven);

document.getElementById('recognizeButton').addEventListener('click', () => {
  predictedDigit.textContent = '7';
  confidenceValue.textContent = '98.67%';
  renderProbabilities(initialProbabilities, 7);
});

document.getElementById('imageInput').addEventListener('change', event => {
  const file = event.target.files[0];
  if (!file) return;
  const image = new Image();
  image.onload = () => {
    clearCanvas();
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / image.width, rect.height / image.height) * .8;
    const width = image.width * scale;
    const height = image.height * scale;
    context.drawImage(image, (rect.width - width) / 2, (rect.height - height) / 2, width, height);
    URL.revokeObjectURL(image.src);
  };
  image.src = URL.createObjectURL(file);
});

window.addEventListener('resize', resizeCanvas);
resizeCanvas();
drawDemoSeven();
renderProbabilities(initialProbabilities, 7);
