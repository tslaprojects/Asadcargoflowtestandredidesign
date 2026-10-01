import 'package:latlong2/latlong.dart';

double? _d(Object? v) => v == null ? null : (v is num ? v.toDouble() : double.tryParse('$v'));
DateTime? _t(Object? v) => v == null ? null : DateTime.tryParse('$v')?.toLocal();
Map<String, dynamic> _m(Object? v) => v is Map<String, dynamic> ? v : const {};

/// Точка маршрута перевозки.
class RouteStop {
  RouteStop({required this.type, required this.city, required this.country, this.point, this.plannedFrom, this.address});
  final String type;
  final String city;
  final String country;
  final LatLng? point;
  final DateTime? plannedFrom;
  final String? address;

  factory RouteStop.fromJson(Map<String, dynamic> j) => RouteStop(
        type: j['type'] as String,
        city: '${j['city'] ?? ''}',
        country: '${j['country'] ?? ''}',
        point: j['latitude'] != null && j['longitude'] != null ? LatLng(_d(j['latitude'])!, _d(j['longitude'])!) : null,
        plannedFrom: _t(j['plannedDateFrom']),
        address: j['fullAddress'] as String? ?? j['street'] as String?,
      );
}

/// Строка списка перевозок (GET /api/orders).
class OrderSummary {
  OrderSummary({
    required this.id,
    required this.publicNumber,
    required this.status,
    required this.title,
    required this.stops,
    required this.carrierName,
    required this.shipperName,
    this.vehiclePlate,
    this.driverName,
    this.amount,
    this.currency,
    this.loadingDate,
    this.deliveryDate,
  });

  final String id;
  final String publicNumber;
  final String status;
  final String title;
  final List<String> stops;
  final String carrierName;
  final String shipperName;
  final String? vehiclePlate;
  final String? driverName;
  final double? amount;
  final String? currency;
  final DateTime? loadingDate;
  final DateTime? deliveryDate;

  String get route => stops.isEmpty ? '—' : '${stops.first} → ${stops.last}';

  factory OrderSummary.fromJson(Map<String, dynamic> j) {
    final load = _m(j['load']);
    return OrderSummary(
      id: j['id'] as String,
      publicNumber: j['publicNumber'] as String,
      status: j['currentStatus'] as String,
      title: '${load['title'] ?? ''}',
      stops: ((load['stops'] as List?) ?? []).map((s) => '${(s as Map)['city']}').toList(),
      carrierName: '${_m(j['carrier'])['legalName'] ?? ''}',
      shipperName: '${_m(j['shipper'])['legalName'] ?? ''}',
      vehiclePlate: _m(j['vehicle'])['plateNumber'] as String?,
      driverName: _m(j['driver'])['fullName'] as String?,
      amount: _d(j['agreedAmount']),
      currency: j['currency'] as String?,
      loadingDate: _t(j['loadingDate']),
      deliveryDate: _t(j['deliveryDate']),
    );
  }
}

class StatusEntry {
  StatusEntry(this.status, this.at, this.comment);
  final String status;
  final DateTime at;
  final String? comment;
}

/// Карточка перевозки (GET /api/orders/:id) — поля, нужные приложению.
class OrderDetail {
  OrderDetail({
    required this.id,
    required this.publicNumber,
    required this.status,
    required this.title,
    required this.weightKg,
    required this.stops,
    required this.history,
    required this.carrierName,
    required this.carrierPhone,
    required this.shipperName,
    required this.shipperPhone,
    required this.permissions,
    required this.side,
    this.vehicle,
    this.driverName,
    this.driverPhone,
    this.amount,
    this.currency,
    this.loadingDate,
    this.deliveryDate,
    this.lastLocation,
    this.lastLocationAt,
  });

  final String id;
  final String publicNumber;
  final String status;
  final String title;
  final double? weightKg;
  final List<RouteStop> stops;
  final List<StatusEntry> history;
  final String carrierName;
  final String? carrierPhone;
  final String shipperName;
  final String? shipperPhone;
  final Set<String> permissions;
  final String side;
  final String? vehicle;
  final String? driverName;
  final String? driverPhone;
  final double? amount;
  final String? currency;
  final DateTime? loadingDate;
  final DateTime? deliveryDate;
  final LatLng? lastLocation;
  final DateTime? lastLocationAt;

