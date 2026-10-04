import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/api_client.dart';
import '../models/actor.dart';

/// Хранилище токена сессии: Keychain (iOS/macOS), Keystore (Android), Credential Manager (Windows).
class SecureTokenStore implements TokenSource {
  // macOS: обычная связка ключей — работает и в неподписанных сборках (data protection keychain требует
  // подписи с keychain-access-groups).
  SecureTokenStore([FlutterSecureStorage? storage])
      : _s = storage ?? const FlutterSecureStorage(mOptions: MacOsOptions(usesDataProtectionKeychain: false));
  final FlutterSecureStorage _s;
  static const _key = 'cargoflow.session';
  String? _cache;
  bool _loaded = false;

  @override
  Future<String?> read() async {
    if (!_loaded) {
      _cache = await _s.read(key: _key);
      _loaded = true;
    }
    return _cache;
  }

  Future<void> write(String? token) async {
    _cache = token;
    _loaded = true;
    if (token == null) {
      await _s.delete(key: _key);
    } else {
      await _s.write(key: _key, value: token);
    }
  }
}

enum DataMode { real, demo }

extension DataModeX on DataMode {
  String get wire => this == DataMode.demo ? 'demo' : 'real';
  String get label => this == DataMode.demo ? 'Демо-база' : 'Реальная база';
  static DataMode parse(String? v) => v == 'demo' ? DataMode.demo : DataMode.real;
}

enum SessionStatus { restoring, signedOut, signedIn }

/// Сессия пользователя: вход в выбранный режим данных, восстановление при запуске, выход, смена режима.
class SessionController extends ChangeNotifier {
  SessionController({required this.api, required this.tokens});

  final ApiClient api;
  final SecureTokenStore tokens;

  SessionStatus status = SessionStatus.restoring;
  Actor? actor;

  /// Адрес по умолчанию задаётся при сборке: --dart-define=CARGOFLOW_API=https://ваш-сервер
  static const defaultServer = String.fromEnvironment('CARGOFLOW_API', defaultValue: 'http://localhost:3000');

  /// Адрес сервера сохраняется на устройстве (можно указать свой при входе).
  Future<void> loadServer() async {
    final prefs = await SharedPreferences.getInstance();
    api.baseUrl = prefs.getString('cargoflow.server') ?? defaultServer;
  }

  Future<void> setServer(String url) async {
    final prefs = await SharedPreferences.getInstance();
    api.baseUrl = url.trim();
    await prefs.setString('cargoflow.server', api.baseUrl);
  }

  Future<void> restore() async {
    await loadServer();
    final token = await tokens.read();
    if (token == null) {
      status = SessionStatus.signedOut;
      notifyListeners();
      return;
    }
    try {
      actor = Actor.fromJson(await api.get('/api/auth/me') as Map<String, dynamic>);
      status = SessionStatus.signedIn;
    } on ApiException catch (e) {
      if (e.unauthorized) await tokens.write(null);
      // Без сети остаёмся на экране входа: данные без проверки сессии не показываем
      status = SessionStatus.signedOut;
    }
    notifyListeners();
  }

  Future<void> login({required String email, required String password, required DataMode mode}) async {
    await tokens.write(null);
    final data = await api.post('/api/auth/login', {'email': email.trim(), 'password': password, 'dataMode': mode.wire}) as Map<String, dynamic>;
    final token = data['token'] as String?;
    if (token == null) throw ApiException('INTERNAL_ERROR', 'Сервер не выдал токен приложения. Обновите сервер CargoFlow.');
    await tokens.write(token);
    actor = Actor.fromJson(await api.get('/api/auth/me') as Map<String, dynamic>);
    status = SessionStatus.signedIn;
    notifyListeners();
  }

  /// Смена режима данных: сервер выдаёт новую сессию, старая отзывается.
  Future<void> switchMode(DataMode mode) async {
    final data = await api.post('/api/auth/data-mode', {'dataMode': mode.wire}) as Map<String, dynamic>;
    final token = data['token'] as String?;
    if (token != null) await tokens.write(token);
    actor = Actor.fromJson(await api.get('/api/auth/me') as Map<String, dynamic>);
    notifyListeners();
  }

  Future<void> logout() async {
    try {
      await api.post('/api/auth/logout');
    } on ApiException {
      // Сессию на устройстве удаляем в любом случае
    }
    await tokens.write(null);
    actor = null;
    status = SessionStatus.signedOut;
    notifyListeners();
  }

  /// Любой 401 из экранов — сессия истекла или отозвана.
  Future<void> expired() async {
    await tokens.write(null);
    actor = null;
    status = SessionStatus.signedOut;
    notifyListeners();
  }
}
