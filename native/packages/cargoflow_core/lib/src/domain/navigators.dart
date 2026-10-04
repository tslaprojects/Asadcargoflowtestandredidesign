/// Навигаторы водителя: Яндекс, 2ГИС, Google. Ссылки — в порядке попытки: приложение(я) → веб.
/// Есть координаты — передаются они; нет — адрес и город (поиск).
/// Порядок координат: Яндекс и Google — lat,lon; 2ГИС — lon,lat.
/// Та же логика, что src/lib/geo/navigators.ts в веб-версии.
enum NavigatorApp { yandex, dgis, google }

extension NavigatorAppLabel on NavigatorApp {
  String get label => switch (this) {
    NavigatorApp.yandex => 'Яндекс Навигатор',
    NavigatorApp.dgis => '2ГИС',
    NavigatorApp.google => 'Google Карты',
  };
}

class NavTarget {
  const NavTarget({this.lat, this.lng, this.address, this.city});
  final double? lat;
  final double? lng;
  final String? address;
  final String? city;

  bool get hasPoint => lat != null && lng != null && lat!.isFinite && lng!.isFinite;
  String get query => [address, city].where((s) => s != null && s.trim().isNotEmpty).join(', ');
}

String _c(double v) {
  final s = (v * 1e6).round() / 1e6;
  return s == s.truncateToDouble() ? s.toStringAsFixed(1).replaceAll(RegExp(r'\.0$'), '') : s.toString();
}

List<Uri> navigatorUris(NavigatorApp app, NavTarget t, {bool ios = false}) {
  final q = Uri.encodeComponent(t.query);
  switch (app) {
    case NavigatorApp.yandex:
      if (t.hasPoint) {
        final ll = '${_c(t.lat!)},${_c(t.lng!)}';
        return [
          Uri.parse('yandexnavi://build_route_on_map?lat_to=${_c(t.lat!)}&lon_to=${_c(t.lng!)}'),
          Uri.parse('yandexmaps://maps.yandex.ru/?rtext=~$ll&rtt=auto'),
          Uri.parse('https://yandex.ru/maps/?rtext=~$ll&rtt=auto'),
        ];
      }
      return [
        Uri.parse('yandexnavi://map_search?text=$q'),
        Uri.parse('yandexmaps://maps.yandex.ru/?rtext=~$q&rtt=auto'),
        Uri.parse('https://yandex.ru/maps/?rtext=~$q&rtt=auto'),
      ];
    case NavigatorApp.dgis:
      if (t.hasPoint) {
        // 2ГИС: сначала долгота, потом широта
        final lonLat = '${_c(t.lng!)},${_c(t.lat!)}';
        return [
          Uri.parse('dgis://2gis.ru/routeSearch/rsType/car/to/$lonLat'),
          Uri.parse('https://2gis.ru/routeSearch/rsType/car/to/$lonLat'),
        ];
      }
      return [Uri.parse('dgis://2gis.ru/search/$q'), Uri.parse('https://2gis.ru/search/$q')];
    case NavigatorApp.google:
      final dest = t.hasPoint ? '${_c(t.lat!)},${_c(t.lng!)}' : q;
      final web = Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$dest&travelmode=driving');
      return ios ? [Uri.parse('comgooglemaps://?daddr=$dest&directionsmode=driving'), web] : [web];
  }
}
