import 'dart:async';

import 'package:cargoflow_core/cargoflow_core.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'order_detail.dart';

/// Поиск (Ctrl+K / ⌘K): перевозки, грузы, машины, компании.
Future<void> showSearchDialog(BuildContext context) => showDialog<void>(
      context: context,
      builder: (_) => Provider.value(value: context.read<ApiClient>(), child: const _SearchDialog()),
    );

class _SearchDialog extends StatefulWidget {
  const _SearchDialog();
  @override
  State<_SearchDialog> createState() => _SearchDialogState();
}

class _SearchDialogState extends State<_SearchDialog> {
  Timer? _debounce;
  Map<String, dynamic>? _res;
  bool _loading = false;
  String? _error;

  void _changed(String q) {
    _debounce?.cancel();
    if (q.trim().length < 2) {
      setState(() => _res = null);
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 250), () async {
      setState(() => _loading = true);
      try {
        final r = await context.read<ApiClient>().get('/api/search', query: {'q': q.trim()}) as Map<String, dynamic>;
        if (mounted) setState(() => (_res = r, _error = null));
      } on ApiException catch (e) {
        if (mounted) setState(() => _error = e.message);
      } finally {
        if (mounted) setState(() => _loading = false);
      }
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    List<Map<String, dynamic>> list(String k) => ((_res?[k] as List?) ?? []).cast<Map<String, dynamic>>();
    final orders = list('orders');
    final loads = list('loads');
    final vehicles = list('vehicles');
    final companies = list('companies');
    Widget head(String t) => Padding(padding: const EdgeInsets.fromLTRB(16, 12, 16, 4), child: Overline(t));
    return Dialog(
      alignment: const Alignment(0, -0.6),
      insetPadding: const EdgeInsets.all(16),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 560, maxHeight: 520),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: TextField(
              autofocus: true,
              onChanged: _changed,
              decoration: InputDecoration(
                prefixIcon: _loading ? const Padding(padding: EdgeInsets.all(12), child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))) : const Icon(Icons.search),
                hintText: 'Номер перевозки или груза, город, госномер, компания',
              ),
            ),
          ),
          const Divider(),
          Flexible(
            child: ListView(shrinkWrap: true, children: [
              if (_error != null) Padding(padding: const EdgeInsets.all(16), child: Text(_error!, style: const TextStyle(color: CF.danger))),
              if (_res == null) const Padding(padding: EdgeInsets.all(16), child: Text('Введите не меньше двух символов.', style: TextStyle(color: CF.mutedForeground))),
              if (_res != null && orders.isEmpty && loads.isEmpty && vehicles.isEmpty && companies.isEmpty)
                const Padding(padding: EdgeInsets.all(16), child: Text('Ничего не найдено. Попробуйте номер перевозки (CF-O-…), город или госномер.')),
              if (orders.isNotEmpty) head('Перевозки'),
              for (final o in orders)
                ListTile(
                  leading: const Icon(Icons.near_me_outlined),
                  title: Text('${o['publicNumber']}'),
                  subtitle: Text('${(o['load'] as Map)['originCity'] ?? '—'} → ${(o['load'] as Map)['destinationCity'] ?? '—'}'),
                  trailing: StatusChip.order('${o['currentStatus']}'),
                  onTap: () {
                    Navigator.pop(context);
                    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => OrderDetailScreen(orderId: '${o['id']}')));
                  },
                ),
              if (loads.isNotEmpty) head('Грузы'),
              for (final l in loads)
                ListTile(leading: const Icon(Icons.inventory_2_outlined), title: Text('${l['publicNumber']} · ${l['title']}'), subtitle: Text('${l['originCity'] ?? '—'} → ${l['destinationCity'] ?? '—'}')),
              if (vehicles.isNotEmpty) head('Автопарк'),
              for (final v in vehicles) ListTile(leading: const Icon(Icons.local_shipping_outlined), title: Text('${v['plateNumber']}'), subtitle: Text('${v['make']} ${v['model']}')),
              if (companies.isNotEmpty) head('Компании'),
              for (final c in companies) ListTile(leading: const Icon(Icons.business_outlined), title: Text('${c['legalName']}'), subtitle: Text('${c['city']}')),
            ]),
          ),
        ]),
      ),
    );
  }
}
