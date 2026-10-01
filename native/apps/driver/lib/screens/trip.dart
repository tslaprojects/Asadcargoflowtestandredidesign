import 'dart:io';

import 'package:cargoflow_core/cargoflow_core.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../services/location.dart';
import '../services/outbox.dart';
import 'deliver.dart';

/// Типы документов, которые водитель прикладывает с камеры.
const driverDocTypes = <(String, IconData)>[
  ('CARGO_PHOTO', Icons.inventory_2_outlined),
  ('SEAL_PHOTO', Icons.lock_outline),
  ('CMR', Icons.description_outlined),
  ('PROOF_OF_DELIVERY', Icons.task_alt),
];

/// «Мой рейс»: один экран — следующий шаг крупной кнопкой, этапы, документы с камеры, связь с диспетчером.
class TripScreen extends StatelessWidget {
  const TripScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final api = context.read<ApiClient>();
    final session = context.read<SessionController>();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Мой рейс'),
        actions: [
          if (session.actor?.demo ?? false) const Padding(padding: EdgeInsets.only(right: 12), child: ModeBadge(demo: true)),
        ],
      ),
      body: AsyncView<DriverTrip?>(
        load: () async => DriverTrip.fromJson(await api.get('/api/driver/trip')),
        onUnauthorized: session.expired,
        refreshEvery: const Duration(minutes: 1),
        builder: (context, trip, reload) => trip == null
            ? EmptyView(
                icon: Icons.local_shipping_outlined,
                title: 'Активного рейса нет',
                text: 'Когда диспетчер назначит вас на перевозку, рейс появится здесь.',
                action: 'Обновить',
                onAction: reload,
              )
            : TripView(trip: trip, reload: reload),
      ),
    );
  }
}

class TripView extends StatefulWidget {
  const TripView({super.key, required this.trip, required this.reload});
  final DriverTrip trip;
  final Future<void> Function() reload;

  @override
  State<TripView> createState() => _TripViewState();
}

class _TripViewState extends State<TripView> {
  bool _busy = false;
  final _picker = ImagePicker();

  DriverTrip get trip => widget.trip;

  @override
  void initState() {
    super.initState();
    _syncTracking();
  }

  @override
  void didUpdateWidget(TripView old) {
    super.didUpdateWidget(old);
    if (old.trip.status != trip.status || old.trip.orderId != trip.orderId) _syncTracking();
  }

  void _syncTracking() {
    final loc = context.read<LocationService>();
    if (movingStatuses.contains(trip.status)) {
      loc.follow(trip.orderId);
    } else {
      loc.stop();
    }
  }

