import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../domain/map_tiles.dart';
import '../models/operations.dart';
import '../theme/tokens.dart';

/// Объект на карте: позиция, маршрут и состояние.
class MapItem {
  const MapItem({required this.id, required this.label, required this.health, this.position, this.route = const []});
  final String id;
  final String label;
  final Health health;
  final LatLng? position;
  final List<LatLng> route;
}

/// Приглушённая подложка: насыщенность снижена, чтобы объекты и состояния читались первыми.
const _muted = ColorFilter.matrix(<double>[
  0.55, 0.40, 0.05, 0, 18, //
  0.30, 0.65, 0.05, 0, 18, //
  0.30, 0.40, 0.30, 0, 18, //
  0, 0, 0, 1, 0,
]);

/// Нативная карта (flutter_map, тайлы OpenStreetMap): маркеры по состоянию, маршруты, выбор объекта,
/// переход камеры к выбранному объекту.
class LiveMap extends StatefulWidget {
  const LiveMap({super.key, required this.items, this.selectedId, this.onSelect, this.padding = const EdgeInsets.all(48)});
  final List<MapItem> items;
  final String? selectedId;
  final ValueChanged<String>? onSelect;
  final EdgeInsets padding;

  @override
  State<LiveMap> createState() => _LiveMapState();
}

class _LiveMapState extends State<LiveMap> {
  final _map = MapController();
  bool _ready = false;

  List<LatLng> _points(Iterable<MapItem> items) => [
        for (final i in items) ...[...i.route, if (i.position != null) i.position!],
      ];

  void _fit({bool animate = false}) {
    if (!_ready) return;
    final sel = widget.items.where((i) => i.id == widget.selectedId);
    final pts = _points(sel.isNotEmpty ? sel : widget.items);
    if (pts.isEmpty) return;
    if (pts.length == 1) {
      _map.move(pts.first, 7);
      return;
    }
    _map.fitCamera(CameraFit.coordinates(coordinates: pts, padding: widget.padding, maxZoom: 8));
  }

  @override
  void didUpdateWidget(covariant LiveMap old) {
    super.didUpdateWidget(old);
    if (old.selectedId != widget.selectedId) WidgetsBinding.instance.addPostFrameCallback((_) => _fit(animate: true));
  }

  @override
  Widget build(BuildContext context) {
    final selected = widget.items.where((i) => i.id == widget.selectedId).firstOrNull;
    return Semantics(
      label: 'Карта: объектов ${widget.items.length}',
      child: FlutterMap(
        mapController: _map,
        options: MapOptions(
          initialCenter: const LatLng(46, 66),
          initialZoom: 3,
          backgroundColor: const Color(0xFFEEF1F5),
          interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
          onMapReady: () {
            _ready = true;
            _fit();
          },
        ),
        children: [
          TileLayer(
            urlTemplate: MapTiles.urlTemplate(),
            userAgentPackageName: 'kz.cargoflow.app',
            // Стиль Geoapify уже приглушён; тайлы OSM приглушаем фильтром
            tileBuilder: MapTiles.usesGeoapify ? null : (context, tile, _) => ColorFiltered(colorFilter: _muted, child: tile),
          ),
          PolylineLayer(polylines: [
            for (final i in widget.items)
              if (i.route.length > 1 && i.id != widget.selectedId)
                Polyline(points: i.route, color: CF.healthColor(i.health).withValues(alpha: 0.35), strokeWidth: 2),
            if (selected != null && selected.route.length > 1) ...[
              Polyline(points: selected.route, color: Colors.white, strokeWidth: 7),
              Polyline(points: selected.route, color: CF.healthColor(selected.health), strokeWidth: 3.5),
            ],
          ]),
          MarkerLayer(markers: [
            for (final i in widget.items)
              if (i.position != null)
                Marker(
                  point: i.position!,
                  width: 44,
                  height: 44,
                  child: Semantics(
                    button: true,
                    selected: i.id == widget.selectedId,
                    label: i.label,
                    child: GestureDetector(
                      onTap: () => widget.onSelect?.call(i.id),
                      child: Center(
                        child: AnimatedContainer(
                          duration: CF.standard,
                          curve: CF.easeOut,
                          width: i.id == widget.selectedId ? 22 : 14,
                          height: i.id == widget.selectedId ? 22 : 14,
                          decoration: BoxDecoration(
                            color: CF.healthColor(i.health),
                            shape: BoxShape.circle,
                            border: Border.all(color: Colors.white, width: 2.5),
                            boxShadow: [
                              const BoxShadow(color: Color(0x590B1220), blurRadius: 4, offset: Offset(0, 1)),
                              if (i.id == widget.selectedId) BoxShadow(color: CF.healthColor(i.health).withValues(alpha: 0.25), spreadRadius: 6),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
          ]),
          RichAttributionWidget(attributions: [TextSourceAttribution(MapTiles.attribution())]),
          Positioned(
            top: 12,
            right: 12,
            child: Material(
              color: CF.card,
              elevation: 1,
              borderRadius: BorderRadius.circular(CF.radiusMd),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                IconButton(tooltip: 'Приблизить', icon: const Icon(Icons.add, size: 18), onPressed: () => _map.move(_map.camera.center, _map.camera.zoom + 1)),
                IconButton(tooltip: 'Отдалить', icon: const Icon(Icons.remove, size: 18), onPressed: () => _map.move(_map.camera.center, _map.camera.zoom - 1)),
                IconButton(tooltip: 'Показать все объекты', icon: const Icon(Icons.fit_screen_outlined, size: 18), onPressed: _fit),
              ]),
            ),
          ),
        ],
      ),
    );
  }
}
