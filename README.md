# InkRecall

Ứng dụng ôn tập **ghi chú viết tay từ Samsung Notes** bằng phương pháp **lặp lại ngắt quãng** (spaced repetition).
Nhập ghi chú dạng PDF/ảnh → ứng dụng tự tách từng đoạn chữ thành thẻ → mỗi ngày ôn đúng những thẻ sắp quên.

Chạy hoàn toàn trên trình duyệt (PWA, offline được), **không có máy chủ** — mọi dữ liệu nằm trong IndexedDB của thiết bị.

## Tính năng

| | |
|---|---|
| **Nhập từ Samsung Notes** | PDF hoặc ảnh (PNG/JPG/WebP). Ghi chú một trang rất dài được tự cắt thành nhiều trang tại khoảng trắng giữa các dòng. Khi đã cài lên màn hình chính, InkRecall xuất hiện ngay trong bảng **Chia sẻ** của Samsung Notes (Web Share Target). |
| **Tự tạo thẻ** | Thuật toán tách vùng tìm các dòng/đoạn/khối chữ viết tay (bỏ qua dòng kẻ của mẫu giấy, hỗ trợ nền tối, ghi chú hai cột). Có thể khoanh vùng thủ công bằng chuột, ngón tay hoặc S Pen. |
| **Ôn kiểu che – nhớ – lật** | Mỗi thẻ là một vùng bị che trên trang; bạn tự nhớ lại rồi chấm *Quên / Khó / Được / Dễ*. Mỗi nút hiện sẵn khoảng hẹn kế tiếp. Có hoàn tác, phím tắt (`Space`, `1`–`4`, `Z`, `F`). |
| **Lịch FSRS** | Dùng thuật toán FSRS (thế hệ sau của SM-2, qua thư viện `ts-fsrs`), mức ghi nhớ mong muốn chỉnh được 80–95%. Giới hạn thẻ mới mỗi ngày, giờ chuyển ngày tuỳ chọn (mặc định 4h sáng). |
| **Heatmap & thống kê** | Lịch nhiệt 12 tháng / theo năm, chi tiết từng ngày, dự báo thẻ đến hạn 30 ngày, phân bố trạng thái thẻ, cách chấm, lịch nhiệt giờ học trong tuần, bảng theo ghi chú. *Bản đồ ghi nhớ* tô màu từng vùng trên trang theo xác suất còn nhớ. |
| **Quản lý chuỗi** | Chuỗi ngày liên tiếp, kỷ lục, lịch 5 tuần, cột mốc, lịch sử các chuỗi. **Lá chắn chuỗi**: nhận 1 lá mỗi 7 ngày, tự dùng khi lỡ một ngày (chỉ khi đủ che hết khoảng nghỉ), có thể tắt tự động và dùng thủ công. |
| **Nhật ký rõ ràng** | Mọi sự kiện (nhập, tạo/xoá thẻ, từng lượt chấm, chuỗi, sao lưu, cài đặt, lỗi chưa xử lý) được ghi có cấu trúc với mức, nhóm, mã phiên và dữ liệu kèm theo. Lọc, tìm kiếm, xuất JSON/CSV. Nhật ký lượt ôn riêng, xuất CSV. |
| **Trợ lý AI** | Nối khoá API của **Claude, ChatGPT, Gemini hoặc DeepSeek**: AI đọc chữ viết tay của từng trang, đặt câu hỏi cho mỗi vùng che, viết thêm thẻ hỏi–đáp tổng hợp và tóm tắt ôn tập. Có thể tự chạy ngay sau khi nhập. |
| **Tự nhập từ thư mục** | Chọn một thư mục chứa tệp xuất từ Samsung Notes; ứng dụng tự quét khi mở và chỉ nhập tệp mới. |
| **Sao lưu** | Xuất/nhập toàn bộ dữ liệu thành một tệp `.zip` (không chứa khoá API). |

## Chạy

```bash
npm install
npm run dev        # phát triển: http://localhost:5173
npm test           # 73 test đơn vị + tích hợp (Vitest)
npm run build      # kiểm tra kiểu + build ra dist/
npm run preview    # chạy thử bản build (có service worker, offline)
```

`dist/` là site tĩnh, triển khai được lên bất kỳ dịch vụ nào (Vercel, Netlify, Cloudflare Pages, GitHub Pages…).
Dùng `base: './'` và `HashRouter` nên chạy được ở mọi đường dẫn con. Cần **HTTPS** (hoặc `localhost`) để service worker và chia sẻ từ Samsung Notes hoạt động.

Muốn xem thử nhanh: **Cài đặt → Dữ liệu mẫu → Tạo mẫu** (3 ghi chú giả lập và ~4 tháng lịch sử ôn).

## Đưa ghi chú từ Samsung Notes vào

1. Mở ghi chú → ⋮ → **Chia sẻ** (hoặc **Lưu dưới dạng tệp**) → **Tệp PDF** hoặc **Tệp hình ảnh**.
2. Chọn **InkRecall** trong bảng chia sẻ (nếu đã cài PWA), hoặc lưu tệp rồi chọn trong màn hình **Ghi chú**.

> Định dạng gốc `.sdocx` của Samsung Notes là định dạng đóng nên không đọc trực tiếp; PDF/ảnh giữ nguyên nét bút.

### Tự động nhập