  void _toast(String text, {bool error = false}) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(text), backgroundColor: error ? CF.danger : null));
  }

  Future<void> _guard(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
    } on ApiException catch (e) {
      if (e.unauthorized) {
        if (mounted) await context.read<SessionController>().expired();
        return;
      }
      _toast(e.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _transition(DriverAction a) async {
    final comment = await _confirm(a.label);
    if (comment == null || !mounted) return;
    await _guard(() async {
      final loc = context.read<LocationService>();
      final outbox = context.read<Outbox>();
      final fix = await loc.current(timeLimit: const Duration(seconds: 8));
      final sent = await outbox.send(PendingOp(
        kind: 'status',
        orderId: trip.orderId,
        path: '/api/orders/${trip.orderId}/status',
        body: {
          'status': a.to,
          if (comment.isNotEmpty) 'comment': comment,
          if (fix != null) ...{'latitude': fix.latitude, 'longitude': fix.longitude, 'accuracy': fix.accuracy},
        },
        key: ApiClient.idempotencyKey(),
        at: DateTime.now(),
        label: a.label,
      ));
      _toast(sent ? 'Статус обновлён: ${statusLabel(a.to!)}' : 'Нет связи. Отметка «${a.label}» сохранена и уйдёт автоматически.');
      if (sent) await widget.reload();
    });
  }

  Future<void> _sendLocation() => _guard(() async {
        final loc = context.read<LocationService>();
        final access = await loc.ensureAccess();
        if (access != LocationAccess.granted) {
          _toast(locationAccessText(access), error: true);
          return;
        }
        final fix = await loc.current();
        if (fix == null) {
          _toast('Не удалось определить местоположение. Попробуйте на открытом месте.', error: true);
          return;
        }
        final sent = await loc.sendOnce(trip.orderId, fix);
        _toast(sent ? 'Местоположение отправлено' : 'Нет связи. Отметка сохранена и уйдёт автоматически.');
        if (sent) await widget.reload();
      });

  Future<void> _deliver() async {
    final done = await showDeliverSheet(context, trip: trip, onPhoto: () => _capture('PROOF_OF_DELIVERY'));
    if (done == true) {
      _toast('Доставка отмечена. Ждём подтверждения получения от заказчика.');
      await widget.reload();
    }
  }

  /// Фото с камеры (или из галереи) → загрузка документа рейса. Возвращает загруженный документ.
  Future<DocumentItem?> _capture(String type) async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(title: Text(documentLabel(type), style: Theme.of(ctx).textTheme.titleMedium)),
          ListTile(
            leading: const Icon(Icons.photo_camera_outlined),
            title: const Text('Сфотографировать'),
            onTap: () => Navigator.pop(ctx, ImageSource.camera),
          ),
          ListTile(
            leading: const Icon(Icons.photo_library_outlined),
            title: const Text('Выбрать из галереи'),
            onTap: () => Navigator.pop(ctx, ImageSource.gallery),
          ),
        ]),
      ),
    );
    if (source == null) return null;
    final XFile? shot;
    try {
      shot = await _picker.pickImage(source: source, maxWidth: 2400, imageQuality: 82);
    } on Exception {
      _toast('Нет доступа к камере или галерее. Разрешите его в настройках.', error: true);
      return null;
    }
    if (shot == null || !mounted) return null;
    DocumentItem? uploaded;
    await _guard(() async {
      final api = context.read<ApiClient>();
      final res = await api.upload(
        '/api/orders/${trip.orderId}/documents',
        file: File(shot!.path),
        fields: {'type': type},
        filename: '${type.toLowerCase()}_${DateTime.now().millisecondsSinceEpoch}.jpg',
      );
      if (res is Map<String, dynamic>) uploaded = DocumentItem.fromJson(res);
      _toast('${documentLabel(type)}: загружено');
      await widget.reload();
    });
    return uploaded;
  }

  Future<String?> _confirm(String title) {
    final ctrl = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('$title?'),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Диспетчер и заказчик получат уведомление. Приложим ваше местоположение, если оно доступно.'),
          const SizedBox(height: 12),
          TextField(controller: ctrl, decoration: const InputDecoration(labelText: 'Комментарий (необязательно)'), maxLength: 1000),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Отмена')),
          FilledButton(onPressed: () => Navigator.pop(ctx, ctrl.text.trim()), child: const Text('Подтвердить')),
        ],
      ),
    ).whenComplete(ctrl.dispose);
  }

  Future<void> _navigate(RouteStop stop) async {
    final p = stop.point;
    final q = p != null ? '${p.latitude},${p.longitude}' : Uri.encodeComponent('${stop.address ?? ''} ${stop.city}');
    final uri = Platform.isIOS ? Uri.parse('http://maps.apple.com/?daddr=$q') : Uri.parse('geo:0,0?q=$q');
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      await launchUrl(Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$q'), mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final outbox = context.watch<Outbox>();
    final loc = context.watch<LocationService>();
    final step = driverNextStep(trip.status);
    final waiting = outbox.hasPendingStatus(trip.orderId);
    final text = Theme.of(context).textTheme;
    final nextStop = const {'WAITING_FOR_LOADING', 'AT_LOADING', 'VEHICLE_ASSIGNED', 'DRIVER_ASSIGNED'}.contains(trip.status)
        ? trip.pickup
        : trip.delivery;

    return RefreshIndicator(
      onRefresh: () async {
        await outbox.flush();
        await widget.reload();
      },
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          if (outbox.length > 0) _OutboxBanner(count: outbox.length, onRetry: outbox.flush),
          if (outbox.lastRejection != null)
            _Notice(icon: Icons.error_outline, color: CF.danger, text: outbox.lastRejection!, onClose: () {
              outbox.lastRejection = null;
              setState(() {});
            }),
          _Card(children: [
            Row(children: [
              Expanded(child: Text(trip.publicNumber, style: text.labelLarge?.copyWith(color: CF.mutedForeground))),
              StatusChip.order(trip.status),
            ]),
            const SizedBox(height: 8),
            Text('${trip.pickup?.city ?? '—'} → ${trip.delivery?.city ?? '—'}', style: text.headlineSmall),
            const SizedBox(height: 4),
            Text([trip.title, Fmt.weight(trip.weightKg), ?trip.vehicle].where((s) => s.isNotEmpty).join(' · '),
                style: text.bodyMedium?.copyWith(color: CF.mutedForeground)),
          ]),
          _Card(key: const ValueKey('next-step'), children: [
            const Overline('Следующее действие'),
            const SizedBox(height: 6),
            Text(waiting ? 'Отметка ждёт отправки — дождитесь связи.' : step.hint, style: text.bodyLarge),
            const SizedBox(height: 12),
            if (step.primary case final a?)
              _BigButton(
                label: a.label,
                icon: switch (a.kind) {
                  DriverActionKind.location => Icons.my_location,
                  DriverActionKind.deliver => Icons.task_alt,
                  DriverActionKind.transition => Icons.arrow_forward,
                },
                busy: _busy,
                onPressed: waiting
                    ? null
                    : switch (a.kind) {
                        DriverActionKind.location => _sendLocation,
                        DriverActionKind.deliver => _deliver,
                        DriverActionKind.transition => () => _transition(a),
                      },
              ),
            for (final s in step.secondary) ...[
              const SizedBox(height: 8),
              OutlinedButton(
                style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                onPressed: waiting || _busy ? null : () => _transition(s),
                child: Text(s.label),
              ),
            ],
            if (step.primary?.kind != DriverActionKind.location && movingStatuses.contains(trip.status)) ...[
              const SizedBox(height: 8),
              TextButton.icon(onPressed: _busy ? null : _sendLocation, icon: const Icon(Icons.my_location), label: const Text('Отправить местоположение')),
            ],
          ]),
          if (movingStatuses.contains(trip.status))
            _Card(children: [
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: loc.autoEnabled,
                onChanged: (v) => loc.setAuto(v, orderId: trip.orderId),
                title: const Text('Передавать местоположение автоматически'),
                subtitle: Text(loc.error ??
                    (loc.active
                        ? 'Включено — раз в несколько минут, и в фоне. Последняя отметка: ${Fmt.relative(loc.lastSent ?? trip.lastLocationAt)}'
                        : 'Последняя отметка: ${Fmt.relative(trip.lastLocationAt)}')),
              ),
            ]),
          if (nextStop != null)
            _Card(children: [
              const Overline('Следующая точка'),
              const SizedBox(height: 6),
              Text('${nextStop.city}, ${nextStop.country}', style: text.titleMedium),
              if (nextStop.address case final a?) Text(a, style: text.bodyMedium?.copyWith(color: CF.mutedForeground)),
              if (nextStop.plannedFrom case final d?) Text('План: ${Fmt.dateTime(d)}', style: text.bodySmall),
              const SizedBox(height: 8),
              OutlinedButton.icon(onPressed: () => _navigate(nextStop), icon: const Icon(Icons.navigation_outlined), label: const Text('Маршрут в навигаторе')),
            ]),
          _Card(children: [
            const Overline('Этапы'),
            const SizedBox(height: 8),
            JourneyView(
              compact: true,
              halted: const {'DISPUTED', 'ON_HOLD', 'CANCELLED'}.contains(trip.status),
              steps: journeySteps(trip.status, pickupCity: trip.pickup?.city, deliveryCity: trip.delivery?.city),
            ),
          ]),
          _Card(children: [
            const Overline('Документы и фото'),
            const SizedBox(height: 8),
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final (type, icon) in driverDocTypes)
                ActionChip(
                  avatar: Icon(icon, size: 18),
                  label: Text(documentLabel(type)),
                  onPressed: _busy ? null : () => _capture(type),
                ),
            ]),
            const SizedBox(height: 8),
            if (trip.documents.isEmpty)
              Text('Пока ничего не загружено.', style: text.bodyMedium?.copyWith(color: CF.mutedForeground))
            else
              for (final d in trip.documents)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.insert_drive_file_outlined),
                  title: Text(documentLabel(d.type)),
                  subtitle: Text('${d.filename} · ${Fmt.relative(d.createdAt)}', maxLines: 1, overflow: TextOverflow.ellipsis),
                  onTap: () => openDocument(context, context.read<ApiClient>(), d),
                ),
          ]),
          _Card(children: [
            const Overline('Связь'),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.support_agent),
              title: Text(trip.carrierName ?? 'Перевозчик'),
              subtitle: Text(trip.carrierPhone ?? 'Телефон диспетчера не указан'),
              trailing: trip.carrierPhone == null
                  ? null
                  : IconButton.filledTonal(
                      tooltip: 'Позвонить диспетчеру',
                      icon: const Icon(Icons.call),
                      onPressed: () => launchUrl(Uri(scheme: 'tel', path: trip.carrierPhone)),
                    ),
            ),
            if (trip.shipperName case final s?) Text('Грузовладелец: $s', style: text.bodySmall),
            if (trip.cargoNotes case final n? when n.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text('Примечание к грузу: $n', style: text.bodyMedium),
            ],
          ]),
        ],
      ),
    );
  }
}

