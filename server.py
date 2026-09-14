import base64
import binascii
import io
import json
import sys
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageOps
from skimage.feature import hog

ROOT = Path(__file__).resolve().parent
FRONTEND = ROOT / "Frontend"
LR_MODEL = ROOT / "Model" / "LR model" / "Modeling" / "artifacts" / "model.npz"
CNN_DIR = ROOT / "Model" / "CNN model"
CNN_CHECKPOINT = CNN_DIR / "artifacts" / "mnist_cnn.pt"
RECORD_DIR = ROOT / "Record test"
MANIFEST_PATH = RECORD_DIR / "manifest.json"

with np.load(LR_MODEL, allow_pickle=False) as package:
    LR_COEF = package["coef"]
    LR_INTERCEPT = package["intercept"]
    LR_CLASSES = package["classes"]
    LR_SCALER_MEAN = package["scaler_mean"]
    LR_SCALER_SCALE = package["scaler_scale"]
    HOG_CONFIG = json.loads(package["config_json"].item())["hog"]

sys.path.insert(0, str(CNN_DIR))
from cnn_model import MNISTCNN

CNN = MNISTCNN()
CNN.load_state_dict(torch.load(CNN_CHECKPOINT, map_location="cpu", weights_only=True)["model_state_dict"])
CNN.eval()


def prepare_image(data: bytes) -> np.ndarray:
    image = Image.open(io.BytesIO(data)).convert("L")
    if image.size != (28, 28):
        image = ImageOps.contain(image, (28, 28), Image.Resampling.LANCZOS)
        canvas = Image.new("L", (28, 28))
        canvas.paste(image, ((28 - image.width) // 2, (28 - image.height) // 2))
    else:
        canvas = image
    array = np.asarray(canvas, dtype=np.float32) / 255.0
    border = np.concatenate((array[0], array[-1], array[:, 0], array[:, -1]))
    if border.mean() > 0.5:
        array = 1.0 - array
    return np.array(array, dtype=np.float32, order="C", copy=True)


def probabilities(logits: np.ndarray) -> np.ndarray:
    scores = logits - logits.max()
    result = np.exp(scores)
    return result / result.sum()


def predict_hog(image: np.ndarray) -> dict[str, object]:
    features = hog(
        image,
        orientations=HOG_CONFIG["orientations"],
        pixels_per_cell=tuple(HOG_CONFIG["pixels_per_cell"]),
        cells_per_block=tuple(HOG_CONFIG["cells_per_block"]),
        block_norm=HOG_CONFIG["block_norm"],
        feature_vector=True,
    ).astype(np.float32)
    scaled = (features - LR_SCALER_MEAN) / LR_SCALER_SCALE
    probs = probabilities(scaled @ LR_COEF.T + LR_INTERCEPT)
    index = int(np.argmax(probs))
    return {
        "prediction": int(LR_CLASSES[index]),
        "confidence": float(probs[index]),
        "probabilities": probs.tolist(),
    }


def predict_cnn(image: np.ndarray) -> dict[str, object]:
    tensor = torch.from_numpy(image.reshape(1, 1, 28, 28))
    with torch.inference_mode():
        probs = torch.softmax(CNN(tensor), dim=1)[0].numpy()
    index = int(np.argmax(probs))
    return {
        "prediction": index,
        "confidence": float(probs[index]),
        "probabilities": probs.tolist(),
    }


def predict(data: bytes) -> dict[str, object]:
    image = prepare_image(data)
    return {"hog_lr": predict_hog(image), "cnn": predict_cnn(image)}


def save_test_case(payload: dict[str, object]) -> dict[str, str]:
    encoded = payload.get("image")
    results = payload.get("results")
    if not isinstance(encoded, str) or not encoded.startswith("data:image/png;base64,"):
        raise ValueError("Ảnh lưu phải là PNG base64.")
    if not isinstance(results, dict) or not {"hog_lr", "cnn"}.issubset(results):
        raise ValueError("Thiếu kết quả của hai model.")
    try:
        image_bytes = base64.b64decode(encoded.split(",", 1)[1], validate=True)
        Image.open(io.BytesIO(image_bytes)).verify()
    except (binascii.Error, ValueError, OSError) as error:
        raise ValueError("Ảnh PNG không hợp lệ.") from error
    RECORD_DIR.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8")) if MANIFEST_PATH.is_file() else {"cases": []}
    case_number = len(manifest["cases"]) + 1
    image_number = case_number
    stamp = datetime.now(timezone.utc).strftime("%f")[-6:]
    image_id = stamp
    case_id = stamp
    prediction = int(results["cnn"]["prediction"])
    image_filename = f"{image_id}_{image_number} - {case_id}_so_{case_number}.png"
    (RECORD_DIR / image_filename).write_bytes(image_bytes)
    manifest["cases"].append({
        "case_id": case_id,
        "case_number": case_number,
        "image_id": image_id,
        "image_number": image_number,
        "image_filename": image_filename,
        "saved_at": datetime.now(timezone.utc).isoformat(),
        "results": results,
    })
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"case_id": case_id, "image_filename": image_filename}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(FRONTEND), **kwargs)

    def do_POST(self) -> None:
        if self.path not in ("/api/predict", "/api/save-test"):
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 5_000_000:
                raise ValueError("Ảnh phải có kích thước từ 1 byte đến 5 MB.")
            request_body = self.rfile.read(length)
            if self.path == "/api/save-test":
                result = save_test_case(json.loads(request_body))
            else:
                result = predict(request_body)
            body = json.dumps(result).encode()
            self.send_response(200)
        except Exception as error:
            body = json.dumps({"error": str(error)}).encode()
            self.send_response(400)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 8000), Handler)
    print("Mở http://127.0.0.1:8000/idex.html")
    server.serve_forever()
