import 'package:cargoflow_core/cargoflow_core.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../services/location.dart';
import '../services/outbox.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    final actor = session.actor!;
    final api = context.read<ApiClient>();
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Профиль')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: CircleAvatar(child: Text(actor.initials)),
            title: Text(actor.fullName, style: text.titleMedium),
            subtitle: Text(actor.email),
            trailing: ModeBadge(demo: actor.demo),
          ),
          const SizedBox(height: 8),
          AsyncView<List<Map<String, dynamic>>>(
            load: () async => ((await api.get('/api/driver/profile')) as List).cast<Map<String, dynamic>>(),
            onUnauthorized: session.expired,
            skeleton: const ListSkeleton(rows: 2),
            builder: (context, profiles, _) => Column(children: [
              for (final p in profiles) _CompanyCard(p),
            ]),
          ),
          const SizedBox(height: 16),
          Consumer<Outbox>(
            builder: (context, outbox, _) => outbox.length == 0
                ? const SizedBox.shrink()
                : ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.cloud_off_outlined, color: CF.warning),
                    title: Text('Ждут отправки: ${outbox.length}'),
                    subtitle: const Text('Отметки уйдут автоматически при появлении связи'),
                    trailing: TextButton(onPressed: outbox.flush, child: const Text('Отправить')),
                  ),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.dns_outlined),
            title: const Text('Сервер'),
            subtitle: Text(session.api.baseUrl),
          ),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: () async {
              final outbox = context.read<Outbox>();
              if (outbox.length > 0) {
                final ok = await showDialog<bool>(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    title: const Text('Выйти?'),
                    content: Text('${outbox.length} отметок ещё не отправлены и будут потеряны.'),
                    actions: [
                      TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Отмена')),
                      FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Выйти')),
                    ],
                  ),
                );
                if (ok != true) return;
                await outbox.clear();
              }
              if (!context.mounted) return;
              await context.read<LocationService>().stop();
              await session.logout();
            },
            icon: const Icon(Icons.logout),
            label: const Text('Выйти'),
          ),
        ],
      ),
    );
  }
}

class _CompanyCard extends StatelessWidget {
  const _CompanyCard(this.p);
  final Map<String, dynamic> p;
  @override
  Widget build(BuildContext context) {
    final company = (p['company'] as Map?)?.cast<String, dynamic>() ?? const {};
    final phone = company['phone'] as String?;
    final expiry = p['licenseExpiry'] is String ? DateTime.tryParse(p['licenseExpiry'] as String) : null;
    return Card(
      margin: const EdgeInsets.only(top: 8),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${company['legalName'] ?? 'Перевозчик'}', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          _row('Водительское удостоверение', '${p['licenseNumber'] ?? '—'}'),
          _row('Категория', '${p['licenseCategory'] ?? '—'}'),
          _row('Действует до', Fmt.date(expiry)),
          if (phone != null)
            TextButton.icon(
              onPressed: () => launchUrl(Uri(scheme: 'tel', path: phone)),
              icon: const Icon(Icons.call),
              label: Text('Диспетчерская: $phone'),
            ),
        ]),
      ),
    );
  }

  Widget _row(String k, String v) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(children: [Expanded(child: Text(k, style: const TextStyle(color: CF.mutedForeground))), Text(v)]),
      );
}
