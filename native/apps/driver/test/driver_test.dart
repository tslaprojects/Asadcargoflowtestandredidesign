import 'dart:convert';

import 'package:cargoflow_core/cargoflow_core.dart';
import 'package:cargoflow_driver/main.dart';
import 'package:cargoflow_driver/services/location.dart';
import 'package:cargoflow_driver/services/navigator.dart';
import 'package:cargoflow_driver/services/outbox.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';

Map<String, dynamic> _ok(Object? data) => {'success': true, 'data': data};
http.Response _json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json; charset=utf-8'});

const _orderId = '00000000-0000-0000-0000-000000000042';

final _me = {
  'userId': 'u-driver',
  'email': 'driver@cargoflow.demo',
  'fullName': 'Водитель Демо',
  'isAdmin': false,
  'dataMode': 'demo',
  'memberships': [],
  'active': {
    'companyId': 'c2',
    'role': 'DRIVER',
    'company': {'legalName': 'Demo Carrier', 'type': 'CARRIER'},
  },
  'permissions': ['ORDER_VIEW', 'ORDER_STATUS_UPDATE'],
};

Map<String, dynamic> _trip(String status) => {
      'order': {
        'id': _orderId,
        'publicNumber': 'CF-O-000042',
        'currentStatus': status,
        'load': {
          'title': 'Запчасти',
          'weightKg': 12000,
          'routeDistanceKm': 806.4,
          'routeDurationMin': 690,
          'routeSource': 'PROVIDER',
          'stops': [
            {'type': 'PICKUP', 'city': 'Алматы', 'country': 'KZ', 'latitude': 43.2, 'longitude': 76.9},
            {'type': 'DELIVERY', 'city': 'Ташкент', 'country': 'UZ', 'latitude': 41.3, 'longitude': 69.2},
          ],
        },
        'vehicle': {'plateNumber': '777AAA02', 'make': 'Volvo', 'model': 'FH'},
        'carrier': {'legalName': 'Demo Carrier', 'phone': '+7 700 000 00 01'},
        'shipper': {'legalName': 'Demo Shipper'},
      },
      'lastLocation': null,
      'documents': [],
    };