class _BigButton extends StatelessWidget {
  const _BigButton({required this.label, required this.icon, required this.onPressed, this.busy = false});
  final String label;
  final IconData icon;
  final VoidCallback? onPressed;
  final bool busy;
  @override
  Widget build(BuildContext context) => FilledButton.icon(
        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(60), textStyle: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
        onPressed: busy ? null : onPressed,
        icon: busy ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2)) : Icon(icon),
        label: Text(label),
      );
}

class _Card extends StatelessWidget {
  const _Card({super.key, required this.children});
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(top: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: CF.card, borderRadius: BorderRadius.circular(CF.radiusXl), border: Border.all(color: CF.border)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
      );
}

class _OutboxBanner extends StatelessWidget {
  const _OutboxBanner({required this.count, required this.onRetry});
  final int count;
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) => _Notice(
        icon: Icons.cloud_off_outlined,
        color: CF.warning,
        text: 'Нет связи с сервером. Ждут отправки: $count. Отправим автоматически.',
        action: TextButton(onPressed: onRetry, child: const Text('Повторить')),
      );
}

class _Notice extends StatelessWidget {
  const _Notice({required this.icon, required this.color, required this.text, this.action, this.onClose});
  final IconData icon;
  final Color color;
  final String text;
  final Widget? action;
  final VoidCallback? onClose;
  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(top: 8),
        padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
        decoration: BoxDecoration(color: color.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(CF.radiusLg), border: Border.all(color: color.withValues(alpha: 0.3))),
        child: Row(children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: TextStyle(color: color))),
          ?action,
          if (onClose != null) IconButton(onPressed: onClose, icon: const Icon(Icons.close, size: 18), tooltip: 'Скрыть'),
        ]),
      );
}
