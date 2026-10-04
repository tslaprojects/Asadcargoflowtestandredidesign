import 'package:cargoflow_core/cargoflow_core.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

/// Рейс в истории водителя.
class TripSummary {
  TripSummary(this.id, this.publicNumber, this.status, this.origin, this.destination, this.loadingDate, this.deliveredAt, this.plate);
  final String id;
  final String publicNumber;
  final String status;
  final String origin;
  final String destination;
  final DateTime? loadingDate;
  final DateTime? deliveredAt;
  final String? plate;

  factory TripSummary.fromJson(Map<String, dynamic> j) {
    final load = (j['load'] as Map?)?.cast<String, dynamic>() ?? const {};
    DateTime? t(Object? v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;
    return TripSummary(
      j['id'] as String,
      j['publicNumber'] as String,
      j['currentStatus'] as String,
      '${load['originCity'] ?? '—'}',
      '${load['destinationCity'] ?? '—'}',
      t(j['loadingDate']),
      t(j['deliveredAt']),
      ((j['vehicle'] as Map?)?['plateNumber']) as String?,
    );
  }
}

class HistoryScreen extends StatelessWidget {
  const HistoryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final api = context.read<ApiClient>();
    return Scaffold(
      appBar: AppBar(title: const Text('История рейсов')),
      body: AsyncView<List<TripSummary>>(
        load: () async {
          final data = await api.get('/api/driver/trips', query: {'pageSize': '50'}) as Map<String, dynamic>;
          return (data['items'] as List).map((e) => TripSummary.fromJson(e as Map<String, dynamic>)).toList();
        },
        onUnauthorized: context.read<SessionController>().expired,
        builder: (context, items, reload) => items.isEmpty
            ? const EmptyView(icon: Icons.history, title: 'Рейсов пока не было', text: 'Завершённые и текущие рейсы появятся здесь.')
            : RefreshIndicator(
                onRefresh: reload,
                child: ListView.separated(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  itemCount: items.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (context, i) {
                    final t = items[i];
                    return ListTile(
                      title: Text('${t.origin} → ${t.destination}'),
                      subtitle: Text([
                        t.publicNumber,
                        'загрузка ${Fmt.date(t.loadingDate)}',
                        if (t.deliveredAt != null) 'доставлен ${Fmt.date(t.deliveredAt)}',
                        ?t.plate,
                      ].join(' · ')),
                      trailing: StatusChip.order(t.status),
                    );
                  },
                ),
              ),
      ),
    );
  }
}
