export const HTTP_MESSAGE_TITLES = {
    //NOTE -  1xx - Thông tin, request đã được nhận và đang tiếp tục xử lý

    /**
     * Request ban đầu hợp lệ, client có thể tiếp tục gửi phần dữ liệu còn lại.
     * Thường gặp khi upload dữ liệu lớn.
     */
    //NOTE - 100
    CONTINUE: 'Continue',

    /**
     * Server chấp nhận chuyển sang một giao thức khác theo yêu cầu của client.
     * Ví dụ: nâng cấp từ HTTP sang WebSocket.
     */
    //NOTE - 101
    SWITCHING_PROTOCOLS: 'Switching Protocols',
    /**
     * Server đã nhận request và đang xử lý, nhưng chưa có kết quả cuối cùng.
     * Phù hợp với các tác vụ tốn thời gian hoặc xử lý theo lô.
     */
    //NOTE - 102
    PROCESSING: 'Processing',
    /**
     * Server gửi một số header sớm trước khi response cuối cùng sẵn sàng.
     * Giúp client preload tài nguyên (CSS, JS) để tăng tốc tải trang.
     */
    //NOTE - 103
    EARLYHINTS: 'Early Hints',

    //NOTE - 2xx - Thành công

    /**
     * Request thành công.
     * Đây là message phổ biến nhất khi lấy dữ liệu hoặc xử lý xong bình thường.
     */
    //NOTE - 200
    OK: 'OK',

    /**
     * Tạo mới tài nguyên thành công.
     * Thường dùng sau khi tạo bản ghi mới bằng POST hoặc PUT.
     */
    //NOTE - 201
    CREATED: 'Created',

    /**
     * Server đã nhận request nhưng sẽ xử lý sau.
     * Thường dùng cho job nền, queue hoặc tác vụ bất đồng bộ.
     */
    //NOTE - 202
    ACCEPTED: 'Accepted',

    /**
     * Request thành công nhưng thông tin trả về không hoàn toàn đến từ nguồn gốc chính.
     * Thường là dữ liệu lấy từ cache hoặc bản sao trung gian.
     */
    //NOTE - 203
    NON_AUTHORITATIVE_INFORMATION: 'Non Authoritative Information',

    /**
     * Request thành công nhưng không có nội dung trả về.
     * Thường dùng cho thao tác xóa hoặc cập nhật không cần trả data.
     */
    //NOTE - 204
    NO_CONTENT: 'No Content',

    /**
     * Request thành công và client nên reset lại form hoặc màn hình hiện tại.
     * Ít dùng trong API thuần JSON, nhưng vẫn là mã chuẩn HTTP.
     */
    //NOTE - 205
    RESET_CONTENT: 'Reset Content',

    /**
     * Server chỉ trả về một phần nội dung theo phạm vi client yêu cầu.
     * Thường gặp khi tải file theo từng đoạn.
     */
    //NOTE - 206
    PARTIAL_CONTENT: 'Partial Content',

    /**
     * Một response chứa nhiều trạng thái cho nhiều tài nguyên khác nhau.
     * Chủ yếu xuất hiện trong các tình huống thao tác theo lô hoặc WebDAV.
     */
    //NOTE - 207
    MULTI_STATUS: 'Multi-Status',

    /**
     * Các thành phần con của thao tác DAV đã được báo cáo trước đó và sẽ không được lặp lại.
     * Tránh liệt kê trùng lặp tài nguyên trong response multistatus.
     */
    //NOTE - 208
    ALREADY_REPORTED: 'Already Reported',

    /**
     * Server đã hoàn thành request GET nhưng response là kết quả của một hoặc nhiều instance-manipulation
     * được áp dụng lên tài nguyên gốc.
     */
    //NOTE - 210
    CONTENT_DIFFERENT: 'Content Different',

    //NOTE - 3xx - Chuyển hướng

    /**
     * Tài nguyên có nhiều lựa chọn phản hồi hoặc nhiều đích đến khác nhau.
     * Client hoặc người dùng cần chọn một phương án phù hợp.
     */
    //NOTE - 300
    MULTIPLE_CHOICES: 'Multiple Choices',

    /**
     * Tài nguyên có nhiều lựa chọn phản hồi hoặc nhiều đích đến khác nhau.
     * Alias của MULTIPLE_CHOICES theo NestJS HttpStatus enum.
     */
    //NOTE - 300
    AMBIGUOUS: 'Ambiguous',

    /**
     * Tài nguyên đã được chuyển vĩnh viễn sang URI mới.
     * Client nên dùng URI mới cho các lần gọi sau.
     */
    //NOTE - 301
    MOVED_PERMANENTLY: 'Moved Permanently',

    /**
     * Tài nguyên tạm thời được chuyển sang URI khác.
     * Những lần gọi sau vẫn có thể tiếp tục dùng URI cũ.
     */
    //NOTE - 302
    MOVED_TEMPORARILY: 'Moved Temporarily',

    /**
     * Tài nguyên tạm thời được chuyển sang URI khác.
     * Alias của MOVED_TEMPORARILY theo NestJS HttpStatus enum.
     */
    //NOTE - 302
    FOUND: 'Found',

    /**
     * Client nên lấy tài nguyên ở URI khác bằng phương thức GET.
     * Hay dùng sau một thao tác POST để điều hướng sang trang kết quả.
     */
    //NOTE - 303
    SEE_OTHER: 'See Other',

    /**
     * Tài nguyên chưa thay đổi so với bản cache của client.
     * Client có thể tiếp tục dùng dữ liệu đang lưu.
     */
    //NOTE - 304
    NOT_MODIFIED: 'Not Modified',

    /**
     * Tài nguyên đã chuyển vĩnh viễn sang URI khác và phải giữ nguyên HTTP method.
     * Ví dụ: POST vẫn phải là POST sau khi redirect.
     */
    //NOTE - 308
    PERMANENT_REDIRECT: 'Permanent Redirect',

    /**
     * Tài nguyên tạm thời chuyển sang URI khác nhưng phải giữ nguyên HTTP method.
     * Khác với 302 ở chỗ client không được tự đổi method.
     */
    //NOTE - 307
    TEMPORARY_REDIRECT: 'Temporary Redirect',

    //NOTE - 4xx - Lỗi từ phía client

    /**
     * Request không hợp lệ về cú pháp hoặc dữ liệu đầu vào.
     * Ví dụ: thiếu field bắt buộc, sai định dạng JSON, query param không hợp lệ.
     * Exception: BadRequestException
     */
    //NOTE - 400
    BAD_REQUEST: 'Bad Request',

    /**
     * Mã này được dành sẵn cho các hệ thống thanh toán nhưng hiện ít được sử dụng thực tế.
     */
    //NOTE - 402
    PAYMENT_REQUIRED: 'Payment Required',

    /**
     * Client chưa được xác thực.
     * Ví dụ: thiếu token, token hết hạn hoặc token không hợp lệ.
     * Exception: UnauthorizedException
     */
    //NOTE - 401
    UNAUTHORIZED: 'Unauthorized',

    /**
     * Client đã được nhận diện nhưng không có quyền truy cập tài nguyên.
     * Ví dụ: user thường gọi endpoint chỉ dành cho admin.
     * Exception: ForbiddenException
     */
    //NOTE - 403
    FORBIDDEN: 'Forbidden',

    /**
     * Không tìm thấy tài nguyên hoặc endpoint tương ứng.
     * Có thể là URL sai hoặc bản ghi không tồn tại.
     * Exception: NotFoundException
     */
    //NOTE - 404
    NOT_FOUND: 'Not Found',

    /**
     * Endpoint tồn tại nhưng không hỗ trợ HTTP method đang dùng.
     * Ví dụ: gọi DELETE vào API chỉ cho phép GET.
     * Exception: MethodNotAllowedException
     */
    //NOTE - 405
    METHOD_NOT_ALLOWED: 'Method Not Allowed',

    /**
     * Server không thể trả dữ liệu theo định dạng mà client yêu cầu.
     * Ví dụ: client chỉ chấp nhận XML nhưng server chỉ hỗ trợ JSON.
     * Exception: NotAcceptableException
     */
    //NOTE - 406
    NOT_ACCEPTABLE: 'Not Acceptable',

    /**
     * Client cần xác thực thông qua proxy trước khi request được xử lý.
     */
    //NOTE - 407
    PROXY_AUTHENTICATION_REQUIRED: 'Proxy Authentication Required',

    /**
     * Server chờ request quá lâu và chủ động đóng kết nối.
     * Exception: RequestTimeoutException
     */
    //NOTE - 408
    REQUEST_TIMEOUT: 'Request Timeout',

    /**
     * Request xung đột với trạng thái hiện tại của tài nguyên.
     * Ví dụ: tạo dữ liệu trùng khóa duy nhất hoặc cập nhật sai version.
     * Exception: ConflictException
     */
    //NOTE - 409
    CONFLICT: 'Conflict',

    /**
     * Tài nguyên từng tồn tại nhưng đã bị xóa vĩnh viễn.
     * Khác với 404 ở chỗ server biết chắc tài nguyên đã không còn nữa.
     * Exception: GoneException
     */
    //NOTE - 410
    GONE: 'Gone',

    /**
     * Server yêu cầu header Content-Length nhưng client không gửi.
     */
    //NOTE - 411
    LENGTH_REQUIRED: 'Length Required',

    /**
     * Nội dung request vượt quá giới hạn server cho phép.
     * Thường gặp khi upload file hoặc gửi body quá lớn.
     */
    //NOTE - 413
    REQUEST_TOO_LONG: 'Request Entity Too Large',

    /**
     * Nội dung request vượt quá giới hạn server cho phép.
     * Alias của REQUEST_TOO_LONG theo NestJS HttpStatus enum.
     * Exception: PayloadTooLargeException
     */
    //NOTE - 413
    PAYLOAD_TOO_LARGE: 'Payload Too Large',

    /**
     * URI hoặc URL quá dài để server có thể xử lý.
     */
    //NOTE - 414
    REQUEST_URI_TOO_LONG: 'Request-URI Too Long',

    /**
     * URI hoặc URL quá dài để server có thể xử lý.
     * Alias của REQUEST_URI_TOO_LONG theo NestJS HttpStatus enum.
     */
    //NOTE - 414
    URI_TOO_LONG: 'URI Too Long',

    /**
     * Kiểu dữ liệu gửi lên không được server hỗ trợ.
     * Ví dụ: gửi XML trong khi API chỉ chấp nhận application/json.
     * Exception: UnsupportedMediaTypeException
     */
    //NOTE - 415
    UNSUPPORTED_MEDIA_TYPE: 'Unsupported Media Type',

    /**
     * Server không thể đáp ứng điều kiện trong header Expect của client.
     */
    //NOTE - 417
    EXPECTATION_FAILED: 'Expectation Failed',

    /**
     * Mã 418 mang tính hài hước trong chuẩn HTTP mở rộng.
     * Alias của IM_A_TEAPOT theo NestJS HttpStatus enum.
     * Exception: ImATeapotException
     */
    //NOTE - 418
    I_AM_A_TEAPOT: "I'm a Teapot",

    /**
     * Request được gửi tới sai server đích cho cặp scheme/authority hiện tại.
     * Alias của MISDIRECTED_REQUEST theo NestJS HttpStatus enum.
     * Exception: MisdirectedException
     */
    //NOTE - 421
    MISDIRECTED: 'Misdirected',

    /**
     * Request đúng cú pháp nhưng sai về mặt nghiệp vụ hoặc ngữ nghĩa.
     * Ví dụ: dữ liệu qua validate cơ bản nhưng vi phạm rule domain.
     * Exception: UnprocessableEntityException
     */
    //NOTE - 422
    UNPROCESSABLE_ENTITY: 'Unprocessable Entity',

    /**
     * Tài nguyên đang bị khóa nên chưa thể thao tác.
     */
    //NOTE - 423
    LOCKED: 'Locked',

    /**
     * Request hiện tại thất bại vì phụ thuộc vào một request trước đó cũng thất bại.
     */
    //NOTE - 424
    FAILED_DEPENDENCY: 'Failed Dependency',

    /**
     * Điều kiện tiền đề trong request không thỏa mãn.
     * Ví dụ: If-Match không khớp với version hiện tại của tài nguyên.
     * Exception: PreconditionFailedException
     */
    //NOTE - 412
    PRECONDITION_FAILED: 'Precondition Failed',

    /**
     * Server yêu cầu request phải có điều kiện ràng buộc để tránh ghi đè dữ liệu ngoài ý muốn.
     */
    //NOTE - 428
    PRECONDITION_REQUIRED: 'Precondition Required',

    /**
     * Client gửi quá nhiều request trong một khoảng thời gian.
     * Thường dùng cho cơ chế rate limit.
     */
    //NOTE - 429
    TOO_MANY_REQUESTS: 'Too Many Requests',

    /**
     * Lỗi không thể khôi phục xảy ra trong quá trình xử lý request.
     * Thường liên quan đến lỗi nghiêm trọng ở cấp ứng dụng hoặc protocol.
     */
    //NOTE - 456
    UNRECOVERABLE_ERROR: 'Unrecoverable Error',

    /**
     * Header của request quá lớn nên server từ chối xử lý.
     */
    REQUEST_HEADER_FIELDS_TOO_LARGE: 'Request Header Fields Too Large',

    /**
     * Client yêu cầu một khoảng dữ liệu không hợp lệ hoặc vượt ngoài kích thước tài nguyên.
     */
    //NOTE - 416
    REQUESTED_RANGE_NOT_SATISFIABLE: 'Requested Range Not Satisfiable',

    /**
     * Client cần xác thực để truy cập mạng.
     * Thường gặp ở captive portal thay vì trong API nghiệp vụ.
     */
    NETWORK_AUTHENTICATION_REQUIRED: 'Network Authentication Required',

    /**
     * Tài nguyên không thể được cung cấp vì lý do pháp lý.
     */
    UNAVAILABLE_FOR_LEGAL_REASONS: 'Unavailable For Legal Reasons',

    /**
     * Request được gửi tới sai server đích cho cặp scheme/authority hiện tại.
     * Chủ yếu liên quan đến HTTP/2 và hạ tầng reverse proxy.
     */
    MISDIRECTED_REQUEST: 'Misdirected Request',

    /**
     * @deprecated
     * Mã cũ từng dùng để chỉ client phải truy cập thông qua proxy.
     * Hiện không nên dùng vì đã bị loại bỏ khỏi thực tiễn do vấn đề bảo mật.
     */
    USE_PROXY: 'Use Proxy',

    /**
     * @deprecated
     * Một response cũ từng được một số framework dùng nội bộ khi method thất bại.
     * Không nên sử dụng trong code mới.
     */
    METHOD_FAILURE: 'Method Failure',

    //NOTE - 5xx - Lỗi từ phía server

    /**
     * Lỗi nội bộ chung của server khi xảy ra exception hoặc trạng thái ngoài dự kiến.
     * Exception: InternalServerErrorException
     */
    //NOTE - 500
    INTERNAL_SERVER_ERROR: 'Internal Server Error',

    /**
     * Server chưa hỗ trợ chức năng hoặc HTTP method được yêu cầu.
     * Exception: NotImplementedException
     */
    //NOTE - 501
    NOT_IMPLEMENTED: 'Not Implemented',

    /**
     * Server đang đóng vai trò gateway nhưng nhận được phản hồi không hợp lệ từ upstream.
     * Exception: BadGatewayException
     */
    //NOTE - 502
    BAD_GATEWAY: 'Bad Gateway',

    /**
     * Server tạm thời không thể xử lý request do quá tải hoặc đang bảo trì.
     * Exception: ServiceUnavailableException
     */
    //NOTE - 503
    SERVICE_UNAVAILABLE: 'Service Unavailable',

    /**
     * Gateway hoặc proxy chờ upstream quá lâu nên hết thời gian.
     * Exception: GatewayTimeoutException
     */
    //NOTE - 504
    GATEWAY_TIMEOUT: 'Gateway Timeout',

    /**
     * Phiên bản HTTP mà client sử dụng không được server hỗ trợ.
     * Exception: HttpVersionNotSupportedException
     */
    //NOTE - 505
    HTTP_VERSION_NOT_SUPPORTED: 'HTTP Version Not Supported',

    /**
     * Server không đủ tài nguyên lưu trữ để hoàn tất request hiện tại.
     * Thường mang tính tạm thời.
     */
    INSUFFICIENT_SPACE_ON_RESOURCE: 'Insufficient Space on Resource',

    /**
     * Server không thể lưu trữ representation cần thiết để hoàn tất request.
     * Thường liên quan đến dung lượng hoặc cấu hình lưu trữ.
     */
    //NOTE - 507
    INSUFFICIENT_STORAGE: 'Insufficient Storage',

    /**
     * Server phát hiện vòng lặp vô hạn khi xử lý request.
     * Thường liên quan đến WebDAV khi binding tạo ra dependency tuần hoàn.
     */
    //NOTE - 508
    LOOP_DETECTED: 'Loop Detected'
} as const

//NOTE - Danh sách các exception phổ biến trong NestJS để tham chiếu khi cần thiết
/**
 *  BadGatewayException
    BadRequestException
    ConflictException
    ForbiddenException
    GatewayTimeoutException
    GoneException
    HttpVersionNotSupportedException
    HttpException
    ImATeapotException
    InternalServerErrorException
    IntrinsicException
    MethodNotAllowedException
    MisdirectedException
    NotAcceptableException
    NotFoundException
    NotImplementedException
    PayloadTooLargeException
    PreconditionFailedException
    RequestTimeoutException
    ServiceUnavailableException
    UnauthorizedException
    UnsupportedMediaTypeException
 */
