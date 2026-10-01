import 'package:cargoflow_core/cargoflow_core.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/location.dart';
import '../services/outbox.dart';

/// «Груз доставлен»: фото / подписанная CMR, комментарий, местоположение. true — отмечено (или в очереди).
Future<bool?> showDeliverSheet(BuildContext context, {required DriverTrip trip, required Future<DocumentItem?> Function() onPhoto}) =>
    showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => DeliverSheet(trip: trip, onPhoto: onPhoto),
    );

class DeliverSheet extends StatefulWidget {
  const DeliverSheet({super.key, required this.trip, required this.onPhoto});
  final DriverTrip trip;
  final Future<DocumentItem?> Function() onPhoto;

  @override
  State<DeliverSheet> createState() => _DeliverSheetState();
}

class _DeliverSheetState extends State<DeliverSheet> {
  static const _proof = {'PROOF_OF_DELIVERY', 'CMR', 'CARGO_PHOTO'};
  late final List<DocumentItem> _docs = widget.trip.documents.where((d) => _proof.contains(d.type)).toList();
  late final Set<String> _selected = _docs.where((d) => d.type != 'CARGO_PHOTO').map((d) => d.id).toSet();
  final _comment = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _photo() async {
    final d = await widget.onPhoto();
    if (d != null && mounted) {
      setState(() {
        _docs.insert(0, d);
        _selected.add(d.id);
      });
    }
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final loc = context.read<LocationService>();
    final outbox = context.read<Outbox>();
    final nav = Navigator.of(context);
    try {
      final fix = await loc.current(timeLimit: const Duration(seconds: 8));
      final id = widget.trip.orderId;
      await outbox.send(PendingOp(
        kind: 'status',
        orderId: id,
        path: '/api/orders/$id/deliver',
        body: {
          'documentIds': _selected.toList(),
          if (_comment.text.trim().isNotEmpty) 'comment': _comment.text.trim(),
          if (fix != null) ...{'latitude': fix.latitude, 'longitude': fix.longitude, 'accuracy': fix.accuracy},
        },
        key: ApiClient.idempotencyKey(),
        at: DateTime.now(),
        label: 'Груз доставлен',
      ));
      nav.pop(true);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
          Text('Груз доставлен', style: text.titleLarge),
          const SizedBox(height: 4),
          Text('Приложите подписанную CMR или фото подтверждения доставки — заказчик подтвердит получение.',
              style: text.bodyMedium?.copyWith(color: CF.mutedForeground)),
          const SizedBox(height: 12),
          for (final d in _docs)
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: _selected.contains(d.id),
              onChanged: (v) => setState(() => v == true ? _selected.add(d.id) : _selected.remove(d.id)),
              title: Text(documentLabel(d.type)),
              subtitle: Text(d.filename, maxLines: 1, overflow: TextOverflow.ellipsis),
            ),
          OutlinedButton.icon(
            onPressed: _busy ? null : _photo,
            icon: const Icon(Icons.photo_camera_outlined),
            label: const Text('Сфотографировать подтверждение'),
          ),
          const SizedBox(height: 12),
          TextField(controller: _comment, maxLength: 1000, decoration: const InputDecoration(labelText: 'Комментарий (необязательно)')),
          if (_error != null) Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(_error!, style: const TextStyle(color: CF.danger))),
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56)),
            onPressed: _busy ? null : _submit,
            child: Text(_selected.isEmpty ? 'Отметить без документов' : 'Отметить доставку · документов: ${_selected.length}'),
          ),
        ]),
      ),
    );
  }
}