void main() {
  setUpAll(() => initializeDateFormatting('ru'));
  navigatorTests();

  group('Outbox', () {
    setUp(() => SharedPreferences.setMockInitialValues({}));

    PendingOp op(String label) => PendingOp(
          kind: 'tracking',
          orderId: _orderId,
          path: '/api/orders/$_orderId/tracking',
          body: {'latitude': 43.2, 'longitude': 76.9, 'label': label},
          key: ApiClient.idempotencyKey(),
          at: DateTime.now(),
          label: label,
        );

    test('без сети — в очередь; при связи — отправка по порядку с тем же idempotency-key; очередь переживает перезапуск', () async {
      var online = false;
      final sent = <http.Request>[];
      final client = MockClient((req) async {
        if (!online) throw http.ClientException('offline');
        sent.add(req);
        return _json(_ok({'id': 'e'}), 201);
      });
      final api = ApiClient(baseUrl: 'http://test', tokens: _NoTokens(), httpClient: client);
      final outbox = Outbox(api);
      await outbox.load();

      final a = op('a');
      expect(await outbox.send(a), isFalse);
      expect(await outbox.send(op('b')), isFalse);
      expect(outbox.length, 2);

      // «Перезапуск приложения»: очередь читается с устройства
      final restored = Outbox(api);
      await restored.load();
      expect(restored.length, 2);

      online = true;
      await restored.flush();
      expect(restored.length, 0);
      expect(sent.map((r) => (jsonDecode(r.body) as Map)['label']), ['a', 'b']);
      expect(sent.first.headers['idempotency-key'], a.key);
    });

    test('отклонённая сервером операция удаляется из очереди и показывается водителю', () async {
      var online = false;
      final client = MockClient((req) async {
        if (!online) throw http.ClientException('offline');
        return _json({'success': false, 'error': {'code': 'INVALID_TRANSITION', 'message': 'Статус уже изменён'}}, 409);
      });
      final outbox = Outbox(ApiClient(baseUrl: 'http://test', tokens: _NoTokens(), httpClient: client));
      await outbox.load();
      await outbox.send(op('Прибыл'));
      online = true;
      await outbox.flush();
      expect(outbox.length, 0);
      expect(outbox.lastRejection, contains('Статус уже изменён'));
    });
  });

  testWidgets('водитель: вход → рейс → «Я прибыл на загрузку» без сети → очередь → отправка', (tester) async {
    FlutterSecureStorage.setMockInitialValues({});
    SharedPreferences.setMockInitialValues({});
    var online = true;
    var status = 'WAITING_FOR_LOADING';
    final statusRequests = <http.Request>[];
    final client = MockClient((req) async {
      final path = req.url.path;
      if (path == '/api/orders/$_orderId/status') {
        if (!online) throw http.ClientException('offline');
        statusRequests.add(req);
        status = (jsonDecode(req.body) as Map)['status'] as String;
        return _json(_ok({'id': _orderId}));
      }
      return _json(switch (path) {
        '/api/auth/login' => _ok({'token': 'drv_' * 10, 'dataMode': 'demo'}),
        '/api/auth/me' => _ok(_me),
        '/api/driver/trip' => _ok(_trip(status)),
        '/api/driver/trips' => _ok({'items': [], 'total': 0, 'page': 1, 'pageSize': 50}),
        '/api/driver/profile' => _ok([]),
        _ => {'success': false, 'error': {'code': 'NOT_FOUND', 'message': 'нет'}},
      });
    });
    final tokens = SecureTokenStore();
    final api = ApiClient(baseUrl: 'http://test', tokens: tokens, httpClient: client);
    final session = SessionController(api: api, tokens: tokens);
    final outbox = Outbox(api);
    final location = LocationService(outbox, locate: (_) async => (latitude: 43.25, longitude: 76.95, accuracy: 12.0));
    await outbox.load();

    tester.view.physicalSize = const Size(430, 932);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(DriverApp(session: session, outbox: outbox, location: location));
    await session.restore();
    await tester.pumpAndSettle();
    api.baseUrl = 'http://test';

    expect(find.text('CargoFlow Водитель'), findsWidgets);
    await tester.tap(find.text('Демо-база'));
    await tester.enterText(find.widgetWithText(TextFormField, 'Email'), 'driver@cargoflow.demo');
    await tester.enterText(find.widgetWithText(TextFormField, 'Пароль'), 'Demo1234!');
    await tester.tap(find.widgetWithText(FilledButton, 'Войти'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));

    expect(find.text('Алматы → Ташкент'), findsOneWidget);
    expect(find.text('Демо-база: учебные данные'), findsOneWidget);

    // Нет сети: отметка сохраняется в очередь
    online = false;
    await tester.tap(find.text('Я прибыл на загрузку'));
    await tester.pumpAndSettle();
    expect(find.text('Я прибыл на загрузку?'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Подтвердить'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(outbox.length, 1);
    expect(find.textContaining('Ждут отправки: 1'), findsOneWidget);
    expect(find.text('Отметка ждёт отправки — дождитесь связи.'), findsOneWidget);

    // Связь появилась
    online = true;
    await tester.tap(find.text('Повторить'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(outbox.length, 0);
    expect(statusRequests.single.headers['idempotency-key'], isNotEmpty);
    final body = jsonDecode(statusRequests.single.body) as Map;
    expect(body['status'], 'AT_LOADING');
    expect(body['latitude'], 43.25);

    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(minutes: 2));
  });
}

void navigatorTests() {
  testWidgets('навигатор: выбор 2ГИС → нет приложения → веб (lon,lat); выбор запоминается и предлагается первым', (tester) async {
    FlutterSecureStorage.setMockInitialValues({});
    SharedPreferences.setMockInitialValues({});
    final client = MockClient((req) async => _json(switch (req.url.path) {
          '/api/auth/login' => _ok({'token': 'drv_' * 10, 'dataMode': 'demo'}),
          '/api/auth/me' => _ok(_me),
          '/api/driver/trip' => _ok(_trip('WAITING_FOR_LOADING')),
          '/api/driver/trips' => _ok({'items': [], 'total': 0, 'page': 1, 'pageSize': 50}),
          '/api/driver/profile' => _ok([]),
          _ => {'success': false, 'error': {'code': 'NOT_FOUND', 'message': 'нет'}},
        }));
    final tokens = SecureTokenStore();
    final api = ApiClient(baseUrl: 'http://test', tokens: tokens, httpClient: client);
    final session = SessionController(api: api, tokens: tokens);
    final outbox = Outbox(api);
    final opened = <Uri>[];
    final launcher = NavigatorLauncher(
      ios: false,
      canLaunch: (u) async => false, // приложения навигаторов не установлены
      launch: (u) async {
        opened.add(u);
        return true;
      },
    );

    tester.view.physicalSize = const Size(430, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(DriverApp(session: session, outbox: outbox, location: LocationService(outbox, locate: (_) async => null), navigator: launcher));
    await session.restore();
    await tester.pumpAndSettle();
    api.baseUrl = 'http://test';
    await tester.tap(find.text('Демо-база'));
    await tester.enterText(find.widgetWithText(TextFormField, 'Email'), 'driver@cargoflow.demo');
    await tester.enterText(find.widgetWithText(TextFormField, 'Пароль'), 'Demo1234!');
    await tester.tap(find.widgetWithText(FilledButton, 'Войти'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));

    // Километраж маршрута по дорогам
    expect(find.textContaining('806 км'), findsOneWidget);

    await tester.ensureVisible(find.text('Маршрут в навигаторе'));
    await tester.tap(find.text('Маршрут в навигаторе'));
    await tester.pumpAndSettle();
    expect(find.text('Яндекс Навигатор'), findsOneWidget);
    expect(find.text('2ГИС'), findsOneWidget);
    expect(find.text('Google Карты'), findsOneWidget);
    await tester.tap(find.text('2ГИС'));
    await tester.pumpAndSettle();
    // Следующая точка — загрузка в Алматы; 2ГИС: сначала долгота
    expect(opened.single.toString(), 'https://2gis.ru/routeSearch/rsType/car/to/76.9,43.2');

    await tester.tap(find.text('Маршрут в навигаторе'));
    await tester.pumpAndSettle();
    final tiles = tester.widgetList<ListTile>(find.byType(ListTile)).where((t) => t.key is ValueKey<String>).toList();
    expect((tiles.first.key! as ValueKey<String>).value, 'navigator-dgis');
    expect(find.text('последний выбор'), findsOneWidget);

    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(minutes: 2));
  });
}

class _NoTokens implements TokenSource {
  @override
  Future<String?> read() async => null;
}
