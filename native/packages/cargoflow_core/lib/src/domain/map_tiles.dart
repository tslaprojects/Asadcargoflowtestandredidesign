/// Подложка карт. Ключ Geoapify задаётся при сборке: `--dart-define=GEOAPIFY_KEY=...` (публичный ключ карт,
/// ограниченный по приложению в кабинете Geoapify). Без ключа — тайлы OpenStreetMap: только для разработки,
/// политика OSM запрещает продакшен-нагрузку на их тайл-серверы.
class MapTiles {
  const MapTiles._();

  static const geoapifyKey = String.fromEnvironment('GEOAPIFY_KEY');

  /// Светло-серый стиль: подложка не спорит со статусами объектов.
  static const geoapifyStyle = 'positron';

  static bool get usesGeoapify => geoapifyKey.isNotEmpty;

  static String urlTemplate({String key = geoapifyKey}) => key.isEmpty
      ? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
      : 'https://maps.geoapify.com/v1/tile/$geoapifyStyle/{z}/{x}/{y}.png?apiKey=$key';

  static String attribution({String key = geoapifyKey}) =>
      key.isEmpty ? '© OpenStreetMap contributors' : 'Powered by Geoapify · © OpenMapTiles · © OpenStreetMap contributors';
}
