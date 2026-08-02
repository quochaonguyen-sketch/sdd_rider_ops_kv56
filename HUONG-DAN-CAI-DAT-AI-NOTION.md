# Hướng dẫn kết nối Rider Ops AI trên nhiều máy

## Mục đích

Mỗi máy tính có thể kết nối chatbox Rider Ops tới một máy chủ Ollama bằng cách nhập URL trong trang **Cài đặt**. Cấu hình được lưu riêng trong trình duyệt của từng máy.

## 1. Chuẩn bị máy chủ AI

1. Cài Ollama trên máy dùng làm máy chủ AI.
2. Tải model được sử dụng, ví dụ:

```bash
ollama pull qwen3:4b-instruct
```

3. Cho Ollama lắng nghe kết nối từ mạng LAN. Trên Windows PowerShell, đặt biến môi trường `OLLAMA_HOST=0.0.0.0:11434`, sau đó khởi động lại Ollama.
4. Cho phép cổng TCP `11434` trong Windows Firewall cho mạng riêng (Private network).
5. Đặt IP LAN cố định cho máy chủ, ví dụ `192.168.1.50`.

> Không mở trực tiếp cổng Ollama ra Internet. Nếu các máy không cùng mạng LAN, hãy kết nối qua VPN hoặc đặt reverse proxy HTTPS có xác thực.

## 2. Kiểm tra từ máy khác

Mở trình duyệt trên máy cần sử dụng và truy cập:

```text
http://192.168.1.50:11434/api/tags
```

Nếu thấy danh sách model dạng JSON thì kết nối mạng đã hoạt động.

## 3. Cấu hình trong Rider Ops

1. Đăng nhập Rider Ops trên máy cần sử dụng.
2. Mở **Cài đặt → Kết nối AI cho máy này**.
3. Nhập **URL máy chủ AI**, ví dụ `http://192.168.1.50:11434`.
4. Nhập tên model chính xác, ví dụ `qwen3:4b-instruct`.
5. Chọn **Kiểm tra kết nối**.
6. Khi kết nối thành công, chọn **Lưu cho máy này**.
7. Mở chatbox **Rider Ops AI** và gửi câu hỏi thử.

Lặp lại các bước trên ở từng máy. URL được lưu trong `localStorage` của trình duyệt nên trình duyệt khác hoặc chế độ ẩn danh phải cấu hình lại.

## 4. Dùng cấu hình mặc định

Để URL trống và lưu lại nếu muốn website sử dụng biến môi trường trên máy chủ ứng dụng:

```env
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_CHAT_MODEL=qwen3:4b-instruct
```

Sau khi thay đổi biến môi trường, cần khởi động lại ứng dụng Rider Ops.

## 5. Xử lý lỗi thường gặp

| Lỗi | Cách kiểm tra |
| --- | --- |
| Không kết nối được máy chủ AI | Kiểm tra IP, Ollama đang chạy, VPN/LAN và firewall cổng 11434 |
| Kết nối được nhưng không tìm thấy model | Chạy `ollama list`, sau đó nhập đúng tên model hoặc dùng `ollama pull <tên-model>` |
| Máy khác truy cập không được | Kiểm tra Ollama có lắng nghe trên `0.0.0.0:11434` và mạng Windows đang ở chế độ Private |
| Chat phản hồi quá lâu | Kiểm tra RAM/GPU máy chủ hoặc dùng model nhỏ hơn |
| Đã lưu nhưng chat vẫn dùng cấu hình cũ | Tải lại trang và kiểm tra lại phần Cài đặt |

## 6. Import tài liệu này vào Notion

1. Tải hoặc sao chép file `HUONG-DAN-CAI-DAT-AI-NOTION.md` về máy.
2. Trong Notion, mở trang đích.
3. Chọn menu **••• → Import** hoặc mở **Settings → Import**.
4. Chọn **Text & Markdown**.
5. Chọn file Markdown này.
6. Kiểm tra lại bảng, tiêu đề và các khối mã sau khi import.

## Lưu ý bảo mật

- Không nhập API key, tên người dùng hoặc mật khẩu trực tiếp trong URL.
- Chỉ cấp quyền truy cập máy chủ AI qua LAN/VPN cho những máy cần thiết.
- Chatbox đi qua backend Rider Ops để giữ nguyên xác thực người dùng và khả năng đọc dữ liệu Supabase đã được giới hạn.
