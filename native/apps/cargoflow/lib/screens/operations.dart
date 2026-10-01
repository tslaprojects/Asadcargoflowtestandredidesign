import 'package:cargoflow_core/cargoflow_core.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../shell.dart';
import 'order_detail.dart';

enum _Filter { all, moving, delayed, arriving, waiting }

const _filters = {
  _Filter.all: ('Активно', null),
  _Filter.moving: ('В пути', Health.moving),
  _Filter.delayed: ('Задержка', Health.delayed),
  _Filter.arriving: ('Прибытие', Health.arriving),
  _Filter.waiting: ('Ожидание', Health.waiting),
};

bool _match(_Filter f, Health h) => switch (f) {
      _Filter.all => h != Health.done && h != Health.cancelled,
      _Filter.moving => h == Health.moving || h == Health.arriving || h == Health.delayed,
      _Filter.delayed => h == Health.delayed,
      _Filter.arriving => h == Health.arriving,
      _Filter.waiting => h == Health.waiting,
    };

MapItem toMapItem(LiveObject o) =>
    MapItem(id: o.id, label: '${o.publicNumber}: ${o.origin} → ${o.destination}, ${o.statusLabel}', health: o.health, position: o.position, route: o.route);

/// Операции: карта с живыми объектами, индикаторы-фильтры, список, «Требует внимания», события,
/// панель выбранной перевозки (на телефоне — нижний лист). Обновление раз в минуту.
class OperationsScreen extends StatelessWidget {
  const OperationsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final api = context.read<ApiClient>();
    final session = context.read<SessionController>();
    return Scaffold(
      appBar: ScreenHeader(title: 'Операции', subtitle: session.actor!.active?.companyName),
      body: AsyncView<OperationsData>(
        load: () async => OperationsData.fromJson(await api.get('/api/operations') as Map<String, dynamic>),
        onUnauthorized: session.expired,
        refreshEvery: const Duration(seconds: 60),
        builder: (context, data, reload) => _Workspace(data: data, reload: reload),
      ),
    );
  }
}

class _Workspace extends StatefulWidget {
  const _Workspace({required this.data, required this.reload});
  final OperationsData data;
  final Future<void> Function() reload;
  @override
  State<_Workspace> createState() => _WorkspaceState();
}

class _WorkspaceState extends State<_Workspace> {
  _Filter _filter = _Filter.all;
  String? _selected;
  String _q = '';
  int _tab = 0;

  List<LiveObject> get _visible {
    final q = _q.trim().toLowerCase();
    return widget.data.objects.where((o) {
      if (!_match(_filter, o.health)) return false;
      if (q.isEmpty) return true;
      return [o.publicNumber, o.origin, o.destination, o.title, o.vehiclePlate, o.driverName, o.carrierName, o.shipperName]
          .whereType<String>()
          .any((v) => v.toLowerCase().contains(q));
    }).toList();
  }

  void _select(String? id, {required bool sheet}) {
    setState(() => _selected = _selected == id ? null : id);
    if (sheet && _selected != null) {
      final o = widget.data.objects.firstWhere((x) => x.id == _selected);
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (c) => DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.62,
          maxChildSize: 0.92,
          builder: (c, scroll) => ShipmentDetails(object: o, scroll: scroll, onClose: () => Navigator.pop(c)),
        ),
      ).whenComplete(() => mounted ? setState(() => _selected = null) : null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    final wide = width >= 900;
    final visible = _visible;
    final selected = widget.data.objects.where((o) => o.id == _selected).firstOrNull;
    final map = LiveMap(
      items: visible.map(toMapItem).toList(),
      selectedId: _selected,
      onSelect: (id) => _select(id, sheet: !wide),
      padding: EdgeInsets.fromLTRB(48, 48, wide && selected != null ? 420 : 48, 48),
    );
    final panel = _Panel(
      data: widget.data,
      visible: visible,
      filter: _filter,
      tab: _tab,
      selected: _selected,
      onFilter: (f) => setState(() {
        _filter = f;
        _tab = 0;
      }),
      onTab: (t) => setState(() => _tab = t),
      onQuery: (q) => setState(() => _q = q),
      onSelect: (id) => _select(id, sheet: !wide),
      onRefresh: widget.reload,
    );

    if (!wide) {
      return Column(children: [
        SizedBox(height: MediaQuery.sizeOf(context).height * 0.34, child: map),
        const Divider(),
        Expanded(child: panel),
      ]);
    }
    return Row(children: [
      SizedBox(width: width >= 1200 ? 380 : 330, child: panel),
      const VerticalDivider(width: 1),
      Expanded(
        child: Stack(children: [
          Positioned.fill(child: map),
          AnimatedPositioned(
            duration: CF.complex,
            curve: CF.easeOut,
            top: 12,
            bottom: 12,
            right: selected == null ? -420 : 12,
            width: 390,
            child: selected == null
                ? const SizedBox.shrink()
                : Material(
                    color: CF.card,
                    elevation: 6,
                    shadowColor: const Color(0x330B1220),
                    borderRadius: BorderRadius.circular(CF.radiusLg),
                    clipBehavior: Clip.antiAlias,
                    child: ShipmentDetails(object: selected, onClose: () => setState(() => _selected = null)),
                  ),
          ),
        ]),
      ),
    ]);
  }
}

