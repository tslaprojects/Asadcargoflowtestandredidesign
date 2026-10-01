import 'package:cargoflow_core/cargoflow_core.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../shell.dart';

/// Профиль: пользователь, компания и роль, режим данных, сервер, выход.
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  static const _roles = {
    'SHIPPER': 'Грузовладелец',
    'FORWARDER': 'Экспедитор',
    'CARRIER_ADMIN': 'Руководитель перевозчика',
    'CARRIER_DISPATCHER': 'Диспетчер',
    'DRIVER': 'Водитель',
  };

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    final a = session.actor!;
    return Scaffold(
      appBar: const ScreenHeader(title: 'Профиль'),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Card(
          child: ListTile(
            leading: CircleAvatar(backgroundColor: CF.sidebar, foregroundColor: Colors.white, child: Text(a.initials)),
            title: Text(a.fullName, style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text(a.email),
          ),
        ),
        const SizedBox(height: 12),
        Card(
          child: Column(children: [
            ListTile(
              leading: const Icon(Icons.business_outlined),
              title: Text(a.active?.companyName ?? '—'),
              subtitle: Text(_roles[a.active?.role] ?? a.active?.role ?? ''),
            ),
            const Divider(),
            ListTile(
              leading: Icon(a.demo ? Icons.science_outlined : Icons.storage_outlined),
              title: Text(a.demo ? 'Демо-база' : 'Реальная база'),
              subtitle: Text(a.demo ? 'Тестовые данные — можно экспериментировать' : 'Рабочие данные компании'),
              trailing: TextButton(onPressed: () => confirmModeSwitch(context), child: const Text('Сменить')),
            ),
            const Divider(),
            ListTile(leading: const Icon(Icons.dns_outlined), title: const Text('Сервер'), subtitle: Text(session.api.baseUrl)),
          ]),
        ),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: () => session.logout(),
          icon: const Icon(Icons.logout, color: CF.danger),
          label: const Text('Выйти', style: TextStyle(color: CF.danger)),
        ),
      ]),
    );
  }
}
