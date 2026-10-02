import 'dart:io';

import 'package:cargoflow_core/cargoflow_core.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

/// Запуск навигатора: приложение (если установлено) → веб-версия. Последний выбор водителя запоминается
/// и предлагается первым.
class NavigatorLauncher {
  NavigatorLauncher({Future<bool> Function(Uri)? canLaunch, Future<bool> Function(Uri)? launch, bool? ios})
      : _canLaunch = canLaunch ?? canLaunchUrl,
        _launch = launch ?? ((u) => launchUrl(u, mode: LaunchMode.externalApplication)),
        ios = ios ?? Platform.isIOS;

  static const prefKey = 'cargoflow.driver.navigator';
  final Future<bool> Function(Uri) _canLaunch;
  final Future<bool> Function(Uri) _launch;
  final bool ios;

  Future<NavigatorApp?> lastChoice() async {
    final name = (await SharedPreferences.getInstance()).getString(prefKey);
    return NavigatorApp.values.where((a) => a.name == name).firstOrNull;
  }

  Future<void> remember(NavigatorApp app) async => (await SharedPreferences.getInstance()).setString(prefKey, app.name);

  /// Варианты по порядку: последний выбранный — первым.
  Future<List<NavigatorApp>> ordered() async {
    final last = await lastChoice();
    return [?last, ...NavigatorApp.values.where((a) => a != last)];
  }

  /// true — что-то открылось (приложение или браузер).
  Future<bool> open(NavigatorApp app, NavTarget target) async {
    await remember(app);
    for (final uri in navigatorUris(app, target, ios: ios)) {
      final web = uri.scheme == 'https' || uri.scheme == 'http';
      try {
        // Веб-ссылку открываем без проверки: её перехватит приложение или откроет браузер
        if (web || await _canLaunch(uri)) {
          if (await _launch(uri)) return true;
        }
      } on Exception {
        continue;
      }
    }
    return false;
  }
}

/// Нижняя панель выбора навигатора.
Future<void> showNavigatorSheet(BuildContext context, NavigatorLauncher launcher, NavTarget target) async {
  final apps = await launcher.ordered();
  if (!context.mounted) return;
  final messenger = ScaffoldMessenger.of(context);
  final chosen = await showModalBottomSheet<NavigatorApp>(
    context: context,
    showDragHandle: true,
    builder: (ctx) => SafeArea(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        ListTile(
          title: Text('Открыть в навигаторе', style: Theme.of(ctx).textTheme.titleMedium),
          subtitle: Text(target.query.isEmpty ? 'Точка маршрута' : target.query, maxLines: 2, overflow: TextOverflow.ellipsis),
        ),
        for (final (i, app) in apps.indexed)
          ListTile(
            key: ValueKey('navigator-${app.name}'),
            leading: Icon(switch (app) {
              NavigatorApp.yandex => Icons.navigation_outlined,
              NavigatorApp.dgis => Icons.map_outlined,
              NavigatorApp.google => Icons.directions_car_outlined,
            }),
            title: Text(app.label),
            trailing: i == 0 && apps.length > 1 ? const Text('последний выбор', style: TextStyle(color: CF.mutedForeground, fontSize: 12)) : null,
            onTap: () => Navigator.pop(ctx, app),
          ),
      ]),
    ),
  );
  if (chosen == null) return;
  if (!await launcher.open(chosen, target)) {
    messenger.showSnackBar(const SnackBar(content: Text('Не удалось открыть навигатор')));
  }
}
