import 'package:latlong2/latlong.dart';

double? _d(Object? v) => v == null ? null : (v is num ? v.toDouble() : double.tryParse('$v'));
DateTime? _t(Object? v) => v == null ? null : DateTime.tryParse('$v')?.toLocal();

/// Операционное состояние объекта (вычисляет сервер, см. lib/operations.ts).
enum Health { moving, arriving, delayed, waiting, attention, done, cancelled }

Health parseHealth(String? v) => Health.values.firstWhere((h) => h.name == v, orElse: () => Health.waiting);

class Stop {
  Stop({required this.type, required this.city, required this.country, this.point});
  final String type;
  final String city;
  final String country;
  final LatLng? point;

  factory Stop.fromJson(Map<String, dynamic> j) {
    final p = j['point'];
    return Stop(
      type: j['type'] as String,
      city: '${j['city'] ?? ''}',
      country: '${j['country'] ?? ''}',
      point: p is Map<String, dynamic> ? LatLng(_d(p['lat'])!, _d(p['lng'])!) : null,
    );
  }
}

/// Живой объект: перевозка с позицией, маршрутом, машиной и водителем (GET /api/operations).
class LiveObject {
  LiveObject({
    required this.id,
    required this.publicNumber,
    required this.status,
    required this.statusLabel,
    required this.health,
    required this.statusChangedAt,
    required this.loadingDate,
    required this.deliveryDate,
    required this.title,
    required this.weightKg,
    required this.origin,
    required this.destination,
    required this.stops,
    required this.position,
    required this.positionAt,
    required this.positionEstimated,
    required this.progress,
    required this.vehiclePlate,
    required this.vehicleModel,
    required this.driverName,
    required this.driverPhone,
    required this.carrierName,
    required this.shipperName,
    this.routeLine = const [],
    this.distanceKm,
    this.distanceEstimated = true,
  });

  final String id;
  final String publicNumber;
  final String status;
  final String statusLabel;
  final Health health;
  final DateTime? statusChangedAt;
  final DateTime? loadingDate;
  final DateTime? deliveryDate;
  final String title;
  final double? weightKg;
  final String origin;
  final String destination;
  final List<Stop> stops;
  final LatLng? position;
  final DateTime? positionAt;
  final bool positionEstimated;
  final double progress;
  final String? vehiclePlate;
  final String? vehicleModel;
  final String? driverName;
  final String? driverPhone;
  final String carrierName;
  final String shipperName;
  /// Линия маршрута по дорогам (с сервера); пусто — маршрут рисуется прямыми между точками.
  final List<LatLng> routeLine;
  final double? distanceKm;
  final bool distanceEstimated;

  List<LatLng> get route => routeLine.length > 1 ? routeLine : stops.where((s) => s.point != null).map((s) => s.point!).toList();

  factory LiveObject.fromJson(Map<String, dynamic> j) {
    final pos = j['position'];
    final v = j['vehicle'];
    final d = j['driver'];
    return LiveObject(
      id: j['id'] as String,
      publicNumber: j['publicNumber'] as String,
      status: j['status'] as String,
      statusLabel: j['statusLabel'] as String,
      health: parseHealth(j['health'] as String?),
      statusChangedAt: _t(j['statusChangedAt']),
      loadingDate: _t(j['loadingDate']),
      deliveryDate: _t(j['deliveryDate']),
      title: '${j['title']}',
      weightKg: _d(j['weightKg']),
      origin: '${j['origin']}',
      destination: '${j['destination']}',
      stops: ((j['stops'] as List?) ?? []).map((s) => Stop.fromJson(s as Map<String, dynamic>)).toList(),
      routeLine: parseRouteLine(j['routeLine']),
      distanceKm: (j['distanceKm'] as num?)?.toDouble(),
      distanceEstimated: j['distanceSource'] != 'PROVIDER',
      position: pos is Map<String, dynamic> ? LatLng(_d(pos['lat'])!, _d(pos['lng'])!) : null,
      positionAt: pos is Map<String, dynamic> ? _t(pos['at']) : null,
      positionEstimated: pos is Map<String, dynamic> && pos['source'] == 'estimated',
      progress: _d(j['progress']) ?? 0,
      vehiclePlate: v is Map<String, dynamic> ? v['plateNumber'] as String? : null,
      vehicleModel: v is Map<String, dynamic> ? '${v['make']} ${v['model']}' : null,
      driverName: d is Map<String, dynamic> ? d['fullName'] as String? : null,
      driverPhone: d is Map<String, dynamic> ? d['phone'] as String? : null,
      carrierName: '${(j['carrier'] as Map?)?['legalName'] ?? ''}',
      shipperName: '${(j['shipper'] as Map?)?['legalName'] ?? ''}',
    );
  }
}

class OperationalEvent {
  OperationalEvent({required this.id, required this.at, required this.orderId, required this.publicNumber, required this.status, required this.title, this.comment});
  final String id;
  final DateTime at;
  final String orderId;
  final String publicNumber;
  final String status;
  final String title;
  final String? comment;

  factory OperationalEvent.fromJson(Map<String, dynamic> j) => OperationalEvent(
        id: j['id'] as String,
        at: _t(j['at']) ?? DateTime.now(),
        orderId: j['orderId'] as String,
        publicNumber: j['publicNumber'] as String,
        status: j['status'] as String,
        title: j['title'] as String,
        comment: j['comment'] as String?,
      );
}

class ActionItem {
  ActionItem({required this.key, required this.title, required this.description, required this.href, required this.tone});
  final String key;
  final String title;
  final String description;
  final String href;
  final String tone;

  /// Перевозка, к которой относится действие (из ссылки веб-версии `/orders/<id>`).
  String? get orderId => RegExp(r'^/orders/([0-9a-f-]{36})').firstMatch(href)?.group(1);

  factory ActionItem.fromJson(Map<String, dynamic> j) =>
      ActionItem(key: j['key'] as String, title: j['title'] as String, description: '${j['description']}', href: j['href'] as String, tone: j['tone'] as String);
}

class OperationsData {
  OperationsData({required this.objects, required this.events, required this.actions, required this.kind});
  final List<LiveObject> objects;
  final List<OperationalEvent> events;
  final List<ActionItem> actions;
  final String kind;

  factory OperationsData.fromJson(Map<String, dynamic> j) => OperationsData(
        objects: ((j['objects'] as List?) ?? []).map((o) => LiveObject.fromJson(o as Map<String, dynamic>)).toList(),
        events: ((j['events'] as List?) ?? []).map((o) => OperationalEvent.fromJson(o as Map<String, dynamic>)).toList(),
        actions: ((j['actions'] as List?) ?? []).map((o) => ActionItem.fromJson(o as Map<String, dynamic>)).toList(),
        kind: '${j['kind']}',
      );
}

/// Линия маршрута с сервера: [[lng, lat], ...] (порядок GeoJSON) → точки карты.
List<LatLng> parseRouteLine(Object? raw) {
  if (raw is! List) return const [];
  final out = <LatLng>[];
  for (final c in raw) {
    if (c is List && c.length >= 2 && c[0] is num && c[1] is num) out.add(LatLng((c[1] as num).toDouble(), (c[0] as num).toDouble()));
  }
  return out.length > 1 ? out : const [];
}