  factory OrderDetail.fromJson(Map<String, dynamic> j) {
    final o = _m(j['order']);
    final load = _m(o['load']);
    final v = _m(o['vehicle']);
    final d = _m(o['driver']);
    final loc = _m(j['lastLocation']);
    final access = _m(j['access']);
    return OrderDetail(
      id: o['id'] as String,
      publicNumber: o['publicNumber'] as String,
      status: o['currentStatus'] as String,
      title: '${load['title'] ?? ''}',
      weightKg: _d(load['weightKg']),
      stops: ((load['stops'] as List?) ?? []).map((s) => RouteStop.fromJson(s as Map<String, dynamic>)).toList(),
      history: ((o['statusHistory'] as List?) ?? [])
          .map((h) => StatusEntry('${(h as Map)['toStatus']}', _t(h['createdAt']) ?? DateTime.now(), h['comment'] as String?))
          .toList(),
      carrierName: '${_m(o['carrier'])['legalName'] ?? ''}',
      carrierPhone: _m(o['carrier'])['phone'] as String?,
      shipperName: '${_m(o['shipper'])['legalName'] ?? ''}',
      shipperPhone: _m(o['shipper'])['phone'] as String?,
      permissions: ((access['permissions'] as List?) ?? []).map((e) => '$e').toSet(),
      side: '${access['side'] ?? ''}',
      vehicle: v.isEmpty ? null : '${v['make']} ${v['model']} · ${v['plateNumber']}',
      driverName: d['fullName'] as String?,
      driverPhone: d['phone'] as String?,
      amount: _d(o['agreedAmount']),
      currency: o['currency'] as String?,
      loadingDate: _t(o['loadingDate']),
      deliveryDate: _t(o['deliveryDate']),
      lastLocation: loc['latitude'] != null ? LatLng(_d(loc['latitude'])!, _d(loc['longitude'])!) : null,
      lastLocationAt: _t(loc['createdAt']),
    );
  }
}

/// Документ перевозки.
class DocumentItem {
  DocumentItem({required this.id, required this.type, required this.filename, required this.createdAt, this.size});
  final String id;
  final String type;
  final String filename;
  final DateTime createdAt;
  final int? size;

  factory DocumentItem.fromJson(Map<String, dynamic> j) => DocumentItem(
        id: j['id'] as String,
        type: j['type'] as String,
        filename: '${j['filename']}',
        createdAt: _t(j['createdAt']) ?? DateTime.now(),
        size: (j['size'] as num?)?.toInt(),
      );
}

/// Событие центра уведомлений.
class NotificationItem {
  NotificationItem({required this.id, required this.type, required this.title, this.body, this.link, required this.read, required this.createdAt});
  final String id;
  final String type;
  final String title;
  final String? body;
  final String? link;
  final bool read;
  final DateTime createdAt;

  String? get orderId => link == null ? null : RegExp(r'^/orders/([0-9a-f-]{36})').firstMatch(link!)?.group(1);

  factory NotificationItem.fromJson(Map<String, dynamic> j) => NotificationItem(
        id: j['id'] as String,
        type: j['type'] as String,
        title: '${j['title']}',
        body: j['body'] as String?,
        link: j['link'] as String?,
        read: j['readAt'] != null,
        createdAt: _t(j['createdAt']) ?? DateTime.now(),
      );
}

/// Текущий рейс водителя (GET /api/driver/trip) — без финансовых данных.
class DriverTrip {
  DriverTrip({
    required this.orderId,
    required this.publicNumber,
    required this.status,
    required this.title,
    required this.weightKg,
    required this.stops,
    required this.documents,
    this.vehicle,
    this.carrierName,
    this.carrierPhone,
    this.shipperName,
    this.cargoNotes,
    this.lastLocationAt,
  });

  final String orderId;
  final String publicNumber;
  final String status;
  final String title;
  final double? weightKg;
  final List<RouteStop> stops;
  final List<DocumentItem> documents;
  final String? vehicle;
  final String? carrierName;
  final String? carrierPhone;
  final String? shipperName;
  final String? cargoNotes;
  final DateTime? lastLocationAt;

  RouteStop? get pickup => stops.where((s) => s.type == 'PICKUP').firstOrNull;
  RouteStop? get delivery => stops.where((s) => s.type == 'DELIVERY').lastOrNull;

  static DriverTrip? fromJson(Object? data) {
    if (data is! Map<String, dynamic>) return null;
    final o = _m(data['order']);
    final load = _m(o['load']);
    final v = _m(o['vehicle']);
    return DriverTrip(
      orderId: o['id'] as String,
      publicNumber: o['publicNumber'] as String,
      status: o['currentStatus'] as String,
      title: '${load['title'] ?? ''}',
      weightKg: _d(load['weightKg']),
      stops: ((load['stops'] as List?) ?? []).map((s) => RouteStop.fromJson(s as Map<String, dynamic>)).toList(),
      documents: ((data['documents'] as List?) ?? []).map((d) => DocumentItem.fromJson(d as Map<String, dynamic>)).toList(),
      vehicle: v.isEmpty ? null : '${v['make']} ${v['model']} · ${v['plateNumber']}',
      carrierName: _m(o['carrier'])['legalName'] as String?,
      carrierPhone: _m(o['carrier'])['phone'] as String?,
      shipperName: _m(o['shipper'])['legalName'] as String?,
      cargoNotes: load['notes'] as String?,
      lastLocationAt: _t(_m(data['lastLocation'])['createdAt']),
    );
  }
}
