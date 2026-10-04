import 'package:cargoflow_core/cargoflow_core.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../shell.dart';
import 'order_detail.dart';

/// Перевозки: группы (активные, в пути, требуют контроля, завершённые), поиск, список.
class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});
  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  String _group = 'active';
  String _q = '';
  int _version = 0;

  static const _groups = {'active': 'Активные', 'in_transit': 'В пути', 'attention': 'Контроль', 'completed': 'Завершённые', 'all': 'Все'};

  @override
  Widget build(BuildContext context) {
    final api = context.read<ApiClient>();
    final session = context.read<SessionController>();
    return Scaffold(
      appBar: const ScreenHeader(title: 'Перевозки'),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
          child: TextField(
            decoration: const InputDecoration(prefixIcon: Icon(Icons.search, size: 18), hintText: 'Номер, город, компания, госномер'),
            onSubmitted: (v) => setState(() {
              _q = v;
              _version++;
            }),
          ),
        ),
        SizedBox(
          height: 48,
          child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8), children: [
            for (final g in _groups.entries)
              Padding(
                padding: const EdgeInsets.only(right: 6),
                child: ChoiceChip(
                  label: Text(g.value),
                  selected: _group == g.key,
                  onSelected: (_) => setState(() {
                    _group = g.key;
                    _version++;
                  }),
                ),
              ),
          ]),
        ),
        const Divider(),
        Expanded(
          child: AsyncView<List<OrderSummary>>(
            key: ValueKey('$_group|$_q|$_version'),
            load: () async {
              final data = await api.get('/api/orders', query: {
                if (_group != 'all') 'group': _group,
                if (_q.trim().isNotEmpty) 'q': _q.trim(),
                'pageSize': '50',
              }) as Map<String, dynamic>;
              return (data['items'] as List).map((o) => OrderSummary.fromJson(o as Map<String, dynamic>)).toList();
            },
            onUnauthorized: session.expired,
            builder: (context, items, reload) => RefreshIndicator(
              onRefresh: reload,
              child: items.isEmpty
                  ? ListView(children: const [
                      EmptyView(icon: Icons.near_me_outlined, title: 'Перевозок нет', text: 'Измените группу или запрос. Новые перевозки появляются после выбора перевозчика.'),
                    ])
                  : ListView.separated(
                      itemCount: items.length,
                      separatorBuilder: (_, _) => const Divider(),
                      itemBuilder: (c, i) => OrderTile(order: items[i]),
                    ),
            ),
          ),
        ),
      ]),
    );
  }
}

class OrderTile extends StatelessWidget {
  const OrderTile({super.key, required this.order});
  final OrderSummary order;
  @override
  Widget build(BuildContext context) {
    final o = order;
    return ListTile(
      onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => OrderDetailScreen(orderId: o.id))),
      title: Row(children: [
        Expanded(child: Text(o.route, style: const TextStyle(fontWeight: FontWeight.w600))),
        StatusChip.order(o.status),
      ]),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 2),
        child: Text(
          [o.publicNumber, o.title, o.vehiclePlate, o.driverName, 'загр. ${Fmt.short(o.loadingDate)}'].whereType<String>().where((s) => s.isNotEmpty).join(' · '),
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
      ),
      trailing: o.amount != null ? Text(Fmt.money(o.amount, o.currency), style: const TextStyle(fontWeight: FontWeight.w600)) : null,
    );
  }
}
