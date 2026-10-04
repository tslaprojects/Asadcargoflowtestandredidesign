import 'package:cargoflow_core/cargoflow_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import 'screens/events.dart';
import 'screens/fleet.dart';
import 'screens/loads.dart';
import 'screens/operations.dart';
import 'screens/orders.dart';
import 'screens/profile.dart';
import 'screens/search.dart';

class _Dest {
  const _Dest(this.label, this.icon, this.selectedIcon, this.build);
  final String label;
  final IconData icon;
  final IconData selectedIcon;
  final Widget Function() build;
}

/// Оболочка: на компьютере и планшете — графитовая навигационная полоса слева (как веб-версия),
/// на телефоне — нижняя навигация. Ctrl+K / ⌘K — поиск по перевозкам, грузам, машинам и компаниям.
class Shell extends StatefulWidget {
  const Shell({super.key, required this.actor});
  final Actor actor;

  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  int _index = 0;

  List<_Dest> get _dests {
    final w = widget.actor.workspace;
    return [
      _Dest('Операции', Icons.radar_outlined, Icons.radar, () => const OperationsScreen()),
      _Dest('Перевозки', Icons.near_me_outlined, Icons.near_me, () => const OrdersScreen()),
      if (w == Workspace.customer || w == Workspace.forwarder) _Dest('Грузы', Icons.inventory_2_outlined, Icons.inventory_2, () => const LoadsScreen(mine: true)),
      if (w == Workspace.carrier || w == Workspace.forwarder) _Dest('Биржа', Icons.travel_explore_outlined, Icons.travel_explore, () => const LoadsScreen(mine: false)),
      if (w == Workspace.carrier) _Dest('Автопарк', Icons.local_shipping_outlined, Icons.local_shipping, () => const FleetScreen()),
      _Dest('События', Icons.notifications_none, Icons.notifications, () => const EventsScreen()),
      _Dest('Профиль', Icons.person_outline, Icons.person, () => const ProfileScreen()),
    ];
  }

  void _search() => showSearchDialog(context);

  @override
  Widget build(BuildContext context) {
    final dests = _dests;
    final index = _index.clamp(0, dests.length - 1);
    final wide = MediaQuery.sizeOf(context).width >= 840;
    final body = KeyedSubtree(key: ValueKey(dests[index].label), child: dests[index].build());

    return CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.keyK, control: true): _search,
        const SingleActivator(LogicalKeyboardKey.keyK, meta: true): _search,
      },
      child: Focus(
        autofocus: true,
        child: Scaffold(
          body: Row(children: [
            if (wide)
              NavigationRail(
                selectedIndex: index,
                onDestinationSelected: (i) => setState(() => _index = i),
                labelType: NavigationRailLabelType.all,
                minWidth: 76,
                leading: Padding(
                  padding: const EdgeInsets.only(top: 8, bottom: 12),
                  child: Column(children: [
                    Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(color: CF.primary, borderRadius: BorderRadius.circular(CF.radiusMd)),
                      child: const Icon(Icons.local_shipping_outlined, color: Colors.white, size: 20),
                    ),
                    const SizedBox(height: 12),
                    IconButton(
                      tooltip: 'Поиск (Ctrl+K)',
                      onPressed: _search,
                      icon: const Icon(Icons.search, color: CF.sidebarForeground),
                    ),
                  ]),
                ),
                destinations: [
                  for (final d in dests) NavigationRailDestination(icon: Icon(d.icon), selectedIcon: Icon(d.selectedIcon), label: Text(d.label)),
                ],
              ),
            Expanded(
              child: Column(children: [
                if (widget.actor.demo) Container(height: 2, color: CF.warning),
                Expanded(child: AnimatedSwitcher(duration: CF.standard, child: body)),
              ]),
            ),
          ]),
          bottomNavigationBar: wide
              ? null
              : NavigationBar(
                  selectedIndex: index.clamp(0, 4),
                  onDestinationSelected: (i) => setState(() => _index = i),
                  labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
                  destinations: [
                    for (final d in dests.take(5)) NavigationDestination(icon: Icon(d.icon), selectedIcon: Icon(d.selectedIcon), label: d.label),
                  ],
                ),
        ),
      ),
    );
  }
}

/// Шапка экрана: заголовок, режим данных (смена — с подтверждением), поиск, действия.
class ScreenHeader extends StatelessWidget implements PreferredSizeWidget {
  const ScreenHeader({super.key, required this.title, this.subtitle, this.actions = const []});
  final String title;
  final String? subtitle;
  final List<Widget> actions;

  @override
  Size get preferredSize => const Size.fromHeight(56);

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    final actor = session.actor!;
    return AppBar(
      title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title),
        if (subtitle != null) Text(subtitle!, style: const TextStyle(fontSize: 12, color: CF.mutedForeground, fontWeight: FontWeight.w400)),
      ]),
      actions: [
        ...actions,
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Center(child: ModeBadge(demo: actor.demo, onTap: () => confirmModeSwitch(context))),
        ),
        IconButton(tooltip: 'Поиск', onPressed: () => showSearchDialog(context), icon: const Icon(Icons.search)),
        const SizedBox(width: 4),
      ],
      bottom: const PreferredSize(preferredSize: Size.fromHeight(1), child: Divider()),
    );
  }
}

/// Смена режима данных: сервер выдаёт новую сессию; данные режимов не смешиваются.
Future<void> confirmModeSwitch(BuildContext context) async {
  final session = context.read<SessionController>();
  final target = session.actor!.demo ? DataMode.real : DataMode.demo;
  final ok = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text('Перейти в режим «${target.label}»?'),
      content: Text(target == DataMode.demo
          ? 'Демо-база — тестовые данные, можно экспериментировать. Реальные данные компании не затрагиваются.'
          : 'Реальная база — рабочие данные компании. Все действия выполняются по-настоящему.'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Отмена')),
        FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Перейти')),
      ],
    ),
  );
  if (ok != true || !context.mounted) return;
  try {
    await session.switchMode(target);
  } on ApiException catch (e) {
    if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
  }
}