class _Panel extends StatelessWidget {
  const _Panel({
    required this.data,
    required this.visible,
    required this.filter,
    required this.tab,
    required this.selected,
    required this.onFilter,
    required this.onTab,
    required this.onQuery,
    required this.onSelect,
    required this.onRefresh,
  });
  final OperationsData data;
  final List<LiveObject> visible;
  final _Filter filter;
  final int tab;
  final String? selected;
  final ValueChanged<_Filter> onFilter;
  final ValueChanged<int> onTab;
  final ValueChanged<String> onQuery;
  final ValueChanged<String> onSelect;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: CF.card,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(8, 8, 8, 4),
          child: Row(children: [
            for (final f in _Filter.values)
              Expanded(
                child: _Metric(
                  label: _filters[f]!.$1,
                  value: data.objects.where((o) => _match(f, o.health)).length,
                  health: _filters[f]!.$2,
                  active: filter == f,
                  onTap: () => onFilter(f),
                ),
              ),
          ]),
        ),
        _Tabs(
          index: tab,
          labels: ['Объекты ${visible.length}', 'Внимание ${data.actions.length}', 'События'],
          onTap: onTab,
        ),
        const Divider(),
        Expanded(
          child: RefreshIndicator(
            onRefresh: onRefresh,
            child: switch (tab) {
              1 => _Attention(actions: data.actions),
              2 => _Events(events: data.events),
              _ => _Objects(visible: visible, total: data.objects.length, selected: selected, onSelect: onSelect, onQuery: onQuery),
            },
          ),
        ),
      ]),
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.value, required this.health, required this.active, required this.onTap});
  final String label;
  final int value;
  final Health? health;
  final bool active;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        selected: active,
        label: '$label: $value',
        excludeSemantics: true,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(CF.radiusMd),
          child: AnimatedContainer(
            duration: CF.standard,
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
            decoration: BoxDecoration(
              color: active ? CF.accent : null,
              borderRadius: BorderRadius.circular(CF.radiusMd),
              border: Border.all(color: active ? CF.primary.withValues(alpha: 0.3) : Colors.transparent),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                if (health != null) ...[HealthDot(health!), const SizedBox(width: 5)],
                Text(
                  '$value',
                  style: TextStyle(fontSize: 19, fontWeight: FontWeight.w700, color: health == Health.delayed && value > 0 ? CF.delayed : CF.foreground),
                ),
              ]),
              Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11, color: CF.mutedForeground)),
            ]),
          ),
        ),
      );
}

class _Tabs extends StatelessWidget {
  const _Tabs({required this.index, required this.labels, required this.onTap});
  final int index;
  final List<String> labels;
  final ValueChanged<int> onTap;
  @override
  Widget build(BuildContext context) => SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 8),
        child: Row(children: [
          for (var i = 0; i < labels.length; i++)
            InkWell(
              onTap: () => onTap(i),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                decoration: BoxDecoration(border: Border(bottom: BorderSide(color: i == index ? CF.primary : Colors.transparent, width: 2))),
                child: Text(labels[i], style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: i == index ? CF.foreground : CF.mutedForeground)),
              ),
            ),
        ]),
      );
}

class _Objects extends StatelessWidget {
  const _Objects({required this.visible, required this.total, required this.selected, required this.onSelect, required this.onQuery});
  final List<LiveObject> visible;
  final int total;
  final String? selected;
  final ValueChanged<String> onSelect;
  final ValueChanged<String> onQuery;

