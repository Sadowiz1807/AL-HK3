# Hướng dẫn xây dựng Frontend cho mô hình nhận dạng chữ số

## Chuẩn bị dataset sau khi clone

Dataset được lưu trong `Model/Dataset.zip` bằng Git LFS. Sau khi clone, chạy:

```bash
git lfs pull
py -3.13 setup_dataset.py
```

Nếu máy dùng lệnh `python`, có thể chạy `python setup_dataset.py`. Script chỉ giải nén khi `Model/Dataset/` chưa tồn tại.

## 1. Mục tiêu

Frontend cho phép người dùng viết một chữ số từ `0` đến `9`, gửi đúng một ảnh sang tầng inference và hiển thị kết quả dự đoán.

Mô hình cuối cùng sử dụng pipeline:

```text
Ảnh chữ số
→ chuẩn hóa ảnh 28×28
→ HOG
→ StandardScaler
→ Logistic Regression
→ xác suất các lớp 0–9
```

Frontend không cần biết cách train model và không tự triển khai HOG, scaler hoặc Logistic Regression.

## 2. Phân chia trách nhiệm

### Frontend

- Cung cấp vùng vẽ hình vuông.
- Hỗ trợ vẽ, xóa nét và xóa toàn bộ canvas.
- Kiểm tra người dùng đã vẽ trước khi gửi.
- Chuyển canvas thành ảnh và gửi sang inference API.
- Hiển thị chữ số dự đoán, độ tin cậy và các xác suất cần thiết.
- Hiển thị lỗi rõ ràng khi model service không khả dụng.

### Inference service

- Nạp một lần file:

```text
Model/Modeling/artifacts/model.npz
```

- Kiểm tra package và input contract khi khởi động.
- Chuẩn hóa ảnh giống pipeline đã đóng gói.
- Extract HOG đúng tham số trong `config_json`.
- Áp dụng `scaler_mean` và `scaler_scale`.
- Tính Logistic Regression, Softmax và trả kết quả.

Không nạp model lại cho mỗi request.

## 3. Contract ảnh đầu vào

Package hiện chấp nhận:

- Grayscale;
- RGB;
- RGBA.

Ảnh sau preprocessing phải có contract:

```text
shape:      (28, 28)
dtype:      float32
range:      [0, 1]
background: tối
digit:      sáng
```

Quy trình tổng quát:

```text
Canvas/Image
→ xử lý alpha nếu là RGBA
→ grayscale
→ chuẩn hóa về [0,1]
→ bảo toàn tỉ lệ ảnh
→ padding thành hình vuông
→ resize 28×28
→ kiểm tra polarity nền tối/nét sáng
```

Không resize trực tiếp một ảnh chữ nhật thành `28×28`, vì thao tác đó làm méo chữ số.

## 4. Vùng vẽ

Nên dùng canvas vuông, ví dụ `448×448` hoặc kích thước tương đương. Kích thước hiển thị không phải kích thước model input.

Yêu cầu tối thiểu:

- Nền đen hoặc tối;
- Nét vẽ trắng hoặc sáng;
- Nét bo tròn;
- Hỗ trợ chuột và thao tác chạm;
- Không cho trình duyệt cuộn trang khi người dùng đang vẽ bằng touch;
- Có nút `Dự đoán` và `Xóa`;
- Không tự gửi request sau từng mouse event.

Nên giữ một canvas nguồn duy nhất. Ảnh gửi inference phải được xuất từ chính canvas đang hiển thị, tránh duy trì hai bản vẽ có thể lệch nhau.

## 5. API inference đề xuất

Endpoint tối thiểu:

```http
POST /api/predict
Content-Type: multipart/form-data
```

Request:

```text
image: file PNG lấy từ canvas
```

Response thành công:

```json
{
  "prediction": 7,
  "confidence": 0.98,
  "probabilities": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.98, 0.01, 0.0, 0.01]
}
```

Response lỗi:

```json
{
  "error": "invalid_image",
  "message": "Ảnh không hợp lệ hoặc chưa có nét vẽ."
}
```

