import 'dart:async';

import 'package:cargoflow_core/cargoflow_core.dart';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'outbox.dart';

/// Координаты для отметок: широта, долгота, точность в метрах.
typedef Fix = ({double latitude, double longitude, double? accuracy});

/// Результат запроса доступа к геолокации — с понятным текстом для водителя.
enum LocationAccess { granted, serviceDisabled, denied, deniedForever }

String locationAccessText(LocationAccess a) => switch (a) {
      LocationAccess.granted => 'Доступ к геолокации есть',
      LocationAccess.serviceDisabled => 'Геолокация выключена на устройстве. Включите её в настройках.',
      LocationAccess.denied => 'Разрешите приложению доступ к местоположению.',
      LocationAccess.deniedForever => 'Доступ к местоположению запрещён. Разрешите его в настройках приложения.',
    };

/// Геолокация водителя: разовая отметка и автоматическая передача во время рейса,
/// в том числе в фоне (Android — уведомление foreground-службы, iOS — индикатор фоновой геолокации).
/// Отметки отправляются не чаще [minInterval] и через офлайн-очередь.
class LocationService extends ChangeNotifier {
  LocationService(this.outbox, {this.minInterval = const Duration(minutes: 5), this.distanceFilterMeters = 300, this.locate});

  static const _autoKey = 'cargoflow.driver.autoTracking';
  final Outbox outbox;
  final Duration minInterval;
  final int distanceFilterMeters;

  /// Подмена источника координат (тесты, эмуляторы). По умолчанию — GPS устройства.
  final Future<Fix?> Function(Duration timeLimit)? locate;

  StreamSubscription<Position>? _sub;
  String? _orderId;
  DateTime? _lastSent;
  bool _auto = false;
  String? error;

  bool get autoEnabled => _auto;
  bool get active => _sub != null;
  DateTime? get lastSent => _lastSent;

  Future<void> loadPreference() async {
    final prefs = await SharedPreferences.getInstance();
    _auto = prefs.getBool(_autoKey) ?? true;
    notifyListeners();
  }

  Future<LocationAccess> ensureAccess() async {
    if (!await Geolocator.isLocationServiceEnabled()) return LocationAccess.serviceDisabled;
    var p = await Geolocator.checkPermission();
    if (p == LocationPermission.denied) p = await Geolocator.requestPermission();
    return switch (p) {
      LocationPermission.denied => LocationAccess.denied,
      LocationPermission.deniedForever => LocationAccess.deniedForever,
      _ => LocationAccess.granted,
    };
  }

  /// Текущие координаты или null (нет доступа / не удалось за отведённое время).
  Future<Fix?> current({Duration timeLimit = const Duration(seconds: 15)}) async {
    if (locate case final l?) return l(timeLimit);
    try {
      if (await ensureAccess() != LocationAccess.granted) return null;
      final p = await Geolocator.getCurrentPosition(
        locationSettings: LocationSettings(accuracy: LocationAccuracy.high, timeLimit: timeLimit),
      );
      return (latitude: p.latitude, longitude: p.longitude, accuracy: p.accuracy);
    } on TimeoutException {
      final last = await Geolocator.getLastKnownPosition();
      return last == null ? null : (latitude: last.latitude, longitude: last.longitude, accuracy: last.accuracy);
    } on Exception {
      return null;
    }
  }

  /// Разовая отметка «Обновить местоположение». Возвращает true — отправлено, false — в очереди.
  Future<bool> sendOnce(String orderId, Fix fix, {String? note}) async {
    final sent = await outbox.send(trackingOp(orderId, fix, note: note));
    _lastSent = DateTime.now();
    notifyListeners();
    return sent;
  }

  static PendingOp trackingOp(String orderId, Fix fix, {String? note, DateTime? at}) {
    final time = at ?? DateTime.now();
    return PendingOp(
      kind: 'tracking',
      orderId: orderId,
      path: '/api/orders/$orderId/tracking',
      body: {
        'latitude': fix.latitude,
        'longitude': fix.longitude,
        'accuracy': fix.accuracy,
        'recordedAt': time.toUtc().toIso8601String(),
        'note': ?note,
      },
      key: ApiClient.idempotencyKey(),
      at: time,
      label: 'Местоположение',
    );
  }

  Future<void> setAuto(bool value, {String? orderId}) async {
    _auto = value;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_autoKey, value);
    if (!value) {
      await stop();
    } else if (orderId != null) {
      await follow(orderId);
    }
    notifyListeners();
  }

  /// Автоматическая передача для рейса в движении. Повторный вызов для того же рейса ничего не меняет.
  Future<void> follow(String orderId) async {
    if (!_auto) return;
    if (_sub != null && _orderId == orderId) return;
    await stop();
    final access = await ensureAccess();
    if (access != LocationAccess.granted) {
      error = locationAccessText(access);
      notifyListeners();
      return;
    }
    error = null;
    _orderId = orderId;
    _sub = Geolocator.getPositionStream(locationSettings: _streamSettings()).listen(
      (p) => _onPosition(orderId, p),
      onError: (Object e) {
        error = 'Не удалось получить местоположение';
        notifyListeners();
      },
    );
    notifyListeners();
  }

  Future<void> _onPosition(String orderId, Position p) async {
    final now = DateTime.now();
    if (_lastSent != null && now.difference(_lastSent!) < minInterval) return;
    _lastSent = now;
    try {
      await outbox.send(trackingOp(orderId, (latitude: p.latitude, longitude: p.longitude, accuracy: p.accuracy), at: p.timestamp));
    } on ApiException catch (e) {
      // Рейс мог закончиться или быть переназначен — прекращаем передачу
      error = e.message;
      await stop();
    }
    notifyListeners();
  }

  Future<void> stop() async {
    await _sub?.cancel();
    _sub = null;
    _orderId = null;
    notifyListeners();
  }

  LocationSettings _streamSettings() {
    if (defaultTargetPlatform == TargetPlatform.android) {
      return AndroidSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: distanceFilterMeters,
        intervalDuration: minInterval,
        foregroundNotificationConfig: const ForegroundNotificationConfig(
          notificationTitle: 'CargoFlow Водитель',
          notificationText: 'Передаём местоположение по текущему рейсу',
          notificationChannelName: 'Местоположение рейса',
          enableWakeLock: true,
          setOngoing: true,
        ),
      );
    }
    if (defaultTargetPlatform == TargetPlatform.iOS) {
      return AppleSettings(
        accuracy: LocationAccuracy.high,
        activityType: ActivityType.automotiveNavigation,
        distanceFilter: distanceFilterMeters,
        pauseLocationUpdatesAutomatically: true,
        showBackgroundLocationIndicator: true,
        allowBackgroundLocationUpdates: true,
      );
    }
    return LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: distanceFilterMeters);
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}

/// Статусы, в которых машина в рейсе и местоположение передаётся автоматически.
const movingStatuses = {'AT_LOADING', 'LOADED', 'IN_TRANSIT', 'AT_BORDER', 'CUSTOMS', 'BORDER_CLEARED', 'AT_DELIVERY'};
