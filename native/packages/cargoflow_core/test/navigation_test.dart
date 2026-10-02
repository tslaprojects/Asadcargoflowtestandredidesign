import 'package:cargoflow_core/cargoflow_core.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const almaty = NavTarget(lat: 43.238949, lng: 76.889709, city: 'Алматы');

  group('ссылки навигаторов', () {
    test('Яндекс: Навигатор → Яндекс Карты → веб, lat,lon', () {
      final u = navigatorUris(NavigatorApp.yandex, almaty).map((e) => e.toString()).toList();
      expect(u, [
        'yandexnavi://build_route_on_map?lat_to=43.238949&lon_to=76.889709',
        'yandexmaps://maps.yandex.ru/?rtext=~43.238949,76.889709&rtt=auto',
        'https://yandex.ru/maps/?rtext=~43.238949,76.889709&rtt=auto',
      ]);
    });

    test('2ГИС: порядок lon,lat; приложение → веб', () {
      final u = navigatorUris(NavigatorApp.dgis, almaty).map((e) => e.toString()).toList();
      expect(u, [
        'dgis://2gis.ru/routeSearch/rsType/car/to/76.889709,43.238949',
        'https://2gis.ru/routeSearch/rsType/car/to/76.889709,43.238949',
      ]);
    });

    test('Google: веб-маршрут; на iOS сначала приложение', () {
      expect(navigatorUris(NavigatorApp.google, almaty).single.toString(),
          'https://www.google.com/maps/dir/?api=1&destination=43.238949,76.889709&travelmode=driving');
      final ios = navigatorUris(NavigatorApp.google, almaty, ios: true);
      expect(ios.first.toString(), 'comgooglemaps://?daddr=43.238949,76.889709&directionsmode=driving');
      expect(ios.last.scheme, 'https');
    });

    test('без координат — адрес и город', () {
      const t = NavTarget(address: 'ул. Абая, 1', city: 'Алматы');
      final y = navigatorUris(NavigatorApp.yandex, t).last.toString();
      expect(Uri.decodeFull(y), contains('ул. Абая, 1, Алматы'));
      expect(navigatorUris(NavigatorApp.dgis, t).last.toString(), startsWith('https://2gis.ru/search/'));
      expect(Uri.decodeFull(navigatorUris(NavigatorApp.google, t).single.toString()), contains('destination=ул. Абая, 1, Алматы'));
    });
  });

  group('карта и маршрут', () {
    test('подложка: без ключа — OSM, с ключом — Geoapify', () {
      expect(MapTiles.urlTemplate(key: ''), contains('tile.openstreetmap.org'));
      expect(MapTiles.urlTemplate(key: 'k'), 'https://maps.geoapify.com/v1/tile/positron/{z}/{x}/{y}.png?apiKey=k');
      expect(MapTiles.attribution(key: 'k'), contains('Geoapify'));
    });

    test('линия маршрута с сервера: [lng, lat] → LatLng', () {
      final line = parseRouteLine([
        [76.9, 43.2],
        [69.2, 41.3],
      ]);
      expect(line.first.latitude, 43.2);
      expect(line.first.longitude, 76.9);
      expect(parseRouteLine([[1, 2]]), isEmpty);
      expect(parseRouteLine('x'), isEmpty);
    });

    test('километраж и время в пути', () {
      expect(Fmt.distance(1240.4).replaceAll(' ', ' '), '1 240 км');
      expect(Fmt.distance(1240.4, estimate: true).replaceAll(' ', ' '), '≈ 1 240 км (оценка)');
      expect(Fmt.duration(45), '45 мин');
      expect(Fmt.duration(1110), '18 ч 30 мин');
      expect(Fmt.duration(3120), '2 д 4 ч');
    });
  });
}