Samsung Notes **không có API công khai** (và đồng bộ sang OneNote đã bị bỏ trên One UI 9), nên không ứng dụng bên ngoài nào tự kéo ghi chú về được. Cách tự động gần nhất:

1. Trong Samsung Notes, chọn nhiều ghi chú → **Lưu dưới dạng tệp** → PDF hoặc ảnh → lưu vào một thư mục cố định.
2. Trong InkRecall: **Ghi chú → Tự nhập từ thư mục → Chọn thư mục theo dõi**.
3. Từ đó mỗi lần mở ứng dụng, tệp mới trong thư mục được tự nhập (và tự chạy AI nếu đã bật).

Ghi nhớ thư mục cần trình duyệt hỗ trợ File System Access API (Chrome/Edge trên máy tính; Chrome Android bản mới). Trình duyệt khác vẫn quét được nhưng phải chọn lại thư mục mỗi lần.

## Trợ lý AI

Vào **Cài đặt → Trợ lý AI**, chọn nhà cung cấp, dán khoá API và bấm **Kiểm tra**.

| Nhà cung cấp | Model mặc định | Cách gọi |
|---|---|---|
| Claude (Anthropic) | `claude-opus-5-5` | SDK chính thức `@anthropic-ai/sdk`, structured outputs |
| ChatGPT (OpenAI) | `gpt-6.2-sol` | Chat Completions, JSON mode |
| Gemini (Google) | `gemini-3.6-flash` | `generateContent`, JSON mode |
| DeepSeek | `deepseek-flash` | Chat Completions, JSON mode |

Tên model đổi thường xuyên: nút **Kiểm tra** tải danh sách model mà tài khoản của bạn dùng được, và ô Model nhận bất kỳ tên nào.

Với mỗi trang, ứng dụng vẽ khung đánh số quanh từng vùng thẻ rồi gửi **một** yêu cầu kèm ảnh. AI trả về: chữ đọc được và câu hỏi cho từng vùng (hoặc đánh dấu bỏ qua với tiêu đề, chữ không đọc được), các câu hỏi tổng hợp, và tóm tắt trang. Kết quả luôn được kiểm lại theo lược đồ trước khi ghi; câu hỏi bạn tự sửa không bị ghi đè khi chạy lại.

**Riêng tư và chi phí**

- Không có máy chủ trung gian: ảnh trang đi thẳng từ trình duyệt tới nhà cung cấp bạn chọn, tính phí theo tài khoản của bạn.
- Khoá API chỉ lưu trong IndexedDB của thiết bị, không nằm trong tệp sao lưu, và bị che nếu lỡ xuất hiện trong thông báo lỗi ghi vào nhật ký.
- Ai dùng chung thiết bị/trình duyệt đều có thể dùng khoá đã lưu — đừng nhập khoá trên máy công cộng.

## Cấu trúc mã

```
src/
  lib/
    scheduler.ts      lớp bọc FSRS: chấm thẻ, xem trước khoảng hẹn, xác suất còn nhớ
    queue.ts          xếp hàng ôn: đang học → ôn tập → thẻ mới (thuần, có test)
    review.ts         chấm / hoàn tác trong một transaction, cập nhật thống kê ngày + chuỗi
    streak.ts         tính chuỗi, lịch sử chuỗi, quyết định dùng lá chắn (thuần, có test)
    streakService.ts  đối soát chuỗi khi mở app / sang ngày mới
    heatmap.ts        dựng lưới lịch nhiệt, ngưỡng theo tứ phân vị (thuần, có test)
    segment.ts        tách vùng chữ viết tay, tìm chỗ cắt trang dài (thuần, có test)
    importer.ts       PDF (pdf.js) / ảnh → trang → thẻ; hộp thư chia sẻ
    watch.ts          thư mục theo dõi: quét, bỏ qua tệp đã nhập, gom ảnh nhiều trang
    ai/providers.ts   bốn bộ nối: Claude (SDK), ChatGPT + DeepSeek (Chat Completions), Gemini
    ai/schema.ts      lược đồ kết quả (zod), lời nhắc, phân loại lỗi
    ai/study.ts       vẽ khung đánh số, gọi AI, ghi câu hỏi/thẻ/tóm tắt, hàng đợi có thử lại
    logger.ts         nhật ký có cấu trúc, ghi theo lô vào IndexedDB, tự cắt bớt
    backup.ts         xuất / nhập .zip
    db.ts, types.ts   lược đồ Dexie (IndexedDB) và kiểu dữ liệu
  components/         Heatmap, PageView (che vùng), Layout, ui (toast, hộp xác nhận…)
  pages/              Hôm nay, Ghi chú, Sửa vùng thẻ, Ôn tập, Thống kê, Chuỗi, Nhật ký, Cài đặt
  sw.template.js      service worker: precache + nhận tệp chia sẻ
```

## Quy tắc chuỗi

- Một ngày **được tính** khi số lượt ôn ≥ mục tiêu ngày, **hoặc** bạn đã ôn hết mọi thẻ đến hạn hôm đó.
- Ngày dùng lá chắn nối chuỗi nhưng không cộng vào độ dài chuỗi.
- Lá chắn không bị tiêu nếu khoảng nghỉ dài hơn số lá đang có (chuỗi đằng nào cũng đứt).
- Ôn trước giờ chuyển ngày (mặc định 4:00) vẫn tính cho ngày hôm trước.
