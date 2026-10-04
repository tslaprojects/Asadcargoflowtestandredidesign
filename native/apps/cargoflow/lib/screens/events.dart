import 'package:cargoflow_core/cargoflow_core.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../shell.dart';
import 'order_detail.dart';

/// Центр событий: сначала «Требует внимания» (критичные и требующие действия непрочитанные), затем лента.
class EventsScreen extends StatelessWidget {
  const EventsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final api = context.read<ApiClient>();
    final session = context.read<SessionController>();
    return Scaffold(
      appBar: ScreenHeader(
        title: 'События',
        actions: [
          IconButton(
            tooltip: 'Отметить все прочитанными',
            icon: const Icon(Icons.done_all),
            onPressed: () async {
              await api.post('/api/notifications/read-all');
              if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Все события прочитаны')));
            },
          ),
        ],
      ),
      body: AsyncView<List<NotificationItem>>(
        load: () async {
          final data = await api.get('/api/notifications', query: {'pageSize': '50'}) as Map<String, dynamic>;
          return (data['items'] as List).map((n) => NotificationItem.fromJson(n as Map<String, dynamic>)).toList();
        },
        onUnauthorized: session.expired,
        refreshEvery: const Duration(seconds: 30),
        builder: (context, items, reload) {
          if (items.isEmpty) {
            return const EmptyView(
              icon: Icons.notifications_none,
              title: 'Событий пока нет',
              text: 'Здесь появятся предложения перевозчиков, смены статусов, документы, задержки и споры — с переходом к объекту.',
            );
          }
          const rank = {EventPriority.critical: 0, EventPriority.action: 1, EventPriority.info: 2};
          final attention = items.where((n) => !n.read && eventPriority(n.type, n.title, n.body) != EventPriority.info).toList()
            ..sort((a, b) => rank[eventPriority(a.type, a.title, a.body)]!.compareTo(rank[eventPriority(b.type, b.title, b.body)]!));
          final feed = items.where((n) => !attention.contains(n)).toList();
          return RefreshIndicator(
            onRefresh: reload,
            child: ListView(children: [
              if (attention.isNotEmpty) ...[
                Padding(padding: const EdgeInsets.fromLTRB(16, 16, 16, 6), child: Overline('Требует внимания · ${attention.length}')),
                for (final n in attention) _EventTile(n: n, api: api, reload: reload),
              ],
              const Padding(padding: EdgeInsets.fromLTRB(16, 16, 16, 6), child: Overline('Лента событий')),
              for (final n in feed) _EventTile(n: n, api: api, reload: reload),
            ]),
          );
        },
      ),
    );
  }
}

class _EventTile extends StatelessWidget {
  const _EventTile({required this.n, required this.api, required this.reload});
  final NotificationItem n;
  final ApiClient api;
  final Future<void> Function() reload;

  @override
  Widget build(BuildContext context) {
    final p = eventPriority(n.type, n.title, n.body);
    final (icon, color, bg) = switch (p) {
      EventPriority.critical => (Icons.report_outlined, CF.danger, CF.dangerBg),
      EventPriority.action => (Icons.notifications_active_outlined, CF.warning, CF.warningBg),
      EventPriority.info => (Icons.info_outline, CF.info, CF.infoBg),
    };
    return Material(
      color: n.read ? CF.card : CF.accent.withValues(alpha: 0.5),
      child: ListTile(
        leading: Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(CF.radiusMd)),
          child: Icon(icon, color: color, size: 18),
        ),
        title: Text(n.title, style: TextStyle(fontWeight: n.read ? FontWeight.w500 : FontWeight.w700, fontSize: 14)),
        subtitle: Text([if (n.body != null) n.body!, Fmt.relative(n.createdAt)].join('\n'), maxLines: 3, overflow: TextOverflow.ellipsis),
        trailing: n.orderId != null ? const Icon(Icons.chevron_right) : null,
        onTap: () async {
          if (!n.read) await api.post('/api/notifications/${n.id}/read').catchError((_) => null);
          if (!context.mounted) return;
          if (n.orderId != null) {
            await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => OrderDetailScreen(orderId: n.orderId!)));
          }
          await reload();
        },
      ),
    );
  }
}
