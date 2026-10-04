import 'package:cargoflow_core/cargoflow_core.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../shell.dart';
import 'operations.dart' show toMapItem;
import 'order_detail.dart';

class _Vehicle {
  _Vehicle.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        plate = '${j['plateNumber']}',
        model = '${j['make']} ${j['model']}',
        status = '${j['status']}',
        capacityKg = double.tryParse('${j['capacityKg']}'),
        orderId = ((j['orders'] as List?) ?? []).isEmpty ? null : ((j['orders'] as List).first as Map)['id'] as String?;
  final String id;
  final String plate;
  final String model;
  final String status;
  final double? capacityKg;
  final String? orderId;
}

const _vehicleStatus = {
  'AVAILABLE': ('Свободен', Tone.success),
  'ASSIGNED': ('На рейсе', Tone.info),
  'MAINTENANCE': ('Обслуживание', Tone.warning),
  'INACTIVE': ('Неактивен', Tone.neutral),
};

/// Автопарк перевозчика: машины в рейсе на карте, список со статусом, маршрутом и водителем.
class FleetScreen extends StatelessWidget {
  const FleetScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final api = context.read<ApiClient>();
    final session = context.read<SessionController>();
    return Scaffold(
      appBar: const ScreenHeader(title: 'Автопарк'),
      body: AsyncView<(List<_Vehicle>, List<LiveObject>)>(
        load: () async {
          final r = await Future.wait([api.get('/api/vehicles', query: {'pageSize': '100'}), api.get('/api/operations')]);
          final vehicles = ((r[0] as Map<String, dynamic>)['items'] as List).map((v) => _Vehicle.fromJson(v as Map<String, dynamic>)).toList();
          return (vehicles, OperationsData.fromJson(r[1] as Map<String, dynamic>).objects);
        },
        onUnauthorized: session.expired,
        refreshEvery: const Duration(seconds: 90),
        builder: (context, data, reload) {
          final (vehicles, trips) = data;
          final tripByPlate = {for (final t in trips) if (t.vehiclePlate != null) t.vehiclePlate!: t};
          final wide = MediaQuery.sizeOf(context).width >= 900;
          final list = RefreshIndicator(
            onRefresh: reload,
            child: ListView.separated(
              itemCount: vehicles.length,
              separatorBuilder: (_, _) => const Divider(),
              itemBuilder: (c, i) {
                final v = vehicles[i];
                final trip = tripByPlate[v.plate];
                final st = _vehicleStatus[v.status];
                return ListTile(
                  leading: trip != null ? HealthDot(trip.health, size: 10) : const SizedBox(width: 10),
                  title: Row(children: [
                    Expanded(child: Text(v.plate, style: const TextStyle(fontWeight: FontWeight.w600, fontFeatures: [FontFeature.tabularFigures()]))),
                    if (st != null) StatusChip(label: st.$1, tone: st.$2),
                  ]),
                  subtitle: Text(
                    trip != null
                        ? '${trip.origin} → ${trip.destination} · ${trip.statusLabel}${trip.driverName != null ? ' · ${trip.driverName}' : ''} · до ${Fmt.short(trip.deliveryDate)}'
                        : '${v.model} · ${Fmt.weight(v.capacityKg)}${v.status == 'AVAILABLE' ? ' · можно назначить на рейс' : ''}',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  onTap: (trip?.id ?? v.orderId) == null
                      ? null
                      : () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => OrderDetailScreen(orderId: trip?.id ?? v.orderId!))),
                );
              },
            ),
          );
          final map = LiveMap(items: trips.where((t) => t.vehiclePlate != null).map(toMapItem).toList());
          if (vehicles.isEmpty) {
            return const EmptyView(icon: Icons.local_shipping_outlined, title: 'Машины ещё не добавлены', text: 'Добавьте автомобили в веб-версии, чтобы назначать их на перевозки.');
          }
          return wide
              ? Row(children: [SizedBox(width: 400, child: Material(color: CF.card, child: list)), const VerticalDivider(width: 1), Expanded(child: map)])
              : Column(children: [SizedBox(height: MediaQuery.sizeOf(context).height * 0.3, child: map), const Divider(), Expanded(child: Material(color: CF.card, child: list))]);
        },
      ),
    );
  }
}
