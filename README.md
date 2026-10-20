# BIT240015_FoodManager

Ứng dụng giữa kỳ môn Phát triển ứng dụng di động: quản lý món ăn bằng React Native + Expo. Mặc định English theo đề; nhấn nút `VI` để chuyển sang tiếng Việt. Dữ liệu được lưu cục bộ bằng AsyncStorage, vẫn chỉnh sửa được khi offline và tự đồng bộ lên MockAPI khi có mạng.

## Chạy ứng dụng

1. Cài Node.js LTS và Expo Go trên điện thoại (hoặc chuẩn bị Android Emulator).
2. Mở thư mục này trong terminal, chạy `npm install`, sau đó `npm start`.
3. Quét QR bằng Expo Go hoặc nhấn `a` để mở Android Emulator.

## Kiểm tra

- `npm test`: kiểm tra validation form, lưu offline, tạo record khi có mạng lại, và chống trùng khi POST mất phản hồi.
- `npm run test:sync`: kiểm tra trực tiếp với MockAPI bằng một record tạm, sửa record khi sync, rồi xóa record kiểm tra sau khi hoàn tất.

Tên project và tiền tố dữ liệu đã gắn MSSV **BIT240015**: `BIT240015_FoodManager`.

## MockAPI và tiền tố MSSV

Ứng dụng đã nối sẵn với project MockAPI FoodManager bạn gửi: `https://6ad7349995e98f36aef203d5.mockapi.io`. Hai route hiện có là `Dish` và `DishCategory`. Project hiện ở giới hạn resource của gói miễn phí nên không thể thêm route mới có tên tiền tố MSSV; ứng dụng giữ tên route hiện tại và dùng AsyncStorage làm nơi lưu chính với key/table và mọi field nghiệp vụ có tiền tố `BIT240015_`. Khi gửi lên MockAPI, payload cũng dùng field có tiền tố.

Các record cũ do MockAPI tạo mẫu không có `BIT240015_Id`, nên app bỏ qua chúng khi đọc. Lần đầu online, app tạo ba loại món và năm món mẫu đã có trong local nếu chúng chưa tồn tại trên API; các lần chạy sau dùng ID nghiệp vụ ổn định để tránh bản ghi trùng. Thay đổi offline được xếp hàng và gửi tự động khi mạng trở lại. Cấu trúc JSON của một món:

```json
{
  "BIT240015_Id": "stable-app-generated-id",
  "BIT240015_Name": "Beef Pho",
  "BIT240015_Price": 65000,
  "BIT240015_PreparationTime": 20,
  "BIT240015_IsAvailable": true,
  "BIT240015_Description": "Vietnamese beef noodle soup",
  "BIT240015_DishCategoryId": "cat-noodles",
  "BIT240015_DishImage": [
    { "BIT240015_ImageUrl": "https://...", "BIT240015_IsThumbnail": true }
  ]
}
```

Resource `DishCategory` dùng `BIT240015_Id`, `BIT240015_Name`, `BIT240015_Description`. ID nội bộ của MockAPI (`Id`/`id`) chỉ dùng cho URL `PUT`/`DELETE`; ID nghiệp vụ ổn định nằm trong `BIT240015_Id`. Local AsyncStorage keys là `BIT240015_Dish`, `BIT240015_DishCategory`, `BIT240015_Language` và `BIT240015_PendingChanges`.

## Chức năng

- Danh sách, chi tiết, thêm, sửa, xóa món; xác nhận trước khi xóa.
- Tìm theo tên; lọc theo loại, trạng thái đang bán và khoảng giá; sắp xếp theo giá/thời gian.
- Nhiều ảnh theo URL, chọn ảnh đại diện; tối đa một ảnh đại diện cho mỗi món.
- Kiểm tra tên, giá, thời gian, loại món và tên trùng trong cùng loại.
- Phân nhóm Quick (≤15 phút) / Regular.
- English mặc định; chuyển English ↔ Tiếng Việt để đổi nhãn và mô tả bản dịch. Lựa chọn được lưu khi chuyển màn hình hoặc mở lại app.
- Lưu local và hàng đợi đồng bộ tự chạy khi mạng trở lại; lỗi API được báo ngay trên màn hình và không làm mất bản local.

## Checklist video nộp bài

### Video 1 – Demo ứng dụng

1. Mở app, chỉ tên `BIT240015_FoodManager` và mã MSSV trên giao diện.
2. Mở món để trình bày chi tiết, thời gian Quick/Regular, trạng thái và nhiều ảnh; đổi ảnh đại diện.
3. Thêm món mới, chọn loại món, nhập giá/thời gian và hai URL ảnh; lưu, mở lại và sửa món.
4. Tìm một phần tên, lọc loại món + đang bán + khoảng giá, đổi từng kiểu sắp xếp; mở chi tiết rồi quay lại để cho thấy bộ lọc còn giữ.
5. Chuyển English ↔ Tiếng Việt, xóa một món và xác nhận.
6. Nếu demo nâng cao: tắt mạng, sửa món; bật lại, đợi trạng thái đồng bộ xong rồi mở resource `Dish` để chỉ các field `BIT240015_*`.

### Video 2 – Thuyết minh mã nguồn

Gợi ý lời trình bày: “Project dùng React Native và Expo. `SID` là BIT240015; `KEYS` lưu món, loại món, ngôn ngữ và hàng đợi offline bằng các khóa có tiền tố MSSV. Mỗi món có ID, tên, giá, thời gian chế biến, trạng thái, mô tả tiếng Việt, mô tả tiếng Anh, ID loại món và danh sách ảnh; quan hệ món–loại được giữ qua `BIT240015_DishCategoryId`. Hàm `saveDish` kiểm tra tên, giá, thời gian, loại hợp lệ và tên trùng trong cùng loại; danh sách hỗ trợ tìm kiếm, lọc đồng thời và sắp xếp. AsyncStorage giữ dữ liệu để app vẫn dùng offline. NetInfo phát hiện mạng; các thay đổi được đưa vào hàng đợi rồi tự gửi lên MockAPI khi có mạng. ID nghiệp vụ ổn định `BIT240015_Id` giúp cập nhật lại đúng record và tránh tạo trùng; ID nội bộ MockAPI chỉ dùng cho URL cập nhật/xóa. App mặc định English; nút ngôn ngữ đổi nhãn và hiển thị mô tả bản dịch.”

Trong lúc nói, mở `App.js` và chỉ lần lượt `SID`/`KEYS`, hai model seed, `fromRemoteDish`/`toRemote`, kiểm tra trong `saveDish`, lọc/sắp xếp, hàng đợi và listener NetInfo. Sau đó mở `README.md` để nêu hai route MockAPI được cung cấp. Quay màn hình trực tiếp trên máy thật hoặc emulator; lưu hai video riêng theo thời hạn trên LMS.
