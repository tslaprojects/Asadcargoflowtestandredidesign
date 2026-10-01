import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:http/http.dart' as http;

/// Ошибка API CargoFlow: код и сообщение сервера (на русском), ошибки полей формы.
class ApiException implements Exception {
  ApiException(this.code, this.message, {this.status, this.fields = const {}});

  final String code;
  final String message;
  final int? status;
  final Map<String, List<String>> fields;

  bool get unauthorized => status == 401 || code == 'UNAUTHORIZED';
  bool get offline => code == 'OFFLINE';

  @override
  String toString() => message;
}

/// Источник токена сессии (в приложении — защищённое хранилище ОС).
abstract class TokenSource {
  Future<String?> read();
}

/// HTTP-клиент REST API CargoFlow для нативных приложений.
///
/// Сессия передаётся заголовком `Authorization: Bearer`, клиент помечается `x-cargoflow-client: native`
/// (сервер отдаёт токен только такому клиенту). Ответы — конверт `{ success, data | error }`.
class ApiClient {
  ApiClient({required this.baseUrl, required this.tokens, http.Client? httpClient, this.timeout = const Duration(seconds: 25)})
      : _http = httpClient ?? http.Client();

  String baseUrl;
  final TokenSource tokens;
  final http.Client _http;
  final Duration timeout;

  static final _rnd = Random.secure();

  /// Ключ идемпотентности для критичных действий (повтор запроса не выполнит действие дважды).
  static String idempotencyKey() => List.generate(16, (_) => _rnd.nextInt(256).toRadixString(16).padLeft(2, '0')).join();

  Uri uri(String path, [Map<String, String>? query]) {
    final base = baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;
    return Uri.parse('$base$path').replace(queryParameters: query == null || query.isEmpty ? null : query);
  }

  Future<Map<String, String>> _headers({bool json = true, String? idempotencyKey}) async {
    final token = await tokens.read();
    return {
      'accept': 'application/json',
      'x-cargoflow-client': 'native',
      if (json) 'content-type': 'application/json',
      if (token != null) 'authorization': 'Bearer $token',
      'idempotency-key': ?idempotencyKey,
    };
  }

  Future<dynamic> get(String path, {Map<String, String>? query}) =>
      _send(() async => _http.get(uri(path, query), headers: await _headers(json: false)));

  Future<dynamic> post(String path, [Object? body, String? idempotencyKey]) => _send(
        () async => _http.post(uri(path), headers: await _headers(idempotencyKey: idempotencyKey), body: jsonEncode(body ?? {})),
      );

  Future<dynamic> patch(String path, Object body) =>
      _send(() async => _http.patch(uri(path), headers: await _headers(), body: jsonEncode(body)));

  /// Загрузка файла (документы перевозки, фото груза, POD): multipart/form-data.
  Future<dynamic> upload(String path, {required File file, required Map<String, String> fields, String? filename}) {
    return _send(() async {
      final req = http.MultipartRequest('POST', uri(path))
        ..headers.addAll(await _headers(json: false))
        ..fields.addAll(fields)
        ..files.add(await http.MultipartFile.fromPath('file', file.path, filename: filename));
      return http.Response.fromStream(await _http.send(req));
    });
  }

  /// Скачивание файла (документы): байты; ошибки — как у остальных запросов.
  Future<List<int>> download(String path) async {
    http.Response res;
    try {
      res = await _http.get(uri(path), headers: await _headers(json: false)).timeout(const Duration(seconds: 90));
    } on Exception {
      throw ApiException('OFFLINE', 'Не удалось скачать файл. Проверьте интернет.');
    }
    if (res.statusCode >= 400) decode(res.statusCode, res.body);
    return res.bodyBytes;
  }

  Future<dynamic> _send(Future<http.Response> Function() call) async {
    http.Response res;
    try {
      res = await call().timeout(timeout);
    } on SocketException {
      throw ApiException('OFFLINE', 'Нет связи с сервером. Проверьте интернет.');
    } on HttpException {
      throw ApiException('OFFLINE', 'Нет связи с сервером. Проверьте интернет.');
    } on http.ClientException {
      throw ApiException('OFFLINE', 'Нет связи с сервером. Проверьте интернет.');
    } on Exception catch (e) {
      if (e.toString().contains('TimeoutException')) throw ApiException('OFFLINE', 'Сервер не ответил вовремя. Повторите попытку.');
      rethrow;
    }
    return decode(res.statusCode, res.body);
  }

  /// Разбор конверта ответа (отдельно — для тестов).
  static dynamic decode(int status, String body) {
    Map<String, dynamic>? json;
    try {
      final parsed = jsonDecode(body);
      if (parsed is Map<String, dynamic>) json = parsed;
    } on FormatException {
      json = null;
    }
    if (json != null && json['success'] == true) return json['data'];
    final err = json?['error'];
    if (err is Map<String, dynamic>) {
      final fields = <String, List<String>>{};
      final raw = err['fields'];
      if (raw is Map<String, dynamic>) {
        raw.forEach((k, v) => fields[k] = (v as List).map((e) => '$e').toList());
      }
      throw ApiException('${err['code']}', '${err['message']}', status: status, fields: fields);
    }
    throw ApiException('INTERNAL_ERROR', 'Ошибка сервера ($status). Попробуйте ещё раз.', status: status);
  }
}
