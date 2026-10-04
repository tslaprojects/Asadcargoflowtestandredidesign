import 'package:cargoflow_core/cargoflow_core.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

class _Data {
  _Data(this.order, this.docs);
  final OrderDetail order;
  final List<DocumentItem> docs;
}

/// Перевозка как операционный объект: маршрут на карте, факты, этапы рейса, документы, история,
/// подтверждение получения (для заказчика после доставки).
class OrderDetailScreen extends StatelessWidget {
  const OrderDetailScreen({super.key, required this.orderId});
  final String orderId;

  @override
  Widget build(BuildContext context) {
    final api = context.read<ApiClient>();
    final session = context.read<SessionController>();
    Future<_Data> load() async {
      final results = await Future.wait([api.get('/api/orders/$orderId'), api.get('/api/orders/$orderId/documents')]);
      final docs = ((results[1] as Map<String, dynamic>)['items'] as List).map((d) => DocumentItem.fromJson(d as Map<String, dynamic>)).toList();
      return _Data(OrderDetail.fromJson(results[0] as Map<String, dynamic>), docs);
    }

    return AsyncView<_Data>(
      load: load,
      onUnauthorized: () {
        Navigator.of(context).popUntil((r) => r.isFirst);
        session.expired();
      },
      skeleton: const Scaffold(body: ListSkeleton()),
      builder: (context, d, reload) => _OrderView(data: d, reload: reload),
    );
  }
}

class _OrderView extends StatelessWidget {
  const _OrderView({required this.data, required this.reload});
  final _Data data;
  final Future<void> Function() reload;

  @override
  Widget build(BuildContext context) {
    final o = data.order;
    final api = context.read<ApiClient>();
    final wide = MediaQuery.sizeOf(context).width >= 1000;
    final route = o.stops.where((s) => s.point != null).map((s) => s.point!).toList();
    final halted = o.status == 'DISPUTED' || o.status == 'ON_HOLD' || o.status == 'CANCELLED';
    final journey = JourneyView(
      halted: halted,
      steps: journeySteps(
        o.status,
        pickupCity: o.stops.where((s) => s.type == 'PICKUP').firstOrNull?.city,
        borderCity: o.stops.where((s) => s.type == 'BORDER').firstOrNull?.city,
        deliveryCity: o.stops.where((s) => s.type == 'DELIVERY').lastOrNull?.city,
        history: [for (final h in o.history) (h.status, h.at)],
      ),
    );

    Widget card(String title, Widget child) => Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [Text(title, style: Theme.of(context).textTheme.titleMedium), const SizedBox(height: 12), child]),
          ),
        );
    Widget fact(String label, String value) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Overline(label), const SizedBox(height: 2), SelectableText(value)]),
        );

    final facts = card(
      'Перевозка',
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        fact('Груз', '${o.title} · ${Fmt.weight(o.weightKg)}'),
        fact('Загрузка / доставка', '${Fmt.date(o.loadingDate)} → ${Fmt.date(o.deliveryDate)}'),
        if (o.amount != null) fact('Стоимость', Fmt.money(o.amount, o.currency)),
        fact('Машина', o.vehicle ?? 'не назначена'),
        fact('Водитель', [o.driverName ?? 'не назначен', o.driverPhone].whereType<String>().join(' · ')),
        fact('Перевозчик', [o.carrierName, o.carrierPhone].whereType<String>().join(' · ')),
        fact('Грузовладелец', [o.shipperName, o.shipperPhone].whereType<String>().join(' · ')),
        fact('Последняя позиция', o.lastLocationAt == null ? 'не получена' : Fmt.relative(o.lastLocationAt)),
      ]),
    );
    final confirm = o.status == 'DELIVERED' && o.side == 'CUSTOMER'
        ? Card(
            color: CF.warningBg,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                const Text('Перевозчик отметил доставку', style: TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 4),
                const Text('Проверьте груз и документы (POD), затем подтвердите получение — перевозка будет закрыта.'),
                const SizedBox(height: 12),
                FilledButton(onPressed: () => _confirm(context, api, o.id), child: const Text('Подтвердить получение')),
              ]),
            ),
          )
        : null;
    final left = [
      ?confirm,
      SizedBox(
        height: 300,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(CF.radiusLg),
          child: LiveMap(items: [
            MapItem(
              id: o.id,
              label: o.publicNumber,
              health: halted ? Health.attention : (o.status == 'CLOSED' || o.status == 'DELIVERED' ? Health.done : Health.moving),
              position: o.lastLocation,
              route: route,
            ),
          ], selectedId: o.id),
        ),
      ),
      facts,
      card('Документы', DocumentList(docs: data.docs, api: api)),
    ];
    final right = [card('Этапы рейса', journey)];

    return Scaffold(
      appBar: AppBar(
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${o.stops.isEmpty ? '' : o.stops.first.city} → ${o.stops.isEmpty ? '' : o.stops.last.city}'),
          Text(o.publicNumber, style: const TextStyle(fontSize: 12, color: CF.mutedForeground, fontWeight: FontWeight.w400)),
        ]),
        actions: [Padding(padding: const EdgeInsets.only(right: 12), child: Center(child: StatusChip.order(o.status)))],
        bottom: const PreferredSize(preferredSize: Size.fromHeight(1), child: Divider()),
      ),
      body: RefreshIndicator(
        onRefresh: reload,
        child: wide
            ? SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(20),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Expanded(child: Column(children: _gap(left))),
                  const SizedBox(width: 16),
                  SizedBox(width: 360, child: Column(children: _gap(right))),
                ]),
              )
            : ListView(padding: const EdgeInsets.all(12), children: _gap([...left.take(confirm == null ? 1 : 2), ...right, ...left.skip(confirm == null ? 1 : 2)])),
      ),
    );
  }

  List<Widget> _gap(List<Widget> items) => [for (var i = 0; i < items.length; i++) ...[if (i > 0) const SizedBox(height: 12), items[i]]];

  Future<void> _confirm(BuildContext context, ApiClient api, String id) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Подтвердить получение груза?'),
        content: const Text('Перевозка будет закрыта. Если по ней оформлена безопасная сделка, выплата перевозчику будет запущена.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Отмена')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Подтвердить')),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    try {
      await api.post('/api/orders/$id/confirm-delivery', {}, ApiClient.idempotencyKey());
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Получение подтверждено, перевозка закрыта')));
      await reload();
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}
