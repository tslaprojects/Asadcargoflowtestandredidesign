import 'dart:convert';

import 'package:cargoflow/main.dart';
import 'package:cargoflow_core/cargoflow_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';

Map<String, dynamic> _ok(Object data) => {'success': true, 'data': data};

final _me = {
  'userId': 'u1',
  'email': 'shipper@cargoflow.demo',
  'fullName': 'Айгерим Нурланова',
  'isAdmin': false,
  'dataMode': 'demo',
  'memberships': [],
  'active': {
    'companyId': 'c1',
    'role': 'SHIPPER',
    'company': {'legalName': 'Demo Cargo Kazakhstan', 'type': 'SHIPPER'},
  },
  'permissions': ['ORDER_VIEW'],
};

final _ops = {
  'kind': 'customer',
  'objects': [
    {
      'id': '00000000-0000-0000-0000-000000000001',
      'publicNumber': 'CF-O-000008',
      'status': 'IN_TRANSIT',
      'statusLabel': 'В пути',
      'health': 'delayed',
      'statusChangedAt': '2026-10-01T08:00:00Z',
      'loadingDate': '2026-09-28T08:00:00Z',
      'deliveryDate': '2026-09-30T08:00:00Z',
      'title': 'Оборудование',
      'weightKg': 18000,
      'origin': 'Алматы',
      'destination': 'Москва',
      'stops': [
        {'type': 'PICKUP', 'city': 'Алматы', 'country': 'KZ', 'point': {'lat': 43.2, 'lng': 76.9}},
        {'type': 'DELIVERY', 'city': 'Москва', 'country': 'RU', 'point': {'lat': 55.7, 'lng': 37.6}},
      ],
      'position': {'lat': 50.0, 'lng': 60.0, 'at': '2026-10-01T07:00:00Z', 'source': 'tracking'},
      'progress': 0.5,
      'vehicle': {'id': 'v', 'plateNumber': '123ABC', 'make': 'MAN', 'model': 'TGX'},
      'driver': {'id': 'd', 'fullName': 'Ivan Petrov', 'phone': '+7 700 000 00 00'},
      'carrier': {'id': 'c2', 'legalName': 'ABC Logistics'},
      'shipper': {'id': 'c1', 'legalName': 'Demo Cargo Kazakhstan'},
    },
  ],
  'indicators': {},
  'events': [],
  'actions': [
    {'key': 'k', 'title': 'Подпишите договор CF-O-000013', 'description': 'Договор ожидает вашей подписи', 'href': '/orders/x?tab=contract', 'tone': 'warning'},
  ],
};

void main() {
  setUpAll(() => initializeDateFormatting('ru'));

  testWidgets('вход в демо-базу → токен → операции: перевозка, задержка, внимание', (tester) async {
    FlutterSecureStorage.setMockInitialValues({});
    SharedPreferences.setMockInitialValues({});
    final requests = <http.Request>[];
    final client = MockClient((req) async {
      requests.add(req);
      final body = switch (req.url.path) {
        '/api/auth/login' => _ok({'token': 'tok_' * 10, 'dataMode': 'demo'}),
        '/api/auth/me' => _ok(_me),
        '/api/operations' => _ok(_ops),
        _ => {'success': false, 'error': {'code': 'NOT_FOUND', 'message': 'нет'}},
      };
      return http.Response(jsonEncode(body), 200, headers: {'content-type': 'application/json; charset=utf-8'});
    });
    final tokens = SecureTokenStore();
    final api = ApiClient(baseUrl: 'http://test', tokens: tokens, httpClient: client);
    final session = SessionController(api: api, tokens: tokens);

    tester.view.physicalSize = const Size(1400, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(CargoFlowApp(session: session));
    await session.restore();
    await tester.pumpAndSettle();
    api.baseUrl = 'http://test';

    expect(find.text('Вход'), findsOneWidget);
    await tester.tap(find.text('Демо-база'));
    await tester.enterText(find.widgetWithText(TextFormField, 'Email'), 'shipper@cargoflow.demo');
    await tester.enterText(find.widgetWithText(TextFormField, 'Пароль'), 'Demo1234!');
    await tester.tap(find.widgetWithText(FilledButton, 'Войти'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    final login = requests.firstWhere((r) => r.url.path == '/api/auth/login');
    expect(login.headers['x-cargoflow-client'], 'native');
    expect(jsonDecode(login.body)['dataMode'], 'demo');
    final me = requests.firstWhere((r) => r.url.path == '/api/auth/me');
    expect(me.headers['authorization'], startsWith('Bearer tok_'));

    await tester.pump(const Duration(seconds: 1));
    expect(find.text('Операции'), findsWidgets);
    expect(find.text('Алматы → Москва'), findsOneWidget);
    expect(find.text('Демо'), findsOneWidget);
    // Задержка видна в индикаторе
    expect(find.bySemanticsLabel('Задержка: 1'), findsOneWidget);

    await tester.tap(find.textContaining('Внимание'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Подпишите договор CF-O-000013'), findsOneWidget);

    // Снимаем дерево, чтобы таймеры автообновления и анимации были освобождены
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(minutes: 2));
  });
}
