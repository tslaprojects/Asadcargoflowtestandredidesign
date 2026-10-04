import 'dart:async';
import 'dart:convert';

import 'package:cargoflow_core/cargoflow_core.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Операция, ожидающая отправки: отметка местоположения или смена статуса рейса.
class PendingOp {
  PendingOp({required this.kind, required this.orderId, required this.path, required this.body, required this.key, required this.at, this.label});

  final String kind; // tracking | status
  final String orderId;
  final String path;
  final Map<String, dynamic> body;
  final String key; // idempotency-key — повтор после обрыва связи не создаст дубль
  final DateTime at;
  final String? label;

  Map<String, dynamic> toJson() => {
        'kind': kind,
        'orderId': orderId,
        'path': path,
        'body': body,
        'key': key,
        'at': at.toIso8601String(),
        'label': ?label,
      };

  factory PendingOp.fromJson(Map<String, dynamic> j) => PendingOp(
        kind: j['kind'] as String,
        orderId: j['orderId'] as String,
        path: j['path'] as String,
        body: (j['body'] as Map).cast<String, dynamic>(),
        key: j['key'] as String,
        at: DateTime.parse(j['at'] as String),
        label: j['label'] as String?,
      );
}

/// Офлайн-очередь водителя. Без сети отметки и смены статусов сохраняются на устройстве
/// и отправляются по порядку, как только связь появится. Время отметки сохраняется (recordedAt).
class Outbox extends ChangeNotifier {
  Outbox(this.api);

  static const _storageKey = 'cargoflow.driver.outbox';
  final ApiClient api;
  final List<PendingOp> _items = [];
  bool _flushing = false;
  Timer? _timer;

  /// Последняя ошибка, из-за которой сервер отклонил операцию (не связь).
  String? lastRejection;

  List<PendingOp> get items => List.unmodifiable(_items);
  int get length => _items.length;
  bool hasPendingStatus(String orderId) => _items.any((o) => o.kind == 'status' && o.orderId == orderId);

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_storageKey);
    _items.clear();
    if (raw != null) {
      try {
        _items.addAll((jsonDecode(raw) as List).map((e) => PendingOp.fromJson((e as Map).cast<String, dynamic>())));
      } on FormatException {
        await prefs.remove(_storageKey);
      }
    }
    notifyListeners();
  }

  Future<void> _save() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_storageKey, jsonEncode(_items.map((e) => e.toJson()).toList()));
  }

  /// Периодические попытки отправки, пока приложение запущено.
  void start({Duration every = const Duration(seconds: 30)}) {
    _timer?.cancel();
    _timer = Timer.periodic(every, (_) => flush());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  /// Отправляет сразу; без сети — ставит в очередь. Возвращает true, если отправлено сейчас.
  /// Ошибки сервера (не связь) пробрасываются вызывающему.
  Future<bool> send(PendingOp op) async {
    // Порядок важен: пока в очереди есть операции, новые встают за ними
    if (_items.isNotEmpty) {
      await flush();
      if (_items.isNotEmpty) {
        await _enqueue(op);
        return false;
      }
    }
    try {
      await api.post(op.path, op.body, op.key);
      return true;
    } on ApiException catch (e) {
      if (!e.offline) rethrow;
      await _enqueue(op);
      return false;
    }
  }

  Future<void> _enqueue(PendingOp op) async {
    _items.add(op);
    await _save();
    notifyListeners();
  }

  Future<void> flush() async {
    if (_flushing || _items.isEmpty) return;
    _flushing = true;
    var changed = false;
    try {
      while (_items.isNotEmpty) {
        final op = _items.first;
        try {
          await api.post(op.path, op.body, op.key);
        } on ApiException catch (e) {
          if (e.offline || (e.status ?? 0) >= 500) break;
          if (e.unauthorized) break;
          // Сервер отклонил (например, статус уже сменил диспетчер) — повтор не поможет
          lastRejection = '${op.label ?? 'Операция'}: ${e.message}';
        }
        _items.removeAt(0);
        changed = true;
      }
    } finally {
      _flushing = false;
      if (changed) {
        await _save();
        notifyListeners();
      }
    }
  }

  Future<void> clear() async {
    _items.clear();
    await _save();
    notifyListeners();
  }
}
