export const HTTP_MESSAGE_TITLES = {
    //NOTE -  1xx - Thông tin, request đã được nhận và đang tiếp tục xử lý

    /**
     * Request ban đầu hợp lệ, client có thể tiếp tục gửi phần dữ liệu còn lại.
     * Thường gặp khi upload dữ liệu lớn.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7231#section-6.2.1
     */
    CONTINUE: 'Continue',

    /**
     * Server chấp nhận chuyển sang một giao thức khác theo yêu cầu của client.
     * Ví dụ: nâng cấp từ HTTP sang WebSocket.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7231#section-6.2.2
     */
    SWITCHING_PROTOCOLS: 'Switching Protocols',

    /**
     * Server đã nhận request và đang xử lý, nhưng chưa có kết quả cuối cùng.
     * Phù hợp với các tác vụ tốn thời gian hoặc xử lý theo lô.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc2518#section-10.1
     */
    PROCESSING: 'Processing',

    //NOTE - 2xx - Thành công

    /**
     * Request thành công.
     * Đây là message phổ biến nhất khi lấy dữ liệu hoặc xử lý xong bình thường.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7231#section-6.3.1
     */
    OK: 'OK',

    /**
     * Tạo mới tài nguyên thành công.
     * Thường dùng sau khi tạo bản ghi mới bằng POST hoặc PUT.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7231#section-6.3.2
     */
    CREATED: 'Created',

    /**
     * Server đã nhận request nhưng sẽ xử lý sau.
     * Thường dùng cho job nền, queue hoặc tác vụ bất đồng bộ.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7231#section-6.3.3
     */
    ACCEPTED: 'Accepted',

    /**
     * Request thành công nhưng thông tin trả về không hoàn toàn đến từ nguồn gốc chính.
     * Thường là dữ liệu lấy từ cache hoặc bản sao trung gian.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7231#section-6.3.4
     */
    NON_AUTHORITATIVE_INFORMATION: 'Non Authoritative Information',

    /**
     * Request thành công nhưng không có nội dung trả về.
     * Thường dùng cho thao tác xóa hoặc cập nhật không cần trả data.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7231#section-6.3.5
     */
    NO_CONTENT: 'No Content',

    /**
     * Request thành công và client nên reset lại form hoặc màn hình hiện tại.
     * Ít dùng trong API thuần JSON, nhưng vẫn là mã chuẩn HTTP.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7231#section-6.3.6
     */
    RESET_CONTENT: 'Reset Content',

    /**
     * Server chỉ trả về một phần nội dung theo phạm vi client yêu cầu.
     * Thường gặp khi tải file theo từng đoạn.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7233#section-4.1
     */
    PARTIAL_CONTENT: 'Partial Content',

    /**
     * Một response chứa nhiều trạng thái cho nhiều tài nguyên khác nhau.
     * Chủ yếu xuất hiện trong các tình huống thao tác theo lô hoặc WebDAV.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc2518#section-10.2
     */
    MULTI_STATUS: 'Multi-Status',

    //NOTE - 3xx - Chuyển hướng

    /**
     * Tài nguyên có nhiều lựa chọn phản hồi hoặc nhiều đích đến khác nhau.
     * Client hoặc người dùng cần chọn một phương án phù hợp.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7231#section-6.4.1
     */
    MULTIPLE_CHOICES: 'Multiple Choices',

    /**
     * Tài nguyên đã được chuyển vĩnh viễn sang URI mới.
     * Client nên dùng URI mới cho các lần gọi sau.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7231#section-6.4.2
     */
    MOVED_PERMANENTLY: 'Moved Permanently',

    /**
     * Tài nguyên tạm thời được chuyển sang URI khác.
     * Những lần gọi sau vẫn có thể tiếp tục dùng URI cũ.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7231#section-6.4.3
     */
    MOVED_TEMPORARILY: 'Moved Temporarily',

    /**
     * Client nên lấy tài nguyên ở URI khác bằng phương thức GET.
     * Hay dùng sau một thao tác POST để điều hướng sang trang kết quả.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7231#section-6.4.4
     */
    SEE_OTHER: 'See Other',

    /**
     * Tài nguyên chưa thay đổi so với bản cache của client.
     * Client có thể tiếp tục dùng dữ liệu đang lưu.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7232#section-4.1
     */
    NOT_MODIFIED: 'Not Modified',

    /**
     * Tài nguyên đã chuyển vĩnh viễn sang URI khác và phải giữ nguyên HTTP method.
     * Ví dụ: POST vẫn phải là POST sau khi redirect.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7538#section-3
     */
    PERMANENT_REDIRECT: 'Permanent Redirect',

    /**
     * Tài nguyên tạm thời chuyển sang URI khác nhưng phải giữ nguyên HTTP method.
     * Khác với 302 ở chỗ client không được tự đổi method.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7231#section-6.4.7
     */
    TEMPORARY_REDIRECT: 'Temporary Redirect',

    //NOTE - 4xx - Lỗi từ phía client

    /**
     * Request không hợp lệ về cú pháp hoặc dữ liệu đầu vào.
     * Ví dụ: thiếu field bắt buộc, sai định dạng JSON, query param không hợp lệ.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7231#section-6.5.1
     */
    BAD_REQUEST: 'Bad Request',

    /**
     * Mã này được dành sẵn cho các hệ thống thanh toán nhưng hiện ít được sử dụng thực tế.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7231#section-6.5.2
     */
    PAYMENT_REQUIRED: 'Payment Required',

    /**
     * Client chưa được xác thực.
     * Ví dụ: thiếu token, token hết hạn hoặc token không hợp lệ.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7235#section-3.1
     */
    UNAUTHORIZED: 'Unauthorized',

    /**
     * Client đã được nhận diện nhưng không có quyền truy cập tài nguyên.
     * Ví dụ: user thường gọi endpoint chỉ dành cho admin.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7231#section-6.5.3
     */
    FORBIDDEN: 'Forbidden',

    /**
     * Không tìm thấy tài nguyên hoặc endpoint tương ứng.
     * Có thể là URL sai hoặc bản ghi không tồn tại.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7231#section-6.5.4
     */
    NOT_FOUND: 'Not Found',

    /**
     * Endpoint tồn tại nhưng không hỗ trợ HTTP method đang dùng.
     * Ví dụ: gọi DELETE vào API chỉ cho phép GET.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7231#section-6.5.5
     */
    METHOD_NOT_ALLOWED: 'Method Not Allowed',

    /**
     * Server không thể trả dữ liệu theo định dạng mà client yêu cầu.
     * Ví dụ: client chỉ chấp nhận XML nhưng server chỉ hỗ trợ JSON.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7231#section-6.5.6
     */
    NOT_ACCEPTABLE: 'Not Acceptable',

    /**
     * Client cần xác thực thông qua proxy trước khi request được xử lý.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7235#section-3.2
     */
    PROXY_AUTHENTICATION_REQUIRED: 'Proxy Authentication Required',

    /**
     * Server chờ request quá lâu và chủ động đóng kết nối.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7231#section-6.5.7
     */
    REQUEST_TIMEOUT: 'Request Timeout',

    /**
     * Request xung đột với trạng thái hiện tại của tài nguyên.
     * Ví dụ: tạo dữ liệu trùng khóa duy nhất hoặc cập nhật sai version.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7231#section-6.5.8
     */
    CONFLICT: 'Conflict',

    /**
     * Tài nguyên từng tồn tại nhưng đã bị xóa vĩnh viễn.
     * Khác với 404 ở chỗ server biết chắc tài nguyên đã không còn nữa.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7231#section-6.5.9
     */
    GONE: 'Gone',

    /**
     * Server yêu cầu header Content-Length nhưng client không gửi.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7231#section-6.5.10
     */
    LENGTH_REQUIRED: 'Length Required',

    /**
     * Nội dung request vượt quá giới hạn server cho phép.
     * Thường gặp khi upload file hoặc gửi body quá lớn.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7231#section-6.5.11
     */
    REQUEST_TOO_LONG: 'Request Entity Too Large',

    /**
     * URI hoặc URL quá dài để server có thể xử lý.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7231#section-6.5.12
     */
    REQUEST_URI_TOO_LONG: 'Request-URI Too Long',

    /**
     * Kiểu dữ liệu gửi lên không được server hỗ trợ.
     * Ví dụ: gửi XML trong khi API chỉ chấp nhận application/json.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7231#section-6.5.13
     */
    UNSUPPORTED_MEDIA_TYPE: 'Unsupported Media Type',

    /**
     * Server không thể đáp ứng điều kiện trong header Expect của client.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7231#section-6.5.14
     */
    EXPECTATION_FAILED: 'Expectation Failed',

    /**
     * Mã 418 mang tính hài hước trong chuẩn HTTP mở rộng.
     * Hầu như không dùng trong nghiệp vụ thật, chủ yếu để test hoặc minh họa.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc2324#section-2.3.2
     */
    IM_A_TEAPOT: "I'm a teapot",

    /**
     * Request đúng cú pháp nhưng sai về mặt nghiệp vụ hoặc ngữ nghĩa.
     * Ví dụ: dữ liệu qua validate cơ bản nhưng vi phạm rule domain.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc2518#section-10.3
     */
    UNPROCESSABLE_ENTITY: 'Unprocessable Entity',

    /**
     * Tài nguyên đang bị khóa nên chưa thể thao tác.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc2518#section-10.4
     */
    LOCKED: 'Locked',

    /**
     * Request hiện tại thất bại vì phụ thuộc vào một request trước đó cũng thất bại.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc2518#section-10.5
     */
    FAILED_DEPENDENCY: 'Failed Dependency',

    /**
     * Điều kiện tiền đề trong request không thỏa mãn.
     * Ví dụ: If-Match không khớp với version hiện tại của tài nguyên.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7232#section-4.2
     */
    PRECONDITION_FAILED: 'Precondition Failed',

    /**
     * Server yêu cầu request phải có điều kiện ràng buộc để tránh ghi đè dữ liệu ngoài ý muốn.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc6585#section-3
     */
    PRECONDITION_REQUIRED: 'Precondition Required',

    /**
     * Client gửi quá nhiều request trong một khoảng thời gian.
     * Thường dùng cho cơ chế rate limit.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc6585#section-4
     */
    TOO_MANY_REQUESTS: 'Too Many Requests',

    /**
     * Header của request quá lớn nên server từ chối xử lý.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc6585#section-5
     */
    REQUEST_HEADER_FIELDS_TOO_LARGE: 'Request Header Fields Too Large',

    /**
     * Client yêu cầu một khoảng dữ liệu không hợp lệ hoặc vượt ngoài kích thước tài nguyên.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7233#section-4.4
     */
    REQUESTED_RANGE_NOT_SATISFIABLE: 'Requested Range Not Satisfiable',

    /**
     * Client cần xác thực để truy cập mạng.
     * Thường gặp ở captive portal thay vì trong API nghiệp vụ.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc6585#section-6
     */
    NETWORK_AUTHENTICATION_REQUIRED: 'Network Authentication Required',

    /**
     * Tài nguyên không thể được cung cấp vì lý do pháp lý.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7725
     */
    UNAVAILABLE_FOR_LEGAL_REASONS: 'Unavailable For Legal Reasons',

    /**
     * Request được gửi tới sai server đích cho cặp scheme/authority hiện tại.
     * Chủ yếu liên quan đến HTTP/2 và hạ tầng reverse proxy.
     *
     * Tài liệu: https://datatracker.ietf.org/doc/html/rfc7540#section-9.1.2
     */
    MISDIRECTED_REQUEST: 'Misdirected Request',

    /**
     * @deprecated
     * Mã cũ từng dùng để chỉ client phải truy cập thông qua proxy.
     * Hiện không nên dùng vì đã bị loại bỏ khỏi thực tiễn do vấn đề bảo mật.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7231#section-6.4.6
     */
    USE_PROXY: 'Use Proxy',

    /**
     * @deprecated
     * Một response cũ từng được một số framework dùng nội bộ khi method thất bại.
     * Không nên sử dụng trong code mới.
     *
     * Tài liệu: https://tools.ietf.org/rfcdiff?difftype=--hwdiff&url2=draft-ietf-webdav-protocol-06.txt
     */
    METHOD_FAILURE: 'Method Failure',

    //NOTE - 5xx - Lỗi từ phía server

    /**
     * Lỗi nội bộ chung của server khi xảy ra exception hoặc trạng thái ngoài dự kiến.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7231#section-6.6.1
     */
    INTERNAL_SERVER_ERROR: 'Internal Server Error',

    /**
     * Server chưa hỗ trợ chức năng hoặc HTTP method được yêu cầu.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7231#section-6.6.2
     */
    NOT_IMPLEMENTED: 'Not Implemented',

    /**
     * Server đang đóng vai trò gateway nhưng nhận được phản hồi không hợp lệ từ upstream.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7231#section-6.6.3
     */
    BAD_GATEWAY: 'Bad Gateway',

    /**
     * Server tạm thời không thể xử lý request do quá tải hoặc đang bảo trì.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7231#section-6.6.4
     */
    SERVICE_UNAVAILABLE: 'Service Unavailable',

    /**
     * Gateway hoặc proxy chờ upstream quá lâu nên hết thời gian.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7231#section-6.6.5
     */
    GATEWAY_TIMEOUT: 'Gateway Timeout',

    /**
     * Phiên bản HTTP mà client sử dụng không được server hỗ trợ.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc7231#section-6.6.6
     */
    HTTP_VERSION_NOT_SUPPORTED: 'HTTP Version Not Supported',

    /**
     * Server không đủ tài nguyên lưu trữ để hoàn tất request hiện tại.
     * Thường mang tính tạm thời.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc2518#section-10.6
     */
    INSUFFICIENT_SPACE_ON_RESOURCE: 'Insufficient Space on Resource',

    /**
     * Server không thể lưu trữ representation cần thiết để hoàn tất request.
     * Thường liên quan đến dung lượng hoặc cấu hình lưu trữ.
     *
     * Tài liệu: https://tools.ietf.org/html/rfc2518#section-10.6
     */
    INSUFFICIENT_STORAGE: 'Insufficient Storage'
} as const