  @override
  Widget build(BuildContext context) {
    return ListView(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
        child: TextField(
          onChanged: onQuery,
          decoration: const InputDecoration(prefixIcon: Icon(Icons.search, size: 18), hintText: 'Номер, город, машина, водитель'),
        ),
      ),
      if (total == 0)
        const EmptyView(
          icon: Icons.radar,
          title: 'Активных перевозок нет',
          text: 'Когда перевозчик будет выбран, рейс появится на карте с маршрутом, машиной и водителем.',
        )
      else if (visible.isEmpty)
        const Padding(padding: EdgeInsets.all(24), child: Text('Под фильтр ничего не попало.', textAlign: TextAlign.center))
      else
        for (final o in visible) ShipmentRow(object: o, selected: o.id == selected, onTap: () => onSelect(o.id)),
    ]);
  }
}

/// Строка живого объекта: состояние, номер, срок, маршрут, статус, машина, водитель, прогресс.
class ShipmentRow extends StatelessWidget {
  const ShipmentRow({super.key, required this.object, required this.selected, required this.onTap});
  final LiveObject object;
  final bool selected;
  final VoidCallback onTap;

  String get _eta {
    final o = object;
    if (o.health == Health.done) return 'доставлено';
    if (o.progress > 0 || o.health == Health.delayed || o.health == Health.arriving) return 'до ${Fmt.short(o.deliveryDate)}';
    return 'загр. ${Fmt.short(o.loadingDate)}';
  }

  @override
  Widget build(BuildContext context) {
    final o = object;
    return Semantics(
      button: true,
      selected: selected,
      child: InkWell(
        onTap: onTap,
        child: AnimatedContainer(
          duration: CF.standard,
          decoration: BoxDecoration(
            color: selected ? CF.accent : null,
            border: Border(left: BorderSide(color: selected ? CF.primary : Colors.transparent, width: 3), bottom: const BorderSide(color: CF.border)),
          ),
          padding: const EdgeInsets.fromLTRB(13, 10, 16, 10),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              HealthDot(o.health),
              const SizedBox(width: 8),
              Text(o.publicNumber, style: const TextStyle(fontSize: 12, color: CF.mutedForeground, fontFeatures: [FontFeature.tabularFigures()])),
              const Spacer(),
              Text(
                _eta,
                style: TextStyle(fontSize: 12, color: o.health == Health.delayed ? CF.delayed : CF.mutedForeground, fontWeight: o.health == Health.delayed ? FontWeight.w600 : null),
              ),
            ]),
            const SizedBox(height: 2),
            Text('${o.origin} → ${o.destination}', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
            Text(
              [o.statusLabel, o.vehiclePlate, o.driverName].whereType<String>().join(' · '),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 12, color: CF.mutedForeground),
            ),
            if (o.progress > 0 && o.progress < 1) ...[
              const SizedBox(height: 6),
              ClipRRect(
                borderRadius: BorderRadius.circular(2),
                child: LinearProgressIndicator(
                  value: o.progress,
                  minHeight: 2,
                  backgroundColor: CF.muted,
                  color: o.health == Health.delayed ? CF.delayed : CF.primary,
                ),
              ),
            ],
          ]),
        ),
      ),
    );
  }
}

class _Attention extends StatelessWidget {
  const _Attention({required this.actions});
  final List<ActionItem> actions;
  @override
  Widget build(BuildContext context) {
    if (actions.isEmpty) {
      return ListView(children: const [
        EmptyView(icon: Icons.check_circle_outline, title: 'Всё под контролем', text: 'Действий не требуется: договоры подписаны, получение подтверждено.'),
      ]);
    }
    return ListView(children: [
      for (final a in actions)
        ListTile(
          leading: Icon(
            a.tone == 'danger' ? Icons.report_outlined : (a.tone == 'warning' ? Icons.error_outline : Icons.info_outline),
            color: a.tone == 'danger' ? CF.danger : (a.tone == 'warning' ? CF.warning : CF.info),
          ),
          title: Text(a.title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
          subtitle: Text(a.description),
          trailing: a.orderId != null ? const Icon(Icons.chevron_right) : null,
          onTap: a.orderId == null ? null : () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => OrderDetailScreen(orderId: a.orderId!))),
        ),
    ]);
  }
}

class _Events extends StatelessWidget {
  const _Events({required this.events});
  final List<OperationalEvent> events;
  @override
  Widget build(BuildContext context) {
    if (events.isEmpty) return ListView(children: const [Padding(padding: EdgeInsets.all(24), child: Text('Событий пока нет.'))]);
    return ListView(children: [
      for (final e in events)
        ListTile(
          dense: true,
          leading: Container(width: 8, height: 8, margin: const EdgeInsets.only(top: 6), decoration: BoxDecoration(color: CF.tone(statusTone(e.status)).$1, shape: BoxShape.circle)),
          title: Text('${e.publicNumber} · ${e.title}', style: const TextStyle(fontSize: 13.5)),
          subtitle: e.comment != null ? Text(e.comment!, maxLines: 1, overflow: TextOverflow.ellipsis) : null,
          trailing: Text(Fmt.relative(e.at), style: const TextStyle(fontSize: 12, color: CF.mutedForeground)),
          onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => OrderDetailScreen(orderId: e.orderId))),
        ),
    ]);
  }
}