Frontend không nên phụ thuộc vào thứ tự key JSON. `probabilities[i]` tương ứng với class label `i` khi API giữ classes `0–9`; tốt hơn, API có thể trả thêm `classes` nếu muốn contract độc lập với thứ tự lớp.

## 6. Luồng giao diện

```text
Người dùng vẽ
→ nhấn Dự đoán
→ frontend kiểm tra canvas không rỗng
→ khóa tạm nút Dự đoán
→ xuất PNG
→ POST /api/predict
→ nhận prediction/confidence/probabilities
→ hiển thị kết quả
→ mở lại nút Dự đoán
```

Trong khi chờ:

- Hiển thị trạng thái `Đang nhận dạng...`;
- Chặn gửi nhiều request trùng nhau;
- Không xóa hình người dùng vừa vẽ.

## 7. Hiển thị kết quả

Tối thiểu hiển thị:

```text
Dự đoán: 7
Độ tin cậy: 98.0%
```

Có thể hiển thị thêm Top 3:

```text
7: 98.0%
1: 1.2%
9: 0.8%
```

Không nên dùng confidence như bằng chứng model chắc chắn đúng. Khi confidence thấp, frontend có thể hiển thị thông báo trung lập:

```text
Model chưa chắc chắn. Hãy viết lại chữ số rõ hơn.
```

Ngưỡng cảnh báo chỉ là quy tắc UI; không được thay đổi prediction của model.

## 8. Trạng thái và lỗi cần xử lý

Frontend cần xử lý các trường hợp:

- Canvas chưa có nét vẽ;
- Request đang chạy;
- Mất kết nối;
- API trả lỗi;
- Response thiếu `prediction` hoặc `probabilities`;
- Ảnh quá lớn hoặc sai định dạng;
- Model service chưa sẵn sàng.

Không hiển thị traceback hoặc đường dẫn hệ thống cho người dùng cuối.

## 9. Debug cần thiết

Trong chế độ development, nên có tùy chọn xem:

1. Canvas gốc;
2. Exact ảnh `28×28` sau preprocessing;
3. Shape, dtype và range của model input;
4. HOG feature count;
5. Top probabilities.

Model package hiện có HOG feature count `1728`. Nếu inference tạo số feature khác, phải từ chối dự đoán thay vì resize hoặc cắt feature cho khớp.

Debug view không nên bật mặc định ở giao diện production.

## 10. Không nên làm

- Không nhúng logic training vào frontend.
- Không dùng augmentation khi inference.
- Không tự center/crop nét vẽ nếu model contract không yêu cầu.
- Không triển khai lại HOG bằng JavaScript nếu chưa có parity test với Python.
- Không hard-code HOG parameters ngoài package `model.npz`.
- Không fit lại scaler ở runtime.
- Không dùng `scaler.fit_transform()` cho ảnh user; chỉ dùng scaler đã đóng gói.
- Không tải trực tiếp file model cho người dùng nếu không có nhu cầu chạy offline.

## 11. Kiểm thử frontend tối thiểu

Trước khi hoàn thành, kiểm tra:

- Vẽ được bằng mouse và touch;
- Xóa nét và xóa canvas hoạt động;
- Canvas rỗng không gửi request;
- Một lần nhấn chỉ tạo một request;
- Ảnh gửi đi đúng là ảnh đang hiển thị;
- API success hiển thị prediction/confidence đúng;
- API error không làm giao diện treo;
- Exact model input là `28×28`, `float32`, range `[0,1]`;
- Nền tối và nét sáng sau preprocessing;
- HOG có đúng `1728` features;
- Probability hữu hạn, có 10 phần tử và tổng xấp xỉ `1.0`.

## 12. Kiến trúc khuyến nghị

```text
Frontend canvas
      ↓ PNG
Inference API
      ↓
Input preprocessing
      ↓
model.npz
(HOG + scaler + Logistic Regression)
      ↓
JSON result
      ↓
Frontend result view
```

Đây là kiến trúc đơn giản nhất để frontend không phụ thuộc chi tiết model và model có thể được thay thế mà không phải viết lại giao diện.
