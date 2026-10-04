import 'package:cargoflow_core/cargoflow_core.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../shell.dart';

class LoadSummary {
  LoadSummary.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        publicNumber = j['publicNumber'] as String,
        title = '${j['title']}',
        status = j['status'] as String,
        weightKg = (j['weightKg'] as num?)?.toDouble(),
        price = (j['targetPrice'] as num?)?.toDouble() ?? double.tryParse('${j['targetPrice']}'),
        currency = '${j['currency']}',
        loadingFrom = DateTime.tryParse('${j['loadingDateFrom']}')?.toLocal(),
        cities = ((j['stops'] as List?) ?? []).map((s) => '${(s as Map)['city']}').toList(),
        company = '${(j['company'] as Map?)?['legalName'] ?? ''}',
        bids = ((j['_count'] as Map?)?['bids'] as num?)?.toInt() ?? 0;

  final String id;
  final String publicNumber;
  final String title;
  final String status;
  final double? weightKg;
  final double? price;
  final String currency;
  final DateTime? loadingFrom;
  final List<String> cities;
  final String company;
  final int bids;

  String get route => cities.isEmpty ? '—' : '${cities.first} → ${cities.last}${cities.length > 2 ? ' (+${cities.length - 2})' : ''}';
}

const _loadStatus = {
  'DRAFT': ('Черновик', Tone.neutral),
  'PUBLISHED': ('Опубликован', Tone.info),
  'BIDDING': ('Идут торги', Tone.warning),
  'CARRIER_SELECTED': ('Перевозчик выбран', Tone.success),
  'CANCELLED': ('Отменён', Tone.danger),
  'CONVERTED_TO_ORDER': ('В перевозке', Tone.success),
};

/// Грузы компании (грузовладелец, экспедитор) или биржа грузов (перевозчик, экспедитор) — плотный список.
class LoadsScreen extends StatefulWidget {
  const LoadsScreen({super.key, required this.mine});
  final bool mine;
  @override
  State<LoadsScreen> createState() => _LoadsScreenState();
}

class _LoadsScreenState extends State<LoadsScreen> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final api = context.read<ApiClient>();
    final session = context.read<SessionController>();
    final canBid = !widget.mine && session.actor!.can('BID_CREATE');
    return Scaffold(
      appBar: ScreenHeader(title: widget.mine ? 'Мои грузы' : 'Биржа грузов'),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: TextField(
            decoration: const InputDecoration(prefixIcon: Icon(Icons.search, size: 18), hintText: 'Город, страна, номер заявки'),
            onSubmitted: (v) => setState(() => _q = v),
          ),
        ),
        const Divider(),
        Expanded(
          child: AsyncView<List<LoadSummary>>(
            key: ValueKey('${widget.mine}|$_q'),
            load: () async {
              final data = await api.get('/api/loads', query: {
                'scope': widget.mine ? 'mine' : 'marketplace',
                if (_q.trim().isNotEmpty) 'q': _q.trim(),
                'pageSize': '50',
              }) as Map<String, dynamic>;
              return (data['items'] as List).map((l) => LoadSummary.fromJson(l as Map<String, dynamic>)).toList();
            },
            onUnauthorized: session.expired,
            builder: (context, items, reload) => RefreshIndicator(
              onRefresh: reload,
              child: items.isEmpty
                  ? ListView(children: [
                      EmptyView(
                        icon: Icons.inventory_2_outlined,
                        title: widget.mine ? 'Грузов пока нет' : 'Подходящих грузов нет',
                        text: widget.mine
                            ? 'Создайте груз в веб-версии — перевозчики предложат цену, выбор перевозчика появится здесь.'
                            : 'Измените запрос. Новые грузы появляются на бирже сразу после публикации.',
                      ),
                    ])
                  : ListView.separated(
                      itemCount: items.length,
                      separatorBuilder: (_, _) => const Divider(),
                      itemBuilder: (c, i) {
                        final l = items[i];
                        final st = _loadStatus[l.status];
                        return ListTile(
                          title: Text(l.route, style: const TextStyle(fontWeight: FontWeight.w600)),
                          subtitle: Text(
                            [l.title, l.publicNumber, Fmt.weight(l.weightKg), 'загр. ${Fmt.short(l.loadingFrom)}', if (!widget.mine) l.company, if (l.bids > 0) 'предложений: ${l.bids}']
                                .join(' · '),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                            Text(l.price == null ? 'Запрос цены' : Fmt.money(l.price, l.currency), style: const TextStyle(fontWeight: FontWeight.w600)),
                            if (st != null && l.status != 'PUBLISHED') ...[const SizedBox(height: 4), StatusChip(label: st.$1, tone: st.$2)],
                          ]),
                          onTap: canBid ? () => _bid(context, api, l, reload) : null,
                        );
                      },
                    ),
            ),
          ),
        ),
      ]),
    );
  }

  /// Предложение цены перевозчиком (то же API, что в веб-версии).
  Future<void> _bid(BuildContext context, ApiClient api, LoadSummary l, Future<void> Function() reload) async {
    final amount = TextEditingController(text: l.price?.round().toString() ?? '');
    final comment = TextEditingController();
    final sent = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('Предложить цену · ${l.publicNumber}'),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('${l.route} · ${l.title}', style: const TextStyle(color: CF.mutedForeground)),
          const SizedBox(height: 12),
          TextField(controller: amount, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: 'Цена, ${l.currency}')),
          const SizedBox(height: 12),
          TextField(controller: comment, decoration: const InputDecoration(labelText: 'Комментарий (необязательно)'), maxLines: 2),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Отмена')),
          FilledButton(
            onPressed: () async {
              try {
                await api.post(
                  '/api/loads/${l.id}/bids',
                  {'amount': double.tryParse(amount.text.replaceAll(' ', '')) ?? 0, 'currency': l.currency, if (comment.text.trim().isNotEmpty) 'comment': comment.text.trim()},
                  ApiClient.idempotencyKey(),
                );
                if (c.mounted) Navigator.pop(c, true);
              } on ApiException catch (e) {
                if (c.mounted) ScaffoldMessenger.of(c).showSnackBar(SnackBar(content: Text(e.message)));
              }
            },
            child: const Text('Отправить предложение'),
          ),
        ],
      ),
    );
    if (sent == true && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Предложение отправлено заказчику')));
      await reload();
    }
  }
}