/// Контекстная панель перевозки: состояние, срок, позиция, машина, водитель, участники, этапы рейса.
class ShipmentDetails extends StatelessWidget {
  const ShipmentDetails({super.key, required this.object, required this.onClose, this.scroll});
  final LiveObject object;
  final VoidCallback onClose;
  final ScrollController? scroll;

  @override
  Widget build(BuildContext context) {
    final o = object;
    Widget fact(String label, String value, {Color? color}) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Overline(label),
          const SizedBox(height: 2),
          Text(value, style: TextStyle(fontSize: 14, color: color), maxLines: 2, overflow: TextOverflow.ellipsis),
        ]);
    final border = o.stops.where((s) => s.type == 'BORDER').firstOrNull?.city;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Text(o.publicNumber, style: const TextStyle(fontSize: 12, color: CF.mutedForeground)),
                const SizedBox(width: 8),
                StatusChip.health(o.health),
              ]),
              const SizedBox(height: 4),
              Text('${o.origin} → ${o.destination}', style: Theme.of(context).textTheme.titleLarge),
              Text('${o.statusLabel} · ${Fmt.relative(o.statusChangedAt)}', style: const TextStyle(fontSize: 12, color: CF.mutedForeground)),
            ]),
          ),
          IconButton(tooltip: 'Закрыть', onPressed: onClose, icon: const Icon(Icons.close)),
        ]),
      ),
      const Divider(),
      Expanded(
        child: ListView(controller: scroll, padding: const EdgeInsets.all(16), children: [
          if (o.progress > 0) ...[
            Row(children: [const Text('Пройдено по рейсу', style: TextStyle(fontSize: 12, color: CF.mutedForeground)), const Spacer(), Text('${(o.progress * 100).round()}%', style: const TextStyle(fontSize: 12))]),
            const SizedBox(height: 4),
            TweenAnimationBuilder<double>(
              tween: Tween(begin: 0, end: o.progress),
              duration: const Duration(milliseconds: 700),
              curve: CF.easeOut,
              builder: (_, v, _) => LinearProgressIndicator(value: v, minHeight: 6, borderRadius: BorderRadius.circular(3), color: o.health == Health.delayed ? CF.delayed : CF.primary, backgroundColor: CF.muted),
            ),
            const SizedBox(height: 16),
          ],
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            childAspectRatio: 3.2,
            mainAxisSpacing: 8,
            crossAxisSpacing: 12,
            children: [
              fact('Доставка до', Fmt.date(o.deliveryDate), color: o.health == Health.delayed ? CF.delayed : null),
              fact('Позиция', o.position == null ? 'нет данных' : (o.positionEstimated ? 'оценка по маршруту' : 'отметка ${Fmt.relative(o.positionAt)}')),
              fact('Машина', o.vehiclePlate == null ? 'не назначена' : '${o.vehiclePlate} · ${o.vehicleModel}'),
              fact('Водитель', [o.driverName ?? 'не назначен', o.driverPhone].whereType<String>().join('\n')),
              fact('Перевозчик', o.carrierName),
              fact('Грузовладелец', o.shipperName),
            ],
          ),
          const SizedBox(height: 8),
          fact('Груз', '${o.title}${o.weightKg != null ? ' · ${Fmt.weight(o.weightKg)}' : ''}'),
          const SizedBox(height: 16),
          const Divider(),
          const SizedBox(height: 12),
          const Overline('Этапы рейса'),
          const SizedBox(height: 10),
          JourneyView(
            compact: true,
            halted: o.status == 'DISPUTED' || o.status == 'ON_HOLD' || o.status == 'CANCELLED',
            steps: journeySteps(
              o.status,
              pickupCity: o.stops.where((s) => s.type == 'PICKUP').firstOrNull?.city,
              borderCity: border,
              deliveryCity: o.stops.where((s) => s.type == 'DELIVERY').lastOrNull?.city,
            ),
          ),
        ]),
      ),
      const Divider(),
      Padding(
        padding: const EdgeInsets.all(12),
        child: FilledButton.icon(
          onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => OrderDetailScreen(orderId: o.id))),
          icon: const Icon(Icons.open_in_new, size: 18),
          label: const Text('Открыть перевозку'),
        ),
      ),
    ]);
  }
}
