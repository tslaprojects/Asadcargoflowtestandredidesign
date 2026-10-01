import 'package:cargoflow_core/cargoflow_core.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

void main() {
  setUpAll(() => initializeDateFormatting('ru'));

  group('Форматирование', () {
    test('относительное время со склонением', () {
      final now = DateTime(2026, 10, 1, 12);
      expect(Fmt.relative(now.subtract(const Duration(minutes: 5)), now), '5 минут назад');
      expect(Fmt.relative(now.subtract(const Duration(hours: 2)), now), '2 часа назад');
      expect(Fmt.relative(now.subtract(const Duration(days: 21)), now), '21 день назад');
      expect(Fmt.relative(now.add(const Duration(days: 3)), now), 'через 3 дня');
    });
    test('деньги и вес', () {
      expect(Fmt.money(4700, 'USD').replaceAll('\u00a0', ' '), '4 700 \$');
      expect(Fmt.weight(18000), '18 т');
      expect(Fmt.weight(450), '450 кг');
    });
  });

  group('ApiClient.decode', () {
    test('успех возвращает data', () {
      expect(ApiClient.decode(200, '{"success":true,"data":{"a":1}}'), {'a': 1});
    });
    test('ошибка сервера — код, сообщение и поля', () {
      expect(
        () => ApiClient.decode(422, '{"success":false,"error":{"code":"VALIDATION_ERROR","message":"Проверьте поля","fields":{"email":["Введите email"]}}}'),
        throwsA(isA<ApiException>()
            .having((e) => e.code, 'code', 'VALIDATION_ERROR')
            .having((e) => e.fields['email'], 'fields', ['Введите email'])),
      );
    });
    test('401 — признак истёкшей сессии', () {
      try {
        ApiClient.decode(401, '{"success":false,"error":{"code":"UNAUTHORIZED","message":"Войдите"}}');
      } on ApiException catch (e) {
        expect(e.unauthorized, isTrue);
      }
    });
    test('не JSON — понятная ошибка', () {
      expect(() => ApiClient.decode(502, '<html>'), throwsA(isA<ApiException>().having((e) => e.code, 'code', 'INTERNAL_ERROR')));
    });
  });

  group('Шаги водителя', () {
    test('в пути: основное — местоположение, дополнительно — граница и разгрузка', () {
      final s = driverNextStep('IN_TRANSIT');
      expect(s.primary?.kind, DriverActionKind.location);
      expect(s.secondary.map((a) => a.to), ['AT_BORDER', 'AT_DELIVERY']);
    });
    test('на разгрузке — сдача груза с документами', () {
      expect(driverNextStep('AT_DELIVERY').primary?.kind, DriverActionKind.deliver);
    });
    test('после границы — «Продолжить маршрут»', () {
      expect(driverNextStep('BORDER_CLEARED').primary?.label, 'Продолжить маршрут');
    });
  });

  group('Этапы рейса', () {
    test('на границе', () {
      final s = journeySteps('AT_BORDER', pickupCity: 'Алматы', borderCity: 'Хоргос', deliveryCity: 'Урумчи');
      expect(s.map((x) => x.state).toList(), [
        JourneyState.done,
        JourneyState.done,
        JourneyState.done,
        JourneyState.current,
        JourneyState.pending,
        JourneyState.pending,
        JourneyState.pending,
      ]);
    });
    test('в пути — ближайший этап «далее»', () {
      final s = journeySteps('IN_TRANSIT', pickupCity: 'Алматы', deliveryCity: 'Москва');
      expect(s.firstWhere((x) => x.key == 'delivery').state, JourneyState.next);
    });
  });

  group('Приоритет событий', () {
    test('«транспорт» — не спор', () {
      expect(eventPriority('CONTRACT_SIGNED', 'Договор подписан', 'Перевозчик может назначать транспорт.'), EventPriority.info);
    });
    test('задержка — критично', () {
      expect(eventPriority('SYSTEM', 'Изменён ETA', 'Ожидается задержка доставки'), EventPriority.critical);
    });
  });

  group('Модели', () {
    test('живой объект с позицией и маршрутом', () {
      final o = LiveObject.fromJson({
        'id': 'a',
        'publicNumber': 'CF-O-000001',
        'status': 'IN_TRANSIT',
        'statusLabel': 'В пути',
        'health': 'delayed',
        'statusChangedAt': '2026-10-01T10:00:00Z',
        'title': 'Груз',
        'weightKg': 18000,
        'origin': 'Алматы',
        'destination': 'Москва',
        'stops': [
          {'type': 'PICKUP', 'city': 'Алматы', 'country': 'KZ', 'point': {'lat': 43.2, 'lng': 76.9}},
          {'type': 'DELIVERY', 'city': 'Москва', 'country': 'RU', 'point': null},
        ],
        'position': {'lat': 44.0, 'lng': 70.0, 'at': null, 'source': 'estimated'},
        'progress': 0.4,
        'vehicle': {'plateNumber': 'KZ 1', 'make': 'Volvo', 'model': 'FH'},
        'driver': null,
        'carrier': {'legalName': 'C'},
        'shipper': {'legalName': 'S'},
      });
      expect(o.health, Health.delayed);
      expect(o.route.length, 1);
      expect(o.positionEstimated, isTrue);
      expect(o.vehicleModel, 'Volvo FH');
    });
    test('пользователь: рабочее пространство по роли', () {
      final a = Actor.fromJson({
        'userId': 'u',
        'email': 'e@x',
        'fullName': 'Иван Петров',
        'isAdmin': false,
        'dataMode': 'demo',
        'memberships': [],
        'active': {
          'companyId': 'c',
          'role': 'CARRIER_DISPATCHER',
          'company': {'legalName': 'Demo Trans', 'type': 'CARRIER'},
        },
        'permissions': ['ORDER_VIEW'],
      });
      expect(a.workspace, Workspace.carrier);
      expect(a.demo, isTrue);
      expect(a.initials, 'ИП');
    });
    test('рейс водителя без данных — null', () {
      expect(DriverTrip.fromJson(null), isNull);
    });
  });
}
